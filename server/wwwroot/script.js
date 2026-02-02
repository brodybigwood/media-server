
const mediaBrowserContainer = document.getElementById('media-browser-container');

async function getAuthenticatedResponse(url) {
    const api_key = document.getElementById("api-key").value;
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

async function getMediaData(id) {
    const url = `/api/media/${id}/data`;
    const response = await getAuthenticatedResponse(url);
    return await response.json();
}

async function getMediaDiv(id) {
    const div = document.createElement('div');
    div.classList.add('media-browser');

    // get thumbnail
    const fileUrl = await getAuthenticatedUrl(`/api/media/${id}/thumbnail`);

    div.innerHTML = `<img src="${fileUrl}"></img>`;

    return div;
}

async function getIdRangeInt(start, end) {
    const url = `/api/media/index/range/${start}/${end}`;
    const response = await getAuthenticatedResponse(url);
    return await response.json();
}

let currentLoadToken = 0;

async function loadMediaArray(ids) {
    const loadToken = ++currentLoadToken;
    mediaBrowserContainer.innerHTML = '';
 
    for (const id of ids) {
        if (loadToken !== currentLoadToken) return;
        const div = await getMediaDiv(id);
        if (loadToken !== currentLoadToken) return;
        mediaBrowserContainer.appendChild(div);
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

        ids = await getIdRangeInt(startUnix, endUnix);
        
        loadMediaArray(ids);
    });
});
