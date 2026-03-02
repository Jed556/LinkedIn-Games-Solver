import { getSettings, patchSettings } from '../settings.js';

const backBtn = document.getElementById('settingsBackBtn');
const delayZip = document.getElementById('delayZip');
const delaySudoku = document.getElementById('delaySudoku');
const delayQueens = document.getElementById('delayQueens');
const delayTango = document.getElementById('delayTango');
const showInlineAutoSolveToggle = document.getElementById('showInlineAutoSolveToggle');
const showInlineAutoSolveState = document.getElementById('showInlineAutoSolveState');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsStatus = document.getElementById('settingsStatus');

initialize();

function initialize() {
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = './popup.html';
            }
        });
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
    }

    if (showInlineAutoSolveToggle) {
        showInlineAutoSolveToggle.addEventListener('change', syncToggleStateText);
    }

    hydrateSettings();
}

function setStatus(message) {
    if (settingsStatus) {
        settingsStatus.textContent = message;
    }
}

function parseDelay(inputElem, fallback) {
    const parsed = parseInt(inputElem?.value ?? '', 10);
    if (Number.isNaN(parsed) || parsed < 0) {
        return fallback;
    }
    return parsed;
}

function syncToggleStateText() {
    if (!showInlineAutoSolveState || !showInlineAutoSolveToggle) {
        return;
    }
    showInlineAutoSolveState.textContent = showInlineAutoSolveToggle.checked
        ? 'On'
        : 'Off';
}

async function hydrateSettings() {
    const settings = await getSettings();
    if (delayZip) {
        delayZip.value = `${settings.delays.zip}`;
    }
    if (delaySudoku) {
        delaySudoku.value = `${settings.delays.sudoku}`;
    }
    if (delayQueens) {
        delayQueens.value = `${settings.delays.queens}`;
    }
    if (delayTango) {
        delayTango.value = `${settings.delays.tango}`;
    }
    if (showInlineAutoSolveToggle) {
        showInlineAutoSolveToggle.checked = settings.showInlineAutoSolveButton;
    }
    syncToggleStateText();
}

async function saveSettings() {
    try {
        const current = await getSettings();
        const next = await patchSettings({
            showInlineAutoSolveButton: !!showInlineAutoSolveToggle?.checked,
            delays: {
                zip: parseDelay(delayZip, current.delays.zip),
                sudoku: parseDelay(delaySudoku, current.delays.sudoku),
                queens: parseDelay(delayQueens, current.delays.queens),
                tango: parseDelay(delayTango, current.delays.tango),
            },
        });

        if (delayZip) {
            delayZip.value = `${next.delays.zip}`;
        }
        if (delaySudoku) {
            delaySudoku.value = `${next.delays.sudoku}`;
        }
        if (delayQueens) {
            delayQueens.value = `${next.delays.queens}`;
        }
        if (delayTango) {
            delayTango.value = `${next.delays.tango}`;
        }
        if (showInlineAutoSolveToggle) {
            showInlineAutoSolveToggle.checked = next.showInlineAutoSolveButton;
        }
        syncToggleStateText();

        setStatus('Settings saved.');
    } catch (_e) {
        setStatus('Failed to save settings.');
    }
}
