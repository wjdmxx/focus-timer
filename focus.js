// DOM 元素
const configContainer = document.getElementById('config-container');
const timerContainer = document.getElementById('timer-container');
const completeContainer = document.getElementById('complete-container');
const body = document.body;
const timerDisplay = document.getElementById('timer-display');
const triggerBtn = document.getElementById('trigger-btn');
const confirmBtn = document.getElementById('confirm-btn');
const restartBtn = document.getElementById('restart-btn');
const modeButtons = {
    fixed: document.getElementById('mode-fixed'),
    random: document.getElementById('mode-random'),
    surprise: document.getElementById('mode-surprise')
};
const sprintDetails = document.getElementById('sprint-details');
const resumeBtn = document.getElementById('resume-btn');
const stageRing = timerContainer.querySelector('.ring');
const sprintWaves = [...timerContainer.querySelectorAll('.fx-wave')];
const configItems = document.getElementById('config-items');
const timelineEl = document.getElementById('timeline');
const totalTimeEl = document.getElementById('total-time');
const tempoPanel = document.getElementById('tempo-panel');
const tempoDownBtn = document.getElementById('tempo-down-btn');
const tempoUpBtn = document.getElementById('tempo-up-btn');
const completeTitle = document.getElementById('complete-title');
const completeMark = document.getElementById('complete-mark');
const completeBar = document.getElementById('complete-bar');
const heroDial = document.getElementById('hero-dial');
const heroClock = document.getElementById('hero-clock');
const dock = document.getElementById('dock');
const dockFade = document.getElementById('dock-fade');

// 新增DOM元素
const hideTimeToggle = document.getElementById('hide-time-toggle');
const randomModeOptions = document.getElementById('random-mode-options');
const modeNormalBtn = document.getElementById('mode-normal');
const modeExBtn = document.getElementById('mode-ex');

// 滑动条和输入框
const initialTimeSlider = document.getElementById('initial-time-slider');
const initialTimeInput = document.getElementById('initial-time-input');
const coolingTimeSlider = document.getElementById('cooling-time-slider');
const coolingTimeInput = document.getElementById('cooling-time-input');
const multiplierSlider = document.getElementById('multiplier-slider');
const multiplierInput = document.getElementById('multiplier-input');
const minimumTimeInput = document.getElementById('minimum-time-input');

const randomInputs = {
    initialMin: document.getElementById('random-initial-min'),
    initialMax: document.getElementById('random-initial-max'),
    coolingMin: document.getElementById('random-cooling-min'),
    coolingMax: document.getElementById('random-cooling-max'),
    multiplierMin: document.getElementById('random-multiplier-min'),
    multiplierMax: document.getElementById('random-multiplier-max'),
    minimumNext: document.getElementById('random-min-next'),
    wildChance: document.getElementById('random-wild-chance')
};

const sprintInputs = {
    chance: document.getElementById('sprint-chance'),
    ratioMin: document.getElementById('sprint-ratio-min'),
    ratioMax: document.getElementById('sprint-ratio-max'),
    min: document.getElementById('sprint-min'),
    max: document.getElementById('sprint-max'),
    skipCoolingChance: document.getElementById('sprint-skip-cooling-chance'),
    longChance: document.getElementById('sprint-long-chance'),
    longMin: document.getElementById('sprint-long-min'),
    longMax: document.getElementById('sprint-long-max')
};

// 配置值
let config = {
    initialTime: 5,
    coolingTime: 3,
    multiplier: 1.0,
    minimumNext: 0,
    random: null,
    sprint: null
};

// 随机模式状态
let isRandomMode = false;
let isSurpriseMode = false;
let hideTimePreference = false; // 全随机时强制隐藏，离开后恢复用户的选择
let awaitingResume = false;
let isExMode = false; // 新增：是否为EX模式
let isHideTimeMode = false; // 新增：是否隐藏时间

// 计时器状态
let timeLeft = 0;
let timerInterval = null;
let isCoolingDown = false;
let isSprinting = false;
let lastTaskRemainingTime = 0;
let timerEnded = false; // 新增：标记计时是否已结束（用于隐藏时间模式）
let skipCoolingAfterSprint = false;
let currentSprintWasLong = false;
let phaseEndAt = 0; // 当前阶段结束的时间戳，剩余时间都由它算出
let carriedPhaseEnd = null;
let peekRevealUntil = 0;

// 记录计时流程
let sessionHistory = [];
let currentPhaseStartTime = 0;

// 节拍调整：每次同时改变线性系数和固定偏移
let tempoScale = 1;
let tempoOffset = 0;
let tempoControlCooldownEnd = 0;
let tempoControlCooldownFrame = null;
const TEMPO_CONTROL_COOLDOWN_MS = 60 * 1000;

// 随机数生成函数
function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function readNumber(input, fallback, min = -Infinity, max = Infinity) {
    const value = Number.parseFloat(input.value);
    return clamp(Number.isFinite(value) ? value : fallback, min, max);
}

function readRange(minInput, maxInput, fallbackMin, fallbackMax, floor = 0) {
    let min = readNumber(minInput, fallbackMin, floor);
    let max = readNumber(maxInput, fallbackMax, floor);
    if (min > max) [min, max] = [max, min];
    minInput.value = min;
    maxInput.value = max;
    return { min, max };
}

function readOptionalRange(minInput, maxInput) {
    const parseOptional = (input) => {
        if (String(input.value).trim() === '') return null;
        const value = Number.parseFloat(input.value);
        return Number.isFinite(value) ? Math.max(0, value) : null;
    };
    let min = parseOptional(minInput);
    let max = parseOptional(maxInput);
    if (min !== null && max !== null && min > max) {
        [min, max] = [max, min];
        minInput.value = min;
        maxInput.value = max;
    }
    return { min, max };
}

function rollPercent(percent) {
    return Math.random() * 100 < clamp(percent, 0, 100);
}

const RANDOM_PRESETS = {
    normal: {
        initialMin: 10, initialMax: 20,
        coolingMin: 2, coolingMax: 4,
        multiplierMin: 1.5, multiplierMax: 3,
        minimumNext: 0, wildChance: 8,
        sprintChance: 85, sprintSkip: 3, sprintLong: 4
    },
    ex: {
        initialMin: 20, initialMax: 30,
        coolingMin: 1, coolingMax: 2,
        multiplierMin: 2, multiplierMax: 4,
        minimumNext: 15, wildChance: 15,
        sprintChance: 90, sprintSkip: 5, sprintLong: 7
    }
};

function applyRandomPreset(name) {
    const preset = RANDOM_PRESETS[name];
    randomInputs.initialMin.value = preset.initialMin;
    randomInputs.initialMax.value = preset.initialMax;
    randomInputs.coolingMin.value = preset.coolingMin;
    randomInputs.coolingMax.value = preset.coolingMax;
    randomInputs.multiplierMin.value = preset.multiplierMin;
    randomInputs.multiplierMax.value = preset.multiplierMax;
    randomInputs.minimumNext.value = preset.minimumNext;
    randomInputs.wildChance.value = preset.wildChance;
    sprintInputs.chance.value = preset.sprintChance;
    sprintInputs.skipCoolingChance.value = preset.sprintSkip;
    sprintInputs.longChance.value = preset.sprintLong;
}

function setSwitch(button, on) {
    button.classList.toggle('active', on);
    button.setAttribute('aria-checked', String(on));
}

function syncHideTime() {
    isHideTimeMode = hideTimePreference || isSurpriseMode;
    setSwitch(hideTimeToggle, isHideTimeMode);
    hideTimeToggle.disabled = isSurpriseMode;
    updateHero();
}

function setFocusMode(mode) {
    isRandomMode = mode !== 'fixed';
    isSurpriseMode = mode === 'surprise';
    Object.entries(modeButtons).forEach(([name, button]) => button.classList.toggle('active', name === mode));
    configItems.classList.toggle('hidden', isRandomMode);
    randomModeOptions.classList.toggle('hidden', mode !== 'random');
    sprintDetails.classList.toggle('hidden', isSurpriseMode);
    syncHideTime();
}

function currentFocusMode() {
    if (isSurpriseMode) return 'surprise';
    return isRandomMode ? 'random' : 'fixed';
}

// 配置页的环实时反映当前设置。
function updateHero() {
    let text = formatTime(Math.round(readNumber(initialTimeInput, 5, 0.1) * 60));
    if (isRandomMode && !isSurpriseMode) text = `${randomInputs.initialMin.value}–${randomInputs.initialMax.value}`;
    if (isHideTimeMode) text = '**:**';
    setClock(heroClock, text);
    heroDial.classList.toggle('is-random', isRandomMode);
}

