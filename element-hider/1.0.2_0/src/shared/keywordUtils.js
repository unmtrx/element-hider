/**
 * @fileoverview Shared utility functions for keyword and settings management.
 */

/**
 * Parses the raw text from storage into an array of keyword objects.
 * @param {string} rawText The raw string of keywords.
 * @returns {Array<Object>} An array of keyword objects.
 */
function parseRawText(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    return rawText.split('\n').map(line => {
        if (!line) return null;
        const isAdvanced = line.startsWith('//') || (line.startsWith('{') && line.endsWith('}'));
        let [word, rule] = line.split('>>>').map(s => s.trim());
        let url = null, sensitivity = null;
        if (rule) { [url, sensitivity] = rule.split('&&&').map(s => s.trim()); }
        const isExact = word.startsWith('*');
        if (isExact) word = word.slice(1);
        const isCaseInsensitive = word.endsWith('^');
        if (isCaseInsensitive) word = word.slice(0, -1);
        return { text: word, exact: isExact, caseInsensitive: isCaseInsensitive, url: url || null, sensitivity: sensitivity || null, isAdvanced };
    }).filter(k => k);
}

/**
 * Compiles an array of keyword objects back into a raw string for storage.
 * @param {Array<Object>} keywordArray The array of keyword objects.
 * @param {number} globalHidingSensitivity The global sensitivity setting.
 * @returns {string} The raw string for storage.
 */
function compileToRawText(keywordArray, globalHidingSensitivity) {
    return keywordArray.map(k => {
        if (k.isAdvanced) return k.text;
        let line = k.text;
        if (k.exact) line = '*' + line;
        if (k.caseInsensitive) line = line + '^';
        const sensitivity = k.sensitivity; // Use the stored sensitivity directly
         if (k.url || (sensitivity && sensitivity.toString().trim() !== globalHidingSensitivity.toString())) {
            line += ` >>> ${k.url || ''}`;
            if (sensitivity && sensitivity.toString().trim() !== globalHidingSensitivity.toString()) {
                line += ` &&& ${k.sensitivity}`;
            } else if (k.url && sensitivity) {
                // If URL is present, but sensitivity is default, we still need the separator
                line += ` &&& ${k.sensitivity}`;
            }
        }
        return line;
    }).join('\n');
}

const WORDS_STORAGE_KEYS = ['words', 'words_overflow'];

function getKeywordChunkLimit() {
    return chrome.storage.sync.QUOTA_BYTES_PER_ITEM - 128;
}

function getKeywordQuota() {
    return getKeywordChunkLimit() * WORDS_STORAGE_KEYS.length;
}

function splitTextByByteLimit(text, limit, maxParts) {
    const parts = [];
    let current = '';
    for (const char of text || '') {
        if (new Blob([current + char]).size > limit && parts.length < maxParts - 1) {
            parts.push(current);
            current = char;
        } else {
            current += char;
        }
    }
    parts.push(current);
    return parts;
}

function getStoredWords(callback) {
    chrome.storage.sync.get(WORDS_STORAGE_KEYS, function(result) {
        callback(WORDS_STORAGE_KEYS.map(key => result[key] || '').join(''));
    });
}

function setStoredWords(rawText, callback) {
    const parts = splitTextByByteLimit(rawText || '', getKeywordChunkLimit(), WORDS_STORAGE_KEYS.length);
    const settings = {};
    WORDS_STORAGE_KEYS.forEach((key, index) => {
        settings[key] = parts[index] || '';
    });
    chrome.storage.sync.set(settings, callback);
}

/**
 * Updates the storage usage meter UI element.
 * @param {string} text The text to measure.
 */
function updateStorageMeter(text) {
    const byteSize = new Blob([text || '']).size;
    const quota = getKeywordQuota();
    const percentage = Math.min(100, Math.round((byteSize / quota) * 100));
    const progress = $('#storage-progress');
    $('#storage-percentage').text(`${percentage}%`);
    progress.width(`${percentage}%`);
    progress.removeClass('limit-warning', 'limit-exceeded');
    if (percentage > 99) {
        progress.addClass('limit-exceeded');
    } else if (percentage > 85) {
        progress.addClass('limit-warning');
    }
}

/**
 * Saves a single key-value pair to chrome.storage.sync.
 * @param {string} key The key to save.
 * @param {*} value The value to save.
 */
function saveOption(key, value) {
    if (key === 'words') {
        setStoredWords(value);
        return;
    }
    const settings = {};
    settings[key] = value;
    chrome.storage.sync.set(settings);
}
