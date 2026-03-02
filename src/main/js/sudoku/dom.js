import { doOneClick, getGridDiv, sleep } from '../util.js';
import { SudokuGrid } from './solver.js';
import { getSettings } from '../settings.js';

const INLINE_AUTOSOLVE_BUTTON_ID = 'linkedin-games-solver-sudoku-inline-autosolve';
const INLINE_AUTOSOLVE_MAX_RETRIES = 30;
let inlineAutoSolveObserver = null;
let inlineAutoSolveRetryTimer = null;
let inlineAutoSolveRetryCount = 0;

export async function autoSolve() {
  const settings = await getSettings();
  const delayMs = settings.delays.sudoku;
  const prioritizedApis = [new SudokuDomApiV0()];
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
  const prioritizedApis = [new SudokuDomApiV0()];
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
  const existingControl = doc.getElementById(INLINE_AUTOSOLVE_BUTTON_ID);
  if (existingControl) {
    if (!controlsDiv.contains(existingControl)) {
      controlsDiv.appendChild(existingControl);
    }
    return true;
  }

  const nativeControl = controlsDiv.querySelector('div[data-control-btn="hint"]')
    ?? controlsDiv.querySelector('div[data-control-btn], [role="button"]');
  const solveControl = nativeControl
    ? nativeControl.cloneNode(true)
    : doc.createElement('div');

  solveControl.id = INLINE_AUTOSOLVE_BUTTON_ID;
  solveControl.setAttribute('data-control-btn', 'auto-solve');
  solveControl.setAttribute('role', 'button');
  solveControl.setAttribute('tabindex', '0');
  solveControl.setAttribute('aria-label', 'Auto Solve');
  solveControl.removeAttribute('disabled');
  solveControl.removeAttribute('aria-disabled');
  if (!solveControl.className && nativeControl?.className) {
    solveControl.className = nativeControl.className;
  }

  const svg = solveControl.querySelector('svg');
  solveControl.replaceChildren();
  if (svg) {
    solveControl.appendChild(svg);
  }
  solveControl.appendChild(doc.createTextNode(' Auto Solve'));

  solveControl.addEventListener('click', () => {
    autoSolve();
  });
  solveControl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      autoSolve();
    }
  });

  controlsDiv.appendChild(solveControl);
  return true;
}

function getControlsDiv() {
  try {
    const preferred = getGridDiv(d => d.querySelector(
      '.sudoku-under-board-controls-container, [data-testid="under-board-controls-container"], [data-testid="under-board-controls"]'));
    if (preferred) {
      return preferred;
    }
  } catch (_e) {
  }
  const gridDiv = getSudokuGridDivForButtonInstall();
  const fallback = getSiblingButtonContainer(gridDiv);
  if (fallback) {
    return fallback;
  }
  throw new Error('Could not locate Sudoku controls container');
}

function getSudokuGridDivForButtonInstall() {
  return getGridDiv(d => d.querySelector('[data-testid="interactive-grid"], .grid-game-board'));
}

function getSiblingButtonContainer(gridDiv) {
  const gridParent = gridDiv.parentElement;
  const row = gridParent?.parentElement;
  if (!row) {
    return null;
  }
  const children = Array.from(row.children);
  const idx = children.indexOf(gridParent);
  for (let i = idx + 1; i < children.length; i++) {
    if (children[i].querySelector('button, [role="button"], [data-control-btn]')) {
      return children[i];
    }
  }
  for (let i = idx - 1; i >= 0; i--) {
    if (children[i].querySelector('button, [role="button"], [data-control-btn]')) {
      return children[i];
    }
  }
  return null;
}

class SudokuDomApi {

  async autoSolve(delayMs = 0) {
    const gameBoardDiv = this.getGameBoardDiv();
    const gridDiv = this.getSudokuGridDiv();
    const numberDivs = this.getNumberDivs();
    const [cellDivs, sudokuGrid] = this.#transformSudokuGridDiv(gridDiv);
    const solution = sudokuGrid.solve();
    console.info('Solution identified:', solution);
    await this.doSolve(gameBoardDiv, cellDivs, numberDivs, solution, delayMs);
  }

