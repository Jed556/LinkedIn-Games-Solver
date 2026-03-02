import { getGridDiv, anticipateOneMutation, sleep } from '../util.js';
import { solveQueens } from './solver.js';
import { getSettings } from '../settings.js';

const INLINE_AUTOSOLVE_BUTTON_ID = 'linkedin-games-solver-queens-inline-autosolve';
const INLINE_AUTOSOLVE_MAX_RETRIES = 30;
let inlineAutoSolveObserver = null;
let inlineAutoSolveRetryTimer = null;
let inlineAutoSolveRetryCount = 0;

export async function autoSolve() {
  const settings = await getSettings();
  const delayMs = settings.delays.queens;
  const prioritizedApis = [new QueensDomApiV1(), new QueensDomApiV0()];
  for (let i = 0; i < prioritizedApis.length;) {
    const api = prioritizedApis[i];
    try {
      await api.autoSolve(delayMs);
      return;
    } catch (e) {
      console.error(e);
      if (++i !== prioritizedApis.length) {
        console.info('Will reattempt autoSolve() via a prior API');
      } else {
        console.error('All APIs exhausted');
      }
    }
  }
}

export function getPreviewData() {
  const prioritizedApis = [new QueensDomApiV1(), new QueensDomApiV0()];
  for (let i = 0; i < prioritizedApis.length;) {
    const api = prioritizedApis[i];
    try {
      return api.getPreviewData();
    } catch (e) {
      console.error(e);
      if (++i !== prioritizedApis.length) {
        console.info('Will reattempt getPreviewData() via a prior API');
      } else {
        console.error('All APIs exhausted');
      }
    }
  }
  return null;
}

export async function installInlineAutoSolveButton() {
  const settings = await getSettings();
  if (!settings.showInlineAutoSolveButton) {
    return;
  }
  ensureInlineAutoSolveButton();
  ensureInlineAutoSolveObserver();
  ensureInlineAutoSolveRetryLoop();
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

  const doc = controlsDiv.ownerDocument;
  const observerTarget = controlsDiv.parentElement ?? doc.body;
  inlineAutoSolveObserver = new MutationObserver(() => {
    ensureInlineAutoSolveButton();
  });
  inlineAutoSolveObserver.observe(observerTarget, {
    childList: true,
    subtree: true,
  });
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

function getControlsDiv() {
  try {
    const preferred = getGridDiv(d => d.querySelector(
      '.queens-under-board-controls-container, [data-testid="under-board-controls-container"], [data-testid="under-board-controls"]'));
    if (preferred) {
      return preferred;
    }
  } catch (_e) {
  }
  const gridDiv = getQueensGridDivForButtonInstall();
  const fallback = getSiblingButtonContainer(gridDiv);
  if (fallback) {
    return fallback;
  }
  throw new Error('Could not locate Queens controls container');
}

function getQueensGridDivForButtonInstall() {
  return getGridDiv(d => d.querySelector('[data-testid="interactive-grid"], #queens-grid'));
}

function getSiblingButtonContainer(gridDiv) {
  let current = gridDiv;
  for (let depth = 0; depth < 6 && current?.parentElement; depth++) {
    const parent = current.parentElement;
    const siblings = Array.from(parent.children).filter(c => c !== current);
    for (const sibling of siblings) {
      if (sibling.tagName === 'BUTTON') {
        return sibling.parentElement ?? sibling;
      }
      if (sibling.querySelector('button')) {
        return sibling;
      }
    }
    current = parent;
  }
  return null;
}

class QueensDomApi {

  async autoSolve(delayMs = 0) {
    const gridDiv = this.getQueensGridDiv();
    const [cellDivs, queensGridArg, existingMarks] =
      this.#transformQueensGridDiv(gridDiv);
    const queenIndices = solveQueens(queensGridArg);
    console.info('Solution identified:', queenIndices);
    await this.clickQueens(cellDivs, queenIndices, existingMarks, delayMs);
  }

  getPreviewData() {
    const gridDiv = this.getQueensGridDiv();
    const [cellDivs, queensGridArg] = this.#transformQueensGridDiv(gridDiv);
    const solution = solveQueens(queensGridArg);
    const queenSet = new Set(solution);
    const side = Math.sqrt(cellDivs.length);
    const cells = cellDivs.map((cellDiv, idx) => ({
      backgroundColor: window.getComputedStyle(cellDiv).backgroundColor,
      hasQueen: queenSet.has(idx),
    }));
    return { size: side, cells };
  }

  #transformQueensGridDiv(gridDiv) {
    const filtered = Array.from(gridDiv.children)
      .filter(c => this.gridDivChildIsCellDiv(c));
    if (filtered.length === 0) {
      this.orElseThrow(null, 'transformQueensGridDiv', 'gridDiv contained no '
        + 'children that matched cellDiv filter');
    }
    const cellDivs = new Array(filtered.length);
    const queensGridArg = new Array(cellDivs.length);
    const existingMarks = new Map();
    for (const cellDiv of filtered) {
      const idx = this.getCellDivIdx(cellDiv);
      const color = this.getCellDivColor(cellDiv);
      cellDivs[idx] = cellDiv;
      queensGridArg[idx] = { idx: idx, color: color };
      const existingMark = this.getCellDivExistingMark(cellDiv);
      if (existingMark) {
        existingMarks.set(idx, existingMark);
      }
    }
    return [cellDivs, queensGridArg, existingMarks];
  }

  async clickQueens(cellDivs, queenLocations, existingMarks, delayMs = 0) {
    // Transform any cells that must be marked as queens to queens.
    for (const loc of queenLocations) {
      const existingMark = existingMarks.get(loc) ?? 0, cellDiv = cellDivs[loc];
      for (let i = existingMark; i < 2; i++) {
        await anticipateOneMutation(cellDiv, loc);
        await sleep(delayMs);
      }
      if (existingMark === 2) {
        existingMarks.delete(loc);
      }
    }
    // Transform any cells that were mistakenly marked as queens to blank. Note
    // that doing these two transformations in this order should work even if
    // "Auto-x" mode is on.
    for (const [key, value] of existingMarks) {
      if (value === 2) {
        await anticipateOneMutation(cellDivs[key], key);
        await sleep(delayMs);
      }
    }
  }

}

