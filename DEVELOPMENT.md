# 行政書士 Air Force - 開発ガイド

## 概要

行政書士試験の構成要件（条文の穴埋め）をシューティングゲーム形式で学習するWebアプリ。
正しい用語を撃ち抜いて条文を完成させる。

- **公開URL**: https://kuma-koukoutaigaku.github.io/gyoseishoshi-air-force/
- **リポジトリ**: https://github.com/kuma-koukoutaigaku/gyoseishoshi-air-force
- **ホスティング**: GitHub Pages（mainブランチ直接配信）
- **フレームワーク**: なし（素のHTML/CSS/JS）

---

## ファイル構成

### 重要: ファイルの二重管理

キャッシュ対策のため、**すべてのJS/CSSファイルは2つの名前で同一内容を保持**している。
編集は `*2.*` ファイルで行い、**必ず旧名ファイルにもコピー**すること。

| 編集用ファイル（メイン） | 同期先（旧名） | 内容 |
|---|---|---|
| `game2.js` | `game.js` | ゲームロジック本体（1593行） |
| `loader2.js` | `custom_loader.js` | スプレッドシート読み込み（485行） |
| `style2.css` | `style.css` | 全スタイル（745行） |
| `questions2.js` | `questions.js` | 問題集データ（270問） |

```bash
# 編集後の同期コマンド
cp game2.js game.js
cp loader2.js custom_loader.js
cp style2.css style.css
cp questions2.js questions.js
```

**なぜ二重管理？**: `index.html` はキャッシュされる。古いキャッシュの `index.html` は旧名ファイルを参照し、新しい `index.html` は新名ファイルを参照する。両方に同じコードがあれば、どちらのHTMLが読まれても正しく動く。

### その他のファイル

| ファイル | 説明 |
|---|---|
| `index.html` | エントリポイント。`questions2.js` → `loader2.js` → `game2.js` の順で読み込み |
| `v2.html` | `index.html` と同一内容（キャッシュ回避用の別URL） |
| `sw.js` | Service Worker（現在は登録解除用） |
| `問題集_新フォーマット.xlsx` | スプレッドシートのフォーマット見本 |
| `既存問題集_新フォーマット.xlsx` | 問題集データのエクスポート（270問） |

---

## アーキテクチャ

### データの流れ

```
[questions2.js]  →  CATEGORIES, QUESTIONS グローバル変数
                         ↓ マージ
[loader2.js]     →  スプレッドシートCSV取得 → パース → CATEGORIES/QUESTIONSに追加
                         ↓
[game2.js]       →  画面描画、ゲームロジック、Canvas操作
```

### 問題データの2つのソース

#### 1. 問題集（built-in）: `questions2.js`
- グローバル変数 `CATEGORIES` と `QUESTIONS` に直接定義
- カテゴリキー: `constitution`, `admin_enforcement`, `civil` など英語キー
- 全カテゴリに `group: '問題集'` を設定
- 270問

#### 2. オリジナル（スプレッドシート）: `loader2.js`
- Google Spreadsheet からCSVエクスポートで動的取得
- スプレッドシートID: `1_YYh_4xhFGijlO3RfvyRUwrW2NLfVgySMeyHJF51rCM`
- カテゴリキーに `ss_` プレフィックスを付与（例: `ss_民法`）
- 全カテゴリに `group: 'オリジナル'` を設定

### カテゴリ管理の仕組み

```javascript
// questions2.js（問題集）
const CATEGORIES = {
    constitution: { label: '憲法', group: '問題集' },
    civil: { label: '民法', group: '問題集' },
    // ...
};

// loader2.js がスプレッドシートから追加
CATEGORIES['ss_民法'] = { label: '民法', group: 'オリジナル' };
CATEGORIES['ss_行政法'] = { label: '行政法', group: 'オリジナル' };
```

**重要**: `ss_` プレフィックスで完全に分離することで、問題集とオリジナルが混ざらない。

### スプレッドシートのフォーマット

| A列 | B列 | C列 | D列 | E列〜I列 | J列 |
|---|---|---|---|---|---|
| 分野 | セクション | 出典 | 問題文 | 解答1〜5 | デコイ（パイプ区切り） |
| 民法 | 意思表示 | 第96条 | 詐欺による意思表示は... | 詐欺 | 脅迫\|強制\|錯誤 |

- **分野**: カテゴリ名。同じ名前の行が1つのカテゴリにまとまる
- **セクション**: 出題範囲のグループ分け。同じセクション名の問題はソートでまとめられる
- **問題文**: 解答の単語が自動検出されて穴（ブランク）になる
- **表フォーマット**: 問題文に `／` 区切りの行が2行以上あるとテーブル表示になる

