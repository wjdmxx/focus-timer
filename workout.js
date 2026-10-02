let exerciseConfig = {
    A: {
        name: '压',
        weight: 1,
        mode: 'time',
        options: [
            { seconds: 30, weight: 1 },
            { seconds: 60, weight: 3 },
            { seconds: 90, weight: 3 },
            { seconds: 120, weight: 1 }
        ]
    },
    B: {
        name: '耗',
        weight: 1,
        mode: 'time',
        options: [
            { seconds: 30, weight: 1 },
            { seconds: 45, weight: 2 },
            { seconds: 60, weight: 3 },
            { seconds: 90, weight: 2 },
            { seconds: 120, weight: 1 }
        ]
    },
    C: {
        name: '跳',
        weight: 1,
        mode: 'reps',
        options: [
            { reps: 16, seconds: 48, secondsPerRep: 3, weight: 1 },
            { reps: 32, seconds: 96, secondsPerRep: 3, weight: 1 },
            { reps: 64, seconds: 192, secondsPerRep: 3, weight: 1 }
        ]
    }
};

const restModeInput = document.getElementById('rest-mode');
const repProgressEl = document.getElementById('rep-progress');
let repProgressKey = '';
const restInput = document.getElementById('rest-seconds');
const prepareInput = document.getElementById('prepare-seconds');
const targetInput = document.getElementById('target-minutes');
const generateBtn = document.getElementById('generate-btn');
const regenerateBtn = document.getElementById('regenerate-btn');
const statsEl = document.getElementById('stats');
const planListEl = document.getElementById('plan-list');
const currentTypeEl = document.getElementById('current-type');
const timeDisplayEl = document.getElementById('time-display');
const currentNameEl = document.getElementById('current-name');
const progressBarEl = document.getElementById('progress-bar');
const sessionView = document.getElementById('session-view');
const upcomingListEl = document.getElementById('upcoming-list');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const skipBtn = document.getElementById('skip-btn');
const resetBtn = document.getElementById('reset-btn');
const configListEl = document.getElementById('config-list');
const configSummaryEl = document.getElementById('config-summary');
const addExerciseBtn = document.getElementById('add-exercise-btn');

let activities = [];
let timeline = [];
let currentIndex = 0;
let currentRemaining = 0;
let running = false;
let paused = false;
let timerId = null;
let audioCtx = null;
let stageStartedAt = 0;
let soundTimerId = null;
let stageCues = [];
let nextCue = 0;
let sessionOpen = false;
let wakeLock = null;
const activeSounds = new Set();

function getExerciseTypes() {
    return Object.keys(exerciseConfig);
}

function createDefaultOption(mode) {
    return mode === 'reps'
        ? { reps: 10, seconds: 30, secondsPerRep: 3, weight: 1 }
        : { seconds: 30, weight: 1 };
}

function nextExerciseId() {
    const used = new Set(getExerciseTypes());
    for (let code = 65; code <= 90; code++) {
        const id = String.fromCharCode(code);
        if (!used.has(id)) return id;
    }
    return `X${getExerciseTypes().length + 1}`;
}

