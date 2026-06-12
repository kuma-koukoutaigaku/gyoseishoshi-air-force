class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.selectedCategory = 'all';
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
        this.laneCount = 5;

        // Timing
        this.enemySpawnTimer = 0;
        this.enemySpawnInterval = 120;
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

        let currentGroup = null;
        for (const [key, cat] of Object.entries(CATEGORIES)) {
            if (cat.group && cat.group !== currentGroup) {
                currentGroup = cat.group;
                const label = document.createElement('div');
                label.className = 'category-group-label' + (key.startsWith('custom_') ? ' custom-group' : '');
                label.textContent = `── ${cat.group} ──`;
                container.appendChild(label);
            } else if (!cat.group && currentGroup !== null) {
                currentGroup = null;
            }
            const btn = document.createElement('button');
            btn.className = 'category-btn' + (key.startsWith('custom_') ? ' custom-category' : '');
            btn.dataset.category = key;
            btn.textContent = cat.label;
            container.appendChild(btn);
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

            btn.innerHTML = label + hint + badge;

            if (clearCount > 0) {
                btn.classList.add('set-cleared');
            }

            container.appendChild(btn);
        }

        this.setStart = saved < total ? saved : 0;
    }

    getCategoryPool() {
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

        this.questions = this.getQuestions();
        if (this.questions.length === 0) return;

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

    loadQuestion() {
        this.currentBlankIndex = 0;
        this.enemies = [];
        this.bullets = [];
        this.questionTransition = false;

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

        this.wordPool = this.shuffle(this.wordPool);
        this.wordPoolIndex = 0;
        this.enemySpawnTimer = 0;
    }

    spawnEnemy() {
        if (this.wordPoolIndex >= this.wordPool.length) return;

        const wordData = this.wordPool[this.wordPoolIndex];
        this.wordPoolIndex++;

        this.ctx.font = 'bold 15px "Hiragino Kaku Gothic ProN", sans-serif';
        const textW = this.ctx.measureText(wordData.text).width + 40;

        const occupiedLanes = new Set();
        for (const e of this.enemies) {
            if (e.y < 200 && !e.dying) {
                let closest = 0;
                let minDist = Infinity;
                for (let li = 0; li < this.lanes.length; li++) {
                    const d = Math.abs(e.x - this.lanes[li]);
                    if (d < minDist) { minDist = d; closest = li; }
                }
                occupiedLanes.add(closest);
            }
        }

        let laneOptions = [];
        for (let i = 0; i < this.lanes.length; i++) {
            if (!occupiedLanes.has(i)) laneOptions.push(i);
        }
        if (laneOptions.length === 0) laneOptions = this.lanes.map((_, i) => i);

        const laneIdx = laneOptions[Math.floor(Math.random() * laneOptions.length)];
        const x = this.lanes[laneIdx];

        this.enemies.push({
            ...wordData,
            x,
            y: -30,
            width: textW,
            hp: 2,
            maxHp: 2,
            speedBonus: Math.random() * 0.15,
            dying: false,
            dyingTimer: 0,
            flash: 0
        });
    }

    updateHUD() {
        document.getElementById('score').textContent = this.score;
        const livesEl = document.getElementById('lives');
        livesEl.textContent = '♥'.repeat(Math.max(0, this.lives)) + '♡'.repeat(Math.max(0, 5 - this.lives));
    }

    // ========== MAIN LOOP ==========

    gameLoop() {
        if (this.loopId) clearInterval(this.loopId);
        this.loopId = setInterval(() => {
            if (!this.gameRunning) { clearInterval(this.loopId); return; }
            this.frameCount++;
            this.update();
            this.render();
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

        if (!this.questionTransition) {
            this.enemySpawnTimer++;
            const rate = Math.max(60, this.enemySpawnInterval - this.difficulty * 8);
            if (this.enemySpawnTimer >= rate) {
                this.spawnEnemy();
                this.enemySpawnTimer = 0;
            }
        }

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

        const fallSpeed = 0.7 + this.difficulty * 0.12;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];

            if (e.dying) {
                e.dyingTimer++;
                if (e.dyingTimer > 20) {
                    this.enemies.splice(i, 1);
                }
                continue;
            }

            e.y += fallSpeed + e.speedBonus;

            if (e.y > this.canvas.height + 30) {
                this.enemies.splice(i, 1);
            }
        }

        if (this.wordPoolIndex >= this.wordPool.length && !this.questionTransition) {
            this.wordPool = this.shuffle(this.wordPool);
            this.wordPoolIndex = 0;
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
            const points = 100 * Math.min(this.combo, 10);
            this.score += points;

            this.spawnExplosion(enemy.x, enemy.y, '#4caf50');
            this.spawnParticles(enemy.x, enemy.y, '#4caf50', 20);
            this.spawnParticles(enemy.x, enemy.y, '#ffd700', 10);

            document.querySelectorAll(`.blank-group-${this.currentBlankIndex}`).forEach(el => {
                el.textContent = enemy.text;
                el.classList.add('filled');
            });

            if (this.combo >= 2) {
                this.comboDisplay.text = `${this.combo} COMBO! +${points}`;
                this.comboDisplay.alpha = 1;
                this.comboDisplay.y = this.canvas.height * 0.45;
            }

            this.currentBlankIndex++;
            if (this.currentBlankIndex >= q.blanks.length) {
                this.results.push({ question: q, correct: true });
                this.questionTransition = true;
                setTimeout(() => this.nextQuestion(), 1000);
            }
        } else {
            this.combo = 0;
            this.lives--;
            this.spawnExplosion(enemy.x, enemy.y, '#ff6b6b');
            this.spawnParticles(enemy.x, enemy.y, '#ff6b6b', 15);

            if (this.lives <= 0) {
                this.results.push({ question: q, correct: false });
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
        // ／を含む行が2行以上あり、それらの／の数が同じなら表形式
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
        // ／を含む行と含まない行（タイトル）を分離
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
        // タイトル行があれば先に表示
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

        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('result-screen').classList.remove('hidden');

        const correctCount = this.results.filter(r => r.correct).length;
        const totalAsked = this.results.length;

        if (this.playMode === 'sequential' && this.selectedCategory !== 'all' && this.lives > 0) {
            this.addClear(this.selectedCategory, this.setStart);
            const pool = this.getCategoryPool();
            let next = this.setStart + this.setSize;
            if (next >= pool.length) next = 0;
            this.saveProgress(this.selectedCategory, next);
        }

        const titleEl = document.getElementById('result-title');
        if (this.lives <= 0) {
            titleEl.textContent = 'GAME OVER';
            titleEl.style.color = '#ff6b6b';
        } else if (correctCount === this.questions.length) {
            titleEl.textContent = 'PERFECT CLEAR!';
            titleEl.style.color = '#ffd700';
        } else {
            titleEl.textContent = 'MISSION COMPLETE!';
            titleEl.style.color = '#4caf50';
        }

        document.getElementById('result-score').innerHTML =
            `SCORE: ${this.score}<br>MAX COMBO: ${this.maxCombo}<br>正解: ${correctCount} / ${totalAsked}`;

        const detailEl = document.getElementById('result-detail');
        detailEl.innerHTML = '';

        const allQuestions = this.playMode === 'sequential' ? this.questions : null;
        const displayList = allQuestions || this.results.map(r => r.question);
        const resultMap = new Map(this.results.map(r => [r.question, r.correct]));

        displayList.forEach(q => {
            const div = document.createElement('div');
            const wasAnswered = resultMap.has(q);
            const correct = resultMap.get(q);

            if (wasAnswered) {
                div.className = `result-item ${correct ? 'correct' : 'wrong'}`;
            } else {
                div.className = 'result-item wrong';
            }

            const mark = wasAnswered ? (correct ? '○' : '×') : '−';
            div.innerHTML = `<div class="result-source">${q.source}</div><span class="result-mark">${mark}</span>${this.buildFilledText(q)}`;
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
