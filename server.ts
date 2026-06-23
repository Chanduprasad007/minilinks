import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import type { ShortUrl, ShortenRequest, UserAccount } from "./src/types.js";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = process.cwd();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_FILE = path.join(APP_ROOT, "urls.json");
const USERS_FILE = path.join(APP_ROOT, "users.json");
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const STRIPE_PAYMENT_LINK = process.env.STRIPE_PAYMENT_LINK || "";
const STRIPE_CUSTOMER_PORTAL_LINK = process.env.STRIPE_CUSTOMER_PORTAL_LINK || "";
const FREE_ACCESS_EMAILS = (process.env.FREE_ACCESS_EMAILS || "")
  .split(",")
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

const RESERVED_PATHS = [
  "dashboard", "analytics", "campaigns", "settings",
  "login", "register", "workspace", "auth", "sheets",
  "api", "guide", "pricing", "billing", "logout", "p"
];

function parseReferrer(refererHeader?: string): string {
  if (!refererHeader) return "Direct";
  try {
    const url = new URL(refererHeader);
    const host = url.hostname.toLowerCase();
    if (host.includes("google.com")) return "Google Search";
    if (host.includes("bing.com")) return "Bing Search";
    if (host.includes("yahoo.com")) return "Yahoo Search";
    if (host.includes("t.co") || host.includes("twitter.com") || host.includes("x.com")) return "X / Twitter";
    if (host.includes("facebook.com")) return "Facebook";
    if (host.includes("linkedin.com")) return "LinkedIn";
    if (host.includes("instagram.com")) return "Instagram";
    if (host.includes("reddit.com")) return "Reddit";
    if (host.includes("youtube.com")) return "YouTube";
    return url.hostname;
  } catch (_) {
    return "External Link";
  }
}

function parseBrowser(userAgentString?: string): string {
  if (!userAgentString) return "Other";
  const ua = userAgentString.toLowerCase();
  if (ua.includes("chrome") && !ua.includes("chromium") && !ua.includes("edg") && !ua.includes("opr")) return "Chrome";
  if (ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium")) return "Safari";
  if (ua.includes("firefox")) return "Firefox";
  if (ua.includes("edg")) return "Edge";
  if (ua.includes("opr") || ua.includes("opera")) return "Opera";
  return "Other";
}

function parseDevice(userAgentString?: string): string {
  if (!userAgentString) return "Desktop";
  const ua = userAgentString.toLowerCase();
  if (ua.includes("ipad") || ua.includes("tablet") || (ua.includes("android") && !ua.includes("mobile"))) return "Tablet";
  if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android")) return "Mobile";
  return "Desktop";
}

const PLAN_LIMITS = {
  guest: 5,
  free: 25,
  pro: 10000
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isFreeAccessEmail(email: string): boolean {
  return FREE_ACCESS_EMAILS.includes(normalizeEmail(email));
}

function applyEntitlements(user: UserAccount): UserAccount {
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

function publicUser(user: UserAccount) {
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

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function hasPaidAccess(user: UserAccount | null): boolean {
  if (!user) return false;
  const status = applyEntitlements(user).subscriptionStatus;
  return status === "active" || status === "complimentary";
}

function ensureLocalDataFiles(): void {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
  }
}

// Initialize Firebase Admin on the server
const configPath = path.join(APP_ROOT, "firebase-applet-config.json");
let db: any = null;

try {
  if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, "utf-8");
    const firebaseConfig = JSON.parse(configData);
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const hasCredentialsFile = Boolean(credentialsPath && fs.existsSync(credentialsPath));
    const hasRenderOrCloudCredentials = Boolean(process.env.FIREBASE_CONFIG || process.env.K_SERVICE);
    const hasServerCredentials = hasCredentialsFile || hasRenderOrCloudCredentials;

    if (credentialsPath && !hasCredentialsFile) {
      console.warn(`Firebase credentials file not found at ${credentialsPath}. Using local JSON fallback.`);
    }

    if (!hasServerCredentials) {
      console.warn("Firebase config found, but no usable server credentials are available. Using local JSON fallback.");
    } else {
    
      // Initialize admin SDK
      let adminApp;
      if (!getApps().length) {
        adminApp = initializeApp({
          projectId: firebaseConfig.projectId
        });
      } else {
        adminApp = getApps()[0];
      }

      // Instantiate Firestore client through the Firebase Admin SDK.
      db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId || "(default)");
      console.log("🔥 Firebase Admin Firestore connected safely on server!");
    }
  } else {
    console.warn("⚠️ firebase-applet-config.json not found during server startup, falling back to local files.");
  }
} catch (err) {
  console.error("❌ Failed to parse/initialize Firebase Admin in server.ts:", err);
}

