"use client";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/components/api";
import { Button, ErrorNote, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/login", { body: { email, password } });
      // Follow "next" only when it resolves to this same site; anything else goes to the dashboard.
      let target = "/dashboard";
      const next = new URLSearchParams(window.location.search).get("next");
      if (next) {
        try {
          const u = new URL(next, window.location.origin);
          if (u.origin === window.location.origin) target = u.pathname + u.search;
        } catch { /* malformed: ignore */ }
      }
      window.location.href = target;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="hidden flex-col justify-between bg-canopy-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-[5px] bg-[#e9c984] font-mono text-[14px] font-semibold text-canopy-950">OC</span>
          <span className="text-[15px] font-semibold">Oakcraft</span>
        </div>
        <div>
          <p className="max-w-[18ch] text-[34px] font-semibold leading-[1.12] tracking-[-0.02em]">One Master SKU. Every marketplace listing under it.</p>
          <div className="mt-8 max-w-[420px] rounded-lg border border-white/15 bg-white/5 p-4 font-mono text-[12.5px] leading-7">
            <p><span className="rounded-[3px] bg-[#e9c984] px-1.5 py-0.5 font-medium text-canopy-950">OC-MATRIX-001</span></p>
            <p className="pl-4 text-white/80">├─ Amazon&nbsp;&nbsp;&nbsp;&nbsp;MATRIX-BLK-01</p>
            <p className="pl-4 text-white/80">├─ Flipkart&nbsp;&nbsp;FK-MATRIX-BLK</p>
            <p className="pl-4 text-white/80">└─ Myntra&nbsp;&nbsp;&nbsp;&nbsp;MY-MATRIX-BLK</p>
          </div>
        </div>
        <p className="text-[12.5px] text-white/50">Master SKU CRM for Oakcraft Furniture</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-[360px]">
          <h1 className="text-[24px] font-semibold tracking-[-0.01em]">Sign in</h1>
          <p className="mt-1 text-[13.5px] text-ink-3">Use the account your admin created for you.</p>
          <div className="mt-6 space-y-4">
            {error && <ErrorNote>{error}</ErrorNote>}
            <Field label="Email"><Input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Button type="submit" variant="primary" loading={busy} className="w-full">Sign in</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
