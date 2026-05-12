const mediaBrowserContainer = document.getElementById('media-browser-container');
const apiKeyInput = document.getElementById("api-key");

// Persist API Key
apiKeyInput.value = localStorage.getItem('media-api-key') || '';
apiKeyInput.addEventListener('input', () => {
    localStorage.setItem('media-api-key', apiKeyInput.value);
});

async function getAuthenticatedResponse(url) {
    const api_key = apiKeyInput.value;
    const response = await fetch(url, {
        headers: { 'X-API-KEY': api_key }
    });

    return response;
}

async function getAuthenticatedUrl(url) {
    const response = await getAuthenticatedResponse(url);
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
}, { rootMargin: '1000px' });

async function loadThumbnail(id, div) {
    div.dataset.loading = "true";
    try {
        const url = await getAuthenticatedUrl(`/api/media/${id}/thumbnail`);
        // Check if still connected and relevant after async fetch
        if (!div.isConnected) {
             URL.revokeObjectURL(url);
             return;
        }
        objectUrlMap.set(id, url);
        const img = document.createElement('img');
        img.src = url;
        div.appendChild(img);
    } catch (e) {
        console.error(`Failed to load thumbnail for ${id}:`, e);
    } finally {
        delete div.dataset.loading;
    }
}

function unloadThumbnail(id, div) {
    const img = div.querySelector('img');
    if (img) {
        img.remove();
        const url = objectUrlMap.get(id);
        if (url) {
            URL.revokeObjectURL(url);
            objectUrlMap.delete(id);
        }
    }
}

async function getIdRangeInt(start, end) {
    const url = `/api/media/index/range/${start}/${end}`;
    const response = await getAuthenticatedResponse(url);
    return await response.json();
}

function loadMediaArray(ids) {
    // Clear existing
    mediaBrowserContainer.innerHTML = '';
    // Revoke all existing URLs
    objectUrlMap.forEach(url => URL.revokeObjectURL(url));
    objectUrlMap.clear();
    
    // Reset scroll
    window.scrollTo(0, 0);

    for (const id of ids) {
        const div = document.createElement('div');
        div.classList.add('media-browser');
        div.dataset.id = id;
        mediaBrowserContainer.appendChild(div);
        observer.observe(div);
    }
} 

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
