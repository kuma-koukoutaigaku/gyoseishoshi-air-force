// ============================================================
// カスタム問題ローダー（Googleスプレッドシート連携）
// ============================================================
//
// 【スプレッドシートのフォーマット】
//   A列: 分野       （例: 民法, 行政法, 憲法）
//   B列: セクション  （例: 総則, 物権 ※任意）
//   C列: 出典        （例: 第5条, 最判平1.11.24）
//   D列: 問題文      （穴は {0} {1} {2} {3} で指定、または ①②③④⑤）
//   E列: 解答1       （{0} の正解。/区切りでデコイも指定可: 正解/デコイ1/デコイ2）
//   F列: 解答2       （{1} の正解 ※なければ空欄）
//   G列: 解答3       （{2} の正解 ※なければ空欄）
//   H列: 解答4       （{3} の正解 ※なければ空欄）
//   I列: 解答5       （{4} の正解 ※なければ空欄）
//   J列: デコイ      （任意。パイプ区切り 例: 間違い1|間違い2|間違い3）
//
// 【タブ対応・難易度】
//   スプレッドシート内の全タブを自動的に読み込む。
//   タブを分けても A列(分野) の値でボタンが作られる。
//   タブ名に「難」を含む → 難、「激ムズ」を含む → 激ムズ、それ以外 → 普通
//   同じ出典(I列)の問題は難易度バリエーションとして紐づけられる。
//
// 【設定方法】
//   下の CUSTOM_CONFIG.sheetId にスプレッドシートIDを入れる
//   スプレッドシートは「ファイル→共有→ウェブに公開」でCSV形式で公開する
// ============================================================

const CUSTOM_CONFIG = {
    // Google スプレッドシートの ID（URLの /d/ と /edit の間の部分）
    sheetId: '1_YYh_4xhFGijlO3RfvyRUwrW2NLfVgySMeyHJF51rCM'
};

class CustomQuestionLoader {
    constructor() {
        this.loaded = false;
    }

