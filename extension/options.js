const baseInput = document.querySelector("#api-base");
const keyInput = document.querySelector("#api-key");
const message = document.querySelector("#message");

const originPattern = (value) => {
  const url = new URL(value);
  return `${url.protocol}//${url.host}/*`;
};

chrome.storage.local.get({ apiBaseUrl: "https://minilinks.onrender.com", apiKey: "" }, (settings) => {
  baseInput.value = settings.apiBaseUrl;
  keyInput.value = settings.apiKey;
});

document.querySelector("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";

  try {
    const apiBaseUrl = baseInput.value.trim().replace(/\/+$/, "");
    const apiKey = keyInput.value.trim();
    if (!apiKey.startsWith("ml_live_")) throw new Error("Enter a MiniLinks key beginning with ml_live_.");

    const granted = await chrome.permissions.request({ origins: [originPattern(apiBaseUrl)] });
    if (!granted) throw new Error("Chrome needs permission to contact this MiniLinks domain.");

    await chrome.storage.local.set({ apiBaseUrl, apiKey });
    message.textContent = "Connection saved. You can now create links from the extension.";
  } catch (error) {
    message.textContent = error.message || "Could not save the connection.";
    message.style.color = "#b42318";
  }
});