class QueensDomApiV1 extends QueensDomApi {

  async autoSolve(delayMs = 0) {
    // Extract
    const rawSolution = this.getSolution();
    const processedSolution = this.processSolution(rawSolution);
    const gridDiv = this.getQueensGridDiv();
    const [cellDivs, existingMarks] = this.transformQueensGridDiv(gridDiv);
    // Dispatch
    await this.clickCells(cellDivs, processedSolution, existingMarks, delayMs);
  }

  getPreviewData() {
    const rawSolution = this.getSolution();
    const processedSolution = this.processSolution(rawSolution);
    const queenSet = new Set(processedSolution);
    const gridDiv = this.getQueensGridDiv();
    const [cellDivs] = this.transformQueensGridDiv(gridDiv);
    const side = Math.sqrt(cellDivs.length);
    const cells = cellDivs.map((cellDiv, idx) => ({
      backgroundColor: window.getComputedStyle(cellDiv).backgroundColor,
      hasQueen: queenSet.has(idx),
    }));
    return { size: side, cells };
  }

  getSolution() {
    const hydrationScript = this.orElseThrow(
      getGridDiv(d => d.getElementById('rehydrate-data')), 'getSolution',
      'No script with id rehydrate-data found')
      .textContent;
    const indicator = '\\"solution\\"';
    const anchor = hydrationScript.indexOf(indicator);
    if (anchor < 0) {
      this.orElseThrow(null, 'getSolution', 'Failed to locate indicator');
    }
    const start = hydrationScript.indexOf('[', anchor + indicator.length);
    const end = hydrationScript.indexOf(']', start);
    const substring = hydrationScript.substring(start, end + 1);
    return JSON.parse(substring.replaceAll('\\', ''));
  }

  processSolution(rawSolution) {
    const n = rawSolution.length;
    const result = rawSolution.map((x) => n * x.row + x.col);
    console.info('Solution identified:', result);
    return rawSolution.map((x) => n * x.row + x.col);
  }

  getQueensGridDiv() {
    return this.orElseThrow(
      getGridDiv(d => d.querySelector('[data-testid="interactive-grid"]')),
      'getQueensGridDiv', 'QueensGridDiv selector yielded nothing');
  }

