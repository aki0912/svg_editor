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
5. P3: PPTX比較対応（優先度は `docs/pptx_gap_implementation_plan.md` を参照）

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
- なし（スナップガイドのフェード表示時間は今回調整済み）
## 進捗更新（ガイド表示時間調整）
- スナップガイドのフェード継続時間を `SNAP_GUIDE_FADE_DURATION` とCSSタイミングを一致させ、
  170ms → 220msへ調整。
- `app.js` と `styles.css` の連動を確認済み

## 進捗更新（スナップガイドの視認性向上）
- ガイド線の配色・太さ・点線パターン・マーカー外観を更新して、視認性を強化
  - `styles.css: .snap-guide-line` の色/太さ/点線を見やすい値へ調整
  - `styles.css: .snap-guide-line--dual` で交差時の強調を明確化
  - `styles.css: .snap-guide-marker` の輪郭と輝度を強化
- `npm test` は現状の挙動を維持したまま、表示系の調整として実施なし

## 進捗更新（リサイズ時スナップ厳密仕様）
- `applyResizeSnap()` の固定エッジ優先ロジックを安定化
  - 左右・上下を個別に処理し、反対側エッジを基準に最小サイズ (`SNAP_RESIZE_MIN_SIZE`) を保つ形へ統一
  - `baseBounds` 不足時はドラッグ中の `next` 値をフォールバックして計算を継続
  - リサイズ角・エッジの同時移動時に原点ずれが起きにくい挙動に調整
- `npm test`（4ファイル・17テスト）でPASS確認

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

## 進捗更新（PPTX比較：1-1 テキスト体裁拡張）
- テキスト体裁（段落系）を追加実装し、P0実装に接続
  - `index.html`
    - テキスト専用プロパティとして「行間」「字間」「インデント」「箇条書き」を追加
    - テキストのみ表示される制御対象として既存項目に組み込み
  - `app.js`
    - 行間/字間/インデント/箇条書きのプロパティ追加、選択/入力反映、保存反映の一連を追加
    - 描画時（SVG text + inline editor）に反映（`letter-spacing`, `line-height`, `text-indent`）
    - クリック時キャレット計算・バウンディング再計測の新仕様に接続
  - `src/commands/elementCommands.js`
    - `buildTextDisplayLine`、行間・字間・インデント・箇条書き付きテキスト計測の補助を追加
    - `estimateTextBoxMetrics` と `getTextCaretOffsetFromPoint` の行間反映ロジックを更新
  - `tests/elementCommands.test.js`
    - 箇条書きフォーマットと行間変化のテストを追加
- 次アクション
  - `1-2. 文字プロパティ一貫性の固定`（文字揃え・フォント系の選択整合性をより強固に）

## 進捗更新（PPTX比較：1-2 文字プロパティ一貫性の固定）
- 文字系プロパティを選択中・保存中・復元時に常時正規化して、UIと描画状態を同期
  - `app.js`
    - `normalizeTextFontSize` / `normalizeTextFontWeight` / `normalizeTextFontStyle` / `normalizeTextAlign` を追加
    - `normalizeTextElementProperties` と `normalizeTextElementsInSlides` を追加し、復元/インポート/読み込み時に全テキスト要素を正規化
    - テキストプロパティパネル反映時に値を正規化し、`select` 値不整合を防止
    - フォント名が既存オプション外のときは `select` に安全登録するフォールバックを追加
    - 描画・キャレット計算・バウンディング計算・インライン編集で文字属性の正規化値を参照
- 次アクション
  - `2-1. ショートカット実装`（`Ctrl/Cmd + C/V/X`, `Delete`, `Undo/Redo`, `Esc`）

