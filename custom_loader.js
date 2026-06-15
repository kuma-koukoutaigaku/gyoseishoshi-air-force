// ============================================================
// カスタム問題ローダー（Googleスプレッドシート連携）
// ============================================================
//
// 【スプレッドシートのフォーマット】
//   A列: 分野       （例: 民法, 行政法, 憲法）
//   B列: セクション  （例: 総則, 物権 ※任意）
//   C列: 問題文      （穴は {0} {1} {2} {3} で指定、または ①②③④⑤）
//   D列: 解答1       （{0} の正解。/区切りでデコイも指定可: 正解/デコイ1/デコイ2）
//   E列: 解答2       （{1} の正解 ※なければ空欄）
//   F列: 解答3       （{2} の正解 ※なければ空欄）
//   G列: 解答4       （{3} の正解 ※なければ空欄）
//   H列: 解答5       （{4} の正解 ※なければ空欄）
//   I列: 出典        （例: 第5条, 最判平1.11.24）
//   J列: デコイ      （任意。パイプ区切り 例: 間違い1|間違い2|間違い3）
//
// 【タブ対応】
//   スプレッドシート内の全タブを自動的に読み込む。
//   タブを分けても A列(分野) の値でボタンが作られる。
//   同じ分野名なら統合、違う名前なら別ボタンになる。
//
// 【設定方法】
//   下の CUSTOM_CONFIG.sheetId にスプレッドシートIDを入れる
//   スプレッドシートは「ファイル→共有→ウェブに公開」でCSV形式で公開する
// ============================================================

const CUSTOM_CONFIG = {
    // Google スプレッドシートの ID（URLの /d/ と /edit の間の部分）
    sheetId: '1_YYh_4xhFGijlO3RfvyRUwrW2NLfVgySMeyHJF51rCM',

    // タイトル画面に表示するグループ名
    groupName: 'オリジナル'
};

class CustomQuestionLoader {
    constructor() {
        this.loaded = false;
    }

    // 全タブの gid 一覧を取得
    async getSheetGids() {
        const url = `https://docs.google.com/spreadsheets/d/${CUSTOM_CONFIG.sheetId}/edit`;
        try {
            const response = await fetch(url);
            if (!response.ok) return [0]; // フォールバック: 最初のタブだけ
            const html = await response.text();
            // HTML内の gid パラメータを抽出
            const gids = [];
            const regex = /"gid":"(\d+)"/g;
            let match;
            while ((match = regex.exec(html)) !== null) {
                const gid = parseInt(match[1]);
                if (!gids.includes(gid)) gids.push(gid);
            }
            // 見つからない場合のフォールバック（別のパターン）
            if (gids.length === 0) {
                const regex2 = /gid=(\d+)/g;
                while ((match = regex2.exec(html)) !== null) {
                    const gid = parseInt(match[1]);
                    if (!gids.includes(gid)) gids.push(gid);
                }
            }
            return gids.length > 0 ? gids : [0];
        } catch {
            return [0];
        }
    }

    getSheetUrlByGid(gid) {
        return `https://docs.google.com/spreadsheets/d/${CUSTOM_CONFIG.sheetId}/export?format=csv&gid=${gid}`;
    }

    async load() {
        if (!CUSTOM_CONFIG.sheetId) return;

        try {
            // 全タブの gid を取得
            const gids = await this.getSheetGids();
            console.log(`スプレッドシート: ${gids.length}タブ検出`);

            // 全タブのCSVを結合（ヘッダー行は最初のタブのみ残す）
            let allCsv = '';
            for (let i = 0; i < gids.length; i++) {
                const url = this.getSheetUrlByGid(gids[i]);
                const response = await fetch(url);
                if (!response.ok) continue;
                let csv = await response.text();

                if (i === 0) {
                    // 最初のタブはそのまま（ヘッダー込み）
                    allCsv = csv;
                } else {
                    // 2タブ目以降はヘッダー行をスキップ
                    const firstNewline = csv.indexOf('\n');
                    if (firstNewline >= 0) {
                        allCsv += '\n' + csv.substring(firstNewline + 1);
                    }
                }
            }

            if (allCsv) {
                this.parseAndRegister(allCsv);
                // オフライン用にキャッシュ
                try {
                    localStorage.setItem('af_custom_csv', allCsv);
                    localStorage.setItem('af_custom_csv_time', Date.now().toString());
                } catch {}
                console.log('カスタム問題を読み込みました');
            }
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
            const inlineDecoys = [];
            for (let i = 3; i <= 7; i++) {
                if (row[i] && row[i].trim()) {
                    const parts = row[i].trim().split('/');
                    answers.push(parts[0].trim());
                    // /以降はその穴のデコイ
                    for (let j = 1; j < parts.length; j++) {
                        if (parts[j].trim()) inlineDecoys.push(parts[j].trim());
                    }
                }
            }
            const source = (row[8] || '').trim();
            const customDecoys = row[9]
                ? row[9].split('|').map(d => d.trim()).filter(d => d)
                : [];
            // インラインデコイとJ列デコイを統合
            const allDecoys = [...inlineDecoys, ...customDecoys];

            // ①②③④⑤ → {0}{1}{2}{3}{4} に変換
            const circleNums = ['①', '②', '③', '④', '⑤'];
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
                decoys: allDecoys,
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
            const key = 'custom_' + this.toSafeKey(catName);

            if (QUESTIONS[key]) {
                // 同じ分野名が既にあれば統合（別タブから同じ分野名の問題が来た場合）
                QUESTIONS[key] = QUESTIONS[key].concat(questions);
            } else {
                CATEGORIES[key] = {
                    label: catName,
                    group: CUSTOM_CONFIG.groupName
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