  transformQueensGridDiv(gridDiv) {
    const filtered = Array.from(gridDiv.children)
      .filter(c => this.gridDivChildIsCellDiv(c));
    if (filtered.length === 0) {
      this.orElseThrow(null, 'transformQueensGridDiv', 'gridDiv contained no '
        + 'children that matched cellDiv filter');
    }
    const cellDivs = new Array(filtered.length);
    const existingMarks = new Map();
    for (const cellDiv of filtered) {
      const idx = this.getCellDivIdx(cellDiv);
      cellDivs[idx] = cellDiv;
      const existingMark = this.getCellDivExistingMark(cellDiv);
      if (existingMark) {
        existingMarks.set(idx, existingMark);
      }
    }
    return [cellDivs, existingMarks];
  }

  gridDivChildIsCellDiv(gridDivChild) {
    return gridDivChild.attributes?.getNamedItem('data-cell-idx');
  }

  getCellDivIdx(cellDiv) {
    const dataCellIdx = cellDiv.attributes
      ?.getNamedItem('data-cell-idx')?.value;
    return parseInt(this.orElseThrow(dataCellIdx, 'getIdFromCellDiv',
      `Failed to parse an integer data cell ID from ${dataCellIdx}`));
  }

  getCellDivExistingMark(cellDiv) {
    const mark = cellDiv.attributes
      ?.getNamedItem('aria-label')?.value?.toLowerCase();
    return !mark ? 0 : mark.includes('cross') ? 1 : mark.includes('queen') ? 2
      : 0;
  }

  orElseThrow(result, fname, cause) {
    if (result != null) {
      return result;
    }
    throw new Error(`${fname} failed using QueensDomApiV1: ${cause}`);
  }

  async clickCells(cellDivs, clickSequence, existingMarks, delayMs = 0) {
    // Transform any cells that must be marked as queens to queens.
    for (const loc of clickSequence) {
      const existingMark = existingMarks.get(loc) ?? 0, cellDiv = cellDivs[loc];
      for (let i = existingMark; i < 2; i++) {
        await anticipateOneMutation(cellDiv, loc);
        await sleep(delayMs);
      }
      if (existingMark === 2) {
        existingMarks.delete(loc);
      }
    }
    // Transform any cells that were mistakenly marked as queens to blank. Note
    // that doing these two transformations in this order should work even if
    // "Auto-x" mode is on.
    for (const [key, value] of existingMarks) {
      if (value === 2) {
        await anticipateOneMutation(cellDivs[key], key);
        await sleep(delayMs);
      }
    }
  }

}

class QueensDomApiV0 extends QueensDomApi {

  getQueensGridDiv() {
    return this.orElseThrow(getGridDiv(d => d.getElementById('queens-grid')),
      'getQueensGridDiv', 'QueensGridDiv selector yielded nothing');
  }

  gridDivChildIsCellDiv(gridDivChild) {
    return gridDivChild.attributes?.getNamedItem('data-cell-idx');
  }

  getCellDivIdx(cellDiv) {
    const dataCellIdx = cellDiv.attributes
      ?.getNamedItem('data-cell-idx')?.value;
    return parseInt(this.orElseThrow(dataCellIdx, 'getCellDivIdx',
      `Failed to parse an integer data cell ID from ${dataCellIdx}`));
  }

  getCellDivColor(cellDiv) {
    const fname = 'getCellDivColor';
    const clazz = cellDiv.attributes?.getNamedItem('class')?.value ?? '';
    const indicator = 'cell-color-';
    const pos = clazz.indexOf(indicator);
    if (pos < 0) {
      this.orElseThrow(undefined, fname,
        `Failed to find class with pattern ${indicator}{...}; saw: ${clazz}`);
    }
    const color = parseInt(clazz.substring(pos + indicator.length));
    return this.orElseThrow(Number.isNaN(color) ? null : color, fname,
      `Class pattern ${indicator}{...} did not terminate in number`);
  }

  getCellDivExistingMark(cellDiv) {
    const mark = cellDiv.attributes
      ?.getNamedItem('aria-label')?.value?.toLowerCase();
    return !mark ? 0 : mark.includes('cross') ? 1 : mark.includes('queen') ? 2
      : 0;
  }

  orElseThrow(result, fname, cause) {
    if (result != null) {
      return result;
    }
    throw new Error(`${fname} failed using QueensDomApiV0: ${cause}`);
  }

}
