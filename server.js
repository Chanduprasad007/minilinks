const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "minilinks");
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "minilinks-db.json");
const RESERVED = new Set(["api", "assets", "styles.css", "script.js", "index.html", "health"]);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

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
  createdAt: new Date().toISOString(),
});

const ensureDb = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(emptyDb(), null, 2));
};

const readDb = () => {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
};

const writeDb = (db) => {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
};

const linkFromRow = (row) => ({
  id: row.id,
  slug: row.slug,
  longUrl: row.long_url,
  title: row.title || "",
  campaign: row.campaign || "",
  domain: row.domain || "mini.local",
  qrEnabled: Boolean(row.qr_enabled),
  active: Boolean(row.active),
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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

const readStore = async () => {
  if (!USE_SUPABASE) return readDb();

  const [links, clicks] = await Promise.all([
    supabaseFetch("links", { query: "select=*&order=created_at.desc" }),
    supabaseFetch("click_events", { query: "select=*&order=created_at.asc" }),
  ]);

  return {
    links: links.map(linkFromRow),
    clicks: clicks.map(clickFromRow),
  };
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
      slug: link.slug,
      long_url: link.longUrl,
      title: link.title,
      campaign: link.campaign,
      domain: link.domain,
      qr_enabled: link.qrEnabled,
      active: link.active,
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

const createLink = async (req, res) => {
  try {
    const body = await parseBody(req);
    const db = await readStore();
    const longUrl = validateUrl(body.longUrl || body.url || "");
    const requestedSlug = normalizeSlug(body.slug || body.alias);
    const slug = requestedSlug || makeSlug(longUrl);

    if (!slug || slug.length < 3) return send(res, 400, { error: "Alias must be at least 3 characters." });
    if (RESERVED.has(slug)) return send(res, 409, { error: "That alias is reserved." });
    if (db.links.some((link) => link.slug === slug)) return send(res, 409, { error: "That alias is already taken." });

    const now = new Date().toISOString();
    const link = {
      id: crypto.randomUUID(),
      slug,
      longUrl,
      title: String(body.title || "").trim().slice(0, 90),
      campaign: String(body.campaign || "").trim().slice(0, 80),
      domain: String(body.domain || "mini.local").trim().slice(0, 80),
      qrEnabled: Boolean(body.qrEnabled ?? true),
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    await saveLink(link);
    const nextDb = await readStore();
    send(res, 201, { link: compactLink(link, nextDb.clicks), stats: buildStats(nextDb) });
  } catch (error) {
    send(res, 400, { error: error.message });
  }
};

const listLinks = async (res) => {
  const db = await readStore();
  send(res, 200, { links: db.links.map((link) => compactLink(link, db.clicks)), stats: buildStats(db) });
};

const exportCsv = async (res) => {
  const db = await readStore();
  const rows = [
    ["slug", "destination", "campaign", "clicks", "created_at"],
    ...db.links.map((link) => [
      link.slug,
      link.longUrl,
      link.campaign,
      db.clicks.filter((click) => click.linkId === link.id).length,
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
  const link = db.links.find((item) => item.slug === slug && item.active);
  if (!link) return serveStatic(res, "index.html", 404);

  await saveClick({
    id: crypto.randomUUID(),
    linkId: link.id,
    slug: link.slug,
    referrer: referrerHost(req.headers.referer),
    browser: browserName(req.headers["user-agent"]),
    ipHash: crypto.createHash("sha256").update(req.socket.remoteAddress || "unknown").digest("hex").slice(0, 16),
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

    if (pathname === "/health") return send(res, 200, { ok: true, storage: USE_SUPABASE ? "supabase" : "json" });
    if (pathname === "/api/links" && req.method === "POST") return createLink(req, res);
    if (pathname === "/api/links" && req.method === "GET") return listLinks(res);
    if (pathname === "/api/stats" && req.method === "GET") return send(res, 200, buildStats(await readStore()));
    if (pathname === "/api/export.csv" && req.method === "GET") return exportCsv(res);
    if (pathname.startsWith("/api/")) return send(res, 404, { error: "Unknown API route." });

    if ((req.method === "GET" || req.method === "HEAD") && pathname.length > 1 && !path.extname(pathname)) {
      return redirect(req, res, pathname.slice(1));
    }

    serveStatic(res, pathname === "/" ? "index.html" : pathname.slice(1));
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  if (!USE_SUPABASE) ensureDb();
  const storage = USE_SUPABASE ? "Supabase" : "local JSON";
  console.log(`MiniLinks running at http://localhost:${PORT} using ${storage} storage`);
});
