const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'focus.js'), 'utf8');

function harness({ storage } = {}) {
    let now = 1000000;
    const elements = new Map();
    const intervals = new Map();
    const timeouts = new Map();
    let id = 0;
    const element = () => {
        const classes = new Set();
        return {
            value: '', textContent: '', innerHTML: '', dataset: {}, style: { setProperty() {} },
            classList: {
                add: name => classes.add(name),
                remove: name => classes.delete(name),
                contains: name => classes.has(name),
                toggle: (name, on) => (on ? classes.add(name) : classes.delete(name))
            },
            setAttribute() {}, addEventListener(type, callback) { (this.listeners ??= {})[type] = callback; },
            querySelector() { return { textContent: '' }; }, querySelectorAll() { return []; },
            click() { this.listeners.click(); }
        };
    };
    const documentStub = {
        body: element(), visibilityState: 'visible', addEventListener() {},
        getElementById(name) {
            if (!elements.has(name)) elements.set(name, element());
            return elements.get(name);
        }
    };
    const context = vm.createContext({
        document: documentStub, window: { scrollTo() {} }, navigator: {}, console,
        setInterval(callback) { intervals.set(++id, callback); return id; },
        clearInterval(handle) { intervals.delete(handle); },
        setTimeout(callback, delay) { timeouts.set(++id, { at: now + delay, callback }); return id; },
        clearTimeout(handle) { timeouts.delete(handle); },
        requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
        setClock(el, text) { el.textContent = text; }, paintRange() {}, setSessionChrome() {}, withViewTransition(update) { update(); },
        enterSessionGuard() {}, leaveSessionGuard() {}, protectSession() {}
    });
    if (storage) context.localStorage = storage;
    context.nowMs = () => now;
    vm.runInContext('Date.now = () => nowMs();', context);
    vm.runInContext(source, context);
    const run = code => vm.runInContext(code, context);
    const el = name => documentStub.getElementById(name);
    return {
        run, el,
        passTime(seconds) { now += seconds * 1000; },
        // One late timer callback, the way a throttled background tab delivers it.
        sleepThenTick(seconds) {
            now += seconds * 1000;
            [...intervals.values()].forEach(callback => callback());
        },
        // Runs due timeouts too, so reveal timers behave as in a browser.
        advance(seconds) {
            for (let i = 0; i < seconds * 5; i++) {
                now += 200;
                for (const [handle, timeout] of [...timeouts]) {
                    if (timeout.at <= now) {
                        timeouts.delete(handle);
                        timeout.callback();
                    }
                }
                [...intervals.values()].forEach(callback => callback());
            }
        },
        start({ initial = '5', cooling = '3', sprintChance = '0', hide = false } = {}) {
            el('initial-time-input').value = initial;
            el('cooling-time-input').value = cooling;
            el('multiplier-input').value = '1';
            el('sprint-chance').value = sprintChance;
            if (hide) el('hide-time-toggle').click();
            el('confirm-btn').click();
        }
    };
}

test('a throttled timer still reports the real remaining time', () => {
    const h = harness();
    h.start();
    h.sleepThenTick(90);
    assert.equal(h.run('timeLeft'), 210);
    assert.equal(h.el('timer-display').textContent, '03:30');
});

test('a late tick carries overflow through cooling into the next focus stage', () => {
    const h = harness();
    h.start();
    h.advance(100);
    h.el('trigger-btn').click();
    assert.equal(h.run('isCoolingDown'), true);
    assert.equal(h.run('timeLeft'), 180);
    h.sleepThenTick(200);
    assert.equal(h.run('isCoolingDown'), false);
    // The next stage is 200 s long and began 20 s before this tick.
    assert.equal(h.run('timeLeft'), 180);
});

test('a phase that fully elapsed in the background still reaches the complete page', () => {
    const h = harness();
    h.start();
    h.sleepThenTick(10000);
    assert.equal(h.el('complete-container').classList.contains('hidden'), false);
    assert.equal(h.run('sessionHistory.length'), 1);
    assert.equal(h.run('sessionHistory[0].duration'), 300);
});

test('the trigger records the time at the moment of the click, not the last tick', () => {
    const h = harness();
    h.start();
    h.passTime(42);
    h.el('trigger-btn').click();
    assert.equal(h.run('sessionHistory[0].duration'), 42);
    assert.equal(h.run('lastTaskRemainingTime'), 258);
});

