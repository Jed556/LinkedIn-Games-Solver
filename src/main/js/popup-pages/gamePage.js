import { extractRemainingLinkedInGameAnswers } from '../remainingGamesExtractor.js';

const polyfilledBrowser = (typeof browser !== 'undefined') ? browser : chrome;

const gameConfig = {
    zip: {
        matcher: (url) => url.includes('linkedin.com/games/zip'),
        solverHook: 'zipPopupButtonOnClick',
        previewHook: 'zipPopupPreviewData',
    },
    sudoku: {
        matcher: (url) => url.includes('linkedin.com/games/sudo')
            || url.includes('linkedin.com/games/mini-sudo')
            || url.includes('linkedin.com/games/minisudo'),
        solverHook: 'sudokuPopupButtonOnClick',
        previewHook: 'sudokuPopupPreviewData',
    },
    queens: {
        matcher: (url) => url.includes('linkedin.com/games/queens'),
        solverHook: 'queensPopupButtonOnClick',
        previewHook: 'queensPopupPreviewData',
    },
    tango: {
        matcher: (url) => url.includes('linkedin.com/games/tango'),
        solverHook: 'tangoPopupButtonOnClick',
        previewHook: 'tangoPopupPreviewData',
    },
    pinpoint: {
        externalSource: true,
    },
    crossclimb: {
        matcher: (url) => url.includes('linkedin.com/games/crossclimb'),
        solverHook: 'crossclimbPopupButtonOnClick',
        externalSource: true,
    },
};

const ZIP_GRADIENT_PALETTES = [
    ['#f43f5e', '#f97316'],
    ['#34d399', '#16a34a'],
];

const game = document.body?.dataset?.game;
const backBtn = document.getElementById('backBtn');
const refreshBtn = document.getElementById('refreshBtn');
const settingsBtn = document.getElementById('settingsBtn');
const autoSolveBtn = document.getElementById('autoSolveBtn');
const modal = document.getElementById('modal');
const status = document.getElementById('status');
const previewContainer = document.getElementById('previewContainer');

let activeTab = null;
let latestExternalAnswers = null;

initialize();

function initialize() {
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = '../../popup.html';
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            window.location.href = '../../settings.html';
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (gameConfig[game]?.externalSource) {
                loadExternalAnswers();
                return;
            }
            hydratePageState();
        });
    }

    if (autoSolveBtn) {
        autoSolveBtn.addEventListener('click', () => {
            solveActiveGame();
        });
    }

    hydratePageState();
}

function setStatus(message) {
    if (!status) return;
    if (typeof message === 'string') {
        status.textContent = message;
    } else if (message instanceof Node) {
        status.innerHTML = '';
        status.appendChild(message);
    }
}

async function hydratePageState() {
    if (!game || !(game in gameConfig)) {
        setStatus('Unsupported game page.');
        if (autoSolveBtn) {
            autoSolveBtn.disabled = true;
        }
        return;
    }

    const config = gameConfig[game];
    if (config.externalSource) {
        activeTab = null;
        if (config.solverHook && config.matcher) {
            try {
                const [tab] = await polyfilledBrowser.tabs.query({
                    active: true,
                    currentWindow: true,
                });
                if (tab?.url && config.matcher(tab.url)) {
                    activeTab = tab;
                }
            } catch (_e) {
                activeTab = null;
            }
        }
        if (autoSolveBtn) {
            autoSolveBtn.disabled = !(config.solverHook && activeTab?.id);
            autoSolveBtn.textContent = 'Solve';
        }
        if (modal) {
            modal.style.display = 'none';
        }
        setStatus('');
        await loadExternalAnswers();
        return;
    }

    try {
        const [tab] = await polyfilledBrowser.tabs.query({
            active: true,
            currentWindow: true,
        });
        activeTab = tab ?? null;
    } catch (_e) {
        activeTab = null;
    }

    if (!activeTab?.url) {
        setStatus('No active tab found.');
        if (autoSolveBtn) {
            autoSolveBtn.disabled = true;
        }
        return;
    }

    const { matcher } = config;
    const isMatchingTab = matcher(activeTab.url);
    if (autoSolveBtn) {
        autoSolveBtn.disabled = !isMatchingTab;
    }
    if (modal) {
        modal.style.display = isMatchingTab ? 'none' : 'block';
    }
    if (!isMatchingTab) {
        setStatus('Open the matching LinkedIn game tab first.');
        clearPreview();
        return;
    }

    setStatus('');
    await loadPreview();
}

