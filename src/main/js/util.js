export function getGridDiv(extractFromDocument) {
  let gridDiv = extractFromDocument.call(null, document);
  if (!gridDiv) {
    const frame = document.querySelector('iframe');
    if (frame) {
      const frameDoc = frame.contentDocument || frame.contentWindow?.document;
      if (frameDoc) {
        gridDiv = extractFromDocument.call(null, frameDoc);
      }
    }
    if (!gridDiv) {
      throw new Error('Could not extract div corresponding to grid');
    }
  }
  return gridDiv;
}

export function isLinkedInSignedIn() {
  return document.querySelector('button[data-view-name="navigation-settings"]') != null;
}

export function doOneMouseCycle(clickTarget) {
  const commonClickArgs = { bubbles: true, cancelable: true, view: window };
  clickTarget.dispatchEvent(new MouseEvent('mousedown', commonClickArgs));
  clickTarget.dispatchEvent(new MouseEvent('mouseup', commonClickArgs));
}

export function doOneClick(clickTarget) {
  const commonClickArgs = { bubbles: true, cancelable: true, view: window };
  clickTarget.dispatchEvent(new MouseEvent('mousedown', commonClickArgs));
  clickTarget.dispatchEvent(new MouseEvent('mouseup', commonClickArgs));
  clickTarget.dispatchEvent(new MouseEvent('click', commonClickArgs));
}

export async function anticipateOneMutation(cellDiv, loc) {
  return new Promise((resolve, reject) => {
    // Timeout-based cleanup (in case no mutations are observed)
    let timeoutRef = setTimeout(() => {
      observer.disconnect();
      console.error('Timed out anticipating mutation on', cellDiv);
      return reject(new Error('Timed out trying to clear cell ' + loc));
    }, 10000);
    // Clean up (including aforementioned timeout) if mutation is observed
    const observer = new MutationObserver(() => {
      clearTimeout(timeoutRef);
      observer.disconnect();
      return resolve();
    });
    // Register the observer
    observer.observe(cellDiv, { attributes: true, childList: true, subtree: true });
    // Kickoff!
    doOneMouseCycle(cellDiv);
  });
}