function setExMode(on) {
    isExMode = on;
    modeNormalBtn.classList.toggle('active', !on);
    modeExBtn.classList.toggle('active', on);
}

// 固定/随机/全随机切换
Object.entries(modeButtons).forEach(([mode, button]) => {
    button.addEventListener('click', () => {
        setFocusMode(mode);
        saveSettings();
    });
});

// 隐藏时间模式切换
hideTimeToggle.addEventListener('click', () => {
    if (isSurpriseMode) return;
    hideTimePreference = !hideTimePreference;
    syncHideTime();
    saveSettings();
});

// 普通/EX模式切换
modeNormalBtn.addEventListener('click', () => {
    setExMode(false);
    applyRandomPreset('normal');
    saveSettings();
});

modeExBtn.addEventListener('click', () => {
    setExMode(true);
    applyRandomPreset('ex');
    saveSettings();
});

// 同步滑动条和输入框
function syncSliderInput(slider, input, isFloat = false) {
    slider.addEventListener('input', () => {
        input.value = isFloat ? parseFloat(slider.value).toFixed(1) : slider.value;
        paintRange(slider);
    });
    input.addEventListener('input', () => {
        const val = isFloat ? parseFloat(input.value) : parseInt(input.value);
        if (!isNaN(val)) {
            // 滑动条限制在范围内，但输入值可以超出
            const minVal = parseFloat(slider.min);
            const maxVal = parseFloat(slider.max);
            slider.value = Math.min(Math.max(val, minVal), maxVal);
            paintRange(slider);
        }
    });
}

syncSliderInput(initialTimeSlider, initialTimeInput);
syncSliderInput(coolingTimeSlider, coolingTimeInput);
syncSliderInput(multiplierSlider, multiplierInput, true);

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTimeReadable(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0 && s > 0) {
        return `${m}分${s}秒`;
    } else if (m > 0) {
        return `${m}分钟`;
    } else {
        return `${s}秒`;
    }
}

function updateTempoControlAvailability() {
    const cooldownActive = Date.now() < tempoControlCooldownEnd;
    const adjustable = Boolean(timerInterval) && !timerEnded && !isCoolingDown && !isSprinting && !cooldownActive;
    tempoDownBtn.disabled = !adjustable;
    tempoUpBtn.disabled = !adjustable;
}

function updateUI() {
    // 隐藏时间模式下，只有冷静期或主动查看时才显示时间
    const peeking = Date.now() < peekRevealUntil;
    const shouldHideTime = isHideTimeMode && !isCoolingDown && !peeking;
    setClock(timerDisplay, shouldHideTime ? '**:**' : formatTime(timeLeft));

    // 隐藏时间时环保持满格，否则剩余比例会暴露时间。
    const remaining = timerInterval ? Math.max(0, phaseEndAt - Date.now()) / 1000 : timeLeft;
    const progress = shouldHideTime || !currentPhaseStartTime ? 1 : clamp(remaining / currentPhaseStartTime, 0, 1);
    timerContainer.style.setProperty('--progress', progress.toFixed(4));

    body.dataset.phase = isCoolingDown ? 'cooling' : (isSprinting ? 'sprint' : 'focus');
    triggerBtn.classList.toggle('hidden', isCoolingDown || isSprinting || !(timerInterval || timerEnded));
    updateTempoControlAvailability();
}

// Worker 里的定时器在标签页切到后台时不会被浏览器降频。
function startTicker(callback, intervalMs) {
    let fallbackId = null;
    const useFallback = () => {
        fallbackId = setInterval(callback, intervalMs);
    };
    let worker = null;

    if (typeof Worker !== 'undefined') {
        try {
            const source = `setInterval(() => postMessage(0), ${intervalMs});`;
            const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
            worker = new Worker(url);
            worker.onmessage = callback;
            worker.onerror = () => {
                worker.terminate();
                useFallback();
            };
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            worker = null;
        }
    }
    if (!worker) useFallback();

    return {
        stop() {
            if (worker) worker.terminate();
            if (fallbackId !== null) clearInterval(fallbackId);
        }
    };
}

function syncTimeLeft() {
    if (timerInterval) {
        timeLeft = Math.max(0, Math.ceil((phaseEndAt - Date.now()) / 1000));
    }
}

function addToCurrentPhase(seconds) {
    syncTimeLeft();
    timeLeft += seconds;
    currentPhaseStartTime += seconds;
    phaseEndAt += seconds * 1000;
}

function tick() {
    // 被挂起后恢复时可能一次跨过多个阶段，时间从上一阶段的终点接续。
    while (timerInterval && Date.now() >= phaseEndAt) {
        timeLeft = 0;
        if (isHideTimeMode && !isCoolingDown && !isSprinting) {
            // 隐藏时间模式下，计时结束后停止计时但保持显示**:**
            timerInterval.stop();
            timerInterval = null;
            timerEnded = true;
            updateUI();
            return;
        }
        carriedPhaseEnd = phaseEndAt;
        handleTimerEnd();
    }
    if (!timerInterval) return;
    syncTimeLeft();
    updateUI();
    if (Date.now() - lastSnapshotAt > SNAPSHOT_INTERVAL_MS) saveSessionSnapshot();
}

function startTimer() {
    if (timerInterval) timerInterval.stop();
    phaseEndAt = (carriedPhaseEnd ?? Date.now()) + timeLeft * 1000;
    carriedPhaseEnd = null;
    currentPhaseStartTime = timeLeft;
    timerEnded = false;
    peekRevealUntil = 0;

    timerInterval = startTicker(tick, 200);
    updateUI();
    saveSessionSnapshot();
    if (isCoolingDown) {
        stopMetronome();
    } else {
        startMetronome();
    }
    acquireWakeLock();
}

function stopTimer() {
    if (timerInterval) timerInterval.stop();
    timerInterval = null;
    updateUI();
    stopMetronome();
}

function recordPhase(type, duration, planned = currentPhaseStartTime, interrupted = false) {
    const phase = {
        type: type, // 'focus'、'sprint' 或 'cooling'
        duration: duration
    };

    if (type === 'focus') {
        phase.planned = planned;
    }

    if (interrupted) {
        phase.interrupted = true;
    }

    sessionHistory.push(phase);
}

function chooseCoolingSeconds() {
    if (!isRandomMode) return Math.round(config.coolingTime * 60);
    const range = config.random.cooling;
    const minutes = rollPercent(config.random.wildChance)
        ? randomInRange(0.5, 6.5)
        : randomInRange(range.min, range.max);
    return Math.max(1, Math.round(minutes * 60));
}

function chooseNextMultiplier() {
    if (!isRandomMode) return config.multiplier;
    if (rollPercent(config.random.wildChance)) {
        return randomInRange(1.15, 5.25);
    }
    return randomInRange(config.random.multiplier.min, config.random.multiplier.max);
}

function sampleRightTailed(min, max = null, scale = null) {
    const safeMin = Math.max(0, min);
    const u = clamp(Math.random(), 0.000001, 0.999999);

    if (max === null) {
        // 无上限时使用指数长尾：大多数靠近下限，极少数会非常长。
        const tailScale = scale ?? Math.max(2, safeMin * 0.8);
        return safeMin - Math.log(1 - u) * tailScale;
    }

    const safeMax = Math.max(safeMin, max);
    const span = safeMax - safeMin;
    if (rollPercent(18)) {
        // 小概率直接进入高位区间。
        return safeMin + span * (0.68 + 0.32 * Math.pow(u, 0.45));
    }
    // 常规抽样偏向较短值。
    return safeMin + span * Math.pow(u, 2.1);
}

function applyOptionalDurationLimits(seconds, limits) {
    let result = seconds;
    if (limits.min !== null) result = Math.max(result, limits.min * 60);
    if (limits.max !== null) result = Math.min(result, limits.max * 60);
    // 没有配置上限不等于允许数值溢出；内部仅保留一个 24 小时安全护栏。
    return clamp(result, 10, 24 * 60 * 60);
}

