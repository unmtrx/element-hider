/**
 * @fileoverview This is the core content script for ElementHider.
 * This script uses a stable, predictable algorithm to hide elements.
 */

/**
 * Escapes characters in a string that have special meaning in regular expressions.
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
function escapeRegExp(str) {
    // This ensures that characters like '.', '+', '*', '?' etc., in a user's keyword are treated literally.
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ====================================================================================
// Configuration & State
// ====================================================================================

const config = {
  blurOption: false, hoveringOption: false, words: [], testingMode: false,
  urlRule: true, urls: "", enabled: true, hidingSensitivity: 50
};
const PICKER_UI_ID = 'ehext-picker-ui';
let isPickerActive = false, isWordPickerActive = false, highlightBox = null, selectedElement = null, observer, throttleTimer = null;
let wordSelection = {
    range: null,
    anchorNode: null,
    anchorOffset: 0
};

// ====================================================================================
// Element & Word Picker Logic
// ====================================================================================

function cleanupPicker() {
    document.body.style.cursor = 'default';
    isPickerActive = false;
    isWordPickerActive = false;
    document.removeEventListener('mousemove', onPickerMouseMove);
    document.removeEventListener('mousemove', onWordPickerMouseMove);
    document.removeEventListener('click', onPickerClick, true);
    document.removeEventListener('click', onWordPickerClick, true);
    document.removeEventListener('keydown', onPickerKeyDown, true);
    window.removeEventListener('scroll', cleanupPicker);
    window.removeEventListener('resize', cleanupPicker);
    document.getElementById(`${PICKER_UI_ID}-highlighter`)?.remove();
    document.getElementById(`${PICKER_UI_ID}-word-highlighter-container`)?.remove();
    document.getElementById(`${PICKER_UI_ID}-dialog`)?.remove();
    document.getElementById(`${PICKER_UI_ID}-styles`)?.remove();
    document.getElementById(`${PICKER_UI_ID}-banner`)?.remove();
    document.querySelectorAll('.ehext-preview-highlight').forEach(e => e.remove());
    highlightBox = null;
    selectedElement = null;
    wordSelection.range = null;
    wordSelection.anchorNode = null;
}

function showGuidance(text) {
    let banner = document.createElement('div');
    banner.id = `${PICKER_UI_ID}-banner`;
    banner.textContent = text;
    document.body.appendChild(banner);
}

function injectStyles() {
    if (document.getElementById(`${PICKER_UI_ID}-styles`)) return;
    const styles = `
        @keyframes ehext-slideDown {
            from { transform: translateY(-100%); }
            to { transform: translateY(0); }
        }
        #${PICKER_UI_ID}-banner {
            position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important;
            background: linear-gradient(to right, #007BFF, #0056b3) !important; color: white !important;
            text-align: center !important; padding: 12px !important; font-size: 18px !important;
            font-weight: 500 !important; z-index: 2147483647 !important;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3) !important;
            animation: ehext-slideDown 0.3s ease-out !important;
        }
        #${PICKER_UI_ID}-highlighter, .${PICKER_UI_ID}-word-highlight {
            position: fixed !important; z-index: 2147483646 !important;
            pointer-events: none !important; box-sizing: border-box !important;
        }
        #${PICKER_UI_ID}-highlighter {
             border: 2px solid #007bff !important;
             background-color: rgba(0, 123, 255, 0.25) !important;
        }
         .${PICKER_UI_ID}-word-highlight {
            background-color: rgba(40, 167, 69, 0.4) !important;
            border-radius: 3px !important;
        }
        #${PICKER_UI_ID}-dialog {
            position: fixed !important; z-index: 2147483647 !important; top: 20px !important; right: 20px !important;
            width: 350px !important; background: linear-gradient(180deg, rgba(16, 27, 45, 0.98), rgba(9, 17, 30, 0.99)) !important;
            border: 1px solid rgba(112, 214, 255, 0.18) !important;
            border-radius: 8px !important; box-shadow: 0 18px 50px rgba(0,0,0,0.35), 0 0 0 1px rgba(112, 214, 255, 0.05) !important;
            padding: 15px !important; font-family: 'Roboto', sans-serif !important; font-size: 14px !important;
            color: #f4f8ff !important; display: block !important; box-sizing: content-box !important;
        }
        #${PICKER_UI_ID}-dialog * { font-family: 'Roboto', sans-serif !important; }
        #${PICKER_UI_ID}-dialog h3 { margin: 0 0 10px !important; font-size: 16px !important; font-weight: 600 !important; color: #f4f8ff !important; }
        #${PICKER_UI_ID}-dialog label { font-weight: 500 !important; margin-bottom: 5px !important; display: block !important; color: #91a7bf !important; }
        #${PICKER_UI_ID}-dialog .selector-input {
            width: 100% !important; padding: 8px !important; box-sizing: border-box !important;
            background: rgba(5, 10, 20, 0.72) !important; border: 1px solid rgba(112, 214, 255, 0.18) !important;
            border-radius: 4px !important; margin-bottom: 10px !important; font-family: monospace !important;
            color: #f4f8ff !important; outline: none !important;
        }
        #${PICKER_UI_ID}-dialog .selector-input:focus {
            border-color: #35d7ff !important;
            box-shadow: 0 0 0 3px rgba(53, 215, 255, 0.14), 0 0 26px rgba(53, 215, 255, 0.12) !important;
        }
        #${PICKER_UI_ID}-dialog .parents-nav { display: flex !important; gap: 5px !important; margin-bottom: 10px !important; flex-wrap: wrap !important; }
        #${PICKER_UI_ID}-dialog .parent-btn {
            background: rgba(255, 255, 255, 0.05) !important; border: 1px solid rgba(112, 214, 255, 0.18) !important;
            border-radius: 4px !important; padding: 3px 8px !important; cursor: pointer !important; color: #91a7bf !important;
        }
        #${PICKER_UI_ID}-dialog .parent-btn:hover { background: rgba(53, 215, 255, 0.12) !important; color: #7be8ff !important; }
        #${PICKER_UI_ID}-dialog .parent-btn.active { background: linear-gradient(135deg, #35d7ff, #1788ff) !important; color: #03111f !important; border-color: transparent !important; }
        #${PICKER_UI_ID}-dialog .match-count { font-size: 12px !important; margin-bottom: 15px !important; color: #91a7bf !important; }
        #${PICKER_UI_ID}-dialog .actions { display: flex !important; justify-content: flex-end !important; gap: 10px !important; }
        #${PICKER_UI_ID}-dialog .actions button {
            padding: 8px 15px !important; border-radius: 4px !important; border: 1px solid rgba(112, 214, 255, 0.18) !important;
            cursor: pointer !important; background: rgba(255, 255, 255, 0.05) !important; color: #f4f8ff !important;
        }
        #${PICKER_UI_ID}-dialog .actions button:hover { background: rgba(53, 215, 255, 0.12) !important; color: #7be8ff !important; }
        #${PICKER_UI_ID}-dialog .actions button.save-btn {
            background: linear-gradient(135deg, #35d7ff, #1788ff) !important; color: #03111f !important;
            border-color: transparent !important; box-shadow: 0 10px 24px rgba(53, 215, 255, 0.22) !important;
        }
        #${PICKER_UI_ID}-dialog .actions button.save-btn:hover { background: linear-gradient(135deg, #7be8ff, #35d7ff) !important; color: #03111f !important; }
        .ehext-preview-highlight {
            position: fixed !important; background-color: rgba(220, 53, 69, 0.3) !important;
            border: 2px solid #dc3545 !important; z-index: 2147483645 !important;
            pointer-events: none !important; box-sizing: border-box !important;
        }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.id = `${PICKER_UI_ID}-styles`;
    styleSheet.innerText = styles;
    (document.head || document.documentElement).appendChild(styleSheet);
}

function startPickerMode() {
    if (isPickerActive || isWordPickerActive) return;
    cleanupPicker(); 
    isPickerActive = true;
    injectStyles();

    highlightBox = document.createElement('div');
    highlightBox.id = `${PICKER_UI_ID}-highlighter`;
    document.body.appendChild(highlightBox);
    
    document.addEventListener('mousemove', onPickerMouseMove);
    document.addEventListener('click', onPickerClick, true);
    document.addEventListener('keydown', onPickerKeyDown, true);
    window.addEventListener('scroll', cleanupPicker, { once: true });
    window.addEventListener('resize', cleanupPicker, { once: true });
}

function startWordPickerMode() {
    if (isPickerActive || isWordPickerActive) return;
    cleanupPicker();
    isWordPickerActive = true;
    injectStyles();
    showGuidance("Hover over words to select them. Click to confirm your selection. Press 'Escape' to cancel.");
    
    const highlighterContainer = document.createElement('div');
    highlighterContainer.id = `${PICKER_UI_ID}-word-highlighter-container`;
    document.body.appendChild(highlighterContainer);

    document.body.style.cursor = 'text';
    document.addEventListener('mousemove', onWordPickerMouseMove);
    document.addEventListener('click', onWordPickerClick, true);
    document.addEventListener('keydown', onPickerKeyDown, true);
}

function onPickerMouseMove(e) {
    if (!isPickerActive || e.target.closest(`#${PICKER_UI_ID}-dialog`)) {
        if(highlightBox) highlightBox.style.display = 'none';
        return;
    }
    const rect = e.target.getBoundingClientRect();
    if(highlightBox) {
        Object.assign(highlightBox.style, {
            display: 'block', top: `${rect.top}px`, left: `${rect.left}px`,
            width: `${rect.width}px`, height: `${rect.height}px`
        });
    }
}

function onWordPickerMouseMove(e) {
    if (!isWordPickerActive) return;

    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!range || !range.startContainer || range.startContainer.nodeType !== Node.TEXT_NODE) {
        return;
    }

    const textNode = range.startContainer;
    const offset = range.startOffset;

    if (!wordSelection.anchorNode) {
        wordSelection.anchorNode = textNode;
        wordSelection.anchorOffset = offset;
    }

    if (textNode !== wordSelection.anchorNode) {
        highlightRange(null);
        wordSelection.anchorNode = null;
        return;
    }

    let start = wordSelection.anchorOffset, end = offset;
    if (start > end) [start, end] = [end, start];

    while(start > 0 && !/\s/.test(textNode.textContent[start - 1])) start--;
    while(end < textNode.textContent.length && !/\s/.test(textNode.textContent[end])) end++;

    const selectionRange = document.createRange();
    selectionRange.setStart(textNode, start);
    selectionRange.setEnd(textNode, end);
    wordSelection.range = selectionRange;

    highlightRange(selectionRange);
}

function highlightRange(range) {
    const container = document.getElementById(`${PICKER_UI_ID}-word-highlighter-container`);
    if (!container) return;
    container.innerHTML = '';
    if (!range) return;

    const rects = range.getClientRects();
    for (const rect of rects) {
        const highlight = document.createElement('div');
        highlight.className = `${PICKER_UI_ID}-word-highlight`;
        Object.assign(highlight.style, {
            top: `${rect.top}px`, left: `${rect.left}px`,
            width: `${rect.width}px`, height: `${rect.height}px`
        });
        container.appendChild(highlight);
    }
}

function onPickerClick(e) {
    if (!isPickerActive || e.target.closest(`#${PICKER_UI_ID}-dialog`)) return;
    e.preventDefault(); e.stopPropagation();
    isPickerActive = false;
    selectedElement = e.target;
    showConfirmationDialog(selectedElement);
}

function onWordPickerClick(e) {
    if (!isWordPickerActive) return;
    e.preventDefault(); e.stopPropagation();
    
    const selectedText = wordSelection.range ? wordSelection.range.toString().trim() : '';
    cleanupPicker();

    if (selectedText) {
        chrome.runtime.sendMessage({ action: "wordSelectedAndOpenPopup", word: selectedText });
    }
}

function onPickerKeyDown(e) { if ((isPickerActive || isWordPickerActive) && e.key === "Escape") cleanupPicker(); }

function generateRobustSelector(el) {
    if (!el || !(el instanceof Element)) return '';
    
    if (el.id) {
        const selector = `#${CSS.escape(el.id)}`;
        try {
            if (document.querySelectorAll(selector).length === 1) return selector;
        } catch (e) {}
    }
    if (el.getAttribute('data-testid')) {
        return `[data-testid="${el.getAttribute('data-testid')}"]`;
    }

    let path = [];
    let current = el;
    while (current && current.tagName !== 'BODY') {
        let selector = current.tagName.toLowerCase();
        if (current.classList.length > 0) {
            const validClasses = Array.from(current.classList)
                .filter(c => !c.includes(':')); 

            if (validClasses.length > 0) {
                selector += `.${validClasses.map(c => CSS.escape(c)).join('.')}`;
            }
        }
       
        let sibling = current, count = 1;
        while (sibling = sibling.previousElementSibling) {
            if (sibling.tagName === current.tagName) { count++; }
        }
        if (count > 1) {
            selector += `:nth-of-type(${count})`;
        }
        path.unshift(selector);
        
        try {
            if (document.querySelectorAll(path.join(' > ')).length === 1) {
                return path.join(' > ');
            }
        } catch(e) {}
        
        current = current.parentElement;
    }
    return path.length > 0 ? path.join(' > ') : '';
}

function showConfirmationDialog(element) {
    if (document.getElementById(`${PICKER_UI_ID}-dialog`)) return;
    injectStyles();
    
    const dialog = document.createElement('div');
    dialog.id = `${PICKER_UI_ID}-dialog`;
    document.body.appendChild(dialog);
    
    let currentElement = element;
    
    const render = () => {
        const selector = generateRobustSelector(currentElement);
        const parentButtons = [];
        let tempEl = currentElement;
        for (let i=0; i < 5 && tempEl.parentElement && tempEl.tagName !== 'BODY'; i++) {
            parentButtons.push(`<button class="parent-btn ${tempEl === currentElement ? 'active' : ''}" data-level="${i}">${tempEl.tagName.toLowerCase()}</button>`);
            tempEl = tempEl.parentElement;
        }

        dialog.innerHTML = `
            <h3>Create a Hiding Rule</h3>
            <label>CSS Selector:</label>
            <input type="text" class="selector-input" value="${selector}">
            <label>Select Element Level:</label>
            <div class="parents-nav">${parentButtons.join('')}</div>
            <div class="match-count"></div>
            <div class="actions">
                <button class="cancel-btn">Cancel</button>
                <button class="save-btn">Save Rule</button>
            </div>
        `;
        updateMatchCount();
    };
    
    const updateMatchCount = () => {
        const input = dialog.querySelector('.selector-input');
        const countDiv = dialog.querySelector('.match-count');
        document.querySelectorAll('.ehext-preview-highlight').forEach(e => e.remove());
        try {
            const matches = document.querySelectorAll(input.value);
            countDiv.textContent = `${matches.length} element(s) found.`;
            matches.forEach(m => {
                const rect = m.getBoundingClientRect();
                const previewBox = document.createElement('div');
                previewBox.className = 'ehext-preview-highlight';
                document.body.appendChild(previewBox);
                Object.assign(previewBox.style, {
                    top: `${rect.top}px`, left: `${rect.left}px`,
                    width: `${rect.width}px`, height: `${rect.height}px`,
                });
            });

        } catch (e) {
            countDiv.textContent = 'Invalid selector.';
        }
    };
    
    dialog.addEventListener('click', e => {
        e.stopPropagation(); e.preventDefault();
        if (e.target.classList.contains('cancel-btn')) {
            cleanupPicker();
        }
        if (e.target.classList.contains('save-btn')) {
            const selector = dialog.querySelector('.selector-input').value;
            saveNewRule(selector);
            cleanupPicker();
        }
        if (e.target.classList.contains('parent-btn')) {
            const level = parseInt(e.target.dataset.level, 10);
            let newEl = element;
            for(let i=0; i < level; i++) {
                if (newEl.parentElement) newEl = newEl.parentElement;
            }
            currentElement = newEl;
            render();
        }
    });

    dialog.addEventListener('input', e => {
        if (e.target.classList.contains('selector-input')) {
            updateMatchCount();
        }
    });

    render();
}

async function saveNewRule(selector) {
    if (!selector) return;
    const newRule = `{${selector}}`;
    try {
        const existingWords = await new Promise(resolve => getStoredWords(resolve));
        const updatedWords = existingWords ? `${existingWords}\n${newRule}` : newRule;
        await new Promise(resolve => setStoredWords(updatedWords, resolve));
        config.words = processKeywords(updatedWords);
        runHider();
    } catch(e) {
        console.error("ElementHider: Failed to save new rule.", e);
    }
}

// ====================================================================================
// Core Hiding Logic
// ====================================================================================

function processKeywords(rawWords) {
    if (!rawWords) return { textKeywords: [], selectorKeywords: [] };
    
    const textKeywords = [];
    const selectorKeywords = [];
    
    rawWords.split("\n").forEach(line => {
        if (!line || line.startsWith("//")) return;

        // Handle CSS selector rules like {div.ad}
        if (line.startsWith("{") && line.endsWith("}")) {
            const selector = line.slice(1, -1);
            selectorKeywords.push({ selector: selector, url: null }); 
            return;
        }

        let [word, rule] = line.split('>>>').map(s => s.trim());
        let url = null, sensitivity = null;

        if (rule) {
            let rawSens;
            [url, rawSens] = rule.split('&&&').map(s => s.trim());
            sensitivity = parseInt(rawSens, 10) || null;
        }
        
        const isExact = word.startsWith('*');
        if (isExact) word = word.slice(1);

        const isCaseInsensitive = word.endsWith('^');
        if (isCaseInsensitive) word = word.slice(0, -1);
        
        if (!word) return; // Skip empty keywords that might result from parsing

        const escapedWord = escapeRegExp(word);
        let pattern;

        if (isExact) {
            // Use negative lookarounds to ensure the keyword is not part of a larger word-like token.
            // (?<!\S) ensures the preceding character is whitespace or it's the start of the string.
            // (?!\S) ensures the following character is whitespace or it's the end of the string.
            // This correctly handles keywords with special characters like '@' or '#'.
            pattern = `(?<!\\S)${escapedWord}(?!\\S)`;
        } else {
            pattern = escapedWord;
        }

        const flags = isCaseInsensitive ? "i" : "";

        try {
            textKeywords.push({ regex: new RegExp(pattern, flags), original: word, url, sensitivity });
        } catch (e) { 
            console.error(`ElementHider: Invalid regex for keyword "${word}"`, e); 
        }
    });

    return { textKeywords, selectorKeywords };
}


function testElem(elem, word) {
    elem.style.outline = '3px solid #33FF33';
    elem.style.backgroundColor = 'rgba(51, 255, 51, 0.2)';
    const info = document.createElement('div');
    info.textContent = `Match for "${word}"`;
    Object.assign(info.style, {
        position: 'absolute', top: '0', left: '0', backgroundColor: '#33FF33', color: 'black',
        padding: '2px 5px', fontSize: '10px', zIndex: '999999999'
    });
    elem.style.position = 'relative';
    elem.appendChild(info);
}

function hideElem(elem, word) {
    if (config.blurOption) {
        elem.style.filter = 'blur(5px)';
        if (config.hoveringOption) {
            elem.onmouseenter = () => elem.style.filter = 'none';
            elem.onmouseleave = () => elem.style.filter = 'blur(5px)';
        }
    } else {
        elem.style.display = 'none';
    }
}

function findBestParentToHide(node, keyword) {
    const effectiveSensitivity = (keyword && typeof keyword.sensitivity === 'number') ?
        keyword.sensitivity :
        config.hidingSensitivity;

    const maxLevels = Math.ceil((effectiveSensitivity / 100) * 10);

    let bestCandidate = node.parentElement;
    let current = node.parentElement;

    for (let i = 0; i < maxLevels && current && current.tagName !== 'BODY' && current.nodeType !== Node.DOCUMENT_FRAGMENT_NODE; i++) {
        const rect = current.getBoundingClientRect();
        if (rect.width > window.innerWidth * 0.9 || rect.height > window.innerHeight * 0.7) {
            break;
        }
        bestCandidate = current;
        current = current.parentElement;
    }

    return bestCandidate;
}

function executeHideOnRoot(rootElement) {
  let elementsToHide = new Set();
  
  if (config.words.selectorKeywords) {
    config.words.selectorKeywords.forEach(item => {
        if (!item.url || window.location.href.includes(item.url)) {
            try {
                rootElement.querySelectorAll(item.selector).forEach(elem => {
                    if (!elem.closest('[data-ehext-processed]')) elementsToHide.add({elem: elem, word: `{${item.selector}}`});
                });
            } catch(e) {}
        }
    });
  }

  if (config.words.textKeywords) {
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => (node.textContent.trim() && !node.parentElement.closest('script, style, textarea, [data-ehext-processed]')) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    let node;
    while (node = walker.nextNode()) {
        for (const keyword of config.words.textKeywords) {
            if (!keyword.url || window.location.href.includes(keyword.url)) {
                if (keyword.regex.test(node.textContent)) {
                    const targetElement = findBestParentToHide(node, keyword);
                    if (targetElement) {
                        elementsToHide.add({elem: targetElement, word: keyword.original});
                    }
                    break;
                }
            }
        }
    }
  }

  elementsToHide.forEach(item => {
      item.elem.dataset.ehextProcessed = 'true';
      if (config.testingMode) { testElem(item.elem, item.word); } 
      else { hideElem(item.elem, item.word); }
  });
}

function runHider() {
  function recursiveScan(rootNode) {
      if (!rootNode) return;
      executeHideOnRoot(rootNode);
      const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT);
      let el;
      while ((el = walker.nextNode())) {
          if (el.shadowRoot) {
              recursiveScan(el.shadowRoot);
          }
      }
  }
  window.requestAnimationFrame(() => recursiveScan(document.body));
}


function shouldRunOnPage() {
  if (!config.enabled) return false;
  if (!config.urls) return true;
  const currentUrl = window.location.href;
  const urlList = config.urls.split("\n").filter(Boolean);
  for (const url of urlList) {
    if (currentUrl.includes(url.trim())) return !config.urlRule;
  }
  return config.urlRule;
}

// ====================================================================================
// Initialization & Event Listeners
// ====================================================================================

function init() {
  if (observer) observer.disconnect();
  document.querySelectorAll('.ehext-preview-highlight').forEach(e => e.remove());
  if (!shouldRunOnPage()) return;

  setTimeout(() => window.requestAnimationFrame(runHider), 100);

  observer = new MutationObserver(() => {
    if (throttleTimer) return;
    throttleTimer = setTimeout(() => {
        window.requestAnimationFrame(runHider);
        throttleTimer = null;
    }, 250);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.greeting === 'urlChange') {
        setTimeout(init, 500);
    }
    else if (request.action === 'start-picker') {
        startPickerMode();
        sendResponse({status: "ok"});
    }
    else if (request.action === 'start-word-picker') {
        startWordPickerMode();
        sendResponse({status: "ok"});
    }
    return true;
});

chrome.storage.sync.get(
  ["blurOption", "hoveringOption", "testingMode", "urlRule", "urls", "enabled", "hidingSensitivity"],
  (result) => {
    Object.assign(config, result);
    config.hidingSensitivity = parseInt(result.hidingSensitivity, 10) || 50;
    getStoredWords((rawWords) => {
        config.words = processKeywords(rawWords);
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            init();
        } else {
            document.addEventListener('DOMContentLoaded', init, {once: true});
        }
    });
  }
);
