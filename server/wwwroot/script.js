
const mainMediaContainer = document.getElementById('main-media-container');

async function getAuthenticatedUrl(url) {

    const api_key = document.getElementById("api-key").value;
    const response = await fetch(url, {
        headers: { 'X-API-KEY': api_key } 
    });

    if (!response.ok) throw new Error(`Auth failed: ${response.status}`);

    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

async function getMediaData(id) {
    const api_key = document.getElementById("api-key").value;
    const response = await fetch(`/api/media/${id}/data`, {
        headers: { 'X-API-KEY': api_key }
    });
    return await response.json();
}

async function loadMedia(id) {
    const data = await getMediaData(id);
    console.log(data);
    const fileUrl = await getAuthenticatedUrl(`/api/media/${id}/file`);

    if (data.media_type == "PHOTO") {
        mainMediaContainer.innerHTML = `<img src="${fileUrl}"></img>`;
    } else {
        mainMediaContainer.innerHTML = `<video src="${fileUrl}" controls></video>`;
    }
}

function refresh() {
    const id = document.getElementById("media-id").value;
    loadMedia(id);
}
