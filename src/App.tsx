import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Link2, 
  Sparkles, 
  RotateCw, 
  AlertCircle, 
  ArrowRight, 
  ChevronDown, 
  Info,
  Check,
  Copy,
  Plus,
  LogOut,
  LogIn,
  Terminal,
  ShieldCheck,
  Trash2,
  Lock,
  Mail,
  UserPlus,
  ExternalLink,
  Download,
  Search,
  Tag,
  Settings,
  Globe,
  Calendar,
  Edit,
  Sliders,
  FolderKanban,
  FileSpreadsheet,
  QrCode
} from "lucide-react";
import { ShortUrl, UserAccount } from "./types";
import LinkCard from "./components/LinkCard";
import AnalyticsView from "./components/AnalyticsView";
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
type PublicUser = Pick<UserAccount, "userId" | "email" | "apiTokens" | "subscriptionStatus" | "plan" | "freeAccess" | "customDomains">;

function getOrCreateUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = "usr_" + Math.random().toString(36).substring(2, 11);
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export default function App() {
  // Pathname Router
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
  };

  // User States
  const [user, setUser] = useState<PublicUser | null>(() => {
    const saved = localStorage.getItem("minilinks_authenticated_user");
    return saved ? JSON.parse(saved) : null;
  });
  
  const [userId, setUserId] = useState<string>(() => {
    const saved = localStorage.getItem("minilinks_authenticated_user");
    if (saved) return JSON.parse(saved).userId;
    return getOrCreateUserId();
  });

  // Data & List States
  const [urls, setUrls] = useState<ShortUrl[]>([]);
  const [targetUrl, setTargetUrl] = useState("");
  const [customAlias, setCustomAlias] = useState("");
  
  // Advanced Link Form Options
  const [expiresAt, setExpiresAt] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [linkTags, setLinkTags] = useState("");
  const [linkCampaign, setLinkCampaign] = useState("");
  const [selectedCustomDomain, setSelectedCustomDomain] = useState("");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagFilter, setSelectedTagFilter] = useState("all");
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState("all");

  // Edit Modal States
  const [editingUrl, setEditingUrl] = useState<ShortUrl | null>(null);
  const [editTargetUrl, setEditTargetUrl] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editCampaign, setEditCampaign] = useState("");
  const [editCustomDomain, setEditCustomDomain] = useState("");

  // Status & Feedback indicators
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "error" | "info" } | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Authentication configuration UI states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Settings custom domain input
  const [newDomainInput, setNewDomainInput] = useState("");

  // Active sub-view in Dashboard
  const [activeTab, setActiveTab] = useState<"links" | "analytics" | "campaigns" | "settings">("links");

  // Billing status indicators
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

  // Sheets CSV batch shortening
  const [bulkUrlInput, setBulkUrlInput] = useState("");
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<{ original: string; short: string; testLink: string }[]>([]);
  const [showBulkUploader, setShowBulkUploader] = useState(false);

  // QR Modal configuration
  const [qrModal, setQrModal] = useState({
    isOpen: false,
    shortUrl: "",
    title: ""
  });

  // Password Lockbox Portal Gateway State (Route `/p/:shortId`)
  const [gatePassword, setGatePassword] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateLoading, setGateLoading] = useState(false);

  // Synchronize toast messages from URL query redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    const idParam = params.get("id");

    if (errorParam === "not-found" && idParam) {
      setToastMessage({
        text: `Redirection Error: "/${idParam}" does not exist or has been removed.`,
        type: "error"
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam === "expired" && idParam) {
      setToastMessage({
        text: `Redirection Error: The link for "/${idParam}" has expired.`,
        type: "error"
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Sync route path changes directly into dashboard active tab selectors
  useEffect(() => {
    if (user) {
      if (currentPath === "/dashboard" || currentPath === "/workspace") setActiveTab("links");
      else if (currentPath === "/analytics") setActiveTab("analytics");
      else if (currentPath === "/campaigns") setActiveTab("campaigns");
      else if (currentPath === "/settings") setActiveTab("settings");
    }
  }, [currentPath, user]);

  // Toast auto dismisser
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Fetch URLs for current tracking user
  const fetchUrlHistory = async (silently = false) => {
    if (!silently) setIsFetchingHistory(true);
    try {
      const response = await fetch(`/api/urls?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setUrls(data);
      }
    } catch (e) {
      console.error("Failed to fetch link history list", e);
    } finally {
      setIsFetchingHistory(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUrlHistory();
  }, [userId]);

  // Fetch billing entitlement and profile statuses
  const fetchBillingStatus = async () => {
    if (!user) {
      setBillingStatus(null);
      return;
    }
    try {
      const response = await fetch(`/api/billing/status?userId=${user.userId}`);
      const data = await response.json();
      if (response.ok) {
        setBillingStatus(data);
        const updatedUser = {
          ...user,
          subscriptionStatus: data.subscriptionStatus,
          plan: data.plan,
          freeAccess: data.freeAccess
        };
        setUser(updatedUser);
        localStorage.setItem("minilinks_authenticated_user", JSON.stringify(updatedUser));
      }
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

  // Upgrade Plan Stripe Checkout Handoff
  const handleStartCheckout = async () => {
    if (!user) {
      setShowAuthModal(true);
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
      if (!response.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err: any) {
      setToastMessage({ text: err.message || "Stripe upgrade portal unavailable.", type: "error" });
    } finally {
      setIsBillingLoading(false);
    }
  };

  // Submit Shortening Form
  const handleShortenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);

    let cleanUrl = targetUrl.trim();
    if (!cleanUrl) {
      setErrorText("Please enter a valid destination URL to shorten.");
      return;
    }

    if (customAlias.trim() && !hasProAccess) {
      setErrorText("Custom aliases require a Pro subscription plan.");
      return;
    }

    setIsSubmitLoading(true);
    try {
      // Split tags comma
      const tagsArray = linkTags.split(",").map(t => t.trim()).filter(Boolean);

      const response = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: cleanUrl,
          customAlias: customAlias.trim() || undefined,
          userId,
          expiresAt: expiresAt || undefined,
          password: linkPassword || undefined,
          tags: tagsArray,
          campaign: linkCampaign || undefined,
          customDomain: selectedCustomDomain || undefined
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to shorten link.");

      // Success
      setToastMessage({ text: "Short link created successfully!", type: "info" });
      setTargetUrl("");
      setCustomAlias("");
      setExpiresAt("");
      setLinkPassword("");
      setLinkTags("");
      setLinkCampaign("");
      setSelectedCustomDomain("");
      setShowAdvancedOptions(false);
      
      fetchUrlHistory(true);
      fetchBillingStatus();
    } catch (err: any) {
      setErrorText(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  // Open Edit Dialog
  const handleOpenEdit = (url: ShortUrl) => {
    setEditingUrl(url);
    setEditTargetUrl(url.targetUrl);
    setEditExpiresAt(url.expiresAt || "");
    setEditPassword(url.password || "");
    setEditTags(url.tags ? url.tags.join(", ") : "");
    setEditCampaign(url.campaign || "");
    setEditCustomDomain(url.customDomain || "");
  };

  // Submit Edit URL Form
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUrl) return;

    try {
      const tagsArray = editTags.split(",").map(t => t.trim()).filter(Boolean);

      const response = await fetch(`/api/urls/${editingUrl.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          targetUrl: editTargetUrl,
          expiresAt: editExpiresAt || null,
          password: editPassword || null,
          tags: tagsArray,
          campaign: editCampaign || null,
          customDomain: editCustomDomain || null
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update URL.");

      setToastMessage({ text: "Link updated successfully!", type: "info" });
      setEditingUrl(null);
      fetchUrlHistory(true);
    } catch (err: any) {
      setToastMessage({ text: err.message || "Failed to edit link details.", type: "error" });
    }
  };

  // Delete Link
  const handleDeleteLink = async (id: string) => {
    try {
      const response = await fetch(`/api/urls/${id}?userId=${userId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        setUrls(prev => prev.filter(u => u.id !== id));
        setToastMessage({ text: "Link removed from your database.", type: "info" });
      } else {
        const data = await response.json();
        setToastMessage({ text: data.error || "Could not delete link.", type: "error" });
      }
    } catch (e) {
      setToastMessage({ text: "Network connection is offline.", type: "error" });
    }
  };

  // Connect Custom Branded Domain
  const handleAddCustomDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const domain = newDomainInput.trim().toLowerCase();
    if (!domain) return;

    if (!hasProAccess) {
      setToastMessage({ text: "Custom domains require a Pro subscription.", type: "error" });
      return;
    }

    try {
      const currentDomains = user.customDomains || [];
      if (currentDomains.includes(domain)) {
        setToastMessage({ text: "This domain is already connected.", type: "error" });
        return;
      }

      const updatedDomains = [...currentDomains, domain];
      
      // Update profile on Server
      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId,
          email: user.email,
          customDomains: updatedDomains
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      // Local Sync
      const syncedUser = { ...user, customDomains: updatedDomains };
      setUser(syncedUser);
      localStorage.setItem("minilinks_authenticated_user", JSON.stringify(syncedUser));
      setNewDomainInput("");
      setToastMessage({ text: `Connected branded domain: ${domain}!`, type: "info" });
    } catch (err: any) {
      setToastMessage({ text: err.message || "Failed to connect domain.", type: "error" });
    }
  };

  // Revoke Custom Domain
  const handleRemoveCustomDomain = async (domain: string) => {
    if (!user) return;
    try {
      const updatedDomains = (user.customDomains || []).filter(d => d !== domain);
      
      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId,
          email: user.email,
          customDomains: updatedDomains
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      const syncedUser = { ...user, customDomains: updatedDomains };
      setUser(syncedUser);
      localStorage.setItem("minilinks_authenticated_user", JSON.stringify(syncedUser));
      setToastMessage({ text: `Disconnected custom domain: ${domain}.`, type: "info" });
    } catch (err: any) {
      setToastMessage({ text: err.message || "Failed to revoke domain.", type: "error" });
    }
  };

  // Auth: Email/Password login or registration
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthLoading(true);

    try {
      let firebaseUser;
      if (isRegisterMode) {
        const credential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        firebaseUser = credential.user;
      } else {
        const credential = await signInWithEmailAndPassword(auth, authEmail, authPassword);
        firebaseUser = credential.user;
      }

      if (!firebaseUser || !firebaseUser.email) {
        throw new Error("Unable to retrieve user details from Firebase.");
      }

      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: firebaseUser.uid, 
          email: firebaseUser.email 
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setUser(data.user);
      localStorage.setItem("minilinks_authenticated_user", JSON.stringify(data.user));
      setUserId(data.user.userId);
      
      setToastMessage({
        text: isRegisterMode ? "Welcome! Account created successfully." : "Signed in successfully!",
        type: "info"
      });

      setAuthEmail("");
      setAuthPassword("");
      setShowAuthModal(false);
      navigate("/dashboard");
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Auth: Google Sign-in Popups
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setIsAuthLoading(true);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const firebaseUser = credential.user;

      if (!firebaseUser || !firebaseUser.email) {
        throw new Error("Google Account is missing a validated email address.");
      }

      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: firebaseUser.uid, 
          email: firebaseUser.email 
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setUser(data.user);
      localStorage.setItem("minilinks_authenticated_user", JSON.stringify(data.user));
      setUserId(data.user.userId);

      setToastMessage({ text: "Signed in with Google successfully!", type: "info" });
      setShowAuthModal(false);
      navigate("/dashboard");
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") {
        setAuthError(err.message || "Google Sign-In failed.");
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Auth: Logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Sign-out error", e);
    }
    setUser(null);
    localStorage.removeItem("minilinks_authenticated_user");
    const guestId = getOrCreateUserId();
    setUserId(guestId);
    setToastMessage({ text: "Successfully signed out.", type: "info" });
    navigate("/");
  };

  // API Tokens management
  const handleGenerateDevApiToken = async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/auth/tokens/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      const updatedUser = { ...user, apiTokens: data.apiTokens };
      setUser(updatedUser);
      localStorage.setItem("minilinks_authenticated_user", JSON.stringify(updatedUser));
      setToastMessage({ text: "Developer API Token generated!", type: "info" });
      fetchBillingStatus();
    } catch (err: any) {
      setToastMessage({ text: err.message || "Could not generate token.", type: "error" });
    }
  };

  const handleRevokeDevApiToken = async (token: string) => {
    if (!user) return;
    try {
      const response = await fetch("/api/auth/tokens/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, token })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      const updatedUser = { ...user, apiTokens: data.apiTokens };
      setUser(updatedUser);
      localStorage.setItem("minilinks_authenticated_user", JSON.stringify(updatedUser));
      setToastMessage({ text: "Developer API Token revoked.", type: "info" });
    } catch (err: any) {
      setToastMessage({ text: err.message || "Could not revoke token.", type: "error" });
    }
  };

  // Verify Protected password gateway
  const handleVerifyGatewayPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError(null);
    setGateLoading(true);

    const targetShortId = currentPath.split("/p/")[1];
    if (!targetShortId) {
      setGateError("Invalid link redirection context.");
      setGateLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/urls/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetShortId,
          password: gatePassword
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        window.location.href = data.targetUrl;
      } else {
        setGateError(data.error || "Incorrect password. Access denied.");
      }
    } catch (err) {
      setGateError("Network error. Please try again.");
    } finally {
      setGateLoading(false);
    }
  };

  // Bulk Sheets Batch Uploader
  const handleBulkShortenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkUrlInput.trim()) return;

    setIsBulkLoading(true);
    setBulkResults([]);

    const rawUrls = bulkUrlInput
      .split(/[\n,;]/)
      .map(u => u.trim())
      .filter(Boolean);

    const processed: typeof bulkResults = [];

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
            short: "Error: " + (result.error || "Limit Exceeded"),
            testLink: "#"
          });
        }
      } catch (_) {
        processed.push({ original: url, short: "Error: Offline", testLink: "#" });
      }
    }

    setBulkResults(processed);
    setIsBulkLoading(false);
    setBulkUrlInput("");
    setToastMessage({ text: `Processed ${processed.length} links!`, type: "info" });
    fetchUrlHistory(true);
    fetchBillingStatus();
  };

  const downloadBulkCsv = () => {
    if (bulkResults.length === 0) return;
    let csv = "Original URL,Shortened URL\n";
    bulkResults.forEach(r => {
      csv += `"${r.original.replace(/"/g, '""')}","${window.location.origin}${r.testLink}"\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "minilinks_bulk_shortened.csv";
    link.click();
  };

  // Search & Filter computation lists
  const uniqueTagsList = useMemo(() => {
    const list = new Set<string>();
    urls.forEach(u => u.tags?.forEach(t => list.add(t)));
    return Array.from(list);
  }, [urls]);

  const uniqueCampaignsList = useMemo(() => {
    const list = new Set<string>();
    urls.forEach(u => {
      if (u.campaign) list.add(u.campaign);
    });
    return Array.from(list);
  }, [urls]);

  const filteredUrlsList = useMemo(() => {
    return urls.filter(u => {
      const matchesSearch = 
        u.targetUrl.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.title && u.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        u.id.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTag = selectedTagFilter === "all" || (u.tags && u.tags.includes(selectedTagFilter));
      const matchesCampaign = selectedCampaignFilter === "all" || u.campaign === selectedCampaignFilter;

      return matchesSearch && matchesTag && matchesCampaign;
    });
  }, [urls, searchQuery, selectedTagFilter, selectedCampaignFilter]);

  // Show QR Codes helper
  const handleShowQR = (shortUrl: string, title: string) => {
    setQrModal({
      isOpen: true,
      shortUrl,
      title
    });
  };

  // ==================== RENDERS ====================

  // 1. Password Protection Gateway Route
  if (currentPath.startsWith("/p/")) {
    return (
      <div className="min-h-screen premium-dark-bg text-white flex flex-col justify-center items-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center"
        >
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl mb-6">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight">Protected Mini Link</h2>
          <p className="text-xs text-slate-400 mt-2 px-4">
            This short link is encrypted with password protection. Please enter the correct password to access the destination URL.
          </p>

          <form onSubmit={handleVerifyGatewayPassword} className="w-full mt-8 space-y-4">
            <div className="relative">
              <input
                type="password"
                placeholder="Enter password..."
                value={gatePassword}
                onChange={(e) => setGatePassword(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 text-center"
              />
            </div>

            {gateError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {gateError}
              </div>
            )}

            <button
              type="submit"
              disabled={gateLoading}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/20"
            >
              {gateLoading ? (
                <RotateCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Verify & Decrypt <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
          
          <button 
            onClick={() => navigate("/")}
            className="text-xs text-slate-500 hover:text-slate-400 mt-6 underline cursor-pointer"
          >
            Cancel and Return Home
          </button>
        </motion.div>
      </div>
    );
  }

  // 2. Unauthenticated Landing Page
  if (!user && (currentPath === "/" || currentPath === "/login" || currentPath === "/register")) {
    return (
      <div className="min-h-screen spatial-bg text-slate-900 flex flex-col">
        {/* Header */}
        <header className="max-w-7xl mx-auto w-full px-6 py-5 flex items-center justify-between border-b border-slate-200/50">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-md">
              <Link2 className="w-5 h-5" />
            </div>
            <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-slate-950 to-indigo-950 bg-clip-text text-transparent">
              Mini Links
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => { setIsRegisterMode(false); setShowAuthModal(true); }}
              className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button 
              onClick={() => { setIsRegisterMode(true); setShowAuthModal(true); }}
              className="text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 hover:scale-[1.01] cursor-pointer"
            >
              Get Started Free
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 md:py-20 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" /> The Premium Shortener Built for Branded Growth
            </span>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-950 max-w-2xl leading-none">
              Shorten. Customize. Analyze. <span className="bg-gradient-to-r from-indigo-600 to-brand-accent bg-clip-text text-transparent">Securely.</span>
            </h1>
            <p className="text-sm md:text-base text-slate-500 max-w-xl mx-auto">
              Create branded aliases, password protect sensitive redirects, schedule link expirations, and extract granular click intelligence. Standardize your campaigns with Mini Links.
            </p>
          </motion.div>

          {/* Quick shorten widget */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="w-full max-w-2xl mt-12 bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xl"
          >
            <form onSubmit={handleShortenSubmit} className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                placeholder="Paste your long destination URL here..."
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                required
                className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 font-medium"
              />
              <button
                type="submit"
                disabled={isSubmitLoading}
                className="px-8 py-4 bg-[#FF5A36] hover:bg-[#E04826] text-white font-extrabold text-sm rounded-2xl transition-all shadow-md shadow-brand-accent/20 hover:shadow-brand-accent/35 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitLoading ? <RotateCw className="w-4 h-4 animate-spin" /> : "Shorten Link"}
              </button>
            </form>

            {errorText && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold rounded-xl flex items-center gap-2 text-left">
                <AlertCircle className="w-4.5 h-4.5 shrink-0" /> {errorText}
              </div>
            )}
          </motion.div>

          {/* Guest URLs Display */}
          {urls.length > 0 && (
            <div className="w-full max-w-2xl mt-8 space-y-3 text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Your shortened link:</span>
              {urls.slice(0, 1).map(u => (
                <div key={u.id} className="bg-indigo-900/5 border border-indigo-100/85 p-5 rounded-2xl flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-slate-900 truncate block">{u.title || "Untitled"}</span>
                    <a href={publicShortUrl(u.id)} target="_blank" rel="noreferrer" className="text-indigo-600 font-mono text-sm font-extrabold mt-1 block hover:underline">
                      {displayShortUrl(u.id)}
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(publicShortUrl(u.id));
                        setToastMessage({ text: "Copied short link!", type: "info" });
                      }}
                      className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs"
                    >
                      <Copy className="w-4 h-4 text-slate-600" />
                    </button>
                    <button
                      onClick={() => handleShowQR(publicShortUrl(u.id), u.title || "Guest QR")}
                      className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs"
                    >
                      <QrCode className="w-4 h-4 text-slate-600" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="bg-slate-50 rounded-2xl border border-slate-200/60 p-4 text-center mt-4">
                <p className="text-xs text-slate-500 font-medium">
                  💡 Guest limits apply. <span className="text-indigo-600 font-bold hover:underline cursor-pointer" onClick={() => { setIsRegisterMode(true); setShowAuthModal(true); }}>Sign up for a free account</span> to customize back-halves, view detailed click reports, and password protect links.
                </p>
              </div>
            </div>
          )}

          {/* Features Grid */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mt-20 pt-10 border-t border-slate-200/50 text-left">
            <div className="bg-white/40 border border-slate-200/50 p-5 rounded-2xl">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl inline-block mb-3">
                <Sparkles className="w-4.5 h-4.5" />
              </div>
              <h3 className="font-bold text-slate-950 text-sm">Advanced Link Control</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Connect branded custom domains, define custom path back-halves, and download vector SVG QR codes instantly.
              </p>
            </div>
            <div className="bg-white/40 border border-slate-200/50 p-5 rounded-2xl">
              <div className="p-2.5 bg-amber-50 text-amber-600 border border-amber-100 rounded-xl inline-block mb-3">
                <ShieldCheck className="w-4.5 h-4.5" />
              </div>
              <h3 className="font-bold text-slate-950 text-sm">Protected Redirection</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Enforce passkey shields on destination paths and schedule date-time expirations to control content access.
              </p>
            </div>
            <div className="bg-white/40 border border-slate-200/50 p-5 rounded-2xl">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl inline-block mb-3">
                <Sliders className="w-4.5 h-4.5" />
              </div>
              <h3 className="font-bold text-slate-950 text-sm">Granular Intelligence</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Track clicks, timeline curves, geolocation sources, browser breakdowns, and top referring networks in real-time.
              </p>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="bg-slate-900 text-slate-400 py-8 px-6 text-center text-xs font-semibold mt-auto border-t border-slate-800">
          <p>© {new Date().getFullYear()} Mini Links SaaS. Built for scale. All rights reserved.</p>
        </footer>

        {/* Authentication Modal */}
        <AnimatePresence>
          {showAuthModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAuthModal(false)}
                className="absolute inset-0 bg-black/45 backdrop-blur-xs"
              />
              
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative w-full max-w-sm bg-white rounded-3xl shadow-xl border border-slate-200/80 p-8 z-10 text-slate-900"
              >
                <div className="text-center mb-6">
                  <div className="p-2.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl inline-block mb-3">
                    <Link2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-950">
                    {isRegisterMode ? "Create your account" : "Welcome back"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Manage your link campaigns, domains, and metrics.
                  </p>
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="you@domain.com"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-indigo-500 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-indigo-500 font-semibold"
                    />
                  </div>

                  {authError && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold">
                      {authError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isAuthLoading}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/25 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isAuthLoading ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : 
                     isRegisterMode ? "Create Free Account" : "Access Workspace"}
                  </button>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-2.5 my-5">
                  <div className="flex-1 border-b border-slate-100" />
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">or continue with</span>
                  <div className="flex-1 border-b border-slate-100" />
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  disabled={isAuthLoading}
                  className="w-full py-3 bg-slate-50 border border-slate-200 hover:bg-slate-100/50 rounded-xl text-xs font-semibold text-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.2-5.136 4.2A5.63 5.63 0 0 1 8.35 12.97a5.63 5.63 0 0 1 5.64-5.63c1.55 0 2.97.58 4.05 1.54l3.057-3.056A9.96 9.96 0 0 0 14 2a10 10 0 0 0-10 10 10 0 0 0 10 10c5.73 0 9.96-4.01 9.96-9.96 0-.63-.06-1.24-.18-1.755H12.24z"/>
                  </svg>
                  Sign in with Google
                </button>

                <div className="text-center mt-6">
                  <button
                    onClick={() => { setIsRegisterMode(!isRegisterMode); setAuthError(null); }}
                    className="text-xs text-indigo-600 hover:underline font-bold cursor-pointer"
                  >
                    {isRegisterMode ? "Already have an account? Sign In" : "Need an account? Sign Up Free"}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Global QR Code Modal */}
        <QRModal
          isOpen={qrModal.isOpen}
          onClose={() => setQrModal(prev => ({ ...prev, isOpen: false }))}
          shortUrl={qrModal.shortUrl}
          title={qrModal.title}
        />
      </div>
    );
  }

  // 3. Authenticated Dashboard Shell Layout
  return (
    <div className="min-h-screen spatial-bg text-slate-900 flex flex-col md:flex-row">
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-[260px] bg-slate-950 text-white shrink-0 flex flex-col border-r border-slate-800">
        
        {/* Sidebar Header Brand */}
        <div className="p-6 border-b border-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-md">
              <Link2 className="w-4.5 h-4.5" />
            </div>
            <span className="text-base font-extrabold tracking-tight">Mini Links</span>
          </div>
          
          <button 
            onClick={handleLogout}
            className="md:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl transition-colors cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar Navigation Items */}
        <nav className="flex-1 p-4 space-y-1">
          <button
            onClick={() => navigate("/dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "links" 
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10" 
                : "text-slate-400 hover:text-white hover:bg-slate-900/60"
            }`}
          >
            <Link2 className="w-4 h-4" /> Links Manager
          </button>
          
          <button
            onClick={() => navigate("/analytics")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "analytics" 
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10" 
                : "text-slate-400 hover:text-white hover:bg-slate-900/60"
            }`}
          >
            <Sliders className="w-4 h-4" /> Analytics Studio
          </button>
          
          <button
            onClick={() => navigate("/campaigns")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "campaigns" 
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10" 
                : "text-slate-400 hover:text-white hover:bg-slate-900/60"
            }`}
          >
            <FolderKanban className="w-4 h-4" /> Link Campaigns
          </button>
          
          <button
            onClick={() => navigate("/settings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "settings" 
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10" 
                : "text-slate-400 hover:text-white hover:bg-slate-900/60"
            }`}
          >
            <Settings className="w-4 h-4" /> Workspace Settings
          </button>
        </nav>

        {/* Sidebar Profile Card / Billing Limits */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/45 space-y-4">
          {billingStatus && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-extrabold uppercase">
                <span className="text-slate-400">Monthly Usage</span>
                <span className="text-indigo-400">{billingStatus.plan}</span>
              </div>
              <div className="w-full bg-slate-850 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    billingStatus.monthlyUsage >= billingStatus.monthlyLimit ? "bg-rose-500" : "bg-indigo-500"
                  }`}
                  style={{ width: `${Math.min((billingStatus.monthlyUsage / billingStatus.monthlyLimit) * 100, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold">
                <span>{billingStatus.monthlyUsage} / {billingStatus.monthlyLimit} links</span>
                {billingStatus.plan === "free" && (
                  <button 
                    onClick={handleStartCheckout} 
                    className="text-indigo-400 hover:text-indigo-300 transition-colors hover:underline cursor-pointer"
                  >
                    Upgrade ↗
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Logged in as</span>
              <span className="text-xs font-semibold text-slate-350 truncate block" title={user?.email}>
                {user?.email}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/5 border border-transparent hover:border-rose-500/10 rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Panel Frame */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto max-h-screen">
        
        {/* Main Content Dashboard Shell Header */}
        <header className="px-6 py-4.5 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0 sticky top-0 z-20">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {activeTab === "links" ? "Links Manager" : 
               activeTab === "analytics" ? "Analytics Studio" : 
               activeTab === "campaigns" ? "Link Campaigns" : "Workspace Settings"}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === "links" && (
              <button
                onClick={() => setShowBulkUploader(!showBulkUploader)}
                className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                {showBulkUploader ? "Single Link Form" : "Bulk Batch CSV"}
              </button>
            )}

            <button
              onClick={() => {
                setIsRefreshing(true);
                fetchUrlHistory(true);
                fetchBillingStatus();
              }}
              disabled={isRefreshing}
              className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 rounded-xl shadow-2xs transition-colors shrink-0 cursor-pointer"
              title="Refresh link metrics and allocations"
            >
              <RotateCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        {/* Dashboard Frame Viewport */}
        <div className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          
          {/* TAB VIEW: LINKS MANAGER */}
          {activeTab === "links" && (
            <div className="space-y-6">
              
              {/* Conditional Rendering: Bulk Batch Shortener vs Standard Single shortener */}
              {showBulkUploader ? (
                <div className="bg-white border border-slate-200/80 rounded-2xl shadow-2xs p-5 space-y-4">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Batch URL Shortener</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">Shorten multiple links at once. Separate URLs with commas, semicolons or newlines.</p>
                  </div>
                  <form onSubmit={handleBulkShortenSubmit} className="space-y-3.5">
                    <textarea
                      placeholder="Paste URLs list here (e.g. google.com, youtube.com, github.com)"
                      rows={4}
                      value={bulkUrlInput}
                      onChange={(e) => setBulkUrlInput(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl p-4 focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 font-bold">Limit counts will apply sequentially.</span>
                      <button
                        type="submit"
                        disabled={isBulkLoading}
                        className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
                      >
                        {isBulkLoading ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : "Process Batch"}
                      </button>
                    </div>
                  </form>

                  {/* Bulk Results Table */}
                  {bulkResults.length > 0 && (
                    <div className="mt-5 border-t border-slate-100 pt-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-900">Shortened Results</span>
                        <button
                          onClick={downloadBulkCsv}
                          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-100 transition-colors cursor-pointer"
                        >
                          <Download className="w-3 h-3" /> Export CSV
                        </button>
                      </div>
                      <div className="bg-slate-50 border border-slate-200/60 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100/70 border-b border-slate-200/60 text-slate-500 font-bold uppercase text-[9px] tracking-wider">
                              <th className="px-4 py-2.5">Original URL</th>
                              <th className="px-4 py-2.5">Branded Link</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkResults.map((res, i) => (
                              <tr key={i} className="border-b border-slate-100 hover:bg-white transition-colors">
                                <td className="px-4 py-2 truncate max-w-[200px]" title={res.original}>{res.original}</td>
                                <td className="px-4 py-2 font-mono font-bold text-indigo-600">
                                  {res.testLink !== "#" ? (
                                    <a href={res.testLink} target="_blank" rel="noreferrer" className="hover:underline">
                                      {res.short}
                                    </a>
                                  ) : (
                                    <span className="text-rose-500">{res.short}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Standard URL shortening form with advanced parameters drawer */
                <div className="bg-white border border-slate-200/80 rounded-2xl shadow-2xs p-5">
                  <form onSubmit={handleShortenSubmit} className="space-y-4">
                    <div className="flex flex-col md:flex-row gap-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Paste your long destination URL here..."
                          value={targetUrl}
                          onChange={(e) => setTargetUrl(e.target.value)}
                          required
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl px-4 py-3.5 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                        />
                      </div>
                      
                      <button
                        type="submit"
                        disabled={isSubmitLoading}
                        className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-indigo-600/10 shrink-0 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {isSubmitLoading ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : "Shorten Link"}
                      </button>
                    </div>

                    {errorText && (
                      <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold rounded-xl flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {errorText}
                      </div>
                    )}

                    {/* Advanced parameters toggle */}
                    <div className="border-t border-slate-100 pt-3.5">
                      <button
                        type="button"
                        onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                        className="text-xs font-bold text-slate-600 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                      >
                        ⚙️ {showAdvancedOptions ? "Hide Advanced Options" : "Show Advanced Options (Custom Aliases, Domains, Security)"}
                      </button>

                      {showAdvancedOptions && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4 bg-slate-50 border border-slate-200/50 p-4 rounded-xl">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Custom Alias (Pro)</label>
                            <input
                              type="text"
                              placeholder="my-brand-code"
                              value={customAlias}
                              onChange={(e) => setCustomAlias(e.target.value)}
                              disabled={!hasProAccess}
                              className="w-full bg-white border border-slate-250 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Custom Domain (Pro)</label>
                            <select
                              value={selectedCustomDomain}
                              onChange={(e) => setSelectedCustomDomain(e.target.value)}
                              disabled={!hasProAccess || !(user?.customDomains && user.customDomains.length > 0)}
                              className="w-full bg-white border border-slate-250 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              <option value="">minilinks.onrender.com (Default)</option>
                              {user?.customDomains?.map(d => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Password Layer</label>
                            <input
                              type="password"
                              placeholder="Optional password shield"
                              value={linkPassword}
                              onChange={(e) => setLinkPassword(e.target.value)}
                              className="w-full bg-white border border-slate-250 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Link Expiration</label>
                            <input
                              type="datetime-local"
                              value={expiresAt}
                              onChange={(e) => setExpiresAt(e.target.value)}
                              className="w-full bg-white border border-slate-250 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-600"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Campaign grouping</label>
                            <input
                              type="text"
                              placeholder="e.g. SummerPromo"
                              value={linkCampaign}
                              onChange={(e) => setLinkCampaign(e.target.value)}
                              className="w-full bg-white border border-slate-250 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Tags (Comma-separated)</label>
                            <input
                              type="text"
                              placeholder="e.g. social, bio, ad"
                              value={linkTags}
                              onChange={(e) => setLinkTags(e.target.value)}
                              className="w-full bg-white border border-slate-250 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </form>
                </div>
              )}

              {/* URL SEARCH AND FILTER BAR */}
              <div className="flex flex-col md:flex-row gap-3 bg-white border border-slate-200/80 p-4 rounded-xl shadow-2xs">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search by title, original URL, short code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-xs font-semibold rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-indigo-500"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>

                <div className="flex flex-wrap gap-2">
                  <select
                    value={selectedTagFilter}
                    onChange={(e) => setSelectedTagFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none cursor-pointer"
                  >
                    <option value="all">🏷️ All Tags</option>
                    {uniqueTagsList.map(tag => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>

                  <select
                    value={selectedCampaignFilter}
                    onChange={(e) => setSelectedCampaignFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none cursor-pointer"
                  >
                    <option value="all">💼 All Campaigns</option>
                    {uniqueCampaignsList.map(camp => (
                      <option key={camp} value={camp}>{camp}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* LIST OF CREATED LINKS */}
              <div className="space-y-3.5">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                    Your Workspace Links ({filteredUrlsList.length})
                  </span>
                </div>

                {isFetchingHistory ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 bg-slate-50 border border-slate-200/50 rounded-xl skeleton" />
                    ))}
                  </div>
                ) : filteredUrlsList.length === 0 ? (
                  <div className="text-center py-12 bg-white border border-slate-200/80 rounded-2xl">
                    <p className="text-xs text-slate-400 font-semibold">No shortened URLs match your active query. Shorten a link to begin!</p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {filteredUrlsList.map(u => (
                      <LinkCard
                        key={u.id}
                        url={u}
                        onDelete={handleDeleteLink}
                        onShowQR={handleShowQR}
                        onEdit={handleOpenEdit}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB VIEW: ANALYTICS DASHBOARD */}
          {activeTab === "analytics" && (
            <AnalyticsView urls={urls} />
          )}

          {/* TAB VIEW: LINK CAMPAIGNS */}
          {activeTab === "campaigns" && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FolderKanban className="w-5 h-5 text-indigo-500" /> Campaigns & Tagging
                </h2>
                <p className="text-xs text-slate-500 mt-1">Aggregate analytics of categorized link tags and campaign groupings.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Campaigns Breakdown list */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
                  <h3 className="text-sm font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Campaign Groupings</h3>
                  {uniqueCampaignsList.length === 0 ? (
                    <p className="text-xs text-slate-400 font-semibold py-4 text-center">Define campaign groupings in advanced shorten options.</p>
                  ) : (
                    <div className="space-y-3">
                      {uniqueCampaignsList.map(camp => {
                        const campaignLinks = urls.filter(u => u.campaign === camp);
                        const campaignClicks = campaignLinks.reduce((sum, u) => sum + (u.clicks || 0), 0);
                        return (
                          <div 
                            key={camp} 
                            onClick={() => { setSelectedCampaignFilter(camp); setSelectedTagFilter("all"); setActiveTab("links"); }}
                            className="p-3 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/60 rounded-xl flex justify-between items-center cursor-pointer transition-colors"
                          >
                            <div>
                              <span className="text-xs font-bold text-slate-800">💼 {camp}</span>
                              <span className="text-[10px] text-slate-400 font-bold block mt-0.5">{campaignLinks.length} links connected</span>
                            </div>
                            <span className="px-2.5 py-1 bg-white border border-slate-200 text-slate-800 text-[10px] font-bold rounded-lg shadow-2xs">
                              {campaignClicks} click{campaignClicks !== 1 ? "s" : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Tags Breakdown list */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
                  <h3 className="text-sm font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Top Categorization Tags</h3>
                  {uniqueTagsList.length === 0 ? (
                    <p className="text-xs text-slate-400 font-semibold py-4 text-center">Add tags in comma-separated fields when shortening.</p>
                  ) : (
                    <div className="space-y-3">
                      {uniqueTagsList.map(tag => {
                        const tagLinks = urls.filter(u => u.tags && u.tags.includes(tag));
                        const tagClicks = tagLinks.reduce((sum, u) => sum + (u.clicks || 0), 0);
                        return (
                          <div 
                            key={tag} 
                            onClick={() => { setSelectedTagFilter(tag); setSelectedCampaignFilter("all"); setActiveTab("links"); }}
                            className="p-3 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/60 rounded-xl flex justify-between items-center cursor-pointer transition-colors"
                          >
                            <div>
                              <span className="text-xs font-bold text-slate-800 flex items-center gap-1"><Tag className="w-3.5 h-3.5 text-slate-450" /> {tag}</span>
                              <span className="text-[10px] text-slate-400 font-bold block mt-0.5">{tagLinks.length} links connected</span>
                            </div>
                            <span className="px-2.5 py-1 bg-white border border-slate-200 text-slate-800 text-[10px] font-bold rounded-lg shadow-2xs">
                              {tagClicks} click{tagClicks !== 1 ? "s" : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB VIEW: SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              
              {/* Branded Custom Domains */}
              <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs space-y-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Globe className="w-4.5 h-4.5 text-indigo-500" /> Connected Branded Domains
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Configure your own domain to shorten links through. Point your domain's DNS CNAME record to: <span className="font-mono bg-slate-100 text-indigo-700 px-1 py-0.2 rounded font-bold">{PUBLIC_SHORT_DOMAIN}</span></p>
                </div>

                <form onSubmit={handleAddCustomDomain} className="flex gap-2.5 max-w-md">
                  <input
                    type="text"
                    placeholder="e.g. brand.link"
                    value={newDomainInput}
                    onChange={(e) => setNewDomainInput(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 text-xs font-semibold rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-2xs cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> Connect Domain
                  </button>
                </form>

                {/* Domains list */}
                <div className="space-y-2 mt-4 pt-2 border-t border-slate-100 max-w-lg">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Connected Domains ({user?.customDomains?.length || 0})</span>
                  {!(user?.customDomains && user.customDomains.length > 0) ? (
                    <p className="text-xs text-slate-400 font-semibold py-2">No custom domains connected yet. Point your DNS to connect domain.</p>
                  ) : (
                    user.customDomains.map(d => (
                      <div key={d} className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl flex justify-between items-center">
                        <span className="text-xs font-mono font-bold text-slate-800">{d}</span>
                        <button
                          onClick={() => handleRemoveCustomDomain(d)}
                          className="p-1.5 hover:bg-rose-50 text-slate-450 hover:text-rose-600 border border-transparent hover:border-rose-100 rounded-lg transition-colors cursor-pointer"
                          title="Revoke domain mapping"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Developer API Configuration keys */}
              <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs space-y-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Terminal className="w-4.5 h-4.5 text-indigo-500" /> Developer API Credentials
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Shorten links programmatically using bearer API authorization tokens. Developer endpoints require a Pro subscription.</p>
                </div>

                <div className="space-y-4">
                  {!(user?.apiTokens && user.apiTokens.length > 0) ? (
                    <button
                      onClick={handleGenerateDevApiToken}
                      disabled={!hasProAccess}
                      className="px-4.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all shadow-2xs disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" /> Generate Developer Token
                    </button>
                  ) : (
                    <div className="space-y-3 max-w-2xl">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Access Tokens ({user.apiTokens.length}/5)</span>
                        {user.apiTokens.length < 5 && (
                          <button
                            onClick={handleGenerateDevApiToken}
                            className="text-xs text-indigo-600 hover:underline font-bold cursor-pointer"
                          >
                            + Add Token
                          </button>
                        )}
                      </div>
                      
                      {user.apiTokens.map((tok, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-950 text-emerald-400 font-mono text-xs rounded-xl flex items-center justify-between border border-slate-900">
                          <span className="select-all truncate max-w-[400px]">{tok}</span>
                          <button
                            onClick={() => handleRevokeDevApiToken(tok)}
                            className="p-1.5 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                            title="Revoke Token"
                          >
                            <Trash2 className="w-4.5 h-4.5" />
                          </button>
                        </div>
                      ))}

                      <div className="bg-slate-50 border border-slate-200/50 p-4 rounded-xl space-y-2 mt-4">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Programmatic Shortening Shell Example:</span>
                        <pre className="bg-slate-950 text-slate-350 p-3 rounded-lg overflow-x-auto text-[10px] font-mono leading-relaxed">
{`curl -X POST "${window.location.origin}/api/shorten" \\
  -H "Authorization: Bearer ${user.apiTokens[0] || 'YOUR_API_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{"targetUrl": "https://google.com"}'`}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* GLOBAL TOAST BANNER */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed top-5 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 z-50 max-w-md w-full bg-slate-900 shadow-xl rounded-2xl p-4 text-white border border-slate-800 flex items-start gap-3"
          >
            <AlertCircle className={`w-5 h-5 shrink-0 ${toastMessage.type === "error" ? "text-rose-400" : "text-emerald-450"}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-neutral-300">
                {toastMessage.text}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EDIT CONFIGURATION MODAL */}
      <AnimatePresence>
        {editingUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingUrl(null)}
              className="absolute inset-0 bg-black/45 backdrop-blur-xs"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/80 p-6 z-10 space-y-4 text-slate-900"
            >
              <div>
                <h3 className="font-bold text-slate-900 text-base">Edit Link Parameters</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Modify parameters of short code: /{editingUrl.id}</p>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Destination URL</label>
                  <input
                    type="text"
                    required
                    value={editTargetUrl}
                    onChange={(e) => setEditTargetUrl(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Expiration Date</label>
                    <input
                      type="datetime-local"
                      value={editExpiresAt}
                      onChange={(e) => setEditExpiresAt(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Password Shield</label>
                    <input
                      type="password"
                      placeholder="No password limit"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Campaign</label>
                    <input
                      type="text"
                      placeholder="e.g. WinterSale"
                      value={editCampaign}
                      onChange={(e) => setEditCampaign(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Branded Domain</label>
                    <select
                      value={editCustomDomain}
                      onChange={(e) => setEditCustomDomain(e.target.value)}
                      disabled={!hasProAccess || !(user?.customDomains && user.customDomains.length > 0)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="">minilinks.onrender.com (Default)</option>
                      {user?.customDomains?.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Tags (Comma-separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. ad, email"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex gap-2.5 pt-3 border-t border-slate-100 justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingUrl(null)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-2xs cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global QR Code Modal */}
      <QRModal
        isOpen={qrModal.isOpen}
        onClose={() => setQrModal(prev => ({ ...prev, isOpen: false }))}
        shortUrl={qrModal.shortUrl}
        title={qrModal.title}
      />

    </div>
  );
}
