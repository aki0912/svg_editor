# SVG PowerPoint-like Slide Editor

SVGベースでスライド編集を行う、ブラウザ単体動作のエディタです。  
`index.html` をダブルクリックして起動できる構成を維持しています。

## 主な機能
- スライド操作: 新規、複製、削除、前後移動、直接選択
- 図形操作: 追加、移動、リサイズ、回転、複製、削除
- テキスト操作: 直接編集、フォント・揃え・行間・字間・インデント・箇条書き
- 入出力: JSONインポート/エクスポート、SVGインポート/エクスポート
- 履歴: Undo/Redo（ボタンとショートカット）
- 保存: `localStorage` への自動保存・復元

## ファイル構成（主要）
- `index.html`: UI本体
- `styles.css`: レイアウト/スタイル
- `app.js`: アプリ本体ロジック
- `src/commands/`: コマンド/ヘルパー（履歴・スナップ・テキスト等）
- `tests/`: Vitestテスト
- `e2e/`: Playwright E2Eテスト
  - `e2e/minimal.e2e.js`: 最小 + 追加シナリオ
  - `e2e/advanced.e2e.js`: 入出力・低解像度・履歴拡張シナリオ
- `docs/`: 要件/計画/レポート

## 起動方法（アプリ利用）
`index.html` をブラウザで開きます。  
ローカルWebサーバーは必須ではありません。

## テスト実行方法

### 1) 単体・統合テスト（Vitest）
```bash
npm test
```

ウォッチ実行:
```bash
npm run test:watch
```

### 2) E2Eテスト（Playwright）
初回のみブラウザバイナリをインストール:
```bash
npx playwright install chromium
```

E2E全件実行:
```bash
npm run e2e
```

UIモード:
```bash
npm run e2e:ui
```

画面表示付きで特定ファイル実行:
```bash
npx playwright test e2e/advanced.e2e.js --headed --workers=1
```

## よく使うショートカット
- `Cmd/Ctrl + Z`: Undo
- `Cmd/Ctrl + Y`（または環境によって `Cmd + Shift + Z`）: Redo
- `Cmd/Ctrl + C / X / V`: コピー / 切り取り / 貼り付け
- `Delete / Backspace`: 選択要素削除（非テキスト編集中）
- `Escape`: 編集キャンセル/選択解除
- `Control + ArrowLeft / ArrowRight`: スライド移動

## 関連ドキュメント
- `docs/requirements.md`
- `docs/testing_gap_plan.md`
- `docs/e2e_minimal_plan.md`
- `docs/e2e_basic_missing_plan.md`
- `docs/e2e_failure_report.md`
