# 実装ステータス（SVG Slide Editor）

## 目的
- pptx の主要仕様差分を埋めるため、既存ブラウザ実行（index.html をダブルクリック）を維持したまま、段階的に機能追加。

## 現在完了した項目
- Undo/Redo
  - `src/commands/history.js` 追加済み
  - `app.js` で履歴管理基盤統合
  - `index.html` に戻る/進むボタン追加
  - `styles.css` でボタンスタイル追加

- スナップ（移動時）
  - `src/commands/snap.js` 追加
    - `createSnapEngine({ snapThreshold })`
    - `snapMove` で他要素/キャンバス端・中央へのX/Yスナップ判定
  - `tests/snap.test.js` 追加
  - `app.js` へスナップ統合
    - `EditorSnap` 初期化
    - `onPointerMove` の move 時に `snapMove` 適用
    - スナップガイド描画（`renderSnapGuides`）を追加
  - 戻る/進むボタンは `canvas-wrap` 内右上に配置
  - CSS: `.snap-guide-line` 追加

## 変更した主なファイル
- `app.js`
- `index.html`
- `styles.css`
- `src/commands/snap.js`
- `tests/snap.test.js`

## 直近の調整内容（履歴関連）
- 「戻る」「進む」をスライド外に固定していた位置から、画面内に見やすく移動
  - `styles.css: .history-controls` の `right` を `12px` に変更
  - 上端にくっつかないよう `top: 12px` を適用

## テスト実行結果（最終確認）
- 実行: `npm test`
- 結果: `PASS`（2ファイル、7テスト）
  - `tests/history.test.js` 4件
  - `tests/snap.test.js` 3件

## 既知の未実装（未完）
- スナップは「移動時」のみ実装（リサイズ時スナップ未実装）
- スナップの優先順位を pptx 互換観点で調整する余地あり
- スナップガイドの視認性や長さ（キャンバス全長固定）を調整の余地あり

## 次アクション候補（優先度順）
1. P0: リサイズ中スナップの追加（`onPointerMove` resize 分岐へ適用）
2. P1: スナップ閾値のUI設定（ユーザ調整）
3. P1: ガイド表示の視認性向上（色・点線・長さ）
4. P2: ガイド消去タイミングのUX調整（ドラッグ離脱時のフェード）

## 補足
- 実行方式は `index.html` のダブルクリック起動（ブラウザ単体）を維持。
- 永続保存は `localStorage` の `svg_ppt_like_state_v1` を利用。

## 進捗更新（次実装完了）
- 実装: リサイズ時スナップの追加
  - `app.js` の `onPointerMove` resize 分岐で `applyResizeSnap` を追加し、ドラッグ中のリサイズでもスナップ補正が効くように変更。
  - スナップ対象を `renderSnapGuides` 表示対象に `resize` を追加。
  - 既存の `snap` テストは変更なしでも通過（実装は呼び出し側の変更）。
- 変更ファイル: `app.js`
- 追加確認: `npm test` で 7テスト全件PASS。

## 現在の未実装（引き続き）
- リサイズ時スナップの厳密仕様（例えば固定エッジ優先ルールのチューニング）
- ガイドの見え方/色・表示時間の微調整

## カーソル挙動修正（確認対応）
- 原因: リサイズハンドルのカーソル判定順が角ハンドルでも縦/横側に先取りされ、
  角のカーソル表示が不安定になる問題を修正。
- 修正: `app.js` の `renderSelection()` でハンドル種別の判定順を変更。
  - 角（nw/ne/sw/se）を最優先で `nwse-resize` に明示。
  - 中辺（n/s）→`ns-resize`、中辺（e/w）→`ew-resize`。
- 検証: `npm test` 全件PASS。

## 不具合修正（カーソルが変な挙動）
- 問題: 選択枠（点線）がアニメーションする状態で、角ハンドル上のカーソル見え方が不安定。
- 原因候補: 
  1) 角ハンドルのカーソル種類が一律 `nwse-resize` で、方向別の見え分けがない
  2) 点線矩形 `.selection-box` がマウス判定に関与する可能性
  3) 角ハンドルの `:hover` での `transform: scale(1.2)` が描画的にブレる
- 対応:
  - `app.js` 角ハンドルごとにカーソルを分離
    - `nw`/`se`: `nwse-resize`
    - `ne`/`sw`: `nesw-resize`
  - `styles.css` の `.selection-box` に `pointer-events: none;`
  - `.selection-handle:hover` の `transform` 拡大を除去
- 確認: `npm test` 全件PASS