function createSprintPlan(remainingSeconds) {
    const sprint = config.sprint;
    const isLong = rollPercent(sprint.longChance);
    const skipCooling = rollPercent(sprint.skipCoolingChance);
    const useWildDuration = isRandomMode && rollPercent(config.random.wildChance);
    let seconds;

    if (isLong) {
        const longMin = sprint.long.min ?? 8;
        const longMax = useWildDuration ? null : sprint.long.max;
        seconds = sampleRightTailed(longMin, longMax, Math.max(5, longMin)) * 60;
    } else {
        let ratio;
        if (useWildDuration) {
            // 越界惊喜使用独立长尾，偶尔可接近或超过剩余时间本身。
            ratio = sampleRightTailed(5, null, 32);
        } else {
            ratio = sampleRightTailed(sprint.ratio.min, sprint.ratio.max);
        }
        ratio /= 100;
        seconds = remainingSeconds * ratio;
        seconds = applyOptionalDurationLimits(seconds, sprint.duration);
    }
    seconds = clamp(seconds, 10, 24 * 60 * 60);

    return {
        seconds: Math.max(10, Math.round(seconds)),
        skipCooling,
        isLong
    };
}

function startCoolingStage() {
    isSprinting = false;
    isCoolingDown = true;
    currentSprintWasLong = false;
    timeLeft = chooseCoolingSeconds();
    startTimer();
}

function startSprintStage() {
    const plan = createSprintPlan(lastTaskRemainingTime);
    isCoolingDown = false;
    isSprinting = true;
    skipCoolingAfterSprint = plan.skipCooling;
    currentSprintWasLong = plan.isLong;
    timeLeft = plan.seconds;
    startTimer();
}

function startNextFocusStage() {
    isCoolingDown = false;
    isSprinting = false;
    currentSprintWasLong = false;

    const multiplier = chooseNextMultiplier();
    timeLeft = Math.round(lastTaskRemainingTime * multiplier);
    const minimumSeconds = Math.round(config.minimumNext * 60);
    if (timeLeft > 0 && minimumSeconds > 0) {
        timeLeft = Math.max(timeLeft, minimumSeconds);
    }

    if (timeLeft > 0) {
        startTimer();
    } else {
        showCompletePage();
    }
}

function handleTimerEnd() {
    // 记录当前阶段
    if (isCoolingDown) {
        recordPhase('cooling', currentPhaseStartTime);
    } else if (isSprinting) {
        recordPhase('sprint', currentPhaseStartTime);
    } else {
        recordPhase('focus', currentPhaseStartTime);
    }

    stopTimer();
    timerEnded = false;

    if (isSprinting) {
        if (skipCoolingAfterSprint) {
            skipCoolingAfterSprint = false;
            startNextFocusStage();
        } else {
            startCoolingStage();
        }
    } else if (isCoolingDown) {
        // 冷静期结束 -> 进入倍率时间模式
        startNextFocusStage();
    } else {
        // 计时完成，显示完成页面
        showCompletePage();
    }
}

function setDockVisible(visible) {
    dock.classList.toggle('hidden', !visible);
    dockFade.classList.toggle('hidden', !visible);
    setSessionChrome(!visible);
}

function showConfigPage() {
    timerContainer.classList.add('hidden');
    completeContainer.classList.add('hidden');
    configContainer.classList.remove('hidden');
    confirmBtn.classList.remove('hidden');
    restartBtn.classList.add('hidden');
    setDockVisible(true);
    delete body.dataset.phase;
    clearSessionControls();
    clearForceEndPrime();
}

function showTimerPage() {
    configContainer.classList.add('hidden');
    completeContainer.classList.add('hidden');
    timerContainer.classList.remove('hidden');
    setDockVisible(false);
    // 显示时间按钮仅在隐藏时间模式下可见
    peekTimeBtn.classList.toggle('hidden', !isHideTimeMode);
}

function showCompletePage() {
    stopMetronome();
    setAwaitingResume(false);
    clearSessionSnapshot();
    leaveSessionGuard();
    timerContainer.classList.add('hidden');
    configContainer.classList.add('hidden');
    completeContainer.classList.remove('hidden');
    confirmBtn.classList.add('hidden');
    restartBtn.classList.remove('hidden');
    setDockVisible(true);
    delete body.dataset.phase;
    clearSessionControls();
    releaseWakeLock();

    renderTimeline();
    window.scrollTo(0, 0);
}

function clearSessionControls() {
    peekTimeClearState();
    clearTempoControlCooldown();
}

function renderTimeline() {
    const labels = { focus: '专注', sprint: '冲刺', cooling: '冷静' };
    const colors = { focus: 'var(--phase-focus)', sprint: 'var(--phase-sprint)', cooling: 'var(--phase-cooling)' };
    let totalSeconds = 0;

    const rows = sessionHistory.map((item) => {
        totalSeconds += item.duration;
        let timeText = formatTimeReadable(item.duration);
        if (item.type === 'focus' && item.planned) {
            timeText += ` / ${formatTimeReadable(item.planned)}`;
        }
        const interruptedTag = item.interrupted ? '<em>中断</em>' : '';
        return `
            <li class="timeline-item" style="--c: ${colors[item.type]}">
                <span class="timeline-label">${labels[item.type]}${interruptedTag}</span>
                <span class="timeline-time">${timeText}</span>
            </li>
        `;
    });

    const wasInterrupted = sessionHistory.length > 0 && sessionHistory[sessionHistory.length - 1].interrupted;
    completeTitle.textContent = wasInterrupted ? '已结束' : '完成';
    completeMark.classList.toggle('is-interrupted', wasInterrupted);
    timelineEl.innerHTML = rows.join('');
    completeBar.innerHTML = sessionHistory
        .filter(item => item.duration > 0)
        .map(item => `<span style="flex: ${item.duration}; --c: ${colors[item.type]}"></span>`)
        .join('');
    totalTimeEl.textContent = formatTimeReadable(totalSeconds);
}

function setRandomInput(input, value, digits = 1) {
    input.value = Number(value.toFixed(digits));
}

function generateSurpriseProfile() {
    const initialMin = randomInRange(3, 18);
    const initialMax = clamp(sampleRightTailed(Math.max(25, initialMin + 8), null, 42), 25, 240);
    const coolingMin = randomInRange(0.3, 2);
    const coolingMax = coolingMin + randomInRange(1, 8);
    const multiplierMin = randomInRange(1.1, 2.4);
    const multiplierMax = multiplierMin + randomInRange(0.6, 4);
    const ratioMin = randomInRange(5, 15);
    const ratioMax = clamp(sampleRightTailed(30, null, 38), 30, 180);
    const longMin = randomInRange(6, 12);

    setRandomInput(randomInputs.initialMin, initialMin);
    setRandomInput(randomInputs.initialMax, initialMax);
    setRandomInput(randomInputs.coolingMin, coolingMin);
    setRandomInput(randomInputs.coolingMax, coolingMax);
    setRandomInput(randomInputs.multiplierMin, multiplierMin);
    setRandomInput(randomInputs.multiplierMax, multiplierMax);
    randomInputs.minimumNext.value = [0, 5, 10, 15, 20, 30][Math.floor(Math.random() * 6)];
    setRandomInput(randomInputs.wildChance, randomInRange(15, 40), 0);

    setRandomInput(sprintInputs.chance, randomInRange(82, 96), 0);
    setRandomInput(sprintInputs.ratioMin, ratioMin, 0);
    setRandomInput(sprintInputs.ratioMax, ratioMax, 0);
    sprintInputs.min.value = rollPercent(30) ? '' : Number(randomInRange(0.5, 3).toFixed(1));
    sprintInputs.max.value = rollPercent(55)
        ? ''
        : Number(clamp(sampleRightTailed(8, null, 12), 8, 60).toFixed(1));
    setRandomInput(sprintInputs.skipCoolingChance, randomInRange(2, 10), 0);
    setRandomInput(sprintInputs.longChance, randomInRange(3, 12), 0);
    setRandomInput(sprintInputs.longMin, longMin);
    sprintInputs.longMax.value = rollPercent(45)
        ? ''
        : Number(clamp(sampleRightTailed(Math.max(15, longMin), null, 18), 15, 90).toFixed(1));
}

