// ============================================================
// カスタム問題ローダー（Googleスプレッドシート連携）
// ============================================================
//
// 【スプレッドシートのフォーマット】
//   A列: 分野       （例: 民法, 行政法, 憲法）
//   B列: セクション  （例: 総則, 物権 ※任意）
//   C列: 問題文      （穴は {0} {1} {2} {3} で指定）
//   D列: 解答1       （{0} の正解）
//   E列: 解答2       （{1} の正解 ※なければ空欄）
//   F列: 解答3       （{2} の正解 ※なければ空欄）
//   G列: 解答4       （{3} の正解 ※なければ空欄）
//   H列: 出典        （例: 第5条, 最判平1.11.24）
//   I列: デコイ      （任意。パイプ区切り 例: 間違い1|間違い2|間違い3）
//
// 【設定方法】
//   下の CUSTOM_CONFIG.sheetId にスプレッドシートIDを入れる
//   スプレッドシートは「ファイル→共有→ウェブに公開」でCSV形式で公開する
// ============================================================

const CUSTOM_CONFIG = {
    // Google スプレッドシートの ID（URLの /d/ と /edit の間の部分）
    // 例: '1AbCdEfGhIjKlMnOpQrStUvWxYz'
    sheetId: '1_YYh_4xhFGijlO3RfvyRUwrW2NLfVgySMeyHJF51rCM',

    // シート名（空欄なら最初のシートを使用）
    sheetName: '',

    // タイトル画面に表示するグループ名
    groupName: 'オリジナル'
};

class CustomQuestionLoader {
    constructor() {
        this.loaded = false;
    }

    getSheetUrl() {
        if (!CUSTOM_CONFIG.sheetId) return null;
        if (CUSTOM_CONFIG.sheetName) {
            return `https://docs.google.com/spreadsheets/d/${CUSTOM_CONFIG.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CUSTOM_CONFIG.sheetName)}`;
        }
        return `https://docs.google.com/spreadsheets/d/${CUSTOM_CONFIG.sheetId}/gviz/tq?tqx=out:csv&gid=0`;
    }

    async load() {
        const url = this.getSheetUrl();
        if (!url) return;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const csv = await response.text();
            this.parseAndRegister(csv);
            // オフライン用にキャッシュ
            try {
                localStorage.setItem('af_custom_csv', csv);
                localStorage.setItem('af_custom_csv_time', Date.now().toString());
            } catch {}
            console.log('カスタム問題を読み込みました');
        } catch (e) {
            console.warn('カスタム問題の読み込みに失敗:', e.message);
            // キャッシュがあればそちらを使う
            try {
                const cached = localStorage.getItem('af_custom_csv');
                if (cached) {
                    this.parseAndRegister(cached);
                    console.log('キャッシュからカスタム問題を読み込みました');
                }
            } catch {}
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

    parseAndRegister(csv) {
        const rows = this.parseCSV(csv);
        if (rows.length < 2) return;

        // ヘッダー行をスキップ（1行目はカラム名）
        const dataRows = rows.slice(1).filter(r => r.length >= 4 && r[0] && r[2]);

        // 分野ごとにグループ化
        const categories = {};
        const categoryOrder = [];

        for (const row of dataRows) {
            const category = row[0] || '';
            const section = (row[1] || '').trim();
            let text = (row[2] || '').trim();
            const answers = [];
            for (let i = 3; i <= 6; i++) {
                if (row[i] && row[i].trim()) answers.push(row[i].trim());
            }
            const source = (row[7] || '').trim();
            const customDecoys = row[8]
                ? row[8].split('|').map(d => d.trim()).filter(d => d)
                : [];

            // ①②③④ → {0}{1}{2}{3} に変換
            const circleNums = ['①', '②', '③', '④'];
            circleNums.forEach((cn, i) => {
                text = text.replaceAll(cn, `{${i}}`);
            });

            if (!text || answers.length === 0) continue;

            if (!categories[category]) {
                categories[category] = [];
                categoryOrder.push(category);
            }

            const q = {
                text: text,
                blanks: answers,
                decoys: customDecoys,
                source: source
            };
            if (section) q.section = section;

            categories[category].push(q);
        }

        // デコイ自動生成
        this.autoGenerateDecoys(categories);

        // CATEGORIES と QUESTIONS に登録
        for (const catName of categoryOrder) {
            const questions = categories[catName];
            // キー名を生成（英数字+日本語で安全なキー）
            const key = 'custom_' + this.toSafeKey(catName);

            CATEGORIES[key] = {
                label: catName,
                group: CUSTOM_CONFIG.groupName
            };
            QUESTIONS[key] = questions;
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
