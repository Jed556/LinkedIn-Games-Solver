import { getGridDiv, anticipateOneMutation, sleep } from '../util.js';
import { solveZip, compressSequence } from './solver.js';
import { getSettings } from '../settings.js';

const INLINE_AUTOSOLVE_BUTTON_ID = 'linkedin-games-solver-zip-inline-autosolve';
const INLINE_AUTOSOLVE_MAX_RETRIES = 30;
let inlineAutoSolveObserver = null;
let inlineAutoSolveRetryTimer = null;
let inlineAutoSolveRetryCount = 0;

export async function autoSolve() {
  const settings = await getSettings();
  const delayMs = settings.delays.zip;
  const prioritizedApis = [new ZipDomApiV1(), new ZipDomApiV0()];
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

export async function getPreviewData() {
  const prioritizedApis = [new ZipDomApiV1(), new ZipDomApiV0()];
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
      '.trail-under-board-controls-container, .zip-under-board-controls-container, [data-testid="under-board-controls-container"], [data-testid="under-board-controls"]'));
    if (preferred) {
      return preferred;
    }
  } catch (_e) {
  }
  const gridDiv = getZipGridDivForButtonInstall();
  const fallback = getSiblingButtonContainer(gridDiv);
  if (fallback) {
    return fallback;
  }
  throw new Error('Could not locate Zip controls container');
}