// 确认配置并开始
function beginConfiguredSession() {
    // 重置历史记录
    sessionHistory = [];
    timerEnded = false;

    if (isRandomMode) {
        const initial = readRange(randomInputs.initialMin, randomInputs.initialMax, 10, 20, 0.1);
        const cooling = readRange(randomInputs.coolingMin, randomInputs.coolingMax, 2, 4, 0.1);
        const multiplier = readRange(randomInputs.multiplierMin, randomInputs.multiplierMax, 1.5, 3, 0.1);
        const wildChance = readNumber(randomInputs.wildChance, 8, 0, 50);
        config.random = {
            initial,
            cooling,
            multiplier,
            wildChance
        };
        config.minimumNext = readNumber(randomInputs.minimumNext, 0, 0, 240);
        config.initialTime = rollPercent(wildChance)
            ? clamp(sampleRightTailed(5, null, 35), 3, 720)
            : randomInRange(initial.min, initial.max);
    } else {
        // 固定模式：读取配置
        config.initialTime = parseFloat(initialTimeInput.value) || 5;
        config.coolingTime = parseFloat(coolingTimeInput.value) || 3;
        config.multiplier = parseFloat(multiplierInput.value) || 1.0;
        config.minimumNext = readNumber(minimumTimeInput, 0, 0, 240);
        config.random = null;

        // 确保值为正数
        config.initialTime = Math.max(0.1, config.initialTime);
        config.coolingTime = Math.max(0.1, config.coolingTime);
        config.multiplier = Math.max(0.1, config.multiplier);
    }

    const sprintRatio = readRange(sprintInputs.ratioMin, sprintInputs.ratioMax, 10, 30, 1);
    const sprintDuration = readOptionalRange(sprintInputs.min, sprintInputs.max);
    const sprintLong = readOptionalRange(sprintInputs.longMin, sprintInputs.longMax);
    config.sprint = {
        chance: readNumber(sprintInputs.chance, 85, 0, 100),
        ratio: sprintRatio,
        duration: sprintDuration,
        skipCoolingChance: readNumber(sprintInputs.skipCoolingChance, 3, 0, 25),
        longChance: readNumber(sprintInputs.longChance, 4, 0, 30),
        long: sprintLong
    };

    // 初始化计时
    timeLeft = Math.round(config.initialTime * 60);
    isCoolingDown = false;
    isSprinting = false;
    lastTaskRemainingTime = 0;
    skipCoolingAfterSprint = false;
    currentSprintWasLong = false;
    carriedPhaseEnd = null;
    tempoScale = 1;
    tempoOffset = 0;
    clearTempoControlCooldown();
    ensureAudio();

    enterSessionGuard(primeForceEnd);

    // 切换到计时页面
    withViewTransition(() => {
        showTimerPage();
        startTimer();
    });
}

function startConfiguredSession() {
    if (!isSurpriseMode) {
        beginConfiguredSession();
        return;
    }
    // 全随机的数值只用这一轮，不覆盖用户保存的设置。
    const kept = settingInputs.map(input => input.value);
    generateSurpriseProfile();
    beginConfiguredSession();
    settingInputs.forEach((input, index) => {
        input.value = kept[index];
    });
}

confirmBtn.addEventListener('click', startConfiguredSession);

// 核心逻辑：触发冷静期 / 隐藏时间模式下的按钮处理
triggerBtn.addEventListener('click', () => {
    // 隐藏时间模式下，如果计时已结束，则进入结算
    if (isHideTimeMode && !isCoolingDown && !isSprinting && timerEnded) {
        // 记录专注阶段
        recordPhase('focus', currentPhaseStartTime);
        timerEnded = false;
        // 计时完成，显示完成页面
        showCompletePage();
        return;
    }

    // 记录专注阶段（实际使用的时间 = 初始时间 - 剩余时间）
    syncTimeLeft();
    const usedTime = currentPhaseStartTime - timeLeft;
    if (currentPhaseStartTime > 0) {
        recordPhase('focus', usedTime, currentPhaseStartTime);
    }

    // 1. 记录当前剩余时间
    lastTaskRemainingTime = timeLeft;

    // 2. 暗中抽取：冲刺，或直接进入冷静
    stopTimer();
    timerEnded = false;
    skipCoolingAfterSprint = false;
    if (rollPercent(config.sprint.chance)) {
        startSprintStage();
    } else {
        startCoolingStage();
    }
});

// 重新开始按钮
restartBtn.addEventListener('click', () => {
    withViewTransition(showConfigPage);
});

// ========== 底部按钮逻辑 ==========
const forceEndBtn = document.getElementById('force-end-btn');
const peekTimeBtn = document.getElementById('peek-time-btn');
const peekCooldownBar = document.getElementById('peek-cooldown-bar');

// --- 强制结束：5秒内双击 ---
let forceEndFirstClick = 0;
let forceEndTimeout = null;

function clearForceEndPrime() {
    clearTimeout(forceEndTimeout);
    forceEndFirstClick = 0;
    forceEndBtn.classList.remove('force-end-primed');
    forceEndBtn.querySelector('.btn-text').textContent = '强制结束';
}

function primeForceEnd() {
    forceEndFirstClick = Date.now();
    forceEndBtn.classList.add('force-end-primed');
    forceEndBtn.querySelector('.btn-text').textContent = '再按一次';
    clearTimeout(forceEndTimeout);
    forceEndTimeout = setTimeout(clearForceEndPrime, 5000);
}

forceEndBtn.addEventListener('click', () => {
    if (Date.now() - forceEndFirstClick < 5000) {
        clearForceEndPrime();
        handleForceEnd();
    } else {
        primeForceEnd();
    }
});

function handleForceEnd() {
    // 记录当前阶段的已用时间
    syncTimeLeft();
    const elapsed = currentPhaseStartTime - Math.max(timeLeft, 0);
    stopTimer();
    timerEnded = false;

    if (currentPhaseStartTime > 0) {
        recordPhase(
            isCoolingDown ? 'cooling' : (isSprinting ? 'sprint' : 'focus'),
            elapsed,
            currentPhaseStartTime,
            true
        );
    }

    isCoolingDown = false;
    isSprinting = false;
    showCompletePage();
}

// --- 显示时间按钮 ---
let peekCooldownEnd = 0;
let peekCooldownTimer = null;
let peekShowTimeout = null;
const PEEK_COOLDOWN_MS = 5 * 60 * 1000; // 5分钟
const PEEK_REVEAL_MS = 5 * 1000;

peekTimeBtn.addEventListener('click', () => {
    if (Date.now() < peekCooldownEnd || isCoolingDown) return;

    // 添加随机时间 3-6分钟
    if (timerInterval) {
        addToCurrentPhase(Math.round(randomInRange(3, 6) * 60));
    }

    // 短暂显示时间，期间继续走秒
    peekRevealUntil = Date.now() + PEEK_REVEAL_MS;
    clearTimeout(peekShowTimeout);
    peekShowTimeout = setTimeout(updateUI, PEEK_REVEAL_MS);
    updateUI();

    // 开始冷却
    peekCooldownEnd = Date.now() + PEEK_COOLDOWN_MS;
    peekTimeBtn.classList.add('on-cooldown');
    startPeekCooldownBar();
});

function startPeekCooldownBar() {
    cancelAnimationFrame(peekCooldownTimer);
    function tick() {
        const remaining = peekCooldownEnd - Date.now();
        if (remaining <= 0) {
            peekCooldownBar.style.width = '0%';
            peekTimeBtn.classList.remove('on-cooldown');
            return;
        }
        const progress = ((PEEK_COOLDOWN_MS - remaining) / PEEK_COOLDOWN_MS) * 100;
        peekCooldownBar.style.width = progress + '%';
        peekCooldownTimer = requestAnimationFrame(tick);
    }
    tick();
}

function peekTimeClearState() {
    clearTimeout(peekShowTimeout);
    cancelAnimationFrame(peekCooldownTimer);
    peekCooldownEnd = 0;
    peekRevealUntil = 0;
    peekCooldownBar.style.width = '0%';
    peekTimeBtn.classList.remove('on-cooldown');
}

// --- 动态节拍微调：全局 60 秒冷却 ---
function clearTempoControlCooldown() {
    cancelAnimationFrame(tempoControlCooldownFrame);
    tempoControlCooldownFrame = null;
    tempoControlCooldownEnd = 0;
    tempoDownBtn.classList.remove('cooldown');
    tempoUpBtn.classList.remove('cooldown');
    tempoDownBtn.style.setProperty('--cooldown', '0');
    tempoUpBtn.style.setProperty('--cooldown', '0');
    updateTempoControlAvailability();
}

