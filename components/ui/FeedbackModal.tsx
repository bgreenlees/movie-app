"use client";

import { useState } from "react";
import toast from "react-hot-toast";

interface FeedbackModalProps {
  onClose: () => void;
}

export default function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error();
      toast.success("Thanks! Your suggestion has been sent.");
      onClose();
    } catch {
      toast.error("Failed to send — please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl p-6 shadow-2xl"
        style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--foreground)" }}>
          Suggest a Feature
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          What would make this app better?
        </p>

        <form onSubmit={handleSubmit}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your idea..."
            rows={4}
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            style={{
              backgroundColor: "var(--background)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
          />

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-sm transition-colors hover:bg-[var(--hover-bg)] cursor-pointer"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!message.trim() || isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg text-sm text-white transition-all cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {isSubmitting ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