  getPreviewData() {
    const gridDiv = this.getSudokuGridDiv();
    const [cellDivs, sudokuGrid] = this.#transformSudokuGridDiv(gridDiv);
    const solution = sudokuGrid.solve();
    const given = Array.from({ length: 6 }, () => new Array(6).fill(null));
    for (let i = 0; i < cellDivs.length; i++) {
      const row = Math.floor(i / 6);
      const col = i % 6;
      const locked = this.getLockedContent(cellDivs[i]);
      given[row][col] = locked > 0 ? locked : null;
    }
    const solved = Array.from({ length: 6 }, () => new Array(6).fill(null));
    for (const packed of solution) {
      const row = Math.floor(packed.idx / 6);
      const col = packed.idx % 6;
      solved[row][col] = packed.val;
    }
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        if (given[row][col] != null) {
          solved[row][col] = given[row][col];
        }
      }
    }
    return { given, solved, size: 6 };
  }

  #transformSudokuGridDiv(gridDiv) {
    const filtered = Array.from(gridDiv.children)
      .filter(c => this.gridDivChildIsCellDiv(c));
    if (filtered.length === 0) {
      this.orElseThrow(null, 'transformSudokuGridDiv', 'gridDiv contained no '
        + 'children that matched cellDiv filter');
    }
    const cellDivs = new Array(filtered.length);
    const sudokuGrid = new SudokuGrid(6, 3, 2);
    for (const cellDiv of filtered) {
      const idx = this.getCellDivIdx(cellDiv);
      cellDivs[idx] = cellDiv;
      const lockedContent = this.getLockedContent(cellDiv);
      if (lockedContent > 0) {
        sudokuGrid.mark(idx, lockedContent);
      }
    }
    return [cellDivs, sudokuGrid];
  }

  async doSolve(gameBoardDiv, cellDivs, numberDivs, solution, delayMs = 0) {
    // First, attempt to grab the "Notes" on/off switch.
    let syncNotesDiv;
    try {
      syncNotesDiv = this.getNotesDiv();
    } catch (e) {
      // If it isn't present, retry after clearing any "Use a hint" popovers.
      const annoyingPopup = this.getAnnoyingPopupDiv();

      let timeoutRef;
      // Define the observer callback.
      const observerCallback = (mutations, observer) => {
        for (const mutation of mutations) {
          if (this.mutationCreatesNotesToggle(mutation)) {
            clearTimeout(timeoutRef);
            observer.disconnect();
            const notesDiv = this.getNotesDiv();
            this.disableNotes(notesDiv);
            this.#clickCells(cellDivs, numberDivs, solution, delayMs);
            return;
          }
        }
      }
      // Bind callback to observer.
      const observer = new MutationObserver(observerCallback);
      timeoutRef = setTimeout(() => {
        observer.disconnect();
        console.error('Timed out awaiting Notes toggle mutation');
      }, 10000);
      observer.observe(gameBoardDiv, {
        attributes: true,
        attributeFilter: ['class'],
        subtree: true,
        childList: true
      });

      // Trigger potential mutations.
      this.clearAnnoyingPopup(annoyingPopup);
    }
    if (syncNotesDiv) {
      this.disableNotes(syncNotesDiv);
      await this.#clickCells(cellDivs, numberDivs, solution, delayMs);
    }
  }

  async #clickCells(cellDivs, numberDivs, solution, delayMs = 0) {
    for (const packed of solution) {
      const idx = packed.idx;
      const val = packed.val;
      doOneClick(cellDivs[idx]);
      doOneClick(numberDivs[val - 1]);
      await sleep(delayMs);
    }
  }

}

class SudokuDomApiV0 extends SudokuDomApi {

  getGameBoardDiv() {
    return this.orElseThrow(
      getGridDiv(d => d.querySelector('.game-board.grid-board-wrapper')),
      'getGameBoardDiv', 'SudokuGameBoardDiv selector yielded nothing');
  }

  getSudokuGridDiv() {
    return this.orElseThrow(
      getGridDiv(d => d.querySelector('.grid-game-board')),
      'getSudokuGridDiv', 'SudokuGridDiv selector yielded nothing');
  }