function renderConfig() {
    const types = getExerciseTypes();
    configSummaryEl.textContent = `${types.length} 类`;
    configListEl.innerHTML = types.map((type) => {
        const config = exerciseConfig[type];
        const optionLabel = config.mode === 'reps' ? '次数 / 每次耗时（秒）' : '时间分布（秒）';
        return `
            <div class="exercise-config" data-mode="${config.mode}" data-type="${type}">
                <div class="config-top">
                    <label class="config-label">运动名称<input data-field="name" value="${escapeHtml(config.name)}" maxlength="12"></label>
                    <label class="config-label">占比权重<input data-field="weight" type="number" min="0" max="100" step="0.1" value="${config.weight}"></label>
                    <button class="icon-btn remove-exercise" type="button" title="删除运动" aria-label="删除运动">×</button>
                </div>
                <div class="config-fields">
                    <label class="config-label">规则类型<select data-field="mode">
                        <option value="time" ${config.mode === 'time' ? 'selected' : ''}>按时间</option>
                        <option value="reps" ${config.mode === 'reps' ? 'selected' : ''}>按次数</option>
                    </select></label>
                </div>
                <div class="options-heading"><span>${optionLabel}</span><button class="text-btn add-option" type="button">＋ 添加一项</button></div>
                <div class="option-list">${config.options.map((option, index) => `
                    <div class="option-row" data-option-index="${index}">
                        ${config.mode === 'reps' ? `<label class="config-label">次数<input data-option-field="reps" type="number" min="1" max="999" value="${option.reps || 1}"></label>` : '<div></div>'}
                        <label class="config-label">${config.mode === 'reps' ? '每次（秒）' : '时长（秒）'}<input data-option-field="seconds" type="number" min="${config.mode === 'reps' ? '0.4' : '1'}" max="3600" step="${config.mode === 'reps' ? '0.1' : '1'}" value="${config.mode === 'reps' ? (option.secondsPerRep || option.seconds / (option.reps || 1)) : option.seconds}"></label>
                        <label class="config-label">权重<input data-option-field="weight" type="number" min="0" max="100" step="0.1" value="${option.weight}"></label>
                        <button class="remove-option" type="button" title="删除此项" aria-label="删除此项">×</button>
                    </div>`).join('')}</div>
            </div>
        `;
    }).join('');
}

function readConfigFromDom() {
    const nextConfig = {};
    configListEl.querySelectorAll('.exercise-config').forEach((card) => {
        const type = card.dataset.type;
        const field = (name) => card.querySelector(`[data-field="${name}"]`);
        const mode = field('mode').value;
        const sourceMode = card.dataset.mode;
        const options = [...card.querySelectorAll('.option-row')].map((row) => {
            const reps = numberInRange(row.querySelector('[data-option-field="reps"]')?.value, 1, 999, 10, true);
            const inputSeconds = numberInRange(row.querySelector('[data-option-field="seconds"]').value, sourceMode === 'reps' ? 0.4 : 1, 3600, 3);
            const secondsPerRep = sourceMode === 'reps' ? inputSeconds : 3;
            return {
                ...(mode === 'reps' ? { reps, secondsPerRep } : {}),
                seconds: mode === 'reps' ? reps * secondsPerRep : (sourceMode === 'reps' ? reps * inputSeconds : inputSeconds),
                weight: numberInRange(row.querySelector('[data-option-field="weight"]').value, 0, 100, 1)
            };
        });
        nextConfig[type] = {
            name: field('name').value.trim() || `运动${type}`,
            weight: numberInRange(field('weight').value, 0, 100, 1),
            mode,
            options: options.length > 0 ? options : [createDefaultOption(mode)]
        };
    });
    exerciseConfig = nextConfig;
}

function weightedPick(options) {
    const total = options.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of options) {
        roll -= item.weight;
        if (roll <= 0) return item;
    }
    return options[options.length - 1];
}

