import { autoSolve, getPreviewData, installInlineAutoSolveButton } from './dom.js';

if (!window.__linkedinGamesSolverQueensInitialized) {
	window.__linkedinGamesSolverQueensInitialized = true;
	window['queensPopupButtonOnClick'] = autoSolve;
	window['queensPopupPreviewData'] = getPreviewData;
	installInlineAutoSolveButton();
}