// Local File Database Fallbacks
function loadUsersLocal(): UserAccount[] {
  try {
    ensureLocalDataFiles();
    const data = fs.readFileSync(USERS_FILE, "utf-8");
    return JSON.parse(data) as UserAccount[];
  } catch (error) {
    return [];
  }
}

function saveUsersLocal(users: UserAccount[]): void {
  try {
    ensureLocalDataFiles();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {}
}


function loadUrlsLocal(): ShortUrl[] {
  try {
    ensureLocalDataFiles();
    const data = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(data) as ShortUrl[];
  } catch (error) {
    return [];
  }
}

function saveUrlsLocal(urls: ShortUrl[]): void {
  try {
    ensureLocalDataFiles();
    fs.writeFileSync(DB_FILE, JSON.stringify(urls, null, 2));
  } catch (error) {}
}

// Migrate legacy file lists to Cloud Firestore automatically to avoid any state loss
async function migrateJsonToFirestore() {
  if (!db) return;
  try {
    const migrationMetaFlagFile = path.join(APP_ROOT, ".firestore_migrated");
    if (fs.existsSync(migrationMetaFlagFile)) {
      return;
    }

    console.log("🚀 Starting database migration from local JSON file to Firebase Cloud Firestore...");
    const localUsers = loadUsersLocal();
    for (const u of localUsers) {
      await db.collection("users").doc(u.userId).set(u, { merge: true });
    }

    const localUrls = loadUrlsLocal();
    for (const url of localUrls) {
      await db.collection("urls").doc(url.id).set(url, { merge: true });
    }

    fs.writeFileSync(migrationMetaFlagFile, "true");
    console.log("⭐️ Successfully completed database migration to Cloud Firestore!");
  } catch (error) {
    console.error("❌ Firestore DB migration failed:", error);
  }
}

// Trigger migration in async background
migrateJsonToFirestore().catch(err => console.error("Error migrating DB:", err));

// Firestore User Database Helper Functions
async function getFirestoreUser(userId: string): Promise<UserAccount | null> {
  if (!db) {
    const list = loadUsersLocal();
    const user = list.find(u => u.userId === userId);
    return user ? applyEntitlements(user) : null;
  }
  try {
    const snap = await db.collection("users").doc(userId).get();
    if (snap.exists) {
      return applyEntitlements(snap.data() as UserAccount);
    }
  } catch (e) {
    console.error("Error fetching user from Firestore:", e);
    const list = loadUsersLocal();
    const user = list.find(u => u.userId === userId);
    return user ? applyEntitlements(user) : null;
  }
  return null;
}

async function getFirestoreUserByEmail(email: string): Promise<UserAccount | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!db) {
    const list = loadUsersLocal();
    const user = list.find(u => normalizeEmail(u.email) === normalizedEmail);
    return user ? applyEntitlements(user) : null;
  }
  try {
    const snap = await db.collection("users").where("email", "==", normalizedEmail).get();
    if (!snap.empty) {
      return applyEntitlements(snap.docs[0].data() as UserAccount);
    }
  } catch (e) {
    console.error("Error reading user by email:", e);
    const list = loadUsersLocal();
    const user = list.find(u => normalizeEmail(u.email) === normalizedEmail);
    return user ? applyEntitlements(user) : null;
  }
  return null;
}

