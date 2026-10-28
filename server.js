const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
const PUBLIC_DIR = path.join(__dirname, "minilinks");
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "minilinks-db.json");
const RESERVED = new Set(["api", "app", "pricing", "assets", "styles.css", "script.js", "index.html", "home.html", "health", "openapi.json"]);
const SUPABASE_URL = String(process.env.SUPABASE_URL || "")
  .trim()
  .replace(/\/$/, "")
  .replace(/\/rest\/v1$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const API_KEY_SECRET = process.env.API_KEY_SECRET || "local-development-secret-change-me";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const emptyDb = () => ({
  links: [],
  clicks: [],
  workspaces: [{ id: WORKSPACE_ID, name: "MiniLinks HQ", slug: "minilinks-hq", plan: "starter", createdAt: new Date().toISOString() }],
  members: [{ id: crypto.randomUUID(), workspaceId: WORKSPACE_ID, userId: "local-owner", email: "owner@minilinks.local", role: "owner", createdAt: new Date().toISOString() }],
  apiKeys: [],
  auditLogs: [],
  reports: [],
  takedowns: [],
  scans: [],
  billing: [{ workspaceId: WORKSPACE_ID, plan: "starter", status: "trialing", monthlyLinks: 1000 }],
  blockedDomains: [],
  createdAt: new Date().toISOString(),
});

const ensureDb = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(emptyDb(), null, 2));
};

const readDb = () => {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  const defaults = emptyDb();
  for (const [key, value] of Object.entries(defaults)) {
    if (db[key] === undefined) db[key] = value;
  }
  db.links.forEach((link) => {
    if (!link.workspaceId) link.workspaceId = WORKSPACE_ID;
    if (!link.riskStatus) link.riskStatus = "clean";
  });
  return db;
};

const writeDb = (db) => {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
};

