const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'workout.js'), 'utf8');

function harness() {
    let now = 0;
    const elements = new Map();
    const sounds = [];
    const intervals = new Map();
    const frames = new Map();
    let id = 0;
    const element = () => ({
        value: '', textContent: '', innerHTML: '', hidden: false, disabled: false,
        style: { setProperty() {} }, classList: { toggle() {} },
        focus() {}, addEventListener() {}, querySelectorAll() { return []; }
    });
    class AudioContext {
        state = 'running';
        get currentTime() { return now / 1000; }
        createOscillator() {
            const sound = { frequency: {}, connect() {}, disconnect() {},
                start(at) { this.at = at; sounds.push(this); },
                stop(at) { if (at === undefined) this.cancelled = true; }
            };
            return sound;
        }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    }
    const context = vm.createContext({
        document: { visibilityState: 'visible', addEventListener() {}, getElementById(id) {
            if (!elements.has(id)) elements.set(id, element());
            return elements.get(id);
        } },
        window: { scrollTo() {}, AudioContext }, navigator: {}, performance: { now: () => now },
        setInterval(callback) { intervals.set(++id, callback); return id; },
        clearInterval(id) { intervals.delete(id); },
        requestAnimationFrame(callback) { frames.set(++id, callback); return id; },
        cancelAnimationFrame(id) { frames.delete(id); },
        alert(message) { throw new Error(message); }, console
    });
    vm.runInContext(source, context);
    const run = code => vm.runInContext(code, context);
    return { run, sounds, elements, intervals, frames,
        time(ms) { now = ms; },
        advance(ms) { now = ms; run('syncTime(performance.now()); updateCurrentDisplay();'); },
        plan(stages) {
            context.stages = stages;
            run('timeline = stages; activities = timeline.filter(item => item.kind === "exercise"); startTimer();');
        }
    };
}

const exercise = (seconds, extra = {}) => ({ kind: 'exercise', type: 'A', name: '深蹲', group: 1, seconds, ...extra });

test('timed exercise rings once, twice, three times at quarter milestones', () => {
    const h = harness();
    h.plan([exercise(40)]);
    for (let at = 0; at <= 40000; at += 25) h.advance(at);
    const times = h.sounds.map(sound => Math.round(sound.at * 1000));
    assert.deepEqual(times, [0, 10000, 20000, 20220, 30000, 30220, 30440, 40000]);
    assert.equal(h.run('running'), false);
    assert.equal(h.elements.get('progress-bar').style.width, '100%');
    assert.equal(h.intervals.size, 0);
    assert.equal(h.frames.size, 0);
});

test('each rep has equally spaced light and heavy beats; final heavy also signals transition', () => {
    const h = harness();
    h.plan([exercise(6, { reps: 3, secondsPerRep: 2 }), { kind: 'rest', seconds: 2, group: 1 }]);
    for (let at = 0; at <= 6000; at += 25) h.advance(at);
    assert.deepEqual(h.sounds.map(sound => [Math.round(sound.at * 1000), sound.frequency.value]),
        [[0, 1046], [1000, 740], [2000, 1046], [3000, 740], [4000, 1046], [5000, 740], [6000, 1046]]);
    assert.equal(h.run('currentIndex'), 1);
});

test('pause cancels scheduled sound and resume reschedules a pending beat without time drift', () => {
    const h = harness();
    h.plan([exercise(8, { reps: 4, secondsPerRep: 2 })]);
    h.advance(950);
    assert.equal(h.sounds.length, 2);
    h.run('togglePause()');
    assert.equal(h.sounds[1].cancelled, true);
    h.advance(20000);
    assert.equal(h.run('currentRemaining'), 7.05);
    h.run('togglePause()');
    assert.equal(h.sounds.length, 3);
    assert.equal(Math.round(h.sounds[2].at * 1000), 20050);
    h.advance(21050);
    assert.equal(h.elements.get('rep-count').textContent, '1 / 4 次');
});

test('skip while paused stays silent and retains the full next stage duration', () => {
    const h = harness();
    h.plan([{ kind: 'prepare', type: 'A', name: '深蹲', group: 1, seconds: 5 }, exercise(10)]);
    h.advance(2000);
    h.run('togglePause(); skipCurrent()');
    assert.equal(h.run('paused'), true);
    assert.equal(h.run('currentRemaining'), 10);
    assert.equal(h.sounds.length, 1);
    h.time(12000);
    h.run('togglePause()');
    h.advance(13000);
    assert.equal(h.run('currentRemaining'), 9);
});

