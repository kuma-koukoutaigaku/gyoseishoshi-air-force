// ============================================================
// カスタム問題ローダー（Googleスプレッドシート連携）
// ============================================================
//
// 【スプレッドシートのフォーマット】
//   A列: 分野       （例: 民法, 行政法, 憲法）
//   B列: セクション  （例: 総則, 物権 ※任意）
//   C列: 出典        （例: 第5条, 最判平1.11.24）
//   D列: 問題文      （回答単語が自動検出され穴になる）
//   E列: 解答1       （正解の単語）
//   F列: 解答2       （※なければ空欄）
//   G列: 解答3       （※なければ空欄）
//   H列: 解答4       （※なければ空欄）
//   I列: 解答5       （※なければ空欄）
//   J列: デコイ      （任意。パイプ区切り 例: 間違い1|間違い2|間違い3）
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
            const regex = /"gid":"(\d+)"[^}]*"name":"([^"]*)"/g;
            let match;
            while ((match = regex.exec(html)) !== null) {
                const gid = parseInt(match[1]);
                if (!seenGids.has(gid)) {
                    seenGids.add(gid);
                    tabs.push({gid, name: match[2]});
                }
            }
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

    difficultyFromTabName(name) {
        if (name.includes('激ムズ')) return '激ムズ';
        if (name.includes('難')) return '難';
        return '普通';
    }

    groupFromTabName(name) {
        if (name.includes('問題集')) return null;
        return 'オリジナル';
    }

    // 分野名からグループを自動判定
    groupFromCategory(catName) {
        if (catName.startsWith('行政') || catName === '国家賠償・損失補償') return '行政法';
        return null;
    }

    // 旧キー(英語)→新キー(日本語)のlocalStorageマイグレーション
    migrateLocalStorage() {
        try {
            if (localStorage.getItem('af_migrated_v2')) return;
            const keyMap = {
                constitution: '憲法',
                admin_enforcement: '行政代執行法',
                admin_procedure: '行政手続法',
                admin_appeal: '行政不服審査法',
                admin_litigation: '行政事件訴訟法',
                state_compensation: '国家賠償・損失補償',
                civil: '民法',
                commercial: '商法・会社法'
            };
            for (const [oldKey, newKey] of Object.entries(keyMap)) {
                for (const prefix of ['af_progress_', 'af_clears_']) {
                    const oldVal = localStorage.getItem(prefix + oldKey);
                    if (oldVal !== null) {
                        const existingVal = localStorage.getItem(prefix + newKey);
                        if (prefix === 'af_progress_') {
                            const oldNum = parseInt(oldVal) || 0;
                            const newNum = parseInt(existingVal) || 0;
                            localStorage.setItem(prefix + newKey, Math.max(oldNum, newNum));
                        } else {
                            const oldObj = JSON.parse(oldVal || '{}');
                            const newObj = JSON.parse(existingVal || '{}');
                            for (const [k, v] of Object.entries(oldObj)) {
                                newObj[k] = (newObj[k] || 0) + v;
                            }
                            localStorage.setItem(prefix + newKey, JSON.stringify(newObj));
                        }
                        localStorage.removeItem(prefix + oldKey);
                    }
                }
                for (let s = 0; s < 300; s += 10) {
                    const oldRank = localStorage.getItem('af_rank_' + oldKey + '_' + s);
                    if (oldRank !== null) {
                        const existingRank = localStorage.getItem('af_rank_' + newKey + '_' + s);
                        if (existingRank) {
                            const merged = [...JSON.parse(oldRank), ...JSON.parse(existingRank)];
                            merged.sort((a, b) => b.score - a.score);
                            localStorage.setItem('af_rank_' + newKey + '_' + s, JSON.stringify(merged.slice(0, 5)));
                        } else {
                            localStorage.setItem('af_rank_' + newKey + '_' + s, oldRank);
                        }
                        localStorage.removeItem('af_rank_' + oldKey + '_' + s);
                    }
                }
            }
            // custom_プレフィックス付きの旧データも移行
            for (const [oldKey, newKey] of Object.entries(keyMap)) {
                const cOld = 'custom_' + oldKey;
                for (const prefix of ['af_progress_', 'af_clears_']) {
                    const val = localStorage.getItem(prefix + cOld);
                    if (val !== null) {
                        if (prefix === 'af_progress_') {
                            const cur = parseInt(localStorage.getItem(prefix + newKey)) || 0;
                            localStorage.setItem(prefix + newKey, Math.max(parseInt(val) || 0, cur));
                        } else {
                            const curObj = JSON.parse(localStorage.getItem(prefix + newKey) || '{}');
                            const oldObj = JSON.parse(val || '{}');
                            for (const [k, v] of Object.entries(oldObj)) {
                                curObj[k] = (curObj[k] || 0) + v;
                            }
                            localStorage.setItem(prefix + newKey, JSON.stringify(curObj));
                        }
                        localStorage.removeItem(prefix + cOld);
                    }
                }
            }
            localStorage.setItem('af_migrated_v2', '1');
        } catch (e) {
            console.warn('localStorage migration failed:', e);
        }
    }

    async load() {
        if (!CUSTOM_CONFIG.sheetId) return;

        this.migrateLocalStorage();

        try {
            localStorage.removeItem('af_custom_cache');
            localStorage.removeItem('af_custom_cache_time');
            localStorage.removeItem('af_custom_cache_ver');
        } catch {}

        try {
            const url = this.getSheetUrlByGid(0);
            const response = await fetch(url);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const csv = await response.text();
            if (!csv.trim()) throw new Error('Empty CSV');

            if (csv.trim().startsWith('<!') || csv.trim().startsWith('<html')) {
                throw new Error('Got HTML instead of CSV');
            }

            const lines = csv.split('\n').slice(1).filter(l => l.trim());
            const cats = [...new Set(lines.map(l => l.split(',')[0].replace(/"/g,'').trim()).filter(Boolean))];
            console.log('スプレッドシート読み込み: 分野=' + cats.join(', ') + ' (' + lines.length + '行)');

            this.parseAndRegister(csv, '普通');
            console.log('カスタム問題を読み込みました');
        } catch (e) {
            console.warn('カスタム問題の読み込みに失敗:', e.message);
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

    parseAndRegister(csv, tabDifficulty) {
        tabDifficulty = tabDifficulty || '普通';
        const rows = this.parseCSV(csv);
        if (rows.length < 2) return;

        const dataRows = rows.slice(1).filter(r => r.length >= 5 && r[0] && r[3]);

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
                    for (let j = 1; j < parts.length; j++) {
                        if (parts[j].trim()) inlineDecoys.push(parts[j].trim());
                    }
                }
            }
            const customDecoys = row[9]
                ? row[9].split('|').map(d => d.trim()).filter(d => d)
                : [];
            const allDecoys = [...inlineDecoys, ...customDecoys];

            // === 問題文中の回答単語を穴に変換 ===
            // 表形式: 同じ単語の全出現を個別の穴にする（あり×2 → 2穴）
            // 通常文: 同じ単語は1つの穴（撃つと全箇所同時に埋まる）
            var isTable = this.isTableFormat(text);
            var MARKER = '\x00';
            var sortedWords = [...new Set(answers)].sort(function(a, b) { return b.length - a.length; });
            var markerWords = [];

            if (isTable) {
                // 表: 各出現を個別にマーク
                for (var wi = 0; wi < sortedWords.length; wi++) {
                    var word = sortedWords[wi];
                    while (text.indexOf(word) !== -1) {
                        var idx = markerWords.length;
                        text = text.replace(word, MARKER + idx + MARKER);
                        markerWords.push(word);
                    }
                }
            } else {
                // 通常文: 全出現を同じマーカーで一括置換（1穴で全箇所埋まる）
                for (var wi = 0; wi < sortedWords.length; wi++) {
                    var word = sortedWords[wi];
                    if (text.indexOf(word) !== -1) {
                        var idx = markerWords.length;
                        while (text.indexOf(word) !== -1) {
                            text = text.replace(word, MARKER + idx + MARKER);
                        }
                        markerWords.push(word);
                    }
                }
            }

            // マーカーをテキスト内の出現順に振り直す
            var posOrder = [];
            var re = new RegExp(MARKER + '(\\d+)' + MARKER, 'g');
            var mr;
            while ((mr = re.exec(text)) !== null) {
                posOrder.push(parseInt(mr[1]));
            }
            var expandedBlanks = [];
            var remap = {};
            for (var pi = 0; pi < posOrder.length; pi++) {
                remap[posOrder[pi]] = pi;
                expandedBlanks.push(markerWords[posOrder[pi]]);
            }
            for (var oldIdx in remap) {
                var find = MARKER + oldIdx + MARKER;
                var replace = '{' + remap[oldIdx] + '}';
                while (text.indexOf(find) !== -1) {
                    text = text.replace(find, replace);
                }
            }

            // 後方互換: ①②③④⑤ が残っていれば変換
            var circleNums = ['①', '②', '③', '④', '⑤'];
            for (var ci = 0; ci < circleNums.length; ci++) {
                while (text.indexOf(circleNums[ci]) !== -1) {
                    text = text.replace(circleNums[ci], '{' + ci + '}');
                }
            }

            if (!text || expandedBlanks.length === 0) continue;

            if (!categories[category]) {
                categories[category] = [];
                categoryOrder.push(category);
            }

            var q = {
                text: text,
                blanks: expandedBlanks,
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
        // 同じラベルの既存カテゴリがあれば置き換え、なければ追加
        for (const catName of categoryOrder) {
            const questions = categories[catName];
            const key = this.toSafeKey(catName);
            const group = this.groupFromCategory(catName);

            // 同じラベルを持つ既存カテゴリを探して削除（キーが違っても）
            for (const [existKey, existCat] of Object.entries(CATEGORIES)) {
                if (existCat.label === catName && existKey !== key) {
                    delete CATEGORIES[existKey];
                    delete QUESTIONS[existKey];
                }
            }

            if (QUESTIONS[key]) {
                QUESTIONS[key] = QUESTIONS[key].concat(questions);
            } else {
                CATEGORIES[key] = {
                    label: catName,
                    group: group
                };
                QUESTIONS[key] = questions;
            }
        }

        this.loaded = true;
    }

    autoGenerateDecoys(categories) {
        const globalPool = [];
        for (const questions of Object.values(categories)) {
            for (const q of questions) {
                globalPool.push(...q.blanks);
            }
        }
        for (const questions of Object.values(QUESTIONS)) {
            for (const q of questions) {
                if (q.blanks) globalPool.push(...q.blanks);
            }
        }

        for (const [catName, questions] of Object.entries(categories)) {
            const catPool = [];
            for (const q of questions) {
                catPool.push(...q.blanks);
            }

            for (const q of questions) {
                if (q.decoys.length > 0) continue;

                const correctSet = new Set(q.blanks);
                let candidates = [...new Set(catPool.filter(a => !correctSet.has(a)))];

                if (candidates.length < 5) {
                    const extra = [...new Set(globalPool.filter(a => !correctSet.has(a) && !candidates.includes(a)))];
                    candidates = candidates.concat(extra);
                }

                for (let i = candidates.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
                }

                const needed = Math.max(5, q.blanks.length + 3);
                q.decoys = candidates.slice(0, needed);
            }
        }
    }

    isTableFormat(text) {
        var lines = text.split('\n').filter(function(l) { return l.trim(); });
        if (lines.length < 2) return false;
        var slashLines = lines.filter(function(l) { return (l.match(/／/g) || []).length >= 1; });
        if (slashLines.length < 2) return false;
        var counts = slashLines.map(function(l) { return (l.match(/／/g) || []).length; });
        return counts.every(function(c) { return c === counts[0]; });
    }

    toSafeKey(str) {
        return str.replace(/[^\w　-鿿゠-ヿ぀-ゟ]/g, '_').toLowerCase();
    }
}

const customLoader = new CustomQuestionLoader();
