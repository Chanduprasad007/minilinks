import { motion, AnimatePresence } from "motion/react";
import { X, Copy, Check, QrCode, Download } from "lucide-react";
import { useState } from "react";

interface QRModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortUrl: string;
  title: string;
}

export default function QRModal({ isOpen, onClose, shortUrl, title }: QRModalProps) {
  const [copied, setCopied] = useState(false);
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(shortUrl)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `qr_${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      // Fallback: Open in new tab or show error
      window.open(qrCodeUrl, "_blank");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/45 backdrop-blur-xs"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden z-10 p-6 flex flex-col items-center"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Close modal"
              id="qr-modal-close-btn"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Title / Description */}
            <div className="text-center mb-5 mt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full mb-2 border border-indigo-100">
                <QrCode className="w-3 h-3" /> Quick QR Code
              </span>
              <h3 className="text-lg font-bold text-slate-900 line-clamp-1 px-4">{title}</h3>
              <p className="text-xs text-slate-500 mt-1">Scan or download this QR code to share</p>
            </div>

            {/* QR Code Container */}
            <div className="border border-slate-100 p-4 bg-slate-50 rounded-xl relative flex items-center justify-center min-h-[200px] min-w-[200px]">
              <img
                src={qrCodeUrl}
                alt={`QR code for ${shortUrl}`}
                className="w-48 h-48 rounded-md bg-white shadow-xs"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            </div>

            {/* Short URL Box */}
            <div className="w-full mt-5">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-sm font-mono text-slate-600 select-all overflow-hidden text-ellipsis whitespace-nowrap flex-1 px-1">
                  {shortUrl}
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center justify-center p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-xs shrink-0"
                  title="Copy link"
                  id="qr-modal-copy-btn"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Download Button */}
            <button
              onClick={handleDownload}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
              id="qr-modal-download-btn"
            >
              <Download className="w-4 h-4" /> Download QR Image
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