function startTempoControlCooldown(sourceButton) {
    tempoControlCooldownEnd = Date.now() + TEMPO_CONTROL_COOLDOWN_MS;
    tempoDownBtn.classList.remove('cooldown');
    tempoUpBtn.classList.remove('cooldown');
    sourceButton.classList.add('cooldown');
    cancelAnimationFrame(tempoControlCooldownFrame);

    function drawCooldown() {
        const remaining = tempoControlCooldownEnd - Date.now();
        if (remaining <= 0) {
            sourceButton.classList.remove('cooldown');
            sourceButton.style.setProperty('--cooldown', '0');
            updateTempoControlAvailability();
            return;
        }
        const progress = 1 - remaining / TEMPO_CONTROL_COOLDOWN_MS;
        sourceButton.style.setProperty('--cooldown', progress.toFixed(4));
        updateTempoControlAvailability();
        tempoControlCooldownFrame = requestAnimationFrame(drawCooldown);
    }
    drawCooldown();
}

function applyTempoAdjustment(direction) {
    if (Date.now() < tempoControlCooldownEnd || isCoolingDown || isSprinting || !timerInterval || timerEnded) {
        return;
    }

    const isSlower = direction < 0;
    tempoScale = clamp(tempoScale + direction * 0.05, 0.7, 1.3);
    tempoOffset = clamp(tempoOffset + direction * 10, -60, 60);

    syncTimeLeft();
    if (isSlower) {
        addToCurrentPhase(Math.round(randomInRange(30, 300)));
    } else {
        const requested = Math.round(randomInRange(30, 120));
        addToCurrentPhase(-Math.min(requested, Math.max(0, timeLeft - 5)));
    }

    updateUI();
    startTempoControlCooldown(isSlower ? tempoDownBtn : tempoUpBtn);
}

tempoDownBtn.addEventListener('click', () => applyTempoAdjustment(-1));
tempoUpBtn.addEventListener('click', () => applyTempoAdjustment(1));

// ========== 节拍器 ==========
const beatDotsEl = document.getElementById('beat-dots');
const beatDotAccent = document.getElementById('beat-dot-accent');
const beatDotNormal = document.getElementById('beat-dot-normal');

let audioCtx = null;
let metroActive = false;
let metroSchedulerId = null;
let nextBeatTime = 0;
let beatCounter = 0;
let tempoSchedule = [];
let scheduleStartTime = 0;
const LOOKAHEAD = 0.12;
const SCHED_INTERVAL = 25;
let lastBreathDuration = -1;

function ensureAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            return null;
        }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

// ---- 段工具 ----
function segHold(dur, cpm) {
    return { duration: dur, fromCPM: cpm, toCPM: cpm, curve: 'hold' };
}
function segLinear(dur, a, b) {
    return { duration: dur, fromCPM: a, toCPM: b, curve: 'linear' };
}
function segEase(dur, a, b) {
    return { duration: dur, fromCPM: a, toCPM: b, curve: 'ease' };
}
function segInstant(a, b) {
    return { duration: 0.01, fromCPM: a, toCPM: b, curve: 'instant' };
}

// ---- BPM 桶（5 档，彻底随机化的基础） ----
const BUCKETS = [
    { name: 'low',    min: 120, max: 150 },  // 低
    { name: 'midLo',  min: 150, max: 180 },  // 中低
    { name: 'midHi',  min: 180, max: 210 },  // 中高
    { name: 'sprint', min: 210, max: 240 },  // 冲刺
    { name: 'burst',  min: 240, max: 260 }   // 爆发（稀有）
];
const DEFAULT_W = [0.24, 0.26, 0.22, 0.16, 0.12];

function pickInBucket(b) {
    return randomInRange(b.min, b.max);
}
function randInt(min, max) {
    return Math.floor(randomInRange(min, max + 1));
}
function pickBucket(weights) {
    const w = weights || DEFAULT_W;
    let total = 0;
    for (let i = 0; i < w.length; i++) total += w[i];
    let r = Math.random() * total;
    for (let i = 0; i < BUCKETS.length; i++) {
        r -= w[i];
        if (r <= 0) return BUCKETS[i];
    }
    return BUCKETS[BUCKETS.length - 1];
}
function randCurve() {
    const r = Math.random();
    if (r < 0.5) return 'linear';
    if (r < 0.85) return 'ease';
    return 'instant';
}
// 常用段时长（全部 ≥10s 保证节奏可辨）
function holdSeg(target, min, max) {
    return segHold(randomInRange(min || 12, max || 45), target);
}
function transSeg(from, to, min, max, curve) {
    const c = curve || randCurve();
    if (c === 'instant') return segInstant(from, to);
    return { duration: randomInRange(min || 12, max || 35), fromCPM: from, toCPM: to, curve: c };
}