async function getFirestoreUserByApiToken(token: string): Promise<UserAccount | null> {
  if (!db) {
    const list = loadUsersLocal();
    return list.find(u => u.apiTokens.includes(token)) || null;
  }
  try {
    const snap = await db.collection("users").where("apiTokens", "array-contains", token).get();
    if (!snap.empty) {
      return applyEntitlements(snap.docs[0].data() as UserAccount);
    }
  } catch (e) {
    console.error("Error querying user by API token:", e);
    const list = loadUsersLocal();
    const user = list.find(u => (u.apiTokens || []).includes(token));
    return user ? applyEntitlements(user) : null;
  }
  return null;
}

async function saveFirestoreUser(user: UserAccount): Promise<void> {
  const normalizedUser = applyEntitlements(user);
  if (!db) {
    const list = loadUsersLocal();
    const idx = list.findIndex(u => u.userId === normalizedUser.userId);
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
    const idx = list.findIndex(u => u.userId === normalizedUser.userId);
    if (idx !== -1) list[idx] = normalizedUser;
    else list.push(normalizedUser);
    saveUsersLocal(list);
  }
}

// Firestore ShortUrls Database Helper Functions
async function getFirestoreUrls(userId: string): Promise<ShortUrl[]> {
  if (!db) {
    const list = loadUrlsLocal();
    return list.filter(u => u.userId === userId);
  }
  try {
    const snap = await db.collection("urls").where("userId", "==", userId).get();
    const list: ShortUrl[] = [];
    snap.forEach((doc: any) => {
      list.push(doc.data() as ShortUrl);
    });
    return list;
  } catch (e) {
    console.error("Error loading user URLs from Firestore:", e);
    const list = loadUrlsLocal();
    return list.filter(u => u.userId === userId);
  }
}

async function countFirestoreUrlsSince(userId: string, sinceIso: string): Promise<number> {
  if (!db) {
    return loadUrlsLocal().filter(u => u.userId === userId && u.createdAt >= sinceIso).length;
  }
  try {
    const snap = await db.collection("urls")
      .where("userId", "==", userId)
      .where("createdAt", ">=", sinceIso)
      .get();
    return snap.size;
  } catch (e) {
    console.error("Error counting monthly URLs:", e);
    return loadUrlsLocal().filter(u => u.userId === userId && u.createdAt >= sinceIso).length;
  }
}

async function findFirestoreUrl(id: string): Promise<ShortUrl | null> {
  if (!db) {
    const list = loadUrlsLocal();
    return list.find(u => u.id.toLowerCase() === id.toLowerCase()) || null;
  }
  try {
    const snap = await db.collection("urls").doc(id).get();
    if (snap.exists) {
      return snap.data() as ShortUrl;
    }
  } catch (e) {
    console.error("Error finding URL by ID in Firestore:", e);
    const list = loadUrlsLocal();
    return list.find(u => u.id.toLowerCase() === id.toLowerCase()) || null;
  }
  return null;
}

async function findFirestoreUrlWithDomain(id: string, domain: string): Promise<ShortUrl | null> {
  if (!db) {
    const list = loadUrlsLocal();
    return list.find(u => u.id.toLowerCase() === id.toLowerCase() && u.customDomain?.toLowerCase() === domain.toLowerCase()) || null;
  }
  try {
    const snap = await db.collection("urls")
      .where("id", "==", id)
      .where("customDomain", "==", domain)
      .get();
    if (!snap.empty) {
      return snap.docs[0].data() as ShortUrl;
    }
  } catch (e) {
    console.error("Error finding URL by ID and domain in Firestore:", e);
    const list = loadUrlsLocal();
    return list.find(u => u.id.toLowerCase() === id.toLowerCase() && u.customDomain?.toLowerCase() === domain.toLowerCase()) || null;
  }
  return null;
}

async function saveFirestoreUrl(url: ShortUrl): Promise<void> {
  if (!db) {
    const list = loadUrlsLocal();
    const idx = list.findIndex(u => u.id === url.id);
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
    const idx = list.findIndex(u => u.id === url.id);
    if (idx !== -1) list[idx] = url;
    else list.push(url);
    saveUrlsLocal(list);
  }
}

