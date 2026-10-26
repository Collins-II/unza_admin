"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { AdminActivityContext } from "./DataWorkspace";
import { RecordSelect } from "./RecordSelect";
import type { EconomicsSourceSlot } from "@/lib/economicsSource";

type Preview = {
  version: string; academicYear: string; semester: string; documents: string[]; warnings: string[];
  department: { _id: string } | null;
  courses: { _id: string; code: string; active: boolean; catalogueOnly: boolean }[];
  sourceCourses: { code: string; title: string; level: string; lecturer: string; desiredStreams?: number; allocatedSlots?: number }[];
  slots: EconomicsSourceSlot[];
};

export function EconomicsSourceReview({ onChanged }: { onChanged: () => void }) {
  const { data: session } = useSession();
  const activity = useContext(AdminActivityContext);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [day, setDay] = useState("Monday");
  const [selected, setSelected] = useState<EconomicsSourceSlot | null>(null);
  const [course, setCourse] = useState("");
  const [room, setRoom] = useState("");
  const [stream, setStream] = useState("");
  const [students, setStudents] = useState<{ id: string; label: string }[]>([]);
  const [correction, setCorrection] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/admin/economics-source", { signal, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load source review.");
    if (!signal?.aborted) setPreview(data);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(controller.signal).catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load source review.");
      });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load, retry]);
  const run = async (url: string, body: unknown) => {
    setBusy(true); activity?.(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error([data.error || "Unable to save.", ...(data.details || [])].join(" "));
      setNotice(data.message || "Reviewed source slot saved as a draft. Publication still requires a complete, conflict-free course schedule.");
      setSelected(null);
      await load();
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save.");
    } finally { setBusy(false); activity?.(false); }
  };
  return <section className="ui-card space-y-4">
    <div><p className="ui-eyebrow">Departmental source review</p><h3 className="ui-title text-2xl">Economics · 2026 Term I</h3></div>
    <p className="text-sm text-slate-600">Document-backed course metadata and a reviewable Draft 5 teaching grid. Importing never replaces existing records or publishes classes. Source venue labels must be matched to real campus rooms.</p>
    {error && <p role="alert" className="text-sm text-rose-800">{error} <button type="button" className="underline" onClick={() => { setError(""); setRetry((value) => value + 1); }}>Retry source preview</button></p>}
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {!preview ? <p role="status">Loading source evidence...</p> : <>
      <details><summary className="cursor-pointer font-semibold">Documents, precedence and unresolved issues</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{preview.documents.map((document) => <li key={document}>{document}</li>)}{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>
      {session?.user.role === "admin" && <button type="button" disabled={busy} className="ui-btn ui-btn-secondary" onClick={() => {
        if (window.confirm("Import 34 Economics source courses for review? New courses stay inactive until approved scheduling details and rosters are entered. Existing records are preserved; any title/department conflict aborts the entire import.")) void run("/api/admin/economics-source", { version: preview.version });
      }}>Import source course metadata</button>}
      <details><summary className="cursor-pointer font-semibold">34-course roster, lecturers and requested teaching allocations</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Course", "Title / level", "Lecturer label", "Requested streams", "Total source slots"].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{preview.sourceCourses.map((item) => <tr className="border-t" key={item.code}><td className="p-2">{item.code}</td><td className="p-2">{item.title}<p className="text-xs">{item.level}</p></td><td className="p-2">{item.lecturer}</td><td className="p-2">{item.desiredStreams ?? "Unspecified"}</td><td className="p-2">{item.allocatedSlots ?? "Unspecified"}</td></tr>)}</tbody></table></div></details>
      <label className="block max-w-xs"><span className="ui-label">Source teaching day</span><select className="ui-input" value={day} onChange={(event) => setDay(event.target.value)}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Time</th><th className="p-2">Draft 5 source text</th><th className="p-2">Review</th></tr></thead><tbody>{preview.slots.filter((slot) => slot.dayOfWeek === day).map((slot) => <tr className="border-t" key={slot.id}><td className="whitespace-nowrap p-2">{slot.startTime}-{slot.endTime}</td><td className="p-2">{slot.raw}{slot.issues.length > 0 && <p className="max-w-xl text-xs text-amber-800">{slot.issues[0]}</p>}</td><td className="p-2"><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || !preview.department} onClick={() => {
        setSelected(slot); setCourse(preview.courses.find((item) => item.code === slot.courseCode)?._id || ""); setRoom(""); setStream(slot.stream); setStudents([]); setCorrection("");
      }}>Review slot</button></td></tr>)}</tbody></table></div>
      {selected && <form className="space-y-4 rounded-xl border border-emerald-200 p-4" onSubmit={(event) => {
        event.preventDefault();
        if (!preview.department) return;
        if (!window.confirm(`Save a reviewed ${selected.dayOfWeek} ${selected.startTime} draft for ${preview.academicYear}, ${preview.semester}? No existing class will be overwritten.`)) return;
        void run("/api/admin/allocations", {
          academicYear: preview.academicYear, semester: preview.semester, department: preview.department._id,
          course, room, dayOfWeek: selected.dayOfWeek, startTime: selected.startTime, endTime: selected.endTime,
          status: "draft", stream, ...(students.length ? { studentIds: students.map((student) => student.id) } : {}),
          notes: `Reviewed source ${selected.id}; ${preview.documents[1]}, page 1; raw: ${selected.raw}; reviewer decision: ${correction.trim()}`,
        });
      }}>
        <h4 className="font-semibold">Review {selected.dayOfWeek} {selected.startTime}: {selected.raw}</h4>
        <p className="text-xs">Target: {preview.academicYear}, {preview.semester}. Configure the course first with approved credits, a roster and 60-minute sessions. Select students for a named stream; leave both stream and selection empty only for the full roster.</p>
        <div className="grid gap-4 md:grid-cols-2"><RecordSelect resource="courses" label="Approved course" required value={course} filters={{ department: preview.department?._id || "", status: "active" }} onChange={(value) => { setCourse(value); setStudents([]); }} /><RecordSelect resource="rooms" label={`Verified room (source ${selected.roomCode || "unresolved"})`} required value={room} filters={{ teaching: "1", status: "available" }} onChange={setRoom} /></div>
        <label className="block"><span className="ui-label">Stream label (optional for full roster)</span><input className="ui-input" value={stream} maxLength={40} onChange={(event) => setStream(event.target.value)} /></label>
        <RecordSelect resource="students" label="Add student to reviewed stream" value="" filters={{ status: "active", course: course }} onChange={(id, label) => { if (id && !students.some((student) => student.id === id)) setStudents([...students, { id, label: label || id }]); }} />
        <div className="flex flex-wrap gap-2">{students.map((student) => <button type="button" className="ui-chip" key={student.id} onClick={() => setStudents(students.filter((item) => item.id !== student.id))}>{student.label} ×</button>)}</div>
        <label className="block"><span className="ui-label">Departmental review decision / correction</span><textarea required maxLength={1000} className="ui-input" value={correction} onChange={(event) => setCorrection(event.target.value)} /></label>
        <button className="ui-btn ui-btn-primary" disabled={busy || !course || !room || (Boolean(stream) && !students.length)}>Save reviewed draft slot</button>
        <button type="button" className="ui-btn ui-btn-secondary ml-2" onClick={() => setSelected(null)}>Close review</button>
      </form>}
    </>}
  </section>;
}
