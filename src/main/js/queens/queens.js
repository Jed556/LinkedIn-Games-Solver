import { autoSolve, getPreviewData, installInlineAutoSolveButton } from './dom.js';

window['queensPopupButtonOnClick'] = autoSolve;
window['queensPopupPreviewData'] = getPreviewData;
installInlineAutoSolveButton();
