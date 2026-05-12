const mediaBrowserContainer = document.getElementById('media-browser-container');
const apiKeyInput = document.getElementById("api-key");
const scrollHandle = document.getElementById('scroll-handle');
const scrollBar = document.getElementById('custom-scrollbar');
const scrollIndicator = document.getElementById('scroll-indicator');

// Viewer Elements
const mediaViewer = document.getElementById('media-viewer');
const viewerSlider = document.getElementById('viewer-slider');
const viewerUiOverlay = document.getElementById('viewer-ui-overlay');
const swipeOverlay = document.getElementById('swipe-overlay');
const closeViewerBtn = document.getElementById('close-viewer');
const viewerDate = document.getElementById('viewer-date');
const downloadBtn = document.getElementById('download-btn');
const infoBtn = document.getElementById('info-btn');

// Edit Panel Elements
const editPanel = document.getElementById('edit-panel');
const editDesc = document.getElementById('edit-desc');
const editTags = document.getElementById('edit-tags');
const saveMetadataBtn = document.getElementById('save-metadata');
const cancelEditBtn = document.getElementById('cancel-edit');

// Video UI Elements
const pauseIcon = document.getElementById('pause-icon');
const rulerWrapper = document.getElementById('ruler-wrapper');
const rulerStrip = document.getElementById('ruler-strip');
const rulerCurrent = document.getElementById('ruler-current');
const rulerTotal = document.getElementById('ruler-total');

const slides = {
    prev: document.getElementById('slide-prev'),
    curr: document.getElementById('slide-curr'),
    next: document.getElementById('slide-next')
};

let mediaItems = []; 
let currentViewerIndex = -1;
let currentVideoElement = null;

let mediaMetadata = new Map(); 
const abortControllers = new Map(); 
const unloadTimers = new Map(); 
const objectUrlMap = new Map();

// --- Viewer State & Preloading ---
const preloadedUrls = new Map(); 
const preloadedData = new Map(); 

// --- Constants ---
const RULER_PX_PER_SEC = 60; 

// Persist API Key
apiKeyInput.value = localStorage.getItem('media-api-key') || '';
apiKeyInput.addEventListener('input', () => {
    localStorage.setItem('media-api-key', apiKeyInput.value);
});

async function getAuthenticatedResponse(url, signal, method = 'GET', body = null) {
    const api_key = apiKeyInput.value;
    const options = {
        method,
        headers: { 'X-API-KEY': api_key },
        signal: signal
    };
    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    return await fetch(url, options);
}

