# SVG PowerPoint-like Slide Editor

このリポジトリは、SVGを使ってPowerPoint風のスライド編集を行うための最小実装です。

## 1. ファイル構成
- `index.html` : UI本体
- `styles.css` : レイアウトと見た目
- `app.js` : スライド管理、描画、編集ロジック
- `docs/requirements.md` : 要件定義
- `docs/development_plan.md` : 開発計画

## 2. 起動方法
ブラウザで `index.html` を開くだけです。

## 3. 使い方（MVP）
- 左の「新規スライド」「複製」「削除」でスライドを管理
- 上部のボタンでテキスト・図形・画像を追加
- 要素をドラッグして移動、枠の8点ハンドルでサイズ調整
- 右（左パネル）プロパティで色や文字を調整
- JSON保存/復元、SVG出力、localStorage保存が利用可能
- 「SVGを取り込む」で .svg を読み込み、取り込んだ内容を編集

## 4. 改善候補
- undo/redo
- スライド間移動のアニメーション
- スナップ/ガイド線
- 図形の整列補助
- 配色テーマ設定
