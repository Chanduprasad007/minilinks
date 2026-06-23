import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Copy, Check, QrCode, Trash2, Calendar, MousePointerClick, ExternalLink } from "lucide-react";
import { ShortUrl } from "../types";

interface LinkCardProps {
  url: ShortUrl;
  onDelete: (id: string) => Promise<void>;
  onShowQR: (url: string, title: string) => void;
}

export default function LinkCard({ url, onDelete, onShowQR }: LinkCardProps) {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Compute absolute short URL link and branded shorter URL
  const absoluteShortUrl = `${window.location.protocol}//${window.location.host}/${url.id}`;
  const brandedShortUrl = `short.ly/${url.id}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(`https://${brandedShortUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteTrigger = async () => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      // Reset confirmation if unused after 3 seconds
      setTimeout(() => setIsConfirmingDelete(false), 3000);
    } else {
      setIsDeleting(true);
      await onDelete(url.id);
      setIsDeleting(false);
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    } catch (_) {
      return "Recently";
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`relative bg-white rounded-xl border ${
        isConfirmingDelete ? "border-rose-200 bg-rose-50/10" : "border-slate-200"
      } p-5 hover:border-slate-300 hover:shadow-2xs transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4`}
    >
      {/* Visual Indicator of click health */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="font-display font-semibold text-slate-900 truncate max-w-[280px] sm:max-w-md md:max-w-lg lg:max-w-xl text-base" title={url.title}>
            {url.title || "Untitled Link"}
          </span>
          {url.customAlias && (
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold tracking-wider rounded-md uppercase border border-indigo-100">
              Alias
            </span>
          )}
        </div>

        {/* Shortened target link highlight */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
          <a
            href={`https://${brandedShortUrl}`}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:text-indigo-700 font-mono text-sm md:text-base font-bold inline-flex items-center gap-1 hover:underline"
            onClick={(e) => {
              // Standard behavior is to open custom branded URL, but prevent it/show alert or copy if clicked
              e.preventDefault();
              handleCopy();
            }}
            title={`Copy brand link: https://${brandedShortUrl}`}
          >
            {brandedShortUrl}
            <ExternalLink className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          </a>
          
          <a
            href={absoluteShortUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded text-[10px] font-semibold transition-all"
            title="Launch active redirection server check"
          >
            Test Redirection ↗
          </a>
        </div>

        {/* Truncated Long Original Destination URL */}
        <div className="text-xs text-slate-400 flex items-center gap-1 max-w-full">
          <span className="font-mono truncate select-all block max-w-[280px] sm:max-w-md md:max-w-lg lg:max-w-xl" title={url.targetUrl}>
            {url.targetUrl}
          </span>
        </div>
      </div>

      {/* Interactive Controls & Clicking Metrics */}
      <div className="flex items-center flex-wrap md:flex-nowrap gap-3 shrink-0 mt-3 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
        {/* Analytics Click Counter badge */}
        <div className="flex flex-col items-start md:items-end justify-center min-w-[70px] pr-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Clicks</span>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <MousePointerClick className="w-3.5 h-3.5 text-indigo-500" />
            <motion.span
              key={url.clicks}
              initial={{ scale: 1.25, color: "#4f46e5" }}
              animate={{ scale: 1, color: "#0f172a" }}
              transition={{ duration: 0.3 }}
            >
              {url.clicks}
            </motion.span>
          </span>
        </div>

        {/* Date Stamp */}
        <div className="flex flex-col items-start md:items-end justify-center min-w-[90px] pr-3 hidden sm:flex">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Created</span>
          <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium">
            <Calendar className="w-3 h-3 text-slate-400" />
            {formatDate(url.createdAt)}
          </span>
        </div>

        {/* Copy, QR, and Delete controls */}
        <div className="flex items-center gap-1.5 ml-auto md:ml-0">
          {/* Quick Copy button */}
          <button
            onClick={handleCopy}
            className={`flex items-center justify-center h-9 w-9 rounded-lg border text-slate-600 hover:bg-slate-50 transition-all cursor-pointer ${
              copied ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 shadow-2xs"
            }`}
            title="Copy shortened link"
            id={`copy-btn-${url.id}`}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600 animate-in fade-in" /> : <Copy className="w-4 h-4" />}
          </button>

          {/* Quick QR code button */}
          <button
            onClick={() => onShowQR(absoluteShortUrl, url.title || absoluteShortUrl)}
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs"
            title="Show QR Code"
            id={`qr-btn-${url.id}`}
          >
            <QrCode className="w-4 h-4" />
          </button>

          {/* Destructive Delete Button */}
          <button
            onClick={handleDeleteTrigger}
            disabled={isDeleting}
            className={`relative flex items-center justify-center px-3.5 h-9 rounded-lg border text-xs font-semibold overflow-hidden transition-all duration-200 cursor-pointer ${
              isConfirmingDelete
                ? "border-rose-300 bg-rose-600 text-white hover:bg-rose-700"
                : "border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-100 hover:bg-rose-50/45 shadow-2xs"
            }`}
            title={isConfirmingDelete ? "Click again to confirm deletion" : "Delete shortened link"}
            id={`delete-btn-${url.id}`}
          >
            <span className="flex items-center gap-1.5">
              <Trash2 className={`w-3.8 h-3.8 ${isConfirmingDelete ? "animate-bounce" : ""}`} />
              <AnimatePresence mode="wait">
                {isConfirmingDelete ? (
                  <motion.span
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: "auto", opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    className="whitespace-nowrap inline-block"
                  >
                    Confirm?
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
