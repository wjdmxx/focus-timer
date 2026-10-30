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
const restSwitchEl = document.getElementById('rest-switch');
const repProgressEl = document.getElementById('rep-progress');
let repProgressKey = '';
const restInput = document.getElementById('rest-seconds');
const prepareInput = document.getElementById('prepare-seconds');
const targetInput = document.getElementById('target-minutes');
const regenerateBtn = document.getElementById('regenerate-btn');
const planRingEl = document.getElementById('plan-ring');
const stripEl = document.getElementById('session-strip');
const dockEl = document.getElementById('dock');
const dockFadeEl = document.getElementById('dock-fade');
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
let endPrimedTimer = null;
let completedSeconds = 0;
let lastSnapshotAt = 0;
let resumedSession = false;
const activeSounds = new Set();

// 运动专用色，避开准备（黄）和休息（青）。
const EXERCISE_COLORS = ['rgb(48, 209, 88)', 'rgb(255, 146, 48)', 'rgb(0, 145, 255)', 'rgb(255, 55, 95)', 'rgb(191, 90, 242)', 'rgb(0, 218, 195)', 'rgb(172, 142, 104)'];
const PREPARE_COLOR = 'rgb(255, 214, 0)';
const REST_COLOR = 'rgb(60, 211, 254)';

function getExerciseTypes() {
    return Object.keys(exerciseConfig);
}

