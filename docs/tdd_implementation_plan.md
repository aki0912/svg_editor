# SVG Slide Editor TDD移行計画（起動方式維持版）

## 目的
- `index.html` をダブルクリックでブラウザ起動する現行運用を維持しつつ、
  変更の安全性を上げるためにTDDを導入する。
- 現行実装を壊さず、MVP機能を維持しながら高優先機能を順次追加する。

---

## 現状前提
- 起動方式: `index.html` 単体開けて利用（`file://` 想定）
- 技術構成: バニラHTML/CSS/JS（`index.html` から `app.js` をロード）
- 重要: `type="module"` 化は最初は避け、現行起動方式に影響を与えない。
- 方針: まず「ロジックを分離」→「そのロジックをTDDで固める」。

---

## 目標
- まずはP0項目（高優先）をTDDで着手し、`npm test` が通る状態を先に確立。
- 将来の機能追加時の回帰事故を最小化。
- 既存機能（保存/復元/追加/移動/サイズ変更/削除）を壊さない。

---

## 開発方針（最重要）
1. まずテスト基盤を置く。
2. `app.js` の純ロジックを分離して、DOM不要で検証可能にする。
3. Red（失敗）→ Green（通過）→ Refactor（整理）の順で進める。
4. 画面は一度も大幅変更しない。

---

## フェーズ計画

### フェーズ0: テスト基盤 + 記録整備（目安: 0.5日）
- 変更ファイル:
  - `package.json`（新規作成）
- 作業:
  - `vitest`（必要なら`@testing-library/dom`, `jsdom`）を導入
  - テストスクリプト: `npm test`
  - 最低限の設定を追加（node + jsdom）
- 成果:
  - CIや手元で `npm test` を実行できる状態（この時点ではテストは少数）

### フェーズ1: コアロジック分離（目安: 1〜2日）
- 変更ファイル:
  - `src/state/slideState.js`（新規）
  - `src/commands/slideCommands.js`（新規）
  - `src/commands/elementCommands.js`（新規）
  - `src/io/serializer.js`（新規）
  - `src/io/svgImportExport.js`（新規）
  - `src/commands/history.js`（新規）
  - `app.js`（既存を配線中心に縮小）
- 方針:
  - スライド/要素状態の読み書き、要素操作、履歴管理、入出力をDOMに依存しない設計にする。
  - `app.js`はイベント取得・DOM反映・呼び出し役に限定。
- 成果:
  - 純ロジックはNode環境で単体テスト可能。

### フェーズ2: 初期テストセット追加（目安: 1日）
- 変更ファイル:
  - `tests/slideState.test.js`（新規）
  - `tests/slideCommands.test.js`（新規）
  - `tests/elementCommands.test.js`（新規）
  - `tests/history.test.js`（新規）
  - `tests/serializer.test.js`（新規）
- テスト観点:
  - 空状態、破損入力、操作境界（先頭/末尾/範囲外）、順序変化、保存データ整合。
- 成果:
  - 主要コア操作の仕様が言語化され、今後の回帰テスト基盤ができる。

### フェーズ3: P0実装（TDD順）

#### P0-1 Undo/Redo（最優先）
- ファイル:
  - `src/commands/history.js`
  - `tests/history.test.js`
  - `app.js`
- 要件:
  - 操作単位で履歴が積まれる
  - Undo/Redo可否状態が取得可能
  - 分岐（Undo後の新規操作でredo破棄）
  - スライド/要素を跨る整合

#### P0-2 スナップ/ガイド（配置補助）
- ファイル:
  - `src/commands/elementCommands.js`
  - `src/commands/alignSnap.js`（新規、または既存へ統合）
  - `tests/alignSnap.test.js`（新規）
- 要件:
  - 中央/端点/間隔への吸着
  - しきい値設定（デフォルト10px想定）
  - ガイド表示用データ（表示フラグ/座標）を戻せる

#### P0-3 テキスト編集拡張
- ファイル:
  - `app.js`
  - `src/commands/elementCommands.js`
  - `tests/elementCommands.test.js`
- 要件:
  - 改行・複数行
  - 文字揃え（左/中央/右）
  - フォントファミリ・太字・斜体・文字色

#### P0-4 copy/paste/複数選択
- ファイル:
  - `app.js`
  - `src/commands/elementCommands.js`
  - `tests/elementCommands.test.js`
  - `tests/clipboard.test.js`（新規）
- 要件:
  - 単体および複数選択コピー
  - 位置ずらし配置（ペースト時）
  - 選択解除/再選択の挙動が明確

#### P0-5 ショートカット実装
- ファイル:
  - `app.js`
  - `tests/input.test.js`（新規）
- 要件:
  - Undo/Redo、削除、複製、整列、前後移動等
  - 同一イベントでの優先順位（テキスト入力中は無視）を明示

### フェーズ4: 統合と回帰（目安: 1日）
- 変更ファイル:
  - `tests/integration` 配下（必要時）
  - `docs/tdd_implementation_plan.md`（進捗更新）
- 方針:
  - 既存主要シナリオ（追加→移動→保存→復元→再描画）を最小e2eで確認
  - 回帰対象: JSON入出力、SVG入出力、起動時復元

### フェーズ5: 運用準備（目安: 半日）
- 変更ファイル:
  - `README.md`（更新）
  - `docs/tdd_implementation_plan.md`（進捗追記）
- 追加内容:
  - `npm test`手順
  - よく使う回帰シナリオ
  - 失敗時の切り分け（JSON破損/DOM不一致/履歴破綻）

---

## 開発順序の根拠（優先度）
1. `Undo/Redo` → 操作破壊から最も回復しやすく、他機能の土台になる
2. `snap/guide` → UI体験を一気に改善、誤配置を減らす
3. `text拡張` → 利便性が高く、プレゼン用途の価値が増す
4. `copy/paste/複数選択` → 作業速度の向上
5. `shortcuts` → 使い勝手の定着に直結

---

## 受け入れ基準（フェーズ毎）
- 各フェーズ完了時点で `npm test` が通る
- 既存操作（MVP要件）で意図しない破壊がない
- 起動方法: ダブルクリックで `index.html` を開いてそのまま動作
- 変更点はドキュメント更新を同時実施

---

## 想定ファイル構成（最終）
- `index.html`（現状維持）
- `styles.css`（現状維持）
- `app.js`（イベント配線・描画配線）
- `src/state/slideState.js`
- `src/commands/slideCommands.js`
- `src/commands/elementCommands.js`
- `src/commands/history.js`
- `src/commands/alignSnap.js`
- `src/io/serializer.js`
- `src/io/svgImportExport.js`
- `tests/*.test.js`
- `package.json`

---

## 注意点
- 当面 `import/export` はESM前提で固定しない。
- `index.html` 既定のDOMを参照する箇所は `app.js` 側へ残し、
  テスト不能部分は最小化する。
- 破壊的変更は避けるため、最初は「既存関数ラッパ化」から着手する。