const linkFromRow = (row) => ({
  id: row.id,
  workspaceId: row.workspace_id,
  slug: row.slug,
  longUrl: row.long_url,
  title: row.title || "",
  campaign: row.campaign || "",
  domain: row.domain || "mini.local",
  qrEnabled: Boolean(row.qr_enabled),
  active: Boolean(row.active),
  riskStatus: row.risk_status || "clean",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const clickFromRow = (row) => ({
  id: row.id,
  linkId: row.link_id,
  slug: row.slug,
  referrer: row.referrer || "",
  browser: row.browser || "Other",
  ipHash: row.ip_hash || "",
  createdAt: row.created_at,
});

const supabaseFetch = async (table, options = {}) => {
  const query = options.query ? `?${options.query}` : "";
  const usesOpaqueSecret = SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_secret_");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      ...(!usesOpaqueSecret && { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }),
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase ${table} request failed: ${message}`);
  }

  if (response.status === 204) return null;
  return response.json();
};

const featureTables = {
  workspaces: "workspaces",
  members: "workspace_members",
  apiKeys: "api_keys",
  auditLogs: "audit_logs",
  reports: "phishing_reports",
  takedowns: "takedown_requests",
  scans: "malware_scans",
  billing: "billing_accounts",
  blockedDomains: "blocked_domains",
};

const featureFromRow = (key, row) => {
  const common = { id: row.id, workspaceId: row.workspace_id, createdAt: row.created_at };
  if (key === "workspaces") return { id: row.id, name: row.name, slug: row.slug, plan: row.plan, createdAt: row.created_at };
  if (key === "members") return { ...common, userId: row.user_id, email: row.email, role: row.role };
  if (key === "apiKeys") return { ...common, name: row.name, keyPrefix: row.key_prefix, keyHash: row.key_hash, scopes: row.scopes || [], createdBy: row.created_by, lastUsedAt: row.last_used_at, revokedAt: row.revoked_at };
  if (key === "auditLogs") return { ...common, actorId: row.actor_id, action: row.action, targetType: row.target_type, targetId: row.target_id, metadata: row.metadata || {}, ipHash: row.ip_hash };
  if (key === "reports") return { ...common, url: row.url, reason: row.reason, reporterEmail: row.reporter_email, status: row.status };
  if (key === "takedowns") return { ...common, linkId: row.link_id, reason: row.reason, status: row.status, reviewerNote: row.reviewer_note, updatedAt: row.updated_at };
  if (key === "scans") return { ...common, url: row.url, verdict: row.verdict, signals: row.signals || [], provider: row.provider };
  if (key === "billing") return { workspaceId: row.workspace_id, plan: row.plan, status: row.status, monthlyLinks: row.monthly_links, updatedAt: row.updated_at };
  if (key === "blockedDomains") return { id: row.id, domain: row.domain, reason: row.reason, createdAt: row.created_at };
  return row;
};

const featureToRow = (key, item) => {
  if (key === "workspaces") return { id: item.id, name: item.name, slug: item.slug, plan: item.plan, created_at: item.createdAt };
  if (key === "members") return { id: item.id, workspace_id: item.workspaceId, user_id: item.userId, email: item.email, role: item.role, created_at: item.createdAt };
  if (key === "apiKeys") return { id: item.id, workspace_id: item.workspaceId, name: item.name, key_prefix: item.keyPrefix, key_hash: item.keyHash, scopes: item.scopes, created_by: item.createdBy, last_used_at: item.lastUsedAt, revoked_at: item.revokedAt, created_at: item.createdAt };
  if (key === "auditLogs") return { id: item.id, workspace_id: item.workspaceId, actor_id: item.actorId, action: item.action, target_type: item.targetType, target_id: item.targetId, metadata: item.metadata, ip_hash: item.ipHash, created_at: item.createdAt };
  if (key === "reports") return { id: item.id, workspace_id: item.workspaceId, url: item.url, reason: item.reason, reporter_email: item.reporterEmail, status: item.status, created_at: item.createdAt };
  if (key === "takedowns") return { id: item.id, workspace_id: item.workspaceId, link_id: item.linkId, reason: item.reason, status: item.status, reviewer_note: item.reviewerNote, created_at: item.createdAt, updated_at: item.updatedAt };
  if (key === "scans") return { id: item.id, workspace_id: item.workspaceId, url: item.url, verdict: item.verdict, signals: item.signals, provider: item.provider, created_at: item.createdAt };
  if (key === "billing") return { workspace_id: item.workspaceId, plan: item.plan, status: item.status, monthly_links: item.monthlyLinks, updated_at: item.updatedAt };
  return item;
};

const saveFeature = async (key, item) => {
  if (!USE_SUPABASE) {
    const db = readDb();
    db[key].unshift(item);
    writeDb(db);
    return item;
  }
  await supabaseFetch(featureTables[key], { method: "POST", body: featureToRow(key, item) });
  return item;
};

const updateFeature = async (key, id, changes) => {
  if (!USE_SUPABASE) {
    const db = readDb();
    const item = db[key].find((record) => record.id === id);
    if (!item) return null;
    Object.assign(item, changes);
    writeDb(db);
    return item;
  }
  const body = featureToRow(key, { id, ...changes });
  Object.keys(body).forEach((field) => body[field] === undefined && delete body[field]);
  const rows = await supabaseFetch(featureTables[key], { method: "PATCH", query: `id=eq.${encodeURIComponent(id)}`, body });
  return rows?.[0] ? featureFromRow(key, rows[0]) : null;
};

const readStore = async () => {
  if (!USE_SUPABASE) return readDb();

  const [links, clicks, ...features] = await Promise.all([
    supabaseFetch("links", { query: "select=*&order=created_at.desc" }),
    supabaseFetch("click_events", { query: "select=*&order=created_at.asc" }),
    ...Object.values(featureTables).map((table) => supabaseFetch(table, { query: "select=*" })),
  ]);

  const db = {
    links: links.map(linkFromRow),
    clicks: clicks.map(clickFromRow),
  };
  Object.keys(featureTables).forEach((key, index) => {
    db[key] = features[index].map((row) => featureFromRow(key, row));
  });
  return db;
};

const saveLink = async (link) => {
  if (!USE_SUPABASE) {
    const db = readDb();
    db.links.unshift(link);
    writeDb(db);
    return;
  }

  await supabaseFetch("links", {
    method: "POST",
    body: {
      id: link.id,
      workspace_id: link.workspaceId,
      slug: link.slug,
      long_url: link.longUrl,
      title: link.title,
      campaign: link.campaign,
      domain: link.domain,
      qr_enabled: link.qrEnabled,
      active: link.active,
      risk_status: link.riskStatus,
      created_at: link.createdAt,
      updated_at: link.updatedAt,
    },
  });
};

const saveClick = async (click) => {
  if (!USE_SUPABASE) {
    const db = readDb();
    db.clicks.push(click);
    writeDb(db);
    return;
  }

  await supabaseFetch("click_events", {
    method: "POST",
    body: {
      id: click.id,
      link_id: click.linkId,
      slug: click.slug,
      referrer: click.referrer,
      browser: click.browser,
      ip_hash: click.ipHash,
      created_at: click.createdAt,
    },
  });
};

const send = (res, status, payload, headers = {}) => {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": typeof payload === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
};

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Body must be valid JSON."));
      }
    });
  });

const normalizeSlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const makeSlug = (url) => {
  const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0] || "go";
  const token = crypto.randomBytes(3).toString("base64url").toLowerCase();
  return `${normalizeSlug(host).slice(0, 18)}-${token}`;
};

const validateUrl = (value) => {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }
  return parsed.toString();
};

const hashValue = (value) => crypto.createHmac("sha256", API_KEY_SECRET).update(String(value)).digest("hex");
const requestIp = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
const bearerToken = (req) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
const appOrigin = (req) => {
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL.replace(/\/app$/, "")}/app`;
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0];
  const protocol = forwardedProto || (/^(localhost|127\.0\.0\.1)(:|$)/.test(req.headers.host || "") ? "http" : "https");
  return `${protocol}://${req.headers.host}/app`;
};

const currentUser = async (req) => {
  const token = bearerToken(req);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { id: "local-owner", email: "owner@minilinks.local", role: "owner", mode: "demo" };
  }
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return { id: user.id, email: user.email, role: "owner", mode: "supabase" };
};