function invokeHookByName(hookName) {
    const fn = window[hookName];
    if (typeof fn !== 'function') {
        return { ok: false, data: null };
    }
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            return result
                .then(data => ({ ok: true, data }))
                .catch(() => ({ ok: false, data: null }));
        }
        return { ok: true, data: result };
    } catch (_e) {
        return { ok: false, data: null };
    }
}

function invokeHookByNameWithArgs(hookName, hookArgs) {
    const fn = window[hookName];
    if (typeof fn !== 'function') {
        return { ok: false, data: null };
    }
    try {
        const args = Array.isArray(hookArgs) ? hookArgs : [];
        const result = fn(...args);
        if (result && typeof result.then === 'function') {
            return result
                .then(data => ({ ok: true, data }))
                .catch(() => ({ ok: false, data: null }));
        }
        return { ok: true, data: result };
    } catch (_e) {
        return { ok: false, data: null };
    }
}

function clearPreview() {
    if (previewContainer) {
        previewContainer.innerHTML = '';
    }
}

function getDailySolutionsCandidateUrls() {
    const now = new Date();
    const dates = [new Date(now), new Date(now)];
    dates[1].setDate(dates[1].getDate() - 1);
    const candidates = [];
    for (const d of dates) {
        const month = d.toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const day = d.getDate();
        const year = d.getFullYear();
        const sourceUrl = `https://fandomwire.com/all-linkedin-games-solutions-for-today-${month}-${day}-${year}/`;
        candidates.push({
            sourceUrl,
            requestUrl: sourceUrl,
        });
        candidates.push({
            sourceUrl,
            requestUrl: `https://r.jina.ai/http://fandomwire.com/all-linkedin-games-solutions-for-today-${month}-${day}-${year}/`,
        });
    }
    return candidates;
}

async function fetchDailySolutionsContent() {
    const candidates = getDailySolutionsCandidateUrls();
    for (const candidate of candidates) {
        try {
            const response = await fetch(candidate.requestUrl, {
                method: 'GET',
                headers: {
                    Accept: 'text/html,text/plain;q=0.9,*/*;q=0.8',
                },
            });
            if (!response.ok) {
                continue;
            }
            const content = await response.text();
            if (content && content.includes('LinkedIn')) {
                return {
                    content,
                    url: candidate.sourceUrl,
                };
            }
        } catch (_e) {
        }
    }
    return { content: null, url: null };
}

function renderAnswerCard(title, lines) {
    if (!previewContainer) {
        return;
    }
    const card = document.createElement('div');
    card.className = 'remaining-answer-card';

    const heading = document.createElement('h3');
    heading.className = 'remaining-answer-title';
    heading.textContent = title;
    card.appendChild(heading);

    for (const line of lines) {
        const row = document.createElement('p');
        row.className = 'remaining-answer-line';
        row.textContent = line;
        card.appendChild(row);
    }
    previewContainer.appendChild(card);
}

