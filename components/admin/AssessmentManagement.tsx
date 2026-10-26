"use client";

import { useContext, useEffect, useState } from "react";
import { AdminActivityContext } from "./DataWorkspace";
import { RecordSelect } from "./RecordSelect";
import type { AssessmentType, AssessmentStatus } from "@/lib/assessmentValidation";

type Person = { id: string; name: string };
type Assessment = {
  _id: string; __v: number; academicYear: string; semester: string; title: string; date: string;
  startTime: string; endTime: string; assessmentType: AssessmentType; status: AssessmentStatus; studentCount: number;
  department: { _id: string; code: string; name: string } | null;
  course: { _id: string; code: string; title: string } | null;
  room: { _id: string; code: string } | null;
  invigilators: Person[];
};

function InvigilatorPicker({ people, onChange }: { people: Person[]; onChange: (people: Person[]) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [options, setOptions] = useState<{ _id: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const key = `${search}:${page}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/assessments/invigilators?${new URLSearchParams({ search, page: String(page) })}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to find invigilators.");
        if (!controller.signal.aborted) { setOptions(data.people); setTotal(data.total); setLoadedKey(key); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to find invigilators.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, page, retry, key]);
  return <div className="space-y-2"><label><span className="ui-label">Invigilators (at least one active staff member)</span><input className="ui-input" type="search" value={search} maxLength={100} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search active staff names" /></label>
    <select className="ui-input" aria-label="Add invigilator" value="" disabled={loading || loadedKey !== key || Boolean(error) || people.length >= 20} onChange={(event) => {
      const person = options.find((option) => option._id === event.target.value);
      if (person && !people.some((item) => item.id === person._id)) onChange([...people, { id: person._id, name: person.name }]);
    }}><option value="">Select invigilator...</option>{options.map((person) => <option key={person._id} value={person._id} disabled={people.some((item) => item.id === person._id)}>{person.name}</option>)}</select>
    <div className="flex gap-3 text-xs"><span>{total} matches</span><button type="button" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>Previous</button><button type="button" disabled={(page + 1) * 25 >= total || loading} onClick={() => setPage(page + 1)}>More</button></div>
    <div className="flex flex-wrap gap-2">{people.map((person) => <button className="ui-chip" type="button" key={person.id} onClick={() => onChange(people.filter((item) => item.id !== person.id))} aria-label={`Remove ${person.name}`}>{person.name} ×</button>)}</div>
    {error && <p role="alert" className="text-sm text-rose-800">{error} <button type="button" className="underline" onClick={() => setRetry(retry + 1)}>Retry</button></p>}
  </div>;
}

export function AssessmentManagement({ academicYear, semester, departmentFilter }: { academicYear: string; semester: string; departmentFilter: string }) {
  const activity = useContext(AdminActivityContext);
  const [records, setRecords] = useState<Assessment[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dateFilter, setDateFilter] = useState("");
  const [revision, setRevision] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Assessment | null>(null);
  const [department, setDepartment] = useState(departmentFilter);
  const [course, setCourse] = useState("");
  const [room, setRoom] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<AssessmentType>("exam");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [invigilators, setInvigilators] = useState<Person[]>([]);
  const [students, setStudents] = useState<{ id: string; label: string }[]>([]);
  const requestKey = `${academicYear}:${semester}:${departmentFilter}:${dateFilter}:${page}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const query = new URLSearchParams({ academicYear, semester, page: String(page), limit: "25", ...(departmentFilter ? { department: departmentFilter } : {}), ...(dateFilter ? { date: dateFilter } : {}) });
        const response = await fetch(`/api/admin/assessments?${query}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load assessments.");
        if (!controller.signal.aborted) { setRecords(data.allocations); setTotal(data.total); setLoadedKey(requestKey); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load assessments.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [academicYear, semester, departmentFilter, dateFilter, page, revision, requestKey]);
  const mutate = async (method: "POST" | "PATCH", body: unknown, message: string, url = "/api/admin/assessments") => {
    setBusy(true); activity?.(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save assessment.");
      setNotice(message); setRevision((value) => value + 1); setOpen(false); setEditing(null); setStudents([]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save assessment."); }
    finally { setBusy(false); activity?.(false); }
  };
  const stale = loading || loadedKey !== requestKey;
  return <div className="space-y-5">
    <section className="ui-card space-y-3"><h3 className="ui-title text-2xl">Departmental exams, tests and quizzes</h3><p className="text-sm text-slate-600">All dates and times use Africa/Lusaka (UTC+02:00). Drafts reserve resources too. Saving and publication check room capacity, enrolled students, active invigilators, teaching and confirmed bookings. Assessment dates and policies are not inferred from the teaching PDFs.</p>
      <p className="text-xs text-amber-800">Assessment dates must fall inside an approved academic calendar. Teaching conflicts use approved term dates; legacy published teaching without a calendar remains conservatively protected. Submit drafts for independent review rather than publishing directly.</p>
      <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={() => { setEditing(null); setDepartment(departmentFilter); setCourse(""); setRoom(""); setTitle(""); setDate(""); setInvigilators([]); setStudents([]); setOpen(true); }}>Create assessment draft</button>
    </section>
    {error && <p className="ui-card text-sm text-rose-800" role="alert">{error} <button type="button" className="underline" onClick={() => setRevision(revision + 1)}>Refresh assessments</button></p>}
    {notice && <p className="ui-card text-sm text-emerald-800" role="status">{notice}</p>}
    {open && <section className="ui-card"><h4 className="mb-4 font-semibold">{editing ? "Edit assessment allocation" : "New draft assessment"}</h4><form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      void mutate(editing ? "PATCH" : "POST", {
        ...(editing ? { id: editing._id, expectedVersion: editing.__v, status: "draft" } : {}),
        academicYear, semester, department, course, room, title, assessmentType: type, date, startTime, endTime,
        invigilatorIds: invigilators.map((person) => person.id), ...(!editing && students.length ? { studentIds: students.map((student) => student.id) } : {}),
      }, editing ? "Assessment saved as a draft. Publish again after review." : "Assessment draft saved.");
    }}>
      <fieldset disabled={Boolean(editing)} className="grid gap-4 md:grid-cols-2"><RecordSelect resource="departments" label="Assessment department" required value={department} onChange={(value) => { setDepartment(value); setCourse(""); setStudents([]); }} /><RecordSelect resource="courses" label="Assessment course" required value={course} filters={{ department, status: "active", semester }} onChange={(value) => { setCourse(value); setStudents([]); }} /></fieldset>
      <div className="grid gap-4 md:grid-cols-2"><label><span className="ui-label">Assessment title</span><input className="ui-input" value={title} required maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label><label><span className="ui-label">Assessment type</span><select className="ui-input" value={type} onChange={(event) => setType(event.target.value as AssessmentType)}><option value="exam">Exam</option><option value="test">Test</option><option value="quiz">Quiz</option></select></label>
      <label><span className="ui-label">Date (Lusaka)</span><input type="date" className="ui-input" required value={date} onChange={(event) => setDate(event.target.value)} /></label><RecordSelect resource="rooms" label="Assessment room" required value={room} filters={{ status: "available", teaching: "1" }} onChange={setRoom} />
      <label><span className="ui-label">Start time</span><input type="time" className="ui-input" required value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label><span className="ui-label">End time</span><input type="time" className="ui-input" required value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div>
      <InvigilatorPicker people={invigilators} onChange={setInvigilators} />
      {editing ? <p className="text-sm">Existing {editing.studentCount}-student assignment is preserved. To replace its roster, cancel this allocation and create a reviewed replacement.</p> : <div className="space-y-2"><p className="text-sm">Default: entire active course roster. For split-room allocations, select the enrolled students assigned to this room.</p><RecordSelect resource="students" label="Add assessment student (optional subset)" value="" filters={{ status: "active", ...(course ? { course } : {}) }} onChange={(id, label) => { if (id && !students.some((student) => student.id === id)) setStudents([...students, { id, label: label || id }]); }} /><div className="flex flex-wrap gap-2">{students.map((student) => <button className="ui-chip" type="button" key={student.id} onClick={() => setStudents(students.filter((item) => item.id !== student.id))}>{student.label} ×</button>)}</div><p className="text-xs">{students.length ? `${students.length} explicitly selected students` : "Whole active roster will be assigned when saved"}</p></div>}
      <button className="ui-btn ui-btn-primary" disabled={busy || !invigilators.length || !course || !room}>Save assessment draft</button><button type="button" className="ui-btn ui-btn-secondary ml-2" onClick={() => setOpen(false)}>Close</button>
    </form></section>}
    <section className="ui-card space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><label><span className="ui-label">Filter by date</span><input className="ui-input" type="date" value={dateFilter} onChange={(event) => { setDateFilter(event.target.value); setPage(1); }} /></label><p className="text-sm">{total} assessments · page {page} of {Math.max(1, Math.ceil(total / 25))}</p></div>
      {stale && <p role="status" className="text-sm">Loading assessments...</p>}
      {!stale && !records.length && <p className="text-sm">{total ? "No records on this page. Use Previous." : "No assessments match this planning cycle."}</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Assessment", "Date / time", "Room / students", "Invigilators", "Status", "Actions"].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{records.map((item) => <tr className="border-t" key={item._id}><td className="p-2"><strong>{item.course?.code || "Missing course"}</strong><p>{item.title} · {item.assessmentType}</p><p className="text-xs">{item.department?.name}</p></td><td className="whitespace-nowrap p-2">{item.date}<p>{item.startTime}-{item.endTime}</p></td><td className="p-2">{item.room?.code || "Missing room"}<p>{item.studentCount} students</p></td><td className="p-2">{item.invigilators.map((person) => person.name).join(", ")}</td><td className="p-2">{item.status}</td><td className="p-2"><div className="flex flex-wrap gap-2">
        {item.status !== "cancelled" && <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={stale || busy || Boolean(error)} onClick={() => {
          setEditing(item); setDepartment(item.department?._id || ""); setCourse(item.course?._id || ""); setRoom(item.room?._id || ""); setTitle(item.title); setType(item.assessmentType); setDate(item.date); setStartTime(item.startTime); setEndTime(item.endTime); setInvigilators(item.invigilators); setOpen(true);
        }}>Edit / reschedule</button>}
        {item.status === "draft" && <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={stale || busy || Boolean(error)} onClick={() => {
          if (window.confirm(`Submit ${item.title} on ${item.date} for independent publication review?`)) void mutate("POST", { id: item._id, kind: "assessment" }, "Assessment submitted for independent review. Track the decision in Publication reviews.", "/api/admin/approvals");
        }}>Submit for review</button>}
        {item.status !== "cancelled" && <button type="button" className="ui-btn ui-btn-danger ui-btn-sm" disabled={stale || busy || Boolean(error)} onClick={() => {
          if (window.confirm(`Cancel ${item.title}? It will be removed from student assessment schedules.`)) void mutate("PATCH", { id: item._id, expectedVersion: item.__v, status: "cancelled" }, "Assessment cancelled.");
        }}>Cancel</button>}
      </div></td></tr>)}</tbody></table></div>
      <div className="flex justify-between"><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={page <= 1 || busy} onClick={() => setPage(page - 1)}>Previous</button><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={stale || busy || page * 25 >= total} onClick={() => setPage(page + 1)}>Next</button></div>
    </section>
  </div>;
}
