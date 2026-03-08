import { extractRemainingLinkedInGameAnswers } from '../remainingGamesExtractor.js';
import { getSettings } from '../settings.js';

const INLINE_AUTOSOLVE_BUTTON_ID = 'linkedin-games-solver-crossclimb-inline-autosolve';
const INLINE_AUTOSOLVE_MAX_RETRIES = 30;
let inlineAutoSolveObserver = null;
let inlineAutoSolveRetryTimer = null;
let inlineAutoSolveRetryCount = 0;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeWord(word) {
    return String(word ?? '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, '');
}

function getActiveMiddleRow() {
    return document.querySelector('.crossclimb__guess--middle.crossclimb__guess--active');
}

function getFirstCandidateRow() {
    const rows = Array.from(document.querySelectorAll('.crossclimb__guess--middle'));
    return rows.find((row) => getRowInputs(row).some(i => !i.disabled)) ?? null;
}

function getCurrentTargetRow() {
    return getActiveMiddleRow() ?? getFirstCandidateRow();
}

function getRowInputs(row) {
    if (!row) {
        return [];
    }
    return Array.from(row.querySelectorAll('input[data-crossclimb-guess-input-idx]'))
        .sort((a, b) => Number(a.dataset.crossclimbGuessInputIdx) - Number(b.dataset.crossclimbGuessInputIdx));
}

function clickRowIfNeeded(row) {
    if (!row) {
        return;
    }
    try {
        row.focus();
        row.click();
    } catch (_e) {
    }
}

function setInputValue(input, value) {
    const ownDescriptor = Object.getOwnPropertyDescriptor(input, 'value');
    const prototype = Object.getPrototypeOf(input);
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (prototypeDescriptor?.set && ownDescriptor?.set !== prototypeDescriptor.set) {
        prototypeDescriptor.set.call(input, value);
        return;
    }
    if (prototypeDescriptor?.set) {
        prototypeDescriptor.set.call(input, value);
        return;
    }
    input.value = value;
}

function dispatchLetterEvents(input, letter) {
    const keyOptions = {
        bubbles: true,
        cancelable: true,
        key: letter,
        code: `Key${letter}`,
    };
    input.dispatchEvent(new KeyboardEvent('keydown', keyOptions));
    input.dispatchEvent(new KeyboardEvent('keypress', keyOptions));
    input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: letter,
        inputType: 'insertText',
    }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', keyOptions));
}

function pressEnter(input) {
    const keyOptions = {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        code: 'Enter',
    };
    input.dispatchEvent(new KeyboardEvent('keydown', keyOptions));
    input.dispatchEvent(new KeyboardEvent('keypress', keyOptions));
    input.dispatchEvent(new KeyboardEvent('keyup', keyOptions));
}

function getRowKey(row) {
    return row?.getAttribute('data-guess-id') ?? null;
}

async function typeWordIntoCurrentRow(word) {
    const row = getCurrentTargetRow();
    clickRowIfNeeded(row);
    const inputs = getRowInputs(row);
    if (inputs.length === 0) {
        return false;
    }

    const cleanedWord = normalizeWord(word);
    if (cleanedWord.length !== inputs.length) {
        return false;
    }

    const previousRowKey = getRowKey(getActiveMiddleRow() ?? row);

    for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        const letter = cleanedWord[i];
        input.focus();
        setInputValue(input, letter);
        dispatchLetterEvents(input, letter);
        await sleep(35);
    }

    const lastInput = inputs[inputs.length - 1];
    pressEnter(lastInput);

    const start = Date.now();
    while (Date.now() - start < 1200) {
        await sleep(60);
        const activeKey = getRowKey(getActiveMiddleRow());
        if (activeKey && previousRowKey && activeKey !== previousRowKey) {
            return true;
        }
        if (!activeKey && previousRowKey) {
            return true;
        }
    }

    return true;
}

function getWordsForCurrentRowLength(words) {
    const row = getCurrentTargetRow();
    const inputCount = getRowInputs(row).length;
    if (inputCount <= 0) {
        return [];
    }
    return words
        .map(normalizeWord)
        .filter(word => word.length === inputCount);
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
        candidates.push(sourceUrl);
        candidates.push(`https://r.jina.ai/http://fandomwire.com/all-linkedin-games-solutions-for-today-${month}-${day}-${year}/`);
    }
    return candidates;
}

