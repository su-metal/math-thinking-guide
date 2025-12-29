import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { Minimatch } from "minimatch";

const root = process.cwd();
const require = createRequire(import.meta.url);

let tailwindConfig;
try {
  tailwindConfig = require(path.join(root, "tailwind.config.cjs"));
} catch (error) {
  console.error("Cannot load tailwind.config.cjs:", error);
  process.exit(1);
}

const contentGlobs = Array.isArray(tailwindConfig.content) ? tailwindConfig.content : [];

const normalizeToPosix = (filePath) => {
  const rel = path.relative(root, filePath).split(path.sep).join("/");
  if (!rel) return "./";
  return rel.startsWith("./") ? rel : `./${rel}`;
};

const recursiveClassScan = (startDir) => {
  const found = [];
  const allowedExt = new Set([".js", ".ts", ".jsx", ".tsx", ".mdx"]);
  const ignore = new Set(["node_modules", ".next", "out", "dist"]);

  const walk = (dir) => {
    const entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
    for (const entry of entries) {
      if (ignore.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (allowedExt.has(path.extname(entry.name))) {
        const content = fs.readFileSync(path.join(root, fullPath), "utf8");
        if (content.includes("className=")) {
          found.push(path.join(root, fullPath));
        }
      }
    }
  };

  if (fs.existsSync(path.join(root, startDir))) {
    walk(startDir);
  }
  return found;
};

const getFilesWithClass = () => {
  try {
    const output = execFileSync("rg", ["--files-with-matches", "className="], { cwd: root, encoding: "utf8" });
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch (error) {
    console.warn("`rg` not available or failed; falling back to recursive scan.");
    return recursiveClassScan("app").concat(recursiveClassScan(".")).filter(Boolean);
  }
};

const classFiles = getFilesWithClass();
const filesMatched = classFiles.map((file) => normalizeToPosix(file));
const missingFiles = [];

for (const relPath of filesMatched) {
  const match = contentGlobs.some((glob) => new Minimatch(glob, { dot: true }).match(relPath));
  if (!match) {
    missingFiles.push(relPath);
  }
}

const uniqueDirs = [...new Set(classFiles.map((file) => path.dirname(path.relative(root, file)) || "."))];

console.log("Tailwind content globs:");
contentGlobs.forEach((glob) => console.log(`  - ${glob}`));
console.log("");

console.log(`Files with className= (${filesMatched.length}):`);
filesMatched.forEach((file) => console.log(`  - ${file}`));
console.log("");

if (missingFiles.length) {
  console.log("❌ Files not matched by content globs:");
  missingFiles.forEach((file) => console.log(`  - ${file}`));
  console.log("");
} else {
  console.log("✅ All className files are covered by the content globs.");
  console.log("");
}

console.log("Directories hosting className definitions:");
uniqueDirs.forEach((dir) => console.log(`  - ${dir}`));
console.log("");

const cssDir = path.join(root, ".next", "static", "chunks");
const keywords = [".flex", ".mt-2", ".text-sm", ".p-8", ".rounded-2xl", ".z-10"];

if (fs.existsSync(cssDir)) {
  const cssFiles = fs.readdirSync(cssDir).filter((name) => name.endsWith(".css"));
  console.log(`CSS files under .next/static/chunks (${cssFiles.length}):`);
  cssFiles.forEach((cssFile) => {
    const full = path.join(cssDir, cssFile);
    const text = fs.readFileSync(full, "utf8");
    console.log(`  - ${cssFile}`);
    keywords.forEach((keyword) => {
      console.log(`      ${keyword}: ${text.includes(keyword) ? "✔" : "✖"}`);
    });
  });
} else {
  console.log(".next/static/chunks is missing; build output not found.");
}