async function loadExternalAnswers() {
    clearPreview();
    setStatus('Fetching answer...');
    const { content, url } = await fetchDailySolutionsContent();
    if (!content) {
        setStatus('Could not fetch daily solutions right now.');
        return;
    }
    const extracted = extractRemainingLinkedInGameAnswers(content);
    latestExternalAnswers = extracted;
    if (game === 'pinpoint') {
        if (!extracted.pinpointAnswer) {
            setStatus('Pinpoint answer not found in article.');
            return;
        }
        renderAnswerCard('Pinpoint Answer', [extracted.pinpointAnswer]);
        if (status) {
            const link = document.createElement('a');
            link.href = url;
            link.textContent = url;
            link.target = '_blank';
            setStatus('Source: ');
            status.appendChild(link);
        }
        return;
    }

    if (game === 'crossclimb') {
        const crossclimb = extracted.crossclimb;
        if (!crossclimb || (crossclimb.ladderWords.length === 0
            && crossclimb.finalTwoWords.length === 0)) {
            setStatus('Crossclimb answers not found in article.');
            return;
        }
        if (crossclimb.ladderWords.length > 0) {
            renderAnswerCard('First Five', [crossclimb.ladderWords.join(' → ')]);
        }
        if (crossclimb.orderedHint.length > 0) {
            renderAnswerCard('Ordered Ladder', [crossclimb.orderedHint.join(' → ')]);
        }
        if (crossclimb.finalTwoWords.length > 0) {
            renderAnswerCard('Final Two', [crossclimb.finalTwoWords.join(' + ')]);
        }
        const link = document.createElement('a');
        link.href = url;
        link.textContent = url;
        link.target = '_blank';
        setStatus('Source: ');
        status.appendChild(link);
    }
}

async function loadPreview() {
    if (gameConfig[game]?.externalSource) {
        await loadExternalAnswers();
        return;
    }
    if (!game || !activeTab?.id) {
        clearPreview();
        return;
    }
    const { previewHook } = gameConfig[game];
    try {
        const results = await polyfilledBrowser.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: invokeHookByName,
            args: [previewHook],
        });
        const payload = results?.[0]?.result;
        if (!payload?.ok || !payload?.data) {
            clearPreview();
            return;
        }
        renderPreview(game, payload.data);
    } catch (_e) {
        clearPreview();
    }
}

function renderPreview(gameKey, data) {
    clearPreview();
    if (!previewContainer) {
        return;
    }
    if (gameKey === 'zip') {
        renderZipPreview(data);
        return;
    }
    if (gameKey === 'sudoku') {
        renderSudokuPreview(data);
        return;
    }
    if (gameKey === 'queens') {
        renderQueensPreview(data);
        return;
    }
    if (gameKey === 'tango') {
        renderTangoPreview(data);
    }
}

function renderZipPreview(data) {
    if (!previewContainer || !data?.cells?.length || !data?.cols) {
        return;
    }
    const grid = document.createElement('div');
    grid.className = 'zip-preview';
    grid.style.gridTemplateColumns = `repeat(${data.cols}, 34px)`;
    grid.style.gridTemplateRows = `repeat(${data.rows}, 34px)`;

    data.cells.forEach((cell) => {
        const div = document.createElement('div');
        div.className = 'zip-preview-cell';
        if (cell.value > 0) {
            const marker = document.createElement('span');
            marker.className = 'zip-preview-number';
            marker.textContent = `${cell.value}`;
            div.appendChild(marker);
        }
        for (const blocker of (cell.blockers ?? [])) {
            div.classList.add(`block-${blocker}`);
        }
        grid.appendChild(div);
    });

    if (Array.isArray(data.solution) && data.solution.length > 1) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'zip-preview-line');
        svg.setAttribute('viewBox', `0 0 ${data.cols * 34} ${data.rows * 34}`);

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        const gradientId = `zipPreviewGradient-${Math.random().toString(36).slice(2, 8)}`;
        const [startColor, endColor] = ZIP_GRADIENT_PALETTES[Math.floor(Math.random() * ZIP_GRADIENT_PALETTES.length)];
        gradient.setAttribute('id', gradientId);
        gradient.setAttribute('x1', '0%');
        gradient.setAttribute('y1', '0%');
        gradient.setAttribute('x2', '100%');
        gradient.setAttribute('y2', '100%');
        const stopA = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stopA.setAttribute('offset', '0%');
        stopA.setAttribute('stop-color', startColor);
        const stopB = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stopB.setAttribute('offset', '100%');
        stopB.setAttribute('stop-color', endColor);
        gradient.appendChild(stopA);
        gradient.appendChild(stopB);
        defs.appendChild(gradient);
        svg.appendChild(defs);

        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('class', 'zip-preview-polyline');
        const points = data.solution.map((idx) => {
            const row = Math.floor(idx / data.cols);
            const col = idx % data.cols;
            return `${(col * 34) + 17},${(row * 34) + 17}`;
        });
        polyline.setAttribute('points', points.join(' '));
        polyline.style.stroke = `url(#${gradientId})`;
        svg.appendChild(polyline);
        grid.appendChild(svg);
    }

    previewContainer.appendChild(grid);
}

