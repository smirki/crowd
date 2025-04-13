document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const useCasePillsContainer = document.getElementById('usecase-pills');
    const modelsTbody = document.getElementById('models-tbody');
    const modelsThead = document.getElementById('models-thead');
    const searchInput = document.getElementById('search-input');
    const fab = document.getElementById('fab');
    const tableWrapper = document.getElementById('table-wrapper');
    const paginationControls = document.getElementById('pagination-controls');
    const statusArea = document.getElementById('status-area');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessage = document.getElementById('error-message');
    const noResults = document.getElementById('no-results');
    const initialMessage = document.getElementById('initial-message');

    // Modal Elements
    const suggestionModal = document.getElementById('suggestion-modal');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const suggestionForm = document.getElementById('suggestion-form');
    const suggestionFeedback = document.getElementById('suggestion-feedback');
    const suggestionSubmitBtn = document.getElementById('suggestion-submit-btn');


    // --- State Variables ---
    let currentUseCase = null;
    let currentSearchTerm = '';
    let currentSortBy = 'score_diff'; // Default sort by vote difference
    let currentSortOrder = 'desc';   // Default order descending
    let currentPage = 1;
    const itemsPerPage = 15; // Or make this configurable
    let totalItems = 0;
    let totalPages = 1;
    let availableBenchmarks = []; // Store fetched benchmark metadata
    let searchTimeout;
    let isLoading = false; // Prevent concurrent fetches

    const API_BASE_URL = '/api';

    // --- Utility Functions ---
    function debounce(func, delay) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(func, delay);
    }

    function showStatus(type, message = '') {
        // Hide all status messages first
        loadingIndicator.classList.add('hidden');
        errorMessage.classList.add('hidden');
        noResults.classList.add('hidden');
        initialMessage.classList.add('hidden');
        statusArea.classList.remove('hidden'); // Ensure area is visible
        tableWrapper.classList.add('hidden'); // Hide table when showing status

        switch (type) {
            case 'loading':
                loadingIndicator.classList.remove('hidden');
                break;
            case 'error':
                errorMessage.textContent = `Error: ${message}`;
                errorMessage.classList.remove('hidden');
                break;
            case 'noresults':
                noResults.classList.remove('hidden');
                break;
             case 'initial':
                initialMessage.classList.remove('hidden');
                break;
             case 'hideloading': // Only hide loading, assumes table will be shown
                 loadingIndicator.classList.add('hidden');
                // Don't hide statusArea here, table visibility is separate
                 break;
             case 'clear': // Hide the whole status area
                 statusArea.classList.add('hidden');
                 break;
        }
    }

     function showTable() {
         showStatus('clear'); // Hide all status messages
         tableWrapper.classList.remove('hidden');
     }

     function escapeHtml(unsafe) {
         if (typeof unsafe !== 'string') return unsafe;
         return unsafe
              .replace(/&/g, "&")
              .replace(/</g, "<")
              .replace(/>/g, ">")
              .replace(/"/g, '"')
              .replace(/'/g, "'");
     }

    // --- Data Fetching ---
    async function fetchInitialData() {
        try {
            const [useCasesRes, benchmarksRes] = await Promise.all([
                fetch(`${API_BASE_URL}/usecases`),
                fetch(`${API_BASE_URL}/benchmarks`)
            ]);

            if (!useCasesRes.ok) throw new Error(`Use cases fetch failed: ${useCasesRes.status}`);
            if (!benchmarksRes.ok) throw new Error(`Benchmarks fetch failed: ${benchmarksRes.status}`);

            const useCases = await useCasesRes.json();
            availableBenchmarks = await benchmarksRes.json(); // Store benchmarks globally

            renderUseCases(useCases);
            renderTableHeaders(); // Render headers once benchmarks are known

            // Select the first use case by default if available
            if (useCases.length > 0) {
                // Don't auto-fetch, wait for user click or restore state
                // selectUseCase(useCases[0].slug); // Or potentially restore from localStorage
                showStatus('initial'); // Show initial prompt
            } else {
                showStatus('error', 'No use cases found.');
            }
        } catch (error) {
            console.error("Failed to fetch initial data:", error);
            showStatus('error', `Initialization failed: ${error.message}`);
            // Make sure headers aren't rendered if benchmarks failed
            modelsThead.innerHTML = '';
        }
    }


    async function fetchModels() {
        if (!currentUseCase || isLoading) return;
        isLoading = true;
        showStatus('loading');

        const params = new URLSearchParams({
            use_case_slug: currentUseCase,
            search: currentSearchTerm,
            sort_by: currentSortBy,
            sort_order: currentSortOrder,
            page: currentPage,
            limit: itemsPerPage
        });

        try {
            const response = await fetch(`${API_BASE_URL}/models?${params.toString()}`);
            if (!response.ok) {
                 let errorMsg = `HTTP error! status: ${response.status}`;
                 try {
                     const errData = await response.json();
                     errorMsg = errData.error || errorMsg;
                 } catch (e) {/* Ignore JSON parse error */}
                 throw new Error(errorMsg);
             }
            const data = await response.json();

            if (!data || !data.models) {
                 throw new Error("Invalid data structure received from server.");
            }


            totalItems = data.totalItems;
            totalPages = data.totalPages;
            currentPage = data.currentPage; // Update currentPage based on response

            renderModels(data.models);
            renderPagination();

        } catch (error) {
            console.error("Failed to fetch models:", error);
            showStatus('error', `Failed to load models: ${error.message}`);
            // Clear potentially outdated pagination
            paginationControls.innerHTML = '';
        } finally {
            isLoading = false;
        }
    }

    // --- Rendering ---
    function renderUseCases(useCases) {
        useCasePillsContainer.innerHTML = ''; // Clear loading/error message
        useCases.forEach(uc => {
            const pill = document.createElement('button');
            pill.textContent = uc.name;
            pill.dataset.slug = uc.slug;
             pill.className = 'px-4 py-2 rounded-full text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 transition whitespace-nowrap flex-shrink-0';
            pill.addEventListener('click', () => selectUseCase(uc.slug));
            useCasePillsContainer.appendChild(pill);
        });
    }

    function updateActivePill() {
         const pills = useCasePillsContainer.querySelectorAll('button');
         pills.forEach(pill => {
             if (pill.dataset.slug === currentUseCase) {
                 pill.classList.add('bg-blue-600', 'text-white', 'border-blue-600', 'hover:bg-blue-700');
                 pill.classList.remove('bg-white', 'text-gray-700', 'border-gray-300', 'hover:bg-gray-100');
             } else {
                 pill.classList.remove('bg-blue-600', 'text-white', 'border-blue-600', 'hover:bg-blue-700');
                 pill.classList.add('bg-white', 'text-gray-700', 'border-gray-300', 'hover:bg-gray-100');
             }
         });
         // Scroll the active pill into view if needed
         const activePill = useCasePillsContainer.querySelector(`button[data-slug="${currentUseCase}"]`);
         if (activePill) {
             activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
         }
    }

    function renderTableHeaders() {
        modelsThead.innerHTML = ''; // Clear existing headers
        const tr = modelsThead.insertRow();

        const headers = [
            { label: 'Votes', sortKey: 'score_diff', sortable: true, title: 'Sort by Upvotes - Downvotes' },
            { label: 'Name', sortKey: 'name', sortable: true, title: 'Sort by Model Name' },
            { label: 'Provider', sortKey: 'provider', sortable: true, title: 'Sort by Provider' },
            // Dynamic Benchmark Headers
            ...availableBenchmarks.map(b => ({
                label: b.short_name,
                sortKey: `benchmark_${b.id}`, // Use unique ID for sorting key if needed later
                sortable: false, // Sorting by dynamic benchmarks is complex, disable for now
                title: `${b.name}${b.source_url ? ` - Click for source` : ''}`,
                source_url: b.source_url
            })),
            // Core Info Headers
            { label: 'Cutoff', sortKey: 'knowledge_cutoff', sortable: false, title: 'Knowledge Cutoff Date' }, // Sorting date strings can be tricky
            { label: 'Open Source', sortKey: 'is_open_source', sortable: true, title: 'Sort by Open Source Status' },
            { label: 'Availability', sortKey: 'availability', sortable: false, title: 'How the model is available' }, // Sorting complex strings isn't useful
            { label: 'Formats', sortKey: null, sortable: false, title: 'Available Model Formats' },
            { label: 'Updated', sortKey: 'last_updated', sortable: true, title: 'Sort by Last Updated Date' },
        ];

        headers.forEach(header => {
            const th = document.createElement('th');
            th.scope = 'col';
            th.className = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider';

            let headerContent = escapeHtml(header.label);
            if (header.source_url) {
                 headerContent = `<a href="${escapeHtml(header.source_url)}" target="_blank" rel="noopener noreferrer" class="hover:underline hover:text-blue-600" title="Visit source for ${escapeHtml(header.name)}">${headerContent} <i class="fas fa-external-link-alt fa-xs opacity-60"></i></a>`;
            }

            if (header.sortable) {
                th.classList.add('sortable');
                th.dataset.sort = header.sortKey;
                th.title = header.title || `Sort by ${header.label}`;
                th.innerHTML = `${headerContent}<span class="sort-icon"></span>`;
                th.addEventListener('click', handleSortClick);
            } else {
                 th.innerHTML = headerContent;
                 if(header.title) th.title = header.title;
            }
            tr.appendChild(th);
        });
         updateSortIcons(); // Apply initial sort indicators
    }


     function renderModels(models) {
        modelsTbody.innerHTML = ''; // Clear previous rows
        if (!models || models.length === 0) {
            showStatus('noresults');
            paginationControls.innerHTML = ''; // Clear pagination if no results
            return;
        }

        // Create a map for quick benchmark lookup
        const benchmarkMap = new Map(availableBenchmarks.map(b => [b.id, b]));

        models.forEach(model => {
            const row = modelsTbody.insertRow();
            row.dataset.modelId = model.id;
            row.className = 'hover:bg-gray-50 transition-colors duration-150';

            // --- Vote Cell ---
            const voteCell = row.insertCell();
            const scoreDiff = model.upvotes - model.downvotes;
            let scoreColor = 'text-gray-700';
            if (scoreDiff > 0) scoreColor = 'text-green-600';
            if (scoreDiff < 0) scoreColor = 'text-red-600';
            voteCell.className = 'px-4 py-3 text-center align-middle';
            voteCell.innerHTML = `
                <div class="flex items-center justify-center space-x-1 sm:space-x-2">
                    <button class="vote-button upvote text-gray-400 hover:text-green-500 ${model.userVote === 'up' ? 'voted-up' : ''}" data-direction="up" title="Upvote">
                        <i class="fas fa-arrow-alt-circle-up text-xl"></i>
                    </button>
                    <span class="vote-score font-semibold text-base min-w-[2rem] text-center ${scoreColor}" title="${model.upvotes} Up / ${model.downvotes} Down">${scoreDiff}</span>
                    <button class="vote-button downvote text-gray-400 hover:text-red-500 ${model.userVote === 'down' ? 'voted-down' : ''}" data-direction="down" title="Downvote">
                        <i class="fas fa-arrow-alt-circle-down text-xl"></i>
                    </button>
                </div>
            `;

            // --- Name Cell (with optional link) ---
             const nameCell = row.insertCell();
             nameCell.className = 'px-4 py-3 font-medium text-gray-900';
             nameCell.innerHTML = model.huggingface_link
                 ? `<a href="${escapeHtml(model.huggingface_link)}" target="_blank" rel="noopener noreferrer" class="hover:underline text-blue-600">${escapeHtml(model.name)}</a>`
                 : escapeHtml(model.name);

            // --- Provider Cell ---
            row.insertCell().textContent = model.provider || '-';

            // --- Dynamic Benchmark Score Cells ---
             const modelScoresMap = new Map(model.scores.map(s => [s.benchmark_id, s]));
             availableBenchmarks.forEach(bench => {
                 const scoreData = modelScoresMap.get(bench.id);
                 const scoreCell = row.insertCell();
                 scoreCell.className = 'px-4 py-3 text-sm text-gray-600 text-center'; // Center scores
                 if (scoreData) {
                      let scoreContent = scoreData.score?.toLocaleString() ?? '-'; // Format score (e.g., Elo)
                      if (scoreData.score_link) {
                          scoreContent = `<a href="${escapeHtml(scoreData.score_link)}" target="_blank" rel="noopener noreferrer" class="hover:underline hover:text-blue-600" title="View result source">${scoreContent}</a>`;
                      }
                       scoreCell.innerHTML = scoreContent;
                 } else {
                     scoreCell.textContent = '-';
                 }
             });

             // --- Core Info Cells ---
            row.insertCell().textContent = model.knowledge_cutoff || '-';
            row.insertCell().innerHTML = model.is_open_source
                ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Yes</span>'
                : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">No</span>';
            row.insertCell().textContent = model.availability || '-';

             // --- Format Pills Cell ---
             const formatCell = row.insertCell();
             formatCell.className = 'px-4 py-3';
             formatCell.innerHTML = renderFormatPills(model.formats);

            // --- Last Updated Cell ---
            row.insertCell().textContent = model.last_updated || '-';


            // Apply common styling to standard data cells
             Array.from(row.cells).forEach((cell, index) => {
                 if (index > 1 && !cell.classList.contains('text-center') && !cell.querySelector('span.rounded-full') && !cell.querySelector('.format-pill')) { // Skip vote, name, OS status, format cells
                     cell.classList.add('text-sm', 'text-gray-600');
                 }
                 if (index > 0) { // Add padding to all except vote cell
                     cell.classList.add('px-4', 'py-3');
                 }
             });

        });

        // Add vote button listeners AFTER rows are in the DOM
        modelsTbody.querySelectorAll('.vote-button').forEach(button => {
            button.addEventListener('click', handleVoteClick);
        });

        showTable(); // Make the table visible
    }

     function renderFormatPills(formatsString) {
        if (!formatsString) return '-';
        return formatsString.split(',')
            .map(format => format.trim())
            .filter(format => format) // Remove empty strings
            .map(format => `<span class="format-pill">${escapeHtml(format)}</span>`)
            .join('');
    }

     function updateSortIcons() {
        const tableHeaders = modelsThead.querySelectorAll('th[data-sort]');
        tableHeaders.forEach(th => {
            const sortIcon = th.querySelector('.sort-icon');
            if (!sortIcon) return; // Should not happen for sortable headers

            const sortKey = th.dataset.sort;
            th.classList.remove('sorted', 'text-gray-800'); // Remove sorting indicator classes
            th.classList.add('text-gray-500'); // Default text color
            sortIcon.textContent = '▲▼'; // Default unsorted icon (or use font awesome)

            if (sortKey === currentSortBy) {
                th.classList.add('sorted', 'text-gray-800'); // Highlight sorted column
                th.classList.remove('text-gray-500');
                sortIcon.textContent = currentSortOrder === 'asc' ? '▲' : '▼';
            }
        });
    }

    function renderPagination() {
        paginationControls.innerHTML = ''; // Clear previous controls
        if (totalPages <= 1) return; // No pagination needed for 1 or 0 pages

        const prevDisabled = currentPage === 1;
        const nextDisabled = currentPage === totalPages;

        // Previous Button
        const prevButton = document.createElement('button');
        prevButton.innerHTML = `<i class="fas fa-chevron-left mr-1"></i> Prev`;
        prevButton.disabled = prevDisabled;
        prevButton.addEventListener('click', () => handlePageClick(currentPage - 1));
        paginationControls.appendChild(prevButton);

        // Page Number Buttons (with ellipsis)
        const pageRange = 2; // How many pages to show around the current page
        let startPage = Math.max(1, currentPage - pageRange);
        let endPage = Math.min(totalPages, currentPage + pageRange);

        if (startPage > 1) {
             const firstButton = document.createElement('button');
             firstButton.textContent = '1';
             firstButton.addEventListener('click', () => handlePageClick(1));
             paginationControls.appendChild(firstButton);
             if (startPage > 2) {
                const ellipsis = document.createElement('span');
                ellipsis.textContent = '...';
                ellipsis.className = 'ellipsis';
                paginationControls.appendChild(ellipsis);
             }
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageButton = document.createElement('button');
            pageButton.textContent = i;
            if (i === currentPage) {
                pageButton.classList.add('active-page');
                pageButton.setAttribute('aria-current', 'page');
            } else {
                pageButton.addEventListener('click', () => handlePageClick(i));
            }
            paginationControls.appendChild(pageButton);
        }

         if (endPage < totalPages) {
             if (endPage < totalPages - 1) {
                 const ellipsis = document.createElement('span');
                 ellipsis.textContent = '...';
                 ellipsis.className = 'ellipsis';
                 paginationControls.appendChild(ellipsis);
             }
             const lastButton = document.createElement('button');
             lastButton.textContent = totalPages;
             lastButton.addEventListener('click', () => handlePageClick(totalPages));
             paginationControls.appendChild(lastButton);
         }


        // Next Button
        const nextButton = document.createElement('button');
        nextButton.innerHTML = `Next <i class="fas fa-chevron-right ml-1"></i>`;
        nextButton.disabled = nextDisabled;
        nextButton.addEventListener('click', () => handlePageClick(currentPage + 1));
        paginationControls.appendChild(nextButton);
    }

    // --- Event Handlers ---
    function selectUseCase(slug) {
        if (isLoading) return; // Prevent changing while loading
        if (currentUseCase !== slug) {
             currentUseCase = slug;
             currentPage = 1; // Reset to first page when changing use case
             currentSearchTerm = ''; // Optionally reset search
             searchInput.value = '';
             // currentSortBy = 'score_diff'; // Optionally reset sort
             // currentSortOrder = 'desc';
             console.log("Selected Use Case:", currentUseCase);
             updateActivePill();
             updateSortIcons(); // Ensure sort icons reflect current state
             fetchModels(); // Fetch data for the new selection
        }
    }

    function handleSearchInput() {
         if (isLoading) return;
        debounce(() => {
            const newSearchTerm = searchInput.value.trim();
            if (newSearchTerm !== currentSearchTerm) {
                currentSearchTerm = newSearchTerm;
                currentPage = 1; // Reset to first page on new search
                fetchModels();
            }
        }, 400); // Increased debounce slightly
    }

     function handleSortClick(event) {
        if (isLoading) return;
        const header = event.currentTarget;
        const newSortBy = header.dataset.sort;
         if (!newSortBy) return; // Clicked non-sortable header part

        if (currentSortBy === newSortBy) {
            // Toggle order
            currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            // Change column, default to 'desc' for score, 'asc' otherwise
            currentSortBy = newSortBy;
            currentSortOrder = (newSortBy === 'score_diff' || newSortBy === 'last_updated') ? 'desc' : 'asc';
        }
        currentPage = 1; // Reset to first page on sort change
        updateSortIcons();
        fetchModels();
    }

     function handlePageClick(pageNumber) {
         if (isLoading || pageNumber < 1 || pageNumber > totalPages || pageNumber === currentPage) {
             return;
         }
         currentPage = pageNumber;
         fetchModels();
          // Scroll to top of table after page change
          tableWrapper.scrollIntoView({ behavior: 'smooth' });
     }

    async function handleVoteClick(event) {
         const button = event.currentTarget;
         const direction = button.dataset.direction;
         const row = button.closest('tr');
         const modelId = row.dataset.modelId;

         if (!currentUseCase || !modelId || !direction || button.disabled) {
             console.warn("Vote prerequisite missing or button disabled", { currentUseCase, modelId, direction });
             return;
         }

         // Optimistic UI: Disable buttons temporarily
         const buttonsInRow = row.querySelectorAll('.vote-button');
         buttonsInRow.forEach(b => b.disabled = true);
          button.classList.add('opacity-50'); // Visually indicate loading

         try {
            const response = await fetch(`${API_BASE_URL}/vote/${modelId}/${currentUseCase}/${direction}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const result = await response.json(); // Try to parse JSON regardless of status

            if (!response.ok) {
                 throw new Error(result.error || `Vote failed with status: ${response.status}`);
             }

            if (result.success) {
                updateVoteUI(row, result.upvotes, result.downvotes, result.newVoteStatus);
            } else {
                 throw new Error(result.message || "Vote failed on server.");
            }

         } catch (error) {
            console.error("Voting failed:", error);
            // Simple feedback for now, could be a toast notification
             alert(`Vote failed: ${error.message}. Please try again later.`);
             // Revert optimistic UI changes if needed based on current state, but backend is source of truth
             // For simplicity, just re-enable here. Session should prevent re-vote spam.
         } finally {
            // Re-enable buttons
             buttonsInRow.forEach(b => b.disabled = false);
             button.classList.remove('opacity-50');
         }
    }

     function updateVoteUI(row, upvotes, downvotes, userVoteStatus) {
         if (!row) return; // Safety check
         const scoreSpan = row.querySelector('.vote-score');
         const upvoteButton = row.querySelector('.upvote');
         const downvoteButton = row.querySelector('.downvote');
         if (!scoreSpan || !upvoteButton || !downvoteButton) return;

         const scoreDiff = upvotes - downvotes;
         let scoreColor = 'text-gray-700';
         if (scoreDiff > 0) scoreColor = 'text-green-600';
         if (scoreDiff < 0) scoreColor = 'text-red-600';

         scoreSpan.textContent = scoreDiff;
         scoreSpan.className = scoreSpan.className.replace(/text-(gray|green|red)-[0-9]+/, scoreColor); // Update color class robustly
         scoreSpan.title = `${upvotes} Up / ${downvotes} Down`;

         // Update button styles based on userVoteStatus from server response
         upvoteButton.classList.toggle('voted-up', userVoteStatus === 'up');
         downvoteButton.classList.toggle('voted-down', userVoteStatus === 'down');
     }

    // --- Modal Handling ---
     function openModal() {
        suggestionForm.reset(); // Clear form
        suggestionFeedback.textContent = '';
        suggestionFeedback.className = 'mb-4 text-sm'; // Reset feedback style
        suggestionSubmitBtn.disabled = false;
        suggestionModal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent background scroll
        suggestionForm.querySelector('select, input, textarea')?.focus(); // Focus first field
     }

     function closeModal() {
         suggestionModal.classList.remove('active');
         document.body.style.overflow = ''; // Restore background scroll
     }

     async function handleSuggestionSubmit(event) {
        event.preventDefault();
        suggestionSubmitBtn.disabled = true;
        suggestionFeedback.textContent = 'Submitting...';
        suggestionFeedback.className = 'mb-4 text-sm text-blue-600';

        const formData = new FormData(suggestionForm);
        const data = Object.fromEntries(formData.entries());

         try {
             const response = await fetch(`${API_BASE_URL}/suggestions`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(data)
             });

             const result = await response.json();

             if (!response.ok) {
                throw new Error(result.error || `Submission failed: ${response.statusText}`);
             }

             suggestionFeedback.textContent = `Success! ${result.message}`;
             suggestionFeedback.className = 'mb-4 text-sm text-green-600';
             setTimeout(closeModal, 2000); // Close modal after 2s on success

         } catch (error) {
             console.error("Suggestion submission failed:", error);
             suggestionFeedback.textContent = `Error: ${error.message}`;
             suggestionFeedback.className = 'mb-4 text-sm text-red-600';
             suggestionSubmitBtn.disabled = false; // Re-enable button on error
         }
     }


    // --- Initialization ---
    searchInput.addEventListener('input', handleSearchInput);
    fab.addEventListener('click', openModal);
    modalOverlay.addEventListener('click', closeModal);
    modalCloseBtn.addEventListener('click', closeModal);
    modalCancelBtn.addEventListener('click', closeModal);
    suggestionForm.addEventListener('submit', handleSuggestionSubmit);

    // Fetch initial use cases and benchmarks to build the page structure
    fetchInitialData();
});