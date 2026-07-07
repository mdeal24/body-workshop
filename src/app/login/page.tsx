"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8"
      >
        <h1 className="mb-1 text-2xl font-bold">Body Workshop</h1>
        <p className="mb-6 text-sm text-zinc-400">Enter the shared password.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 outline-none focus:border-emerald-500"
        />
        {error && (
          <p className="mb-3 text-sm text-red-400">Wrong password, try again.</p>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-lg bg-emerald-600 px-3 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Enter"}
        </button>
      </form>
    </main>
  );
}