function getZipGridDivForButtonInstall() {
  return getGridDiv(d => d.querySelector('[data-testid="interactive-grid"], .grid-game-board'));
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

class ZipDomApi {

  async autoSolve(delayMs = 0) {
    const gridDiv = this.getZipGridDiv();
    const [cellDivs, zipGridArgs] = this.transformZipGridDiv(gridDiv);
    const clickSequence = solveZip(...zipGridArgs);
    console.info('Solution identified:', clickSequence);
    await this.clickCells(cellDivs, clickSequence, delayMs);
  }

  getPreviewData() {
    const gridDiv = this.getZipGridDiv();
    const [cellDivs, zipGridArgs] = this.transformZipGridDiv(gridDiv);
    const [rows, cols, , downWalls, rightWalls] = zipGridArgs;
    const solution = solveZip(...zipGridArgs);
    const cells = new Array(cellDivs.length);
    for (let idx = 0; idx < cellDivs.length; idx++) {
      cells[idx] = {
        value: this.getCellDivContent(cellDivs[idx]),
        blockers: [],
      };
    }
    for (const idx of downWalls) {
      cells[idx].blockers.push('down');
      const opposite = idx + cols;
      if (opposite < cells.length) {
        cells[opposite].blockers.push('up');
      }
    }
    for (const idx of rightWalls) {
      cells[idx].blockers.push('right');
      const opposite = idx + 1;
      if (Math.floor(opposite / cols) === Math.floor(idx / cols)
        && opposite < cells.length) {
        cells[opposite].blockers.push('left');
      }
    }
    return { rows, cols, cells, solution };
  }

  transformZipGridDiv(gridDiv) {
    const rows = this.getRowsFromGridDiv(gridDiv);
    const cols = this.getColsFromGridDiv(gridDiv);
    const filtered = Array.from(gridDiv.children)
      .filter(c => this.gridDivChildIsCellDiv(c));
    if (filtered.length === 0) {
      this.orElseThrow(null, 'transformZipGridDiv', 'gridDiv contained no '
        + 'children that matched cellDiv filter');
    }
    const cellDivs = new Array(filtered.length);
    const numberedCells = [], downWalls = [], rightWalls = [];
    for (const cellDiv of filtered) {
      const idx = this.getCellDivIdx(cellDiv);
      cellDivs[idx] = cellDiv;
      const content = this.getCellDivContent(cellDiv);
      if (content > 0) {
        numberedCells[content - 1] = idx;
      }
      if (this.cellDivHasDownWall(cellDiv)) {
        downWalls.push(idx);
      }
      if (this.cellDivHasRightWall(cellDiv)) {
        rightWalls.push(idx);
      }
    }
    return [cellDivs, [rows, cols, numberedCells, downWalls, rightWalls]];
  }

  // Dispatches the computed click events one by one. In-progress puzzles are
  // automatically reset by the click sequence unlike with the other games, so
  // there is no extra check to do here.
  async clickCells(cellDivs, clickSequence, delayMs = 0) {
    for (const loc of clickSequence) {
      await anticipateOneMutation(cellDivs[loc], loc);
      await sleep(delayMs);
    }
  }

}

// Obfuscated DOM makes it impossible to deduce walls; luckily, this variation
// includes a hydration script that straight up leaks the solution.
class ZipDomApiV1 extends ZipDomApi {

  async autoSolve(delayMs = 0) {
    const cellSequence = compressSequence(this.getSolution());
    console.info('Solution identified:', cellSequence);
    const gridDiv = this.getZipGridDiv();
    const cellDivs = this.transformZipGridDiv(gridDiv)[0];
    await this.clickCells(cellDivs, cellSequence, delayMs);
  }

  getPreviewData() {
    const gridDiv = this.getZipGridDiv();
    const [cellDivs, zipGridArgs] = this.transformZipGridDiv(gridDiv);
    const [rows, cols] = zipGridArgs;
    const solution = compressSequence(this.getSolution());
    const cells = cellDivs.map(cellDiv => ({
      value: this.getCellDivContent(cellDiv),
      blockers: [],
    }));
    return { rows, cols, cells, solution };
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
    return JSON.parse(hydrationScript.substring(start, end + 1));
  }

  getZipGridDiv() {
    return this.orElseThrow(
      getGridDiv(d => d.querySelector('[data-testid="interactive-grid"]')),
      'getZipGridDiv', 'ZipGridDiv selector yielded nothing');
  }

  getRowsFromGridDiv(gridDiv) {
    return this.getColsFromGridDiv(gridDiv);
  }

  getColsFromGridDiv(gridDiv) {
    const candidates = Object.fromEntries(
      Array.from(gridDiv.style)
        .filter(p => p.startsWith("--") && /^\d+$/.test(gridDiv.style.getPropertyValue(p).trim()))
        .map(p => [p, parseInt(gridDiv.style.getPropertyValue(p))])
    );
    const candidateCount = Object.keys(candidates).length;
    if (candidateCount === 0) {
      orElseThrow(null, 'getDimensionFromGridDiv', 'No appropriate dimension in gridDiv');
    } else if (candidateCount > 1) {
      console.warn('Multiple dimension candidates found in style; dump:', candidates);
    }
    const elem = candidates[Object.keys(candidates)[0]];
    return parseInt(elem);
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

  getCellDivContent(cellDiv) {
    const subCellDiv = cellDiv.querySelector('[data-cell-content="true"]');
    if (subCellDiv) {
      const parsed = parseInt(subCellDiv.textContent);
      return this.orElseThrow(Number.isNaN(parsed) ? null : parsed,
        'getCellDivContent', `Expected number, found ${subCellDiv.textContent}`);
    }
    return -1;
  }

  // TODO: refactor (unused in V1)
  cellDivHasDownWall(cellDiv) {
    return false;
  }

  // TODO: refactor (unused in V1)
  cellDivHasRightWall(cellDiv) {
    return false;
  }

  orElseThrow(result, fname, cause) {
    if (result != null) {
      return result;
    }
    throw new Error(`${fname} failed using ZipDomApiV1: ${cause}`);
  }

  async clickCells(cellDivs, clickSequence, delayMs = 0) {
    for (const loc of clickSequence) {
      await anticipateOneMutation(cellDivs[loc], loc);
      await sleep(delayMs);
    }
  }

}

class ZipDomApiV0 extends ZipDomApi {

  getZipGridDiv() {
    return this.orElseThrow(
      getGridDiv(d => d.querySelector(".grid-game-board")),
      'getZipGridDiv', 'ZipGridDiv selector yielded nothing');
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

  gridDivChildIsCellDiv(gridDivChild) {
    return gridDivChild.attributes?.getNamedItem('data-cell-idx');
  }

  getCellDivIdx(cellDiv) {
    const dataCellIdx = cellDiv.attributes
      ?.getNamedItem('data-cell-idx')?.value;
    return parseInt(this.orElseThrow(dataCellIdx, 'getIdFromCellDiv',
      `Failed to parse an integer data cell ID from ${dataCellIdx}`));
  }

  getCellDivContent(cellDiv) {
    const content = cellDiv.querySelector('.trail-cell-content');
    if (content && content.textContent) {
      const parsed = parseInt(content.textContent);
      return this.orElseThrow(Number.isNaN(parsed) ? null : parsed,
        'getCellDivContent', `Expected number, found ${content.textContent}`);
    }
    return -1;
  }

  cellDivHasDownWall(cellDiv) {
    return cellDiv.querySelector('.trail-cell-wall--down') != null;
  }

  cellDivHasRightWall(cellDiv) {
    return cellDiv.querySelector('.trail-cell-wall--right') != null;
  }

  orElseThrow(result, fname, cause) {
    if (result != null) {
      return result;
    }
    throw new Error(`${fname} failed using ZipDomApiV0: ${cause}`);
  }

}
