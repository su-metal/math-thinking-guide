# Tailwind Report

## 1. Collected Evidence
- **Tailwind config (`tailwind.config.cjs`)** currently lists `content` globs for `./app/**/*`, `./components/**/*`, `./src/**/*`, `./lib/**/*`, `./ui/**/*`, `./features/**/*`, and **`./*.{js,ts,jsx,tsx,mdx}`** so root-level files such as `App.tsx` are scanned.
- **Files actually carrying `className=`:** `App.tsx` and `app/layout.tsx` (per `tools/diag-tailwind.mjs`, which prefers `rg`). Without the root glob, those definitions would not be profiled.
- **Generated CSS snapshot:** `.next/static/chunks/90da6b02c0672ce9.css` now contains the common utility definitions (`.flex`, `.mt-2`, `.text-sm`, `.p-8`, `.rounded-2xl`, `.z-10`), proving the regenerated bundle includes the selectors needed by the UI.

## 2. Cause Classification — **A. Tailwind content scan gap**
- `App.tsx` (the main UI) lives outside the `app/` directory yet defines almost every `className`. When the `content` array omitted the root `./*.{...}` pattern, Tailwind never scanned that file and the generated CSS lacked those utilities, so the layout collapsed. The problem disappeared only after the `content` globs were repaired and `.next` was cleared so the font bundle could be rebuilt with the missing selectors.

## 3. Fixes / Safeguards
- The `content` array now explicitly covers the key directories (`app`, `components`, `src`, `lib`, `ui`, `features`) **and** the repo root, keeping all styles in scope even if a new UI file is created outside the standard folders.
- Added `tools/diag-tailwind.mjs` plus the `npm run diag:tailwind` script to surface all `className` sources, ensure they match the `content` globs, and verify that `.next/static/chunks/*.css` contains representative utilities.

## 4. Recurrence Checklist
1. Run `npm run diag:tailwind` (or `node tools/diag-tailwind.mjs`) whenever you touch UI files or add a new directory: it prints any `className` files outside the configured globs and checks the compiled `.next` CSS for the standard utilities.
2. PowerShell one-liner for a quick sanity check:
   ```powershell
   rg --files-with-matches "className=" | ForEach-Object { Split-Path $_ -Parent } | Sort-Object -Unique
   ```
   Compare the output list to `tailwind.config.cjs` to confirm every folder is covered.
3. After changing `tailwind.config.cjs`, delete `.next` (or run a clean `next build`) so the cached CSS bundle is rebuilt with the newly included selectors.

## 5. Notes from the Vite → Next migration
- `App.tsx` remained at the repo root from the old Vite entry point. Tailwind had to be taught to scan that location via the `./*.{...}` glob. Forgetting to add that glob caused the sudden loss of utility classes even though no component changed.
- Keep Vite leftovers (or any stray directories outside the current `content` array) in mind; any `className` definition outside the defined globs will cause Tailwind to rebuild without those selectors and the UI will break until `.next` is purged.

## 6. Tailwind config reminder
```js
content: [
  './app/**/*.{js,ts,jsx,tsx,mdx}',
  './components/**/*.{js,ts,jsx,tsx,mdx}',
  './src/**/*.{js,ts,jsx,tsx,mdx}',
  './lib/**/*.{js,ts,jsx,tsx,mdx}',
  './ui/**/*.{js,ts,jsx,tsx,mdx}',
  './features/**/*.{js,ts,jsx,tsx,mdx}',
  './*.{js,ts,jsx,tsx,mdx}',
],
```
