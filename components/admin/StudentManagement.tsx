"use client";

import { useContext, useState, type FormEvent } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { AdminActivityContext, DataWorkspace, downloadCsv } from "./DataWorkspace";
import { RecordSelect } from "./RecordSelect";
import { csvCell } from "@/lib/adminData";

type StudentRow = {
  _id: string; name: string; studentId: string; email: string; program?: string; year?: string;
  department?: string; status: string; mustChangePassword: boolean; enrolledCourses: string[];
};
type Credential = { studentId: string; name: string; email?: string; temporaryPassword: string };
const emptyForm = { name: "", email: "", studentId: "", program: "", year: "1", department: "", phone: "" };

export function StudentManagement() {
  const setWorkspaceBusy = useContext(AdminActivityContext);
  const [form, setForm] = useState(emptyForm);
  const [csv, setCsv] = useState("");
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [failures, setFailures] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  const send = async (method: "POST" | "PATCH", body: unknown) => {
    const response = await fetch("/api/admin/students", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok && !(data.created || data.failed)) throw new Error(data.error || "The operation could not be completed.");
    return data;
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setWorkspaceBusy?.(true); setError(""); setNotice("");
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : "The operation could not be completed."); } finally { setBusy(false); setWorkspaceBusy?.(false); }
  };
  const showResult = (data: { created?: Credential[]; failed?: { row: number; error: string }[] }) => {
    setCredentials(data.created || []);
    setFailures((data.failed || []).map((failure) => `Row ${failure.row}: ${failure.error}`));
    setNotice(`${data.created?.length || 0} student(s) registered${data.failed?.length ? `, ${data.failed.length} rejected` : ""}.`);
    setRevision((value) => value + 1);
  };
  const register = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const data = await send("POST", { ...form, studentId: form.studentId.trim() });
      showResult(data);
      if (data.created?.length) setForm(emptyForm);
    });
  };
  const importCsv = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const data = await send("POST", { csv });
      showResult(data);
      if (data.created?.length) setCsv("");
    });
  };
  const resetPassword = (student: StudentRow) => {
    if (!window.confirm(`Issue a new temporary password for ${student.name} (${student.studentId})? The current password stops working immediately.`)) return;
    void run(async () => {
      const data = await send("PATCH", { id: student._id, action: "reset-password" });
      setFailures([]);
      setCredentials([{ studentId: data.studentId, name: data.name, temporaryPassword: data.temporaryPassword }]);
      setNotice("New temporary password issued. Hand it to the student securely; it is shown only once.");
      setRevision((value) => value + 1);
    });
  };
  return <div className="space-y-5">
    {error && <div role="alert" className="ui-card border-rose-300! bg-rose-50! text-sm text-rose-800">{error}</div>}
    {notice && <div role="status" className="ui-card bg-emerald-50! text-sm">{notice}</div>}
    {failures.length > 0 && <div role="alert" className="ui-card bg-amber-50! text-sm text-amber-900"><strong>Rejected records</strong><ul className="mt-2 max-h-48 overflow-auto">{failures.map((failure) => <li key={failure}>{failure}</li>)}</ul></div>}
    {credentials.length > 0 && <section className="ui-card border-amber-300!">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="ui-eyebrow">Shown once · keep secure</p><h3 className="ui-title text-xl">Temporary credentials</h3><p className="mt-2 text-xs text-slate-500">Passwords are hashed. Students must change them at first sign-in.</p></div><div className="flex gap-2"><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => downloadCsv(new Blob([[
        ["Student ID", "Name", "Temporary password"], ...credentials.map((item) => [item.studentId, item.name, item.temporaryPassword]),
      ].map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv" }), "student-credentials.csv")}>Download credentials</button><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setCredentials([])}>Dismiss</button></div></div>
      <div className="data-table-scroll mt-3"><table className="data-table"><thead><tr><th>Student ID</th><th>Name</th><th>Temporary password</th></tr></thead><tbody>{credentials.map((item) => <tr key={item.studentId}><td>{item.studentId}</td><td>{item.name}</td><td className="font-mono">{item.temporaryPassword}</td></tr>)}</tbody></table></div>
    </section>}
    <DataWorkspace<StudentRow> resource="students" revision={revision} actions={[
      { label: "Activate", url: "/api/admin/students", body: { action: "set-status", status: "active" } },
      { label: "Deactivate", url: "/api/admin/students", body: { action: "set-status", status: "inactive" }, warning: "Selected students will lose sign-in access. Published timetable safeguards apply. Partial results will be reported." },
    ]} renderDetails={(student) => <div className="space-y-3"><div className="grid gap-4 sm:grid-cols-3"><div><strong>{student.name}</strong><p>{student.email}</p></div><div><p>{student.program || "Programme not specified"}</p><p>{student.department} · Year {student.year || "not specified"}</p></div><div><p>{student.enrolledCourses.length} course enrolments</p><p>{student.mustChangePassword ? "Password change required" : "Password updated"}</p></div></div><button type="button" disabled={busy || student.status !== "active"} className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => resetPassword(student)}><KeyRound size={14} />Reset password</button></div>} />
    <details className="admin-composer ui-card"><summary>Register a student or import a batch</summary><div className="mt-5 grid gap-6 xl:grid-cols-2">
      <form onSubmit={register} className="space-y-3"><h3 className="ui-title text-xl">Register student</h3><p className="text-xs text-slate-500">Leave the ID blank for automatic allocation.</p>
        {([["name", "Full name"], ["email", "Student email"], ["studentId", "Student ID (optional)"], ["program", "Programme"], ["phone", "Phone (optional)"]] as const).map(([key, label]) => <label className="block" key={key}><span className="ui-label">{label}</span><input className="ui-input" type={key === "email" ? "email" : "text"} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={key === "name" || key === "email"} /></label>)}
        <label className="block"><span className="ui-label">Study year</span><select className="ui-input" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })}>{Array.from({ length: 9 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label>
        <RecordSelect resource="departments" label="Department" filters={{ status: "active" }} valueField="code" value={form.department} onChange={(department) => setForm({ ...form, department })} />
        <button className="ui-btn ui-btn-primary" disabled={busy}><UserPlus size={16} />Register student</button>
      </form>
      <form onSubmit={importCsv} className="space-y-3"><h3 className="ui-title text-xl">Import students</h3><p className="text-sm text-slate-500">Up to 100 rows. Columns: <code>name,email,program,year,department,studentId</code> (studentId optional).</p><label><span className="ui-label">CSV data</span><textarea className="ui-input min-h-56 font-mono text-xs" value={csv} onChange={(event) => setCsv(event.target.value)} required /></label><button className="ui-btn ui-btn-secondary" disabled={busy || !csv.trim()}>Import students</button></form>
    </div></details>
  </div>;
}