function shuffle(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function formatTime(seconds) {
    const safe = Math.max(0, Math.round(seconds));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatReadable(seconds) {
    const safe = Math.max(0, Math.round(seconds));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    if (m > 0 && s > 0) return `${m}分${s}秒`;
    if (m > 0) return `${m}分钟`;
    return `${s}秒`;
}

function buildTypePlan(type, targetSeconds) {
    const config = exerciseConfig[type];
    const min = targetSeconds * 0.9;
    const max = targetSeconds * 1.1;
    let best = null;

    for (let attempt = 0; attempt < 2000; attempt++) {
        const items = [];
        let total = 0;
        const guardLimit = Math.max(max + 240, targetSeconds + 420);

        while (total < min && total < guardLimit) {
            const picked = weightedPick(config.options.filter(option => option.weight > 0));
            const item = {
                type,
                kind: 'exercise',
                name: config.name,
                seconds: picked.seconds,
                reps: config.mode === 'reps' ? picked.reps : null,
                secondsPerRep: config.mode === 'reps' ? picked.secondsPerRep : null
            };
            items.push(item);
            total += item.seconds;
        }

        const diff = Math.abs(total - targetSeconds);
        const candidate = { items, total, diff };
        if (!best || candidate.diff < best.diff) best = candidate;
        if (total >= min && total <= max) return candidate;
    }

    return best;
}

function readRestSettings() {
    if (restModeInput.value !== 'random') {
        const seconds = numberInRange(restInput.value, 0, 600, 30, true);
        restInput.value = seconds;
        return { min: seconds, max: seconds };
    }
    const minInput = document.getElementById('rest-min-seconds');
    const maxInput = document.getElementById('rest-max-seconds');
    const first = numberInRange(minInput.value, 0, 600, 30, true);
    const second = numberInRange(maxInput.value, 0, 600, 60, true);
    const min = Math.min(first, second);
    const max = Math.max(first, second);
    minInput.value = min;
    maxInput.value = max;
    return { min, max };
}

function pickRestSeconds({ min, max }) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function updateRestFields() {
    const random = restModeInput.value === 'random';
    document.getElementById('random-rest-fields').hidden = !random;
    document.getElementById('fixed-rest-fields').hidden = random;
}

restModeInput.addEventListener('change', updateRestFields);
updateRestFields();

function createPlan() {
    const minutes = Math.max(1, Math.min(120, Number(targetInput.value) || 10));
    targetInput.value = minutes;

    const targetSeconds = minutes * 60;
    readConfigFromDom();
    renderConfig();
    const activeTypes = getExerciseTypes().filter((type) => exerciseConfig[type].weight > 0 && exerciseConfig[type].options.some(option => option.weight > 0));
    if (activeTypes.length === 0) {
        alert('请至少保留一种运动，并将它的占比权重设为大于 0。');
        return;
    }
    const byType = activeTypes.map((type) => ({
        type,
        ...buildTypePlan(type, targetSeconds * exerciseConfig[type].weight)
    }));

    const restSettings = readRestSettings();
    const prepareSeconds = numberInRange(prepareInput.value, 0, 120, 5, true);
    prepareInput.value = prepareSeconds;
    activities = shuffle(byType.flatMap((group) => group.items));
    timeline = [];
    activities.forEach((item, index) => {
        item.group = index + 1;
        if (prepareSeconds > 0) timeline.push({ type: item.type, kind: 'prepare', name: item.name, seconds: prepareSeconds, group: item.group });
        timeline.push(item);
        const restSeconds = index < activities.length - 1 ? pickRestSeconds(restSettings) : 0;
        if (restSeconds > 0) {
            timeline.push({
                type: 'rest',
                kind: 'rest',
                name: '休息',
                seconds: restSeconds,
                group: item.group
            });
        }
    });

    renderStats(byType, targetSeconds);
    renderPlan();
    resetTimerState();
    document.getElementById('plan-summary').textContent = `${activities.length} 组运动`;
    document.getElementById('plan-total').textContent = formatReadable(timeline.reduce((sum, item) => sum + item.seconds, 0));
    startBtn.disabled = false;
    regenerateBtn.disabled = false;
    resetBtn.disabled = false;
}

function renderStats(byType, targetSeconds) {
    const restTotal = timeline.filter((item) => item.kind === 'rest')
        .reduce((sum, item) => sum + item.seconds, 0);
    const exerciseTotal = byType.reduce((sum, group) => sum + group.total, 0);
    const stats = byType.map((group) => {
        const pct = Math.round((group.total / targetSeconds) * 100);
        return {
            label: exerciseConfig[group.type].name,
            value: `${formatReadable(group.total)}（${pct}%）`
        };
    });

    stats.push({ label: '运动合计', value: formatReadable(exerciseTotal) });
    stats.push({ label: '休息合计', value: formatReadable(restTotal) });
    stats.push({ label: '准备合计', value: formatReadable(timeline.filter(item => item.kind === 'prepare').reduce((sum, item) => sum + item.seconds, 0)) });

    statsEl.innerHTML = stats.map((item) => `
        <div class="stat">
            <div class="stat-label">${escapeHtml(item.label)}</div>
            <div class="stat-value">${item.value}</div>
        </div>
    `).join('');
}


function numberInRange(value, min, max, fallback, integer = false) {
    const parsed = value === '' || value == null ? fallback : Number(value);
    const safe = Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
    return integer ? Math.round(safe) : safe;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function itemDescription(item) {
    if (item.kind === 'rest') return '休息';
    if (item.kind === 'prepare') return `准备 ${item.name}`;
    return item.name;
}

function renderPlan() {
    planListEl.innerHTML = timeline.filter(item => item.kind !== 'prepare').map(item => `
        <div class="plan-item">
            <div class="badge">${item.kind === 'exercise' ? String(item.group).padStart(2, '0') : ''}</div>
            <div><div class="item-title">${escapeHtml(itemDescription(item))}</div></div>
            <div class="item-time">${item.reps ? `${item.reps} 次` : formatTime(item.seconds)}</div>
        </div>`).join('') || '<div class="empty">暂无计划</div>';
}

function renderUpcoming() {
    const upcoming = timeline.slice(currentIndex + 1).filter(item => item.kind === 'exercise');
    document.getElementById('upcoming-count').textContent = `${upcoming.length} 组`;
    upcomingListEl.innerHTML = upcoming.slice(0, 3).map(item => `
        <div class="upcoming-item">
            <span class="upcoming-number" aria-label="第 ${item.group} 组">${String(item.group).padStart(2, '0')}</span>
            <div class="item-title">${escapeHtml(item.name)}</div>
            <span class="upcoming-value">${item.reps ? `${item.reps} 次` : formatTime(item.seconds)}</span>
        </div>`).join('') || `<div class="empty">${running ? '最后一组' : '已结束'}</div>`;
    if (upcoming.length > 3) upcomingListEl.innerHTML += `<p class="section-note">还有 ${upcoming.length - 3} 组</p>`;
}

function showSession(show) {
    sessionOpen = show;
    sessionView.hidden = !show;
    document.getElementById('setup-view').hidden = show;
    document.getElementById('setup-heading').hidden = show;
    window.scrollTo(0, 0);
    if (show) pauseBtn.focus();
    else startBtn.focus();
}

async function acquireWakeLock() {
    if (!running || paused || document.visibilityState !== 'visible' || !navigator.wakeLock || wakeLock) return;
    try {
        const lock = await navigator.wakeLock.request('screen');
        if (!running || paused) { await lock.release(); return; }
        wakeLock = lock;
        lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
    } catch { /* Screen wake lock is optional. */ }
}

function releaseWakeLock() {
    const lock = wakeLock;
    wakeLock = null;
    if (lock) lock.release().catch(() => {});
}

function resetTimerState() {
    stopTicker();
    cancelSounds();
    releaseWakeLock();
    running = false;
    paused = false;
    currentIndex = 0;
    currentRemaining = timeline[0]?.seconds || 0;
    stageCues = [];
    nextCue = 0;
    pauseBtn.textContent = '暂停';
    pauseBtn.disabled = true;
    skipBtn.disabled = true;
    startBtn.disabled = timeline.length === 0;
    if (sessionOpen) showSession(false);
}

function ensureAudio() {
    try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) throw new Error('Audio unavailable');
        if (!audioCtx) audioCtx = new Audio();
        const resumed = audioCtx.state === 'suspended' ? audioCtx.resume() : Promise.resolve();
        return resumed.then(() => {
            document.getElementById('sound-status').textContent = audioCtx.state === 'running' ? '' : '声音暂不可用，请暂停后继续以启用声音。';
        }).catch(() => { document.getElementById('sound-status').textContent = '声音暂不可用，请暂停后继续以启用声音。'; });
    } catch {
        document.getElementById('sound-status').textContent = '此浏览器暂不支持提示音，可跟随屏幕上的节拍运动。';
    }
}

function beep(frequency = 1046, duration = 0.16, volume = 0.16, delay = 0) {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const at = audioCtx.currentTime + Math.max(0, delay);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    activeSounds.add(osc);
    osc.onended = () => { activeSounds.delete(osc); osc.disconnect(); gain.disconnect(); };
    osc.start(at);
    osc.stop(at + duration + 0.01);
}

function cancelSounds() {
    for (const osc of activeSounds) {
        try { osc.stop(); } catch { /* Already ended. */ }
    }
    activeSounds.clear();
}

// Audio timestamps are scheduled ahead on the audio clock, independently of rendering.
// A rep has a light beat halfway through, then a heavy beat on completion.
function makeCues(item) {
    const cues = [];
    if (item.kind !== 'exercise') return cues;
    if (item.reps) {
        for (let rep = 0; rep < item.reps; rep++) {
            cues.push({ at: (rep + 0.5) * item.secondsPerRep, frequency: 740, duration: 0.07, volume: 0.09 });
            cues.push({ at: (rep + 1) * item.secondsPerRep, frequency: 1046, duration: 0.12, volume: 0.23, final: rep === item.reps - 1 });
        }
    } else {
        for (let quarter = 1; quarter <= 3; quarter++) {
            for (let bell = 0; bell < quarter; bell++) {
                cues.push({ at: item.seconds * quarter / 4 + bell * Math.min(0.22, item.seconds / 16), frequency: 1046, duration: Math.min(0.14, item.seconds / 20), volume: 0.16 });
            }
        }
    }
    return cues;
}

let finalBeatScheduled = false;

function scheduleAudio(now) {
    const elapsed = (now - stageStartedAt) / 1000;
    while (nextCue < stageCues.length && stageCues[nextCue].at <= elapsed + 0.1) {
        const cue = stageCues[nextCue++];
        // Do not replay a backlog of beats after a sleeping or throttled tab resumes.
        if (cue.at < elapsed - 0.12) continue;
        beep(cue.frequency, cue.duration, cue.volume, cue.at - elapsed);
        if (cue.final) finalBeatScheduled = true;
    }
}

function enterStage(now, playTransition = true) {
    const item = timeline[currentIndex];
    stageStartedAt = now;
    currentRemaining = item.seconds;
    stageCues = makeCues(item);
    nextCue = 0;
    finalBeatScheduled = false;
    if (playTransition && !paused) beep();
    renderUpcoming();
}

function startTimer() {
    if (timeline.length === 0 || running) return;
    const audioReady = ensureAudio();
    const waitingForAudio = audioCtx?.state === 'suspended';
    running = true;
    paused = false;
    currentIndex = 0;
    pauseBtn.disabled = false;
    skipBtn.disabled = false;
    pauseBtn.textContent = '暂停';
    startBtn.disabled = true;
    resetBtn.textContent = '结束';
    const startedAt = performance.now();
    enterStage(startedAt);
    if (waitingForAudio) {
        Promise.resolve(audioReady).then(() => {
            if (running && !paused && currentIndex === 0 && stageStartedAt === startedAt) beep();
        });
    }
    showSession(true);
    acquireWakeLock();
    startTicker();
}

function startTicker() {
    stopTicker();
    soundTimerId = setInterval(() => syncTime(performance.now()), 25);
    tick();
}

function stopTicker() {
    if (timerId !== null) cancelAnimationFrame(timerId);
    if (soundTimerId !== null) clearInterval(soundTimerId);
    timerId = null;
    soundTimerId = null;
}

function syncTime(now) {
    if (!running || paused) return;
    scheduleAudio(now);
    let crossed = false;
    let transitionAlreadySounded = false;
    while (currentIndex < timeline.length && now >= stageStartedAt + timeline[currentIndex].seconds * 1000) {
        const end = stageStartedAt + timeline[currentIndex].seconds * 1000;
        transitionAlreadySounded = finalBeatScheduled && now - end < 150;
        currentIndex++;
        crossed = true;
        if (currentIndex >= timeline.length) {
            if (!transitionAlreadySounded) beep();
            finishTimer();
            return;
        }
        // Preserve overflow across every stage; time never drifts with frame rate.
        stageStartedAt = end;
        stageCues = makeCues(timeline[currentIndex]);
        nextCue = 0;
        finalBeatScheduled = false;
    }
    if (crossed) {
        if (!transitionAlreadySounded) beep();
        renderUpcoming();
    }
    currentRemaining = Math.max(0, timeline[currentIndex].seconds - (now - stageStartedAt) / 1000);
    scheduleAudio(now);
}

function tick() {
    if (!running || paused) return;
    syncTime(performance.now());
    updateCurrentDisplay();
    if (running && !paused) timerId = requestAnimationFrame(tick);
}

function finishTimer() {
    stopTicker();
    releaseWakeLock();
    running = false;
    paused = false;
    currentIndex = timeline.length;
    currentRemaining = 0;
    pauseBtn.disabled = true;
    skipBtn.disabled = true;
    startBtn.disabled = false;
    resetBtn.textContent = '返回计划';
    updateCurrentDisplay();
    renderUpcoming();
    resetBtn.focus();
}

function togglePause() {
    if (!running) return;
    if (!paused) {
        syncTime(performance.now());
        if (!running) return;
        paused = true;
        stopTicker();
        cancelSounds();
        releaseWakeLock();
    } else {
        ensureAudio();
        paused = false;
        const elapsed = timeline[currentIndex].seconds - currentRemaining;
        stageStartedAt = performance.now() - elapsed * 1000;
        nextCue = stageCues.findIndex(cue => cue.at > elapsed);
        if (nextCue < 0) nextCue = stageCues.length;
        finalBeatScheduled = false;
        acquireWakeLock();
        startTicker();
    }
    pauseBtn.textContent = paused ? '继续' : '暂停';
    updateCurrentDisplay();
}

function skipCurrent() {
    if (!running || currentIndex >= timeline.length) return;
    cancelSounds();
    currentIndex++;
    if (currentIndex >= timeline.length) {
        if (!paused) beep();
        finishTimer();
        return;
    }
    enterStage(performance.now());
    updateCurrentDisplay();
}

function renderRepProgress(item, done = 0) {
    const isReps = item?.kind === 'exercise' && Boolean(item.reps);
    sessionView.classList.toggle('reps-mode', isReps);
    repProgressEl.hidden = !isReps;
    document.getElementById('time-progress').hidden = isReps;
    if (!isReps) {
        repProgressKey = '';
        return;
    }
    const key = `${currentIndex}:${item.reps}:${done}`;
    if (key === repProgressKey) return;
    repProgressKey = key;
    repProgressEl.innerHTML = Array.from({ length: item.reps }, (_, index) =>
        `<span class="rep-block${index < done ? ' done' : ''}"></span>`
    ).join('');
    // Keep the most recently completed row visible for unusually long sets.
    const completedBlock = repProgressEl.children?.[Math.max(0, done - 1)];
    if (completedBlock) {
        const rowBottom = completedBlock.offsetTop - repProgressEl.offsetTop + completedBlock.offsetHeight;
        repProgressEl.scrollTop = Math.max(0, rowBottom - repProgressEl.clientHeight);
    }
}

function updateCurrentDisplay() {
    const item = timeline[currentIndex];
    const finished = currentIndex >= timeline.length;
    const remaining = currentRemaining + timeline.slice(currentIndex + 1).reduce((sum, stage) => sum + stage.seconds, 0);
    document.getElementById('session-progress-label').textContent = finished ? '已结束' : `${item.group} / ${activities.length} 组`;
    document.getElementById('session-remaining').textContent = finished ? '' : `剩余 ${formatTime(Math.ceil(remaining))}`;
    document.getElementById('beat-display').hidden = !item?.reps;
    document.getElementById('rep-count').hidden = !item?.reps;
    renderRepProgress(item, item?.reps ? Math.min(item.reps, Math.floor((item.seconds - currentRemaining + 1e-7) / item.secondsPerRep)) : 0);
    if (!item) {
        currentTypeEl.textContent = '完成';
        currentNameEl.textContent = '运动结束';
        timeDisplayEl.textContent = '00:00';
        progressBarEl.style.width = '100%';
        return;
    }
    const elapsed = Math.max(0, item.seconds - currentRemaining);
    currentTypeEl.textContent = paused ? '已暂停' : item.kind === 'rest' ? '休息中' : item.kind === 'prepare' ? '准备' : '进行中';
    const next = timeline.slice(currentIndex + 1).find(stage => stage.kind === 'exercise');
    currentNameEl.textContent = item.kind === 'rest' ? (next ? `下一组 ${next.name}` : '休息') : item.name;
    timeDisplayEl.textContent = formatTime(Math.ceil(currentRemaining));
    progressBarEl.style.width = `${Math.min(100, elapsed / item.seconds * 100)}%`;
    if (item.reps) {
        const done = Math.min(item.reps, Math.floor((elapsed + 1e-7) / item.secondsPerRep));
        document.getElementById('rep-count').textContent = `${done} / ${item.reps} 次`;
        const phase = elapsed % item.secondsPerRep;
        document.getElementById('light-beat').classList.toggle('active', !paused && phase >= item.secondsPerRep / 2);
        document.getElementById('heavy-beat').classList.toggle('active', !paused && done > 0 && phase < item.secondsPerRep / 2);
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && running && !paused) {
        syncTime(performance.now());
        updateCurrentDisplay();
        acquireWakeLock();
    }
});

