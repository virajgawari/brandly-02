"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useStore } from "@/lib/store";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const hydrate = useStore((s) => s.hydrate);
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const res = await fetch("/api/workspace/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).catch(() => null);
      if (res?.ok) {
        await hydrate();
        window.location.href = "/";
        return;
      }
      const body = await res?.json().catch(() => ({}));
      setError(body?.error ?? "Couldn't accept this invite. Check your connection and try again.");
    })();
  }, [token, hydrate]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-2">
        <h1 className="text-lg font-medium">{error ? "Invite problem" : "Joining workspace…"}</h1>
        {error ? <p role="alert" className="text-sm text-text-muted">{error}</p> : <p className="text-sm text-text-muted">One moment.</p>}
        {error && <a href="/" className="text-sm underline">Go to Brandly</a>}
      </div>
    </main>
  );
}
