
const mainMediaContainer = document.getElementById('main-media-container');

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

async function loadMedia(id, div) {
    const data = await getMediaData(id);
    console.log(data);
    const fileUrl = await getAuthenticatedUrl(`/api/media/${id}/file`);

    if (data.media_type == "PHOTO") {
        div.innerHTML = `<img src="${fileUrl}"></img>`;
    } else {
        div.innerHTML = `<video src="${fileUrl}" controls></video>`;
    }
}

function refresh() {
    const id = document.getElementById("media-id").value;
    loadMedia(id, mainMediaContainer);
}

async function getIdRangeInt(start, end) {
    const url = `/api/media/index/range/${start}/${end}`;
    const response = await getAuthenticatedResponse(url);
    return await response.json();
}

function loadMediaArray(ids) {
   
    mainMediaContainer.innerHTML = '';
 
    for (const id of ids) {
        const div = document.createElement('div');
        loadMedia(id, div);
        mainMediaContainer.appendChild(div);
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
