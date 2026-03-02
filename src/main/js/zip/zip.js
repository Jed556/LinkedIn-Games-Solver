import { autoSolve, getPreviewData, installInlineAutoSolveButton } from './dom.js';

window['zipPopupButtonOnClick'] = autoSolve;
window['zipPopupPreviewData'] = getPreviewData;
installInlineAutoSolveButton();