async function deleteFirestoreUrl(id: string): Promise<boolean> {
  if (!db) {
    const list = loadUrlsLocal();
    const idx = list.findIndex(u => u.id === id);
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
    const idx = list.findIndex(u => u.id === id);
    if (idx !== -1) {
      list.splice(idx, 1);
      saveUrlsLocal(list);
      return true;
    }
    return false;
  }
}

async function getUniqueShortId(length = 4): Promise<string> {
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

// Helper to fetch page title
async function fetchPageTitle(url: string): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const abortId = setTimeout(() => controller.abort(), 2500); // 2.5 second timeout

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36"
      }
    });
    
    clearTimeout(abortId);
    if (!res.ok) return undefined;
    
    const htmlText = await res.text();
    const match = htmlText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (match && match[1]) {
      // Basic HTML Entity Decoding
      return match[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    }
  } catch (e) {
    // Fail silently if domain is unreachable or slow
  }
  return undefined;
}

// Express boilerplate
app.use(express.json());

// API: Sync Authenticated Firebase User with Firestore
app.post("/api/auth/sync", async (req, res) => {
  const { userId, email } = req.body;
  if (!userId || !email) {
    return res.status(400).json({ error: "userId and email are required to sync profile" });
  }

  try {
    let user = await getFirestoreUser(userId);
    if (!user) {
      // Create a brand new profile record in Firestore for this user
      user = {
        userId,
        email: normalizeEmail(email),
        apiTokens: [],
        createdAt: new Date().toISOString(),
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to synchronise profiles" });
  }
});

// API: Billing and entitlement status for the signed-in profile
app.get("/api/billing/status", async (req, res) => {
  const userId = req.query.userId as string;
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

// API: Start subscription upgrade. Configure STRIPE_PAYMENT_LINK in production.
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

// API: Register User (legacy endpoint fallback)
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
    const newUser: UserAccount = {
      userId,
      email: normalizeEmail(email),
      password,
      apiTokens: [],
      createdAt: new Date().toISOString(),
      plan: "free",
      subscriptionStatus: isFreeAccessEmail(email) ? "complimentary" : "free",
      freeAccess: isFreeAccessEmail(email)
    };

    await saveFirestoreUser(newUser);

    res.status(201).json({
      success: true,
      user: publicUser(newUser)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to register" });
  }
});

// API: Login User (legacy endpoint fallback)
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to login" });
  }
});

// API: Generate API Token
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
    
    // Max 5 tokens
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate token" });
  }
});

// API: Revoke API Token
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

    user.apiTokens = (user.apiTokens || []).filter(t => t !== token);
    await saveFirestoreUser(user);

    res.json({
      success: true,
      apiTokens: user.apiTokens
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to revoke token" });
  }
});

// API: Get user URLs
app.get("/api/urls", async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId query parameter" });
  }
  
  try {
    const userUrls = await getFirestoreUrls(userId);
    // Return sorted by creation date descending
    userUrls.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(userUrls);
  } catch (err: any) {
    res.status(500).json([]);
  }
});