// ---- 模式库（17 种，全部随机化） ----
// 1. 波动：两个随机桶来回（cycles 随机、每次目标值重随）
function patternWave(start) {
    const segs = [];
    const b1 = pickBucket();
    let b2 = pickBucket();
    if (b2 === b1) b2 = pickBucket();
    const cycles = randInt(3, 8);
    let c = start || pickInBucket(b1);
    for (let i = 0; i < cycles; i++) {
        const target = pickInBucket(i % 2 === 0 ? b2 : b1);
        const curve = Math.random() < 0.65 ? 'ease' : 'linear';
        segs.push({ duration: randomInRange(15, 45), fromCPM: c, toCPM: target, curve });
        c = target;
    }
    return segs;
}
// 2. 上升：从低/中低 爬到 中高/冲刺/爆发
function patternRising(start) {
    const segs = [];
    const startIdx = randInt(0, 2);
    const endIdx = randInt(Math.max(startIdx + 1, 2), 4);
    let c = start || pickInBucket(BUCKETS[startIdx]);
    if (Math.random() < 0.5) segs.push(holdSeg(c, 15, 40));
    for (let i = startIdx + 1; i <= endIdx; i++) {
        const target = pickInBucket(BUCKETS[i]);
        segs.push(transSeg(c, target, 12, 40));
        if (Math.random() < 0.55) segs.push(holdSeg(target, 12, 45));
        c = target;
    }
    return segs;
}
// 3. 下降：从高处逐步掉回
function patternFalling(start) {
    const segs = [];
    const startIdx = randInt(2, 4);
    const endIdx = randInt(0, Math.min(startIdx - 1, 2));
    let c = start || pickInBucket(BUCKETS[startIdx]);
    if (Math.random() < 0.5) segs.push(holdSeg(c, 15, 40));
    for (let i = startIdx - 1; i >= endIdx; i--) {
        const target = pickInBucket(BUCKETS[i]);
        segs.push(transSeg(c, target, 12, 40));
        if (Math.random() < 0.55) segs.push(holdSeg(target, 12, 45));
        c = target;
    }
    return segs;
}
// 4. 方波：每次翻转都重新从桶里随机挑值
function patternSquare(start) {
    const segs = [];
    const flips = randInt(4, 10);
    let useHigh = Math.random() < 0.5;
    let c = start || pickInBucket(pickBucket());
    for (let i = 0; i < flips; i++) {
        const bucket = useHigh
            ? pickBucket([0, 0, 0.25, 0.35, 0.40])  // 高侧：中高/冲刺/爆发
            : pickBucket([0.50, 0.40, 0.10, 0, 0]); // 低侧：低/中低
        const target = pickInBucket(bucket);
        segs.push(segInstant(c, target));
        segs.push(holdSeg(target, 12, 30));
        c = target;
        useHigh = !useHigh;
    }
    return segs;
}
// 5. 急速切换：更短周期（仍 ≥10s）
function patternRapidSwitch(start) {
    const segs = [];
    const flips = randInt(6, 12);
    let useHigh = Math.random() < 0.5;
    let c = start || pickInBucket(pickBucket());
    for (let i = 0; i < flips; i++) {
        const bucket = useHigh
            ? pickBucket([0, 0, 0.3, 0.4, 0.3])
            : pickBucket([0.6, 0.35, 0.05, 0, 0]);
        const target = pickInBucket(bucket);
        segs.push(segInstant(c, target));
        segs.push(segHold(randomInRange(10, 15), target));
        c = target;
        useHigh = !useHigh;
    }
    return segs;
}
// 6. 多峰：峰数 2-5 随机，每峰值独立随机
function patternMultiPeak(start) {
    const segs = [];
    const peakCount = randInt(2, 5);
    let base = start || pickInBucket(BUCKETS[0]);
    for (let i = 0; i < peakCount; i++) {
        const peak = pickInBucket(pickBucket([0, 0.10, 0.25, 0.30, 0.35]));
        segs.push({ duration: randomInRange(15, 40), fromCPM: base, toCPM: peak, curve: Math.random() < 0.5 ? 'linear' : 'ease' });
        segs.push(holdSeg(peak, 12, 28));
        base = pickInBucket(pickBucket([0.55, 0.35, 0.10, 0, 0]));
        segs.push({ duration: randomInRange(12, 30), fromCPM: peak, toCPM: base, curve: Math.random() < 0.5 ? 'linear' : 'ease' });
    }
    return segs;
}
// 7. 山谷：高 → 低 → 高
function patternValley(start) {
    const segs = [];
    const highBucket = pickBucket([0, 0, 0.3, 0.35, 0.35]);
    const lowBucket = pickBucket([0.7, 0.3, 0, 0, 0]);
    let c = start || pickInBucket(highBucket);
    segs.push(holdSeg(c, 20, 45));
    const low = pickInBucket(lowBucket);
    segs.push(Math.random() < 0.5 ? segInstant(c, low) : { duration: randomInRange(12, 25), fromCPM: c, toCPM: low, curve: 'linear' });
    segs.push(holdSeg(low, 20, 50));
    const high2 = pickInBucket(highBucket);
    segs.push(Math.random() < 0.5 ? segInstant(low, high2) : { duration: randomInRange(10, 25), fromCPM: low, toCPM: high2, curve: 'ease' });
    segs.push(holdSeg(high2, 15, 40));
    return segs;
}
// 8. 山峰：低 → 高 → 低（回落点也重新随机）
function patternPeak(start) {
    const segs = [];
    const lowBucket = pickBucket([0.6, 0.4, 0, 0, 0]);
    const highBucket = pickBucket([0, 0, 0.25, 0.35, 0.40]);
    let c = start || pickInBucket(lowBucket);
    segs.push(holdSeg(c, 25, 60));
    const high = pickInBucket(highBucket);
    segs.push({ duration: randomInRange(15, 40), fromCPM: c, toCPM: high, curve: 'ease' });
    segs.push(holdSeg(high, 20, 50));
    const newLow = pickInBucket(lowBucket);
    segs.push({ duration: randomInRange(15, 40), fromCPM: high, toCPM: newLow, curve: Math.random() < 0.5 ? 'linear' : 'ease' });
    return segs;
}
// 9. 长停留：任意桶长时间持续
function patternSustained(start) {
    const bucket = pickBucket();
    const target = pickInBucket(bucket);
    const segs = [];
    let c = start || target;
    if (Math.abs(c - target) > 5) {
        segs.push({ duration: randomInRange(15, 30), fromCPM: c, toCPM: target, curve: 'ease' });
    }
    segs.push(segHold(randomInRange(90, 240), target));
    const exit = pickInBucket(pickBucket());
    segs.push({ duration: randomInRange(15, 30), fromCPM: target, toCPM: exit, curve: 'linear' });
    return segs;
}
// 10. 过山车：随机游走全部桶，每段 ≥10s
function patternRollerCoaster(start) {
    const segs = [];
    const steps = randInt(5, 10);
    let c = start || pickInBucket(pickBucket());
    for (let i = 0; i < steps; i++) {
        const target = pickInBucket(pickBucket());
        const r = Math.random();
        if (r < 0.30) {
            segs.push(segInstant(c, target));
            segs.push(holdSeg(target, 10, 25));
        } else if (r < 0.70) {
            segs.push({ duration: randomInRange(12, 30), fromCPM: c, toCPM: target, curve: 'linear' });
            if (Math.random() < 0.4) segs.push(holdSeg(target, 10, 25));
        } else {
            segs.push({ duration: randomInRange(15, 35), fromCPM: c, toCPM: target, curve: 'ease' });
            if (Math.random() < 0.4) segs.push(holdSeg(target, 10, 25));
        }
        c = target;
    }
    return segs;
}
// 11. 阶梯（上升或下降，一桶一级）
function patternStairs(start) {
    const segs = [];
    const ascending = Math.random() < 0.5;
    const startIdx = ascending ? randInt(0, 1) : randInt(3, 4);
    const endIdx = ascending ? randInt(3, 4) : randInt(0, 1);
    const step = ascending ? 1 : -1;
    let c = start || pickInBucket(BUCKETS[startIdx]);
    for (let i = startIdx; ascending ? i <= endIdx : i >= endIdx; i += step) {
        const target = pickInBucket(BUCKETS[i]);
        if (i !== startIdx || Math.abs(c - target) > 5) {
            segs.push(segInstant(c, target));
        }
        segs.push(segHold(randomInRange(15, 35), target));
        c = target;
    }
    return segs;
}
// 12. 假动作：建势 → 回落 → 真冲刺
function patternFakeout(start) {
    const segs = [];
    let c = start || pickInBucket(BUCKETS[0]);
    segs.push(holdSeg(c, 20, 40));
    const fakePeak = pickInBucket(BUCKETS[2]);
    segs.push({ duration: randomInRange(15, 30), fromCPM: c, toCPM: fakePeak, curve: 'ease' });
    const dip = pickInBucket(pickBucket([0.5, 0.5, 0, 0, 0]));
    segs.push({ duration: randomInRange(15, 30), fromCPM: fakePeak, toCPM: dip, curve: 'linear' });
    segs.push(holdSeg(dip, 20, 45));
    const realPeak = pickInBucket(pickBucket([0, 0, 0, 0.4, 0.6]));
    segs.push({ duration: randomInRange(10, 25), fromCPM: dip, toCPM: realPeak, curve: 'linear' });
    segs.push(holdSeg(realPeak, 20, 50));
    return segs;
}
// 13. 爆发频繁：中频基底 + 多次短爆发尖峰
function patternBurstHeavy(start) {
    const segs = [];
    const baseBucket = pickBucket([0.3, 0.4, 0.3, 0, 0]);
    const spikeCount = randInt(3, 6);
    let c = start || pickInBucket(baseBucket);
    for (let i = 0; i < spikeCount; i++) {
        const base = pickInBucket(baseBucket);
        segs.push({ duration: randomInRange(10, 20), fromCPM: c, toCPM: base, curve: 'linear' });
        segs.push(holdSeg(base, 15, 35));
        const spike = pickInBucket(pickBucket([0, 0, 0, 0.35, 0.65]));
        segs.push(segInstant(base, spike));
        segs.push(segHold(randomInRange(10, 20), spike));
        c = spike;
    }
    return segs;
}
// 14. 回声：motif 重复 2-4 次，每次峰值独立随机
function patternEcho(start) {
    const segs = [];
    const repeats = randInt(2, 4);
    let c = start || pickInBucket(BUCKETS[0]);
    for (let i = 0; i < repeats; i++) {
        const low = pickInBucket(pickBucket([0.5, 0.5, 0, 0, 0]));
        const peak = pickInBucket(pickBucket([0, 0, 0.25, 0.35, 0.40]));
        segs.push({ duration: randomInRange(15, 30), fromCPM: c, toCPM: low, curve: 'linear' });
        segs.push(holdSeg(low, 12, 25));
        segs.push({ duration: randomInRange(15, 30), fromCPM: low, toCPM: peak, curve: 'ease' });
        segs.push(holdSeg(peak, 12, 25));
        c = peak;
    }
    return segs;
}
// 15. 分型爬升：进两步退一步，逐步推高
function patternFractalClimb(start) {
    const segs = [];
    let current = start || pickInBucket(BUCKETS[0]);
    const steps = randInt(3, 6);
    for (let i = 0; i < steps; i++) {
        const up = Math.min(260, current + randomInRange(15, 35));
        segs.push({ duration: randomInRange(12, 25), fromCPM: current, toCPM: up, curve: 'linear' });
        segs.push(segHold(randomInRange(10, 20), up));
        const down = Math.max(120, up - randomInRange(8, 20));
        segs.push({ duration: randomInRange(10, 20), fromCPM: up, toCPM: down, curve: 'linear' });
        segs.push(segHold(randomInRange(10, 20), down));
        current = down;
    }
    return segs;
}
// 16. 彩蛋：持续爆发 2-5 分钟
function patternSustainedBurst(start) {
    const segs = [];
    const burstVal = pickInBucket(BUCKETS[4]);
    let c = start || pickInBucket(BUCKETS[0]);
    segs.push({ duration: randomInRange(10, 20), fromCPM: c, toCPM: burstVal, curve: 'linear' });
    segs.push(segHold(randomInRange(120, 300), burstVal));
    segs.push({ duration: randomInRange(20, 40), fromCPM: burstVal, toCPM: pickInBucket(BUCKETS[1]), curve: 'linear' });
    return segs;
}
// 17. 彩蛋：持续极低 2-4 分钟
function patternSustainedLow(start) {
    const segs = [];
    let c = start || pickInBucket(BUCKETS[2]);
    const lowVal = pickInBucket(BUCKETS[0]);
    segs.push({ duration: randomInRange(15, 30), fromCPM: c, toCPM: lowVal, curve: 'linear' });
    segs.push(segHold(randomInRange(120, 240), lowVal));
    return segs;
}

