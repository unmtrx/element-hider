$(document).ready(function() {
    let keywords = [];
    let currentlyEditingIndex = -1;
    let globalHidingSensitivity = 50; // Default fallback

    function saveKeywordsAndUpdate() {
        const rawText = compileToRawText(keywords, globalHidingSensitivity);
        saveOption('words', rawText);
        $('#keywords-bulk').val(rawText);
        renderListView();
        updateStorageMeter(rawText);
    }

    function loadAndRender() {
        chrome.storage.local.get('newKeywordState', function(result) {
            if (result.newKeywordState) {
                const state = result.newKeywordState;
                $('#new-keyword-text').val(state.text || '');
                $('#new-keyword-exact').prop('checked', state.exact || false);
                $('#new-keyword-case').prop('checked', state.case || false);
                $('#new-keyword-selector').prop('checked', state.selector || false).trigger('change');
                $('#advanced-toggle').prop('checked', state.advanced || false).trigger('change');
                
                $('#new-keyword-url').val(state.url || '');
                const sensitivity = state.sensitivity || globalHidingSensitivity;
                $('#new-keyword-sensitivity').val(sensitivity);
                $('#new-keyword-sensitivity').next('.sensitivity-value-display').text(sensitivity);
            }
        });

        chrome.storage.local.get('temp_selected_word', function(result) {
            if (result.temp_selected_word) {
                $('#new-keyword-text').val(result.temp_selected_word).focus();
                chrome.storage.local.remove('temp_selected_word');
            }
        });

        chrome.storage.sync.get(['enabled', 'testingMode', 'hidingSensitivity'], function(result) {
            globalHidingSensitivity = result.hidingSensitivity || 50;
            getStoredWords(function(currentWords) {
                keywords = parseRawText(currentWords);
                $('#keywords-bulk').val(currentWords);
                renderListView();
                updateStorageMeter(currentWords);
                $("#toggleTesting").prop("checked", !!result.testingMode);
                $("#toggle").prop("checked", !!result.enabled);
                onOff();
            });
        });
    }

    function onOff() {
        if ($("#toggle").prop("checked")) {
            chrome.action.setBadgeText({ text: "ON" });
            chrome.action.setBadgeBackgroundColor({ color: "green" });
        } else {
            chrome.action.setBadgeText({ text: "OFF" });
            chrome.action.setBadgeBackgroundColor({ color: "red" });
        }
    }

    function saveEnabled() {
        saveOption('enabled', $("#toggle").prop("checked"));
        onOff();
    }
    
    function openAdvancedConfig() {
      chrome.tabs.create({ url: chrome.runtime.getURL("src/browser_action/KeywordEditor.html") });
    }
    
    function openGuide() {
        chrome.tabs.create({ url: chrome.runtime.getURL("src/browser_action/guide.html") });
    }

    function renderListView() {
        const container = $('#keyword-list-container');
        container.empty();
        keywords.forEach((keyword, index) => {
            const item = $($('#keyword-item-template').html());
            item.attr('data-index', index);
            item.find('.keyword-text').text(keyword.text);
            
            if (keyword.isAdvanced && keyword.text.startsWith('{')) {
                item.find('.selector-tag').removeClass('hidden');
            }
            if (keyword.exact) item.find('.exact-tag').removeClass('hidden');
            if (keyword.caseInsensitive) item.find('.case-tag').removeClass('hidden');
            
            let urlText = keyword.url ? `(URL: ${keyword.url})` : '';
            if (keyword.sensitivity) urlText += ` [sens: ${keyword.sensitivity}]`;
            item.find('.keyword-url').text(urlText);

            if (keyword.isAdvanced) {
                item.find('.keyword-text').css({ 'font-style': 'italic', 'color': '#666' });
            }
            container.append(item);
        });
    }

    function switchToBulkView() {
        $('#keywords-bulk').val(compileToRawText(keywords, globalHidingSensitivity));
        $('#list-view').addClass('hidden');
        $('#bulk-view').removeClass('hidden');
    }

    function switchToListView(save) {
        if (save) {
            const rawText = $('#keywords-bulk').val();
            keywords = parseRawText(rawText);
            saveKeywordsAndUpdate();
        }
        $('#bulk-view').addClass('hidden');
        $('#list-view').removeClass('hidden');
    }

    function clearNewKeywordForm() {
        $('#new-keyword-text, #new-keyword-url').val('');
        $('#new-keyword-sensitivity').val(globalHidingSensitivity).trigger('input');
        $('#new-keyword-exact, #new-keyword-case, #new-keyword-selector, #advanced-toggle').prop('checked', false).trigger('change');
        chrome.storage.local.remove('newKeywordState');
    }

    // --- Event Handlers ---

    $('#add-keyword-form').on('change input', function() {
        const state = {
            text: $('#new-keyword-text').val(),
            exact: $('#new-keyword-exact').is(':checked'),
            case: $('#new-keyword-case').is(':checked'),
            selector: $('#new-keyword-selector').is(':checked'),
            advanced: $('#advanced-toggle').is(':checked'),
            url: $('#new-keyword-url').val(),
            sensitivity: $('#new-keyword-sensitivity').val()
        };
        chrome.storage.local.set({ newKeywordState: state });
    });

    $('#new-keyword-selector').on('change', function() {
        const isChecked = $(this).is(':checked');
        $('#new-keyword-exact, #new-keyword-case, #advanced-toggle').prop('disabled', isChecked);
        $('#exact-match-option, #case-option, .advanced-options-label').css('color', isChecked ? '#aaa' : 'var(--text-secondary)');
        if (isChecked) {
             $('#new-keyword-exact, #new-keyword-case, #advanced-toggle').prop('checked', false).trigger('change');
        }
    });

     $('#clear-new-keyword-btn').on('click', function(e) {
        e.preventDefault();
        clearNewKeywordForm();
    });

    $('#get-current-url-btn').on('click', function() {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
                try {
                    const url = new URL(tabs[0].url);
                    const hostname = url.hostname.replace(/^www\./, '');
                    $('#new-keyword-url').val(hostname).trigger('input');
                } catch (e) {
                    console.error("Could not parse current tab's URL", e);
                }
            }
        });
    });

    $('#advanced-toggle').on('change', function() {
        const isChecked = $(this).is(':checked');
        $('#advanced-options-container').toggleClass('hidden', !isChecked);
         if (isChecked) {
            $('#new-keyword-sensitivity').val(globalHidingSensitivity).trigger('input');
        } else {
            $('#new-keyword-url').val('').trigger('input');
            $('#new-keyword-sensitivity').val(globalHidingSensitivity).trigger('input');
        }
    });

    function isInjectableFrameUrl(url) {
        return /^https?:\/\//.test(url || '');
    }

    function alertPickerUnavailable(activeUrl) {
        if ((activeUrl || '').startsWith('chrome-extension://')) {
            alert("ElementHider cannot inspect the extension page itself.\n\nFor MultiView, reload ElementHider and MultiView, open websites inside MultiView frames, then try the picker again inside the website frame. MultiView's own buttons/UI still must be edited in MultiView code.");
            return;
        }
        alert("ElementHider's content script is not responding on this page.\n\nPlease try refreshing the page. This is often required after first installing or updating an extension.");
    }

    function sendPickerToFrame(tabId, frameId, action, callback) {
        chrome.tabs.sendMessage(tabId, { action: action }, { frameId: frameId }, function(response) {
            callback(!chrome.runtime.lastError && response && response.status === "ok");
        });
    }

    function activatePickerInFrames(tab, action) {
        chrome.webNavigation.getAllFrames({ tabId: tab.id }, function(frames) {
            if (chrome.runtime.lastError || !Array.isArray(frames)) {
                alertPickerUnavailable(tab.url);
                return;
            }

            const frameIds = frames
                .filter(frame => isInjectableFrameUrl(frame.url))
                .map(frame => frame.frameId);

            if (!frameIds.length) {
                alertPickerUnavailable(tab.url);
                return;
            }

            let pending = frameIds.length;
            let startedCount = 0;
            frameIds.forEach(frameId => {
                sendPickerToFrame(tab.id, frameId, action, function(started) {
                    if (started) startedCount++;
                    pending--;
                    if (pending === 0) {
                        if (startedCount > 0) {
                            window.close();
                        } else {
                            alertPickerUnavailable(tab.url);
                        }
                    }
                });
            });
        });
    }

    function activatePickerInExternalExtension(tab, action, callback) {
        let extensionId = '';
        try {
            extensionId = new URL(tab.url).hostname;
        } catch (e) {
            callback(false);
            return;
        }

        if (!extensionId || extensionId === chrome.runtime.id) {
            callback(false);
            return;
        }

        chrome.runtime.sendMessage(extensionId, {
            action: 'elementHiderStartPicker',
            pickerAction: action,
            tabId: tab.id
        }, function(response) {
            callback(!chrome.runtime.lastError && response && response.status === 'ok');
        });
    }

    function activatePicker(action) {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs[0] && tabs[0].id) {
                const tab = tabs[0];
                if (chrome.webNavigation && tab.url && tab.url.startsWith('chrome-extension://')) {
                    activatePickerInExternalExtension(tab, action, function(started) {
                        if (started) {
                            window.close();
                        } else {
                            activatePickerInFrames(tab, action);
                        }
                    });
                    return;
                }

                chrome.tabs.sendMessage(tab.id, { action: action }, function(response) {
                    if (chrome.runtime.lastError) {
                        alertPickerUnavailable(tab.url);
                    } else if (response && response.status === "ok") {
                        window.close();
                    }
                });
            }
        });
    }

    $('#pick-word-btn').on('click', () => activatePicker('start-word-picker'));
    $('#pick-element-btn').on('click', () => activatePicker('start-picker'));
    
    $('#add-keyword-btn').on('click', function() {
        let text = $('#new-keyword-text').val().trim();
        if (!text) return;

        const isSelector = $('#new-keyword-selector').is(':checked');

        if (isSelector) {
            if (!text.startsWith('{')) text = '{' + text;
            if (!text.endsWith('}')) text = text + '}';
            keywords.push({ text: text, isAdvanced: true });
        } else {
            const isAdvanced = $('#advanced-toggle').is(':checked');
            let newSensitivity = isAdvanced ? ($('#new-keyword-sensitivity').val().trim() || null) : null;
            if (newSensitivity && newSensitivity == globalHidingSensitivity) {
                newSensitivity = null;
            }

            const newKeyword = { 
                text: text, 
                exact: $('#new-keyword-exact').is(':checked'), 
                caseInsensitive: $('#new-keyword-case').is(':checked'), 
                url: isAdvanced ? ($('#new-keyword-url').val().trim() || null) : null, 
                sensitivity: newSensitivity, 
                isAdvanced: false 
            };
            keywords.push(newKeyword);
        }
        
        saveKeywordsAndUpdate();
        clearNewKeywordForm();
    });

    $('#keyword-list-container').on('click', '.delete-btn', function(e) {
        e.stopPropagation();
        const index = $(this).closest('.keyword-item').data('index');
        keywords.splice(index, 1);
        saveKeywordsAndUpdate();
    });

    $('#keyword-list-container').on('click', '.keyword-item', function() {
        const index = $(this).data('index');
        const keyword = keywords[index];
        if (keyword.isAdvanced) return;

        currentlyEditingIndex = index;
        const sensitivity = keyword.sensitivity || globalHidingSensitivity;
        const formHtml = `<div class="form-row"><label>Keyword</label><input type="text" id="edit-keyword-text" value="${keyword.text}"></div><div class="form-row options-row"><label><input type="checkbox" id="edit-keyword-exact" ${keyword.exact ? 'checked' : ''}> Exact Match</label><label><input type="checkbox" id="edit-keyword-case" ${keyword.caseInsensitive ? 'checked' : ''}> Case Insensitive</label></div><div class="form-row"><label>Specific URL (optional)</label><input type="text" id="edit-keyword-url" placeholder="example.com" value="${keyword.url || ''}"></div><div class="form-row"><label>Keyword Specific Sensitivity</label><div class="sensitivity-slider-container"><input type="range" id="edit-keyword-sensitivity" min="1" max="500" value="${sensitivity}"><span class="sensitivity-value-display">${sensitivity}</span></div></div>`;
        $('#edit-keyword-form').html(formHtml);
        $('#edit-modal, #modal-overlay').removeClass('hidden');
    });

    $('#modal-save-btn').on('click', function() {
        if (currentlyEditingIndex > -1) {
            let newSensitivity = $('#edit-keyword-sensitivity').val();
            if (newSensitivity == globalHidingSensitivity) {
                newSensitivity = null;
            }
            
            keywords[currentlyEditingIndex] = { 
                text: $('#edit-keyword-text').val().trim(), 
                exact: $('#edit-keyword-exact').is(':checked'), 
                caseInsensitive: $('#edit-keyword-case').is(':checked'), 
                url: $('#edit-keyword-url').val().trim() || null, 
                sensitivity: newSensitivity, 
                isAdvanced: keywords[currentlyEditingIndex].isAdvanced 
            };
            saveKeywordsAndUpdate();
        }
        $('#edit-modal, #modal-overlay').addClass('hidden');
        currentlyEditingIndex = -1;
    });

    $('#modal-cancel-btn').on('click', function() {
        $('#edit-modal, #modal-overlay').addClass('hidden');
        currentlyEditingIndex = -1;
    });

    $('#toggle-view-btn').on('click', function() {
        if ($('#bulk-view').hasClass('hidden')) {
            switchToBulkView();
        } else {
            switchToListView(false);
        }
    });

    $('#save-bulk-btn').on('click', function() {
        switchToListView(true);
    });
    
    $('#mainPopup').on('input', '.sensitivity-input', function() {
        $(this).next('.sensitivity-value-display').text($(this).val());
    });
    $('#edit-modal').on('input', '#edit-keyword-sensitivity', function() {
        $(this).next('.sensitivity-value-display').text($(this).val());
    });

    $('#toggleTesting').on('change', function() {
        saveOption('testingMode', $(this).is(':checked'));
    });
    
    $("#toggle").on("change", saveEnabled);
    $("#optionsLink").on("click", openAdvancedConfig);
    $("#guideLink").on("click", openGuide);
    
    // Initial load
    loadAndRender();
});
