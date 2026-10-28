const $ = (selector) => document.querySelector(selector);

let currentTab;

const normalizeBaseUrl = (value) => String(value || "https://minilinks.onrender.com").trim().replace(/\/+$/, "");

const getSettings = () => new Promise((resolve) => {
  chrome.storage.local.get({ apiBaseUrl: "https://minilinks.onrender.com", apiKey: "" }, resolve);
});

const setMessage = (message, isError = true) => {
  $("#message").textContent = message;
  $("#message").style.color = isError ? "#b42318" : "#08734e";
};

const showResult = (shortUrl) => {
  $("#short-url").textContent = shortUrl;
  $("#result").hidden = false;
  $("#copy").textContent = "Copy link";
};

const loadCurrentTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  $("#page-title").textContent = tab?.title || "Untitled page";
  $("#page-url").textContent = tab?.url || "";

  const { apiKey } = await getSettings();
  $("#connection").textContent = apiKey ? "Connected" : "Setup required";
  $("#setup-link").textContent = apiKey ? "Change API connection" : "Connect your MiniLinks account";
};

$("#shorten-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");
  $("#result").hidden = true;

  if (!currentTab?.url || !/^https?:\/\//i.test(currentTab.url)) {
    return setMessage("Open a normal web page before creating a link.");
  }

  const { apiBaseUrl, apiKey } = await getSettings();
  if (!apiKey) return setMessage("Connect an API key in extension settings first.");

  const button = $("#create");
  button.disabled = true;
  button.textContent = "Creating...";

  try {
    const response = await fetch(`${normalizeBaseUrl(apiBaseUrl)}/v1/links`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: currentTab.url, alias: $("#alias").value.trim(), title: currentTab.title || "" })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);

    const shortUrl = payload.link?.shortUrl || payload.shortUrl || (payload.link?.slug ? `${normalizeBaseUrl(apiBaseUrl)}/${payload.link.slug}` : "");
    if (!shortUrl) throw new Error("The API response did not include a short URL.");
    showResult(shortUrl);
    setMessage("MiniLink created.", false);
  } catch (error) {
    setMessage(error.message || "Could not create a MiniLink.");
  } finally {
    button.disabled = false;
    button.textContent = "Create MiniLink";
  }
});

$("#copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("#short-url").textContent);
  $("#copy").textContent = "Copied";
});

$("#settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
loadCurrentTab();
