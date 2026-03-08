import { autoSolve, getPreviewData, installInlineAutoSolveButton } from './dom.js';

if (!window.__linkedinGamesSolverTangoInitialized) {
	window.__linkedinGamesSolverTangoInitialized = true;
	window['tangoPopupButtonOnClick'] = autoSolve;
	window['tangoPopupPreviewData'] = getPreviewData;
	installInlineAutoSolveButton();
}
