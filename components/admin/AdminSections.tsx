"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { BookOpen, Building2, CalendarDays, Network, Plus, Users } from "lucide-react";
import type { Allocation, Course, Department, Metrics, Room, StaffAccount, Tab } from "./types";
import { weekdays } from "./types";
import { DataWorkspace } from "./DataWorkspace";
import { RecordSelect } from "./RecordSelect";
import { TimetableGenerator } from "./TimetableGenerator";
import { StudentRoster } from "./StudentRoster";
import { adminFilterOptions } from "@/lib/adminData";

const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> });
type FormProps = { form: Record<string, string>; setForm: (form: Record<string, string>) => void; onSubmit: (event: React.FormEvent) => void };
type CoursePatch = { preferredVenues: string[]; preferredSpaceTypes: string[]; sessionsPerWeek: number; sessionMinutes: number };
function Composer({ title, children, forceOpen = false }: { title: string; children: ReactNode; forceOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  return <details className="admin-composer ui-card" open={open || forceOpen} onToggle={(event) => setOpen(event.currentTarget.open)}><summary><Plus size={18} />{title}</summary>{(open || forceOpen) && <div className="mt-5">{children}</div>}</details>;
}
function Fields({ fields, form, setForm }: Pick<FormProps, "form" | "setForm"> & { fields: [string, string, string?][] }) {
  return <>{fields.map(([key, label, type]) => <label key={key} className="block"><span className="ui-label">{label}</span><input className="ui-input" type={type || "text"} value={form[key] || ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={!label.includes("optional")} minLength={type === "password" ? 12 : undefined} /></label>)}</>;
}
export function AnnouncementManagement({ form, setForm, onSubmit, revision }: FormProps & { revision: number }) {
  return <div className="space-y-5"><DataWorkspace<{ _id: string; title: string; message: string; audience: string; priority: string }> resource="announcements" revision={revision} renderDetails={(item) => <div><h4 className="font-semibold">{item.title}</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.message}</p><p className="mt-3 text-xs text-slate-500">{item.audience} · {item.priority}</p></div>} />
    <Composer title="Publish announcement"><form onSubmit={onSubmit} className="max-w-3xl space-y-4"><Fields form={form} setForm={setForm} fields={[["title", "Announcement title"]]} /><label><span className="ui-label">Message</span><textarea className="ui-input min-h-40" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} required /></label><label><span className="ui-label">Audience</span><select className="ui-input" value={form.audience || "all"} onChange={(event) => setForm({ ...form, audience: event.target.value })}><option value="all">Students and staff</option><option value="students">Students only</option><option value="staff">Staff only</option></select></label><button className="ui-btn ui-btn-primary">Publish announcement</button></form></Composer></div>;
}
export function Overview({ metrics, setTab }: { metrics: Metrics; setTab: (tab: Tab) => void }) {
  const cards = [
    { label: "Departments", value: metrics.departments, icon: Network, tab: "departments" },
    { label: "Active courses", value: metrics.courses, icon: BookOpen, tab: "courses" },
    { label: "Campus locations", value: metrics.rooms, icon: Building2, tab: "rooms" },
    { label: "Published classes", value: metrics.publishedClasses, icon: CalendarDays, tab: "timetable" },
    { label: "Pending room bookings", value: metrics.pendingBookings, icon: CalendarDays, tab: "bookings" },
    { label: "Staff accounts", value: metrics.staff, icon: Users, tab: "accounts" },
    { label: "Active students", value: metrics.students, icon: Users, tab: "students" },
  ] as const;
  return <>
    <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-3">
      {cards.map(({ label, value, icon: Icon, tab }) => (
        <button key={label} className="ui-card admin-metric-card min-w-0 text-left transition hover:-translate-y-0.5" onClick={() => setTab(tab)}>
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 text-xs leading-4 text-slate-500 sm:text-sm">{label}</span>
            <span className="hidden shrink-0 rounded-xl bg-emerald-50 p-2.5 sm:block"><Icon size={20} className="text-emerald-700" /></span>
          </div>
          <p className="mt-2 break-words text-2xl font-semibold tracking-tight tabular-nums sm:mt-3 sm:text-3xl">{value.toLocaleString()}</p>
        </button>
      ))}
    </div>
    <section className="ui-card mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="ui-eyebrow">Selected planning cycle</p><h3 className="ui-title mt-1 text-2xl">Timetable health</h3></div>
        <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setTab("timetable")}>Open scheduling workspace</button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3">
        {[[metrics.allocations, "Active allocations", "Allocations"], [metrics.scheduledRooms, "Rooms scheduled", "Rooms"], [metrics.scheduledDepartments, "Departments represented", "Depts."]].map(([count, label, compactLabel]) => (
          <div key={label} className="ui-card-muted admin-metric-card min-w-0">
            <strong className="break-words text-lg tabular-nums sm:text-xl">{count}</strong>
            <p className="mt-1 break-words text-[11px] leading-4 text-slate-500 sm:text-xs"><span className="sm:hidden" aria-label={String(label)}>{compactLabel}</span><span className="hidden sm:inline">{label}</span></p>
          </div>
        ))}
      </div>
    </section>
  </>;
}
export function Timetable({ form, setForm, academicYear, semester, departmentFilter, onGenerated, onSubmit, onCancel, onPublish, revision }: FormProps & {
  academicYear: string; semester: string; departmentFilter: string; revision: number;
  onGenerated: (message: string) => void; onCancel: (id: string) => void; onPublish: (id: string) => void;
}) {
  return <div className="space-y-5"><DataWorkspace<Allocation> resource="allocations" revision={revision} scope={{ academicYear, semester, ...(departmentFilter ? { department: departmentFilter } : {}) }} actions={[
    { label: "Cancel allocations", url: "/api/admin/allocations", body: { status: "cancelled" }, warning: "Selected classes will be cancelled and removed from active student timetables. This is processed one allocation at a time." },
  ]} renderDetails={(item) => <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-3"><div><strong>{item.course?.code} · {item.course?.title}</strong><p>{item.department?.name}</p></div><div><p>{item.dayOfWeek} · {item.startTime}–{item.endTime}</p><p>{item.room?.code} · {item.room?.building}</p></div><div><p>{item.cohort} · {item.stream || "Full cohort"}</p><p>{item.streamSize ? `${item.streamSize} students` : ""}</p></div></div><div className="flex flex-wrap gap-2">{item.status === "draft" && <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => onPublish(item._id)}>Publish complete course schedule</button>}{item.status !== "cancelled" && <button type="button" className="ui-btn ui-btn-danger ui-btn-sm" onClick={() => onCancel(item._id)}>Cancel allocation</button>}</div></div>} />
    <Composer title="Automatic timetable generation"><TimetableGenerator key={`${academicYear}:${semester}:${departmentFilter}`} academicYear={academicYear} semester={semester} departmentFilter={departmentFilter} onSaved={onGenerated} /></Composer>
    <Composer title="Schedule a class manually"><form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
      <RecordSelect resource="departments" label="Department" value={form.department} filters={{ status: "active" }} onChange={(department) => setForm({ ...form, department, course: "", room: "" })} required />
      <RecordSelect key={`${form.department}:${semester}`} resource="courses" label="Course" value={form.course} filters={{ status: "active", semester, ...(form.department ? { department: form.department } : {}) }} onChange={(course) => setForm({ ...form, course, room: "" })} required />
      <RecordSelect key={form.course} resource="rooms" label="Room" value={form.room} filters={{ status: "available", teaching: "1", ...(form.course ? { courseId: form.course } : {}) }} onChange={(room) => setForm({ ...form, room })} required />
      <div className="grid grid-cols-3 gap-2"><label><span className="ui-label">Day</span><select className="ui-input" value={form.dayOfWeek} onChange={(event) => setForm({ ...form, dayOfWeek: event.target.value })}>{weekdays.map((day) => <option key={day}>{day}</option>)}</select></label><Fields form={form} setForm={setForm} fields={[["startTime", "Start", "time"], ["endTime", "End", "time"]]} /></div>
      <label className="md:col-span-2"><span className="ui-label">Notes (optional)</span><textarea className="ui-input" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><button className="ui-btn ui-btn-primary w-fit">Save class draft</button>
    </form></Composer></div>;
}
export function DepartmentManagement({ form, setForm, onSubmit, onUpdate, revision }: FormProps & { revision: number; onUpdate: (department: Department, active?: boolean) => Promise<boolean> }) {
  return <div className="space-y-5"><DataWorkspace<Department> resource="departments" revision={revision} actions={[
    { label: "Activate", url: "/api/admin/departments", body: { active: true } }, { label: "Deactivate", url: "/api/admin/departments", body: { active: false } },
  ]} renderDetails={(department) => <DepartmentEditor key={department._id} department={department} onUpdate={onUpdate} />} /><Composer title="Add department"><form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2"><Fields form={form} setForm={setForm} fields={[["code", "Code"], ["name", "Department name"], ["faculty", "School / faculty"], ["headOfDepartment", "Head of department (optional)"]]} /><button className="ui-btn ui-btn-primary w-fit">Create department</button></form></Composer></div>;
}
function DepartmentEditor({ department, onUpdate }: { department: Department; onUpdate: (department: Department) => Promise<boolean> }) {
  const [form, setForm] = useState<Record<string, string>>({ code: department.code, name: department.name, faculty: department.faculty, headOfDepartment: department.headOfDepartment || "" });
  const [busy, setBusy] = useState(false);
  return <form onSubmit={(event) => { event.preventDefault(); setBusy(true); void onUpdate({ ...department, ...form }).finally(() => setBusy(false)); }} className="grid gap-3 md:grid-cols-2"><Fields form={form} setForm={setForm} fields={[["code", "Code"], ["name", "Department name"], ["faculty", "School / faculty"], ["headOfDepartment", "Head of department (optional)"]]} />{department.sourceUrl && <a className="text-sm text-emerald-700 underline" href={department.sourceUrl} target="_blank" rel="noopener noreferrer">Official UNZA source · {department.verifiedAt}</a>}<button className="ui-btn ui-btn-primary ui-btn-sm w-fit" disabled={busy}>{busy ? "Saving..." : "Save changes"}</button></form>;
}
export function CourseManagement({ form, setForm, academicYear, onSubmit, onSaveCourse, revision, onConfigure }: FormProps & {
  academicYear: string; revision: number; onSaveCourse: (course: Course, patch: CoursePatch) => Promise<boolean>; onConfigure: (course: Course) => void;
}) {
  return <div className="space-y-5"><DataWorkspace<Course> resource="courses" revision={revision} actions={[
    { label: "Activate", url: "/api/admin/courses", body: { active: true } },
    { label: "Deactivate", url: "/api/admin/courses", body: { active: false }, warning: "Courses with active timetable allocations must be cancelled before deactivation. Partial results will be reported." },
  ]} renderDetails={(course) => course.catalogueOnly ? <div><p>This sourced catalogue entry needs approved scheduling details before use.</p><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm mt-3" onClick={() => onConfigure(course)}>Configure scheduling</button></div> : <CourseCard key={course._id} course={course} academicYear={academicYear} onSave={onSaveCourse} />} />
    <Composer title="Add or configure a course" forceOpen={Boolean(form.code)}><form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-3"><Fields form={form} setForm={setForm} fields={[["code", "Course code"], ["title", "Course title"], ["level", "Level"], ["semester", "Semester"], ["credits", "Credits", "number"], ["expectedEnrollment", "Expected enrolment", "number"], ["sessionsPerWeek", "Sessions per week", "number"], ["sessionMinutes", "Session length (minutes)", "number"], ["lecturer", "Lecturer (optional)"]]} /><RecordSelect resource="departments" label="Department" filters={{ status: "active" }} value={form.department} onChange={(department) => setForm({ ...form, department })} required /><button className="ui-btn ui-btn-primary h-fit w-fit self-end">Save course</button></form></Composer>
  </div>;
}
function CourseCard({ course, academicYear, onSave }: { course: Course; academicYear: string; onSave: (course: Course, patch: CoursePatch) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [roster, setRoster] = useState(false);
  const [venues, setVenues] = useState((course.preferredVenues || []).map((room) => room._id));
  const [labels, setLabels] = useState<Record<string, string>>(Object.fromEntries((course.preferredVenues || []).map((room) => [room._id, room.code])));
  const [spaceTypes, setSpaceTypes] = useState(course.preferredSpaceTypes?.length ? course.preferredSpaceTypes : ["lecture_room", "laboratory", "seminar_room"]);
  const [sessions, setSessions] = useState(String(course.sessionsPerWeek || 2));
  const [minutes, setMinutes] = useState(String(course.sessionMinutes || 120));
  const [busy, setBusy] = useState(false);
  return <div className="space-y-4"><div><strong>{course.code} · {course.title}</strong><p className="mt-1 text-sm text-slate-500">{course.department?.name} · {course.level} · {course.expectedEnrollment} expected · {course.sessionsPerWeek || 2} × {course.sessionMinutes || 120} min/week</p><p className="mt-1 text-xs text-slate-500">{course.preferredVenues?.length ? `Preferred venues: ${course.preferredVenues.map((room) => room.code).join(", ")}` : "Venues auto-selected by scheduler"}</p></div>
    <div className="flex flex-wrap gap-2"><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setRoster(!roster)}>{roster ? "Close roster" : "Manage student roster"}</button><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setEditing(!editing)}>{editing ? "Close settings" : "Scheduling settings"}</button></div>
    {roster && <StudentRoster courseId={course._id} courseCode={course.code} academicYear={academicYear} semester={course.semester} />}
    {editing && <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><div className="grid gap-3 sm:grid-cols-2"><label><span className="ui-label">Sessions / week</span><input className="ui-input" type="number" min={1} max={6} value={sessions} onChange={(event) => setSessions(event.target.value)} /></label><label><span className="ui-label">Session minutes</span><input className="ui-input" type="number" min={30} max={300} step={30} value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label></div>
      <fieldset><legend className="ui-label">Teaching-space types</legend><div className="flex flex-wrap gap-4">{["lecture_room", "laboratory", "seminar_room"].map((type) => <label key={type} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={spaceTypes.includes(type)} onChange={() => setSpaceTypes((current) => current.includes(type) ? current.filter((value) => value !== type) : [...current, type])} />{type.replaceAll("_", " ")}</label>)}</div></fieldset>
      <RecordSelect resource="rooms" label="Add preferred venue" filters={{ status: "available", teaching: "1" }} value="" onChange={(id, label) => { if (id) { setVenues((current) => current.includes(id) ? current : [...current, id]); setLabels((current) => ({ ...current, [id]: label || id })); } }} />
      <p className="text-xs text-slate-500">First venue is the walking-distance anchor. Remove all venues for automatic selection.</p><div className="flex flex-wrap gap-2">{venues.map((id, index) => <button type="button" key={id} className="ui-chip" onClick={() => setVenues((current) => current.filter((value) => value !== id))}>{index === 0 ? "Anchor: " : ""}{labels[id]} ×</button>)}</div>
      <button type="button" disabled={busy} className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => { setBusy(true); void onSave(course, { preferredVenues: venues, preferredSpaceTypes: spaceTypes, sessionsPerWeek: Number(sessions), sessionMinutes: Number(minutes) }).then((success) => { if (success) setEditing(false); }).finally(() => setBusy(false)); }}>{busy ? "Saving..." : "Save settings"}</button>
    </div>}
  </div>;
}
function RoomClassification({ room, onClassify }: { room: Room; onClassify: (room: Room, spaceType: string) => Promise<boolean> }) {
  const [spaceType, setSpaceType] = useState(room.spaceType || "");
  const [busy, setBusy] = useState(false);
  return <div className="space-y-3">
    <strong>{room.code} · {room.name}</strong>
    <p className="text-sm">{room.building} · {room.capacity || 0} seats · {room.spaceType?.replaceAll("_", " ") || "Unclassified - staff review required"}</p>
    <p className="text-xs text-slate-500">Coordinates: {room.latitude ?? "Not set"}, {room.longitude ?? "Not set"}</p>
    <p className="text-sm text-slate-600">Students can book only locations explicitly classified as lecture rooms. A legacy category does not grant booking access. Verify the location before classifying it; existing allocations, course preferences and bookings are protected.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      setBusy(true);
      void onClassify(room, spaceType).finally(() => setBusy(false));
    }}>
      <label><span className="ui-label">Approved location type</span>
        <select required className="ui-input" value={spaceType} disabled={busy} onChange={(event) => setSpaceType(event.target.value)}>
          <option value="" disabled>Unclassified - select a verified type</option>
          {adminFilterOptions.spaceType.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      <button className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy || !spaceType || spaceType === room.spaceType}>{busy ? "Saving..." : "Save classification"}</button>
    </form>
  </div>;
}
export function RoomManagement({ form, setForm, onSubmit, revision, onClassify }: FormProps & { revision: number; onClassify: (room: Room, spaceType: string) => Promise<boolean> }) {
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const latitude = Number(form.latitude), longitude = Number(form.longitude);
  const selectedCoords: [number, number] | null = Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0) ? [latitude, longitude] : null;
  const selectCoords = ([lat, lng]: [number, number]) => setForm({ ...form, latitude: lat.toFixed(6), longitude: lng.toFixed(6) });
  const useLocation = () => {
    if (!navigator.geolocation) { setLocationError("This browser does not provide location services."); return; }
    setLocationError(""); setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => { selectCoords([position.coords.latitude, position.coords.longitude]); setLocating(false); }, (error) => { setLocationError(error.code === error.PERMISSION_DENIED ? "Location permission was denied." : "Unable to determine current location."); setLocating(false); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  };
  return <div className="space-y-5"><DataWorkspace<Room> resource="rooms" revision={revision} actions={[
    { label: "Bring online", url: "/api/admin/rooms", body: { isAvailable: true } }, { label: "Take offline", url: "/api/admin/rooms", body: { isAvailable: false } },
  ]} renderDetails={(room) => <RoomClassification key={room._id} room={room} onClassify={onClassify} />} />
    <Composer title="Register a campus location"><form onSubmit={onSubmit} className="grid gap-5 md:grid-cols-2"><div className="space-y-3"><label><span className="ui-label">Place type</span>    <select required className="ui-input" value={form.spaceType} onChange={(event) => setForm({ ...form, spaceType: event.target.value })}><option value="" disabled>Select a verified location type</option>{adminFilterOptions.spaceType.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label><LocationPickerMap selectedCoords={selectedCoords} onSelectCoords={selectCoords} /><button type="button" disabled={locating} onClick={useLocation} className="ui-btn ui-btn-secondary">{locating ? "Finding location..." : "Use current location"}</button>{locationError && <p role="alert" className="text-sm text-rose-700">{locationError}</p>}<div className="grid grid-cols-2 gap-3">{["latitude", "longitude"].map((key) => <label key={key}><span className="ui-label">{key}</span><input className="ui-input" type="number" step="any" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required /></label>)}</div></div><div className="space-y-3"><Fields form={form} setForm={setForm} fields={[["name", "Location name"], ["code", "Location code"], ["building", "Building"], ["capacity", "Capacity / seats", "number"], ["floor", "Floor (optional)", "number"], ["category", "Category (optional)"]]} /><button className="ui-btn ui-btn-primary">Register location</button></div></form></Composer></div>;
}
export function AccountManagement({ form, setForm, onSubmit, revision }: FormProps & { revision: number }) {
  return <div className="space-y-5"><DataWorkspace<StaffAccount> resource="accounts" revision={revision} actions={[
    { label: "Activate", url: "/api/admin/users", body: { status: "active" } },
    { label: "Deactivate", url: "/api/admin/users", body: { status: "inactive" }, warning: "Selected staff lose access immediately. The final active administrator is protected. Partial results will be reported." },
    { label: "Promote to administrator", url: "/api/admin/users", body: { role: "admin" }, warning: "Selected accounts gain administrator privileges immediately." },
    { label: "Set staff role", url: "/api/admin/users", body: { role: "staff" }, warning: "Selected administrators lose administrator privileges immediately. The final active administrator is protected." },
  ]} /><Composer title="Provision a staff account"><form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2"><Fields form={form} setForm={setForm} fields={[["name", "Full name"], ["staffId", "Staff ID"], ["email", "University email", "email"], ["department", "Department / unit (optional)"], ["password", "Temporary password (12+ characters)", "password"]]} /><label><span className="ui-label">Role</span><select className="ui-input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="staff">Staff</option><option value="admin">Administrator</option></select></label><button className="ui-btn ui-btn-primary w-fit">Create account</button></form></Composer></div>;
}
