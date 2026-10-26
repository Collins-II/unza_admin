"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, CalendarDays, CheckCheck, CircleAlert, GraduationCap, Layers3, ShieldCheck, Sparkles } from "lucide-react";
import type { Metrics, Tab } from "./types";

type Operations = {
  calendar: null | { status: string; teachingStartDate: string; teachingEndDate: string; assessmentStartDate: string; assessmentEndDate: string };
  alerts: { id: string; title: string; description: string; count: number; severity: "warning" | "info"; destination: Tab }[];
  upcomingAssessments: { _id: string; title: string; date: string; startTime: string; endTime: string; assessmentType: string; status: string; course?: { code: string }; room?: { code: string } }[];
  generatedAt: string;
};

export function OperationsHub({ metrics, academicYear, semester, departmentFilter, onNavigate, revision, availableTabs }: {
  metrics: Metrics | null; academicYear: string; semester: string; departmentFilter: string; onNavigate: (tab: Tab) => void; revision: number; availableTabs: Tab[];
}) {
  const [data, setData] = useState<Operations | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const key = `${academicYear}:${semester}:${departmentFilter}:${revision}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setError("");
      try {
        const response = await fetch(`/api/admin/operations?${new URLSearchParams({ academicYear, semester, ...(departmentFilter ? { department: departmentFilter } : {}) })}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load operations.");
        if (!controller.signal.aborted) { setData(result); setLoadedKey(key); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load operations."); }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [academicYear, semester, departmentFilter, revision, retry, key]);
  const fresh = loadedKey === key && !error;
  const cards = [
    { label: "Active students", value: metrics?.students, icon: GraduationCap, note: "Within your access scope", destination: "students" },
    { label: "Configured courses", value: metrics?.courses, icon: BookOpen, note: "Ready for academic planning", destination: "courses" },
    { label: "Published teaching", value: metrics?.publishedClasses, icon: CalendarDays, note: "Selected planning cycle", destination: "timetable" },
    { label: "Available campus spaces", value: metrics?.activeRooms, icon: Layers3, note: "University-wide shared resources", destination: "rooms" },
  ] as const;
  return <div className="operations-hub space-y-6">
    <section className="operations-hero">
      <div className="relative z-10 max-w-2xl"><span className="operations-kicker"><Sparkles size={14} /> ONE CAMPUS. CONNECTED OPERATIONS.</span>
        <h3 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl xl:text-5xl">Clarity for every<br /><span className="text-emerald-200">academic decision.</span></h3>
        <p className="mt-4 max-w-lg text-sm leading-6 text-emerald-50/70">From departmental planning to student-facing schedules. A single workspace to prepare, review and deliver the university experience.</p>
        <div className="mt-6 flex flex-wrap gap-3"><button className="operations-hero-action" onClick={() => onNavigate("approvals")}>Open review queue <ArrowUpRight size={16} /></button><button className="operations-hero-secondary" onClick={() => onNavigate("calendar")}>Academic calendar <CalendarDays size={16} /></button></div>
      </div>
      <div className="operations-cycle"><span className="text-[10px] uppercase tracking-[.18em] text-emerald-100/60">Planning cycle</span><strong className="mt-2 block text-2xl">{academicYear}</strong><span className="mt-1 block text-sm text-emerald-100/70">{semester}</span><div className="mt-5 border-t border-white/15 pt-4 text-xs">{!fresh ? "Checking calendar..." : data?.calendar?.status === "approved" ? <span className="flex items-center gap-2 text-emerald-200"><ShieldCheck size={16} /> Calendar approved</span> : <span className="flex items-center gap-2 text-amber-200"><CircleAlert size={16} /> Calendar needs approval</span>}</div></div>
    </section>
    <section aria-label="Live operations metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, note, destination }) => <button key={label} disabled={!availableTabs.includes(destination)} className="ui-card operations-metric text-left" onClick={() => onNavigate(destination)}><span className="operations-metric-icon"><Icon size={20} /></span><p className="mt-5 text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value === undefined ? "—" : value.toLocaleString()}</p><p className="mt-3 text-[10px] text-slate-500">{note}</p>{availableTabs.includes(destination) && <ArrowUpRight className="operations-metric-arrow" size={16} />}</button>)}</section>
    {error && <div role="alert" className="ui-card text-sm text-rose-800">{error} <button className="ml-2 underline" onClick={() => setRetry(retry + 1)}>Retry priorities</button></div>}
    <div className="grid items-start gap-6 xl:grid-cols-[1.2fr_1fr]">
      <section className="ui-card"><div className="flex items-center justify-between gap-3"><div><p className="ui-eyebrow">Your next best action</p><h3 className="ui-title mt-1 text-xl">Attention centre</h3></div><span className="operations-live"><span /> Live records</span></div>
        {!fresh && !error && <p role="status" className="py-8 text-sm text-slate-500">Updating operational priorities...</p>}
        {fresh && <div className="mt-5 space-y-2">{data?.alerts.length ? data.alerts.map((alert) => <button key={alert.id} className={`operations-alert ${alert.severity}`} onClick={() => onNavigate(alert.destination)}><span className="operations-alert-count">{alert.count}</span><span className="min-w-0 flex-1"><strong className="block text-sm">{alert.title}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{alert.description}</span></span><ArrowUpRight className="shrink-0 text-slate-400" size={17} /></button>) : <div className="operations-empty"><CheckCheck size={28} /><strong className="mt-3 block">No queued actions in this cycle</strong><p className="mt-1 text-xs">Continue planning or review the academic calendar.</p></div>}</div>}
      </section>
      <section className="ui-card"><div className="flex items-center justify-between"><div><p className="ui-eyebrow">On the horizon</p><h3 className="ui-title mt-1 text-xl">Assessment agenda</h3></div><button aria-label="Open assessments" className="operations-icon-button" onClick={() => onNavigate("assessments")}><ArrowUpRight size={18} /></button></div>
        {fresh && data?.upcomingAssessments.length ? <ol className="mt-5 space-y-4">{data.upcomingAssessments.map((item) => <li key={item._id} className="flex gap-3"><div className="operations-date"><span>{item.date.slice(5, 7)}</span><strong>{item.date.slice(8)}</strong></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.course?.code} · {item.title}</p><p className="mt-1 text-xs text-slate-500">{item.date} · {item.startTime}-{item.endTime} · {item.room?.code || "Venue needs review"}</p><span className="data-status mt-2">{item.assessmentType} · {item.status}</span></div></li>)}</ol> : <div className="operations-empty"><CalendarDays size={28} /><strong className="mt-3 block">{fresh ? "A clear upcoming agenda" : "Loading agenda..."}</strong><p className="mt-1 text-xs">Upcoming drafts and published assessments appear here. Times are Africa/Lusaka.</p></div>}
      </section>
    </div>
    <section className="grid gap-3 md:grid-cols-3">{[
      { title: "Plan with confidence", text: "Configure courses, rosters and capacity-safe teaching streams.", destination: "timetable", icon: CalendarDays },
      { title: "Govern every publication", text: "Independent review, unchanged draft snapshots and durable audit history.", destination: "approvals", icon: ShieldCheck },
      { title: "Build from verified evidence", text: "Review the Economics departmental drafts without inventing missing data.", destination: "academic-source", icon: BookOpen },
    ].filter(({ destination }) => availableTabs.includes(destination as Tab)).map(({ title, text, destination, icon: Icon }) => <button key={title} className="operations-launch" onClick={() => onNavigate(destination as Tab)}><Icon size={20} /><strong className="mt-4 block text-sm">{title}</strong><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p><span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-emerald-800">Open workspace <ArrowUpRight size={14} /></span></button>)}</section>
    {fresh && data && <p className="text-right text-[10px] text-slate-400">Database snapshot {new Date(data.generatedAt).toLocaleString("en-GB", { timeZone: "Africa/Lusaka" })} · Africa/Lusaka · No synthetic trends</p>}
  </div>;
}