## 進捗更新（PPTX比較：2-1 ショートカット実装）
- 既存のキー操作を実行時ショートカットとして統合
  - `app.js`
    - `copySelectedElement` / `cutSelectedElement` / `pasteElementFromClipboard` を追加し、内部クリップボードで要素の複製を実装
    - `Ctrl/Cmd + C/X/V` を全体キー操作へ追加
    - 既存の `Undo/Redo` 処理と衝突しないようメタキー＋修飾キー条件を統一
    - `Delete`（および `Backspace`）で選択要素削除を維持
    - `Esc` でテキスト編集のキャンセルまたは選択解除を実装
  - ショートカット実行時の整合性確保のため、必要時にテキストエディタを確実に確定クローズ
- 受け入れ条件
  - `Ctrl/Cmd + C/V/X`, `Delete`, `Undo/Redo`, `Esc` が期待どおり動作
  - 既存の履歴と選択状態と競合しない（Undo/Redo と重複操作なし）
- 次アクション
  - `2-2. 選択状態遷移の堅牢化`（クリック外し、キャンバス外クリック、プロパティ操作時、テキスト編集時）

## 進捗更新（PPTX比較：2-2 選択状態遷移の堅牢化）
- 選択解除判定を明確化して、対象外操作時の意図しない解除を回避
  - `app.js`
    - 解除対象判定を `isSelectionProtectedTarget` に分離
    - `.properties`（プロパティ操作）および `.object-actions`（複製/削除操作）を解除しない例外領域として明示
    - `onCanvasPointerDownForDeselect` で上記判定を使用
- 受け入れ条件
  - プロパティ操作中は選択が外れない
  - 文字編集中は既存の保存/確定挙動を維持しつつ、テキスト外の通常クリックで解除される
  - キャンバスの空白領域クリックで選択解除
- 次アクション
  - `3-1. 多選択`（shift/click、ドラッグ枠選択）

## 進捗更新（PPTX比較：3-1 多選択）
- 多選択の基盤を `selectedElementIds` へ統一し、ドラッグ枠選択/Shiftトグル/複数選択時の操作を実装
  - `app.js`
    - `setSelectedElementIds` を現在スライド内の実在IDのみを保持するように調整
    - `renderCanvas` に複数選択描画を反映（選択枠は複数、リサイズハンドルは第一選択のみ）
    - `onCanvasPointerDownForDeselect` を「キャンバス外クリック時のみ解除」「キャンバス内空白クリック時のみ marquee 開始」に分離
    - `onElementPointerDown` に Shift 選択トグルを追加（Shift クリックは選択更新のみ）
    - `renderProperties` を多選択対応（複数選択時は文字系コントロールを非表示/非適用）
    - `applyPropertyFromInputs` を複数選択時の一括 fill/stroke とテキスト単体選択時の編集分離に更新
    - 既存の保存/読み込み・SVG取り込み・リセット・キー操作で選択解放時に `setSelectedElementIds` を利用
    - `styles.css` に `marquee-selection` を追加
- 受け入れ条件
  - Shift + クリックで選択追加/解除が切替可能
  - キャンバス外クリックで選択解除、キャンバス空白ドラッグで選択枠が可視化
  - 複数選択状態で同時移動、複製、削除が一貫して動作
- 次アクション
  - `3-2. 整列・配置`

## 進捗更新（PPTX比較：3-2 整列・配置）
- 複数選択時の整列系操作を実装
  - `index.html`
    - オブジェクト操作パネルへ整列コントロールを追加
      - 左揃え / 中央揃え / 右揃え
      - 上揃え / 中央揃え / 下揃え
      - 横均等配置 / 縦均等配置
      - 同幅 / 同高
  - `app.js`
    - `alignSelectedElements(mode)` を追加
      - 選択要素群の水平/垂直揃え
      - 横/縦方向の均等配置
      - 同幅/同高
    - 2個未満の選択では整列ボタンを無効化し、2個以上で有効化
    - 各整列操作を `recordHistorySnapshot` と連携
- 受け入れ条件
  - 複数選択時に整列操作が可能
  - 2個未満の選択時は操作不可（ボタン無効）
- 次アクション
  - `4-1. 図形拡張`
