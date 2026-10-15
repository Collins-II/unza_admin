"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function SetupPage() {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [form, setForm] = useState({ name: "", staffId: "", email: "", department: "", password: "", confirmPassword: "", setupToken: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/bootstrap", { signal: controller.signal })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Unable to check setup status.");
        setSetupRequired(data.setupRequired === true);
      })
      .catch((loadError) => {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError(loadError instanceof Error ? loadError.message : "Unable to check setup status.");
      });
    return () => controller.abort();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/admin/bootstrap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create the administrator account.");
      setNotice("Administrator account created. You can now sign in.");
      setSetupRequired(false);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Unable to create the administrator account.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-dvh bg-[#052e16] px-4 py-8 sm:flex sm:items-center sm:justify-center">
      <section className="w-full max-w-2xl bg-white p-7 text-[#052e16] shadow-2xl sm:p-10">
        <div className="mb-8 flex items-center gap-4 border-b-4 border-emerald-600 pb-6"><Image src="/images/unza_logo.jpg" width={60} height={60} alt="University of Zambia" className="rounded" /><div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">University of Zambia</p><h1 className="mt-1 text-3xl font-black uppercase">Initial setup</h1></div></div>
        {setupRequired === null && !error && <p className="text-sm text-gray-600">Checking whether the central administration system needs setup...</p>}
        {error && <div className="mb-4 border-2 border-rose-700 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</div>}
        {notice && <div className="mb-4 border-2 border-emerald-700 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{notice}</div>}
        {setupRequired === true && <form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><p className="md:col-span-2 text-sm text-gray-600">Create the first system administrator. This bootstrap route closes permanently after the first staff/admin account exists. In production, enter the value configured as <code>INITIAL_ADMIN_SETUP_TOKEN</code>.</p><label><span className="ui-label">Full name</span><input className="ui-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label><span className="ui-label">Staff ID</span><input className="ui-input" value={form.staffId} onChange={(event) => setForm({ ...form, staffId: event.target.value })} placeholder="e.g. UNZA-ADM-001" required /></label><label><span className="ui-label">University email</span><input className="ui-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label><span className="ui-label">Department / unit</span><input className="ui-input" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder="Academic Affairs" /></label><label><span className="ui-label">Password</span><input className="ui-input" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={12} required /></label><label><span className="ui-label">Confirm password</span><input className="ui-input" type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} minLength={12} required /></label><label className="md:col-span-2"><span className="ui-label">Initial setup token</span><input className="ui-input" type="password" value={form.setupToken} onChange={(event) => setForm({ ...form, setupToken: event.target.value })} placeholder="Required when INITIAL_ADMIN_SETUP_TOKEN is configured" /></label><button className="ui-btn ui-btn-primary md:col-span-2" disabled={pending}>{pending ? "Creating administrator..." : "Create initial administrator"}</button></form>}
        {setupRequired === false && <div className="space-y-4"><p className="text-sm text-gray-600">Initial setup is unavailable because the central system already has a staff/admin account.</p><Link className="ui-btn ui-btn-primary" href="/login">Go to staff sign in</Link></div>}
      </section>
    </main>
  );
}
