class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.selectedCategory = 'all';
        this.selectedDifficulty = '普通';
        this.playMode = 'sequential';
        this.setStart = 0;
        this.setSize = 10;
        this.score = 0;
        this.lives = 5;
        this.combo = 0;
        this.maxCombo = 0;
        this.currentQuestionIndex = 0;
        this.currentBlankIndex = 0;
        this.questions = [];
        this.results = [];

        // Player
        this.player = { x: 0, y: 0 };
        this.mouseX = 0;
        this.mouseY = 0;
        this.shooting = false;
        this.shootTimer = 0;
        this.shootInterval = 18;

        // Game objects
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.explosions = [];
        this.bgStars = [];

        // Lanes for non-overlapping spawn
        this.lanes = [];
        this.laneCount = 7;

        // Timing
        this.enemySpawnTimer = 0;
        this.enemySpawnInterval = 50;
        this.difficulty = 1;
        this.gameRunning = false;
        this.loopId = null;
        this.frameCount = 0;

        // Question
        this.wordPool = [];
        this.wordPoolIndex = 0;
        this.questionTransition = false;

        // Combo display
        this.comboDisplay = { text: '', alpha: 0, y: 0 };

        // === NEW: Scoring & Stats ===
        this.gameStartTime = 0;
        this.questionStartTime = 0;
        this.questionTimes = [];
        this.shotsFired = 0;
        this.shotsHit = 0;
        this.damageTaken = 0;

        this.initStars();
        this.buildCategoryButtons();
        this.buildSetButtons();
        this.setupEventListeners();
    }

    buildCategoryButtons() {
        const container = document.getElementById('category-buttons');
        container.innerHTML = '';

        const allBtn = document.createElement('button');
        allBtn.className = 'category-btn selected';
        allBtn.dataset.category = 'all';
        allBtn.textContent = '全分野';
        container.appendChild(allBtn);

        // グループなし(問題集)を先に、グループあり(オリジナル等)を後に並べる
        const entries = Object.entries(CATEGORIES);
        const noGroup = entries.filter(([, c]) => !c.group);
        const grouped = entries.filter(([, c]) => c.group);
        // グループ名でまとめる
        const groupNames = [...new Set(grouped.map(([, c]) => c.group))];

        // グループなしのボタン
        for (const [key, cat] of noGroup) {
            const btn = document.createElement('button');
            btn.className = 'category-btn';
            btn.dataset.category = key;
            btn.textContent = cat.label;
            container.appendChild(btn);
        }

        // グループごとにラベル + ボタン
        for (const gName of groupNames) {
            const label = document.createElement('div');
            label.className = 'category-group-label custom-group';
            label.textContent = `── ${gName} ──`;
            container.appendChild(label);

            for (const [key, cat] of grouped.filter(([, c]) => c.group === gName)) {
                const btn = document.createElement('button');
                btn.className = 'category-btn custom-category';
                btn.dataset.category = key;
                btn.textContent = cat.label;
                container.appendChild(btn);
            }
        }
    }

    getProgress(cat) {
        try {
            return parseInt(localStorage.getItem(`af_progress_${cat}`)) || 0;
        } catch { return 0; }
    }

    saveProgress(cat, val) {
        try { localStorage.setItem(`af_progress_${cat}`, val); } catch {}
    }

    getClears(cat) {
        try {
            return JSON.parse(localStorage.getItem(`af_clears_${cat}`)) || {};
        } catch { return {}; }
    }

    addClear(cat, setStart) {
        try {
            const clears = this.getClears(cat);
            clears[setStart] = (clears[setStart] || 0) + 1;
            localStorage.setItem(`af_clears_${cat}`, JSON.stringify(clears));
        } catch {}
    }

    // === NEW: Rankings ===
    getRankings(cat, setStart) {
        try {
            return JSON.parse(localStorage.getItem(`af_rank_${cat}_${setStart}`)) || [];
        } catch { return []; }
    }

    saveRanking(cat, setStart, record) {
        try {
            const rankings = this.getRankings(cat, setStart);
            rankings.push(record);
            // 上位5件のみ保持（スコア降順）
            rankings.sort((a, b) => b.score - a.score);
            const top5 = rankings.slice(0, 5);
            localStorage.setItem(`af_rank_${cat}_${setStart}`, JSON.stringify(top5));
        } catch {}
    }

    buildSetButtons() {
        const container = document.getElementById('section-buttons');
        container.innerHTML = '';

        if (this.selectedCategory === 'all') {
            const btn = document.createElement('button');
            btn.className = 'section-btn selected';
            btn.textContent = '最初から';
            btn.dataset.setStart = '0';
            container.appendChild(btn);
            this.setStart = 0;
            return;
        }

        const pool = this.getCategoryPool();
        const total = pool.length;
        const saved = this.getProgress(this.selectedCategory);
        const clears = this.getClears(this.selectedCategory);
        const setCount = Math.ceil(total / this.setSize);

        for (let i = 0; i < setCount; i++) {
            const from = i * this.setSize;
            const to = Math.min(from + this.setSize, total);
            const sectionName = pool[from].section || '';
            const clearCount = clears[from] || 0;

            const btn = document.createElement('button');
            const isSaved = (from === saved);
            btn.className = 'section-btn' + (isSaved ? ' selected' : '');
            btn.dataset.setStart = String(from);

            const label = `${from + 1}〜${to}`;
            let hint = sectionName ? `<span class="set-section-hint">${sectionName}〜</span>` : '';
            let badge = clearCount > 0 ? `<span class="set-clear-count">${clearCount}</span>` : '';

            // ランキングのベストスコア表示
            const rankings = this.getRankings(this.selectedCategory, from);
            let rankBadge = '';
            if (rankings.length > 0) {
                rankBadge = `<span class="set-best-score">${rankings[0].score}pt</span>`;
            }

            btn.innerHTML = label + hint + badge + rankBadge;

            if (clearCount > 0) {
                btn.classList.add('set-cleared');
            }

            container.appendChild(btn);
        }

        this.setStart = saved < total ? saved : 0;
    }

    // 選択中のカテゴリに難易度付き問題があるか確認し、
    // あれば難易度セレクタを表示、なければ非表示
    updateDifficultyButtons() {
        const pool = this.getRawCategoryPool();
        const hasDifficulty = pool.some(q => q.difficulty && q.difficulty !== '普通');
        const diffSelect = document.getElementById('difficulty-select');

        if (hasDifficulty) {
            diffSelect.classList.remove('hidden');
            // 各難易度に問題があるかチェックしてdisabled制御
            ['普通', '難', '激ムズ'].forEach(diff => {
                const btn = document.querySelector(`.diff-btn[data-diff="${diff}"]`);
                const count = pool.filter(q => (q.difficulty || '普通') === diff).length;
                btn.disabled = count === 0;
            });
        } else {
            diffSelect.classList.add('hidden');
            this.selectedDifficulty = '普通';
        }
    }

    // フィルタなしの生プール
    getRawCategoryPool() {
        let pool = [];
        if (this.selectedCategory === 'all') {
            for (const cat of Object.values(QUESTIONS)) {
                pool = pool.concat(cat);
            }
        } else {
            pool = [...(QUESTIONS[this.selectedCategory] || [])];
        }
        return pool;
    }

    getCategoryPool() {
        const pool = this.getRawCategoryPool();
        const hasDiffQuestions = pool.some(q => q.difficulty);

        if (!hasDiffQuestions) {
            // 既存問題(questions.js)のみ → そのまま返す
            return pool;
        }

        // 難易度バリエーションがある場合:
        // sourceで同じ問題をグループ化し、選択中の難易度のバージョンを優先
        // なければフォールバック(普通→難→激ムズの順)
        const diffPriority = { '普通': 0, '難': 1, '激ムズ': 2 };
        const targetDiff = this.selectedDifficulty;

        // sourceごとにバリエーションを集める
        const groups = new Map(); // source → { 普通: q, 難: q, 激ムズ: q }
        const noSourceQuestions = []; // sourceがない問題はそのまま含める
        const insertionOrder = []; // 最初に出現した順番を保持

        for (const q of pool) {
            const diff = q.difficulty || '普通';
            const src = q.source;

            if (!src) {
                noSourceQuestions.push(q);
                continue;
            }

            if (!groups.has(src)) {
                groups.set(src, {});
                insertionOrder.push(src);
            }
            // 同じ難易度が既にあれば上書きしない（最初のものを採用）
            if (!groups.get(src)[diff]) {
                groups.get(src)[diff] = q;
            }
        }

        // 各グループから選択中の難易度を取得、なければフォールバック
        const result = [];
        for (const src of insertionOrder) {
            const variants = groups.get(src);
            if (variants[targetDiff]) {
                result.push(variants[targetDiff]);
            } else if (variants['普通']) {
                result.push(variants['普通']);
            } else {
                // どれか1つを返す
                const any = Object.values(variants)[0];
                if (any) result.push(any);
            }
        }

        return result.concat(noSourceQuestions);
    }

    initStars() {
        this.bgStars = [];
        for (let i = 0; i < 60; i++) {
            this.bgStars.push({
                x: Math.random() * 2000,
                y: Math.random() * 2000,
                size: Math.random() * 1.5 + 0.5,
                brightness: Math.random() * 0.4 + 0.3
            });
        }
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
                this.playMode = e.target.dataset.mode;
                this.updateSectionVisibility();
            });
        });

        document.getElementById('category-buttons').addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (!btn) return;
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            this.selectedCategory = btn.dataset.category;
            this.updateDifficultyButtons();
            if (this.playMode === 'sequential') {
                this.buildSetButtons();
            }
        });

        document.getElementById('difficulty-buttons').addEventListener('click', (e) => {
            const btn = e.target.closest('.diff-btn');
            if (!btn || btn.disabled) return;
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            this.selectedDifficulty = btn.dataset.diff;
            if (this.playMode === 'sequential') {
                this.buildSetButtons();
            }
        });

        document.getElementById('section-buttons').addEventListener('click', (e) => {
            const btn = e.target.closest('.section-btn');
            if (!btn) return;
            document.querySelectorAll('.section-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            this.setStart = parseInt(btn.dataset.setStart);
        });

        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('retry-btn').addEventListener('click', () => this.startGame());
        document.getElementById('back-btn').addEventListener('click', () => this.showTitle());
        document.getElementById('home-btn').addEventListener('click', () => this.showTitle());

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.gameRunning) return;
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            this.mouseX = (e.clientX - rect.left) * scaleX;
            this.mouseY = (e.clientY - rect.top) * scaleY;
        });
        this.canvas.addEventListener('mousedown', (e) => {
            this.shooting = true;
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            this.mouseX = (e.clientX - rect.left) * scaleX;
            this.mouseY = (e.clientY - rect.top) * scaleY;
            this.shootTimer = this.shootInterval;
        });
        this.canvas.addEventListener('mouseup', () => { this.shooting = false; });

        this.lastTapTime = 0;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.playerAtTouchStart = { x: 0, y: 0 };

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const now = Date.now();
            if (now - this.lastTapTime < 350) {
                this.shooting = true;
                this.shootTimer = this.shootInterval;
                setTimeout(() => { this.shooting = false; }, 250);
            }
            this.lastTapTime = now;
            const touch = e.touches[0];
            this.touchStartX = touch.clientX;
            this.touchStartY = touch.clientY;
            this.playerAtTouchStart.x = this.mouseX;
            this.playerAtTouchStart.y = this.mouseY;
        }, { passive: false });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const dx = (touch.clientX - this.touchStartX) * scaleX;
            const dy = (touch.clientY - this.touchStartY) * scaleY;
            this.mouseX = this.playerAtTouchStart.x + dx;
            this.mouseY = this.playerAtTouchStart.y + dy;
        }, { passive: false });
    }

    updateSectionVisibility() {
        const sectionEl = document.getElementById('section-select');
        if (this.playMode === 'sequential') {
            sectionEl.classList.remove('hidden');
            this.buildSetButtons();
        } else {
            sectionEl.classList.add('hidden');
        }
    }


    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.updateLanes();
    }

    updateLanes() {
        const margin = 60;
        const usable = this.canvas.width - margin * 2;
        this.lanes = [];
        for (let i = 0; i < this.laneCount; i++) {
            this.lanes.push(margin + usable * (i + 0.5) / this.laneCount);
        }
    }

    showTitle() {
        document.getElementById('title-screen').classList.remove('hidden');
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('result-screen').classList.add('hidden');
        if (this.loopId) clearInterval(this.loopId);
        this.gameRunning = false;
        if (this.playMode === 'sequential') {
            this.buildSetButtons();
        }
    }

    startGame() {
        this.score = 0;
        this.lives = 5;
        this.combo = 0;
        this.maxCombo = 0;
        this.currentQuestionIndex = 0;
        this.currentBlankIndex = 0;
        this.results = [];
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.explosions = [];
        this.difficulty = 1;
        this.frameCount = 0;
        this.shooting = false;
        this.questionTransition = false;

        // Stats reset
        this.gameStartTime = Date.now();
        this.questionStartTime = 0;
        this.questionTimes = [];
        this.shotsFired = 0;
        this.shotsHit = 0;
        this.damageTaken = 0;

        this.questions = this.getQuestions();
        if (this.questions.length === 0) return;

        // スコア正規化: どんなセットでも満点が約10000点になるように調整
        // 難易度倍率: 普通=1.0, 難=1.5, 激ムズ=2.0
        const diffScoreMult = this.selectedDifficulty === '激ムズ' ? 2.0
                            : this.selectedDifficulty === '難' ? 1.5 : 1.0;
        this.totalBlanks = this.questions.reduce((sum, q) => sum + q.blanks.length, 0);
        this.basePoints = Math.round(7000 * diffScoreMult / this.totalBlanks);
        this.speedBonusPerQ = Math.round(3000 * diffScoreMult / this.questions.length);

        document.getElementById('title-screen').classList.add('hidden');
        document.getElementById('result-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');

        this.resizeCanvas();

        this.player.x = this.canvas.width / 2;
        this.player.y = this.canvas.height * 0.7;
        this.mouseX = this.player.x;
        this.mouseY = this.player.y;

        this.updateHUD();
        this.loadQuestion();
        this.gameRunning = true;
        this.gameLoop();
    }

    getQuestions() {
        const pool = this.getCategoryPool();
        if (this.playMode === 'random') {
            return this.shuffle(pool).slice(0, 10);
        }
        return pool.slice(this.setStart, this.setStart + this.setSize);
    }

    shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // 難易度倍率（穴の数で自動判定）
    getDifficultyMultiplier(q) {
        const blanks = q.blanks.length;
        if (blanks >= 4) return 2.0;
        if (blanks >= 2) return 1.5;
        return 1.0;
    }

    getDifficultyLabel(q) {
        const blanks = q.blanks.length;
        if (blanks >= 4) return '激ムズ';
        if (blanks >= 2) return '難';
        return '普通';
    }

    loadQuestion() {
        this.currentBlankIndex = 0;
        this.enemies = [];
        this.bullets = [];
        this.questionTransition = false;
        this.questionStartTime = Date.now();

        const q = this.questions[this.currentQuestionIndex];
        const questionText = document.getElementById('question-text');

        let html = this.renderQuestionHTML(q.text, q.blanks, false);
        questionText.innerHTML = `<span style="color:#666; font-size:0.75rem;">${q.source}</span><br>` + html;

        document.getElementById('q-current').textContent = this.currentQuestionIndex + 1;
        document.getElementById('q-total').textContent = this.questions.length;

        this.prepareWords();
    }

    prepareWords() {
        const q = this.questions[this.currentQuestionIndex];
        this.wordPool = [];

        q.blanks.forEach((blank, i) => {
            this.wordPool.push({ text: blank, isCorrect: true, blankIndex: i });
        });
        q.decoys.forEach(decoy => {
            this.wordPool.push({ text: decoy, isCorrect: false, blankIndex: -1 });
        });

        // === 画面上の単語数ルール（詰めすぎない） ===
        const blanksCount = q.blanks.length;
        if (blanksCount <= 2) {
            this.targetOnScreen = 5;
        } else if (blanksCount <= 4) {
            this.targetOnScreen = 6;
        } else {
            this.targetOnScreen = 8;
        }

        this.wordPool = this.shuffle(this.wordPool);
        this.wordPoolIndex = 0;

        // === 画面外（上）から時間差で降ってくるように配置 ===
        const target = this.targetOnScreen;
        const spacing = 90; // 単語間の縦間隔（ゆったり）
        this.ctx.font = 'bold 15px "Hiragino Kaku Gothic ProN", sans-serif';

        for (let i = 0; i < target; i++) {
            const wordData = this.getNextPoolWord();
            const textW = this.ctx.measureText(wordData.text).width + 40;
            const laneIdx = Math.floor(Math.random() * this.lanes.length);

            this.enemies.push({
                ...wordData,
                x: this.lanes[laneIdx],
                y: -(spacing * i) - 40, // 画面外から時間差で降ってくる
                width: textW,
                hp: 2,
                maxHp: 2,
                speedMult: 0.7 + Math.random() * 0.3,
                dying: false,
                dyingTimer: 0,
                flash: 0
            });
        }
    }

    // プールから次の単語を取得（使い切ったらリシャッフル）
    getNextPoolWord() {
        if (this.wordPoolIndex >= this.wordPool.length) {
            this.wordPool = this.shuffle(this.wordPool);
            this.wordPoolIndex = 0;

            // 正解を前半に配置
            const q = this.questions[this.currentQuestionIndex];
            const needed = q.blanks[this.currentBlankIndex];
            if (needed) {
                const half = Math.floor(this.wordPool.length / 2);
                const idx = this.wordPool.findIndex(w => w.isCorrect && w.text === needed);
                if (idx >= half) {
                    const swapIdx = Math.floor(Math.random() * half);
                    [this.wordPool[swapIdx], this.wordPool[idx]] =
                        [this.wordPool[idx], this.wordPool[swapIdx]];
                }
            }
        }
        return this.wordPool[this.wordPoolIndex++];
    }

    // 画面外（上）で他の待機中の単語と被らないY座標を返す
    findSpawnY(excludeEnemy) {
        // 画面外で待機中の単語のY座標を収集
        const waitingYs = [];
        for (const e of this.enemies) {
            if (e === excludeEnemy) continue;
            if (e.dying) continue;
            if (e.y < 0) waitingYs.push(e.y);
        }
        // 一番上の待機単語よりさらに上に配置（間隔90px）
        if (waitingYs.length > 0) {
            return Math.min(...waitingYs) - 90;
        }
        return -40 - Math.random() * 60;
    }

    // 撃破・フレームアウト後の再出現（画面外上部から降ってくる）
    respawnEnemy(e) {
        const wordData = this.getNextPoolWord();
        e.text = wordData.text;
        e.isCorrect = wordData.isCorrect;
        e.blankIndex = wordData.blankIndex;
        e.y = this.findSpawnY(e);
        e.hp = 2;
        e.maxHp = 2;
        e.speedMult = 0.7 + Math.random() * 0.3;
        e.dying = false;
        e.dyingTimer = 0;
        e.flash = 0;
        const laneIdx = Math.floor(Math.random() * this.lanes.length);
        e.x = this.lanes[laneIdx];
        this.ctx.font = 'bold 15px "Hiragino Kaku Gothic ProN", sans-serif';
        e.width = this.ctx.measureText(e.text).width + 40;
    }

    updateHUD() {
        document.getElementById('score').textContent = this.score;
        const livesEl = document.getElementById('lives');
        livesEl.textContent = '♥'.repeat(Math.max(0, this.lives)) + '♡'.repeat(Math.max(0, 5 - this.lives));

        // タイマー表示
        if (this.gameStartTime > 0) {
            const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
            const min = Math.floor(elapsed / 60);
            const sec = elapsed % 60;
            document.getElementById('timer').textContent =
                `${min}:${sec.toString().padStart(2, '0')}`;
        }
    }

    // ========== MAIN LOOP ==========

    gameLoop() {
        if (this.loopId) clearInterval(this.loopId);
        this.loopId = setInterval(() => {
            if (!this.gameRunning) { clearInterval(this.loopId); return; }
            this.frameCount++;
            this.update();
            this.render();
            // HUDタイマーを毎秒更新
            if (this.frameCount % 60 === 0) this.updateHUD();
        }, 1000 / 60);
    }

    update() {
        this.player.x += (this.mouseX - this.player.x) * 0.15;
        this.player.y += (this.mouseY - this.player.y) * 0.15;

        if (this.shooting && !this.questionTransition) {
            this.shootTimer++;
            if (this.shootTimer >= this.shootInterval) {
                this.fireBullet();
                this.shootTimer = 0;
            }
        }

        // prepareWords() で初期配置済み、フレームアウト時に in-place 置換するため
        // スポーンタイマーは不要

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx;
            b.y += b.vy;

            b.trail.push({ x: b.x, y: b.y, life: 1 });
            if (b.trail.length > 5) b.trail.shift();
            b.trail.forEach(t => t.life -= 0.2);

            if (b.y < -20 || b.x < -20 || b.x > this.canvas.width + 20 || b.y > this.canvas.height + 20) {
                this.bullets.splice(i, 1);
                continue;
            }

            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                if (e.dying) continue;
                const ew = e.width;
                const eh = 40;
                if (b.x > e.x - ew / 2 - 4 && b.x < e.x + ew / 2 + 4 &&
                    b.y > e.y - eh / 2 - 4 && b.y < e.y + eh / 2 + 4) {
                    this.bullets.splice(i, 1);
                    this.hitEnemy(e);
                    break;
                }
            }
        }

        const baseFallSpeed = 0.8 + this.difficulty * 0.1;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];

            if (e.dying) {
                e.dyingTimer++;
                if (e.dyingTimer > 20) {
                    // 撃破後 → 画面外（上）から再登場
                    this.respawnEnemy(e);
                }
                continue;
            }

            e.y += baseFallSpeed * e.speedMult;

            if (e.y > this.canvas.height + 30) {
                // フレームアウト → 画面外（上）から再登場
                this.respawnEnemy(e);
            }
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.life -= 0.025;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const ex = this.explosions[i];
            ex.radius += 3;
            ex.alpha -= 0.05;
            if (ex.alpha <= 0) this.explosions.splice(i, 1);
        }

        if (this.comboDisplay.alpha > 0) {
            this.comboDisplay.alpha -= 0.012;
            this.comboDisplay.y -= 0.5;
        }
    }

    fireBullet() {
        const speed = 16;
        const spread = 6;

        this.bullets.push({
            x: this.player.x - spread,
            y: this.player.y - 20,
            vx: 0,
            vy: -speed,
            trail: []
        });
        this.bullets.push({
            x: this.player.x + spread,
            y: this.player.y - 20,
            vx: 0,
            vy: -speed,
            trail: []
        });

        this.shotsFired += 2;

        for (let i = 0; i < 3; i++) {
            this.particles.push({
                x: this.player.x + (Math.random() - 0.5) * 10,
                y: this.player.y - 20,
                vx: (Math.random() - 0.5) * 2,
                vy: -Math.random() * 3 - 1,
                life: 0.4,
                color: '#ffd700',
                size: Math.random() * 2 + 1
            });
        }
    }

    hitEnemy(enemy) {
        enemy.hp--;
        enemy.flash = 8;
        this.shotsHit++;

        for (let i = 0; i < 5; i++) {
            this.particles.push({
                x: enemy.x + (Math.random() - 0.5) * enemy.width * 0.5,
                y: enemy.y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 0.6,
                color: '#fff',
                size: Math.random() * 2 + 1
            });
        }

        if (enemy.hp <= 0) {
            this.destroyEnemy(enemy);
        }
    }

    destroyEnemy(enemy) {
        enemy.dying = true;
        enemy.dyingTimer = 0;

        const q = this.questions[this.currentQuestionIndex];
        const expected = q.blanks[this.currentBlankIndex];

        if (enemy.isCorrect && enemy.text === expected) {
            this.combo++;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;

            // スコア計算: 正規化ベース × コンボ倍率
            // basePointsはセット全体で7000点になるよう逆算済み
            const comboMult = Math.min(this.combo, 10);
            const points = Math.floor(this.basePoints * comboMult);
            this.score += points;

            // スピードボーナス（早く解くほど高得点、1秒ごとに差がつく）
            // speedBonusPerQはセット全体で3000点になるよう逆算済み
            if (this.currentBlankIndex === q.blanks.length - 1) {
                const qElapsed = (Date.now() - this.questionStartTime) / 1000;
                const timeLimit = 5 + q.blanks.length * 3;
                const remaining = timeLimit - qElapsed;
                if (remaining > 0) {
                    // 残り時間の割合 × この問題の配分（早いほど高い）
                    const ratio = remaining / timeLimit;
                    const speedBonus = Math.floor(this.speedBonusPerQ * ratio);
                    this.score += speedBonus;
                    this.comboDisplay.text = `SPEED! +${speedBonus}`;
                    this.comboDisplay.alpha = 1;
                    this.comboDisplay.y = this.canvas.height * 0.4;
                }
            }

            this.spawnExplosion(enemy.x, enemy.y, '#4caf50');
            this.spawnParticles(enemy.x, enemy.y, '#4caf50', 20);
            this.spawnParticles(enemy.x, enemy.y, '#ffd700', 10);

            document.querySelectorAll(`.blank-group-${this.currentBlankIndex}`).forEach(el => {
                el.textContent = enemy.text;
                el.classList.add('filled');
            });

            if (this.combo >= 2 && this.currentBlankIndex < q.blanks.length - 1) {
                this.comboDisplay.text = `${this.combo} COMBO! +${points}`;
                this.comboDisplay.alpha = 1;
                this.comboDisplay.y = this.canvas.height * 0.45;
            }

            this.currentBlankIndex++;
            if (this.currentBlankIndex >= q.blanks.length) {
                const qTime = Date.now() - this.questionStartTime;
                this.questionTimes.push(qTime);
                this.results.push({ question: q, correct: true, time: qTime });
                this.questionTransition = true;
                setTimeout(() => this.nextQuestion(), 1000);
            }
        } else {
            this.combo = 0;
            this.lives--;
            this.damageTaken++;
            this.spawnExplosion(enemy.x, enemy.y, '#ff6b6b');
            this.spawnParticles(enemy.x, enemy.y, '#ff6b6b', 15);

            if (this.lives <= 0) {
                const qTime = Date.now() - this.questionStartTime;
                this.results.push({ question: q, correct: false, time: qTime });
                setTimeout(() => this.endGame(), 600);
            }
        }

        this.updateHUD();
    }

    spawnExplosion(x, y, color) {
        this.explosions.push({ x, y, radius: 5, alpha: 0.9, color });
    }

    spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 1;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: Math.random() * 0.5 + 0.5,
                color,
                size: Math.random() * 3 + 1
            });
        }
    }

    nextQuestion() {
        this.currentQuestionIndex++;
        this.difficulty = 1 + this.currentQuestionIndex * 0.2;

        if (this.currentQuestionIndex >= this.questions.length) {
            this.endGame();
            return;
        }
        this.loadQuestion();
    }

    buildFilledText(q) {
        return this.renderQuestionHTML(q.text, q.blanks, true);
    }

    isTableFormat(text) {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) return false;
        const slashLines = lines.filter(l => (l.match(/／/g) || []).length >= 1);
        if (slashLines.length < 2) return false;
        const counts = slashLines.map(l => (l.match(/／/g) || []).length);
        return counts.every(c => c === counts[0]);
    }

    renderQuestionHTML(text, blanks, filled) {
        if (this.isTableFormat(text)) {
            return this.renderTableHTML(text, blanks, filled);
        }
        let html = text;
        blanks.forEach((blank, i) => {
            if (filled) {
                html = html.replaceAll(`{${i}}`, `<span class="filled-blank">【${blank}】</span>`);
            } else {
                html = html.replaceAll(`{${i}}`, `<span class="blank blank-group-${i}">　　　</span>`);
            }
        });
        return html;
    }

    renderTableHTML(text, blanks, filled) {
        const allLines = text.split('\n').filter(l => l.trim());
        const titleLines = [];
        const tableLines = [];
        for (const line of allLines) {
            if ((line.match(/／/g) || []).length >= 1) {
                tableLines.push(line);
            } else if (tableLines.length === 0) {
                titleLines.push(line);
            } else {
                tableLines.push(line);
            }
        }

        let html = '';
        if (titleLines.length > 0) {
            html += '<div class="q-table-title">' + titleLines.join('<br>') + '</div>';
        }

        html += '<table class="q-table">';
        tableLines.forEach((line, rowIdx) => {
            let trimmed = line.trim();
            if (trimmed.startsWith('／')) trimmed = trimmed.substring(1);
            if (trimmed.endsWith('／')) trimmed = trimmed.substring(0, trimmed.length - 1);
            const cells = trimmed.split('／');
            html += '<tr>';
            cells.forEach(cell => {
                const tag = rowIdx === 0 ? 'th' : 'td';
                let content = cell.trim();
                blanks.forEach((blank, i) => {
                    if (filled) {
                        content = content.replaceAll(`{${i}}`, `<span class="filled-blank">【${blank}】</span>`);
                    } else {
                        content = content.replaceAll(`{${i}}`, `<span class="blank blank-group-${i}">　　　</span>`);
                    }
                });
                html += `<${tag}>${content}</${tag}>`;
            });
            html += '</tr>';
        });
        html += '</table>';
        return html;
    }

    endGame() {
        this.gameRunning = false;
        if (this.loopId) clearInterval(this.loopId);

        const totalTime = Date.now() - this.gameStartTime;
        const totalTimeSec = Math.floor(totalTime / 1000);

        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('result-screen').classList.remove('hidden');

        const correctCount = this.results.filter(r => r.correct).length;
        const totalAsked = this.results.length;

        // === ボーナス計算 ===
        let bonusDetails = [];

        // タイムボーナス
        let timeBonus = 0;
        if (this.lives > 0) {
            if (totalTimeSec <= 60) { timeBonus = 5000; }
            else if (totalTimeSec <= 90) { timeBonus = 3000; }
            else if (totalTimeSec <= 120) { timeBonus = 1500; }
            else if (totalTimeSec <= 180) { timeBonus = 500; }
            if (timeBonus > 0) bonusDetails.push({ label: 'TIME BONUS', value: timeBonus });
        }

        // ノーミスボーナス
        let noMissBonus = 0;
        if (this.damageTaken === 0 && this.lives > 0) {
            noMissBonus = 3000;
            bonusDetails.push({ label: 'NO MISS BONUS', value: noMissBonus });
        }

        // 精度ボーナス
        let accuracyBonus = 0;
        const accuracy = this.shotsFired > 0 ? this.shotsHit / this.shotsFired : 0;
        if (accuracy >= 0.8 && this.shotsFired > 10) {
            accuracyBonus = 2000;
            bonusDetails.push({ label: `ACCURACY ${Math.floor(accuracy * 100)}%`, value: accuracyBonus });
        } else if (accuracy >= 0.6 && this.shotsFired > 10) {
            accuracyBonus = 800;
            bonusDetails.push({ label: `ACCURACY ${Math.floor(accuracy * 100)}%`, value: accuracyBonus });
        }

        // パーフェクトボーナス
        let perfectBonus = 0;
        if (correctCount === this.questions.length && this.damageTaken === 0 && totalTimeSec <= 120) {
            perfectBonus = 10000;
            bonusDetails.push({ label: 'PERFECT!', value: perfectBonus });
        }

        const totalBonus = timeBonus + noMissBonus + accuracyBonus + perfectBonus;
        const finalScore = this.score + totalBonus;
        this.score = finalScore;

        // セーブ
        if (this.playMode === 'sequential' && this.selectedCategory !== 'all' && this.lives > 0) {
            this.addClear(this.selectedCategory, this.setStart);
            const pool = this.getCategoryPool();
            let next = this.setStart + this.setSize;
            if (next >= pool.length) next = 0;
            this.saveProgress(this.selectedCategory, next);

            // ランキング保存
            const now = new Date();
            const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
            this.saveRanking(this.selectedCategory, this.setStart, {
                date: dateStr,
                score: finalScore,
                time: totalTimeSec,
                combo: this.maxCombo,
                accuracy: Math.floor(accuracy * 100),
                correct: correctCount,
                total: this.questions.length
            });
        }

        // 結果表示
        const titleEl = document.getElementById('result-title');
        if (this.lives <= 0) {
            titleEl.textContent = 'GAME OVER';
            titleEl.style.color = '#ff6b6b';
        } else if (perfectBonus > 0) {
            titleEl.textContent = 'PERFECT!!';
            titleEl.style.color = '#ffd700';
        } else if (correctCount === this.questions.length) {
            titleEl.textContent = 'ALL CLEAR!';
            titleEl.style.color = '#ffd700';
        } else {
            titleEl.textContent = 'MISSION COMPLETE!';
            titleEl.style.color = '#4caf50';
        }

        // スコア詳細
        const min = Math.floor(totalTimeSec / 60);
        const sec = totalTimeSec % 60;
        let scoreHtml = `SCORE: ${finalScore}<br>`;
        scoreHtml += `TIME: ${min}:${sec.toString().padStart(2, '0')}<br>`;
        scoreHtml += `MAX COMBO: ${this.maxCombo}<br>`;
        scoreHtml += `正解: ${correctCount} / ${totalAsked}`;

        if (bonusDetails.length > 0) {
            scoreHtml += '<div class="bonus-list">';
            for (const b of bonusDetails) {
                scoreHtml += `<div class="bonus-item">${b.label} <span class="bonus-value">+${b.value}</span></div>`;
            }
            scoreHtml += '</div>';
        }

        document.getElementById('result-score').innerHTML = scoreHtml;

        // ランキング表示（順番モードのみ）
        const rankingEl = document.getElementById('result-ranking');
        if (rankingEl) {
            if (this.playMode === 'sequential' && this.selectedCategory !== 'all') {
                const rankings = this.getRankings(this.selectedCategory, this.setStart);
                if (rankings.length > 0) {
                    let rankHtml = '<h3 class="ranking-title">RANKING</h3>';
                    rankHtml += '<div class="ranking-table">';
                    rankings.forEach((r, i) => {
                        const medal = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
                        const rMin = Math.floor(r.time / 60);
                        const rSec = r.time % 60;
                        rankHtml += `<div class="ranking-row${r.score === finalScore && r.date === rankings.find(x => x.score === finalScore)?.date ? ' ranking-current' : ''}">`;
                        rankHtml += `<span class="ranking-medal rank-${i + 1}">${medal}</span>`;
                        rankHtml += `<span class="ranking-score">${r.score}pt</span>`;
                        rankHtml += `<span class="ranking-time">${rMin}:${rSec.toString().padStart(2, '0')}</span>`;
                        rankHtml += `<span class="ranking-combo">x${r.combo}</span>`;
                        rankHtml += `<span class="ranking-date">${r.date}</span>`;
                        rankHtml += '</div>';
                    });
                    rankHtml += '</div>';
                    rankingEl.innerHTML = rankHtml;
                    rankingEl.classList.remove('hidden');
                } else {
                    rankingEl.classList.add('hidden');
                }
            } else {
                rankingEl.classList.add('hidden');
            }
        }

        // 問題詳細
        const detailEl = document.getElementById('result-detail');
        detailEl.innerHTML = '';

        const allQuestions = this.playMode === 'sequential' ? this.questions : null;
        const displayList = allQuestions || this.results.map(r => r.question);
        const resultMap = new Map(this.results.map(r => [r.question, r]));

        displayList.forEach(q => {
            const div = document.createElement('div');
            const result = resultMap.get(q);
            const wasAnswered = !!result;
            const correct = result ? result.correct : false;

            if (wasAnswered) {
                div.className = `result-item ${correct ? 'correct' : 'wrong'}`;
            } else {
                div.className = 'result-item wrong';
            }

            const mark = wasAnswered ? (correct ? '○' : '×') : '−';
            const diffLabel = this.getDifficultyLabel(q);
            const diffClass = diffLabel === '激ムズ' ? 'diff-extreme' : diffLabel === '難' ? 'diff-hard' : 'diff-normal';

            let timeStr = '';
            if (result && result.time) {
                const t = Math.floor(result.time / 1000);
                timeStr = `<span class="result-time">${t}秒</span>`;
            }

            div.innerHTML = `<div class="result-source">${q.source} <span class="result-diff ${diffClass}">${diffLabel}</span>${timeStr}</div><span class="result-mark">${mark}</span>${this.buildFilledText(q)}`;
            detailEl.appendChild(div);
        });
    }

    // ========== RENDERING ==========

    render() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        this.ctx.clearRect(0, 0, W, H);

        this.renderBackground(W, H);
        this.renderBullets();
        this.renderEnemies();
        this.renderExplosions();
        this.renderParticles();
        this.renderPlayer();
        this.renderCombo(W, H);
    }

    renderBackground(W, H) {
        const grad = this.ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#050518');
        grad.addColorStop(1, '#0a0a30');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, W, H);

        for (const star of this.bgStars) {
            const sx = star.x % W;
            const sy = star.y % H;
            this.ctx.globalAlpha = star.brightness;
            this.ctx.fillStyle = '#fff';
            this.ctx.beginPath();
            this.ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1;
    }

    renderPlayer() {
        const px = this.player.x;
        const py = this.player.y;
        const ctx = this.ctx;

        ctx.save();

        const engineGrad = ctx.createRadialGradient(px, py + 22, 0, px, py + 22, 14);
        engineGrad.addColorStop(0, 'rgba(0, 180, 255, 0.6)');
        engineGrad.addColorStop(0.5, 'rgba(0, 100, 255, 0.2)');
        engineGrad.addColorStop(1, 'rgba(0, 50, 255, 0)');
        ctx.fillStyle = engineGrad;
        ctx.beginPath();
        ctx.arc(px, py + 22, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#00bfff';
        ctx.beginPath();
        ctx.moveTo(px - 5, py + 18);
        ctx.lineTo(px, py + 28);
        ctx.lineTo(px + 5, py + 18);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#3a7bd5';
        ctx.beginPath();
        ctx.moveTo(px, py - 22);
        ctx.lineTo(px + 8, py - 5);
        ctx.lineTo(px + 6, py + 15);
        ctx.lineTo(px - 6, py + 15);
        ctx.lineTo(px - 8, py - 5);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#2a5db0';
        ctx.beginPath();
        ctx.moveTo(px - 6, py + 5);
        ctx.lineTo(px - 22, py + 18);
        ctx.lineTo(px - 18, py + 10);
        ctx.lineTo(px - 6, py - 2);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(px + 6, py + 5);
        ctx.lineTo(px + 22, py + 18);
        ctx.lineTo(px + 18, py + 10);
        ctx.lineTo(px + 6, py - 2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#7ec8e3';
        ctx.beginPath();
        ctx.ellipse(px, py - 8, 3, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = '#4a9eff';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = 'rgba(74, 158, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py - 22);
        ctx.lineTo(px + 8, py - 5);
        ctx.lineTo(px + 22, py + 18);
        ctx.moveTo(px, py - 22);
        ctx.lineTo(px - 8, py - 5);
        ctx.lineTo(px - 22, py + 18);
        ctx.stroke();

        ctx.restore();
    }

    renderBullets() {
        const ctx = this.ctx;
        for (const b of this.bullets) {
            for (const t of b.trail) {
                if (t.life <= 0) continue;
                ctx.globalAlpha = t.life * 0.3;
                ctx.fillStyle = '#00e5ff';
                ctx.beginPath();
                ctx.arc(t.x, t.y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            ctx.save();
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#00e5ff';
            ctx.beginPath();
            ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(b.x, b.y, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    renderEnemies() {
        const ctx = this.ctx;
        ctx.font = 'bold 15px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const e of this.enemies) {
            const w = e.width;
            const h = 38;
            const x = e.x - w / 2;
            const y = e.y - h / 2;

            ctx.save();

            if (e.dying) {
                const progress = e.dyingTimer / 20;
                ctx.globalAlpha = 1 - progress;
                ctx.translate(e.x, e.y);
                ctx.scale(1 + progress * 0.5, 1 + progress * 0.5);
                ctx.translate(-e.x, -e.y);
            }

            if (e.flash > 0) {
                e.flash--;
                ctx.shadowColor = '#fff';
                ctx.shadowBlur = 20;
            }

            const bodyGrad = ctx.createLinearGradient(x, y, x, y + h);
            bodyGrad.addColorStop(0, 'rgba(30, 30, 90, 0.92)');
            bodyGrad.addColorStop(1, 'rgba(15, 15, 60, 0.92)');
            ctx.fillStyle = bodyGrad;
            this.roundRect(ctx, x, y, w, h, 6);
            ctx.fill();

            const hpRatio = e.hp / e.maxHp;
            let borderColor = e.flash > 0 ? '#fff' : hpRatio <= 0.5 ? '#ff8a00' : '#5a5aff';
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 2;
            ctx.shadowColor = borderColor;
            ctx.shadowBlur = 8;
            this.roundRect(ctx, x, y, w, h, 6);
            ctx.stroke();

            ctx.shadowBlur = 0;
            const barW = w - 8;
            const barH = 3;
            const barX = x + 4;
            const barY = y + h - 8;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = hpRatio > 0.5 ? '#4caf50' : '#ff8a00';
            ctx.fillRect(barX, barY, barW * hpRatio, barH);

            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.fillText(e.text, e.x, e.y - 3);

            ctx.restore();
        }
    }

    renderExplosions() {
        const ctx = this.ctx;
        for (const ex of this.explosions) {
            ctx.save();
            ctx.globalAlpha = ex.alpha;
            const grad = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, ex.radius);
            grad.addColorStop(0, '#fff');
            grad.addColorStop(0.3, ex.color);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    renderParticles() {
        const ctx = this.ctx;
        for (const p of this.particles) {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    renderCombo(W, H) {
        if (this.comboDisplay.alpha <= 0) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = this.comboDisplay.alpha;
        ctx.font = 'bold 28px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 20;
        ctx.fillText(this.comboDisplay.text, W / 2, this.comboDisplay.y);
        ctx.restore();
    }

    roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}

const game = new Game();

// カスタム問題（Googleスプレッドシート）を非同期ロード
if (typeof customLoader !== 'undefined' && CUSTOM_CONFIG.sheetId) {
    customLoader.load().then(() => {
        if (customLoader.loaded) {
            game.buildCategoryButtons();
            game.buildSetButtons();
        }
    });
}
