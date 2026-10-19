"use client";

import { useCallback, useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { AdminActivityContext } from "./DataWorkspace";

type Student = {
  id: string;
  name: string;
  studentId: string;
  email: string;
  program?: string;
  year?: string;
  enrolledCourses: string[];
};

type Props = {
  courseId: string;
  courseCode: string;
  academicYear: string;
  semester: string;
};

export function StudentRoster({ courseId, courseCode, academicYear, semester }: Props) {
  const setWorkspaceBusy = useContext(AdminActivityContext);
  const searchRequest = useRef<AbortController | null>(null);
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const fetchRosterCount = useCallback(async () => {
    const response = await fetch(`/api/admin/course-enrollments?courseId=${encodeURIComponent(courseId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load course enrolments.");
    return data.count as number;
  }, [courseId]);

  const fetchStudents = async (requestedPage: number) => {
    if (search.trim().length < 2) {
      setError("Enter at least two characters to search.");
      return;
    }
    setBusy(true);
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setError("");
    setNotice("");
    try {
      const params = new URLSearchParams({ search: search.trim(), page: String(requestedPage), limit: "50" });
      const response = await fetch(`/api/admin/students?${params}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to search students.");
      setStudents(data.students);
      setTotal(data.total);
      setSelected([]);
      setPage(requestedPage);
    } catch (searchError) {
      if (!controller.signal.aborted) setError(searchError instanceof Error ? searchError.message : "Unable to search students.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const searchStudents = (event: FormEvent) => {
    event.preventDefault();
    void fetchStudents(0);
  };

  useEffect(() => {
    let active = true;
    void fetchRosterCount()
      .then((rosterCount) => { if (active) setCount(rosterCount); })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load course enrolments."); });
    return () => { active = false; searchRequest.current?.abort(); };
  }, [fetchRosterCount]);

  const setEnrollment = async (enrolled: boolean) => {
    if (!selected.length) return;
    if (!window.confirm(`${enrolled ? "Enrol" : "Remove"} ${selected.length} selected students ${enrolled ? "in" : "from"} ${courseCode}?`)) return;
    setBusy(true);
    setWorkspaceBusy?.(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/course-enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, studentIds: selected, enrolled, academicYear, semester }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update course enrolments.");
      setCount(data.count);
      setNotice(`${data.changed} student account(s) ${enrolled ? "enrolled in" : "removed from"} ${courseCode}.`);
      setStudents((current) => current.map((student) => selected.includes(student.id)
        ? { ...student, enrolledCourses: enrolled ? [...new Set([...student.enrolledCourses, courseId])] : student.enrolledCourses.filter((id) => id !== courseId) }
        : student));
      setSelected([]);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update course enrolments.");
    } finally {
      setBusy(false);
      setWorkspaceBusy?.(false);
    }
  };

  const toggleSelected = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <section className="mt-4 border-t border-gray-200 pt-4">
      <div className="flex items-center justify-between gap-2 text-xs">
        <strong>Active enrolments: {count ?? "—"}</strong>
        <button type="button" disabled={busy} className="text-emerald-800 underline" onClick={() => { void fetchRosterCount().then(setCount).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Unable to load course enrolments.")); }}>Refresh count</button>
      </div>
      <form onSubmit={searchStudents} className="mt-3 flex gap-2">
        <input className="ui-input min-w-0" aria-label="Find roster students" maxLength={100} disabled={busy} placeholder="Find student by name, ID or email" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); setSelected([]); setStudents([]); setTotal(0); }} />
        <button className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy}>Search</button>
      </form>
      {students.length > 0 && <>
        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
          {students.map((student) => {
            const enrolled = student.enrolledCourses.includes(courseId);
            return <label key={student.id} className="flex items-start gap-2 border border-gray-200 p-2 text-xs">
              <input type="checkbox" checked={selected.includes(student.id)} onChange={() => toggleSelected(student.id)} />
              <span className="min-w-0 flex-1"><strong>{student.studentId} · {student.name}</strong><br />{student.program || "Program not set"}{student.year ? ` · Year ${student.year}` : ""} · {student.email}</span>
              <span className={enrolled ? "font-bold text-emerald-700" : "text-gray-500"}>{enrolled ? "Enrolled" : "Not enrolled"}</span>
            </label>;
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">Showing {page * 50 + 1}–{Math.min((page + 1) * 50, total)} of {total}</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy || page === 0} className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => void fetchStudents(page - 1)}>Previous</button>
            <button type="button" disabled={busy || (page + 1) * 50 >= total} className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => void fetchStudents(page + 1)}>Next</button>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy} className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setSelected(selected.length === students.length ? [] : students.map((student) => student.id))}>{selected.length === students.length ? "Clear selection" : "Select this page"}</button>
          <button type="button" disabled={busy || !selected.length} className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => void setEnrollment(true)}>Enroll selected</button>
          <button type="button" disabled={busy || !selected.length} className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => void setEnrollment(false)}>Remove selected</button>
        </div>
      </>}
      {notice && <p role="status" className="mt-3 text-xs font-bold text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-xs font-bold text-rose-700">{error}</p>}
    </section>
  );
}
