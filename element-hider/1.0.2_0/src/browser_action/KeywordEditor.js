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

    function loadAndRenderAll() {
        chrome.storage.sync.get(null, function(result) {
            globalHidingSensitivity = result.hidingSensitivity || 50;
            getStoredWords(function(currentWords) {
                keywords = parseRawText(currentWords);
                $('#keywords-bulk').val(currentWords);
                renderListView();
                updateStorageMeter(currentWords);

                $('#hidingSensitivity').val(globalHidingSensitivity);
                $('#sensitivityValue').text(globalHidingSensitivity);

                $('#blurred').prop('checked', result.blurOption || false);
                $('#hovering').prop('checked', result.hoveringOption || false);
                $('#urls').val(result.urls || "");

                if (result.urlRule === false) {
                    $('#enabler').prop('checked', true);
                } else {
                    $('#disabler').prop('checked', true);
                }
                $('#hoveringOption').toggle(result.blurOption || false);
            });
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
    }
    
    function openGuide() {
        chrome.tabs.create({ url: chrome.runtime.getURL("src/browser_action/guide.html") });
    }

    function setupAllEventListeners() {
        $('#guideLink').on('click', openGuide);

        $('#new-keyword-selector').on('change', function() {
            const isChecked = $(this).is(':checked');
            $('#new-keyword-exact, #new-keyword-case, #advanced-toggle').prop('disabled', isChecked);
            $('.options-row label, .advanced-options-label').css('color', isChecked ? '#aaa' : 'var(--text-secondary)');
            if (isChecked) {
                 $('#new-keyword-exact, #new-keyword-case, #advanced-toggle').prop('checked', false).trigger('change');
            }
        });

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
                    newSensitivity = null; // Unset if it's the same as global
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

        $('#clear-new-keyword-btn').on('click', function(e){
            e.preventDefault();
            clearNewKeywordForm();
        });

        $('#advanced-toggle').on('change', function() {
            const isChecked = $(this).is(':checked');
            $('#advanced-options-container').toggleClass('hidden', !isChecked);
             if (isChecked) {
                $('#new-keyword-sensitivity').val(globalHidingSensitivity).trigger('input');
            }
        });

        $('.keywords-column').on('input', '.sensitivity-input', function() {
             $(this).next('.sensitivity-value-display').text($(this).val());
        });
        $('#edit-modal').on('input', '#edit-keyword-sensitivity', function() {
            $(this).next('.sensitivity-value-display').text($(this).val());
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
                    sensitivity: newSensitivity, // Always save the value from the slider
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

        $('#keywords-bulk').on('input', function() {
            updateStorageMeter($(this).val());
        });
        
        $('#hidingSensitivity').on('input', function() {
            $('#sensitivityValue').text($(this).val());
        });
        $('#hidingSensitivity').on('change', function() {
            globalHidingSensitivity = parseInt($(this).val(), 10);
            saveOption('hidingSensitivity', globalHidingSensitivity);
        });
        
        $('#blurred').on('change', function() {
            const isChecked = $(this).is(':checked');
            saveOption('blurOption', isChecked);
            $('#hoveringOption').toggle(isChecked);
        });
        $('#hovering').on('change', function() { saveOption('hoveringOption', $(this).is(':checked')); });
        $('#urls').on('change', function() { saveOption('urls', $(this).val()); });
        $('#disabler').on('change', function() { saveOption('urlRule', true); });
        $('#enabler').on('change', function() { saveOption('urlRule', false); });
    }

    loadAndRenderAll();
    setupAllEventListeners();
});
