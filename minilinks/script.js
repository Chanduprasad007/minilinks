const state = {
  links: [],
  stats: null,
  product: null,
  latestUrl: "",
  authToken: localStorage.getItem("minilinks_auth_token") || "",
  refreshToken: localStorage.getItem("minilinks_refresh_token") || "",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  form: $("#link-form"), longUrl: $("#long-url"), alias: $("#alias"), campaign: $("#campaign"), title: $("#title"), qrEnabled: $("#qr-enabled"),
  status: $("#api-status"), systemStatus: $("#system-status"), message: $("#form-message"), shortUrl: $("#short-url"), copy: $("#copy-link"), qr: $("#qr-image"),
  recentTable: $("#links-table"), allTable: $("#all-links-table"), search: $("#link-search"), refresh: $("#refresh-links"),
  totals: { links: $("#total-links"), clicks: $("#total-clicks"), campaigns: $("#total-campaigns"), qr: $("#total-qr") },
  referrers: $("#referrer-list"), browsers: $("#browser-list"), notice: $("#global-notice"), currentSection: $("#current-section"),
  keyForm: $("#api-key-form"), keyName: $("#api-key-name"), keyMessage: $("#key-message"), keyList: $("#api-key-list"),
  secretModal: $("#secret-reveal"), secretValue: $("#secret-value"), copySecret: $("#copy-secret"),
  reportForm: $("#report-form"), reportMessage: $("#report-message"), takedownForm: $("#takedown-form"), takedownMessage: $("#takedown-message"), securityFeed: $("#security-feed"),
  memberList: $("#member-list"), auditList: $("#audit-list"), authForm: $("#auth-form"), authMessage: $("#auth-message"), signup: $("#signup-button"),
  googleLogin: $("#google-login"), signedIn: $("#signed-in-state"), signedInEmail: $("#signed-in-email"), signedInAvatar: $("#signed-in-avatar"), logout: $("#logout-button"),
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const formatNumber = (value) => new Intl.NumberFormat().format(value || 0);
const formatDate = (value, includeTime = false) => value ? new Date(value).toLocaleString(undefined, includeTime ? { dateStyle: "medium", timeStyle: "short" } : { month: "short", day: "numeric", year: "numeric" }) : "Never";
const shortOrigin = () => window.location.origin;
const normalizeAlias = (value) => value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
const qrUrl = (value) => `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=12&data=${encodeURIComponent(value)}`;

const refreshIcons = () => window.lucide?.createIcons();
const setStatus = (label, type = "") => { elements.status.textContent = label; elements.status.className = `status-badge ${type}`.trim(); };
const setMessage = (element, message, type = "") => { element.textContent = message; element.className = `form-message ${type}`.trim(); };
const showNotice = (message, type = "") => { elements.notice.textContent = message; elements.notice.className = `notice ${type}`.trim(); window.setTimeout(() => elements.notice.classList.add("hidden"), 5000); };

const saveSession = (payload) => {
  const accessToken = payload.access_token || payload.session?.access_token || "";
  const refreshToken = payload.refresh_token || payload.session?.refresh_token || state.refreshToken;
  if (accessToken) {
    state.authToken = accessToken;
    localStorage.setItem("minilinks_auth_token", accessToken);
  }
  if (refreshToken) {
    state.refreshToken = refreshToken;
    localStorage.setItem("minilinks_refresh_token", refreshToken);
  }
  return Boolean(accessToken);
};

const clearSession = () => {
  state.authToken = "";
  state.refreshToken = "";
  localStorage.removeItem("minilinks_auth_token");
  localStorage.removeItem("minilinks_refresh_token");
};

const refreshSession = async () => {
  if (!state.refreshToken) return false;
  const response = await fetch("/api/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: state.refreshToken }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !saveSession(payload)) { clearSession(); return false; }
  return true;
};

const request = async (url, options = {}, canRetry = true) => {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.authToken) headers.Authorization = `Bearer ${state.authToken}`;
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && canRetry && state.refreshToken && !url.startsWith("/api/auth/")) {
    if (await refreshSession()) return request(url, options, false);
  }
  if (!response.ok) {
    const error = new Error(payload.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return payload;
};

const viewNames = { overview: "Overview", links: "Managed links", analytics: "Analytics", "api-keys": "API keys", security: "Trust & safety", team: "Team & billing", audit: "Audit log" };
const activateView = (view) => {
  const target = viewNames[view] ? view : "overview";
  $$(".view").forEach((section) => section.classList.toggle("active", section.dataset.view === target));
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.viewLink === target));
  elements.currentSection.textContent = viewNames[target];
  history.replaceState(null, "", `#${target}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
};

$$('[data-view-link]').forEach((control) => control.addEventListener("click", (event) => {
  event.preventDefault();
  activateView(control.dataset.viewLink);
}));

const riskBadge = (status = "clean") => `<span class="risk-badge ${escapeHtml(status)}">${status === "clean" ? "Clean" : escapeHtml(status)}</span>`;

const linkRows = (links) => {
  if (!links.length) return '<tr><td colspan="6">No links yet. Create your first secure MiniLink.</td></tr>';
  return links.map((link) => {
    const shortUrl = `${shortOrigin()}/${link.slug}`;
    return `<tr>
      <td><a href="/${encodeURIComponent(link.slug)}" target="_blank" rel="noreferrer">${escapeHtml(shortUrl)}</a></td>
      <td><span class="destination" title="${escapeHtml(link.longUrl)}">${escapeHtml(link.longUrl)}</span></td>
      <td>${escapeHtml(link.campaign || "Unassigned")}</td>
      <td>${riskBadge(link.riskStatus)}</td>
      <td><strong>${formatNumber(link.clicks)}</strong></td>
      <td>${formatDate(link.createdAt)}</td>
    </tr>`;
  }).join("");
};

const renderLinks = (links) => {
  elements.recentTable.innerHTML = linkRows(links.slice(0, 6));
  elements.allTable.innerHTML = linkRows(links);
};

const renderBars = (container, values) => {
  const entries = Object.entries(values || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = Math.max(...entries.map((entry) => entry[1]), 1);
  if (!entries.length) { container.innerHTML = '<p class="empty-state">No click data yet. Open a short link to record traffic.</p>'; return; }
  container.innerHTML = entries.map(([label, count]) => `<div class="bar-row"><span class="bar-label">${escapeHtml(label)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(8, Math.round((count / max) * 100))}%"></span></span><span class="bar-value">${formatNumber(count)}</span></div>`).join("");
};

const renderStats = (stats) => {
  elements.totals.links.textContent = formatNumber(stats.totals.links);
  elements.totals.clicks.textContent = formatNumber(stats.totals.clicks);
  elements.totals.campaigns.textContent = formatNumber(stats.totals.campaigns);
  elements.totals.qr.textContent = formatNumber(stats.totals.qrEnabled);
  $("#analytics-clicks").textContent = formatNumber(stats.totals.clicks);
  $("#analytics-links").textContent = formatNumber(stats.totals.links);
  renderBars(elements.referrers, stats.referrers);
  renderBars(elements.browsers, stats.browsers);
};

const renderPayload = (payload) => {
  state.stats = payload.stats || payload;
  state.links = payload.links || state.stats.links || [];
  renderStats(state.stats);
  renderLinks(state.links);
};

const renderKeys = (keys = []) => {
  if (!keys.length) { elements.keyList.innerHTML = '<p class="empty-state">No API keys yet. Generate one for your first integration.</p>'; return; }
  elements.keyList.innerHTML = keys.map((key) => `<div class="key-row"><span><strong>${escapeHtml(key.name)}</strong><small class="mono">${escapeHtml(key.keyPrefix)}••••••••</small></span><span><strong>${key.revokedAt ? "Revoked" : "Active"}</strong><small>${escapeHtml(key.scopes.join(", "))}</small></span><span><strong>Last used</strong><small>${formatDate(key.lastUsedAt, true)}</small></span>${key.revokedAt ? '<span class="risk-badge blocked">Revoked</span>' : `<button class="button secondary revoke-key" type="button" data-key-id="${escapeHtml(key.id)}">Revoke</button>`}</div>`).join("");
};

const renderSecurity = (product) => {
  $("#scan-count").textContent = `${formatNumber(product.scans.length)} scans`;
  const activities = [
    ...product.reports.map((item) => ({ type: "Report", title: item.reason, detail: item.url, status: item.status, createdAt: item.createdAt })),
    ...product.takedowns.map((item) => ({ type: "Takedown", title: item.reason, detail: item.linkId, status: item.status, createdAt: item.createdAt })),
    ...product.scans.map((item) => ({ type: "Scan", title: `${item.verdict} · ${item.provider}`, detail: item.url, status: item.verdict, createdAt: item.createdAt })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20);
  elements.securityFeed.innerHTML = activities.length ? activities.map((item) => `<div class="activity-row"><span class="activity-type">${escapeHtml(item.type)}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span><span><strong>${escapeHtml(item.status)}</strong><small>${formatDate(item.createdAt, true)}</small></span></div>`).join("") : '<p class="empty-state">No safety events yet. Scans appear here as links are created.</p>';
};

const initials = (value) => String(value || "OP").split(/[@\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

const renderProduct = (product) => {
  state.product = product;
  $("#workspace-name").textContent = product.workspace?.name || "MiniLinks HQ";
  $("#workspace-plan").textContent = `${product.workspace?.plan || "starter"} workspace`;
  $("#account-initials").textContent = initials(product.user?.email);
  $("#auth-mode").textContent = product.user?.mode === "supabase" ? "Supabase auth" : "Demo auth";
  const signedIn = product.user?.mode === "supabase";
  elements.authForm.classList.toggle("hidden", signedIn);
  elements.signedIn.classList.toggle("hidden", !signedIn);
  if (signedIn) {
    elements.signedInEmail.textContent = product.user.email;
    elements.signedInAvatar.textContent = initials(product.user.email);
  }
  renderKeys(product.apiKeys);
  renderSecurity(product);
  elements.memberList.innerHTML = product.members.length ? product.members.map((member) => `<div class="member-row"><span class="member-identity"><span class="member-avatar">${initials(member.email)}</span><span><strong>${escapeHtml(member.email)}</strong><small>${member.userId === product.user?.id ? "Current user" : "Workspace member"}</small></span></span><span class="role-badge">${escapeHtml(member.role)}</span><small>${formatDate(member.createdAt)}</small></div>`).join("") : '<p class="empty-state">No members have been added to this workspace.</p>';
  const billing = product.billing || { plan: "starter", status: "trialing", monthlyLinks: 1000 };
  $("#billing-plan").textContent = billing.plan[0].toUpperCase() + billing.plan.slice(1);
  $("#billing-limit").textContent = formatNumber(billing.monthlyLinks);
  $("#billing-status").textContent = billing.status.replace("_", " ");
  $("#billing-usage").style.transform = `scaleX(${Math.min(1, (state.links.length || 0) / billing.monthlyLinks)})`;
  elements.auditList.innerHTML = product.auditLogs.length ? product.auditLogs.map((item) => `<div class="audit-row"><span><strong class="audit-action">${escapeHtml(item.action)}</strong><small>${escapeHtml(item.targetType)}</small></span><span><strong>${escapeHtml(item.actorId)}</strong><small>Actor</small></span><span><strong>${escapeHtml(item.targetId || "Workspace")}</strong><small>${escapeHtml(JSON.stringify(item.metadata || {}))}</small></span><span><strong>${formatDate(item.createdAt, true)}</strong><small class="mono">${escapeHtml(item.ipHash)}</small></span></div>`).join("") : '<p class="empty-state">Sensitive actions will appear here.</p>';
  refreshIcons();
};

const loadLinks = async () => {
  try {
    const payload = await request("/api/links");
    renderPayload(payload);
    setStatus("API online", "ok");
    elements.systemStatus.textContent = "All systems online";
    $(".live-dot").classList.add("ok");
  } catch (error) {
    if (error.status === 401) {
      setStatus("Sign in required");
      elements.systemStatus.textContent = "Authentication required";
      setMessage(elements.message, "Sign in to create and manage links.");
      activateView("team");
      return;
    }
    setStatus("API offline", "error");
    elements.systemStatus.textContent = "API unavailable";
    setMessage(elements.message, error.message, "error");
  }
};

const loadProduct = async () => {
  try { renderProduct(await request("/api/product")); }
  catch (error) {
    if (error.status === 401) { activateView("team"); return; }
    showNotice(error.message, "error");
  }
};

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(elements.message, "Scanning destination and creating link...");
  const payload = { longUrl: elements.longUrl.value, alias: normalizeAlias(elements.alias.value), campaign: elements.campaign.value, title: elements.title.value, qrEnabled: elements.qrEnabled.checked };
  try {
    const result = await request("/api/links", { method: "POST", body: JSON.stringify(payload) });
    const shortUrl = `${shortOrigin()}/${result.link.slug}`;
    state.latestUrl = shortUrl;
    elements.shortUrl.textContent = shortUrl;
    elements.qr.src = qrUrl(shortUrl);
    elements.qr.classList.toggle("ready", result.link.qrEnabled);
    elements.form.reset(); elements.qrEnabled.checked = true;
    setMessage(elements.message, "MiniLink created and security scan passed.", "success");
    renderPayload({ links: result.stats.links, stats: result.stats });
    await loadProduct();
  } catch (error) { setMessage(elements.message, error.message, "error"); }
});

elements.copy.addEventListener("click", async () => {
  if (!state.latestUrl) return setMessage(elements.message, "Create a link before copying.");
  await navigator.clipboard.writeText(state.latestUrl).catch(() => setMessage(elements.message, state.latestUrl));
  showNotice("Short URL copied.", "success");
});

elements.search.addEventListener("input", () => {
  const query = elements.search.value.trim().toLowerCase();
  renderLinks(state.links.filter((link) => [link.slug, link.longUrl, link.campaign, link.title].some((value) => String(value || "").toLowerCase().includes(query))));
});
elements.refresh.addEventListener("click", loadLinks);

const downloadExport = async () => {
  const fetchExport = () => fetch("/api/export.csv", { headers: state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {} });
  let response = await fetchExport();
  if (response.status === 401 && await refreshSession()) response = await fetchExport();
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Export failed.");
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "minilinks-export.csv";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
};

$$('.export-links').forEach((button) => button.addEventListener("click", async () => {
  button.disabled = true;
  try { await downloadExport(); showNotice("CSV export downloaded.", "success"); }
  catch (error) { showNotice(error.message, "error"); }
  button.disabled = false;
}));

elements.keyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const scopes = $$('input[name="scope"]:checked').map((input) => input.value);
  setMessage(elements.keyMessage, "Generating credential...");
  try {
    const payload = await request("/api/api-keys", { method: "POST", body: JSON.stringify({ name: elements.keyName.value, scopes }) });
    elements.secretValue.textContent = payload.key.token;
    elements.secretModal.classList.remove("hidden");
    elements.keyForm.reset();
    setMessage(elements.keyMessage, "API key created.", "success");
    await loadProduct();
  } catch (error) { setMessage(elements.keyMessage, error.message, "error"); }
});