// API: Shorten URL
app.post("/api/shorten", async (req, res) => {
  const { targetUrl, customAlias, userId, expiresAt, password, tags, campaign, customDomain } = req.body as ShortenRequest & {
    expiresAt?: string;
    password?: string;
    tags?: string[];
    campaign?: string;
    customDomain?: string;
  };
  
  if (!targetUrl) {
    return res.status(400).json({ error: "Original URL is required" });
  }

  try {
    // Authorize request (API token vs Guest local storage userId)
    let activeUserId = userId;
    let activeUser: UserAccount | null = null;
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
    const monthlyLimit = activeUser ? (paidAccess ? PLAN_LIMITS.pro : PLAN_LIMITS.free) : PLAN_LIMITS.guest;
    const monthlyUsage = await countFirestoreUrlsSince(activeUserId, monthStartIso());

    if (monthlyUsage >= monthlyLimit) {
      return res.status(402).json({
        error: activeUser
          ? `Monthly link limit reached (${monthlyLimit}). Upgrade to Pro or add this email to FREE_ACCESS_EMAILS.`
          : `Guest monthly link limit reached (${monthlyLimit}). Create an account to continue.`
      });
    }

    if (customAlias && !paidAccess) {
      return res.status(402).json({ error: "Custom aliases require a Pro subscription or complimentary access." });
    }

    // Basic URL prefix formatting
    let formattedUrl = targetUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = "https://" + formattedUrl;
    }

    // Basic validation of URL format
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
      
      // Check if alias is reserved or occupied
      const isReserved = ["api", "assets", "index.html", "static", "dist", "favicon.ico"].includes(aliasSane.toLowerCase());
      const isOccupied = await findFirestoreUrl(aliasSane);
      
      if (isReserved || isOccupied) {
        return res.status(400).json({ error: `Alias '${aliasSane}' is already in use. Try a different one!` });
      }
      
      finalId = aliasSane;
    } else {
      finalId = await getUniqueShortId();
    }

    // Fetch title in background but let's wait brief for UX
    const title = await fetchPageTitle(formattedUrl).catch(() => undefined);

    const newUrl: ShortUrl = {
      id: finalId,
      targetUrl: formattedUrl,
      title: title || formattedUrl.replace(/^https?:\/\/(www\.)?/, ""),
      clicks: 0,
      createdAt: new Date().toISOString(),
      userId: activeUserId,
      customAlias: !!customAlias,
      expiresAt: expiresAt || undefined,
      password: password || undefined,
      tags: tags || [],
      campaign: campaign || undefined,
      customDomain: customDomain || undefined,
      clicksHistory: []
    };

    await saveFirestoreUrl(newUrl);

    res.status(201).json(newUrl);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to shorten URL" });
  }
});

// API: Delete shortURL
app.delete("/api/urls/:id", async (req, res) => {
  const id = req.params.id;
  const userId = req.query.userId as string;

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
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete URL" });
  }
});

// API: Verify password for protected link
app.post("/api/urls/verify-password", async (req, res) => {
  const { id, password } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Link ID is required" });
  }
  try {
    const match = await findFirestoreUrl(id);
    if (!match) {
      return res.status(404).json({ error: "Short link not found" });
    }
    if (match.password && match.password === password) {
      return res.json({ success: true, targetUrl: match.targetUrl });
    }
    return res.status(401).json({ success: false, error: "Incorrect password" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to verify password" });
  }
});

// API: Update shortURL parameters (editing destination URL, settings, password, expiration, etc.)
app.patch("/api/urls/:id", async (req, res) => {
  const id = req.params.id;
  const { userId, targetUrl, expiresAt, password, tags, campaign, customDomain } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId is strictly required" });
  }

  try {
    const match = await findFirestoreUrl(id);
    if (!match || match.userId !== userId) {
      return res.status(404).json({ error: "Shortened link not found or unauthorized to edit" });
    }

    if (targetUrl) {
      let formattedUrl = targetUrl.trim();
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = "https://" + formattedUrl;
      }
      try {
        new URL(formattedUrl);
        match.targetUrl = formattedUrl;
        // Refresh title if destination changed
        const title = await fetchPageTitle(formattedUrl).catch(() => undefined);
        if (title) {
          match.title = title;
        }
      } catch (_) {
        return res.status(400).json({ error: "Please enter a valid active URL structure" });
      }
    }

    if (expiresAt !== undefined) {
      match.expiresAt = expiresAt || undefined;
    }
    if (password !== undefined) {
      match.password = password || undefined;
    }
    if (tags !== undefined) {
      match.tags = tags || [];
    }
    if (campaign !== undefined) {
      match.campaign = campaign || undefined;
    }
    if (customDomain !== undefined) {
      match.customDomain = customDomain || undefined;
    }

    await saveFirestoreUrl(match);
    res.json(match);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update URL" });
  }
});