// 带权模式池（彩蛋稀有）
const TEMPO_PATTERNS = [
    { fn: patternWave,           w: 10 },
    { fn: patternRising,         w: 9  },
    { fn: patternFalling,        w: 8  },
    { fn: patternSquare,         w: 8  },
    { fn: patternRapidSwitch,    w: 6  },
    { fn: patternMultiPeak,      w: 8  },
    { fn: patternValley,         w: 7  },
    { fn: patternPeak,           w: 7  },
    { fn: patternSustained,      w: 6  },
    { fn: patternRollerCoaster,  w: 9  },
    { fn: patternStairs,         w: 7  },
    { fn: patternFakeout,        w: 6  },
    { fn: patternBurstHeavy,     w: 7  },
    { fn: patternEcho,           w: 5  },
    { fn: patternFractalClimb,   w: 6  },
    { fn: patternSustainedBurst, w: 2  },  // 稀有彩蛋
    { fn: patternSustainedLow,   w: 1  }   // 更稀有彩蛋
];

function appendSprintPattern() {
    const last = tempoSchedule.length
        ? tempoSchedule[tempoSchedule.length - 1].toCPM
        : randomInRange(220, 250);
    const motif = randInt(0, 4);
    const segs = [];
    let current = clamp(last, 190, 300);

    if (motif === 0) {
        // 高频浪涌
        for (let i = 0; i < randInt(4, 8); i++) {
            const target = i % 2 === 0 ? randomInRange(250, 295) : randomInRange(210, 245);
            segs.push(segEase(randomInRange(8, 18), current, target));
            current = target;
        }
    } else if (motif === 1) {
        // 三段推进
        for (const target of [randomInRange(225, 245), randomInRange(250, 270), randomInRange(275, 300)]) {
            segs.push(segLinear(randomInRange(7, 14), current, target));
            segs.push(segHold(randomInRange(8, 18), target));
            current = target;
        }
    } else if (motif === 2) {
        // 高频跳变
        for (let i = 0; i < randInt(5, 10); i++) {
            const target = randomInRange(225, 300);
            segs.push(segInstant(current, target));
            segs.push(segHold(randomInRange(7, 14), target));
            current = target;
        }
    } else if (motif === 3) {
        // 高位持续，期间穿插短尖峰
        const base = randomInRange(225, 255);
        segs.push(segEase(randomInRange(8, 15), current, base));
        for (let i = 0; i < randInt(3, 6); i++) {
            segs.push(segHold(randomInRange(12, 24), base));
            const spike = randomInRange(275, 300);
            segs.push(segInstant(base, spike));
            segs.push(segHold(randomInRange(6, 12), spike));
            segs.push(segEase(randomInRange(6, 12), spike, base));
        }
    } else {
        // 短暂回落后突然爆发
        const dip = randomInRange(190, 220);
        segs.push(segLinear(randomInRange(8, 14), current, dip));
        segs.push(segHold(randomInRange(8, 16), dip));
        const burst = randomInRange(280, 300);
        segs.push(segInstant(dip, burst));
        segs.push(segHold(randomInRange(18, 40), burst));
    }

    tempoSchedule.push(...segs);
}

function appendNewPattern() {
    if (isSprinting) {
        appendSprintPattern();
        return;
    }
    const last = tempoSchedule.length
        ? tempoSchedule[tempoSchedule.length - 1].toCPM
        : randomInRange(140, 180);
    let total = 0;
    for (const p of TEMPO_PATTERNS) total += p.w;
    let r = Math.random() * total;
    let fn = TEMPO_PATTERNS[0].fn;
    for (const p of TEMPO_PATTERNS) {
        r -= p.w;
        if (r <= 0) { fn = p.fn; break; }
    }
    const segs = fn(last);
    tempoSchedule.push(...segs);
    maybeAppendRest();
}

// 休息段（0 BPM）：高频收尾后概率插入，最长 30s
function maybeAppendRest() {
    if (tempoSchedule.length === 0) return;
    const lastSeg = tempoSchedule[tempoSchedule.length - 1];
    if (lastSeg.curve === 'rest') return;
    const lastCPM = lastSeg.toCPM;
    let chance = 0.025;
    if (lastCPM > 230) chance = 0.30;
    else if (lastCPM > 210) chance = 0.18;
    else if (lastCPM > 180) chance = 0.08;
    else if (lastCPM > 160) chance = 0.04;
    if (Math.random() < chance) {
        tempoSchedule.push({
            duration: randomInRange(10, 30),
            fromCPM: 0,
            toCPM: 0,
            curve: 'rest'
        });
    }
}

function getCPMAtElapsed(elapsed) {
    let total = 0;
    for (const seg of tempoSchedule) total += seg.duration;
    while (elapsed >= total) {
        appendNewPattern();
        total = 0;
        for (const seg of tempoSchedule) total += seg.duration;
    }
    let t = 0;
    for (const seg of tempoSchedule) {
        if (elapsed < t + seg.duration) {
            const p = Math.min(1, Math.max(0, (elapsed - t) / seg.duration));
            if (seg.curve === 'rest') return 0;
            if (seg.curve === 'hold') return seg.fromCPM;
            if (seg.curve === 'instant') return p > 0 ? seg.toCPM : seg.fromCPM;
            if (seg.curve === 'linear') return seg.fromCPM + (seg.toCPM - seg.fromCPM) * p;
            if (seg.curve === 'ease') {
                const e = p * p * (3 - 2 * p);
                return seg.fromCPM + (seg.toCPM - seg.fromCPM) * e;
            }
        }
        t += seg.duration;
    }
    return 120;
}

function playClick(time, isAccent) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (isAccent) {
        // 重音：更高、更响、带噪声冲击
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1700, time);
        osc.frequency.exponentialRampToValueAtTime(650, time + 0.04);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.38, time + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
        osc.start(time);
        osc.stop(time + 0.1);

        // 噪声冲击
        const sr = audioCtx.sampleRate;
        const len = Math.floor(sr * 0.03);
        const buf = audioCtx.createBuffer(1, len, sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
        }
        const noise = audioCtx.createBufferSource();
        noise.buffer = buf;
        const ng = audioCtx.createGain();
        ng.gain.setValueAtTime(0.18, time);
        noise.connect(ng);
        ng.connect(audioCtx.destination);
        noise.start(time);
        noise.stop(time + 0.03);
    } else {
        // 普通音：更柔和、音调低
        osc.type = 'sine';
        osc.frequency.setValueAtTime(950, time);
        osc.frequency.exponentialRampToValueAtTime(520, time + 0.03);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.18, time + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
        osc.start(time);
        osc.stop(time + 0.08);
    }
}

function scheduleBeatVisual(time, isAccent) {
    if (!audioCtx) return;
    const delay = Math.max(0, (time - audioCtx.currentTime) * 1000);
    setTimeout(() => flashBeatDot(isAccent), delay);
}

function flashBeatDot(isAccent) {
    const dot = isAccent ? beatDotAccent : beatDotNormal;
    const cls = isAccent ? 'flash-accent' : 'flash-normal';
    dot.classList.remove(cls);
    void dot.offsetWidth;
    dot.classList.add(cls);
    if (isSprinting && isAccent) pulseSprintRing();
}

// 冲刺时环跟着重音跳动，并向外扩散一圈。
let sprintWaveIndex = 0;
function pulseSprintRing() {
    if (prefersReducedMotion()) return;
    stageRing.animate([{ scale: 1 }, { scale: 1.024 }, { scale: 1 }], { duration: 170, easing: 'ease-out' });
    const wave = sprintWaves[sprintWaveIndex++ % sprintWaves.length];
    wave.animate([
        { scale: 1, opacity: 0.6 },
        { scale: 1.3, opacity: 0 }
    ], { duration: 640, easing: 'cubic-bezier(.22, 1, .36, 1)' });
}

