// 两个页面共用的界面工具。

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function clockGlyph(char) {
    if (char === '*') return '<i class="clock-dot"></i>';
    return `<b>${char}</b>`;
}

function clockCell(char) {
    if (/\d|\*/.test(char)) return `<span class="clock-cell">${clockGlyph(char)}</span>`;
    return `<span class="clock-sep${char === ':' ? '' : ' is-text'}">${char}</span>`;
}

function rollCell(cell, char) {
    const template = document.createElement('template');
    template.innerHTML = clockGlyph(char);
    const next = template.content.firstElementChild;

    while (cell.children.length > 1) cell.firstElementChild.remove();
    const previous = cell.firstElementChild;
    cell.append(next);

    if (prefersReducedMotion()) {
        previous.remove();
        return;
    }
    const options = { duration: 360, easing: 'cubic-bezier(.32, .72, 0, 1)', fill: 'both' };
    previous.animate([
        { transform: 'none', opacity: 1 },
        { transform: 'translateY(-55%)', opacity: 0 }
    ], options).onfinish = () => previous.remove();
    next.animate([
        { transform: 'translateY(55%)', opacity: 0 },
        { transform: 'none', opacity: 1 }
    ], options);
}

// 数字每位独立成格，只有变化的那一位滚动。
function setClock(el, text) {
    const previous = el.dataset.value ?? '';
    if (previous === text) return;
    el.dataset.value = text;
    el.setAttribute('aria-label', text);

    const chars = [...text];
    const isGlyph = char => /\d|\*/.test(char);
    const sameShape = previous.length === text.length
        && chars.every((char, index) => (isGlyph(char) ? isGlyph(previous[index]) : char === previous[index]));
    if (!sameShape) {
        el.innerHTML = chars.map(clockCell).join('');
        return;
    }
    chars.forEach((char, index) => {
        if (previous[index] !== char) rollCell(el.children[index], char);
    });
}

function paintRange(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const progress = (Number(input.value) - min) / (max - min);
    input.style.setProperty('--p', Math.min(1, Math.max(0, progress)).toFixed(4));
}

function withViewTransition(update) {
    if (!document.startViewTransition || prefersReducedMotion()) {
        update();
        return;
    }
    // 连续触发时旧转场会被跳过，这不是错误。
    const transition = document.startViewTransition(update);
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
}

// 运动和计时时浏览器状态栏跟随深色画布。
function setSessionChrome(active) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
        meta.dataset.idle ??= meta.content;
        meta.content = active ? '#000000' : meta.dataset.idle;
    });
}

// 计时中拦住系统返回：留在当前页，由页面决定如何提示。
let sessionGuard = null;

function enterSessionGuard(onBack) {
    sessionGuard = onBack;
    if (!history.state?.session) history.pushState({ session: true }, '');
}

function leaveSessionGuard() {
    if (!sessionGuard) return;
    sessionGuard = null;
    if (history.state?.session) history.back();
}

window.addEventListener('popstate', () => {
    if (!sessionGuard) return;
    history.pushState({ session: true }, '');
    sessionGuard();
});

function protectSession(isActive) {
    window.addEventListener('beforeunload', (event) => {
        if (isActive()) event.preventDefault();
    });
}

// 跨页转场被跳过时（如导航途中再次切换）不算错误。
['pageswap', 'pagereveal'].forEach((type) => {
    window.addEventListener(type, event => event.viewTransition?.ready.catch(() => {}));
});