  getRowsFromGridDiv(gridDiv) {
    const prop = this.orElseThrow(gridDiv.style?.getPropertyValue('--rows'),
      'getRowFromGridDiv', 'No --rows property found in style');
    const rows = parseInt(prop);
    return this.orElseThrow(Number.isNaN(rows) ? null : rows,
      'getRowFromGridDiv', `--rows property ${prop} is not a number`);
  }

  getColsFromGridDiv(gridDiv) {
    const prop = this.orElseThrow(gridDiv.style?.getPropertyValue('--cols'),
      'getColFromGridDiv', 'No --cols property found in style');
    const rows = parseInt(prop);
    return this.orElseThrow(Number.isNaN(rows) ? null : rows,
      'getColFromGridDiv', `--cols property ${prop} is not a number`);
  }

  gridDivChildIsCellDiv(childDiv) {
    return childDiv.attributes?.getNamedItem('data-cell-idx');
  }

  getCellDivIdx(cellDiv) {
    const dataCellIdx = cellDiv.attributes
      ?.getNamedItem('data-cell-idx')?.value;
    return parseInt(this.orElseThrow(dataCellIdx, 'getIdFromCellDiv',
      `Failed to parse an integer data cell ID from ${dataCellIdx}`));
  }

  getLockedContent(cellDiv) {
    if (this.cellDivIsLocked(cellDiv)) {
      const content = cellDiv.querySelector('.sudoku-cell-content');
      if (content && content.textContent) {
        const parsed = parseInt(content.textContent);
        return this.orElseThrow(Number.isNaN(parsed) ? null : parsed,
          'getLockedContent', `Expected number, found ${content.textContent}`);
      }
    }
    return -1;
  }

  cellDivIsLocked(cellDiv) {
    return cellDiv.classList.contains('sudoku-cell-prefilled');
  }

  getNumberDivs() {
    const wrapper = this.orElseThrow(
      getGridDiv(d => d.querySelector('.sudoku-input-buttons__numbers')),
      'getNumberDivs', 'SudokuNumberDiv selector yielded nothing');
    const result = new Array(6).fill(null);
    for (let i = 0; i < 6; i++) {
      const button = this.orElseThrow(wrapper.querySelector(`button[data-number="${i + 1}"]`),
        'getNumberDivs', 'Numeric button selector yielded nothing for i=' + i);
      result[i] = button;
    }
    return result;
  }

  mutationCreatesNotesToggle(mutation) {
    return mutation.target.classList.contains('sudoku-under-board-controls-container');
  }

  getNotesDiv() {
    return this.orElseThrow(
      getGridDiv(d => d.querySelector('.sudoku-under-board-controls-container')),
      'getNotesDiv', 'NotesDiv selector yielded nothing');
  }

  disableNotes(notesDiv) {
    const activeSpan = this.orElseThrow(notesDiv.querySelector('span'),
      'disableNotes', 'NotesStatus selector yielded nothing');
    const text = activeSpan.textContent.trim().toLowerCase();
    this.orElseThrow(text, 'disableNotes', 'Could not determine Notes mode status');
    if ('on' === text) {
      const toggle = this.orElseThrow(notesDiv.querySelector('div[aria-label*="notes" i]'),
        'disableNotes', 'NotesToggle selector yielded nothing');
      doOneClick(toggle);
    }
  }

  getAnnoyingPopupDiv() {
    return this.orElseThrow(
      getGridDiv(d => d.querySelector('.sudoku-under-board-scrim-message')),
      'getAnnoyingPopupDiv', 'AnnoyingPopupDiv selector yielded nothing');
  }

  clearAnnoyingPopup(popupDiv) {
    const button = popupDiv.querySelector('button[aria-label*="close" i]');
    doOneClick(this.orElseThrow(button, 'clearAnnoyingPopup',
      'Could not extract hint popup close button'));
  }

  orElseThrow(result, fname, cause) {
    if (result != null) {
      return result;
    }
    throw new Error(`${fname} failed using SudokuDomApiV0: ${cause}`);
  }

}
