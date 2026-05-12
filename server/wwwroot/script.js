const mediaBrowserContainer = document.getElementById('media-browser-container');
const apiKeyInput = document.getElementById("api-key");
const scrollHandle = document.getElementById('scroll-handle');
const scrollBar = document.getElementById('custom-scrollbar');
const scrollIndicator = document.getElementById('scroll-indicator');

let mediaMetadata = new Map(); // Store metadata for date HUD
const abortControllers = new Map(); // Track pending fetches for cancellation

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
            if (!div.dataset.loading && !div.querySelector('img')) {
                loadThumbnail(id, div);
            }
        } else {
            unloadThumbnail(id, div);
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
        
        // Fetch data for HUD
        if (!mediaMetadata.has(id)) {
            const dataResponse = await getAuthenticatedResponse(`/api/media/${id}/data`, controller.signal);
            const data = await dataResponse.json();
            mediaMetadata.set(id, data);
        }
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
    // Cancel pending fetch
    const controller = abortControllers.get(id);
    if (controller) {
        controller.abort();
        abortControllers.delete(id);
    }

    // Remove image and revoke URL
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

async function getIdRangeInt(start, end) {
    const url = `/api/media/index/range/${start}/${end}`;
    const response = await getAuthenticatedResponse(url);
    return await response.json();
}

function loadMediaArray(ids) {
    // Cancel all current loads
    abortControllers.forEach(c => c.abort());
    abortControllers.clear();

    mediaBrowserContainer.innerHTML = '';
    objectUrlMap.forEach(url => URL.revokeObjectURL(url));
    objectUrlMap.clear();
    mediaMetadata.clear();
    
    mediaBrowserContainer.scrollTo(0, 0);

    for (const id of ids) {
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
    const data = mediaMetadata.get(id);

    if (data && data.timestamp) {
        const date = new Date(data.timestamp * 1000);
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

// --- Date Inputs ---

document.querySelectorAll('.date-input').forEach(input => {
    input.addEventListener('change', async () => {
        const start = document.getElementById('startDate').value;
        const end = document.getElementById('endDate').value;

        if (!start || !end) return;

        const startUnix = Math.floor(new Date(start).getTime() / 1000);
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59, 999);
        const endUnix = Math.floor(endDate.getTime() / 1000);

        const ids = await getIdRangeInt(startUnix, endUnix);
        loadMediaArray(ids);
    });
});
