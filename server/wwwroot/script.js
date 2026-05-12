const mediaBrowserContainer = document.getElementById('media-browser-container');
const apiKeyInput = document.getElementById("api-key");
const scrollHandle = document.getElementById('scroll-handle');
const scrollBar = document.getElementById('custom-scrollbar');
const scrollIndicator = document.getElementById('scroll-indicator');

let mediaMetadata = new Map(); // Store metadata (timestamps) for date HUD
const abortControllers = new Map(); // Track pending fetches for cancellation
const unloadTimers = new Map(); // Track timers for delayed unloading

// Persist API Key
apiKeyInput.value = localStorage.getItem('media-api-key') || '';
apiKeyInput.addEventListener('input', () => {
    localStorage.setItem('media-api-key', apiKeyInput.value);
});

async function getAuthenticatedResponse(url, signal) {
    const api_key = apiKeyInput.value;
    const response = await fetch(url, {
        headers: { 'X-API-KEY': api_key },
        signal: signal
    });

    return response;
}

async function getAuthenticatedUrl(url, signal) {
    const response = await getAuthenticatedResponse(url, signal);
    if (!response.ok) throw new Error(`Auth failed: ${response.status}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

const objectUrlMap = new Map();

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const div = entry.target;
        const id = div.dataset.id;
        if (entry.isIntersecting) {
            // Cancel any pending unload
            if (unloadTimers.has(id)) {
                clearTimeout(unloadTimers.get(id));
                unloadTimers.delete(id);
            }
            if (!div.dataset.loading && !div.querySelector('img')) {
                loadThumbnail(id, div);
            }
        } else {
            // Schedule unload with a 2-second delay
            if (!unloadTimers.has(id) && div.querySelector('img')) {
                const timer = setTimeout(() => {
                    unloadThumbnail(id, div);
                    unloadTimers.delete(id);
                }, 2000); // 2 second grace period
                unloadTimers.set(id, timer);
            } else if (div.dataset.loading) {
                // If it's still loading but left the area, cancel fetch immediately
                unloadThumbnail(id, div);
            }
        }
    });
}, { rootMargin: '300px' }); 

async function loadThumbnail(id, div) {
    if (div.dataset.loading) return;
    div.dataset.loading = "true";
    
    const controller = new AbortController();
    abortControllers.set(id, controller);

    try {
        const url = await getAuthenticatedUrl(`/api/media/${id}/thumbnail`, controller.signal);
        
        if (!div.isConnected) {
             URL.revokeObjectURL(url);
             return;
        }

        objectUrlMap.set(id, url);
        const img = document.createElement('img');
        img.src = url;
        img.loading = "lazy";
        div.appendChild(img);
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error(`Failed to load thumbnail for ${id}:`, e);
        }
    } finally {
        delete div.dataset.loading;
        abortControllers.delete(id);
    }
}

function unloadThumbnail(id, div) {
    // 1. Cancel pending fetch
    const controller = abortControllers.get(id);
    if (controller) {
        controller.abort();
        abortControllers.delete(id);
    }

    // 2. Remove image and revoke URL
    const img = div.querySelector('img');
    if (img) {
        img.remove();
        const url = objectUrlMap.get(id);
        if (url) {
            URL.revokeObjectURL(url);
            objectUrlMap.delete(id);
        }
    }
    delete div.dataset.loading;
}

async function getMediaIndexRange(start, end) {
    const url = `/api/media/index/range/${start}/${end}`;
    const response = await getAuthenticatedResponse(url);
    return await response.json();
}

function loadMediaArray(items) {
    // Clear all states
    abortControllers.forEach(c => c.abort());
    abortControllers.clear();
    unloadTimers.forEach(t => clearTimeout(t));
    unloadTimers.clear();

    mediaBrowserContainer.innerHTML = '';
    objectUrlMap.forEach(url => URL.revokeObjectURL(url));
    objectUrlMap.clear();
    mediaMetadata.clear();
    
    mediaBrowserContainer.scrollTo(0, 0);

    for (const item of items) {
        const id = String(item.id);
        mediaMetadata.set(id, item.timestamp);

        const div = document.createElement('div');
        div.classList.add('media-browser');
        div.dataset.id = id;
        mediaBrowserContainer.appendChild(div);
        observer.observe(div);
    }
    updateHandlePosition();
} 

// --- Custom Scroll Logic ---

function updateHandlePosition() {
    const scrollTop = mediaBrowserContainer.scrollTop;
    const scrollHeight = mediaBrowserContainer.scrollHeight - mediaBrowserContainer.clientHeight;
    const barHeight = scrollBar.clientHeight - scrollHandle.clientHeight;
    
    if (scrollHeight <= 0) {
        scrollHandle.style.top = '0px';
        return;
    }

    const pct = scrollTop / scrollHeight;
    scrollHandle.style.top = (pct * barHeight) + 'px';

    updateDateHUD(pct);
}

function updateDateHUD(pct) {
    const divs = mediaBrowserContainer.querySelectorAll('.media-browser');
    if (divs.length === 0) return;

    const index = Math.floor(pct * (divs.length - 1));
    const targetDiv = divs[index];
    const id = targetDiv.dataset.id;
    const timestamp = mediaMetadata.get(id);

    if (timestamp) {
        const date = new Date(timestamp * 1000);
        scrollIndicator.innerText = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
        scrollIndicator.style.top = (parseFloat(scrollHandle.style.top) + scrollBar.offsetTop - 10) + 'px';
    }
}

mediaBrowserContainer.addEventListener('scroll', () => {
    updateHandlePosition();
    scrollIndicator.classList.add('visible');
    clearTimeout(window.scrollTimer);
    window.scrollTimer = setTimeout(() => {
        if (!isDragging) scrollIndicator.classList.remove('visible');
    }, 1000);
}, { passive: true });

let isDragging = false;
let startY, startScrollTop;

scrollHandle.addEventListener('mousedown', (e) => {
    isDragging = true;
    startY = e.clientY;
    startScrollTop = mediaBrowserContainer.scrollTop;
    scrollHandle.classList.add('dragging');
    scrollIndicator.classList.add('visible');
    document.body.style.userSelect = 'none';
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const deltaY = e.clientY - startY;
    const barHeight = scrollBar.clientHeight - scrollHandle.clientHeight;
    const scrollHeight = mediaBrowserContainer.scrollHeight - mediaBrowserContainer.clientHeight;
    
    const movePct = deltaY / barHeight;
    mediaBrowserContainer.scrollTop = startScrollTop + (movePct * scrollHeight);
});

window.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        scrollHandle.classList.remove('dragging');
        scrollIndicator.classList.remove('visible');
        document.body.style.userSelect = '';
    }
});

scrollBar.addEventListener('mousedown', (e) => {
    if (e.target === scrollHandle) return;
    const rect = scrollBar.getBoundingClientRect();
    const pos = (e.clientY - rect.top) - (scrollHandle.clientHeight / 2);
    const barHeight = scrollBar.clientHeight - scrollHandle.clientHeight;
    const pct = Math.max(0, Math.min(1, pos / barHeight));
    mediaBrowserContainer.scrollTop = pct * (mediaBrowserContainer.scrollHeight - mediaBrowserContainer.clientHeight);
});

// --- Startup ---

async function init() {
    if (!apiKeyInput.value) {
        console.log("Waiting for API Key...");
        return;
    }

    try {
        const response = await getAuthenticatedResponse('/api/media/index/all');
        if (response.status === 401) {
            console.error("Auth failed");
            return;
        }
        const items = await response.json();
        loadMediaArray(items);
    } catch (e) {
        console.error("Failed to load media index:", e);
    }
}

// Re-init if API key changes
apiKeyInput.addEventListener('change', init);

// Initial load
init();