### 問題の自動穴あけ処理（loader2.js）

```
問題文: "詐欺による意思表示は取り消すことができる"
解答: ["詐欺"]
  ↓ 自動検出
"｛0｝による意思表示は取り消すことができる"
  ↓ ゲーム表示
"＿＿による意思表示は取り消すことができる"（＿＿が穴）
```

- 通常テキスト: 同じ単語が複数回出現 → すべて同時に埋まる（1つのブランク）
- テーブル: 同じ単語が複数回出現 → それぞれ別のブランク（個別に撃つ）

---

## ホーム画面の構成

```
┌─────────────────────────┐
│    行政書士 Air Force     │
│                           │
│  [ランダム10問] [順番に出題] │  ← モード選択
│                           │
│      分野を選択            │
│  [全分野]                 │
│  ── 問題集 ──            │  ← group: '問題集' のカテゴリ
│  [憲法] [行政代執行法] ... │
│  ── オリジナル ──         │  ← group: 'オリジナル' のカテゴリ（オレンジ色）
│  [民法] [行政法] [憲法]   │
│                           │
│      出題範囲              │
│  [1〜10] [11〜20] ...     │  ← 問題集: 10問固定分割 + セクション名表示
│  [意思表示] [物権] ...    │  ← オリジナル: セクション分割（最大10問）
│                           │
│     [ゲームスタート]       │
└─────────────────────────┘
```

### 出題範囲の分割ルール

- **問題集**: `getFixedRanges()` - 10問ずつ固定分割。ボタンにはセット内のセクション名を小さく表示
- **オリジナル**: `getSectionRanges()` - セクション名で分割。10問を超えるセクションは `セクション名(1)`, `セクション名(2)` のように自動分割

---

## スタイリングの注意点

### オリジナルカテゴリのオレンジ色

```css
.custom-category { border-color: #6a4a3a; color: #e9967a; }
.custom-group { color: #e9967a; }
```

game2.js の `buildCategoryButtons()` で `group === 'オリジナル'` のとき `custom-category` / `custom-group` クラスを付与。

### ブランク（穴）の表示

| 状態 | 通常テキスト | テーブル内 |
|---|---|---|
| 待機中 | `border-bottom: 2px solid #555` | td罫線のみ（blank自体のborderはnone） |
| アクティブ | `border-bottom-color: #ffd700`（金色） | `td border-bottom: 2px solid #ffd700` |
| 回答済み | `border-bottom-color: #4caf50`（緑） | `td border-bottom: 2px solid #4caf50` |

テーブル内のブランクは `.table-blank` クラスで `border-bottom: none; color: transparent` にして、tdセルのボーダーのみで下線を表現。

### テーブルの横スクロール

テーブルは**自動縮小せず横スクロール**で対応。`.q-table-wrap` に `overflow-x: auto` を設定。
**注意: 自動縮小（font-sizeを小さくして画面に収める）は絶対にやらないこと。**

---

## 過去の重大バグと教訓

### 1. 問題集とオリジナルがホーム画面で混在する

**原因**: スプレッドシートの分野名（例: 「行政法」）が、問題集の既存カテゴリキーと一致してしまい、同じカテゴリに問題が混入した。

**解決**: スプレッドシートのカテゴリキーに `ss_` プレフィックスを付与して完全分離。
```javascript
const key = 'ss_' + this.toSafeKey(catName);
CATEGORIES[key] = { label: catName, group: 'オリジナル' };
```

**教訓**: 問題集とオリジナルは同じカテゴリキーを共有してはいけない。`ss_` プレフィックスは絶対に外さない。

### 2. iPhone Safari のキャッシュが更新されない

**原因**: GitHub Pages の CDN キャッシュ（`max-age=600`）と、Safariの強力なキャッシュ。`<meta>` タグの `no-cache` は効果がない。

**解決**: 
- ファイル名を2つ持つ戦略（`game2.js` + `game.js`）
- 古い `index.html` がキャッシュされていても、旧名ファイルに最新コードがあるので動く
- 本当にキャッシュが効く場合はURL末尾に `?v=xxx` を付けてアクセスしてもらう

**教訓**: GitHub Pages で確実にキャッシュを回避する方法はない。ファイル名変更が最も確実。

### 3. テーブル内ブランクに二重線が表示される

**原因**: `.blank` 要素の `border-bottom`（金色）と、`<td>` の `border`（紫）が両方表示されて二重線に見えた。さらに、プレースホルダ文字 `＿＿` 自体も細い線に見えた。

**解決**: 
- `.table-blank` に `border-bottom: none; color: transparent` を設定
- `.q-table td:has(.blank.active)` でtdのボーダーを金色に変更

