import { autoSolve, getPreviewData, installInlineAutoSolveButton } from './dom.js';

window['tangoPopupButtonOnClick'] = autoSolve;
window['tangoPopupPreviewData'] = getPreviewData;
installInlineAutoSolveButton();