const requireDashboardUser = async (req, res) => {
  const user = await currentUser(req);
  if (!user) {
    send(res, 401, { error: "Sign in to access this workspace." });
    return null;
  }
  return ensureUserWorkspace(user);
};

const authAction = async (req, res, action) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return send(res, 200, { user: await currentUser(req), demo: true });
  }
  const body = await parseBody(req);
  const redirectTo = appOrigin(req);
  const endpoint = action === "signup"
    ? `/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`
    : "/auth/v1/token?grant_type=password";
  const response = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password }),
  });
  const payload = await response.json();
  if (!response.ok) return send(res, response.status, { error: payload.msg || payload.error_description || "Authentication failed." });
  send(res, action === "signup" ? 201 : 200, payload);
};

const refreshAuth = async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return send(res, 200, { user: await currentUser(req), demo: true });
  const body = await parseBody(req);
  if (!body.refreshToken) return send(res, 400, { error: "A refresh token is required." });
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: body.refreshToken }),
  });
  const payload = await response.json();
  if (!response.ok) return send(res, response.status, { error: payload.msg || payload.error_description || "Session refresh failed." });
  send(res, 200, payload);
};

const googleOAuth = (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return send(res, 503, { error: "Google sign-in requires Supabase configuration." });
  const redirectTo = appOrigin(req);
  const authorizeUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
  send(res, 200, { url: authorizeUrl });
};

const logoutAuth = async (req, res) => {
  const token = bearerToken(req);
  if (SUPABASE_URL && SUPABASE_ANON_KEY && token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    }).catch(() => null);
  }
  send(res, 200, { ok: true });
};