test('delayed tick carries elapsed time across preparation, exercise and rest without stale sound bursts', () => {
    const h = harness();
    h.plan([{ kind: 'prepare', seconds: 5, group: 1 }, exercise(8), { kind: 'rest', seconds: 3, group: 1 }, exercise(20, { group: 2 })]);
    h.advance(18000);
    assert.equal(h.run('currentIndex'), 3);
    assert.equal(h.run('currentRemaining'), 18);
    assert.equal(h.sounds.length, 2);
    h.advance(100000);
    assert.equal(h.run('running'), false);
    assert.equal(h.run('currentRemaining'), 0);
});

test('upcoming queue excludes past and current exercise and keeps preparing exercise visible', () => {
    const h = harness();
    h.plan([exercise(5, { name: '已过去' }), { kind: 'prepare', seconds: 5, group: 2 }, exercise(5, { name: '下一组', group: 2 }), exercise(5, { name: '最后一组', group: 3 })]);
    h.advance(5000);
    let html = h.elements.get('upcoming-list').innerHTML;
    assert.ok(!html.includes('已过去'));
    assert.ok(html.includes('下一组') && html.includes('最后一组'));
    h.advance(10000);
    html = h.elements.get('upcoming-list').innerHTML;
    assert.ok(!html.includes('第 2 组'));
    assert.ok(html.includes('最后一组'));
});

test('stop cancels all sounds, returns to configuration and allows a fresh restart', () => {
    const h = harness();
    h.plan([exercise(20)]);
    h.advance(4900);
    h.run('resetTimerState()');
    assert.equal(h.run('running'), false);
    assert.equal(h.elements.get('session-view').hidden, true);
    assert.equal(h.elements.get('setup-view').hidden, false);
    assert.ok(h.sounds.every(sound => sound.cancelled));
    assert.equal(h.intervals.size, 0);
    h.run('startTimer()');
    assert.equal(h.run('currentRemaining'), 20);
    assert.equal(h.intervals.size, 1);
});

test('configuration calculates total time from reps times seconds per rep and preserves zero weights', () => {
    const h = harness();
    h.run(`configListEl.querySelectorAll = () => [{
        dataset: { type: 'A', mode: 'reps' },
        querySelector: key => ({ value: key.includes('mode') ? 'reps' : key.includes('name') ? '跳' : '1' }),
        querySelectorAll: () => [{ querySelector: key => ({ value: key.includes('reps') ? '16' : key.includes('seconds') ? '1.5' : '0' }) }]
    }]; readConfigFromDom();`);
    assert.equal(h.run('exerciseConfig.A.options[0].seconds'), 24);
    assert.equal(h.run('exerciseConfig.A.options[0].secondsPerRep'), 1.5);
    assert.equal(h.run('exerciseConfig.A.options[0].weight'), 0);
});

test('generated plan adds preparation before every exercise, rest only between exercises, and supports zero', () => {
    const h = harness();
    h.run(`readConfigFromDom = () => {};
        exerciseConfig = { A: { name: '深蹲', weight: 1, mode: 'time', options: [{ seconds: 20, weight: 1 }] } };
        targetInput.value = '1'; restInput.value = '7'; prepareInput.value = '5'; createPlan();`);
    assert.equal(h.run('timeline.map(item => item.kind).join(",")'), 'prepare,exercise,rest,prepare,exercise,rest,prepare,exercise');
    assert.equal(h.run('timeline.reduce((sum, item) => sum + item.seconds, 0)'), 89);
    h.run("restInput.value = '0'; prepareInput.value = '0'; createPlan();");
    assert.equal(h.run('timeline.length'), 3);
    assert.equal(h.run('timeline.every(item => item.kind === "exercise")'), true);
});

test('exercise names are escaped in generated HTML', () => {
    const h = harness();
    h.plan([exercise(10, { name: '<img src=x onerror=alert(1)>' }), exercise(10, { name: '<b>next</b>', group: 2 })]);
    h.run('renderPlan()');
    assert.ok(!h.elements.get('plan-list').innerHTML.includes('<img'));
    assert.ok(h.elements.get('upcoming-list').innerHTML.includes('&lt;b&gt;next&lt;/b&gt;'));
});


test('initial transition waits for a suspended audio context to resume', async () => {
    const h = harness();
    h.run(`window.AudioContext = class extends window.AudioContext {
        state = 'suspended';
        resume() { return Promise.resolve().then(() => { this.state = 'running'; }); }
    };`);
    h.plan([exercise(10)]);
    assert.equal(h.sounds.length, 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.sounds.length, 1);
});

test('pausing before audio unlock prevents a delayed start sound', async () => {
    const h = harness();
    h.run(`window.AudioContext = class extends window.AudioContext {
        state = 'suspended';
        resume() { return Promise.resolve().then(() => { this.state = 'running'; }); }
    };`);
    h.plan([exercise(10)]);
    h.run('togglePause()');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.sounds.length, 0);
});
