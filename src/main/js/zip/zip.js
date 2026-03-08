import { autoSolve, getPreviewData, installInlineAutoSolveButton } from './dom.js';

if (!window.__linkedinGamesSolverZipInitialized) {
	window.__linkedinGamesSolverZipInitialized = true;
	window['zipPopupButtonOnClick'] = autoSolve;
	window['zipPopupPreviewData'] = getPreviewData;
	installInlineAutoSolveButton();
}