export async function sleep(ms) {
  if (!ms || ms <= 0) {
    return;
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Used by Queens, Tango, and Zip
export function createInlineControlButtonInstaller(options) {
  const {
    buttonId,
    buttonLabel,
    onClick,
    getControlsDiv,
    waitTimeoutMs = 10000,
  } = options;

  let installStarted = false;

  function install() {
    if (installStarted) {
      return;
    }
    installStarted = true;
    installOnce().catch(() => {
    });
  }

  async function installOnce() {
    if (ensureButton()) {
      return;
    }
    const controlsDiv = await waitForControlsDiv(getControlsDiv, waitTimeoutMs);
    if (!controlsDiv) {
      return;
    }
    ensureButton(controlsDiv);
  }

  function ensureButton(controlsDivOverride = null) {
    let controlsDiv = controlsDivOverride;
    if (!controlsDiv) {
      try {
        controlsDiv = getControlsDiv();
      } catch (_e) {
        return false;
      }
    }

    const doc = controlsDiv.ownerDocument;
    const existingButton = doc.getElementById(buttonId);
    const nativeButton = getPreferredNativeButton(controlsDiv, buttonId);
    if (existingButton) {
      if (!controlsDiv.contains(existingButton)) {
        const existingWrapper = getButtonWrapper(existingButton);
        if (existingWrapper) {
          controlsDiv.appendChild(existingWrapper);
        } else {
          controlsDiv.appendChild(existingButton);
        }
      }
      applyAutoSolveButtonAttributes(existingButton, buttonId);
      setButtonText(existingButton, doc, buttonLabel);
      return true;
    }

    const nativeWrapper = getButtonWrapper(nativeButton);
    const wrapper = nativeWrapper ? nativeWrapper.cloneNode(false) : doc.createElement('span');
    if (wrapper.tagName === 'SPAN' && !wrapper.classList.contains('under-board-controls-item')) {
      wrapper.classList.add('under-board-controls-item');
    }

    const solveButton = nativeButton ? nativeButton.cloneNode(true) : doc.createElement('button');
    applyAutoSolveButtonAttributes(solveButton, buttonId);

    setButtonText(solveButton, doc, buttonLabel);
    solveButton.addEventListener('click', onClick);

    wrapper.replaceChildren(solveButton);
    controlsDiv.appendChild(wrapper);
    return true;
  }

  return { install };
}

function waitForControlsDiv(getControlsDiv, timeoutMs) {
  const immediate = tryGetControlsDiv(getControlsDiv);
  if (immediate) {
    return Promise.resolve(immediate);
  }

  return new Promise(resolve => {
    let settled = false;
    let observer = null;
    let frameObserver = null;
    let timer = null;

    const cleanup = () => {
      observer?.disconnect();
      frameObserver?.disconnect();
      if (timer) {
        clearTimeout(timer);
      }
    };

    const finish = (controlsDiv) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(controlsDiv ?? null);
    };

    const onDomChange = () => {
      const controlsDiv = tryGetControlsDiv(getControlsDiv);
      if (controlsDiv) {
        finish(controlsDiv);
      }
    };

    timer = setTimeout(() => finish(null), timeoutMs);

    if (document.body) {
      observer = new MutationObserver(onDomChange);
      observer.observe(document.body, { childList: true, subtree: true });
    }

    const frame = document.querySelector('iframe');
    if (frame) {
      frame.addEventListener('load', onDomChange, { once: true });
      const frameDoc = frame.contentDocument || frame.contentWindow?.document;
      if (frameDoc?.body) {
        frameObserver = new MutationObserver(onDomChange);
        frameObserver.observe(frameDoc.body, { childList: true, subtree: true });
      }
    }

    onDomChange();
  });
}

function tryGetControlsDiv(getControlsDiv) {
  try {
    return getControlsDiv();
  } catch (_e) {
    return null;
  }
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

function getPreferredNativeButton(controlsDiv, excludeButtonId = null) {
  const buttons = Array.from(controlsDiv.querySelectorAll('button'));
  const filteredButtons = buttons.filter(button => button.id !== excludeButtonId
    && (button.getAttribute('data-control-btn') ?? '').toLowerCase() !== 'auto-solve');
  const candidates = filteredButtons.length > 0 ? filteredButtons : buttons;
  if (candidates.length === 0) {
    return null;
  }

  const isCollapseControl = (button) => {
    const ariaLabel = (button.getAttribute('aria-label') ?? '').toLowerCase();
    const dataControlBtn = (button.getAttribute('data-control-btn') ?? '').toLowerCase();
    if (ariaLabel.includes('collapse') || ariaLabel.includes('instructions')
      || ariaLabel.includes('expand')) {
      return true;
    }
    return dataControlBtn.includes('collapse') || dataControlBtn.includes('instructions');
  };

  const preferred = candidates.find(button => !isCollapseControl(button)
    && !button.classList.contains('artdeco-button--circle'));
  if (preferred) {
    return preferred;
  }

  return candidates.find(button => !isCollapseControl(button)) ?? candidates[0];
}

function applyAutoSolveButtonAttributes(button, buttonId) {
  removeAttributeIfPresent(button, 'disabled');
  removeAttributeIfPresent(button, 'aria-label');
  removeAttributeIfPresent(button, 'aria-expanded');
  removeAttributeIfPresent(button, 'aria-controls');
  if (button.id !== buttonId) {
    button.id = buttonId;
  }
  if (button.type !== 'button') {
    button.type = 'button';
  }
  if (button.getAttribute('data-control-btn') !== 'auto-solve') {
    button.setAttribute('data-control-btn', 'auto-solve');
  }
  if (button.getAttribute('aria-disabled') !== 'false') {
    button.setAttribute('aria-disabled', 'false');
  }
}

function setButtonText(button, doc, label) {
  if (button.children.length === 1 && button.firstElementChild?.tagName === 'SPAN') {
    const onlyChild = button.firstElementChild;
    const className = (onlyChild.className ?? '').trim();
    const text = (onlyChild.textContent ?? '').trim();
    if (className === 'artdeco-button__text' && text === label) {
      return;
    }
  }
  const textSpan = doc.createElement('span');
  textSpan.className = 'artdeco-button__text';
  textSpan.textContent = label;
  button.replaceChildren(textSpan);
}

function removeAttributeIfPresent(button, attributeName) {
  if (button.hasAttribute(attributeName)) {
    button.removeAttribute(attributeName);
  }
}
