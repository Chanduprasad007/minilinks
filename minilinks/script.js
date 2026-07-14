const state = {
  links: [],
  stats: null,
  latestUrl: "",
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  form: $("#link-form"),
  longUrl: $("#long-url"),
  alias: $("#alias"),
  campaign: $("#campaign"),
  title: $("#title"),
  qrEnabled: $("#qr-enabled"),
  status: $("#api-status"),
  message: $("#form-message"),
  shortUrl: $("#short-url"),
  copy: $("#copy-link"),
  qr: $("#qr-image"),
  refresh: $("#refresh-links"),
  table: $("#links-table"),
  totals: {
    links: $("#total-links"),
    clicks: $("#total-clicks"),
    campaigns: $("#total-campaigns"),
    qr: $("#total-qr"),
  },
  referrers: $("#referrer-list"),
  browsers: $("#browser-list"),
};

const formatNumber = (value) => new Intl.NumberFormat().format(value || 0);

const shortOrigin = () => window.location.origin;

const normalizeAlias = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const setStatus = (label, type = "") => {
  elements.status.textContent = label;
  elements.status.className = `status-badge ${type}`.trim();
};

const setMessage = (message, isError = false) => {
  elements.message.textContent = message;
  elements.message.classList.toggle("error", isError);
};

const request = async (url, options) => {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
};

const qrUrl = (value) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=12&data=${encodeURIComponent(value)}`;

const renderTotals = (stats) => {
  elements.totals.links.textContent = formatNumber(stats.totals.links);
  elements.totals.clicks.textContent = formatNumber(stats.totals.clicks);
  elements.totals.campaigns.textContent = formatNumber(stats.totals.campaigns);
  elements.totals.qr.textContent = formatNumber(stats.totals.qrEnabled);
};

const renderBars = (container, values) => {
  const entries = Object.entries(values || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(...entries.map((entry) => entry[1]), 1);

  if (!entries.length) {
    container.innerHTML = '<p class="form-message">No click data yet. Open a short link to record traffic.</p>';
    return;
  }

  container.innerHTML = entries
    .map(([label, count]) => {
      const width = Math.max(8, Math.round((count / max) * 100));
      return `
        <div class="bar-row">
          <span class="bar-label">${label}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${width}%"></span></span>
          <span class="bar-value">${count}</span>
        </div>
      `;
    })
    .join("");
};

const renderLinks = (links) => {
  if (!links.length) {
    elements.table.innerHTML = `
      <tr>
        <td colspan="5">No links yet. Create your first MiniLink above.</td>
      </tr>
    `;
    return;
  }

  elements.table.innerHTML = links
    .map((link) => {
      const shortUrl = `${shortOrigin()}/${link.slug}`;
      const created = new Date(link.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return `
        <tr>
          <td><a href="/${link.slug}" target="_blank" rel="noreferrer">${shortUrl}</a></td>
          <td><span class="destination" title="${link.longUrl}">${link.longUrl}</span></td>
          <td>${link.campaign || "Unassigned"}</td>
          <td><strong>${formatNumber(link.clicks)}</strong></td>
          <td>${created}</td>
        </tr>
      `;
    })
    .join("");
};

const render = (payload) => {
  state.stats = payload.stats || payload;
  state.links = payload.links || state.stats.links || [];
  renderTotals(state.stats);
  renderLinks(state.links);
  renderBars(elements.referrers, state.stats.referrers);
  renderBars(elements.browsers, state.stats.browsers);
};

const loadLinks = async () => {
  try {
    const payload = await request("/api/links");
    render(payload);
    setStatus("API online", "ok");
  } catch (error) {
    setStatus("API offline", "error");
    setMessage(error.message, true);
  }
};

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("Creating link...");

  const payload = {
    longUrl: elements.longUrl.value,
    alias: normalizeAlias(elements.alias.value),
    campaign: elements.campaign.value,
    title: elements.title.value,
    qrEnabled: elements.qrEnabled.checked,
  };

  try {
    const result = await request("/api/links", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const shortUrl = `${shortOrigin()}/${result.link.slug}`;
    state.latestUrl = shortUrl;
    elements.shortUrl.textContent = shortUrl;
    elements.qr.src = qrUrl(shortUrl);
    elements.qr.classList.toggle("ready", result.link.qrEnabled);
    elements.form.reset();
    elements.qrEnabled.checked = true;
    setMessage("MiniLink created. Open it once to see analytics update.");
    render({ links: result.stats.links, stats: result.stats });
  } catch (error) {
    setMessage(error.message, true);
  }
});

elements.copy.addEventListener("click", async () => {
  if (!state.latestUrl) {
    setMessage("Create a link before copying.");
    return;
  }
  try {
    await navigator.clipboard.writeText(state.latestUrl);
    elements.copy.textContent = "Copied";
  } catch {
    setMessage(state.latestUrl);
  }
  window.setTimeout(() => {
    elements.copy.textContent = "Copy";
  }, 1400);
});

elements.refresh.addEventListener("click", loadLinks);

loadLinks();