function renderSudokuPreview(data) {
    if (!previewContainer || !data?.size || !data?.solved) {
        return;
    }
    const grid = document.createElement('div');
    grid.className = 'sudoku-preview';
    grid.style.gridTemplateColumns = `repeat(${data.size}, 32px)`;
    grid.style.gridTemplateRows = `repeat(${data.size}, 32px)`;

    for (let row = 0; row < data.size; row++) {
        for (let col = 0; col < data.size; col++) {
            const cell = document.createElement('div');
            cell.className = 'sudoku-preview-cell';
            const given = data.given?.[row]?.[col];
            const solved = data.solved?.[row]?.[col];
            if (given != null) {
                cell.classList.add('given');
                cell.textContent = `${given}`;
            } else if (solved != null) {
                cell.classList.add('solved');
                cell.textContent = `${solved}`;
            }
            grid.appendChild(cell);
        }
    }

    previewContainer.appendChild(grid);
}

function renderQueensPreview(data) {
    if (!previewContainer || !data?.size || !Array.isArray(data.cells)) {
        return;
    }
    const grid = document.createElement('div');
    grid.className = 'queens-preview';
    grid.style.gridTemplateColumns = `repeat(${data.size}, 32px)`;
    grid.style.gridTemplateRows = `repeat(${data.size}, 32px)`;

    for (const cellData of data.cells) {
        const cell = document.createElement('div');
        cell.className = 'queens-preview-cell';
        cell.style.backgroundColor = cellData.backgroundColor;
        if (cellData.hasQueen) {
            const mark = document.createElement('div');
            mark.className = 'queen-mark';
            cell.appendChild(mark);
        }
        grid.appendChild(cell);
    }

    previewContainer.appendChild(grid);
}

function renderTangoPreview(data) {
    if (!previewContainer || !data?.size || !Array.isArray(data.cells)) {
        return;
    }
    const grid = document.createElement('div');
    grid.className = 'tango-preview';
    grid.style.gridTemplateColumns = `repeat(${data.size}, 32px)`;
    grid.style.gridTemplateRows = `repeat(${data.size}, 32px)`;

    for (const cellData of data.cells) {
        const cell = document.createElement('div');
        cell.className = 'tango-preview-cell';
        if (cellData.isPreset) {
            cell.classList.add('preset');
        }
        if (cellData.value === 'Sun' || cellData.value === 'Moon') {
            const mark = document.createElement('div');
            mark.className = `tango-mark ${cellData.value === 'Sun' ? 'sun' : 'moon'}`;
            mark.innerHTML = cellData.value === 'Sun'
                ? getSunSvgMarkup()
                : getMoonSvgMarkup();
            cell.appendChild(mark);
        }
        grid.appendChild(cell);
    }

    previewContainer.appendChild(grid);
}

function getSunSvgMarkup() {
    return `<svg width="31" height="31" viewBox="0 0 31 31" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sun" class="lotka-cell-content-img fade-in"><title>Sun</title><g id="Sun"><path class="lotka-cell-zero-path" id="Vector" d="M29.25 15.4989C29.25 23.0943 23.0937 29.25 15.5 29.25C7.90629 29.25 1.75 23.0943 1.75 15.4989C1.75 7.90583 7.90619 1.75 15.5 1.75C23.0938 1.75 29.25 7.90583 29.25 15.4989Z" stroke-width="2"></path></g></svg>`;
}

