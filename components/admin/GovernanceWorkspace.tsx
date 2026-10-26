"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { RecordSelect } from "./RecordSelect";

type Review = {
  _id: string; kind: "teaching" | "assessment"; target: string; academicYear: string; semester: string;
  status: string; reason?: string; department?: { code: string; name: string };
  submittedBy?: { _id: string; name: string }; reviewedBy?: { name: string }; createdAt: string;
};
type ReviewDetail = { title: string; rows: { id: string; when: string; room: string; students: number; status: string }[] };

export function ApprovalWorkspace() {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "admin";
  const [rows, setRows] = useState<Review[]>([]);
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Review | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [reason, setReason] = useState("");
  const [detailError, setDetailError] = useState("");
  const key = `${status}:${page}:${revision}`;
  const pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setError("");
      try {
        const response = await fetch(`/api/admin/approvals?${new URLSearchParams({ status, page: String(page) })}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load review queue.");
        if (!controller.signal.aborted) { setRows(data.requests); setTotal(data.total); setLoaded(key); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load queue."); }
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [status, page, revision, key]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setDetail(null); setDetailError("");
      try {
        const response = await fetch(`/api/admin/approvals/detail?id=${selected._id}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load submitted allocations.");
        if (!controller.signal.aborted) setDetail(data);
      } catch (failure) { if (!controller.signal.aborted) setDetailError(failure instanceof Error ? failure.message : "Unable to load review details."); }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selected, revision]);
  const decide = async (decision: "approve" | "reject") => {
    if (!selected || pending.current) return;
    if (!window.confirm(decision === "approve" ? "Approve this unchanged submission and publish it to students? Teaching publication cancels conflicting room bookings within its approved teaching dates." : "Reject this submission and return it for correction?")) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/approvals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected._id, decision, ...(decision === "reject" ? { reason } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error([data.error || "Unable to process review.", ...(data.details || [])].join(" "));
      setNotice(decision === "approve" ? "Independent review approved. The validated allocation is now published." : "Rejected with a recorded reason. Drafts are preserved.");
      setSelected(null); setDetail(null); setRevision(revision + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to process review."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <div className="space-y-5"><section className="ui-card"><p className="ui-eyebrow">Prepare → submit → review → publish</p><h3 className="ui-title mt-2 text-2xl">Independent publication review</h3><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">Staff and administrators submit complete drafts from the teaching or assessment workspace. A different administrator checks the exact submitted version. Changes invalidate the submission; nothing reaches students until approval succeeds.</p></section>
    {error && <p role="alert" className="ui-card text-sm text-rose-800">{error} <button className="underline" onClick={() => setRevision(revision + 1)}>Refresh queue</button></p>}{notice && <p role="status" className="ui-card text-sm text-emerald-800">{notice}</p>}
    <section className="ui-card"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><label><span className="ui-label">Review status</span><select className="ui-input" value={status} disabled={busy} onChange={(event) => { setStatus(event.target.value); setPage(0); setSelected(null); }}><option value="pending">Awaiting review</option><option value="approved">Approved</option><option value="rejected">Returned for correction</option></select></label><p className="text-sm text-slate-500">{total} submissions · Page {page + 1}</p></div>
      {loaded !== key && !error && <p role="status">Loading review queue...</p>}
      {loaded === key && !rows.length && <div className="operations-empty"><strong>No {status} submissions</strong><p className="mt-2 text-sm">Submit a complete course or assessment draft to begin the review workflow.</p></div>}
      <div className="space-y-3">{rows.map((row) => <button type="button" key={row._id} disabled={busy || loaded !== key || Boolean(error)} className="operations-alert w-full text-left" onClick={() => { setSelected(row); setDetail(null); setReason(""); }}><div className="min-w-0 flex-1"><strong className="text-sm">{row.kind === "teaching" ? "Complete course timetable" : "Assessment allocation"} · {row.department?.code}</strong><p className="mt-1 text-xs text-slate-500">{row.academicYear} · {row.semester} · Submitted by {row.submittedBy?.name || "Unavailable account"}</p><p className="mt-1 text-xs text-slate-400">{new Date(row.createdAt).toLocaleString("en-GB")}</p></div><span className="data-status">{row.status}</span></button>)}</div>
      <div className="mt-5 flex justify-between"><button className="ui-btn ui-btn-secondary ui-btn-sm" disabled={page === 0 || busy} onClick={() => { setSelected(null); setPage(page - 1); }}>Previous</button><button className="ui-btn ui-btn-secondary ui-btn-sm" disabled={(page + 1) * 25 >= total || busy || loaded !== key} onClick={() => { setSelected(null); setPage(page + 1); }}>Next</button></div>
    </section>
    {selected && <section className="ui-card space-y-4"><h4 className="ui-title text-xl">{detail?.title || "Submission details"}</h4><p className="text-sm text-slate-500">{selected.department?.name} · {selected.academicYear} {selected.semester}</p>
      {detailError && <p role="alert" className="text-rose-800">{detailError}</p>}
      {!detail && !detailError && <p role="status">Loading submitted resources...</p>}
      {detail && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Session", "Venue", "Students", "State"].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{detail.rows.map((row) => <tr key={row.id} className="border-t"><td className="p-2">{row.when}</td><td className="p-2">{row.room}</td><td className="p-2">{row.students}</td><td className="p-2">{row.status}</td></tr>)}</tbody></table></div>}
      {selected.reason && <p className="text-sm text-amber-800">Review reason: {selected.reason}</p>}
      {selected.status === "pending" && isAdmin && <fieldset disabled={busy} className="space-y-3"><label><span className="ui-label">Reason if returning for correction</span><textarea className="ui-input" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} /></label><div className="flex flex-wrap gap-2"><button className="ui-btn ui-btn-primary" disabled={!detail || Boolean(detailError) || selected.submittedBy?._id === session?.user.id} onClick={() => void decide("approve")}>Approve & publish</button><button className="ui-btn ui-btn-secondary" disabled={!reason.trim()} onClick={() => void decide("reject")}>Return for correction</button></div><p className="text-xs text-slate-500">The server also checks draft creators and blocks self-approval.</p></fieldset>}
      <button className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => setSelected(null)}>Close review</button>
    </section>}
  </div>;
}

type AuditRow = { _id: string; action: string; actor?: { name?: string }; target: string; details?: Record<string, string>; createdAt: string };
export function AuditWorkspace() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [action, setAction] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState("");
  const key = `${action}:${page}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setError("");
      try {
        const response = await fetch(`/api/admin/audit?${new URLSearchParams({ action, page: String(page) })}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load audit history.");
        if (!controller.signal.aborted) { setRows(data.events); setTotal(data.total); setLoaded(key); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load audit history."); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [action, page, retry, key]);
  return <section className="ui-card space-y-5"><div><p className="ui-eyebrow">Accountability by design</p><h3 className="ui-title mt-2 text-2xl">University audit trail</h3><p className="mt-2 text-sm text-slate-500">Durable mutation history. Events are read-only here; retention and access remain governed by university policy.</p></div><label className="block max-w-md"><span className="ui-label">Search action (for example publication, access, roster)</span><input type="search" className="ui-input" value={action} maxLength={100} onChange={(event) => { setAction(event.target.value); setPage(0); }} /></label>
    {error && <p role="alert" className="text-sm text-rose-800">{error} <button className="underline" onClick={() => setRetry(retry + 1)}>Retry</button></p>}
    {loaded !== key && !error ? <p role="status">Loading audit history...</p> : <div className="space-y-2">{rows.length ? rows.map((row) => <details key={row._id} className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">{row.action} <span className="ml-2 text-xs font-normal text-slate-500">{row.actor?.name || "Unavailable account"} · {new Date(row.createdAt).toLocaleString("en-GB")}</span></summary><p className="mt-3 break-all text-xs text-slate-500">Target: {row.target}</p><dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">{Object.entries(row.details || {}).map(([field, value]) => <div key={field}><dt className="font-semibold text-slate-600">{field}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-500">{value}</dd></div>)}</dl></details>) : <p className="py-8 text-sm text-slate-500">No matching events.</p>}</div>}
    <div className="flex items-center justify-between"><button className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!page} onClick={() => setPage(page - 1)}>Previous</button><p className="text-xs text-slate-500">{total} events · Page {page + 1}</p><button className="ui-btn ui-btn-secondary ui-btn-sm" disabled={(page + 1) * 50 >= total || loaded !== key} onClick={() => setPage(page + 1)}>Next</button></div>
  </section>;
}

export function DepartmentAccessWorkspace() {
  const [accountId, setAccountId] = useState("");
  const [loadedId, setLoadedId] = useState("");
  const [version, setVersion] = useState(0);
  const [departments, setDepartments] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setError(""); setNotice("");
      try {
        const response = await fetch(`/api/admin/data?${new URLSearchParams({ resource: "accounts", id: accountId })}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load staff assignments.");
        const account = data.records[0];
        if (!account || account.role !== "staff") throw new Error("Select a staff account; administrators have university-wide access.");
        const choices = await Promise.all((account.departmentIds || []).map(async (id: string) => {
          const result = await fetch(`/api/admin/data?${new URLSearchParams({ resource: "departments", id })}`, { signal: controller.signal });
          const body = await result.json();
          if (!result.ok) throw new Error(body.error || "Unable to resolve department.");
          return { id, label: body.records[0]?.name || `Unavailable department (${id})` };
        }));
        if (!controller.signal.aborted) { setDepartments(choices); setVersion(account.__v || 0); setLoadedId(accountId); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load access."); }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [accountId, retry]);
  const save = async () => {
    if (!window.confirm("Replace this staff member's department access? Changes apply on their next protected request.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: accountId, expectedVersion: version, departmentIds: departments.map((department) => department.id) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save access.");
      setVersion(data.account.__v); setNotice("Department assignments saved and audited. New access is effective immediately.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save access."); }
    finally { setBusy(false); }
  };
  return <section className="ui-card space-y-5"><div><p className="ui-eyebrow">Least-privilege administration</p><h3 className="ui-title mt-2 text-2xl">Department access</h3><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">Administrators manage the university. Staff prepare and submit work only for explicitly assigned departments. Unassigned staff cannot access departmental records. A free-text department name never grants permission.</p></div><fieldset disabled={busy} className="max-w-2xl space-y-4"><RecordSelect resource="accounts" label="Staff member" filters={{ role: "staff" }} value={accountId} onChange={(id) => { setAccountId(id); setLoadedId(""); setDepartments([]); }} />
    {accountId && loadedId !== accountId && !error && <p role="status">Loading current assignments...</p>}
    {loadedId === accountId && accountId && <><RecordSelect resource="departments" label="Add assigned department" filters={{ status: "active" }} value="" onChange={(id, label) => { if (id && !departments.some((department) => department.id === id)) setDepartments([...departments, { id, label: label || id }]); }} /><div className="flex flex-wrap gap-2">{departments.map((department) => <button key={department.id} type="button" className="ui-chip" onClick={() => setDepartments(departments.filter((item) => item.id !== department.id))}>{department.label} ×</button>)}</div>{!departments.length && <p className="text-sm text-amber-800">No assignments: this staff account will have no departmental access.</p>}<button className="ui-btn ui-btn-primary" disabled={busy || Boolean(error)} onClick={() => void save()}>Save department access</button></>}
    </fieldset>{error && <p role="alert" className="text-sm text-rose-800">{error} <button className="underline" onClick={() => setRetry(retry + 1)}>Reload assignments</button></p>}{notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
  </section>;
}
