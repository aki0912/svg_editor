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

- テキスト拡張の基盤整理
  - `src/commands/elementCommands.js` 追加
  - `tests/elementCommands.test.js` 追加
  - `index.html` で `src/commands/elementCommands.js` 読み込み
  - `app.js` のテキスト計測ヘルパーをコモンコマンド化
  - テキスト編集確定時・フォント更新時の高さ補正を追加
  - SVGインポート時のテキスト幅/高さ推定を `estimateTextBoxMetrics` に統一
- フォント名正規化（クォート混在対応）
  - `normalizeFontFamilyValue` のトークン分解を拡張し、クォート付き値の一貫化に対応
  - `normalizeFontFamilyInputValue` でも同じ規則で表示値を正規化
  - `tests/elementCommands.test.js` でクォート付きケースを追加
- フォント名正規化（空白含むファミリ名）
  - `src/commands/elementCommands.js` に `normalizeFontFamilyValue` を追加し、`buildTextFontDescription` へ適用
  - `app.js` で描画・インライン編集エリアに同値を適用し、`Yu Gothic`/`Times New Roman` 系フォントの反映不良を解消

## 変更した主なファイル
- `app.js`
- `index.html`
- `styles.css`
- `src/commands/snap.js`
- `tests/snap.test.js`
- `src/commands/elementCommands.js`
- `tests/elementCommands.test.js`

## 直近の調整内容（履歴関連）
- 「戻る」「進む」をスライド外に固定していた位置から、画面内に見やすく移動
  - `styles.css: .history-controls` の `right` を `12px` に変更
  - 上端にくっつかないよう `top: 12px` を適用

## テスト実行結果（最終確認）
- 実行: `npm test`
- 結果: `PASS`（3ファイル、16テスト）
  - `tests/history.test.js` 4件
  - `tests/snap.test.js` 3件
  - `tests/elementCommands.test.js` 8件

## 既知の未実装（未完）
- スナップは「移動時」のみ実装（リサイズ時スナップ未実装）
- スナップの優先順位を pptx 互換観点で調整する余地あり
- スナップガイドの視認性や長さ（キャンバス全長固定）を調整の余地あり

## 次アクション候補（優先度順）
1. ✅ P0: リサイズ中スナップの追加（`onPointerMove` resize 分岐へ適用）
2. ✅ P1: スナップしきい値を10px固定化（UI設定の削除）
3. ✅ P1: スナップガイドの視認性向上（色・点線・長さ）
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

## 完了（最新）
- スナップのしきい値を 10px 固定化し、設定UIを削除。
  - `index.html` のスナップ補助パネルを削除
  - `app.js` で `snapThreshold` の入力UI依存を除去
- スナップガイドをドラッグ終了時にフェードアウトするように調整。
  - `app.js` で `pointerup` 時にガイドにフェード状態を適用し、完了後に消去
  - `styles.css` に `snap-guide` のフェードアニメーションを追加

## 進捗更新（alignSnap 名寄せ完了）
- alignSnap 名寄せを完了扱いへ更新
  - `app.js` は `window.EditorAlignSnap` を第一候補として `createSnapEngine` を解決する実装を維持
  - `src/commands/snap.js` は既存の互換エントリとして残し、旧参照を継続可能にする
- 追加確認: `tests/snapAlias.test.js` で `alignSnap` と `snap` の同一動作を確認

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

## 不具合修正（リサイズ時スナップで原点がずれる）
- 症状: リサイズ時にスナップ時、反対側の辺が固定されるはずの原点（x/y）が一緒に移動する。
- 原因: 旧実装がリサイズ矩形全体を `snapMove` で補正しており、`e/s` など反対辺固定ハンドルでも `x/y` が補正されていた。
- 修正: `applyResizeSnap()` を全面見直し
  - 左右・上下の移動辺それぞれで「対象辺」だけをスナップし、固定側エッジは保持
  - 反対辺を固定したまま width/height を再計算
  - ガイド情報も移動辺側にのみ反映
- 検証: `npm test` 全件PASS

## テキスト作業（最新）
- テキスト編集確定時に `height` を推定サイズへ同期するため `syncTextElementHeightFromContent` を追加
- フォントサイズ・フォント指定変更時に高さ再計算を実施
- SVGインポート時のテキスト要素サイズを `estimateTextBoxMetrics` で見積もる実装
- 反映状況: `app.js` と `IMPLEMENTATION_STATUS.md` を更新済み
- テキスト以外の要素選択時は、フォントサイズ/文字揃え/フォント/太字/斜体/テキスト入力欄を非表示にするUI制御を追加
- オブジェクト以外のクリックで選択解除されるよう、キャンバス外/非オブジェクト領域クリック時の明示制御を追加