function getMoonSvgMarkup() {
    return `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Moon" class="lotka-cell-content-img fade-in"><title>Moon</title><g id="Moon"><g clip-path="url(#clip0_3574_67936)"><path class="lotka-cell-one-path" id="Subtract" d="M8.10583 19.9024C15.2282 18.6466 19.2619 11.9868 17.0757 5.09295C16.8785 4.47115 16.6376 3.86915 16.3574 3.28957C16.3507 3.27584 16.3467 3.26256 16.3446 3.24986C20.5748 4.17473 24.0337 7.5648 24.8316 12.0899C25.8865 18.0727 21.8917 23.778 15.9088 24.8329C11.4675 25.616 7.17692 23.6165 4.82974 20.0826C4.84051 20.0805 4.85231 20.0796 4.86526 20.0804C5.93904 20.1476 7.02621 20.0928 8.10583 19.9024Z" stroke-width="2"></path><circle id="Cut" cx="12" cy="12" r="12" transform="matrix(0.984808 -0.173648 0.302281 0.953219 -11.1387 -1.87585)"></circle></g></g><defs><clipPath id="clip0_3574_67936"><rect x="0.0976562" y="4.26611" width="24" height="24" rx="12" transform="rotate(-10 0.0976562 4.26611)" fill="white"></rect></clipPath></defs></svg>`;
}

function solveActiveGame() {
    if (gameConfig[game]?.externalSource && !gameConfig[game]?.solverHook) {
        setStatus('Solve is not available yet for this game.');
        return;
    }
    if (!game || !activeTab?.id) {
        setStatus('No active game tab found.');
        return;
    }
    const { solverHook } = gameConfig[game];
    setStatus('Solving...');

    if (game === 'crossclimb') {
        solveCrossclimbWithFetchedWords(solverHook);
        return;
    }

    polyfilledBrowser.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: invokeHookByName,
        args: [solverHook],
    }).then((results) => {
        const invoked = results?.[0]?.result?.ok === true;
        if (invoked) {
            setStatus('Solved.');
        } else {
            setStatus('Solver unavailable on this tab.');
        }
    }).catch(() => {
        setStatus('Failed to run solver on this tab.');
    });
}

function getCrossclimbSolveWords(crossclimb) {
    if (!crossclimb) {
        return [];
    }
    if (Array.isArray(crossclimb.orderedHint) && crossclimb.orderedHint.length > 0) {
        return crossclimb.orderedHint;
    }
    if (Array.isArray(crossclimb.ladderWords)) {
        return crossclimb.ladderWords;
    }
    return [];
}

async function solveCrossclimbWithFetchedWords(solverHook) {
    try {
        if (!latestExternalAnswers?.crossclimb) {
            const { content } = await fetchDailySolutionsContent();
            if (!content) {
                setStatus('Could not fetch daily solutions right now.');
                return;
            }
            latestExternalAnswers = extractRemainingLinkedInGameAnswers(content);
        }

        const solveWords = getCrossclimbSolveWords(latestExternalAnswers?.crossclimb);
        if (solveWords.length === 0) {
            setStatus('Crossclimb answers not found in article.');
            return;
        }

        const results = await polyfilledBrowser.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: invokeHookByNameWithArgs,
            args: [solverHook, [solveWords]],
        });

        const invoked = results?.[0]?.result?.ok === true;
        const solved = !!results?.[0]?.result?.data;
        if (invoked && solved) {
            setStatus('Solved.');
        } else {
            setStatus('Unable to fill Crossclimb rows on this tab.');
        }
    } catch (_e) {
        setStatus('Failed to run solver on this tab.');
    }
}