    // 全タブの gid・名前 一覧を取得
    async getSheetTabs() {
        const url = `https://docs.google.com/spreadsheets/d/${CUSTOM_CONFIG.sheetId}/edit`;
        try {
            const response = await fetch(url);
            if (!response.ok) return [{gid: 0, name: ''}];
            const html = await response.text();
            const tabs = [];
            const seenGids = new Set();
            // {"gid":"0","name":"シート1"} のようなパターンを抽出
            const regex = /"gid":"(\d+)"[^}]*"name":"([^"]*)"/g;
            let match;
            while ((match = regex.exec(html)) !== null) {
                const gid = parseInt(match[1]);
                if (!seenGids.has(gid)) {
                    seenGids.add(gid);
                    tabs.push({gid, name: match[2]});
                }
            }
            // 逆順パターン: "name":"...","gid":"..."
            if (tabs.length === 0) {
                const regex2 = /"name":"([^"]*)"[^}]*"gid":"(\d+)"/g;
                while ((match = regex2.exec(html)) !== null) {
                    const gid = parseInt(match[2]);
                    if (!seenGids.has(gid)) {
                        seenGids.add(gid);
                        tabs.push({gid, name: match[1]});
                    }
                }
            }
            // フォールバック: gidだけ取得
            if (tabs.length === 0) {
                const regex3 = /gid=(\d+)/g;
                while ((match = regex3.exec(html)) !== null) {
                    const gid = parseInt(match[1]);
                    if (!seenGids.has(gid)) {
                        seenGids.add(gid);
                        tabs.push({gid, name: ''});
                    }
                }
            }
            return tabs.length > 0 ? tabs : [{gid: 0, name: ''}];
        } catch {
            return [{gid: 0, name: ''}];
        }
    }

    getSheetUrlByGid(gid) {
        return `https://docs.google.com/spreadsheets/d/${CUSTOM_CONFIG.sheetId}/export?format=csv&gid=${gid}`;
    }

    // タブ名から難易度を判定
    difficultyFromTabName(name) {
        if (name.includes('激ムズ')) return '激ムズ';
        if (name.includes('難')) return '難';
        return '普通';
    }

    // タブ名からグループ名を判定
    // 「問題集」を含む → null（トップレベル、questions.jsと同じ扱い）
    // それ以外 → 'オリジナル' グループ
    groupFromTabName(name) {
        if (name.includes('問題集')) return null;
        return 'オリジナル';
    }

    async load() {
        if (!CUSTOM_CONFIG.sheetId) return;

        // キャッシュを毎回クリア（不正データ対策）
        try {
            localStorage.removeItem('af_custom_cache');
            localStorage.removeItem('af_custom_cache_time');
            localStorage.removeItem('af_custom_cache_ver');
        } catch {}

        try {
            // gid=0のCSVを直接取得（タブ自動検出を廃止、iPhone互換性のため）
            const url = this.getSheetUrlByGid(0);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const csv = await response.text();
            if (!csv.trim()) throw new Error('Empty CSV');

            // CSVがHTMLでないか確認（リダイレクト対策）
            if (csv.trim().startsWith('<!') || csv.trim().startsWith('<html')) {
                throw new Error('Got HTML instead of CSV');
            }

            const lines = csv.split('\n').slice(1).filter(l => l.trim());
            const cats = [...new Set(lines.map(l => l.split(',')[0].replace(/"/g,'').trim()).filter(Boolean))];
            console.log(`スプレッドシート読み込み: 分野=${cats.join(', ')} (${lines.length}行)`);

            this.parseAndRegister(csv, '普通', 'オリジナル');
            console.log('カスタム問題を読み込みました');
        } catch (e) {
            console.warn('カスタム問題の読み込みに失敗:', e.message);
            // ネットワーク失敗時はカスタム問題なしで動作（不正キャッシュ防止）
        }
    }

    parseCSVRow(row) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < row.length; i++) {
            const ch = row[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (i + 1 < row.length && row[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    current += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += ch;
                }
            }
        }
        result.push(current.trim());
        return result;
    }

    parseCSV(csv) {
        const rows = [];
        const lines = csv.split('\n');

        let buffer = '';
        let inQuotes = false;

        for (const line of lines) {
            if (inQuotes) {
                buffer += '\n' + line;
                const quoteCount = (line.match(/"/g) || []).length;
                if (quoteCount % 2 !== 0) {
                    inQuotes = false;
                    rows.push(this.parseCSVRow(buffer));
                    buffer = '';
                }
            } else {
                const quoteCount = (line.match(/"/g) || []).length;
                if (quoteCount % 2 !== 0) {
                    inQuotes = true;
                    buffer = line;
                } else {
                    if (line.trim()) {
                        rows.push(this.parseCSVRow(line));
                    }
                }
            }
        }
        if (buffer) rows.push(this.parseCSVRow(buffer));
        return rows;
    }

    parseAndRegister(csv, tabDifficulty = '普通', tabGroup = null) {
        const rows = this.parseCSV(csv);
        if (rows.length < 2) return;

        // ヘッダー行をスキップ（1行目はカラム名）
        // 新列順: A:分野, B:セクション, C:出典, D:問題文, E-I:解答1-5, J:デコイ
        const dataRows = rows.slice(1).filter(r => r.length >= 5 && r[0] && r[3]);

        // 分野ごとにグループ化
        const categories = {};
        const categoryOrder = [];

        for (const row of dataRows) {
            const category = row[0] || '';
            const section = (row[1] || '').trim();
            const source = (row[2] || '').trim();
            let text = (row[3] || '').trim();
            const answers = [];
            const inlineDecoys = [];
            for (let i = 4; i <= 8; i++) {
                if (row[i] && row[i].trim()) {
                    const parts = row[i].trim().split('/');
                    answers.push(parts[0].trim());
                    // /以降はその穴のデコイ
                    for (let j = 1; j < parts.length; j++) {
                        if (parts[j].trim()) inlineDecoys.push(parts[j].trim());
                    }
                }
            }
            const customDecoys = row[9]
                ? row[9].split('|').map(d => d.trim()).filter(d => d)
                : [];
            // インラインデコイとJ列デコイを統合
            const allDecoys = [...inlineDecoys, ...customDecoys];

            // ①②③④⑤ → {0}{1}{2}{3}{4} に変換
            const circleNums = ['①', '②', '③', '④', '⑤'];
            const hasMarkers = circleNums.some(cn => text.includes(cn)) || /\{[0-4]\}/.test(text);

            if (hasMarkers) {
                // 従来方式: ①②や{0}{1}マーカーがある場合はそのまま変換
                circleNums.forEach((cn, i) => {
                    text = text.replaceAll(cn, `{${i}}`);
                });
            } else {
                // 新方式: 問題文中の回答単語を自動的に穴に変換
                // 長い単語から先に置換（部分一致を防ぐ）
                const sortedAnswers = answers
                    .map((a, i) => ({ word: a, index: i }))
                    .sort((a, b) => b.word.length - a.word.length);

                for (const { word, index } of sortedAnswers) {
                    // 最初の1つだけ置換（同じ単語が複数回出ても1つだけ穴にする）
                    const pos = text.indexOf(word);
                    if (pos !== -1) {
                        text = text.substring(0, pos) + `{${index}}` + text.substring(pos + word.length);
                    }
                }
            }

            if (!text || answers.length === 0) continue;

            if (!categories[category]) {
                categories[category] = [];
                categoryOrder.push(category);
            }

            const q = {
                text: text,
                blanks: answers,
                decoys: allDecoys,
                source: source,
                difficulty: tabDifficulty
            };
            if (section) q.section = section;

            categories[category].push(q);
        }

        // デコイ自動生成
        this.autoGenerateDecoys(categories);

        // CATEGORIES と QUESTIONS に登録
        // スプレッドシートの問題は常にcustom_プレフィックスで分離
        for (const catName of categoryOrder) {
            const questions = categories[catName];
            const key = 'custom_' + this.toSafeKey(catName);

            if (QUESTIONS[key]) {
                QUESTIONS[key] = QUESTIONS[key].concat(questions);
            } else {
                CATEGORIES[key] = {
                    label: catName,
                    group: tabGroup
                };
                QUESTIONS[key] = questions;
            }
        }

        this.loaded = true;
    }

    autoGenerateDecoys(categories) {
        // 全カテゴリの全正解を収集（グローバルプール）
        const globalPool = [];
        for (const questions of Object.values(categories)) {
            for (const q of questions) {
                globalPool.push(...q.blanks);
            }
        }
        // 既存の QUESTIONS からもプール追加
        for (const questions of Object.values(QUESTIONS)) {
            for (const q of questions) {
                if (q.blanks) globalPool.push(...q.blanks);
            }
        }

        for (const [catName, questions] of Object.entries(categories)) {
            // カテゴリ内の全正解
            const catPool = [];
            for (const q of questions) {
                catPool.push(...q.blanks);
            }

            for (const q of questions) {
                if (q.decoys.length > 0) continue; // 手動指定済み

                const correctSet = new Set(q.blanks);

                // まずカテゴリ内プールから候補を取得
                let candidates = [...new Set(catPool.filter(a => !correctSet.has(a)))];

                // 足りなければグローバルプールから追加
                if (candidates.length < 5) {
                    const extra = [...new Set(globalPool.filter(a => !correctSet.has(a) && !candidates.includes(a)))];
                    candidates = candidates.concat(extra);
                }

                // シャッフル
                for (let i = candidates.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
                }

                // 正解数 + 3〜5 のデコイを確保
                const needed = Math.max(5, q.blanks.length + 3);
                q.decoys = candidates.slice(0, needed);
            }
        }
    }

    toSafeKey(str) {
        return str.replace(/[^\w　-鿿゠-ヿ぀-ゟ]/g, '_').toLowerCase();
    }
}

const customLoader = new CustomQuestionLoader();