elements.keyList.addEventListener("click", async (event) => {
  const button = event.target.closest(".revoke-key");
  if (!button) return;
  button.disabled = true;
  try { await request(`/api/api-keys/${encodeURIComponent(button.dataset.keyId)}/revoke`, { method: "POST" }); showNotice("API key revoked.", "success"); await loadProduct(); }
  catch (error) { showNotice(error.message, "error"); button.disabled = false; }
});

const closeSecret = () => { elements.secretModal.classList.add("hidden"); elements.secretValue.textContent = ""; };
$("#close-secret").addEventListener("click", closeSecret);
$("#secret-done").addEventListener("click", closeSecret);
elements.copySecret.addEventListener("click", async () => { await navigator.clipboard.writeText(elements.secretValue.textContent); showNotice("API key copied.", "success"); });
$("#copy-code").addEventListener("click", async () => { await navigator.clipboard.writeText($("#api-example").textContent); showNotice("API request copied.", "success"); });

elements.reportForm.addEventListener("submit", async (event) => {
  event.preventDefault(); setMessage(elements.reportMessage, "Submitting report...");
  try { await request("/api/reports", { method: "POST", body: JSON.stringify({ url: $("#report-url").value, reason: $("#report-reason").value, email: $("#report-email").value }) }); elements.reportForm.reset(); setMessage(elements.reportMessage, "Report opened for investigation.", "success"); await loadProduct(); }
  catch (error) { setMessage(elements.reportMessage, error.message, "error"); }
});

