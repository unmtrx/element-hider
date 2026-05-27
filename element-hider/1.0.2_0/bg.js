/**
 * @fileoverview The background service worker for the ElementHider extension.
 * This script is non-persistent (event-based). Its sole purpose is to detect
 * URL changes in tabs and notify the content script, which is crucial for
 * single-page applications where navigation doesn't trigger a full page load.
 */

/**
 * Informs the content script when a tab's URL changes.
 */
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
	// We only care about messages where the URL has changed.
	if (changeInfo.url) {
		chrome.tabs.sendMessage(tabId, { greeting: 'urlChange' }, function(response) {
            // Silently ignore errors. This can happen on special pages
            // where content scripts can't be injected (e.g., the Chrome Web Store).
            if (chrome.runtime.lastError) {}
        });
	}
});

/**
 * Listens for messages from the content script.
 */
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    // When the word picker selects a word, store it and open the popup.
    if (request.action === "wordSelectedAndOpenPopup") {
        // First, save the word so the popup can retrieve it.
        chrome.storage.local.set({ 'temp_selected_word': request.word }, () => {
            // Then, open the popup.
            chrome.action.openPopup();
        });
        return true; // Indicates an asynchronous response.
    }
});
