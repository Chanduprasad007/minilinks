// server.ts
import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var APP_ROOT = process.cwd();
var app = express();
var PORT = Number(process.env.PORT || 3e3);
var DB_FILE = path.join(APP_ROOT, "urls.json");
var USERS_FILE = path.join(APP_ROOT, "users.json");
var APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
var STRIPE_PAYMENT_LINK = process.env.STRIPE_PAYMENT_LINK || "";
var STRIPE_CUSTOMER_PORTAL_LINK = process.env.STRIPE_CUSTOMER_PORTAL_LINK || "";
var FREE_ACCESS_EMAILS = (process.env.FREE_ACCESS_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
var PLAN_LIMITS = {
  guest: 5,
  free: 25,
  pro: 1e4
};
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
function isFreeAccessEmail(email) {
  return FREE_ACCESS_EMAILS.includes(normalizeEmail(email));
}
function applyEntitlements(user) {
  const freeAccess = isFreeAccessEmail(user.email) || user.freeAccess === true;
  return {
    ...user,
    email: normalizeEmail(user.email),
    apiTokens: user.apiTokens || [],
    freeAccess,
    plan: freeAccess || user.subscriptionStatus === "active" ? "pro" : user.plan || "free",
    subscriptionStatus: freeAccess ? "complimentary" : user.subscriptionStatus || "free"
  };
}
function publicUser(user) {
  const entitled = applyEntitlements(user);
  return {
    userId: entitled.userId,
    email: entitled.email,
    apiTokens: entitled.apiTokens || [],
    subscriptionStatus: entitled.subscriptionStatus,
    plan: entitled.plan,
    freeAccess: entitled.freeAccess
  };
}
function monthStartIso() {
  const now = /* @__PURE__ */ new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
function hasPaidAccess(user) {
  if (!user) return false;
  const status = applyEntitlements(user).subscriptionStatus;
  return status === "active" || status === "complimentary";
}
function ensureLocalDataFiles() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
  }
}
var configPath = path.join(APP_ROOT, "firebase-applet-config.json");
var db = null;
try {
  if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, "utf-8");
    const firebaseConfig = JSON.parse(configData);
    const hasServerCredentials = Boolean(
      process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_CONFIG || process.env.K_SERVICE
    );
    if (!hasServerCredentials) {
      console.warn("Firebase config found, but no server credentials are available. Using local JSON fallback.");
    } else {
      let adminApp;
      if (!getApps().length) {
        adminApp = initializeApp({
          projectId: firebaseConfig.projectId
        });
      } else {
        adminApp = getApps()[0];
      }
      db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId || "(default)");
      console.log("\u{1F525} Firebase Admin Firestore connected safely on server!");
    }
  } else {
    console.warn("\u26A0\uFE0F firebase-applet-config.json not found during server startup, falling back to local files.");
  }
} catch (err) {
  console.error("\u274C Failed to parse/initialize Firebase Admin in server.ts:", err);
}
function loadUsersLocal() {
  try {
    ensureLocalDataFiles();
    const data = fs.readFileSync(USERS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}
function saveUsersLocal(users) {
  try {
    ensureLocalDataFiles();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
  }
}
function loadUrlsLocal() {
  try {
    ensureLocalDataFiles();
    const data = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}
function saveUrlsLocal(urls) {
  try {
    ensureLocalDataFiles();
    fs.writeFileSync(DB_FILE, JSON.stringify(urls, null, 2));
  } catch (error) {
  }
}
async function migrateJsonToFirestore() {
  if (!db) return;
  try {
    const migrationMetaFlagFile = path.join(APP_ROOT, ".firestore_migrated");
    if (fs.existsSync(migrationMetaFlagFile)) {
      return;
    }
    console.log("\u{1F680} Starting database migration from local JSON file to Firebase Cloud Firestore...");
    const localUsers = loadUsersLocal();
    for (const u of localUsers) {
      await db.collection("users").doc(u.userId).set(u, { merge: true });
    }
    const localUrls = loadUrlsLocal();
    for (const url of localUrls) {
      await db.collection("urls").doc(url.id).set(url, { merge: true });
    }
    fs.writeFileSync(migrationMetaFlagFile, "true");
    console.log("\u2B50\uFE0F Successfully completed database migration to Cloud Firestore!");
  } catch (error) {
    console.error("\u274C Firestore DB migration failed:", error);
  }
}
migrateJsonToFirestore().catch((err) => console.error("Error migrating DB:", err));
async function getFirestoreUser(userId) {
  if (!db) {
    const list = loadUsersLocal();
    const user = list.find((u) => u.userId === userId);
    return user ? applyEntitlements(user) : null;
  }
  try {
    const snap = await db.collection("users").doc(userId).get();
    if (snap.exists) {
      return applyEntitlements(snap.data());
    }
  } catch (e) {
    console.error("Error fetching user from Firestore:", e);
    const list = loadUsersLocal();
    const user = list.find((u) => u.userId === userId);
    return user ? applyEntitlements(user) : null;
  }
  return null;
}
async function getFirestoreUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!db) {
    const list = loadUsersLocal();
    const user = list.find((u) => normalizeEmail(u.email) === normalizedEmail);
    return user ? applyEntitlements(user) : null;
  }
  try {
    const snap = await db.collection("users").where("email", "==", normalizedEmail).get();
    if (!snap.empty) {
      return applyEntitlements(snap.docs[0].data());
    }
  } catch (e) {
    console.error("Error reading user by email:", e);
    const list = loadUsersLocal();
    const user = list.find((u) => normalizeEmail(u.email) === normalizedEmail);
    return user ? applyEntitlements(user) : null;
  }
  return null;
}
async function getFirestoreUserByApiToken(token) {
  if (!db) {
    const list = loadUsersLocal();
    return list.find((u) => u.apiTokens.includes(token)) || null;
  }
  try {
    const snap = await db.collection("users").where("apiTokens", "array-contains", token).get();
    if (!snap.empty) {
      return applyEntitlements(snap.docs[0].data());
    }
  } catch (e) {
    console.error("Error querying user by API token:", e);
    const list = loadUsersLocal();
    const user = list.find((u) => (u.apiTokens || []).includes(token));
    return user ? applyEntitlements(user) : null;
  }
  return null;
}
async function saveFirestoreUser(user) {
  const normalizedUser = applyEntitlements(user);
  if (!db) {
    const list = loadUsersLocal();
    const idx = list.findIndex((u) => u.userId === normalizedUser.userId);
    if (idx !== -1) list[idx] = normalizedUser;
    else list.push(normalizedUser);
    saveUsersLocal(list);
    return;
  }
  try {
    await db.collection("users").doc(normalizedUser.userId).set(normalizedUser, { merge: true });
  } catch (e) {
    console.error("Error saving user profile to Firestore:", e);
    const list = loadUsersLocal();
    const idx = list.findIndex((u) => u.userId === normalizedUser.userId);
    if (idx !== -1) list[idx] = normalizedUser;
    else list.push(normalizedUser);
    saveUsersLocal(list);
  }
}
async function getFirestoreUrls(userId) {
  if (!db) {
    const list = loadUrlsLocal();
    return list.filter((u) => u.userId === userId);
  }
  try {
    const snap = await db.collection("urls").where("userId", "==", userId).get();
    const list = [];
    snap.forEach((doc) => {
      list.push(doc.data());
    });
    return list;
  } catch (e) {
    console.error("Error loading user URLs from Firestore:", e);
    const list = loadUrlsLocal();
    return list.filter((u) => u.userId === userId);
  }
}
async function countFirestoreUrlsSince(userId, sinceIso) {
  if (!db) {
    return loadUrlsLocal().filter((u) => u.userId === userId && u.createdAt >= sinceIso).length;
  }
  try {
    const snap = await db.collection("urls").where("userId", "==", userId).where("createdAt", ">=", sinceIso).get();
    return snap.size;
  } catch (e) {
    console.error("Error counting monthly URLs:", e);
    return loadUrlsLocal().filter((u) => u.userId === userId && u.createdAt >= sinceIso).length;
  }
}
async function findFirestoreUrl(id) {
  if (!db) {
    const list = loadUrlsLocal();
    return list.find((u) => u.id.toLowerCase() === id.toLowerCase()) || null;
  }
  try {
    const snap = await db.collection("urls").doc(id).get();
    if (snap.exists) {
      return snap.data();
    }
  } catch (e) {
    console.error("Error finding URL by ID in Firestore:", e);
    const list = loadUrlsLocal();
    return list.find((u) => u.id.toLowerCase() === id.toLowerCase()) || null;
  }
  return null;
}
async function saveFirestoreUrl(url) {
  if (!db) {
    const list = loadUrlsLocal();
    const idx = list.findIndex((u) => u.id === url.id);
    if (idx !== -1) list[idx] = url;
    else list.push(url);
    saveUrlsLocal(list);
    return;
  }
  try {
    await db.collection("urls").doc(url.id).set(url, { merge: true });
  } catch (e) {
    console.error("Error writing Short URL into Firestore:", e);
    const list = loadUrlsLocal();
    const idx = list.findIndex((u) => u.id === url.id);
    if (idx !== -1) list[idx] = url;
    else list.push(url);
    saveUrlsLocal(list);
  }
}
async function deleteFirestoreUrl(id) {
  if (!db) {
    const list = loadUrlsLocal();
    const idx = list.findIndex((u) => u.id === id);
    if (idx !== -1) {
      list.splice(idx, 1);
      saveUrlsLocal(list);
      return true;
    }
    return false;
  }
  try {
    await db.collection("urls").doc(id).delete();
    return true;
  } catch (e) {
    console.error("Error deleting Short URL from Firestore:", e);
    const list = loadUrlsLocal();
    const idx = list.findIndex((u) => u.id === id);
    if (idx !== -1) {
      list.splice(idx, 1);
      saveUrlsLocal(list);
      return true;
    }
    return false;
  }
}
async function getUniqueShortId(length = 4) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  while (true) {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const match = await findFirestoreUrl(result);
    if (!match) {
      return result;
    }
  }
}
async function fetchPageTitle(url) {
  try {
    const controller = new AbortController();
    const abortId = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36"
      }
    });
    clearTimeout(abortId);
    if (!res.ok) return void 0;
    const htmlText = await res.text();
    const match = htmlText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (match && match[1]) {
      return match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    }
  } catch (e) {
  }
  return void 0;
}
app.use(express.json());
app.post("/api/auth/sync", async (req, res) => {
  const { userId, email } = req.body;
  if (!userId || !email) {
    return res.status(400).json({ error: "userId and email are required to sync profile" });
  }
  try {
    let user = await getFirestoreUser(userId);
    if (!user) {
      user = {
        userId,
        email: normalizeEmail(email),
        apiTokens: [],
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        plan: "free",
        subscriptionStatus: "free",
        freeAccess: isFreeAccessEmail(email)
      };
      await saveFirestoreUser(user);
    } else {
      user = applyEntitlements(user);
      await saveFirestoreUser(user);
    }
    res.json({
      success: true,
      user: publicUser(user)
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to synchronise profiles" });
  }
});
app.get("/api/billing/status", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: "userId query parameter is required" });
  }
  const user = await getFirestoreUser(userId);
  if (!user) {
    return res.status(404).json({ error: "User account not found" });
  }
  const entitled = applyEntitlements(user);
  const monthlyUsage = await countFirestoreUrlsSince(userId, monthStartIso());
  const monthlyLimit = hasPaidAccess(entitled) ? PLAN_LIMITS.pro : PLAN_LIMITS.free;
  res.json({
    ...publicUser(entitled),
    monthlyUsage,
    monthlyLimit,
    checkoutAvailable: Boolean(STRIPE_PAYMENT_LINK),
    portalAvailable: Boolean(STRIPE_CUSTOMER_PORTAL_LINK)
  });
});
app.post("/api/billing/checkout", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }
  const user = await getFirestoreUser(userId);
  if (!user) {
    return res.status(404).json({ error: "User account not found" });
  }
  if (hasPaidAccess(user)) {
    return res.json({ url: STRIPE_CUSTOMER_PORTAL_LINK || APP_BASE_URL });
  }
  if (!STRIPE_PAYMENT_LINK) {
    return res.status(501).json({
      error: "Stripe is not configured. Add STRIPE_PAYMENT_LINK to your hosting environment."
    });
  }
  const separator = STRIPE_PAYMENT_LINK.includes("?") ? "&" : "?";
  res.json({
    url: `${STRIPE_PAYMENT_LINK}${separator}client_reference_id=${encodeURIComponent(user.userId)}&prefilled_email=${encodeURIComponent(user.email)}`
  });
});
app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Email and password are required" });
  }
  try {
    const exists = await getFirestoreUserByEmail(email);
    if (exists) {
      return res.status(400).json({ success: false, error: "An account with this email already exists" });
    }
    const userId = "usr_" + Math.random().toString(36).substring(2, 11);
    const newUser = {
      userId,
      email: normalizeEmail(email),
      password,
      apiTokens: [],
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      plan: "free",
      subscriptionStatus: isFreeAccessEmail(email) ? "complimentary" : "free",
      freeAccess: isFreeAccessEmail(email)
    };
    await saveFirestoreUser(newUser);
    res.status(201).json({
      success: true,
      user: publicUser(newUser)
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to register" });
  }
});
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Email and password are required" });
  }
  try {
    const user = await getFirestoreUserByEmail(email);
    if (!user || user.password !== password) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }
    res.json({
      success: true,
      user: publicUser(user)
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to login" });
  }
});
app.post("/api/auth/tokens/generate", async (req, res) => {
  const { email, userId } = req.body;
  const identifier = email || userId;
  if (!identifier) {
    return res.status(400).json({ error: "Email or userId is required" });
  }
  try {
    let user = userId ? await getFirestoreUser(userId) : await getFirestoreUserByEmail(identifier);
    if (!user) {
      return res.status(404).json({ error: "User account not active" });
    }
    if (!hasPaidAccess(user)) {
      return res.status(402).json({ error: "API tokens require a Pro subscription or complimentary access." });
    }
    const newToken = "shrt_live_" + Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11);
    const tokens = user.apiTokens || [];
    if (tokens.length >= 5) {
      return res.status(400).json({ error: "API Token limit reached. Please revoke existing tokens first." });
    }
    tokens.push(newToken);
    user.apiTokens = tokens;
    await saveFirestoreUser(user);
    res.json({
      success: true,
      apiTokens: user.apiTokens
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to generate token" });
  }
});
app.post("/api/auth/tokens/revoke", async (req, res) => {
  const { email, userId, token } = req.body;
  const identifier = email || userId;
  if (!identifier || !token) {
    return res.status(400).json({ error: "Email/userId and token are required" });
  }
  try {
    let user = userId ? await getFirestoreUser(userId) : await getFirestoreUserByEmail(identifier);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    user.apiTokens = (user.apiTokens || []).filter((t) => t !== token);
    await saveFirestoreUser(user);
    res.json({
      success: true,
      apiTokens: user.apiTokens
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to revoke token" });
  }
});
app.get("/api/urls", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId query parameter" });
  }
  try {
    const userUrls = await getFirestoreUrls(userId);
    userUrls.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(userUrls);
  } catch (err) {
    res.status(500).json([]);
  }
});
app.post("/api/shorten", async (req, res) => {
  const { targetUrl, customAlias, userId } = req.body;
  if (!targetUrl) {
    return res.status(400).json({ error: "Original URL is required" });
  }
  try {
    let activeUserId = userId;
    let activeUser = null;
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token) {
        const user = await getFirestoreUserByApiToken(token);
        if (!user) {
          return res.status(401).json({ error: "Invalid or expired API token" });
        }
        activeUserId = user.userId;
        activeUser = user;
      }
    }
    if (!activeUserId) {
      return res.status(400).json({ error: "Authentication is required to shorten links. Sign in or provide a valid Authorization Bearer API token." });
    }
    if (!activeUser) {
      activeUser = await getFirestoreUser(activeUserId);
    }
    const paidAccess = hasPaidAccess(activeUser);
    const monthlyLimit = activeUser ? paidAccess ? PLAN_LIMITS.pro : PLAN_LIMITS.free : PLAN_LIMITS.guest;
    const monthlyUsage = await countFirestoreUrlsSince(activeUserId, monthStartIso());
    if (monthlyUsage >= monthlyLimit) {
      return res.status(402).json({
        error: activeUser ? `Monthly link limit reached (${monthlyLimit}). Upgrade to Pro or add this email to FREE_ACCESS_EMAILS.` : `Guest monthly link limit reached (${monthlyLimit}). Create an account to continue.`
      });
    }
    if (customAlias && !paidAccess) {
      return res.status(402).json({ error: "Custom aliases require a Pro subscription or complimentary access." });
    }
    let formattedUrl = targetUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = "https://" + formattedUrl;
    }
    try {
      new URL(formattedUrl);
    } catch (_) {
      return res.status(400).json({ error: "Please enter a valid active URL structure (e.g. google.com or https://google.com)" });
    }
    let finalId = "";
    if (customAlias) {
      const aliasSane = customAlias.trim().replace(/[^a-zA-Z0-9_\-]/g, "");
      if (!aliasSane) {
        return res.status(400).json({ error: "Custom alias can only contain alphanumeric characters, hyphens, and underscores" });
      }
      const isReserved = ["api", "assets", "index.html", "static", "dist", "favicon.ico"].includes(aliasSane.toLowerCase());
      const isOccupied = await findFirestoreUrl(aliasSane);
      if (isReserved || isOccupied) {
        return res.status(400).json({ error: `Alias '${aliasSane}' is already in use. Try a different one!` });
      }
      finalId = aliasSane;
    } else {
      finalId = await getUniqueShortId();
    }
    const title = await fetchPageTitle(formattedUrl).catch(() => void 0);
    const newUrl = {
      id: finalId,
      targetUrl: formattedUrl,
      title: title || formattedUrl.replace(/^https?:\/\/(www\.)?/, ""),
      clicks: 0,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      userId: activeUserId,
      customAlias: !!customAlias
    };
    await saveFirestoreUrl(newUrl);
    res.status(201).json(newUrl);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to shorten URL" });
  }
});
app.delete("/api/urls/:id", async (req, res) => {
  const id = req.params.id;
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: "userId query parameter strictly required" });
  }
  try {
    const match = await findFirestoreUrl(id);
    if (!match || match.userId !== userId) {
      return res.status(404).json({ error: "Shortened link not found or you don't have authorization to delete it" });
    }
    await deleteFirestoreUrl(id);
    res.json({ success: true, message: "URL deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to delete URL" });
  }
});
app.get("/:shortId", async (req, res, next) => {
  const shortId = req.params.shortId;
  if (shortId.startsWith("api") || shortId.includes(".") || shortId === "index.html") {
    return next();
  }
  try {
    const match = await findFirestoreUrl(shortId);
    if (match) {
      match.clicks = (match.clicks || 0) + 1;
      await saveFirestoreUrl(match);
      return res.redirect(302, match.targetUrl);
    }
  } catch (err) {
    console.error("Redirection failure:", err);
  }
  return res.redirect(`/?error=not-found&id=${encodeURIComponent(shortId)}`);
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server launched on port ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.js.map