elements.takedownForm.addEventListener("submit", async (event) => {
  event.preventDefault(); setMessage(elements.takedownMessage, "Creating review request...");
  try { await request("/api/takedowns", { method: "POST", body: JSON.stringify({ slug: normalizeAlias($("#takedown-slug").value), reason: $("#takedown-reason").value }) }); elements.takedownForm.reset(); setMessage(elements.takedownMessage, "Takedown queued for review.", "success"); await loadProduct(); }
  catch (error) { setMessage(elements.takedownMessage, error.message, "error"); }
});

const authenticate = async (action) => {
  setMessage(elements.authMessage, action === "login" ? "Signing in..." : "Creating account...");
  try {
    const payload = await request(`/api/auth/${action}`, { method: "POST", body: JSON.stringify({ email: $("#auth-email").value, password: $("#auth-password").value }) });
    saveSession(payload);
    setMessage(elements.authMessage, payload.demo ? "Local owner demo mode is active." : action === "login" ? "Signed in." : "Account created. Check your email if confirmation is enabled.", "success");
    await loadProduct();
  } catch (error) { setMessage(elements.authMessage, error.message, "error"); }
};
elements.authForm.addEventListener("submit", (event) => { event.preventDefault(); authenticate("login"); });
elements.signup.addEventListener("click", () => authenticate("signup"));

