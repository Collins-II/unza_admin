"use client";

import { useContext, useState } from "react";
import { useSession } from "next-auth/react";
import { Sparkles } from "lucide-react";
import { AdminActivityContext } from "./DataWorkspace";

type PlannedSession = {
  courseId: string; courseCode?: string; courseTitle?: string; roomCode?: string; roomName?: string; roomCapacity?: number;
  group: string; dayOfWeek: string; startTime: string; endTime: string; stream: string; streamIndex: number; streamCount: number; streamSize: number;
};
type GenerationResult = {
  sessions: PlannedSession[];
  unscheduled: { courseId: string; courseCode: string; reason: string; studentsUnplaced: number }[];
  warnings: string[];
  stats: { courses: number; sessions: number; streams: number; splitCourses: number; unscheduledCourses: number };
};

type Props = {
  academicYear: string;
  semester: string;
  departmentFilter: string;
  onSaved: (message: string) => void;
};

export function TimetableGenerator({ academicYear, semester, departmentFilter, onSaved }: Props) {
  const { data: session } = useSession();
  const setWorkspaceBusy = useContext(AdminActivityContext);
  const [options, setOptions] = useState({ maxVenueRadiusM: "500", dayStart: "08:00", dayEnd: "18:00", maxStreams: "8", includeSaturday: false, replaceDrafts: true });
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "save" | "publish" | "setup">("");
  const [error, setError] = useState("");
  const [previewPage, setPreviewPage] = useState(0);
  const [streamPage, setStreamPage] = useState(0);

  const scopeLabel = departmentFilter ? "the selected department" : "all departments";

  const setupDemo = async () => {
    if (!window.confirm(`Connect the current 1000-student fixtures to synthetic courses under verified UNZA departments for ${semester}? Use a separate test database. Legacy profiles are not overwritten. No schedule will be published.`)) return;
    setBusy("setup");
    setWorkspaceBusy?.(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/admin/timetable/mock-data", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semester }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to set up demo data.");
      onSaved(`${data.students} demo students linked to ${data.courses} synthetic courses with ${data.rooms} test rooms in ${data.semester}. Select all departments (or a UNZA department), then preview the schedule.`);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Unable to set up demo data.");
    } finally {
      setBusy("");
      setWorkspaceBusy?.(false);
    }
  };

  const run = async (mode: "preview" | "save" | "publish") => {
    if (mode === "publish" && !window.confirm("Publish this complete timetable? It will take priority over room bookings and automatically cancel any conflicting pending or confirmed bookings.")) return;
    setBusy(mode);
    setWorkspaceBusy?.(true);
    setError("");
    try {
      const response = await fetch("/api/admin/timetable/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicYear, semester, department: departmentFilter || undefined,
          maxVenueRadiusM: Number(options.maxVenueRadiusM), maxStreams: Number(options.maxStreams),
          dayStart: options.dayStart, dayEnd: options.dayEnd, includeSaturday: options.includeSaturday, replaceDrafts: options.replaceDrafts,
          dryRun: mode === "preview", publish: mode === "publish",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate the timetable.");
      setResult(data.result);
      setPreviewPage(0);
      setStreamPage(0);
      if (mode !== "preview") {
        const bookingNotice = mode === "publish" && data.cancelledBookings
          ? ` ${data.cancelledBookings} conflicting booking${data.cancelledBookings === 1 ? " was" : "s were"} cancelled.`
          : "";
        onSaved(`${data.saved} class sessions ${mode === "publish" ? "published" : "saved as drafts"} for ${scopeLabel}.${bookingNotice}`);
        setResult(null);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Unable to generate the timetable.");
    } finally {
      setBusy("");
      setWorkspaceBusy?.(false);
    }
  };

  const streamed = result ? Object.values(result.sessions.reduce<Record<string, PlannedSession>>((groups, session) => {
    if (session.streamCount > 1) groups[`${session.courseId}|${session.stream}`] = session;
    return groups;
  }, {})) : [];

  return (
    <section className="ui-card mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="ui-eyebrow">Auto scheduler</p><h3 className="ui-title text-2xl">Generate timetable</h3><p className="mt-2 max-w-2xl text-sm text-gray-600">Places every unscheduled {semester} course in {scopeLabel}. Cohorts that exceed a venue are split into streams, and the remainder moves to other venue slots. Classes stay within walking distance and travel time.</p></div>
      </div>
      {process.env.NODE_ENV === "development" && session?.user.role === "admin" && (
        <div className="mt-4 border-2 border-amber-600 bg-amber-50 p-3 text-sm">
          <strong>Development test data</strong>
          <p className="mt-1">Version 2 distributes 1,000 fictional students across verified UNZA departments with explicitly synthetic department and school-shared courses. These are not official university courses. Use a separate transaction-capable test database; existing legacy mock accounts and published schedules are not migrated.</p>
          <button type="button" disabled={Boolean(busy)} onClick={() => void setupDemo()} className="ui-btn ui-btn-secondary mt-3">{busy === "setup" ? "Connecting demo data..." : "Connect mock students"}</button>
        </div>
      )}
      <fieldset disabled={Boolean(busy)} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onChange={() => setResult(null)}>
        <label><span className="ui-label">Max venue radius (m)</span><input className="ui-input" type="number" min={50} max={5000} step={50} value={options.maxVenueRadiusM} onChange={(event) => setOptions({ ...options, maxVenueRadiusM: event.target.value })} /></label>
        <label><span className="ui-label">Day starts</span><input className="ui-input" type="time" value={options.dayStart} onChange={(event) => setOptions({ ...options, dayStart: event.target.value })} /></label>
        <label><span className="ui-label">Day ends</span><input className="ui-input" type="time" value={options.dayEnd} onChange={(event) => setOptions({ ...options, dayEnd: event.target.value })} /></label>
        <label><span className="ui-label">Max streams / course</span><input className="ui-input" type="number" min={1} max={20} value={options.maxStreams} onChange={(event) => setOptions({ ...options, maxStreams: event.target.value })} /></label>
        <div className="flex flex-col justify-end gap-2 text-xs font-bold">
          <label className="flex items-center gap-2"><input type="checkbox" checked={options.includeSaturday} onChange={(event) => setOptions({ ...options, includeSaturday: event.target.checked })} />Include Saturday</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={options.replaceDrafts} onChange={(event) => setOptions({ ...options, replaceDrafts: event.target.checked })} />Replace earlier auto drafts</label>
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={Boolean(busy)} onClick={() => void run("preview")} className="ui-btn ui-btn-secondary"><Sparkles className="h-4 w-4" />{busy === "preview" ? "Generating..." : "Preview schedule"}</button>
        {result && result.sessions.length > 0 && result.unscheduled.length === 0 && <>
          <button type="button" disabled={Boolean(busy)} onClick={() => void run("save")} className="ui-btn ui-btn-secondary">{busy === "save" ? "Saving..." : "Save as draft"}</button>
        </>}
        {result && result.stats.courses > 0 && result.unscheduled.length === 0 && <button type="button" disabled={Boolean(busy)} onClick={() => void run("publish")} className="ui-btn ui-btn-primary">{busy === "publish" ? "Publishing..." : "Publish schedule"}</button>}
      </div>
      {error && <p className="mt-4 border-2 border-rose-700 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}
      {result && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {[["Courses scheduled", result.stats.courses - result.stats.unscheduledCourses], ["Class sessions", result.stats.sessions], ["Courses split into streams", result.stats.splitCourses], ["Not fully placed", result.stats.unscheduledCourses]].map(([label, value]) => <div key={label} className="ui-card-muted admin-metric-card min-w-0"><strong className="break-words text-lg tabular-nums sm:text-xl">{value}</strong><p className="text-[11px] leading-4 text-gray-500 sm:text-xs">{label}</p></div>)}
          </div>
          {streamed.length > 0 && <div><h4 className="mb-2 text-sm font-semibold">Auto-created streams</h4><div className="data-table-scroll" tabIndex={0} aria-label="Scrollable auto-created streams"><table className="data-table"><thead><tr><th>Course</th><th>Stream</th><th>Students</th></tr></thead><tbody>{streamed.slice(streamPage * 25, (streamPage + 1) * 25).map((session) => <tr key={`${session.courseId}${session.stream}`}><td>{session.courseCode}</td><td>{session.stream} of {session.streamCount}</td><td>{session.streamSize}</td></tr>)}</tbody></table></div><div className="mt-2 flex items-center justify-end gap-3 text-xs"><button type="button" disabled={streamPage === 0} onClick={() => setStreamPage(streamPage - 1)}>Previous streams</button><span>{streamPage + 1} / {Math.ceil(streamed.length / 25)}</span><button type="button" disabled={(streamPage + 1) * 25 >= streamed.length} onClick={() => setStreamPage(streamPage + 1)}>Next streams</button></div></div>}
          {result.unscheduled.length > 0 && <div className="border-2 border-amber-600 bg-amber-50 p-3 text-sm"><h4 className="font-black uppercase">Needs attention</h4><ul className="mt-2 list-disc pl-5">{result.unscheduled.map((item) => <li key={item.courseId}><strong>{item.courseCode}</strong>: {item.reason} ({item.studentsUnplaced} students unplaced)</li>)}</ul></div>}
          {result.warnings.length > 0 && <ul className="list-disc pl-5 text-xs text-gray-600">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          <div className="data-table-scroll" tabIndex={0} aria-label="Scrollable timetable preview"><table className="data-table"><thead><tr><th>Course</th><th>Stream</th><th>Day</th><th>Time</th><th>Venue</th><th>Students</th></tr></thead><tbody>{result.sessions.slice(previewPage * 50, (previewPage + 1) * 50).map((session, index) => <tr key={index}><td>{session.courseCode}</td><td>{session.stream || "—"}</td><td>{session.dayOfWeek}</td><td>{session.startTime}–{session.endTime}</td><td>{session.roomCode} ({session.roomCapacity})</td><td>{session.streamSize}</td></tr>)}</tbody></table></div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{result.sessions.length} preview sessions · 50 per page</span><div className="flex items-center gap-3"><button type="button" disabled={previewPage === 0} onClick={() => setPreviewPage(previewPage - 1)}>Previous sessions</button><span>{previewPage + 1} / {Math.max(1, Math.ceil(result.sessions.length / 50))}</span><button type="button" disabled={(previewPage + 1) * 50 >= result.sessions.length} onClick={() => setPreviewPage(previewPage + 1)}>Next sessions</button></div></div>
        </div>
      )}
    </section>
  );
}
