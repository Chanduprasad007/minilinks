import React, { useState, useEffect, FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Link2, 
  Sparkles, 
  RotateCw, 
  AlertCircle, 
  ArrowRight, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Info,
  Check,
  Copy,
  Plus,
  Compass,
  Key,
  FileSpreadsheet,
  CheckCircle,
  Menu,
  Grid,
  LogOut,
  LogIn,
  Terminal,
  ShieldCheck,
  DollarSign,
  Github,
  Code,
  Trash2,
  Lock,
  Mail,
  UserPlus,
  ExternalLink,
  BookOpen,
  Download
} from "lucide-react";
import { ShortUrl, UserAccount } from "./types";
import LinkCard from "./components/LinkCard";
import StatsDashboard from "./components/StatsDashboard";
import QRModal from "./components/QRModal";
import { 
  auth, 
  googleProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  signInWithPopup 
} from "./firebase";


// Local storage helpers
const USER_ID_KEY = "minilinks_user_tracker_id";
const PUBLIC_SHORT_DOMAIN = "minilinks.onrender.com";
const publicShortUrl = (id: string) => `https://${PUBLIC_SHORT_DOMAIN}/${id}`;
const displayShortUrl = (id: string) => `${PUBLIC_SHORT_DOMAIN}/${id}`;
type PublicUser = Pick<UserAccount, "userId" | "email" | "apiTokens" | "subscriptionStatus" | "plan" | "freeAccess">;

function getOrCreateUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = "usr_" + Math.random().toString(36).substring(2, 11);
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export default function App() {
  const [user, setUser] = useState<PublicUser | null>(() => {
    const saved = localStorage.getItem("minilinks_authenticated_user");
    return saved ? { apiTokens: [], ...JSON.parse(saved) } : null;
  });
  
  const [userId, setUserId] = useState<string>(() => {
    const saved = localStorage.getItem("minilinks_authenticated_user");
    if (saved) {
      return JSON.parse(saved).userId;
    }
    return getOrCreateUserId();
  });

  const [urls, setUrls] = useState<ShortUrl[]>([]);
  const [targetUrl, setTargetUrl] = useState("");
  const [customAlias, setCustomAlias] = useState("");
  
  // Status states
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "error" | "info" } | null>(null);
  
  // Dynamic Option Triggers
  const [showAliasInput, setShowAliasInput] = useState(false);
  const [headlineExpanded, setHeadlineExpanded] = useState(false);
  const [newlyCreatedUrl, setNewlyCreatedUrl] = useState<ShortUrl | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Authentication configuration
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Core navigation tabs
  const [activeTab, setActiveTab] = useState<"workspace" | "api" | "sheets" | "account" | "guide">("workspace");
  const [billingStatus, setBillingStatus] = useState<{
    subscriptionStatus: UserAccount["subscriptionStatus"];
    plan: UserAccount["plan"];
    freeAccess?: boolean;
    monthlyUsage: number;
    monthlyLimit: number;
    checkoutAvailable: boolean;
    portalAvailable: boolean;
  } | null>(null);
  const [isBillingLoading, setIsBillingLoading] = useState(false);

  // Sheet CSV / bulk uploader states
  const [bulkUrlInput, setBulkUrlInput] = useState("");
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<{ original: string; short: string; testLink: string }[]>([]);

  // QR Code viewer state
  const [qrModal, setQrModal] = useState({
    isOpen: false,
    shortUrl: "",
    title: ""
  });

  // Load target error redirects (e.g. from server redirects)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    const idParam = params.get("id");

    if (errorParam === "not-found" && idParam) {
      setToastMessage({
        text: `Redirection Error: The short code "/${idParam}" does not exist or has expired.`,
        type: "error"
      });
      // Strip error parameters from user's address bar safely
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Fetch URL history list on initialization
  const fetchUrlHistory = async (silently = false) => {
    if (!silently) setIsFetchingHistory(true);
    try {
      const response = await fetch(`/api/urls?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setUrls(data);
      }
    } catch (e) {
      console.error("Failed to fetch link manager history", e);
    } finally {
      setIsFetchingHistory(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUrlHistory();
  }, [userId]);

  const fetchBillingStatus = async () => {
    if (!user) {
      setBillingStatus(null);
      return;
    }

    try {
      const response = await fetch(`/api/billing/status?userId=${user.userId}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load billing status");
      }
      setBillingStatus(data);
      const updatedUser = {
        ...user,
        subscriptionStatus: data.subscriptionStatus,
        plan: data.plan,
        freeAccess: data.freeAccess
      };
      setUser(updatedUser);
      localStorage.setItem("minilinks_authenticated_user", JSON.stringify(updatedUser));
    } catch (err) {
      console.error("Failed to fetch billing status", err);
    }
  };

  useEffect(() => {
    fetchBillingStatus();
  }, [user?.userId]);

  const hasProAccess = Boolean(
    user?.subscriptionStatus === "active" ||
    user?.subscriptionStatus === "complimentary" ||
    user?.freeAccess
  );

  const handleStartCheckout = async () => {
    if (!user) {
      setShowAuthForm(true);
      return;
    }

    setIsBillingLoading(true);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Checkout is not available yet");
      }
      window.location.href = data.url;
    } catch (err: any) {
      setToastMessage({ text: err.message || "Unable to start checkout", type: "error" });
    } finally {
      setIsBillingLoading(false);
    }
  };

  // Handle URL shortening form submissions
  const handleShortenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);
    setNewlyCreatedUrl(null);

    let cleanUrl = targetUrl.trim();
    if (!cleanUrl) {
      setErrorText("Please provide an active target URL to shorten");
      return;
    }

    if (customAlias.trim() && !hasProAccess) {
      setErrorText("Custom aliases require a Pro subscription or complimentary access.");
      return;
    }

    setIsSubmitLoading(true);

    try {
      const response = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: cleanUrl,
          customAlias: customAlias.trim() || undefined,
          userId
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to shorten URL");
      }

      // Success! Update newly created state to highlight, then clear inputs
      setNewlyCreatedUrl(result);
      setTargetUrl("");
      setCustomAlias("");
      setShowAliasInput(false);
      
      // Update our database list history
      fetchUrlHistory(true);
      fetchBillingStatus();
    } catch (err: any) {
      setErrorText(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  // Perform a full refresh of click analytics counts
  const handleRefreshMetrics = async () => {
    setIsRefreshing(true);
    await fetchUrlHistory(true);
  };

  // Auth: Log In / Sign Up handler using direct Firebase Client SDK
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthLoading(true);

    try {
      let firebaseUser;
      if (isRegisterMode) {
        // Create user with Email + Password via Firebase Auth on Client
        const credential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        firebaseUser = credential.user;
      } else {
        // Sign in with Email + Password via Firebase Auth on Client
        const credential = await signInWithEmailAndPassword(auth, authEmail, authPassword);
        firebaseUser = credential.user;
      }

      if (!firebaseUser || !firebaseUser.email) {
        throw new Error("Unable to retrieve Firebase user profile information");
      }

      // Automatically sync this authenticated Firebase credential with Firestore backend profile
      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: firebaseUser.uid, 
          email: firebaseUser.email 
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to sync profiles with Firestore database");
      }

      // Set user state
      const authenticatedUser = data.user;
      setUser(authenticatedUser);
      localStorage.setItem("minilinks_authenticated_user", JSON.stringify(authenticatedUser));
      setUserId(authenticatedUser.userId);
      
      setToastMessage({
        text: isRegisterMode ? "Account created and synced successfully!" : "Logged in successfully!",
        type: "info"
      });

      // Clear states
      setAuthEmail("");
      setAuthPassword("");
      setShowAuthForm(false);
    } catch (err: any) {
      // Improve readability of common Firebase errors
      let errMsg = err.message || "An unexpected error occurred";
      if (err.code === "auth/email-already-in-use") {
        errMsg = "An account with this email address already exists in Firebase Auth.";
      } else if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        errMsg = "Invalid email or incorrect password. Please test again.";
      } else if (err.code === "auth/weak-password") {
        errMsg = "Weak password. Password should be at least 6 characters.";
      } else if (err.code === "auth/invalid-email") {
        errMsg = "Please provide a valid structured email address.";
      }
      setAuthError(errMsg);
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Auth: Google Sign-id Authentication with single-popups
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setIsAuthLoading(true);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const firebaseUser = credential.user;

      if (!firebaseUser || !firebaseUser.email) {
        throw new Error("Google account doesn't expose a validated email address.");
      }

      // Sync active credential profile on Server side
      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: firebaseUser.uid, 
          email: firebaseUser.email 
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to synchronize profile records!");
      }

      const authenticatedUser = data.user;
      setUser(authenticatedUser);
      localStorage.setItem("minilinks_authenticated_user", JSON.stringify(authenticatedUser));
      setUserId(authenticatedUser.userId);

      setToastMessage({
        text: "Authenticated with Google successfully!",
        type: "info"
      });
      setShowAuthForm(false);
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") {
        setAuthError(err.message || "Google Sign-In failed or request was interrupted.");
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Auth: Logout handler using Firebase client signOut
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Firebase SignOut triggered an error:", e);
    }
    setUser(null);
    localStorage.removeItem("minilinks_authenticated_user");
    // Re-verify/fallback to local guest ID
    const guestId = getOrCreateUserId();
    setUserId(guestId);
    setToastMessage({ text: "Signed out of your account", type: "info" });
    setActiveTab("workspace");
  };

  // Auth: Generate API Token
  const handleGenerateDevApiToken = async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/auth/tokens/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate token");
      }

      const updatedUser = { ...user, apiTokens: data.apiTokens };
      setUser(updatedUser);
      localStorage.setItem("minilinks_authenticated_user", JSON.stringify(updatedUser));
      setToastMessage({ text: "Generated new Developer API Token successfully!", type: "info" });
      fetchBillingStatus();
    } catch (err: any) {
      setToastMessage({ text: err.message || "Could not generate API token", type: "error" });
    }
  };

  // Auth: Revoke Developer API Token
  const handleRevokeDevApiToken = async (tokenToRevoke: string) => {
    if (!user) return;
    try {
      const response = await fetch("/api/auth/tokens/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, token: tokenToRevoke })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to revoke token");
      }

      const updatedUser = { ...user, apiTokens: data.apiTokens };
      setUser(updatedUser);
      localStorage.setItem("minilinks_authenticated_user", JSON.stringify(updatedUser));
      setToastMessage({ text: "Revoked Developer API Token successfully", type: "info" });
    } catch (err: any) {
      setToastMessage({ text: err.message || "Could not revoke API token", type: "error" });
    }
  };

  // Bulk Sheets / CSV Shortener handler
  const handleBulkShortenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkUrlInput.trim()) {
      setToastMessage({ text: "Please enter at least one URL to batch shorten", type: "error" });
      return;
    }

    setIsBulkLoading(true);
    setBulkResults([]);

    const rawUrls = bulkUrlInput
      .split(/[\n,;]/)
      .map(u => u.trim())
      .filter(u => u.length > 0);

    const processed: typeof bulkResults = [];

    // Process sequentially or concurrently up to minor limit
    for (const url of rawUrls) {
      try {
        const response = await fetch("/api/shorten", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUrl: url, userId })
        });
        const result = await response.json();
        if (response.ok && result.id) {
          processed.push({
            original: url,
            short: displayShortUrl(result.id),
            testLink: `/${result.id}`
          });
        } else {
          processed.push({
            original: url,
            short: "Error: " + (result.error || "Failed"),
            testLink: "#"
          });
        }
      } catch (err) {
        processed.push({
          original: url,
          short: "Error: Connection failed",
          testLink: "#"
        });
      }
    }

    setBulkResults(processed);
    setIsBulkLoading(false);
    setBulkUrlInput("");
    setToastMessage({ text: `Successfully processed ${processed.length} URLs!`, type: "info" });
    fetchUrlHistory(true);
    fetchBillingStatus();
  };

  // Download Bulk processed shortened URLs as CSV file
  const downloadBulkResultsCsv = () => {
    if (bulkResults.length === 0) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Original URL,Shortened URL (Branded),Real Sandbox link\n";
    
    bulkResults.forEach(r => {
      // Escape commas and quotes basic configuration
      const origSane = `"${r.original.replace(/"/g, '""')}"`;
      const shortSane = `"${r.short.replace(/"/g, '""')}"`;
      const hostParam = window.location.origin;
      const realSane = `"${hostParam}${r.testLink}"`;
      csvContent += `${origSane},${shortSane},${realSane}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "minilinks_bulk_processed.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  // Handle individual Link deletions
  const handleDeleteLink = async (id: string) => {
    try {
      const response = await fetch(`/api/urls/${id}?userId=${userId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        setUrls(prev => prev.filter(u => u.id !== id));
        if (newlyCreatedUrl?.id === id) {
          setNewlyCreatedUrl(null);
        }
      } else {
        const data = await response.json();
        setToastMessage({ text: data.error || "Failed to delete link", type: "error" });
      }
    } catch (e) {
      setToastMessage({ text: "Network connection is offline", type: "error" });
    }
  };

  // Show dynamic QR code modal
  const handleShowQR = (shortUrl: string, title: string) => {
    setQrModal({
      isOpen: true,
      shortUrl,
      title
    });
  };

  const handleCopyNewLink = (id: string) => {
    const fullLink = publicShortUrl(id);
    navigator.clipboard.writeText(fullLink);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
  };

  return (
    <div className="min-h-screen spatial-bg text-[#1E293B] flex flex-col font-sans">
      {/* Dynamic Toast Alert Banner */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed top-5 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 z-50 max-w-md w-full bg-slate-900 shadow-sm rounded-lg p-4 text-white border border-slate-800 flex items-start gap-3"
          >
            <AlertCircle className={`w-5 h-5 shrink-0 ${toastMessage.type === "error" ? "text-rose-400" : "text-amber-400"}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                {toastMessage.type === "error" ? "System Notification" : "Minilinks"}
              </p>
              <p className="text-sm mt-0.5 leading-relaxed text-neutral-200">{toastMessage.text}</p>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-slate-400 hover:text-white transition-colors text-xs font-bold px-2 py-1 bg-slate-800 hover:bg-slate-700 gap-1 rounded-md cursor-pointer"
              id="toast-dismiss-btn"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Structural Navbar Header Section */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur sticky top-0 z-40 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-slate-950 rounded-lg flex items-center justify-center text-white font-mono font-bold text-base shadow-xs">
              M
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-slate-900 tracking-tight leading-none">
                Minilinks
              </h1>
              <span className="text-[10px] font-medium text-slate-400 tracking-wider font-mono">
                Link management
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Account controls */}
            {user ? (
              <div className="flex items-center gap-2">
                <div className="hidden md:flex flex-col items-end mr-1 text-right">
                  <span className="text-xs font-bold text-slate-900">{user.email}</span>
                  <span className="text-[9px] font-mono font-semibold text-emerald-600 uppercase tracking-widest bg-emerald-50 inline-block px-1.5 py-0.5 rounded-sm border border-emerald-100 mt-0.5">
                    {hasProAccess ? "Pro Access" : "Free Account"}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 border border-slate-200 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Sign out of your session"
                  id="header-logout-btn"
                >
                  <LogOut className="w-3.8 h-3.8" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowAuthForm(true);
                  setAuthError(null);
                }}
                className="px-4.5 py-2 bg-slate-950 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                id="header-login-btn"
              >
                <LogIn className="w-3.8 h-3.8" />
                <span>Sign in</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Controls Navigation bar */}
        <div className="bg-white/60 border-t border-slate-200/80">
          <div className="max-w-6xl mx-auto px-4 md:px-6 flex overflow-x-auto gap-1 py-1 text-sm scrollbar-none">
            <button
              onClick={() => setActiveTab("workspace")}
              className={`px-4 py-2.5 font-semibold text-xs rounded-md transition-colors whitespace-nowrap flex items-center gap-2 cursor-pointer border-b-2 py-2 mt-0.2 ${
                activeTab === "workspace"
                  ? "border-slate-900 text-slate-900 font-bold bg-white shadow-3xs"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Links</span>
            </button>
            <button
              onClick={() => setActiveTab("api")}
              className={`px-4 py-2.5 font-semibold text-xs rounded-md transition-colors whitespace-nowrap flex items-center gap-2 cursor-pointer border-b-2 py-2 mt-0.2 ${
                activeTab === "api"
                  ? "border-slate-900 text-slate-900 font-bold bg-white shadow-3xs"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>API</span>
            </button>
            <button
              onClick={() => setActiveTab("sheets")}
              className={`px-4 py-2.5 font-semibold text-xs rounded-md transition-colors whitespace-nowrap flex items-center gap-2 cursor-pointer border-b-2 py-2 mt-0.2 ${
                activeTab === "sheets"
                  ? "border-slate-900 text-slate-900 font-bold bg-white shadow-3xs"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Bulk tools</span>
            </button>
            <button
              onClick={() => setActiveTab("account")}
              className={`px-4 py-2.5 font-semibold text-xs rounded-md transition-colors whitespace-nowrap flex items-center gap-2 cursor-pointer border-b-2 py-2 mt-0.2 ${
                activeTab === "account"
                  ? "border-slate-900 text-slate-900 font-bold bg-white shadow-3xs"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Billing</span>
            </button>
            <button
              onClick={() => setActiveTab("guide")}
              className={`px-4 py-2.5 font-semibold text-xs rounded-md transition-colors whitespace-nowrap flex items-center gap-2 cursor-pointer border-b-2 py-2 mt-0.2 ${
                activeTab === "guide"
                  ? "border-slate-900 text-slate-900 font-bold bg-white shadow-3xs"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Deploy</span>
            </button>
          </div>
        </div>
      </header>

      {/* Guest Mode alert helper */}
      {!user && activeTab === "workspace" && (
        <div className="bg-amber-50/75 border-b border-amber-100 py-2.5">
          <div className="max-w-6xl mx-auto px-4 md:px-6 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 text-amber-800">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse relative inline-block shrink-0" />
              <p className="font-medium">
                You are using a <strong>guest session</strong>. Sign in to save links, use API keys, and unlock bulk tools.
              </p>
            </div>
            <button
              onClick={() => {
                setShowAuthForm(true);
                setIsRegisterMode(true);
                setAuthError(null);
              }}
              className="text-[10px] font-bold text-amber-900 hover:text-white bg-amber-200/80 hover:bg-amber-600 border border-amber-300 rounded px-2.5 py-1 transition-all cursor-pointer"
            >
              Create account
            </button>
          </div>
        </div>
      )}

      {/* Sliding Auth Slide login view */}
      <AnimatePresence>
        {showAuthForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-slate-900 border-b border-slate-800 text-white overflow-hidden"
          >
            <div className="max-w-md mx-auto px-6 py-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold flex items-center gap-2 font-display">
                  {isRegisterMode ? <UserPlus className="w-5 h-5 text-slate-300" /> : <Lock className="w-5 h-5 text-slate-300" />}
                  <span>{isRegisterMode ? "Create account" : "Welcome back"}</span>
                </h3>
                <button
                  onClick={() => setShowAuthForm(false)}
                  className="text-slate-400 hover:text-white text-xs cursor-pointer bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      required
                      placeholder="you@domain.com"
                      value={authEmail}
                      onChange={e => setAuthEmail(e.target.value)}
                      className="w-full bg-slate-850 pl-10 pr-4 py-2 border border-slate-700 rounded-lg text-sm text-white focus:outline-hidden focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={authPassword}
                      onChange={e => setAuthPassword(e.target.value)}
                      className="w-full bg-slate-850 pl-10 pr-4 py-2 border border-slate-700 rounded-lg text-sm text-white focus:outline-hidden focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                {authError && (
                  <div className="p-3 bg-rose-950/50 border border-rose-800 text-rose-300 rounded-lg text-xs font-semibold">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full bg-indigo-600 hover:bg-slate-1000 text-white font-bold py-2.5 rounded-lg text-sm shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isAuthLoading ? (
                    <RotateCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>{isRegisterMode ? "Create account" : "Sign in"}</span>
                  )}
                </button>
              </form>

              {/* Google OAuth & Social SSO Sign In */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-slate-800"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-900 px-2.5 text-slate-400 font-mono tracking-widest text-[9px]">Google sign in</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isAuthLoading}
                className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-2 rounded-lg text-sm shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01]"
              >
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Sign in with Google</span>
              </button>

              <div className="mt-4 pt-4 border-t border-slate-800 text-center">
                <button
                  onClick={() => setIsRegisterMode(!isRegisterMode)}
                  className="text-xs text-slate-300 hover:underline cursor-pointer"
                >
                  {isRegisterMode ? "Already have an account? Sign in" : "Need an account? Sign up"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Container Layout */}
      <main className="max-w-4xl w-full mx-auto px-4 md:px-6 pt-8 pb-16 flex-1 flex flex-col gap-6">
        
        {/* TAB 1: WORKSPACE */}
        {activeTab === "workspace" && (
          <>
            {/* Core Shortening Action Hub Card */}
            <section className="spatial-panel rounded-lg p-6 md:p-8 relative overflow-hidden">
              {/* Subtle top brand accent line */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-slate-900" />
              
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold font-display text-gray-900 tracking-tight">
                  Shorten links
                </h2>
                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                  Create clean links, track clicks, and manage everything from one workspace.
                </p>
              </div>

              <form onSubmit={handleShortenSubmit} className="space-y-4">
                {/* Long target URL Input Area */}
                <div>
                  <label htmlFor="target-url" className="text-xs font-bold uppercase tracking-wider text-neutral-500 block mb-1.5">
                    Destination URL
                  </label>
                  <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-gray-400">
                        <Link2 className="w-5 h-5" />
                      </div>
                      <input
                        id="target-url"
                        type="text"
                        required
                        placeholder="example.com/some/complex-deep/link-or-tracking-parameters"
                        value={targetUrl}
                        onChange={(e) => setTargetUrl(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-[#fcfdfe] hover:bg-white focus:bg-white border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-hidden text-slate-800 rounded-lg font-medium text-sm transition-all shadow-2xs"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitLoading || !targetUrl.trim()}
                      className="py-3.5 px-6 bg-slate-950 hover:bg-slate-800 focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 text-white font-semibold text-sm rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer border-t border-white/5 shadow-sm"
                      id="shorten-submit-btn"
                    >
                      {isSubmitLoading ? (
                        <>
                          <RotateCw className="w-4 h-4 animate-spin" />
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <span>Shorten</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Expander Trigger for Custom Alias settings */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAliasInput(!showAliasInput)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 select-none cursor-pointer transition-colors"
                    id="toggle-alias-btn"
                  >
                    <span>Custom alias</span>
                    {showAliasInput ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  <AnimatePresence>
                    {showAliasInput && (
                      <motion.div
                        initial={{ height: 0, opacity: 0, marginTop: 0 }}
                        animate={{ height: "auto", opacity: 1, marginTop: 12 }}
                        exit={{ height: 0, opacity: 0, marginTop: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="bg-neutral-50/70 border border-neutral-150 p-4 rounded-lg flex flex-col md:flex-row gap-3 items-stretch md:items-end">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <label htmlFor="custom-alias" className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">
                                Alias
                              </label>
                              <span className="text-[9px] text-gray-400 font-mono">No spaces allowed</span>
                            </div>
                            
                            <div className="relative flex items-center">
                              <span className="bg-white border-y border-l border-slate-200 text-xs font-mono text-slate-500 px-3 py-3.5 rounded-l-lg select-none shrink-0 text-ellipsis overflow-hidden max-w-[150px] sm:max-w-xs">
                                {window.location.host}/
                              </span>
                              <input
                                id="custom-alias"
                                type="text"
                                placeholder={hasProAccess ? "my-cool-blog" : "Pro feature"}
                                value={customAlias}
                                onChange={(e) => setCustomAlias(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, ""))}
                                disabled={!hasProAccess}
                                className="flex-1 px-3 py-3.5 bg-white border-y border-r border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-hidden text-sm font-semibold rounded-r-lg text-slate-800 transition-colors"
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2 p-1.5 text-xs text-slate-400">
                            <Info className="w-4 h-4 text-slate-700 shrink-0" />
                            <p className="leading-snug">
                              {hasProAccess ? "Use letters, numbers, dashes, or underscores." : "Upgrade or add your email to the free-access list to use aliases."}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Quick alert notifications */}
                {errorText && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3.5 bg-rose-50 border border-rose-100 rounded-lg text-rose-800 text-sm flex items-center gap-2.5 shadow-2xs"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
                    <span className="font-medium">{errorText}</span>
                  </motion.div>
                )}
              </form>

              {/* Newly created Link highlight container */}
              <AnimatePresence>
                {newlyCreatedUrl && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 10 }}
                    className="mt-6 border border-emerald-150 bg-emerald-50/15 p-5 rounded-lg block relative"
                  >
                    <span className="absolute top-4 right-4 bg-emerald-100/80 text-emerald-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase inline-flex items-center gap-1 border border-emerald-200">
                      <Sparkles className="w-3 h-3" /> Created
                    </span>

                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-2">
                      New link
                    </h3>
                    
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <div className="flex-1 bg-white border border-slate-200 rounded-lg p-3.5 flex items-center justify-between shadow-2xs gap-3">
                        <div className="flex flex-col min-w-0">
                          <span className="font-mono text-base font-bold text-slate-900 select-all overflow-hidden text-ellipsis whitespace-nowrap">
                            {displayShortUrl(newlyCreatedUrl.id)}
                          </span>
                          <a
                            href={publicShortUrl(newlyCreatedUrl.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-slate-900 hover:underline font-semibold mt-1 self-start inline-flex items-center gap-0.5"
                          >
                            Test link
                          </a>
                        </div>
                        
                        <button
                          onClick={() => handleCopyNewLink(newlyCreatedUrl.id)}
                          className="flex items-center justify-center h-10 px-4 rounded-lg bg-slate-950 hover:bg-slate-800 text-white font-semibold text-xs transition-colors shrink-0 cursor-pointer gap-1.5"
                          id="copy-new-link-btn"
                        >
                          {copiedSuccess ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.8 h-3.8" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>
                      </div>

                      <button
                        onClick={() => handleShowQR(
                          publicShortUrl(newlyCreatedUrl.id),
                          newlyCreatedUrl.title || newlyCreatedUrl.targetUrl
                        )}
                        className="py-3 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
                        id="show-qr-new-link-btn"
                      >
                        <Compass className="w-4 h-4" />
                        <span>View QR Code</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* Real-time Statistics Section */}
            <section>
              <StatsDashboard urls={urls} />
            </section>

            {/* History / link list panel */}
            <section className="spatial-panel rounded-lg p-6 md:p-8">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100 flex-wrap gap-3">
                <div>
                  <h3 className="text-lg font-bold font-display text-slate-900 tracking-tight flex items-center gap-2">
                    Your links
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Manage links and click counts.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefreshMetrics}
                    disabled={isRefreshing}
                    className="p-2 text-xs border border-slate-200 hover:bg-slate-50 bg-white font-semibold text-slate-600 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
                    Refresh Stats
                  </button>
                  <div className="text-[10px] bg-slate-50 text-slate-500 font-mono px-3 py-1.5 rounded-lg border border-slate-150">
                    ID: {userId}
                  </div>
                </div>
              </div>

              <AnimatePresence mode="popLayout">
                {isFetchingHistory ? (
                  /* Loading Skeletons */
                  <div className="space-y-3 py-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-24 bg-slate-50 rounded-lg border border-slate-100 animate-pulse flex items-center justify-between px-6">
                        <div className="space-y-2 flex-1">
                          <div className="h-4 bg-slate-200 rounded-sm w-1/3" />
                          <div className="h-3 bg-slate-200 rounded-sm w-2/3" />
                          <div className="h-2 bg-slate-200 rounded-sm w-1/2" />
                        </div>
                        <div className="h-8 bg-slate-200 rounded-lg w-20 ml-4 shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : urls.length === 0 ? (
                  /* Empty slate content state guidance */
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-12 px-6 text-center border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center max-w-md mx-auto"
                  >
                    <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 mb-4 border border-slate-100">
                      <Plus className="w-6 h-6" />
                    </div>
                    <h4 className="font-semibold text-slate-900">No links yet</h4>
                    <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed">
                      Create your first short link above.
                    </p>
                  </motion.div>
                ) : (
                  /* List containing active interactive tiles */
                  <div className="space-y-4">
                    {urls.map((link) => (
                      <LinkCard
                        key={link.id}
                        url={link}
                        onDelete={handleDeleteLink}
                        onShowQR={handleShowQR}
                      />
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </section>
          </>
        )}

        {/* TAB 2: DEVELOPER API HUB */}
        {activeTab === "api" && (
          <div className="space-y-6">
            <section className="spatial-panel rounded-lg p-6 md:p-8">
              <div className="border-b border-slate-100 pb-5 mb-5">
                <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-bold tracking-widest uppercase rounded-full">API</span>
                <h2 className="text-xl font-bold font-display text-slate-900 mt-2">API tokens</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Create API tokens for scripts, automations, and external tools.
                </p>
              </div>

              {!user ? (
                <div className="p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200 max-w-md mx-auto">
                  <Key className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                  <h4 className="font-bold text-slate-900">API Access Locked</h4>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    Account authentication is required to generate API tokens. Sign up or log in to secure your API access rules.
                  </p>
                  <button
                    onClick={() => {
                      setShowAuthForm(true);
                      setAuthError(null);
                    }}
                    className="mt-4 px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    Sign In or Create Account
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3.5">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Active API Keys ({user.apiTokens.length}/5)</h3>
                      <button
                        onClick={handleGenerateDevApiToken}
                        disabled={user.apiTokens.length >= 5 || !hasProAccess}
                        className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1 border-t border-white/5 active:scale-98"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Generate Key</span>
                      </button>
                    </div>

                    {!hasProAccess && (
                      <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800 flex items-center justify-between gap-3">
                        <span className="font-medium">API tokens are available on Pro or complimentary accounts.</span>
                        <button
                          onClick={handleStartCheckout}
                          disabled={isBillingLoading}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-bold shrink-0"
                        >
                          Upgrade
                        </button>
                      </div>
                    )}

                    {user.apiTokens.length === 0 ? (
                      <div className="p-6 text-center bg-slate-50 border border-slate-100 rounded-lg text-slate-500 text-xs text-center font-medium leading-relaxed">
                        No API Keys generated yet. Click "Generate Key" to create your first credential token.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {user.apiTokens.map((tok, idx) => (
                          <div key={idx} className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-3.5 justify-between gap-4 shadow-3xs">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900 font-mono text-xs font-bold shrink-0">
                                #{idx + 1}
                              </div>
                              <div className="min-w-0">
                                <p className="font-mono text-xs font-bold text-slate-800 select-all overflow-hidden text-ellipsis whitespace-nowrap">
                                  {tok}
                                </p>
                                <p className="text-[10px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wide">Server credential</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2shrink-0">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(tok);
                                  setToastMessage({ text: "Key copied! Protect your secrets.", type: "info" });
                                }}
                                className="p-2 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
                                title="Copy Key"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleRevokeDevApiToken(tok)}
                                className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="Revoke Key"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* REST Endpoint details */}
                  <div className="bg-slate-900 rounded-lg p-5 md:p-6 text-slate-200 border border-slate-850">
                    <h3 className="text-sm font-bold text-white mb-2 font-display flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-emerald-400" /> Endpoint Documentation
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">
                      Make a secure HTTP POST request containing your Bearer API token and standard parameters to shorten links automatically.
                    </p>

                    <div className="mb-4">
                      <div className="flex items-center gap-2 text-xs font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <span className="bg-indigo-600 text-white font-bold px-1.5 py-0.5 rounded text-[10px]">POST</span>
                        <span className="text-slate-300">/api/shorten</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <span className="text-[11px] font-bold text-indigo-300">Authorization Header</span>
                        <p className="text-[10px] text-slate-400">Include: <code className="text-slate-300 bg-slate-950 px-1 py-0.5 rounded text-xs select-all">Authorization: Bearer YOUR_TOKEN</code></p>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold text-indigo-300">Request Body Parameters (JSON)</span>
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-400 mt-1">
                          <p><span className="text-slate-300">"targetUrl"</span>: <span className="text-emerald-400">"https://example.com/long-page"</span> <span className="text-slate-600">(string, required)</span></p>
                          <p><span className="text-slate-300">"customAlias"</span>: <span className="text-emerald-400">"myblog"</span> <span className="text-slate-600">(string, optional)</span></p>
                        </div>
                      </div>
                    </div>

                    {/* Interactive copy snippets */}
                    <div className="mt-5 pt-5 border-t border-slate-850">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-3">Copy-Paste Integration Snippets</h4>
                      
                      <div className="space-y-4">
                        {/* cURL Code block */}
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-widest font-mono mb-1">
                            <span>Bash / cURL</span>
                            <button
                              onClick={() => {
                                const activeTok = user.apiTokens[0] || "shrt_live_YOUR_TOKEN";
                                const curlCode = `curl -X POST ${window.location.protocol}//${window.location.host}/api/shorten \\\n  -H "Authorization: Bearer ${activeTok}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"targetUrl": "https://wikipedia.org"}'`;
                                navigator.clipboard.writeText(curlCode);
                                setToastMessage({ text: "Bash / cURL snippet copied!", type: "info" });
                              }}
                              className="text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
                            >
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                          </div>
                          <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[10px] leading-relaxed text-emerald-400 overflow-x-auto select-all">
{`curl -X POST ${window.location.protocol}//${window.location.host}/api/shorten \\
  -H "Authorization: Bearer ${user.apiTokens[0] || "shrt_live_YOUR_TOKEN"}" \\
  -H "Content-Type: application/json" \\
  -d '{"targetUrl": "https://wikipedia.org"}'`}
                          </pre>
                        </div>

                        {/* Node Code block */}
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-widest font-mono mb-1">
                            <span>NodeJS Fetch</span>
                            <button
                              onClick={() => {
                                const activeTok = user.apiTokens[0] || "shrt_live_YOUR_TOKEN";
                                const nodeCode = `fetch("${window.location.protocol}//${window.location.host}/api/shorten", {\n  method: "POST",\n  headers: {\n    "Authorization": "Bearer ${activeTok}",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({ targetUrl: "https://wikipedia.org" })\n})\n.then(res => res.json())\n.then(console.log);`;
                                navigator.clipboard.writeText(nodeCode);
                                setToastMessage({ text: "NodeJS fetch snippet copied!", type: "info" });
                              }}
                              className="text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
                            >
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                          </div>
                          <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[10px] leading-relaxed text-emerald-400 overflow-x-auto select-all">
{`fetch("${window.location.protocol}//${window.location.host}/api/shorten", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${user.apiTokens[0] || "shrt_live_YOUR_TOKEN"}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ targetUrl: "https://wikipedia.org" })
})
.then(res => res.json())
.then(console.log);`}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 3: SHEET & CSV SYNC WORKSPACE */}
        {activeTab === "sheets" && (
          <div className="space-y-6">
            {/* BULK CSV WORKSPACE */}
            <section className="spatial-panel rounded-lg p-6 md:p-8">
              <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-bold tracking-widest uppercase rounded-full">Automated utilities</span>
              <h2 className="text-xl font-bold font-display text-slate-900 mt-2">Bulk link creation</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                Paste a list of URLs, create short links, and export the results as CSV.
              </p>

              <form onSubmit={handleBulkShortenSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">URLs, one per line or comma separated</label>
                  <textarea
                    required
                    placeholder="https://google.com/search?q=1&#10;https://wikipedia.org/wiki/Links&#10;https://news.ycombinator.com"
                    value={bulkUrlInput}
                    onChange={e => setBulkUrlInput(e.target.value)}
                    rows={4}
                    className="w-full p-4 bg-[#fcfdfe] hover:bg-white focus:bg-white border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-hidden text-slate-800 rounded-lg font-mono text-xs transition-all shadow-2xs"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-semibold leading-none">Creates links through your server API.</span>
                  <button
                    type="submit"
                    disabled={isBulkLoading || !bulkUrlInput.trim()}
                    className="py-2.5 px-5 bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-xs transition-transform flex items-center gap-1.5 cursor-pointer disabled:bg-slate-100 disabled:text-slate-400 shrink-0"
                  >
                    {isBulkLoading ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>{isBulkLoading ? "Batch Processing..." : "Process Batch"}</span>
                  </button>
                </div>
              </form>

              {bulkResults.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-150">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Processed Results Table ({bulkResults.length})</h3>
                    <button
                      onClick={downloadBulkResultsCsv}
                      className="px-3.5 py-1.5 border border-emerald-500 text-emerald-700 hover:bg-emerald-50 font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 relative border-t-white/5 shadow-xs"
                    >
                      <Download className="w-3.8 h-3.8 text-emerald-600" />
                      <span>Export as CSV</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-150 rounded-lg md:max-h-72">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-150">
                          <th className="p-3">Original Link</th>
                          <th className="p-3">Branded URL</th>
                          <th className="p-3">Local Sandbox link</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {bulkResults.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="p-3 truncate max-w-[200px] text-slate-500 select-all" title={r.original}>{r.original}</td>
                            <td className="p-3 text-slate-900 font-bold select-all">{r.short}</td>
                            <td className="p-3">
                              <a href={r.testLink} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline select-all inline-flex items-center gap-0.5 font-bold">
                                {r.testLink} <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* GOOGLE SHEET AUTOMATIC INTEGRATION INSTRUCTIONS */}
            <section className="spatial-panel rounded-lg p-6 md:p-8">
              <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-bold tracking-widest uppercase rounded-full">Google Workspace Integration</span>
              <h2 className="text-xl font-bold font-display text-slate-900 mt-2">Google Sheets automation</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                Use Apps Script to create short links from Google Sheets rows.
              </p>

              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-50 border border-slate-150 p-4.5 rounded-lg">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-slate-900 text-[10.5px] font-bold flex items-center justify-center border border-indigo-200">1</span>
                    <h4 className="text-xs font-bold mt-2.5 text-slate-900 uppercase">Initialize Script</h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Open your sheet file in Google Drive. Navigate to the top navigation header, select <strong>Extensions &gt; Apps Script</strong>.
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 p-4.5 rounded-lg">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-slate-900 text-[10.5px] font-bold flex items-center justify-center border border-indigo-200">2</span>
                    <h4 className="text-xs font-bold mt-2.5 text-slate-900 uppercase">Paste Script Code</h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Delete all existing template lines and paste the copy-pasteable custom Apps Script code code below.
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 p-4.5 rounded-lg">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-slate-900 text-[10.5px] font-bold flex items-center justify-center border border-indigo-200">3</span>
                    <h4 className="text-xs font-bold mt-2.5 text-slate-900 uppercase">Save & Run</h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Enter your generated API Key Token below, click Save inside the Apps Script editor, and enter a link in sheet cell A2! Column B2 will update.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-900 text-slate-200 rounded-lg p-5 border border-slate-800">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-widest font-mono mb-2">
                    <span>Google Apps Script Template Code</span>
                    <button
                      onClick={() => {
                        const activeTok = user?.apiTokens[0] || "YOUR_API_TOKEN";
                        const googleScriptCode = `// Google Apps Script trigger\n// When sheet is edited, automatically shortens empty rows\nfunction onEdit(e) {\n  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();\n  var range = e.range;\n  var row = range.getRow();\n  var col = range.getColumn();\n  \n  // Check if Column A is edited and is not a header\n  if (col === 1 && row > 1) {\n    var longUrl = range.getValue().toString().trim();\n    var shortColRange = sheet.getRange(row, 2);\n    \n    // Only shorten if Column B is currently empty\n    if (longUrl && !shortColRange.getValue()) {\n      try {\n        shortColRange.setValue("Creating...");\n        \n        var apiToken = "${activeTok}";\n        var apiEndpoint = "${window.location.protocol}//${window.location.host}/api/shorten";\n        \n        var payload = {\n          "targetUrl": longUrl\n        };\n        \n        var options = {\n          "method": "post",\n          "contentType": "application/json",\n          "headers": {\n            "Authorization": "Bearer " + apiToken\n          },\n          "payload": JSON.stringify(payload),\n          "muteHttpExceptions": true\n        };\n        \n        var response = UrlFetchApp.fetch(apiEndpoint, options);\n        var json = JSON.parse(response.getContentText());\n        \n        if (json.id) {\n          shortColRange.setValue("https://minilinks.onrender.com/" + json.id);\n        } else {\n          shortColRange.setValue("Error: " + (json.error || "Failed"));\n        }\n      } catch(err) {\n        shortColRange.setValue("Error: " + err.toString());\n      }\n    }\n  }\n}`;
                        navigator.clipboard.writeText(googleScriptCode);
                        setToastMessage({ text: "Apps Script trigger template code copied!", type: "info" });
                      }}
                      className="text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer font-bold lowercase"
                    >
                      <Copy className="w-3.2 h-3.2" /> Copy template script
                    </button>
                  </div>

                  <pre className="text-[10px] bg-slate-950 p-4 border border-slate-850 rounded-lg max-h-80 overflow-y-auto font-mono text-emerald-400 select-all leading-relaxed whitespace-pre Scrollbar-none">
{`// Google Sheets onEdit Automation Trigger
// Open Extension > Apps Script, paste, configure API Key, and save.
function onEdit(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = e.range;
  var row = range.getRow();
  var col = range.getColumn();
  
  // Trigger when Column A index is updated (excluding Row 1 label header)
  if (col === 1 && row > 1) {
    var longUrl = range.getValue().toString().trim();
    var shortColRange = sheet.getRange(row, 2);
    
    // Process only if Column B contains an empty cell
    if (longUrl && !shortColRange.getValue()) {
      try {
        shortColRange.setValue("Shortening URL...");
        
        var apiToken = "${user?.apiTokens[0] || "YOUR_API_TOKEN_HERE"}";
        var apiEndpoint = "${window.location.protocol}//${window.location.host}/api/shorten";
        
        var payload = {
          "targetUrl": longUrl
        };
        
        var options = {
          "method": "post",
          "contentType": "application/json",
          "headers": {
            "Authorization": "Bearer " + apiToken
          },
          "payload": JSON.stringify(payload),
          "muteHttpExceptions": true
        };
        
        var response = UrlFetchApp.fetch(apiEndpoint, options);
        var json = JSON.parse(response.getContentText());
        
        if (json.id) {
          shortColRange.setValue("https://minilinks.onrender.com/" + json.id);
        } else {
          shortColRange.setValue("Error: " + (json.error || "Failed"));
        }
      } catch(err) {
        shortColRange.setValue("Error: " + err.toString());
      }
    }
  }
}`}
                  </pre>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: ACCOUNT & BILLING */}
        {activeTab === "account" && (
          <div className="space-y-6">
            <section className="spatial-panel rounded-lg p-6 md:p-8">
              <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-bold tracking-widest uppercase rounded-full">Account Management</span>
              <h2 className="text-xl font-bold font-display text-slate-900 mt-2">Subscription & Access</h2>
              <p className="text-sm text-slate-500 mt-1">
                Manage plan access for paid users and complimentary accounts.
              </p>

              {!user ? (
                <div className="mt-6 p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200 max-w-md mx-auto">
                  <Lock className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                  <h4 className="font-bold text-slate-900">Sign in to manage billing</h4>
                  <button
                    onClick={() => {
                      setShowAuthForm(true);
                      setAuthError(null);
                    }}
                    className="mt-4 px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    Account Login
                  </button>
                </div>
              ) : (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 border border-slate-150 rounded-lg p-5 bg-slate-50">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{user.email}</h3>
                        <p className="text-xs text-slate-500 mt-1">User ID: <span className="font-mono">{user.userId}</span></p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                        hasProAccess
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}>
                        {hasProAccess ? "Pro Enabled" : "Free"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                      <div className="bg-white border border-slate-150 rounded-lg p-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</span>
                        <p className="text-sm font-bold text-slate-900 mt-1">{billingStatus?.subscriptionStatus || user.subscriptionStatus || "free"}</p>
                      </div>
                      <div className="bg-white border border-slate-150 rounded-lg p-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Monthly Usage</span>
                        <p className="text-sm font-bold text-slate-900 mt-1">
                          {billingStatus ? `${billingStatus.monthlyUsage}/${billingStatus.monthlyLimit}` : "Loading"}
                        </p>
                      </div>
                      <div className="bg-white border border-slate-150 rounded-lg p-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Free Access</span>
                        <p className="text-sm font-bold text-slate-900 mt-1">{user.freeAccess ? "Enabled" : "No"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="border border-slate-150 rounded-lg p-5 bg-white flex flex-col justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Pro Subscription</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Pro unlocks custom aliases, API tokens, Sheets automation, and high monthly limits.
                      </p>
                    </div>
                    <button
                      onClick={handleStartCheckout}
                      disabled={isBillingLoading || hasProAccess}
                      className="w-full px-4 py-2.5 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isBillingLoading ? <RotateCw className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                      <span>{hasProAccess ? "Access Active" : "Upgrade to Pro"}</span>
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 5: SHIP & MONETIZATION GUIDE */}
        {activeTab === "guide" && (
          <div className="space-y-6">
            {/* SAAS MONETIZATION STARTER CARD */}
            <section className="spatial-panel rounded-lg p-6 md:p-8">
              <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-bold tracking-widest uppercase rounded-full">Launch guide</span>
              <h2 className="text-xl font-bold font-display text-slate-900 mt-2">Subscriptions</h2>
              <p className="text-sm text-slate-500 mt-1">
                Use subscriptions, API access, and complimentary accounts to manage paid usage.
              </p>

              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Stripe sub model */}
                  <div className="border border-slate-150 p-5 rounded-lg bg-slate-50">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900 mb-3">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase">1. Subscription Plans (Stripe Checkout)</h3>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Charge users a monthly subscription fee (e.g. $9/month) for advanced benefits like Custom domain configurations, detailed geographic and referrer graphs, or password protected tracking links.
                    </p>
                  </div>

                  {/* Dev tier model */}
                  <div className="border border-slate-150 p-5 rounded-lg bg-slate-50">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-3">
                      <Terminal className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase">2. Paid API limits</h3>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Charge companies based on link processing volumes. Keep Guest and Free plans at 100 links/month, while Charging $29/month for enterprise API rate limits with 10,000 links/month constraints.
                    </p>
                  </div>

                  {/* Ad middleware */}
                  <div className="border border-slate-150 p-5 rounded-lg bg-slate-50">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 mb-3">
                      <Compass className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase">3. Interstitial Redirect Ad Walls</h3>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Instead of standard 302 instant redirects, route visitors through a beautiful 5-second countdown interstitial landing page where active AdSense or Carbon banners can display before loading target destination.
                    </p>
                  </div>

                  {/* Custom brands */}
                  <div className="border border-slate-150 p-5 rounded-lg bg-slate-50">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900 mb-3">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase">4. Private Branded Domains</h3>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Allow corporate teams to point custom redirection URLs (e.g., <code className="text-slate-900 font-bold font-mono">company.lnk/new</code>) to your website, mapping records automatically using custom subdomain server triggers.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* DEPLOYMENT GUIDE */}
            <section className="spatial-panel rounded-lg p-6 md:p-8">
              <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-bold tracking-widest uppercase rounded-full">Shipping Deployment Guide</span>
              <h2 className="text-xl font-bold font-display text-slate-900 mt-2">How to Deploy and Host Globally</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                Connect your active project to cloud platforms to reach millions. This full-stack Node/Vite template compiles naturally to standard server containers.
              </p>

              <div className="mt-5 space-y-4">
                <div className="border-l-2 border-slate-900 pl-4 space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase">Option A: Deploy to Firebase Hosting & Cloud Run</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Initialize Firebase Tools command-line in your local workspace using <code className="font-mono bg-slate-100 p-0.5 rounded text-slate-700">firebase init</code>. Select <strong>Hosting with Cloud Run integration</strong> to automatically deploy your full-stack Node server into Cloud Run containers for scale-to-zero server benefits.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase">Option B: Connect with GitHub</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Export your workspace ZIP file or click "Export to GitHub" in your AI Studio editor settings. Create a private or public repository, upload files, and connect to Vercel or Render.com, enabling automatic trigger deployments at every git push!
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase">Option C: Compile with Docker</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Run <code className="font-mono bg-slate-100 p-0.5 rounded text-slate-700">npm run build && npm start</code> in any standard virtual server (AWS EC2, DigitalOcean droplet) or use a basic Dockerfile that copies `dist/`, starts the server container on Port 3000, and forwards requests with Nginx rules.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Footer copyright */}
      <footer className="text-center py-10 mt-auto bg-slate-100 border-t border-slate-200 text-slate-500">
        <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">
          MINILINKS • LINK MANAGEMENT
        </p>
      </footer>

      {/* Shared Global QR Code Dialog Modal */}
      <QRModal
        isOpen={qrModal.isOpen}
        onClose={() => setQrModal(prev => ({ ...prev, isOpen: false }))}
        shortUrl={qrModal.shortUrl}
        title={qrModal.title}
      />
    </div>
  );
}
