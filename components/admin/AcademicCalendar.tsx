"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import {
  ACADEMIC_TERM_DATE_FIELDS,
  ACADEMIC_TERM_STATUSES,
  validateAcademicTerm,
  type AcademicTermInput,
  type AcademicTermRecord,
} from "@/lib/academicCalendar";

export type AcademicCalendarProps = {
  academicYear?: string;
  semester?: string;
  onChanged?: () => void | Promise<void>;
};

const dateLabels = {
  teachingStartDate: "Teaching start",
  teachingEndDate: "Teaching end",
  assessmentStartDate: "Assessment start",
  assessmentEndDate: "Assessment end",
};

function emptyTerm(academicYear: string, semester: string): AcademicTermInput {
  return { academicYear, semester, teachingStartDate: "", teachingEndDate: "", assessmentStartDate: "", assessmentEndDate: "", status: "draft" };
}

export function AcademicCalendar({ academicYear = "", semester = "", onChanged }: AcademicCalendarProps) {
  const { data: session } = useSession();
  const canManage = session?.user.role === "admin";
  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [revision, setRevision] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicTermRecord | null>(null);
  const [form, setForm] = useState<AcademicTermInput>(() => emptyTerm(academicYear, semester));
  const filterKey = JSON.stringify([academicYear, semester, status]);
  const [pageFilter, setPageFilter] = useState(filterKey);
  const currentPage = pageFilter === filterKey ? page : 1;
  const requestKey = JSON.stringify([filterKey, currentPage, revision]);
  const stale = loading || loadedKey !== requestKey;

  // The workspace's AdminActivityContext makes the entire parent fieldset inert.
  // Keep activity local so errors/retry and this panel's focus remain accessible.
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setLoadError("");
      try {
        const query = new URLSearchParams({ page: String(currentPage), limit: "25" });
        if (academicYear.trim()) query.set("academicYear", academicYear);
        if (semester.trim()) query.set("semester", semester);
        if (status) query.set("status", status);
        const response = await fetch(`/api/admin/academic-calendar?${query}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load the academic calendar.");
        if (!controller.signal.aborted) { setTerms(data.terms); setTotal(data.total); setLoadedKey(requestKey); }
      } catch (failure) {
        if (!controller.signal.aborted) setLoadError(failure instanceof Error ? failure.message : "Unable to load the academic calendar.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [academicYear, semester, status, currentPage, revision, requestKey]);

  const reload = () => {
    setOpen(false); setEditing(null); setError(""); setRevision((value) => value + 1);
  };
  const mutate = async (method: "POST" | "PATCH", body: unknown, message: string) => {
    if (pending.current || !canManage) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/academic-calendar", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save the academic calendar.");
      setNotice(message); setOpen(false); setEditing(null); setRevision((value) => value + 1);
      try { await onChanged?.(); }
      catch { setNotice(`${message} The surrounding workspace could not refresh; reload it before continuing.`); }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save the academic calendar.");
    } finally {
      pending.current = false; setBusy(false);
    }
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = validateAcademicTerm(form);
    if (invalid) { setError(invalid); return; }
    void mutate(editing ? "PATCH" : "POST", editing
      ? { id: editing._id, expectedVersion: editing.__v, ...form }
      : form, editing ? "Academic term dates saved." : "Draft created. Review and approve its dates before publication.");
  };
  const transition = (term: AcademicTermRecord, next: "approved" | "archived") => {
    const message = next === "approved"
      ? `Approve ${term.academicYear}, ${term.semester}? These administrator-confirmed dates will govern publication.`
      : `Archive ${term.academicYear}, ${term.semester}? This is permanent and requires resolving published teaching and all non-cancelled assessments first.`;
    if (window.confirm(message)) void mutate("PATCH", { id: term._id, expectedVersion: term.__v, status: next }, next === "approved" ? "Term dates approved." : "Term archived.");
  };
  const changePage = (next: number) => { setPageFilter(filterKey); setPage(next); };

  return <section className="space-y-5" aria-label="Academic term calendar" aria-busy={busy}>
    <div className="ui-card space-y-3">
      <h3 className="ui-title text-2xl">Academic term calendar</h3>
      <p className="text-sm text-slate-600">Only administrator-confirmed, approved dates authorize scheduling and publication. All dates are inclusive civil dates in Africa/Lusaka (UTC+02:00); no dates are inferred from teaching PDFs. Use the exact academic year and semester labels used by the timetable.</p>
      <p className="text-xs text-amber-800">Approved teaching windows cannot overlap, even across different semesters or years. Assessment and teaching windows within a term may overlap. Resolve published teaching and all non-cancelled assessments before editing dates or archiving. Archived terms are read-only.</p>
      {!canManage && <p className="text-sm text-slate-500">Staff have read-only access. A system administrator must create, approve, or archive terms.</p>}
      <div className="flex flex-wrap items-end gap-3">
        <div className="record-select"><label><span className="ui-label">Calendar status</span><select className="ui-input" value={status} disabled={busy} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{ACADEMIC_TERM_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
        <button type="button" className="ui-btn ui-btn-secondary" disabled={busy || loading} onClick={reload}>Reload calendar</button>
        {canManage && <button type="button" className="ui-btn ui-btn-primary" disabled={busy || open} onClick={() => {
          setEditing(null); setForm(emptyTerm(academicYear, semester)); setOpen(true); setError(""); setNotice("");
        }}>Create draft term</button>}
      </div>
      {busy && <p role="status" className="text-sm text-emerald-800">Saving calendar change. Keep this page open until the result appears.</p>}
      {(academicYear || semester) && <p className="text-xs text-slate-500">Showing {academicYear || "all academic years"} / {semester || "all semesters"}.</p>}
    </div>
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="text-sm text-rose-800">{error} <button type="button" className="underline" disabled={busy} onClick={reload}>Reload latest version</button>. Your unsaved changes remain available until you reload.</p>}
    {open && canManage && <form className="ui-card space-y-4" onSubmit={save}>
      <h4 className="ui-title text-xl">{editing ? `Edit ${editing.academicYear} / ${editing.semester}` : "Create a draft term"}</h4>
      <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
        <label><span className="ui-label">Academic year (exact timetable label)</span><input className="ui-input" required maxLength={30} disabled={Boolean(editing)} value={form.academicYear} onChange={(event) => setForm({ ...form, academicYear: event.target.value })} /></label>
        <label><span className="ui-label">Semester (exact timetable label)</span><input className="ui-input" required maxLength={50} disabled={Boolean(editing)} value={form.semester} placeholder="e.g. Semester 1" onChange={(event) => setForm({ ...form, semester: event.target.value })} /></label>
        {ACADEMIC_TERM_DATE_FIELDS.map((field) => <label key={field}><span className="ui-label">{dateLabels[field]} (Lusaka)</span><input className="ui-input" type="date" min="0001-01-01" max="9999-12-31" required value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>)}
        <p className="text-xs text-slate-500 md:col-span-2">Teaching and assessment start/end are inclusive. Saving {editing?.status === "approved" ? "an approved term rechecks its approval" : "does not approve a draft"}. Year/semester labels cannot be renamed.</p>
        <div className="flex gap-3"><button className="ui-btn ui-btn-primary" type="submit">{busy ? "Saving..." : "Save dates"}</button><button className="ui-btn ui-btn-secondary" type="button" onClick={() => { setOpen(false); setEditing(null); setError(""); }}>Cancel edit</button></div>
      </fieldset>
    </form>}
    {loadError ? <p role="alert" className="ui-card text-sm text-rose-800">{loadError} <button type="button" className="underline" disabled={busy} onClick={reload}>Retry loading</button></p>
      : stale ? <p role="status" className="ui-card text-sm">Loading calendar...</p>
        : <div className="ui-card space-y-4">
          {!terms.length ? <p className="text-sm text-slate-500">No term calendars on this page. Dates must be entered and approved by an administrator.</p>
            : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Academic terms and approved Lusaka date windows</caption><thead><tr className="border-b"><th className="p-3">Academic year / semester</th><th className="p-3">Teaching (inclusive)</th><th className="p-3">Assessments (inclusive)</th><th className="p-3">Status</th>{canManage && <th className="p-3">Actions</th>}</tr></thead><tbody>
              {terms.map((term) => <tr key={term._id} className="border-b"><td className="p-3">{term.academicYear}<br />{term.semester}</td><td className="whitespace-nowrap p-3">{term.teachingStartDate}<br />to {term.teachingEndDate}</td><td className="whitespace-nowrap p-3">{term.assessmentStartDate}<br />to {term.assessmentEndDate}</td><td className="p-3"><span className="ui-chip">{term.status}</span></td>
                {canManage && <td className="p-3"><div className="flex flex-wrap gap-2">{term.status !== "archived" && <>
                  <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || open} onClick={() => { setEditing(term); setForm({ academicYear: term.academicYear, semester: term.semester, teachingStartDate: term.teachingStartDate, teachingEndDate: term.teachingEndDate, assessmentStartDate: term.assessmentStartDate, assessmentEndDate: term.assessmentEndDate, status: term.status }); setOpen(true); setError(""); setNotice(""); }}>Edit dates</button>
                  {term.status === "draft" && <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy || open} onClick={() => transition(term, "approved")}>Approve</button>}
                  <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || open} onClick={() => transition(term, "archived")}>Archive</button>
                </>}</div></td>}
              </tr>)}
            </tbody></table></div>}
          <div className="flex items-center justify-between gap-3 text-sm"><span>{total} terms · Page {currentPage} of {Math.max(1, Math.ceil(total / 25))}</span><div className="flex gap-3"><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || currentPage <= 1} onClick={() => changePage(currentPage - 1)}>Previous</button><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || currentPage * 25 >= total} onClick={() => changePage(currentPage + 1)}>Next</button></div></div>
        </div>}
  </section>;
}