generateBtn.addEventListener('click', createPlan);
regenerateBtn.addEventListener('click', createPlan);
startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', togglePause);
skipBtn.addEventListener('click', skipCurrent);
resetBtn.addEventListener('click', resetTimerState);

configListEl.addEventListener('change', (event) => {
    if (event.target.matches('[data-field="mode"]')) {
        readConfigFromDom();
        renderConfig();
    }
});

configListEl.addEventListener('click', (event) => {
    const card = event.target.closest('.exercise-config');
    if (!card) return;

    if (event.target.closest('.remove-exercise')) {
        if (getExerciseTypes().length <= 1) {
            alert('至少保留一种运动。');
            return;
        }
        readConfigFromDom();
        delete exerciseConfig[card.dataset.type];
        renderConfig();
        return;
    }

    if (event.target.closest('.add-option')) {
        readConfigFromDom();
        exerciseConfig[card.dataset.type].options.push(createDefaultOption(exerciseConfig[card.dataset.type].mode));
        renderConfig();
        return;
    }

    if (event.target.closest('.remove-option')) {
        const rows = card.querySelectorAll('.option-row');
        if (rows.length <= 1) {
            alert('每种运动至少保留一项时间规则。');
            return;
        }
        readConfigFromDom();
        exerciseConfig[card.dataset.type].options.splice(Number(event.target.closest('.option-row').dataset.optionIndex), 1);
        renderConfig();
    }
});

addExerciseBtn.addEventListener('click', () => {
    readConfigFromDom();
    const type = nextExerciseId();
    exerciseConfig[type] = {
        name: '新运动',
        weight: 1,
        mode: 'time',
        options: [createDefaultOption('time')]
    };
    renderConfig();
});

renderConfig();

function markPlanDirty() {
    if (!timeline.length) return;
    startBtn.disabled = true;
    document.getElementById('plan-summary').textContent = '配置已修改，请重新生成计划。';
}

document.getElementById('setup-view').addEventListener('input', markPlanDirty);
document.getElementById('setup-view').addEventListener('change', markPlanDirty);
configListEl.addEventListener('click', event => {
    if (event.target.closest('button')) markPlanDirty();
});
addExerciseBtn.addEventListener('click', markPlanDirty);