### 4. 通常テキストで同一単語が2回出現するとき、最初のブランクに文字が入らない

**原因**: マーカー番号のリマップ処理で、同じ単語の2回目の出現が1回目を上書きしていた。

**解決**: `if (!(posOrder[pi] in remap))` ガードを追加して、初回のリマップのみ保持。

### 5. 同じセクションの問題がバラバラに表示される

**原因**: スプレッドシートに問題をランダムな順序で追加すると、同じセクションの問題が離れた位置になる。

**解決**: `sortBySection()` で同じセクション名の問題を自動的にまとめる。初出順を保持。

### 6. getCategoryPool() が問題の順番を変えてしまう

**原因**: `pool.some(q => q.difficulty)` で難易度フィルタが発動し、配列がソートされていた。`difficulty: '普通'` も truthy なので常に発動。

**解決**: 条件を `q.difficulty && q.difficulty !== '普通'` に変更。

---

## デプロイ方法（GitHub Pages）

### 基本手順

```bash
# 1. 編集後、旧名ファイルに同期
cp game2.js game.js
cp loader2.js custom_loader.js
cp style2.css style.css
cp questions2.js questions.js

# 2. コミット（変更したファイルを指定）
git add game2.js game.js style2.css style.css  # 変更したファイルのみ
git commit -m "変更内容の説明"

# 3. プッシュ
git push

# GitHub Pages は main ブランチへの push で自動デプロイ
# 反映まで数分かかることがある
```

### 注意事項

- `git add .` や `git add -A` は使わない（不要なファイルが含まれる可能性）
- 変更したファイルのペア（`*2.*` と旧名）を両方 add する
- プッシュ先は `origin main`
- GitHub Pages の設定: Settings → Pages → Source: Deploy from a branch → Branch: main, / (root)

### キャッシュの問題が起きた場合

1. ブラウザのキャッシュクリア
2. URL末尾に `?t=` + 現在時刻のタイムスタンプを付けてアクセス
3. 最終手段: ファイル名を変更する

---

## 修正時のチェックリスト

### コード修正後

- [ ] `*2.*` ファイルを編集した場合、旧名ファイルにコピーしたか？
- [ ] ブラウザで動作確認したか？（ローカルサーバーで `python -m http.server 8080`）
- [ ] 問題集の分野選択が「問題集」「オリジナル」の2グループに分かれているか？
- [ ] オリジナルカテゴリがオレンジ色で表示されているか？
- [ ] 出題範囲のボタンが正しく表示されているか？
  - 問題集: 10問固定（1〜10, 11〜20...）+ セクション名
  - オリジナル: セクション分割（最大10問）
- [ ] テーブル形式の問題が横スクロールで表示されるか？（縮小されていないか？）
- [ ] ゲームが正常に開始・終了できるか？

### スプレッドシート関連の修正後

- [ ] `ss_` プレフィックスが保持されているか？
- [ ] `group: 'オリジナル'` が設定されているか？
- [ ] 問題集のカテゴリと混ざっていないか？

---

## ゲームの主要な関数・クラス（game2.js）

| 関数/メソッド | 説明 |
|---|---|
| `buildCategoryButtons()` | ホーム画面のカテゴリボタン生成。問題集/オリジナルでグループ分け |
| `buildSetButtons()` | 出題範囲ボタン生成。問題集は固定分割、オリジナルはセクション分割 |
| `getSectionRanges(pool)` | セクション名ベースで問題をrangeに分割（最大10問） |
| `getFixedRanges(pool)` | 10問固定でrangeに分割 |
| `getCategoryPool()` | 選択中カテゴリの問題配列を取得 |
| `getQuestions()` | 現在のセットの問題を取得（setStart〜setEnd） |
| `showQuestion()` | 問題文をHTML化してDOM表示 |
| `isTableFormat(text)` | 問題文がテーブル形式かどうか判定 |
| `buildTableHTML(text, blanks)` | テーブル形式のHTML生成 |
| `saveProgress()` / `getProgress()` | 進捗のlocalStorage保存/読み込み |

## スプレッドシートローダー（loader2.js）

| 関数/メソッド | 説明 |
|---|---|
| `loadAll()` | スプレッドシートの全タブを読み込んでCATEGORIES/QUESTIONSに追加 |
| `parseCSV(csv)` | CSV文字列をパース |
| `buildQuestions(rows)` | 行データから問題オブジェクトを生成 |
| `autoDetectBlanks()` | 解答単語を問題文から自動検出して穴を作る |
| `sortBySection(questions)` | 同じセクションの問題をまとめてソート |
| `toSafeKey(name)` | カテゴリ名をキーに変換（`ss_` + 分野名） |