const checkRateLimit = (req, res, identity, limit) => {
  const now = Date.now();
  if (rateBuckets.size > 10_000) {
    for (const [key, value] of rateBuckets) if (now >= value.resetAt) rateBuckets.delete(key);
  }
  const bucketKey = hashValue(identity).slice(0, 20);
  let bucket = rateBuckets.get(bucketKey);
  if (!bucket || now >= bucket.resetAt) bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
  bucket.count += 1;
  rateBuckets.set(bucketKey, bucket);
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
  if (bucket.count <= limit) return true;
  send(res, 429, { error: "Rate limit exceeded. Try again in one minute." }, { "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)) });
  return false;
};

const isPrivateHost = (host) => {
  const value = host.toLowerCase();
  return value === "localhost" || value.endsWith(".local") || value === "0.0.0.0" || value === "127.0.0.1" || value === "::1" || /^10\./.test(value) || /^192\.168\./.test(value) || /^172\.(1[6-9]|2\d|3[01])\./.test(value) || /^169\.254\./.test(value);
};

const scanDestination = async (url, db, workspaceId) => {
  const parsed = new URL(validateUrl(url));
  const signals = [];
  if (isPrivateHost(parsed.hostname)) signals.push("private-network-target");
  if (db.blockedDomains.some((entry) => parsed.hostname === entry.domain || parsed.hostname.endsWith(`.${entry.domain}`))) signals.push("blocked-domain");
  if (/(verify[-_.]?account|confirm[-_.]?password|wallet[-_.]?connect|seed[-_.]?phrase|login[-_.]?secure)/i.test(`${parsed.hostname}${parsed.pathname}`)) signals.push("phishing-pattern");
  if (parsed.username || parsed.password) signals.push("embedded-credentials");
  const verdict = signals.length ? "blocked" : "clean";
  await saveFeature("scans", { id: crypto.randomUUID(), workspaceId, url: parsed.toString(), verdict, signals, provider: "minilinks-heuristics", createdAt: new Date().toISOString() });
  return { url: parsed.toString(), verdict, signals };
};

const audit = async (req, action, targetType, targetId, metadata = {}, workspaceId = WORKSPACE_ID) => {
  const user = await currentUser(req);
  return saveFeature("auditLogs", { id: crypto.randomUUID(), workspaceId, actorId: user?.id || "api-key", action, targetType, targetId, metadata, ipHash: hashValue(requestIp(req)).slice(0, 16), createdAt: new Date().toISOString() });
};

const authenticateApiKey = async (req, scope) => {
  const raw = bearerToken(req) || String(req.headers["x-api-key"] || "");
  if (!raw.startsWith("ml_live_")) return null;
  const db = await readStore();
  const key = db.apiKeys.find((item) => item.keyHash === hashValue(raw) && !item.revokedAt && item.scopes.includes(scope));
  if (!key) return null;
  await updateFeature("apiKeys", key.id, { ...key, lastUsedAt: new Date().toISOString() });
  return key;
};

const browserName = (ua = "") => {
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return "Other";
};

const referrerHost = (value) => {
  if (!value) return "";
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
};

const compactLink = (link, clicks) => {
  const linkClicks = clicks.filter((click) => click.linkId === link.id);
  const lastClick = linkClicks.at(-1);
  return {
    ...link,
    clicks: linkClicks.length,
    lastClickAt: lastClick?.createdAt || null,
  };
};

const buildStats = (db) => {
  const links = db.links.map((link) => compactLink(link, db.clicks));
  const clicksByDay = db.clicks.reduce((acc, click) => {
    const day = click.createdAt.slice(0, 10);
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});
  const referrers = db.clicks.reduce((acc, click) => {
    const key = click.referrer || "Direct";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const browsers = db.clicks.reduce((acc, click) => {
    acc[click.browser] = (acc[click.browser] || 0) + 1;
    return acc;
  }, {});

  return {
    totals: {
      links: db.links.length,
      clicks: db.clicks.length,
      campaigns: new Set(db.links.map((link) => link.campaign).filter(Boolean)).size,
      qrEnabled: db.links.filter((link) => link.qrEnabled).length,
    },
    links,
    clicksByDay,
    referrers,
    browsers,
  };
};

const workspaceStore = (db, workspaceId) => {
  const links = db.links.filter((link) => link.workspaceId === workspaceId);
  const linkIds = new Set(links.map((link) => link.id));
  return { ...db, links, clicks: db.clicks.filter((click) => linkIds.has(click.linkId)) };
};

const ensureUserWorkspace = async (user) => {
  const db = await readStore();
  let membership = db.members.find((member) => member.userId === user.id);
  let workspace = membership ? db.workspaces.find((item) => item.id === membership.workspaceId) : null;
  if (!membership || !workspace) {
    const now = new Date().toISOString();
    const workspaceId = crypto.randomUUID();
    const accountName = String(user.email || "My").split("@")[0].replace(/[._-]+/g, " ").trim() || "My";
    workspace = { id: workspaceId, name: `${accountName[0].toUpperCase()}${accountName.slice(1)} Workspace`, slug: `${normalizeSlug(accountName) || "workspace"}-${crypto.randomBytes(3).toString("hex")}`, plan: "starter", createdAt: now };
    membership = { id: crypto.randomUUID(), workspaceId, userId: user.id, email: user.email, role: "owner", createdAt: now };
    const billing = { workspaceId, plan: "starter", status: "trialing", monthlyLinks: 1000, updatedAt: now };
    await saveFeature("workspaces", workspace);
    await saveFeature("members", membership);
    await saveFeature("billing", billing);
    db.workspaces.unshift(workspace);
    db.members.unshift(membership);
    db.billing.unshift(billing);
  }
  return { user: { ...user, role: membership.role }, membership, workspace, workspaceId: workspace.id, db };
};

const createLink = async (req, res, actor = null) => {
  try {
    const body = await parseBody(req);
    const db = await readStore();
    const workspaceId = actor?.workspaceId || WORKSPACE_ID;
    const scan = await scanDestination(body.longUrl || body.url || "", db, workspaceId);
    if (scan.verdict !== "clean") {
      return send(res, 422, { error: "Destination failed the security scan.", signals: scan.signals });
    }
    const longUrl = scan.url;
    const requestedSlug = normalizeSlug(body.slug || body.alias);
    const slug = requestedSlug || makeSlug(longUrl);

    if (!slug || slug.length < 3) return send(res, 400, { error: "Alias must be at least 3 characters." });
    if (RESERVED.has(slug)) return send(res, 409, { error: "That alias is reserved." });
    if (db.links.some((link) => link.slug === slug)) return send(res, 409, { error: "That alias is already taken." });

    const now = new Date().toISOString();
    const link = {
      id: crypto.randomUUID(),
      workspaceId,
      slug,
      longUrl,
      title: String(body.title || "").trim().slice(0, 90),
      campaign: String(body.campaign || "").trim().slice(0, 80),
      domain: String(body.domain || "mini.local").trim().slice(0, 80),
      qrEnabled: Boolean(body.qrEnabled ?? true),
      active: true,
      riskStatus: "clean",
      createdAt: now,
      updatedAt: now,
    };

    await saveLink(link);
    await audit(req, "link.created", "link", link.id, { slug: link.slug, via: actor?.keyHash ? "api_key" : "dashboard" }, workspaceId);
    const nextDb = await readStore();
    send(res, 201, { link: compactLink(link, nextDb.clicks), stats: buildStats(workspaceStore(nextDb, workspaceId)) });
  } catch (error) {
    send(res, 400, { error: error.message });
  }
};

const listLinks = async (res, workspaceId) => {
  const db = await readStore();
  const scoped = workspaceStore(db, workspaceId);
  send(res, 200, { links: scoped.links.map((link) => compactLink(link, scoped.clicks)), stats: buildStats(scoped) });
};

const productSettings = async (req, res) => {
  const user = await currentUser(req);
  if (!user) return send(res, 401, { error: "Sign in required." });
  const context = await ensureUserWorkspace(user);
  const { db, workspace, membership } = context;
  const workspaceId = workspace.id;
  send(res, 200, {
    user: { ...user, role: membership.role },
    workspace,
    members: db.members.filter((item) => item.workspaceId === workspaceId),
    billing: db.billing.find((item) => item.workspaceId === workspaceId),
    apiKeys: db.apiKeys.filter((item) => item.workspaceId === workspaceId).map(({ keyHash, ...key }) => key),
    auditLogs: db.auditLogs.filter((item) => item.workspaceId === workspaceId).slice(0, 30),
    reports: db.reports.filter((item) => item.workspaceId === workspaceId).slice(0, 30),
    takedowns: db.takedowns.filter((item) => item.workspaceId === workspaceId).slice(0, 30),
    scans: db.scans.filter((item) => item.workspaceId === workspaceId).slice(0, 30),
    security: { rateLimit: { dashboard: 30, publicApi: 120, windowSeconds: 60 }, malwareScanning: true, blockedDomains: db.blockedDomains.length },
  });
};

const createApiKey = async (req, res) => {
  const user = await currentUser(req);
  if (!user) return send(res, 401, { error: "Sign in to create an API key." });
  const context = await ensureUserWorkspace(user);
  if (!["owner", "admin", "developer"].includes(context.membership.role)) return send(res, 403, { error: "Your workspace role cannot create API keys." });
  const body = await parseBody(req);
  const raw = `ml_live_${crypto.randomBytes(24).toString("base64url")}`;
  const allowedScopes = new Set(["links:read", "links:write", "analytics:read"]);
  const scopes = Array.isArray(body.scopes) ? body.scopes.filter((scope) => allowedScopes.has(scope)) : [];
  const key = {
    id: crypto.randomUUID(),
    workspaceId: context.workspace.id,
    name: String(body.name || "Production key").trim().slice(0, 60),
    keyPrefix: raw.slice(0, 16),
    keyHash: hashValue(raw),
    scopes: scopes.length ? scopes : ["links:read", "links:write"],
    createdBy: user.id,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date().toISOString(),
  };
  await saveFeature("apiKeys", key);
  await audit(req, "api_key.created", "api_key", key.id, { name: key.name, scopes: key.scopes }, context.workspace.id);
  send(res, 201, { key: { ...key, keyHash: undefined, token: raw }, warning: "Copy this key now. It will not be shown again." });
};

const revokeApiKey = async (req, res, id) => {
  const user = await currentUser(req);
  if (!user) return send(res, 401, { error: "Sign in to revoke an API key." });
  const context = await ensureUserWorkspace(user);
  if (!["owner", "admin", "developer"].includes(context.membership.role)) return send(res, 403, { error: "Your workspace role cannot revoke API keys." });
  const db = await readStore();
  const existing = db.apiKeys.find((key) => key.id === id && key.workspaceId === context.workspace.id);
  if (!existing) return send(res, 404, { error: "API key not found." });
  await updateFeature("apiKeys", id, { ...existing, revokedAt: new Date().toISOString() });
  await audit(req, "api_key.revoked", "api_key", id, {}, context.workspace.id);
  send(res, 200, { ok: true });
};

const createReport = async (req, res) => {
  const body = await parseBody(req);
  const report = {
    id: crypto.randomUUID(), workspaceId: WORKSPACE_ID, url: validateUrl(body.url),
    reason: String(body.reason || "Suspected phishing").trim().slice(0, 500),
    reporterEmail: String(body.email || "").trim().slice(0, 120), status: "open", createdAt: new Date().toISOString(),
  };
  await saveFeature("reports", report);
  await audit(req, "phishing_report.created", "phishing_report", report.id, { url: report.url });
  send(res, 201, { report });
};

const createTakedown = async (req, res) => {
  const body = await parseBody(req);
  const db = await readStore();
  const link = db.links.find((item) => item.id === body.linkId || item.slug === body.slug);
  if (!link) return send(res, 404, { error: "Link not found." });
  const now = new Date().toISOString();
  const request = { id: crypto.randomUUID(), workspaceId: link.workspaceId || WORKSPACE_ID, linkId: link.id, reason: String(body.reason || "Policy violation").trim().slice(0, 500), status: "pending_review", reviewerNote: "", createdAt: now, updatedAt: now };
  await saveFeature("takedowns", request);
  await audit(req, "takedown.requested", "link", link.id, { slug: link.slug }, request.workspaceId);
  send(res, 201, { request });
};

const exportCsv = async (res, workspaceId) => {
  const db = await readStore();
  const scoped = workspaceStore(db, workspaceId);
  const rows = [
    ["slug", "destination", "campaign", "clicks", "created_at"],
    ...scoped.links.map((link) => [
      link.slug,
      link.longUrl,
      link.campaign,
      scoped.clicks.filter((click) => click.linkId === link.id).length,
      link.createdAt,
    ]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  send(res, 200, csv, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="minilinks-export.csv"',
  });
};

const redirect = async (req, res, slug) => {
  const db = await readStore();
  const link = db.links.find((item) => item.slug === slug && item.active && item.riskStatus !== "blocked");
  if (!link) return serveStatic(res, "index.html", 404);

  await saveClick({
    id: crypto.randomUUID(),
    linkId: link.id,
    slug: link.slug,
    referrer: referrerHost(req.headers.referer),
    browser: browserName(req.headers["user-agent"]),
    ipHash: hashValue(requestIp(req)).slice(0, 16),
    createdAt: new Date().toISOString(),
  });

  res.writeHead(302, {
    Location: link.longUrl,
    "Cache-Control": "no-store",
    "X-MiniLinks-Slug": link.slug,
  });
  res.end();
};

const serveStatic = (res, requestPath, status = 200) => {
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath === "/" ? "index.html" : safePath);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return send(res, 404, "Not found");
  }

  const ext = path.extname(filePath);
  res.writeHead(status, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
  });
  fs.createReadStream(filePath).pipe(res);
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname.startsWith("/v1/")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Key");
      res.setHeader("Access-Control-Expose-Headers", "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset");
      res.setHeader("Vary", "Origin");
      if (req.method === "OPTIONS") return send(res, 204, "");
    }

    if (pathname === "/health") return send(res, 200, { ok: true, storage: USE_SUPABASE ? "supabase" : "json", auth: SUPABASE_ANON_KEY ? "supabase" : "demo" });
    if (pathname === "/api/auth/signup" && req.method === "POST") return authAction(req, res, "signup");
    if (pathname === "/api/auth/login" && req.method === "POST") return authAction(req, res, "login");
    if (pathname === "/api/auth/refresh" && req.method === "POST") return refreshAuth(req, res);
    if (pathname === "/api/auth/oauth/google" && req.method === "GET") return googleOAuth(req, res);
    if (pathname === "/api/auth/logout" && req.method === "POST") return logoutAuth(req, res);
    if (pathname === "/api/auth/me" && req.method === "GET") return send(res, 200, { user: await currentUser(req) });
    if (pathname === "/api/product" && req.method === "GET") return productSettings(req, res);
    if (pathname === "/api/api-keys" && req.method === "POST") return createApiKey(req, res);
    if (/^\/api\/api-keys\/[^/]+\/revoke$/.test(pathname) && req.method === "POST") return revokeApiKey(req, res, pathname.split("/")[3]);
    if (pathname === "/api/reports" && req.method === "POST") {
      if (!checkRateLimit(req, res, `report:${requestIp(req)}`, 10)) return;
      return createReport(req, res);
    }
    if (pathname === "/api/takedowns" && req.method === "POST") {
      if (!checkRateLimit(req, res, `takedown:${requestIp(req)}`, 20)) return;
      return createTakedown(req, res);
    }
    if (pathname === "/api/links" && req.method === "POST") {
      const context = await requireDashboardUser(req, res);
      if (!context) return;
      if (!checkRateLimit(req, res, requestIp(req), 30)) return;
      return createLink(req, res, context);
    }
    if (pathname === "/api/links" && req.method === "GET") {
      const context = await requireDashboardUser(req, res);
      if (!context) return;
      return listLinks(res, context.workspace.id);
    }
    if (pathname === "/api/stats" && req.method === "GET") {
      const context = await requireDashboardUser(req, res);
      if (!context) return;
      return send(res, 200, buildStats(workspaceStore(await readStore(), context.workspace.id)));
    }
    if (pathname === "/api/export.csv" && req.method === "GET") {
      const context = await requireDashboardUser(req, res);
      if (!context) return;
      return exportCsv(res, context.workspace.id);
    }
    if (pathname === "/v1/links" && req.method === "POST") {
      const key = await authenticateApiKey(req, "links:write");
      if (!key) return send(res, 401, { error: "A valid API key with links:write scope is required." });
      if (!checkRateLimit(req, res, key.id, 120)) return;
      return createLink(req, res, key);
    }
    if (pathname === "/v1/links" && req.method === "GET") {
      const key = await authenticateApiKey(req, "links:read");
      if (!key) return send(res, 401, { error: "A valid API key with links:read scope is required." });
      if (!checkRateLimit(req, res, key.id, 120)) return;
      return listLinks(res, key.workspaceId);
    }
    if (pathname.startsWith("/api/") || pathname.startsWith("/v1/")) return send(res, 404, { error: "Unknown API route." });

    if (pathname === "/" && (req.method === "GET" || req.method === "HEAD")) return serveStatic(res, "home.html");
    if (pathname === "/app" && (req.method === "GET" || req.method === "HEAD")) return serveStatic(res, "index.html");
    if ((req.method === "GET" || req.method === "HEAD") && pathname.length > 1 && !path.extname(pathname)) {
      return redirect(req, res, pathname.slice(1));
    }
    serveStatic(res, pathname.slice(1));
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  if (!USE_SUPABASE) ensureDb();
  const storage = USE_SUPABASE ? "Supabase" : "local JSON";
  console.log(`MiniLinks running at http://localhost:${PORT} using ${storage} storage`);
});
