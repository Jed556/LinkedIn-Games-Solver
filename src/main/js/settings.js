const DEFAULT_SETTINGS = {
    showInlineAutoSolveButton: true,
    delays: {
        zip: 50,
        sudoku: 60,
        queens: 60,
        tango: 50,
    },
};

const STORAGE_KEY = 'linkedinGamesSolverSettings';
const LOCAL_STORAGE_KEY = '__linkedinGamesSolverSettings';

function getStorage() {
    const polyfilledBrowser = (typeof browser !== 'undefined') ? browser : chrome;
    return polyfilledBrowser.storage?.local;
}

function getWindowLocalStorage() {
    try {
        return window?.localStorage;
    } catch (_e) {
        return null;
    }
}

async function storageGet(storage, key) {
    if (!storage || typeof storage.get !== 'function') {
        return null;
    }
    try {
        const maybePromise = storage.get(key);
        if (maybePromise && typeof maybePromise.then === 'function') {
            return await maybePromise;
        }
    } catch (_e) {
    }
    return await new Promise((resolve, reject) => {
        try {
            storage.get(key, (result) => {
                const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;
                const lastErr = runtime?.lastError;
                if (lastErr) {
                    reject(new Error(lastErr.message));
                    return;
                }
                resolve(result);
            });
        } catch (e) {
            reject(e);
        }
    });
}

async function storageSet(storage, payload) {
    if (!storage || typeof storage.set !== 'function') {
        throw new Error('Storage unavailable');
    }
    try {
        const maybePromise = storage.set(payload);
        if (maybePromise && typeof maybePromise.then === 'function') {
            await maybePromise;
            return;
        }
    } catch (_e) {
    }
    await new Promise((resolve, reject) => {
        try {
            storage.set(payload, () => {
                const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;
                const lastErr = runtime?.lastError;
                if (lastErr) {
                    reject(new Error(lastErr.message));
                    return;
                }
                resolve();
            });
        } catch (e) {
            reject(e);
        }
    });
}

function sanitizeDelay(value, fallback) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
        return fallback;
    }
    return parsed;
}

function mergeWithDefaults(raw) {
    const base = raw ?? {};
    const delays = base.delays ?? {};
    return {
        showInlineAutoSolveButton: typeof base.showInlineAutoSolveButton === 'boolean'
            ? base.showInlineAutoSolveButton
            : DEFAULT_SETTINGS.showInlineAutoSolveButton,
        delays: {
            zip: sanitizeDelay(delays.zip, DEFAULT_SETTINGS.delays.zip),
            sudoku: sanitizeDelay(delays.sudoku, DEFAULT_SETTINGS.delays.sudoku),
            queens: sanitizeDelay(delays.queens, DEFAULT_SETTINGS.delays.queens),
            tango: sanitizeDelay(delays.tango, DEFAULT_SETTINGS.delays.tango),
        },
    };
}

function readSettingsFromLocalStorage() {
    const localStorage = getWindowLocalStorage();
    const raw = localStorage?.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
        return null;
    }
    try {
        return mergeWithDefaults(JSON.parse(raw));
    } catch (_e) {
        return null;
    }
}

export async function getSettings() {
    const storage = getStorage();
    try {
        const record = await storageGet(storage, STORAGE_KEY);
        const fromStorage = record?.[STORAGE_KEY];
        if (fromStorage != null) {
            return mergeWithDefaults(fromStorage);
        }
        const fromLocalStorage = readSettingsFromLocalStorage();
        if (fromLocalStorage != null) {
            return fromLocalStorage;
        }
        return DEFAULT_SETTINGS;
    } catch (_e) {
        return readSettingsFromLocalStorage() ?? DEFAULT_SETTINGS;
    }
}

export async function saveSettings(nextSettings) {
    const storage = getStorage();
    const normalized = mergeWithDefaults(nextSettings);
    let persisted = false;
    try {
        await storageSet(storage, { [STORAGE_KEY]: normalized });
        persisted = true;
    } catch (_e) {
    }

    const localStorage = getWindowLocalStorage();
    if (localStorage) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
        persisted = true;
    }

    if (!persisted) {
        throw new Error('Unable to persist settings');
    }

    return normalized;
}

export async function patchSettings(patch) {
    const current = await getSettings();
    const merged = {
        ...current,
        ...patch,
        delays: {
            ...current.delays,
            ...(patch?.delays ?? {}),
        },
    };
    return saveSettings(merged);
}