elements.googleLogin.addEventListener("click", async () => {
  setMessage(elements.authMessage, "Opening Google sign-in...");
  elements.googleLogin.disabled = true;
  try {
    const payload = await request("/api/auth/oauth/google");
    window.location.assign(payload.url);
  } catch (error) {
    setMessage(elements.authMessage, error.message, "error");
    elements.googleLogin.disabled = false;
  }
});

elements.logout.addEventListener("click", async () => {
  elements.logout.disabled = true;
  await request("/api/auth/logout", { method: "POST" }).catch(() => null);
  clearSession();
  elements.authForm.classList.remove("hidden");
  elements.signedIn.classList.add("hidden");
  setMessage(elements.authMessage, "Signed out.", "success");
  elements.logout.disabled = false;
});

const consumeAuthCallback = () => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get("error")) {
    history.replaceState(null, "", "#team");
    window.setTimeout(() => setMessage(elements.authMessage, params.get("error_description") || "Google sign-in failed.", "error"));
    return "team";
  }
  if (params.get("access_token")) {
    saveSession({ access_token: params.get("access_token"), refresh_token: params.get("refresh_token") });
    history.replaceState(null, "", "#team");
    window.setTimeout(() => setMessage(elements.authMessage, "Google account connected.", "success"));
    return "team";
  }
  return window.location.hash.replace("#", "");
};

const initialView = consumeAuthCallback();
activateView(viewNames[initialView] ? initialView : "overview");
refreshIcons();
Promise.all([loadLinks(), loadProduct()]);
