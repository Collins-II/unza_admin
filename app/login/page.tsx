"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && (session.user.role === "staff" || session.user.role === "admin")) {
      router.replace("/admin");
    }
  }, [status, session, router]);

  useEffect(() => {
    void fetch("/api/admin/bootstrap")
      .then((response) => response.ok ? response.json() : { setupRequired: false })
      .then((data) => setSetupRequired(data.setupRequired === true))
      .catch(() => setSetupRequired(false));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await signIn("credentials", { studentId: staffId, password, redirect: false });
    if (result?.error) {
      setError("Staff ID/email or password is invalid, or this account is not active.");
      setPending(false);
      return;
    }
    router.replace("/admin");
    router.refresh();
  };

  return (
    <main className="min-h-dvh bg-[#052e16] px-4 py-8 sm:flex sm:items-center sm:justify-center">
      <section className="w-full max-w-md bg-white p-7 text-[#052e16] shadow-2xl sm:p-10">
        <div className="mb-8 flex items-center gap-4 border-b-4 border-emerald-600 pb-6">
          <Image src="/images/unza_logo.jpg" width={60} height={60} alt="University of Zambia" className="rounded" />
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">University of Zambia</p><h1 className="mt-1 text-3xl font-black uppercase">Central Admin</h1></div>
        </div>
        <p className="mb-6 text-sm text-gray-600">Secure access for university staff and administrators managing academic operations.</p>
        {error && <div className="mb-4 border-2 border-rose-700 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          <label className="block"><span className="ui-label">Staff ID or university email</span><input className="ui-input" value={staffId} onChange={(event) => setStaffId(event.target.value)} autoComplete="username" required /></label>
          <label className="block"><span className="ui-label">Password</span><input className="ui-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          <button className="ui-btn ui-btn-primary w-full" disabled={pending}>{pending ? "Authenticating..." : "Enter central administration"}</button>
        </form>
        <p className="mt-6 text-center text-xs text-gray-500">Staff accounts are provisioned by a university administrator.</p>
        {setupRequired && <Link href="/setup" className="mt-3 block text-center text-xs font-black uppercase tracking-wider text-emerald-700 hover:text-emerald-900">Set up the first administrator</Link>}
      </section>
    </main>
  );
}
