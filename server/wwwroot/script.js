
async function authenticateAPI() {
    const api_key = document.getElementById("api-key").value;

    const response = await fetch("/api", {
        method: 'GET',
        headers: {
            'X-API-KEY': api_key,
            'Content-Type': 'application/json'
        }
    });

    const text = await response.text();
    alert(text);
}