async function getAuthenticatedUrl(url, signal) {
    const response = await getAuthenticatedResponse(url, signal);
    if (!response.ok) throw new Error(`Auth failed: ${response.status}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const div = entry.target;
        const id = div.dataset.id;
        if (entry.isIntersecting) {
            if (unloadTimers.has(id)) {
                clearTimeout(unloadTimers.get(id));
                unloadTimers.delete(id);
            }
            if (!div.dataset.loading && !div.querySelector('img')) {
                loadThumbnail(id, div);
            }
        } else {
            if (!unloadTimers.has(id) && div.querySelector('img')) {
                const timer = setTimeout(() => {
                    unloadThumbnail(id, div);
                    unloadTimers.delete(id);
                }, 2000);
                unloadTimers.set(id, timer);
            } else if (div.dataset.loading) {
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
        if (!div.isConnected) { URL.revokeObjectURL(url); return; }
        objectUrlMap.set(id, url);
        const img = document.createElement('img');
        img.src = url;
        img.loading = "lazy";
        div.appendChild(img);
    } catch (e) {
        if (e.name !== 'AbortError') console.error(`Failed to load thumbnail ${id}:`, e);
    } finally {
        delete div.dataset.loading;
        abortControllers.delete(id);
    }
}

function unloadThumbnail(id, div) {
    const controller = abortControllers.get(id);
    if (controller) { controller.abort(); abortControllers.delete(id); }
    const img = div.querySelector('img');
    if (img) {
        img.remove();
        const url = objectUrlMap.get(id);
        if (url) { URL.revokeObjectURL(url); objectUrlMap.delete(id); }
    }
    delete div.dataset.loading;
}

function loadMediaArray(items) {
    mediaItems = items;
    abortControllers.forEach(c => c.abort());
    abortControllers.clear();
    unloadTimers.forEach(t => clearTimeout(t));
    unloadTimers.clear();

    mediaBrowserContainer.innerHTML = '';
    objectUrlMap.forEach(url => URL.revokeObjectURL(url));
    objectUrlMap.clear();
    mediaMetadata.clear();
    
    mediaBrowserContainer.scrollTo(0, 0);

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const id = String(item.id);
        mediaMetadata.set(id, item.timestamp);

        const div = document.createElement('div');
        div.classList.add('media-browser');
        div.id = `media-item-${i}`;
        div.dataset.id = id;
        div.dataset.index = i;
        div.onclick = () => openViewer(i);
        mediaBrowserContainer.appendChild(div);
        observer.observe(div);
    }
    updateHandlePosition();
} 

// --- Video UI Control Logic ---

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function generateRuler(duration) {
    rulerStrip.innerHTML = '';
    const totalWidth = duration * RULER_PX_PER_SEC;
    rulerStrip.style.width = `${totalWidth}px`;
    
    for (let i = 0; i <= duration; i++) {
        const tick = document.createElement('div');
        tick.classList.add('ruler-tick');
        if (i % 5 === 0) tick.classList.add('major');
        tick.style.left = `${i * RULER_PX_PER_SEC}px`;
        rulerStrip.appendChild(tick);
    }
    rulerTotal.innerText = formatTime(duration);
}

function updateRuler(time) {
    const centerOffset = window.innerWidth / 2;
    const x = -(time * RULER_PX_PER_SEC) + centerOffset;
    rulerStrip.style.transform = `translateX(${x}px)`;
    rulerCurrent.innerText = formatTime(time);
}

function togglePlay() {
    if (!currentVideoElement) return;
    if (currentVideoElement.paused) {
        currentVideoElement.play();
        pauseIcon.classList.add('hidden');
        if (!isScrubbing) rulerWrapper.classList.add('hidden');
    } else {
        currentVideoElement.pause();
        pauseIcon.classList.remove('hidden');
        rulerWrapper.classList.remove('hidden');
    }
}

// --- Metadata Edit Logic ---

infoBtn.onclick = (e) => {
    e.stopPropagation();
    const data = preloadedData.get(currentViewerIndex);
    if (!data) return;
    
    editDesc.value = data.description || '';
    editTags.value = data.tags || '';
    editPanel.classList.remove('hidden');
};

cancelEditBtn.onclick = () => editPanel.classList.add('hidden');

saveMetadataBtn.onclick = async () => {
    const item = mediaItems[currentViewerIndex];
    const data = {
        description: editDesc.value,
        tags: editTags.value
    };

    try {
        const res = await getAuthenticatedResponse(`/api/media/${item.id}/metadata`, null, 'POST', data);
        if (res.ok) {
            // Update local cache
            const currentData = preloadedData.get(currentViewerIndex);
            preloadedData.set(currentViewerIndex, { ...currentData, ...data });
            editPanel.classList.add('hidden');
        } else {
            alert("Failed to save metadata");
        }
    } catch (e) {
        console.error("Save failed:", e);
    }
};

// --- Viewer Logic ---

async function preloadIndex(index) {
    if (index < 0 || index >= mediaItems.length) return;
    if (preloadedUrls.has(index)) return;
    const item = mediaItems[index];
    const controller = new AbortController();
    try {
        const [dataRes, url] = await Promise.all([
            getAuthenticatedResponse(`/api/media/${item.id}/data`, controller.signal),
            getAuthenticatedUrl(`/api/media/${item.id}/file`, controller.signal)
        ]);
        const data = await dataRes.json();
        preloadedUrls.set(index, url);
        preloadedData.set(index, data);
    } catch (e) {
        if (e.name !== 'AbortError') console.error(`Preload failed for ${index}:`, e);
    }
}

function cleanupPreloads(currentIndex) {
    const buffer = 5;
    for (const [index, url] of preloadedUrls.entries()) {
        if (index < currentIndex - buffer || index > currentIndex + buffer) {
            URL.revokeObjectURL(url);
            preloadedUrls.delete(index);
            preloadedData.delete(index);
        }
    }
}

async function renderSlide(index, slideElement) {
    slideElement.innerHTML = '';
    if (index < 0 || index >= mediaItems.length) return;
    if (!preloadedUrls.has(index)) {
        slideElement.innerHTML = '<div class="loader">Loading...</div>';
        await preloadIndex(index);
    }
    const url = preloadedUrls.get(index);
    const data = preloadedData.get(index);
    if (!url || !data) return;

    slideElement.innerHTML = '';
    if (data.media_type === "VIDEO") {
        const video = document.createElement('video');
        video.src = url;
        video.autoplay = (index === currentViewerIndex); 
        video.loop = true;
        slideElement.appendChild(video);
        if (index === currentViewerIndex) {
            currentVideoElement = video;
            video.addEventListener('loadedmetadata', () => {
                generateRuler(video.duration);
                updateRuler(0);
            });
            video.addEventListener('timeupdate', () => {
                if (!isScrubbing) updateRuler(video.currentTime);
            });
        }
    } else {
        const img = document.createElement('img');
        img.src = url;
        slideElement.appendChild(img);
    }
}

async function openViewer(index) {
    if (index < 0 || index >= mediaItems.length) return;
    mediaViewer.classList.remove('hidden');
    editPanel.classList.add('hidden'); // Close edit panel on change
    currentViewerIndex = index;
    const item = mediaItems[index];
    
    currentVideoElement = null;
    pauseIcon.classList.add('hidden');
    rulerWrapper.classList.add('hidden');

    viewerSlider.style.transition = 'none';
    viewerUiOverlay.style.transition = 'none';
    setTranslate(-100);

    const date = new Date(item.timestamp * 1000);
    viewerDate.innerText = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

    await Promise.all([
        renderSlide(index - 1, slides.prev),
        renderSlide(index, slides.curr),
        renderSlide(index + 1, slides.next)
    ]);

    const data = preloadedData.get(index);
    if (data) {
        downloadBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = preloadedUrls.get(index);
            a.download = data.name || `media_${item.id}`;
            a.click();
        };
    }

    for (let i = 1; i <= 5; i++) {
        preloadIndex(index + i);
        preloadIndex(index - i);
    }
    cleanupPreloads(index);
}

function closeViewer() {
    mediaViewer.classList.add('hidden');
    editPanel.classList.add('hidden');
    document.querySelectorAll('.viewer-slide video').forEach(v => v.pause());
    if (currentViewerIndex !== -1) {
        const targetDiv = document.getElementById(`media-item-${currentViewerIndex}`);
        if (targetDiv) targetDiv.scrollIntoView({ block: 'center' });
    }
}

closeViewerBtn.onclick = closeViewer;

// --- Interactive Gesture Handling ---

let touchStartX = 0, touchStartY = 0;
let currentTranslateY = -100; 
let isSwiping = false, isScrubbing = false;
let swipeStartTime = 0;
let scrubStartTime = 0;
let wasPlayingBeforeScrub = false;

function setTranslate(vh) {
    viewerSlider.style.transform = `translateY(${vh}vh)`;
    viewerUiOverlay.style.transform = `translateY(${vh + 100}vh)`;
}

swipeOverlay.addEventListener('touchstart', e => {
    if (mediaViewer.classList.contains('hidden')) return;
    if (!editPanel.classList.contains('hidden')) return; // Block swipe when editing
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    swipeStartTime = Date.now();
    isSwiping = false;
    isScrubbing = false;
    viewerSlider.style.transition = 'none';
    viewerUiOverlay.style.transition = 'none';
}, { passive: true });

swipeOverlay.addEventListener('touchmove', e => {
    if (!editPanel.classList.contains('hidden')) return;
    const deltaX = e.touches[0].clientX - touchStartX;
    const deltaY = e.touches[0].clientY - touchStartY;

    if (!isSwiping && !isScrubbing) {
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 5) {
            isSwiping = true;
        } else if (currentVideoElement && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 5) {
            isScrubbing = true;
            scrubStartTime = currentVideoElement.currentTime;
            wasPlayingBeforeScrub = !currentVideoElement.paused;
            currentVideoElement.pause(); 
            rulerWrapper.classList.remove('hidden');
            pauseIcon.classList.add('hidden'); 
        }
    }

    if (isSwiping) {
        const deltaVH = (deltaY / window.innerHeight) * 100;
        setTranslate(currentTranslateY + deltaVH);
    } else if (isScrubbing && currentVideoElement) {
        const scrubDelta = -(deltaX / RULER_PX_PER_SEC);
        let newTime = scrubStartTime + scrubDelta;
        newTime = Math.max(0, Math.min(currentVideoElement.duration, newTime));
        currentVideoElement.currentTime = newTime;
        updateRuler(newTime);
    }
}, { passive: true });

swipeOverlay.addEventListener('touchend', e => {
    if (!editPanel.classList.contains('hidden')) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    const deltaTime = Date.now() - swipeStartTime;

    if (!isSwiping && !isScrubbing && deltaTime < 200 && Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
        togglePlay();
        return;
    }

    if (isSwiping) {
        isSwiping = false;
        const velocity = Math.abs(deltaY) / deltaTime;
        const threshold = window.innerHeight * 0.15; 
        const fastSwipe = velocity > 0.6; 
        const transitionStyle = 'transform 0.1s cubic-bezier(0.2, 0, 0.2, 1)';
        viewerSlider.style.transition = transitionStyle;
        viewerUiOverlay.style.transition = transitionStyle;
        
        if ((deltaY < -threshold || (deltaY < 0 && fastSwipe)) && currentViewerIndex < mediaItems.length - 1) {
            setTranslate(-200);
            setTimeout(() => openViewer(currentViewerIndex + 1), 100);
        } else if ((deltaY > threshold || (deltaY > 0 && fastSwipe)) && currentViewerIndex > 0) {
            setTranslate(0);
            setTimeout(() => openViewer(currentViewerIndex - 1), 100);
        } else {
            setTranslate(-100);
        }
    } else if (isScrubbing) {
        isScrubbing = false;
        if (wasPlayingBeforeScrub) {
            currentVideoElement.play();
            rulerWrapper.classList.add('hidden');
        } else {
            pauseIcon.classList.remove('hidden');
        }
    }
}, { passive: true });

// Mouse wheel
let wheelTimeout;
swipeOverlay.addEventListener('wheel', e => {
    if (mediaViewer.classList.contains('hidden') || !editPanel.classList.contains('hidden')) return;
    if (wheelTimeout) return;
    if (Math.abs(e.deltaY) > 20) {
        wheelTimeout = setTimeout(() => wheelTimeout = null, 300);
        const transitionStyle = 'transform 0.1s ease-out';
        viewerSlider.style.transition = transitionStyle;
        viewerUiOverlay.style.transition = transitionStyle;
        if (e.deltaY > 0 && currentViewerIndex < mediaItems.length - 1) {
            setTranslate(-200);
            setTimeout(() => openViewer(currentViewerIndex + 1), 100);
        } else if (e.deltaY < 0 && currentViewerIndex > 0) {
            setTranslate(0);
            setTimeout(() => openViewer(currentViewerIndex - 1), 100);
        }
    }
}, { passive: false });

window.addEventListener('keydown', (e) => {
    if (mediaViewer.classList.contains('hidden')) return;
    if (!editPanel.classList.contains('hidden')) return; // Disable viewer keys when editing
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') openViewer(currentViewerIndex - 1);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') openViewer(currentViewerIndex + 1);
    if (e.key === 'Escape') closeViewer();
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});

// --- Custom Scroll Logic ---

function updateHandlePosition() {
    const scrollTop = mediaBrowserContainer.scrollTop;
    const scrollHeight = mediaBrowserContainer.scrollHeight - mediaBrowserContainer.clientHeight;
    const barHeight = scrollBar.clientHeight - scrollHandle.clientHeight;
    if (scrollHeight <= 0) { scrollHandle.style.top = '0px'; return; }
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

async function init() {
    if (!apiKeyInput.value) return;
    try {
        const response = await getAuthenticatedResponse('/api/media/index/all');
        if (response.status === 401) return;
        const items = await response.json();
        loadMediaArray(items);
    } catch (e) { console.error("Init failed:", e); }
}
apiKeyInput.addEventListener('change', init);
init();