// ROOT GATEWAY: Handle custom domain root visits
app.get("/", async (req, res, next) => {
  const hostname = req.hostname.toLowerCase();
  const defaultDomains = ["localhost", "127.0.0.1", "minilinks.onrender.com"];
  const appBaseDomain = APP_BASE_URL.replace(/^https?:\/\//i, "").split(":")[0].toLowerCase();
  
  const isCustomDomain = !defaultDomains.includes(hostname) && hostname !== appBaseDomain;
  if (isCustomDomain) {
    // Redirect custom domain root to the main SaaS landing page
    return res.redirect(302, APP_BASE_URL);
  }
  next();
});

// REDIRECTS GATEWAY: Handle shortened paths
app.get("/:shortId", async (req, res, next) => {
  const shortId = req.params.shortId;

  // Let assets, index.html, routing, and reserved SPA routes pass to Vite
  if (
    shortId.startsWith("api") || 
    shortId.includes(".") || 
    shortId === "index.html" ||
    RESERVED_PATHS.includes(shortId.toLowerCase())
  ) {
    return next();
  }

  try {
    const hostname = req.hostname.toLowerCase();
    const defaultDomains = ["localhost", "127.0.0.1", "minilinks.onrender.com"];
    const appBaseDomain = APP_BASE_URL.replace(/^https?:\/\//i, "").split(":")[0].toLowerCase();
    
    const isCustomDomain = !defaultDomains.includes(hostname) && hostname !== appBaseDomain;
    
    let match: ShortUrl | null = null;
    if (isCustomDomain) {
      match = await findFirestoreUrlWithDomain(shortId, hostname);
    } else {
      match = await findFirestoreUrl(shortId);
    }

    if (match) {
      // 1. Check Expiration
      if (match.expiresAt && new Date() > new Date(match.expiresAt)) {
        return res.redirect(302, `${APP_BASE_URL}/?error=expired&id=${encodeURIComponent(shortId)}`);
      }

      // 2. Check Password Protection
      if (match.password) {
        // Redirect to client-side password verification route
        return res.redirect(302, `${APP_BASE_URL}/p/${match.id}`);
      }

      // 3. Record click and increment clicks count
      match.clicks = (match.clicks || 0) + 1;

      // Extract User Agent metrics
      const userAgent = req.headers["user-agent"] || "";
      const referer = req.headers["referer"];
      
      const clickBrowser = parseBrowser(userAgent);
      const clickDevice = parseDevice(userAgent);
      const clickReferrer = parseReferrer(referer);
      
      // Geographic country lookup: check hosting provider headers, fallback to mock/US
      let clickCountry = (req.headers["cf-ipcountry"] || req.headers["x-appengine-country"] || "US") as string;
      if (clickCountry === "XX" || clickCountry === "Unknown") {
        clickCountry = "US";
      }

      // Generate a mock country list for local development metrics diversity
      if (process.env.NODE_ENV !== "production" && (!req.headers["cf-ipcountry"] && !req.headers["x-appengine-country"])) {
        const mockCountries = ["US", "GB", "DE", "IN", "CA", "FR", "AU", "JP"];
        clickCountry = mockCountries[Math.floor(Math.random() * mockCountries.length)];
      }

      const clickRecord = {
        timestamp: new Date().toISOString(),
        referrer: clickReferrer,
        browser: clickBrowser,
        device: clickDevice,
        country: clickCountry
      };

      match.clicksHistory = match.clicksHistory || [];
      match.clicksHistory.push(clickRecord);

      // Bound click history length to avoid database document size exhaustion
      if (match.clicksHistory.length > 1000) {
        match.clicksHistory.shift();
      }

      await saveFirestoreUrl(match);
      return res.redirect(302, match.targetUrl);
    }
  } catch (err) {
    console.error("Redirection failure:", err);
  }

  // Not found, redirect back to home page with state
  return res.redirect(302, `${APP_BASE_URL}/?error=not-found&id=${encodeURIComponent(shortId)}`);
});


// Integrate Vite Dev Server in dev mode, serve dist in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // SPA Fallback
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server launched on port ${PORT}`);
  });
}

startServer();
