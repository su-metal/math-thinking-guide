# Tailwind CSS が効かなかった件：原因と再発防止まとめ

このドキュメントは、今回発生した **Tailwind CSS が一部効かなくなった問題**について、
原因・対応・今後の運用ルールをいつでも振り返れるように整理したものです。

---

## 1. 何が起きていたか（症状）

- `.flex` `.p-8` `.rounded-2xl` `.text-sm` `.z-10` など
  **基本的な Tailwind クラスが効かない**
- UI レイアウトが崩れる、余白や配置がおかしくなる
- クラスは JSX に書いてあるのに、見た目に反映されない

---

## 2. 根本原因（Root Cause）

### Tailwind の `content`（glob）設定漏れ

- 実際に使われていた UI ファイルは **リポジトリ直下の `App.tsx`**
- しかし Tailwind の `content` 設定が、
  **そのパスをスキャン対象に含んでいなかった**

その結果：

- Tailwind が「このクラスは使われていない」と誤認
- `.flex` などのユーティリティが **CSS から生成されない**
- 見た目が崩れる

さらに、`.next` キャッシュが残っていたため、
設定修正後も古い CSS が使われ続けていた。

---

## 3. 実施した修正内容

### ① content glob の修正

- `tailwind.config.cjs` に **リポジトリ直下（root）の glob を再追加**
- `App.tsx` を確実にスキャン対象に含めた

### ② キャッシュの完全クリア

- `.next` ディレクトリを削除
- Tailwind / Next.js を **完全再ビルド**

→ 正しい CSS バンドルが生成され、
  `.flex` `.p-8` `.rounded-2xl` などが復活

---

## 4. 再発防止のために追加した仕組み（重要）

### 自動診断ツールの追加

- ファイル名：`diag-tailwind.mjs`
- 実行コマンド：

```bash
npm run diag:tailwind
```

### このツールでできること

- プロジェクト内で `className=` を含むファイルを検出
- Tailwind が生成した `*.css` に、
  主要ユーティリティクラスが含まれているかを確認
- **glob 設定漏れを即発見できる**

診断結果は `tailwind-report.md` に記録される。

---

## 5. 変更されたファイル一覧

- `tailwind.config.cjs`
  - content glob を修正
- `diag-tailwind.mjs`
  - Tailwind 診断用スクリプト（新規）
- `package.json`
  - `diag:tailwind` スクリプト追加
  - `minimatch` を devDependency に追加
- `next-env.d.ts`
  - 依存関係追加後も正しい manifest を指すよう修正
- `tailwind-report.md`
  - 原因・対処・チェック手順をドキュメント化

---

## 6. テスト結果

- `npm run build` → OK
- `npm run diag:tailwind` → OK

---

## 7. 今後の運用ルール（重要）

### 以下のタイミングでは必ず実行する

#### UI ファイルや配置を変えたとき
```bash
npm run diag:tailwind
```

#### `tailwind.config.cjs` を変更したとき
- `.next` を削除する
- もしくはフルビルドを実行

#### Tailwind が効いていない気がしたら
- `tailwind-report.md` を確認
- CSS に必要なクラスが含まれているかチェック

---

## 8. まとめ（覚えておくポイント）

- Tailwind の不具合は **ほぼ glob 設定 or キャッシュ**
- UI ファイルの場所を動かしたら **glob を疑う**
- 「直す」だけでなく **診断・再発防止まで整えた**のが今回の成果

このドキュメントを、
**Tailwind が怪しいときの一次チェック表**として使う。
