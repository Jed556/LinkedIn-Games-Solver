import { autoSolve, getPreviewData, installInlineAutoSolveButton } from './dom.js';

window['sudokuPopupButtonOnClick'] = autoSolve;
window['sudokuPopupPreviewData'] = getPreviewData;
installInlineAutoSolveButton();
