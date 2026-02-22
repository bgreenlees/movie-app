"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import toast from "react-hot-toast";
import type { TMDBWatchProvider } from "@/lib/tmdb";

interface Friend {
  connectionId: string;
  friend: { id: string; name: string | null; email: string };
}

interface PendingRequest {
  id: string;
  requester: { id: string; name: string | null; email: string };
}

export default function ProfilePage() {
  const [allProviders, setAllProviders] = useState<TMDBWatchProvider[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Friends state
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [friendEmail, setFriendEmail] = useState("");
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  const loadConnections = async () => {
    try {
      const res = await fetch("/api/connections");
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
        setPending(data.pending || []);
      }
    } catch {
      // silently fail
    }
  };

  useEffect(() => {
    const load = async () => {
      const [providersRes, userRes] = await Promise.all([
        fetch("/api/movies/providers"),
        fetch("/api/user/streaming"),
      ]);

      if (providersRes.ok) {
        const data = await providersRes.json();
        setAllProviders(data.providers || []);
      }

      if (userRes.ok) {
        const data = await userRes.json();
        setSelected(new Set(data.streamingServices || []));
      }

      setIsLoading(false);
    };

    load();
    loadConnections();
  }, []);

  const toggle = async (providerId: number) => {
    const next = new Set(selected);
    if (next.has(providerId)) {
      next.delete(providerId);
    } else {
      next.add(providerId);
    }
    setSelected(next);

    setIsSaving(true);
    try {
      const res = await fetch("/api/user/streaming", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamingServices: Array.from(next) }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save: ${message}`);
      setSelected(selected);
    } finally {
      setIsSaving(false);
    }
  };

  const sendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendEmail.trim()) return;
    setIsSendingRequest(true);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: friendEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send request");
      toast.success("Friend request sent!");
      setFriendEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setIsSendingRequest(false);
    }
  };

  const acceptRequest = async (connectionId: string) => {
    try {
      const res = await fetch(`/api/connections/${connectionId}`, { method: "PATCH" });
      if (!res.ok) throw new Error();
      toast.success("Friend added!");
      loadConnections();
    } catch {
      toast.error("Failed to accept request");
    }
  };

  const declineRequest = async (connectionId: string) => {
    try {
      const res = await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Request declined");
      loadConnections();
    } catch {
      toast.error("Failed to decline request");
    }
  };

  const removeFriend = async (connectionId: string) => {
    try {
      const res = await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Friend removed");
      loadConnections();
    } catch {
      toast.error("Failed to remove friend");
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-12">
      {/* Streaming Services */}
      <div>
        <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--primary)" }}>
          Profile
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
          Select the streaming services you subscribe to. We'll highlight them when adding movies.
        </p>

        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--foreground)" }}>
          My Streaming Services
          {isSaving && <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted)" }}>Saving...</span>}
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {allProviders.map((provider) => {
            const isSelected = selected.has(provider.provider_id);
            return (
              <button
                key={provider.provider_id}
                onClick={() => toggle(provider.provider_id)}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all"
                style={{
                  borderColor: isSelected ? "var(--accent)" : "var(--border)",
                  backgroundColor: isSelected ? "color-mix(in srgb, var(--accent) 10%, var(--card-bg))" : "var(--card-bg)",
                }}
              >
                <div className="relative">
                  <Image
                    src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
                    alt={provider.provider_name}
                    width={48}
                    height={48}
                    className="rounded-lg"
                  />
                  {isSelected && (
                    <div
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs"
                      style={{ backgroundColor: "var(--accent)" }}
                    >
                      ✓
                    </div>
                  )}
                </div>
                <span className="text-xs text-center font-medium leading-tight" style={{ color: "var(--foreground)" }}>
                  {provider.provider_name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Friends */}
      <div>
        <h2 className="text-2xl font-bold mb-6" style={{ color: "var(--primary)" }}>
          Friends
        </h2>

        {/* Add a friend */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
            Add a Friend
          </h3>
          <form onSubmit={sendFriendRequest} className="flex gap-2">
            <input
              type="email"
              value={friendEmail}
              onChange={(e) => setFriendEmail(e.target.value)}
              placeholder="Enter their email address"
              className="flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--card-bg)",
                color: "var(--foreground)",
              }}
            />
            <button
              type="submit"
              disabled={isSendingRequest || !friendEmail.trim()}
              className="px-4 py-2 text-sm text-white rounded-md transition-all hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {isSendingRequest ? "Sending…" : "Send Request"}
            </button>
          </form>
        </div>

        {/* Pending incoming requests */}
        {pending.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              Pending Requests
            </h3>
            <div className="space-y-2">
              {pending.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--card-bg)" }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                      {req.requester.name || req.requester.email}
                    </p>
                    {req.requester.name && (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {req.requester.email}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptRequest(req.id)}
                      className="px-3 py-1 text-xs text-white rounded-md hover:opacity-80 transition-all"
                      style={{ backgroundColor: "var(--accent)" }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => declineRequest(req.id)}
                      className="px-3 py-1 text-xs rounded-md border hover:bg-[var(--hover-bg)] transition-all"
                      style={{ color: "var(--foreground)", borderColor: "var(--border)" }}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accepted friends */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
            My Friends
          </h3>
          {friends.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No friends yet. Send a request above to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {friends.map(({ connectionId, friend }) => (
                <div
                  key={connectionId}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--card-bg)" }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                      {friend.name || friend.email}
                    </p>
                    {friend.name && (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {friend.email}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/watch-together/${friend.id}`}
                      className="px-3 py-1 text-xs text-white rounded-md hover:opacity-80 transition-all"
                      style={{ backgroundColor: "var(--accent)" }}
                    >
                      Watch Together
                    </Link>
                    <button
                      onClick={() => removeFriend(connectionId)}
                      className="px-3 py-1 text-xs rounded-md border hover:bg-[var(--hover-bg)] transition-all"
                      style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