function exerciseColor(type) {
    const index = Math.max(0, getExerciseTypes().indexOf(type));
    return EXERCISE_COLORS[index % EXERCISE_COLORS.length];
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

const XMARK_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';

function renderOptions(config) {
    return config.options.map((option, index) => `
        <div class="option-row" data-option-index="${index}">
            ${config.mode === 'reps' ? `<label class="config-label"><span>次数</span><input data-option-field="reps" type="number" inputmode="numeric" min="1" max="999" value="${option.reps || 1}"></label>` : ''}
            <label class="config-label"><span>${config.mode === 'reps' ? '每次（秒）' : '时长（秒）'}</span><input data-option-field="seconds" type="number" inputmode="decimal" min="${config.mode === 'reps' ? '0.4' : '1'}" max="3600" step="${config.mode === 'reps' ? '0.1' : '1'}" value="${config.mode === 'reps' ? (option.secondsPerRep || option.seconds / (option.reps || 1)) : option.seconds}"></label>
            <label class="config-label"><span>权重</span><input data-option-field="weight" type="number" inputmode="decimal" min="0" max="100" step="0.1" value="${option.weight}"></label>
            <button class="icon-btn remove-option" type="button" title="删除此项" aria-label="删除此项">${XMARK_ICON}</button>
        </div>`).join('');
}

function renderConfig() {
    const types = getExerciseTypes();
    configListEl.innerHTML = types.map((type) => {
        const config = exerciseConfig[type];
        return `
            <div class="group exercise-config" data-mode="${config.mode}" data-type="${type}" style="--c: ${exerciseColor(type)}">
                <div class="config-top">
                    <div class="config-title"><input class="config-name" data-field="name" value="${escapeHtml(config.name)}" maxlength="12" aria-label="项目名称"></div>
                    <label class="meta-field">份数<input data-field="weight" type="number" inputmode="decimal" min="0" max="100" step="0.1" value="${config.weight}"></label>
                    <button class="icon-btn remove-exercise" type="button" title="删除项目" aria-label="删除项目">${XMARK_ICON}</button>
                </div>
                <div class="rule-row">
                    <div class="segmented rule-switch" role="group" aria-label="规则">
                        <input type="hidden" data-field="mode" value="${config.mode}">
                        <button class="rule-btn${config.mode === 'time' ? ' active' : ''}" type="button" data-mode-value="time">按时间</button>
                        <button class="rule-btn${config.mode === 'reps' ? ' active' : ''}" type="button" data-mode-value="reps">按次数</button>
                    </div>
                </div>
                <div class="option-list">${renderOptions(config)}</div>
                <button class="add-option" type="button">添加一项</button>
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
            const inputSeconds = numberInRange(row.querySelector('[data-option-field="seconds"]').value, sourceMode === 'reps' ? 0.4 : 1, 3600, 3);
            // 从按时间切到按次数时，按默认节奏把时长换算成次数。
            const reps = numberInRange(row.querySelector('[data-option-field="reps"]')?.value, 1, 999, Math.round(inputSeconds / 3), true);
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
    restSwitchEl.querySelectorAll('button').forEach((button) => {
        button.classList.toggle('active', button.dataset.value === restModeInput.value);
    });
}

restSwitchEl.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.dataset.value === restModeInput.value) return;
    restModeInput.value = button.dataset.value;
    updateRestFields();
    refreshPlan();
});
updateRestFields();

function createPlan() {
    const minutes = Math.max(1, Math.min(120, Number(targetInput.value) || 10));
    targetInput.value = minutes;

    const targetSeconds = minutes * 60;
    readConfigFromDom();
    const activeTypes = getExerciseTypes().filter((type) => exerciseConfig[type].weight > 0 && exerciseConfig[type].options.some(option => option.weight > 0));
    if (activeTypes.length === 0) {
        clearPlan();
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
    document.getElementById('plan-summary').textContent = `${activities.length} 组`;
    setClock(document.getElementById('plan-total'), formatTime(timeline.reduce((sum, item) => sum + item.seconds, 0)));
    renderPlanRing(byType);
    startBtn.disabled = false;
    resetBtn.disabled = false;
}

function clearPlan() {
    activities = [];
    timeline = [];
    statsEl.innerHTML = '';
    renderPlan();
    resetTimerState();
    document.getElementById('plan-summary').textContent = '';
    setClock(document.getElementById('plan-total'), '00:00');
    renderPlanRing([]);
}

// 环按项目时长分段，段间留出与圆头相称的缺口。
function renderPlanRing(byType) {
    const total = byType.reduce((sum, group) => sum + group.total, 0);
    const gap = byType.length > 1 ? 0.052 : 0;
    const existing = [...planRingEl.querySelectorAll('.ring-part')];
    if (existing.length !== byType.length) {
        existing.forEach(part => part.remove());
        planRingEl.insertAdjacentHTML('beforeend', byType.map(() => '<circle class="ring-part" cx="100" cy="100" r="94" pathLength="1"></circle>').join(''));
    }

    // 复用已有的弧段，重新随机时才能平滑变形。
    let offset = 0;
    [...planRingEl.querySelectorAll('.ring-part')].forEach((part, index) => {
        const group = byType[index];
        const share = group.total / total;
        part.setAttribute('stroke', exerciseColor(group.type));
        part.setAttribute('stroke-dasharray', `${Math.max(0.004, share - gap).toFixed(4)} 1`);
        part.setAttribute('stroke-dashoffset', (-(offset + gap / 2)).toFixed(4));
        offset += share;
    });
}

function renderStats(byType, targetSeconds) {
    const restTotal = timeline.filter((item) => item.kind === 'rest')
        .reduce((sum, item) => sum + item.seconds, 0);
    const stats = byType.map(group => ({
        label: exerciseConfig[group.type].name,
        value: formatTime(group.total),
        color: exerciseColor(group.type)
    }));

    if (restTotal > 0) stats.push({ label: '休息', value: formatTime(restTotal), color: REST_COLOR });

    statsEl.innerHTML = stats.map(item => `
        <div class="stat" style="--c: ${item.color}">
            <span class="stat-label">${escapeHtml(item.label)}</span>
            <span class="stat-value">${item.value}</span>
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
        <div class="plan-item${item.kind === 'rest' ? ' rest' : ''}" style="--c: ${item.kind === 'exercise' ? exerciseColor(item.type) : 'transparent'}">
            <div class="badge">${item.kind === 'exercise' ? String(item.group).padStart(2, '0') : ''}</div>
            <div class="item-title">${escapeHtml(itemDescription(item))}</div>
            <div class="item-time">${item.reps ? `${item.reps} 次` : formatTime(item.seconds)}</div>
        </div>`).join('') || '<div class="empty">暂无计划</div>';
}

function renderUpcoming() {
    const upcoming = timeline.slice(currentIndex + 1).filter(item => item.kind === 'exercise');
    document.getElementById('upcoming-count').textContent = `${upcoming.length} 组`;
    upcomingListEl.innerHTML = upcoming.slice(0, 3).map(item => `
        <div class="upcoming-item" style="--c: ${exerciseColor(item.type)}">
            <span class="upcoming-number" aria-label="第 ${item.group} 组">${String(item.group).padStart(2, '0')}</span>
            <div class="item-title">${escapeHtml(item.name)}</div>
            <span class="upcoming-value">${item.reps ? `${item.reps} 次` : formatTime(item.seconds)}</span>
        </div>`).join('') || `<div class="empty">${running ? '最后一组' : '已结束'}</div>`;
}

function showSession(show) {
    sessionOpen = show;
    withViewTransition(() => {
        sessionView.hidden = !show;
        document.getElementById('setup-view').hidden = show;
        dockEl.hidden = show;
        dockFadeEl.hidden = show;
        setSessionChrome(show);
        window.scrollTo(0, 0);
        if (show) pauseBtn.focus({ preventScroll: true });
        else startBtn.focus({ preventScroll: true });
    });
}

function renderStrip() {
    stripEl.innerHTML = activities.map(item =>
        `<span class="strip-seg" style="flex: ${item.seconds}; --c: ${exerciseColor(item.type)}"></span>`
    ).join('');
}

function updateStrip(item, finished) {
    const group = finished ? activities.length + 1 : item.group;
    const segments = stripEl.children ?? [];
    const partial = item?.kind === 'exercise' ? (item.seconds - currentRemaining) / item.seconds : 0;
    for (let index = 0; index < segments.length; index++) {
        const number = index + 1;
        const value = number < group ? 1 : number === group ? partial : 0;
        segments[index].style.setProperty('--p', value.toFixed(3));
    }
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
    clearSessionSnapshot();
    leaveSessionGuard();
    running = false;
    paused = false;
    currentIndex = 0;
    currentRemaining = timeline[0]?.seconds || 0;
    stageCues = [];
    nextCue = 0;
    setPauseButton(false);
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
    setPauseButton(false);
    startBtn.disabled = true;
    resetBtn.textContent = '结束';
    completedSeconds = 0;
    renderStrip();
    enterSessionGuard(primeEnd);
    const startedAt = performance.now();
    enterStage(startedAt);
    saveSessionSnapshot();
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
        completedSeconds += timeline[currentIndex].seconds;
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
    if (crossed || now - lastSnapshotAt > SNAPSHOT_INTERVAL_MS) saveSessionSnapshot();
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
    resetBtn.textContent = '完成';
    clearSessionSnapshot();
    enterSessionGuard(closeSession);
    updateCurrentDisplay();
    renderUpcoming();
    resetBtn.focus();
}

function closeSession() {
    resetTimerState();
    if (resumedSession) {
        resumedSession = false;
        createPlan();
    }
}

// 运动中需要 3 秒内连按两次才结束，避免误触丢掉进度。
function handleEndClick() {
    if (!running) {
        closeSession();
        return;
    }
    if (endPrimedTimer === null) {
        primeEnd();
        return;
    }
    clearEndPrimed();
    closeSession();
}

function primeEnd() {
    clearTimeout(endPrimedTimer);
    resetBtn.textContent = '再按一次';
    resetBtn.classList.add('is-primed');
    endPrimedTimer = setTimeout(clearEndPrimed, 3000);
}

function clearEndPrimed() {
    clearTimeout(endPrimedTimer);
    endPrimedTimer = null;
    resetBtn.classList.remove('is-primed');
    if (running) resetBtn.textContent = '结束';
}

function setPauseButton(isPaused) {
    pauseBtn.classList.toggle('is-paused', isPaused);
    document.getElementById('pause-label').textContent = isPaused ? '继续' : '暂停';
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
        saveSessionSnapshot();
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
    setPauseButton(paused);
    updateCurrentDisplay();
}

function skipCurrent() {
    if (!running || currentIndex >= timeline.length) return;
    cancelSounds();
    completedSeconds += timeline[currentIndex].seconds - currentRemaining;
    currentIndex++;
    if (currentIndex >= timeline.length) {
        if (!paused) beep();
        finishTimer();
        return;
    }
    enterStage(performance.now());
    saveSessionSnapshot();
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
    document.getElementById('session-progress-label').textContent = `${finished ? activities.length : item.group} / ${activities.length}`;
    document.getElementById('session-remaining').textContent = finished ? '' : formatTime(Math.ceil(remaining));
    document.getElementById('beat-display').hidden = !item?.reps;
    document.getElementById('rep-count').hidden = !item?.reps;
    document.getElementById('rep-total').hidden = !item?.reps;
    renderRepProgress(item, item?.reps ? Math.min(item.reps, Math.floor((item.seconds - currentRemaining + 1e-7) / item.secondsPerRep)) : 0);
    sessionView.classList.toggle('stage-done', finished);
    sessionView.classList.toggle('is-paused', paused);
    updateStrip(item, finished);
    if (item) {
        const stage = item.kind === 'prepare' ? PREPARE_COLOR : item.kind === 'rest' ? REST_COLOR : exerciseColor(item.type);
        sessionView.style.setProperty('--stage', stage);
    }
    if (!item) {
        sessionView.style.setProperty('--stage', 'rgb(48, 209, 88)');
        currentTypeEl.textContent = '完成';
        currentNameEl.textContent = `${activities.length} 组`;
        setClock(timeDisplayEl, formatTime(completedSeconds));
        progressBarEl.style.width = '100%';
        return;
    }
    const elapsed = Math.max(0, item.seconds - currentRemaining);
    currentTypeEl.textContent = paused ? '已暂停' : item.kind === 'rest' ? '休息中' : item.kind === 'prepare' ? '准备' : '进行中';
    const next = timeline.slice(currentIndex + 1).find(stage => stage.kind === 'exercise');
    currentNameEl.textContent = item.kind === 'rest' ? (next ? `下一组 ${next.name}` : '休息') : item.name;
    progressBarEl.style.width = `${Math.min(100, elapsed / item.seconds * 100)}%`;
    if (!item.reps) setClock(timeDisplayEl, formatTime(Math.ceil(currentRemaining)));
    if (item.reps) {
        // 按次数的运动，主数字是做到第几次，时间退到次要位置。
        const done = Math.min(item.reps, Math.floor((elapsed + 1e-7) / item.secondsPerRep));
        setClock(timeDisplayEl, String(done));
        document.getElementById('rep-total').textContent = `/ ${item.reps}`;
        document.getElementById('rep-count').textContent = formatTime(Math.ceil(currentRemaining));
        const phase = elapsed % item.secondsPerRep;
        document.getElementById('light-beat').classList.toggle('active', !paused && phase >= item.secondsPerRep / 2);
        document.getElementById('heavy-beat').classList.toggle('active', !paused && done > 0 && phase < item.secondsPerRep / 2);
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') saveSessionSnapshot();
    if (document.visibilityState === 'visible' && running && !paused) {
        syncTime(performance.now());
        updateCurrentDisplay();
        acquireWakeLock();
    }
});

regenerateBtn.addEventListener('click', createPlan);
startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', togglePause);
skipBtn.addEventListener('click', skipCurrent);
resetBtn.addEventListener('click', handleEndClick);

configListEl.addEventListener('click', (event) => {
    const card = event.target.closest('.exercise-config');
    if (!card) return;

    // 只换选项区，分段控件的滑块才能滑过去。
    const ruleButton = event.target.closest('.rule-btn');
    if (ruleButton) {
        if (ruleButton.dataset.modeValue === card.dataset.mode) return;
        card.querySelector('[data-field="mode"]').value = ruleButton.dataset.modeValue;
        card.querySelectorAll('.rule-btn').forEach(button => button.classList.toggle('active', button === ruleButton));
        readConfigFromDom();
        card.dataset.mode = ruleButton.dataset.modeValue;
        card.querySelector('.option-list').innerHTML = renderOptions(exerciseConfig[card.dataset.type]);
        return;
    }

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
        name: `项目${type}`,
        weight: 1,
        mode: 'time',
        options: [createDefaultOption('time')]
    };
    renderConfig();
});

// ========== 中断恢复 ==========
const SESSION_KEY = 'focus-timer.workout.session.v1';
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const SNAPSHOT_INTERVAL_MS = 5 * 1000;

function saveSessionSnapshot() {
    if (!running) return;
    lastSnapshotAt = performance.now();
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            savedAt: Date.now(), timeline, activities, currentIndex, currentRemaining, completedSeconds
        }));
    } catch { /* Only recovery is lost; the session keeps running. */ }
}

function clearSessionSnapshot() {
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch { /* Same as above. */ }
}

function readSessionSnapshot() {
    try {
        const snapshot = JSON.parse(localStorage.getItem(SESSION_KEY));
        return snapshot && Date.now() - snapshot.savedAt < SESSION_MAX_AGE_MS ? snapshot : null;
    } catch {
        return null;
    }
}

// 回到中断的位置并保持暂停，点继续时声音才能恢复。
function resumeSession(snapshot) {
    timeline = snapshot.timeline;
    activities = snapshot.activities;
    currentIndex = snapshot.currentIndex;
    currentRemaining = snapshot.currentRemaining;
    completedSeconds = snapshot.completedSeconds;
    running = true;
    paused = true;
    resumedSession = true;
    stageCues = makeCues(timeline[currentIndex]);
    nextCue = 0;
    pauseBtn.disabled = false;
    skipBtn.disabled = false;
    startBtn.disabled = true;
    resetBtn.textContent = '结束';
    setPauseButton(true);
    renderStrip();
    renderUpcoming();
    enterSessionGuard(primeEnd);
    showSession(true);
    updateCurrentDisplay();
    saveSessionSnapshot();
}

const SETTINGS_KEY = 'focus-timer.workout.v1';
const settingFields = () => ['target-minutes', 'prepare-seconds', 'rest-mode', 'rest-min-seconds', 'rest-max-seconds', 'rest-seconds']
    .map(id => document.getElementById(id));

function saveSettings() {
    readConfigFromDom();
    const fields = {};
    settingFields().forEach((field) => { fields[field.id] = field.value; });
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ exerciseConfig, fields }));
    } catch { /* Settings then only last for this page view. */ }
}

function restoreSettings() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    } catch {
        return;
    }
    if (!saved) return;
    if (saved.exerciseConfig && Object.keys(saved.exerciseConfig).length > 0) exerciseConfig = saved.exerciseConfig;
    settingFields().forEach((field) => {
        if (typeof saved.fields?.[field.id] === 'string') field.value = saved.fields[field.id];
    });
    updateRestFields();
}

restoreSettings();
renderConfig();

// 改完配置就重算计划；数字输入在离开输入框时才算改完，不打断输入。
function refreshPlan() {
    saveSettings();
    createPlan();
}

document.getElementById('setup-view').addEventListener('input', saveSettings);
document.getElementById('setup-view').addEventListener('change', refreshPlan);
configListEl.addEventListener('click', (event) => {
    if (event.target.closest('button')) refreshPlan();
});
addExerciseBtn.addEventListener('click', refreshPlan);
protectSession(() => running);

// 打开页面时就准备好一份计划，宽屏下明细默认展开。
const pendingSession = readSessionSnapshot();
if (configListEl.children?.length) createPlan();
if (pendingSession) resumeSession(pendingSession);
if (window.matchMedia?.('(min-width: 900px)').matches) document.getElementById('plan-details').open = true;