function updateBreathDuration(cpm) {
    const dur = 60 / cpm;
    if (Math.abs(dur - lastBreathDuration) > 0.04) {
        timerContainer.style.setProperty('--breath-duration', `${dur.toFixed(3)}s`);
        lastBreathDuration = dur;
    }
}

let lastScheduledRestEnd = 0;
function setRestVisual(isResting) {
    beatDotsEl.classList.toggle('resting', isResting);
    timerContainer.classList.toggle('resting', isResting);
}

function findSegmentAt(elapsed) {
    let total = 0;
    for (const seg of tempoSchedule) total += seg.duration;
    while (elapsed >= total) {
        appendNewPattern();
        total = 0;
        for (const seg of tempoSchedule) total += seg.duration;
    }
    let t = 0;
    for (const seg of tempoSchedule) {
        if (elapsed < t + seg.duration) {
            return { seg, startT: t };
        }
        t += seg.duration;
    }
    return null;
}

function getEffectiveCPM(baseCPM) {
    if (isSprinting) {
        // 冲刺阶段使用独立高频，不接受用户的倍率或偏移调整。
        return clamp(baseCPM, 190, 300);
    }
    return clamp(baseCPM * tempoScale + tempoOffset, 60, 320);
}

function metroTick() {
    if (!metroActive || !audioCtx) return;
    // 设备休眠恢复后不补放积压的节拍。
    if (nextBeatTime < audioCtx.currentTime - 0.1) {
        nextBeatTime = audioCtx.currentTime + 0.05;
    }
    while (nextBeatTime < audioCtx.currentTime + LOOKAHEAD) {
        const elapsed = nextBeatTime - scheduleStartTime;
        const found = findSegmentAt(elapsed);
        if (found && found.seg.curve === 'rest') {
            const restStart = scheduleStartTime + found.startT;
            const restEnd = restStart + found.seg.duration;
            if (Math.abs(restEnd - lastScheduledRestEnd) > 0.01) {
                lastScheduledRestEnd = restEnd;
                const delayOn = Math.max(0, (restStart - audioCtx.currentTime) * 1000);
                const delayOff = Math.max(0, (restEnd - audioCtx.currentTime) * 1000);
                setTimeout(() => { if (metroActive) setRestVisual(true); }, delayOn);
                setTimeout(() => { if (metroActive) setRestVisual(false); }, delayOff);
            }
            nextBeatTime = restEnd + 0.02;
            beatCounter = 0; // 休息后重新以重音开场
            continue;
        }
        const cpm = getEffectiveCPM(getCPMAtElapsed(elapsed));
        const isAccent = (beatCounter % 2 === 0);
        playClick(nextBeatTime, isAccent);
        scheduleBeatVisual(nextBeatTime, isAccent);
        updateBreathDuration(cpm);
        nextBeatTime += 30 / cpm;
        beatCounter++;
    }
}

function startMetronome() {
    if (metroActive) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    metroActive = true;
    tempoSchedule = [];
    beatCounter = 0;
    nextBeatTime = ctx.currentTime + 0.1;
    scheduleStartTime = nextBeatTime;
    appendNewPattern();
    beatDotsEl.classList.remove('hidden');
    metroSchedulerId = startTicker(metroTick, SCHED_INTERVAL);
}

function stopMetronome() {
    metroActive = false;
    if (metroSchedulerId) metroSchedulerId.stop();
    metroSchedulerId = null;
    tempoSchedule = [];
    beatDotsEl.classList.add('hidden');
    timerContainer.style.setProperty('--breath-duration', '2s');
    lastBreathDuration = -1;
    lastScheduledRestEnd = 0;
    setRestVisual(false);
}

// ========== 屏幕常亮 ==========
let wakeLock = null;

async function acquireWakeLock() {
    if (!timerInterval || document.visibilityState !== 'visible' || !navigator.wakeLock || wakeLock) return;
    try {
        const lock = await navigator.wakeLock.request('screen');
        if (!timerInterval && !timerEnded) {
            await lock.release();
            return;
        }
        wakeLock = lock;
        lock.addEventListener('release', () => {
            if (wakeLock === lock) wakeLock = null;
        });
    } catch (e) {
        // 屏幕常亮不是必需功能。
    }
}

function releaseWakeLock() {
    const lock = wakeLock;
    wakeLock = null;
    if (lock) lock.release().catch(() => {});
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
        saveSessionSnapshot();
        return;
    }
    if (!timerInterval) return;
    tick();
    if (metroActive) ensureAudio();
    acquireWakeLock();
});

// ========== 中断恢复 ==========
const SESSION_KEY = 'focus-timer.focus.session.v1';
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const SNAPSHOT_INTERVAL_MS = 5 * 1000;
let lastSnapshotAt = 0;

function saveSessionSnapshot() {
    if (!timerInterval && !timerEnded) return;
    syncTimeLeft();
    lastSnapshotAt = Date.now();
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            savedAt: lastSnapshotAt,
            config, isRandomMode, isHideTimeMode, isCoolingDown, isSprinting,
            timeLeft, currentPhaseStartTime, lastTaskRemainingTime, skipCoolingAfterSprint,
            sessionHistory, tempoScale, tempoOffset
        }));
    } catch (e) {
        // 无法写入时只是失去恢复能力，不影响计时。
    }
}

function clearSessionSnapshot() {
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch (e) {
        // 同上。
    }
}

function readSessionSnapshot() {
    try {
        const snapshot = JSON.parse(localStorage.getItem(SESSION_KEY));
        return snapshot && Date.now() - snapshot.savedAt < SESSION_MAX_AGE_MS ? snapshot : null;
    } catch (e) {
        return null;
    }
}

function setAwaitingResume(on) {
    awaitingResume = on;
    timerContainer.classList.toggle('awaiting-resume', on);
    resumeBtn.classList.toggle('hidden', !on);
}

// 页面被关闭或刷新后回到中断的位置，声音需要用户点一下才能恢复。
function offerResume(snapshot) {
    config = snapshot.config;
    isRandomMode = snapshot.isRandomMode;
    isHideTimeMode = snapshot.isHideTimeMode;
    isCoolingDown = snapshot.isCoolingDown;
    isSprinting = snapshot.isSprinting;
    timeLeft = snapshot.timeLeft;
    currentPhaseStartTime = snapshot.currentPhaseStartTime;
    lastTaskRemainingTime = snapshot.lastTaskRemainingTime;
    skipCoolingAfterSprint = snapshot.skipCoolingAfterSprint;
    sessionHistory = snapshot.sessionHistory;
    tempoScale = snapshot.tempoScale;
    tempoOffset = snapshot.tempoOffset;
    setAwaitingResume(true);
    showTimerPage();
    enterSessionGuard(primeForceEnd);
    updateUI();
}

resumeBtn.addEventListener('click', () => {
    const plannedSeconds = currentPhaseStartTime;
    setAwaitingResume(false);
    ensureAudio();
    startTimer();
    currentPhaseStartTime = plannedSeconds;
    updateUI();
});

// ========== 设置保存 ==========
const SETTINGS_KEY = 'focus-timer.focus.v1';
const settingInputs = [...configContainer.querySelectorAll('input')];

function saveSettings() {
    updateHero();
    const values = {};
    settingInputs.forEach((input) => {
        values[input.id] = input.value;
    });
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ values, focusMode: currentFocusMode(), isHideTimeMode: hideTimePreference, isExMode }));
    } catch (e) {
        // 无法写入本地存储时，设置只在本次页面中有效。
    }
}

function restoreSettings() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    } catch (e) {
        return;
    }
    if (!saved) return;
    settingInputs.forEach((input) => {
        if (typeof saved.values?.[input.id] === 'string') input.value = saved.values[input.id];
    });
    hideTimePreference = Boolean(saved.isHideTimeMode);
    setFocusMode(saved.focusMode ?? (saved.isRandomMode ? 'random' : 'fixed'));
    setExMode(Boolean(saved.isExMode));
}

configContainer.addEventListener('input', saveSettings);
restoreSettings();
[initialTimeSlider, coolingTimeSlider, multiplierSlider].forEach(paintRange);
updateHero();

// 宽屏下冲刺设置固定展开，占满右栏。
const wideLayout = window.matchMedia?.('(min-width: 900px)');
if (wideLayout?.matches) sprintDetails.open = true;
wideLayout?.addEventListener('change', (event) => {
    if (event.matches) sprintDetails.open = true;
});

protectSession(() => Boolean(timerInterval || timerEnded));
const pendingSession = readSessionSnapshot();
if (pendingSession) offerResume(pendingSession);