async function fetchDailySolutionsContent() {
    const candidates = getDailySolutionsCandidateUrls();
    for (const url of candidates) {
        try {
            const response = await fetch(url, {
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
                return content;
            }
        } catch (_e) {
        }
    }
    return null;
}

async function getCrossclimbWordsFromDailySource() {
    const content = await fetchDailySolutionsContent();
    if (!content) {
        return [];
    }
    const extracted = extractRemainingLinkedInGameAnswers(content);
    if (!extracted?.crossclimb) {
        return [];
    }
    if (Array.isArray(extracted.crossclimb.orderedHint) && extracted.crossclimb.orderedHint.length > 0) {
        return extracted.crossclimb.orderedHint;
    }
    return Array.isArray(extracted.crossclimb.ladderWords) ? extracted.crossclimb.ladderWords : [];
}

async function autoSolve(orderedWords) {
    let words = Array.isArray(orderedWords) ? orderedWords : [];
    if (words.length === 0) {
        words = await getCrossclimbWordsFromDailySource();
    }

    const usableWords = getWordsForCurrentRowLength(words);
    if (usableWords.length === 0) {
        return false;
    }

    let successfulRows = 0;
    for (const word of usableWords) {
        const filled = await typeWordIntoCurrentRow(word);
        if (!filled) {
            return false;
        }
        successfulRows++;
        await sleep(80);
    }

    return successfulRows > 0;
}

function getControlsDiv() {
    const direct = document.querySelector('.under-board-controls-container--crossclimb');
    if (direct) {
        return direct;
    }
    throw new Error('Could not locate Crossclimb controls container');
}

function getButtonWrapper(button) {
    if (!button) {
        return null;
    }
    const parent = button.parentElement;
    if (!parent) {
        return null;
    }
    if (parent.matches('span.under-board-controls-item, [data-control-btn-container]')) {
        return parent;
    }
    if (parent.childElementCount === 1) {
        return parent;
    }
    return null;
}

function setButtonText(button, doc, label) {
    const textContainer = button.querySelector('.artdeco-button__text, span span, span');
    if (textContainer) {
        textContainer.textContent = label;
        return;
    }
    const textSpan = doc.createElement('span');
    textSpan.className = 'artdeco-button__text';
    textSpan.textContent = label;
    button.replaceChildren(textSpan);
}

function ensureInlineAutoSolveButton() {
    let controlsDiv;
    try {
        controlsDiv = getControlsDiv();
    } catch (_e) {
        return false;
    }

    const doc = controlsDiv.ownerDocument;
    const existingButton = doc.getElementById(INLINE_AUTOSOLVE_BUTTON_ID);
    if (existingButton) {
        if (!controlsDiv.contains(existingButton)) {
            const existingWrapper = getButtonWrapper(existingButton);
            if (existingWrapper) {
                controlsDiv.appendChild(existingWrapper);
            } else {
                controlsDiv.appendChild(existingButton);
            }
        }
        return true;
    }

    const nativeButton = controlsDiv.querySelector('button');
    const nativeWrapper = getButtonWrapper(nativeButton);
    const wrapper = nativeWrapper ? nativeWrapper.cloneNode(false) : doc.createElement('span');
    if (wrapper.tagName === 'SPAN' && !wrapper.classList.contains('under-board-controls-item')) {
        wrapper.classList.add('under-board-controls-item');
    }

    const solveButton = nativeButton ? nativeButton.cloneNode(true) : doc.createElement('button');
    solveButton.removeAttribute('disabled');
    solveButton.removeAttribute('aria-disabled');
    solveButton.id = INLINE_AUTOSOLVE_BUTTON_ID;
    solveButton.type = 'button';
    solveButton.setAttribute('data-control-btn', 'auto-solve');
    solveButton.setAttribute('aria-disabled', 'false');

    setButtonText(solveButton, doc, 'Auto Solve');
    solveButton.addEventListener('click', () => {
        autoSolve();
    });

    wrapper.replaceChildren(solveButton);
    controlsDiv.appendChild(wrapper);
    return true;
}

function ensureInlineAutoSolveObserver() {
    if (inlineAutoSolveObserver) {
        return;
    }
    let controlsDiv;
    try {
        controlsDiv = getControlsDiv();
    } catch (_e) {
        return;
    }

    const observerTarget = controlsDiv.parentElement ?? controlsDiv.ownerDocument.body;
    inlineAutoSolveObserver = new MutationObserver(() => {
        ensureInlineAutoSolveButton();
    });
    inlineAutoSolveObserver.observe(observerTarget, {
        childList: true,
        subtree: true,
    });
}

function ensureInlineAutoSolveRetryLoop() {
    if (inlineAutoSolveRetryTimer) {
        return;
    }
    inlineAutoSolveRetryTimer = setInterval(() => {
        const hasButton = ensureInlineAutoSolveButton();
        ensureInlineAutoSolveObserver();
        if (hasButton || ++inlineAutoSolveRetryCount >= INLINE_AUTOSOLVE_MAX_RETRIES) {
            clearInterval(inlineAutoSolveRetryTimer);
            inlineAutoSolveRetryTimer = null;
            inlineAutoSolveRetryCount = 0;
        }
    }, 1000);
}

async function installInlineAutoSolveButton() {
    const settings = await getSettings();
    if (!settings.showInlineAutoSolveButton) {
        return;
    }
    ensureInlineAutoSolveButton();
    ensureInlineAutoSolveObserver();
    ensureInlineAutoSolveRetryLoop();
}

window.crossclimbPopupButtonOnClick = autoSolve;
installInlineAutoSolveButton();