test('peek stays visible for five seconds, keeps counting, then hides again', () => {
    const h = harness();
    h.run('Math.random = () => 0');
    h.start({ hide: true });
    h.advance(10);
    assert.equal(h.el('timer-display').textContent, '**:**');
    h.el('peek-time-btn').click();
    assert.equal(h.run('timeLeft'), 290 + 180);
    assert.equal(h.el('timer-display').textContent, '07:50');
    h.advance(2);
    assert.equal(h.el('timer-display').textContent, '07:48');
    h.advance(2.8);
    assert.notEqual(h.el('timer-display').textContent, '**:**');
    h.advance(0.4);
    assert.equal(h.el('timer-display').textContent, '**:**');
    assert.equal(h.run('currentPhaseStartTime'), 300 + 180);
});

test('peek during cooling does nothing and does not start its cooldown', () => {
    const h = harness();
    h.start({ hide: true });
    h.el('trigger-btn').click();
    assert.equal(h.run('isCoolingDown'), true);
    h.el('peek-time-btn').click();
    assert.equal(h.run('peekCooldownEnd'), 0);
});

test('hidden mode waits for the trigger after the focus time runs out', () => {
    const h = harness();
    h.start({ hide: true });
    h.advance(301);
    assert.equal(h.run('timerEnded'), true);
    assert.equal(h.el('complete-container').classList.contains('hidden'), true);
    h.el('trigger-btn').click();
    assert.equal(h.el('complete-container').classList.contains('hidden'), false);
});

test('tempo buttons move the phase end along with the displayed time', () => {
    const h = harness();
    h.run('Math.random = () => 0');
    h.start();
    h.el('tempo-down-btn').click();
    assert.equal(h.run('timeLeft'), 330);
    h.advance(10);
    assert.equal(h.run('timeLeft'), 320);
});

test('settings survive a reload, including toggles', () => {
    const data = new Map();
    const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    const first = harness({ storage });
    first.el('hide-time-toggle').click();
    first.el('mode-ex').click();
    assert.equal(JSON.parse([...data.values()][0]).isHideTimeMode, true);

    const second = harness({ storage });
    assert.equal(second.run('isHideTimeMode'), true);
    assert.equal(second.run('isExMode'), true);
});

function memoryStorage() {
    const data = new Map();
    return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

test('a reopened page waits at the interrupted phase and continues on tap', () => {
    const storage = memoryStorage();
    const first = harness({ storage });
    first.start();
    first.advance(20);
    first.el('trigger-btn').click();
    first.advance(61);

    const second = harness({ storage });
    assert.equal(second.run('awaitingResume'), true);
    assert.equal(second.run('isCoolingDown'), true);
    assert.equal(second.run('Boolean(timerInterval)'), false);
    assert.equal(second.run('sessionHistory.length'), 1);
    const remaining = second.run('timeLeft');
    assert.ok(remaining >= 119 && remaining <= 124);

    second.el('resume-btn').click();
    assert.equal(second.run('awaitingResume'), false);
    assert.equal(second.run('Boolean(timerInterval)'), true);
    assert.equal(second.run('currentPhaseStartTime'), 180);
    second.advance(10);
    assert.equal(second.run('timeLeft'), remaining - 10);
});

test('completing a session clears what could be resumed', () => {
    const storage = memoryStorage();
    const h = harness({ storage });
    h.start();
    h.sleepThenTick(10000);
    assert.equal(storage.data.has('focus-timer.focus.session.v1'), false);
});

test('full random forces hidden time, then restores the previous choice', () => {
    const h = harness();
    h.el('mode-surprise').click();
    assert.equal(h.run('isHideTimeMode'), true);
    assert.equal(h.el('hide-time-toggle').disabled, true);
    h.el('hide-time-toggle').click();
    assert.equal(h.run('isHideTimeMode'), true);
    h.el('mode-fixed').click();
    assert.equal(h.run('isHideTimeMode'), false);
    assert.equal(h.el('hide-time-toggle').disabled, false);
});

test('full random hides the settings it generates and starts from the one start button', () => {
    const h = harness();
    h.el('mode-surprise').click();
    assert.equal(h.el('sprint-details').classList.contains('hidden'), true);
    assert.equal(h.el('config-items').classList.contains('hidden'), true);
    assert.equal(h.el('random-mode-options').classList.contains('hidden'), true);
    h.el('confirm-btn').click();
    assert.equal(h.run('Boolean(timerInterval)'), true);
    assert.equal(h.run('isHideTimeMode'), true);
});

test('settings saved before the three-way mode still load', () => {
    const storage = memoryStorage();
    storage.setItem('focus-timer.focus.v1', JSON.stringify({ values: {}, isRandomMode: true, isHideTimeMode: false, isExMode: false }));
    const h = harness({ storage });
    assert.equal(h.run('currentFocusMode()'), 'random');
});
