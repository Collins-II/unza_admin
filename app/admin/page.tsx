"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Building2, CalendarDays, CheckCircle2, LayoutDashboard, LogOut, Megaphone, Network, Plus, Users } from "lucide-react";

type Tab = "overview" | "timetable" | "departments" | "courses" | "rooms" | "accounts" | "announcements";
type Department = { _id: string; code: string; name: string; faculty: string; headOfDepartment?: string; active?: boolean };
type Course = { _id: string; code: string; title: string; level: string; semester: string; expectedEnrollment: number; department?: Department };
type Room = { _id: string; name: string; code: string; building: string; capacity?: number; latitude?: number; longitude?: number; spaceType?: string; isAvailable?: boolean };
type Allocation = { _id: string; academicYear: string; semester: string; cohort: string; dayOfWeek: string; startTime: string; endTime: string; lecturer?: string; status: string; course?: { code?: string; title?: string; expectedEnrollment?: number }; room?: { name?: string; code?: string; building?: string }; department?: { code?: string; name?: string } };
type Metrics = { staff: number; rooms: number; activeRooms: number; bookings: number; pendingBookings: number; paidOrders: number };
type StaffAccount = { _id: string; name: string; studentId: string; email: string; department?: string; role: "staff" | "admin"; status: "active" | "pending" | "inactive" };

const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Operations", icon: LayoutDashboard },
  { id: "timetable", label: "University timetable", icon: CalendarDays },
  { id: "departments", label: "Departments", icon: Network },
  { id: "courses", label: "Courses", icon: BookOpen },
  { id: "rooms", label: "Lecture rooms", icon: Building2 },
  { id: "accounts", label: "Staff accounts", icon: Users },
  { id: "announcements", label: "Announcements", icon: Megaphone },
];

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LocationPickerMap = dynamic(() => import("@/components/admin/LocationPickerMap"), { ssr: false, loading: () => <div className="h-64 animate-pulse bg-gray-100" /> });

export default function AdminPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<Tab>("overview");
  const [metrics, setMetrics] = useState<Metrics>({ staff: 0, rooms: 0, activeRooms: 0, bookings: 0, pendingBookings: 0, paidOrders: 0 });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [academicYear, setAcademicYear] = useState("2026/2027");
  const [semester, setSemester] = useState("Semester 1");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [departmentForm, setDepartmentForm] = useState<Record<string, string>>({ code: "", name: "", faculty: "", headOfDepartment: "" });
  const [courseForm, setCourseForm] = useState<Record<string, string>>({ code: "", title: "", department: "", level: "Undergraduate", semester: "Semester 1", credits: "3", expectedEnrollment: "50", lecturer: "" });
  const [allocationForm, setAllocationForm] = useState<Record<string, string>>({ department: "", course: "", room: "", cohort: "", lecturer: "", dayOfWeek: "Monday", startTime: "08:00", endTime: "10:00", notes: "" });
  const [roomForm, setRoomForm] = useState<Record<string, string>>({ name: "", code: "", building: "", capacity: "50", floor: "0", latitude: "", longitude: "", spaceType: "lecture_room", category: "general" });
  const [announcementForm, setAnnouncementForm] = useState<Record<string, string>>({ title: "", message: "" });
  const [accountForm, setAccountForm] = useState<Record<string, string>>({ name: "", staffId: "", email: "", department: "", password: "", role: "staff" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ academicYear, semester });
      if (departmentFilter) query.set("department", departmentFilter);
      const responses = await Promise.all([
        fetch("/api/admin/overview"), fetch("/api/admin/departments"), fetch("/api/admin/courses"),
        fetch("/api/admin/rooms"), fetch(`/api/admin/allocations?${query.toString()}`), fetch("/api/admin/users"),
      ]);
      if (responses.some((response) => !response.ok)) throw new Error("Unable to load university operations data.");
      const [overview, departmentData, courseData, roomData, allocationData, accountData] = await Promise.all(responses.map((response) => response.json()));
      setMetrics(overview.metrics);
      setDepartments(departmentData.departments || []);
      setCourses(courseData.courses || []);
      setRooms(roomData.rooms || []);
      setAllocations(allocationData.allocations || []);
      setAccounts(accountData.users || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load university operations data.");
    } finally {
      setLoading(false);
    }
  }, [academicYear, departmentFilter, semester]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    if (status === "authenticated" && session.user.role !== "staff" && session.user.role !== "admin") router.replace("/login");
    if (status === "authenticated" && (session.user.role === "staff" || session.user.role === "admin")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load();
    }
  }, [status, session, router, load]);

  const request = async (url: string, method: "POST" | "PATCH" | "DELETE", body: unknown) => {
    setError("");
    setNotice("");
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The operation could not be completed.");
    return data;
  };

  const createDepartment = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await request("/api/admin/departments", "POST", departmentForm); setDepartmentForm({ code: "", name: "", faculty: "", headOfDepartment: "" }); setNotice("Department created."); void load(); } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to create department."); }
  };

  const updateDepartment = async (department: Department, active?: boolean) => {
    try {
      await request("/api/admin/departments", "PATCH", active === undefined ? { id: department._id, code: department.code, name: department.name, faculty: department.faculty, headOfDepartment: department.headOfDepartment } : { id: department._id, active });
      setNotice(active === false ? "Department deactivated." : "Department updated.");
      void load();
    } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to update department."); }
  };

  const deleteDepartment = async (department: Department) => {
    if (!window.confirm(`Deactivate ${department.name}? Existing courses and timetable records will be preserved.`)) return;
    try {
      await request("/api/admin/departments", "DELETE", { id: department._id });
      setNotice("Department deactivated.");
      void load();
    } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to deactivate department."); }
  };

  const createCourse = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await request("/api/admin/courses", "POST", { ...courseForm, credits: Number(courseForm.credits), expectedEnrollment: Number(courseForm.expectedEnrollment) }); setCourseForm({ code: "", title: "", department: "", level: "Undergraduate", semester: "Semester 1", credits: "3", expectedEnrollment: "50", lecturer: "" }); setNotice("Course created."); void load(); } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to create course."); }
  };

  const createAllocation = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await request("/api/admin/allocations", "POST", { ...allocationForm, academicYear, semester, status: "published" }); setNotice("Class allocated and timetable conflict checks passed."); setAllocationForm({ ...allocationForm, cohort: "", course: "", room: "", notes: "" }); void load(); } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to allocate class."); }
  };

  const createRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await request("/api/admin/rooms", "POST", { ...roomForm, capacity: Number(roomForm.capacity), floor: Number(roomForm.floor), latitude: Number(roomForm.latitude), longitude: Number(roomForm.longitude) }); setRoomForm({ name: "", code: "", building: "", capacity: "50", floor: "0", latitude: "", longitude: "", spaceType: "lecture_room", category: "general" }); setNotice("University location added with navigation coordinates."); void load(); } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to add university location."); }
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await request("/api/admin/users", "POST", accountForm);
      setAccountForm({ name: "", staffId: "", email: "", department: "", password: "", role: "staff" });
      setNotice("Staff account provisioned.");
      void load();
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : "Unable to provision staff account.");
    }
  };

  const publishAnnouncement = async (event: React.FormEvent) => {
    event.preventDefault();
    try { const data = await request("/api/admin/announcements", "POST", { ...announcementForm, priority: "high" }); setAnnouncementForm({ title: "", message: "" }); setNotice(`Announcement sent to ${data.sent} active staff/admin accounts.`); } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to publish announcement."); }
  };

  const cancelAllocation = async (id: string) => {
    try { await request("/api/admin/allocations", "PATCH", { id, status: "cancelled" }); setNotice("Class allocation cancelled."); void load(); } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to cancel allocation."); }
  };

  if (status === "loading" || loading) return <main className="ui-page flex min-h-screen items-center justify-center">Loading university administration...</main>;

  return (
    <main className="min-h-screen bg-[#f5f7f5] text-[#052e16]">
      <div className="mx-auto flex min-h-screen max-w-[1700px]">
        <aside className="hidden w-72 shrink-0 bg-[#052e16] p-6 text-white lg:flex lg:flex-col">
          <div className="border-b border-white/20 pb-6"><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">University of Zambia</p><h1 className="mt-2 text-2xl font-black uppercase">Central Admin</h1><p className="mt-2 text-xs text-emerald-100/70">Academic operations command centre</p></div>
          <nav className="mt-8 space-y-2">{tabs.filter(({ id }) => id !== "accounts" || session?.user?.role === "admin").map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-bold ${tab === id ? "bg-emerald-500 text-white" : "text-emerald-100/70 hover:bg-white/10 hover:text-white"}`}><Icon className="h-5 w-5" />{label}</button>)}</nav>
          <button onClick={() => void signOut({ callbackUrl: "/login" })} className="mt-auto flex items-center gap-3 px-3 py-3 text-sm font-bold text-emerald-100/70 hover:text-white"><LogOut className="h-5 w-5" />Sign out</button>
        </aside>
        <section className="min-w-0 flex-1 p-4 pb-12 md:p-8">
          <header className="mb-7 flex items-start justify-between gap-4"><div><p className="ui-eyebrow">University-wide academic control</p><h2 className="mt-2 text-4xl font-black uppercase tracking-tight">Good day, {session?.user?.name?.split(" ")[0] || "Administrator"}</h2><p className="mt-2 text-sm text-gray-600">Plan, publish, and monitor the lecture timetable across every department.</p></div><button onClick={() => void signOut({ callbackUrl: "/login" })} className="ui-btn ui-btn-secondary"><LogOut className="h-4 w-4" />Sign out</button></header>
          <div className="mb-6 flex gap-2 overflow-x-auto lg:hidden">{tabs.filter(({ id }) => id !== "accounts" || session?.user?.role === "admin").map(({ id, label }) => <button key={id} onClick={() => setTab(id)} className={`ui-chip whitespace-nowrap ${tab === id ? "ui-chip-active" : ""}`}>{label}</button>)}</div>
          <div className="mb-6 flex flex-wrap items-end gap-3 border-2 border-[#052e16] bg-white p-4"><label className="min-w-40 flex-1"><span className="ui-label">Academic year</span><input className="ui-input" value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} /></label><label className="min-w-40 flex-1"><span className="ui-label">Semester</span><select className="ui-input" value={semester} onChange={(event) => setSemester(event.target.value)}><option>Semester 1</option><option>Semester 2</option><option>Summer</option></select></label><label className="min-w-56 flex-1"><span className="ui-label">Department filter</span><select className="ui-input" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="">All departments</option>{departments.map((department) => <option key={department._id} value={department._id}>{department.code} — {department.name}</option>)}</select></label></div>
          {error && <div className="mb-5 border-2 border-rose-700 bg-rose-50 p-4 text-sm font-bold text-rose-800">{error}</div>}
          {notice && <div className="mb-5 border-2 border-emerald-700 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{notice}</div>}
          {tab === "overview" && <Overview metrics={metrics} allocations={allocations} departmentCount={departments.length} courseCount={courses.length} setTab={setTab} />}
          {tab === "timetable" && <Timetable allocations={allocations} form={allocationForm} setForm={setAllocationForm} courses={courses} rooms={rooms} departments={departments} onSubmit={createAllocation} onCancel={cancelAllocation} />}
          {tab === "departments" && <DepartmentManagement departments={departments} form={departmentForm} setForm={setDepartmentForm} onSubmit={createDepartment} onUpdate={updateDepartment} onDelete={deleteDepartment} />}
          {tab === "courses" && <CourseManagement courses={courses} departments={departments} form={courseForm} setForm={setCourseForm} onSubmit={createCourse} />}
          {tab === "rooms" && <RoomManagement rooms={rooms} form={roomForm} setForm={setRoomForm} onSubmit={createRoom} onToggle={async (room) => { try { await request("/api/admin/rooms", "PATCH", { id: room._id, isAvailable: !room.isAvailable }); void load(); } catch (operationError) { setError(operationError instanceof Error ? operationError.message : "Unable to update room."); } }} />}
          {tab === "accounts" && session?.user?.role === "admin" && <AccountManagement accounts={accounts} form={accountForm} setForm={setAccountForm} onSubmit={createAccount} />}
          {tab === "announcements" && <section className="ui-card max-w-3xl"><p className="ui-eyebrow">Official communications</p><h3 className="ui-title text-2xl">Publish announcement</h3><form onSubmit={publishAnnouncement} className="mt-6 space-y-4"><input className="ui-input" placeholder="Announcement title" value={announcementForm.title} onChange={(event) => setAnnouncementForm({ ...announcementForm, title: event.target.value })} required /><textarea className="ui-input min-h-40" placeholder="Write the official message..." value={announcementForm.message} onChange={(event) => setAnnouncementForm({ ...announcementForm, message: event.target.value })} required /><button className="ui-btn ui-btn-primary">Publish announcement</button></form></section>}
        </section>
      </div>
    </main>
  );
}

function Overview({ metrics, allocations, departmentCount, courseCount, setTab }: { metrics: Metrics; allocations: Allocation[]; departmentCount: number; courseCount: number; setTab: (tab: Tab) => void }) {
  const cards = [{ label: "Departments", value: departmentCount, icon: Network }, { label: "Courses loaded", value: courseCount, icon: BookOpen }, { label: "Lecture rooms", value: metrics.rooms, icon: Building2 }, { label: "Published classes", value: allocations.filter((allocation) => allocation.status === "published").length, icon: CalendarDays }, { label: "Staff accounts", value: metrics.staff, icon: CheckCircle2 }];
  return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{cards.map(({ label, value, icon: Icon }) => <div key={label} className="ui-card"><Icon className="h-6 w-6 text-emerald-700" /><p className="mt-5 text-3xl font-black">{value}</p><p className="text-xs font-black uppercase tracking-wider text-gray-500">{label}</p></div>)}</div><section className="ui-card mt-6"><div className="flex items-center justify-between"><div><p className="ui-eyebrow">Current planning cycle</p><h3 className="ui-title text-2xl">Timetable health</h3></div><button className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setTab("timetable")}><Plus className="h-4 w-4" />Allocate class</button></div><div className="mt-5 grid gap-3 md:grid-cols-3"><div className="ui-card-muted"><strong>{allocations.length}</strong><p className="text-xs text-gray-500">Active allocations</p></div><div className="ui-card-muted"><strong>{new Set(allocations.map((allocation) => allocation.room?.code)).size}</strong><p className="text-xs text-gray-500">Rooms scheduled</p></div><div className="ui-card-muted"><strong>{new Set(allocations.map((allocation) => allocation.department?.code)).size}</strong><p className="text-xs text-gray-500">Departments represented</p></div></div></section></>;
}

function Timetable({ allocations, form, setForm, courses, rooms, departments, onSubmit, onCancel }: { allocations: Allocation[]; form: Record<string, string>; setForm: (form: Record<string, string>) => void; courses: Course[]; rooms: Room[]; departments: Department[]; onSubmit: (event: React.FormEvent) => void; onCancel: (id: string) => void }) {
  const visibleCourses = courses.filter((course) => !form.department || course.department?._id === form.department);
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]"><section className="ui-card min-w-0"><div className="mb-5"><p className="ui-eyebrow">Departmental timetable</p><h3 className="ui-title text-2xl">University class allocations</h3><p className="mt-2 text-sm text-gray-600">Room, cohort, lecturer, capacity, and time conflicts are checked before a class is published.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{weekdays.map((day) => <div key={day} className="border-2 border-[#052e16] bg-[#fbfdfb] p-3"><h4 className="mb-3 border-b-2 border-emerald-600 pb-2 text-sm font-black uppercase">{day}</h4><div className="space-y-2">{allocations.filter((allocation) => allocation.dayOfWeek === day).map((allocation) => <article key={allocation._id} className="border-l-4 border-emerald-600 bg-white p-3 shadow-sm"><div className="flex justify-between gap-2"><strong className="text-sm">{allocation.course?.code}</strong><span className="text-[10px] font-black uppercase text-emerald-700">{allocation.status}</span></div><p className="text-xs">{allocation.course?.title}</p><p className="mt-2 text-[11px] font-bold">{allocation.startTime}–{allocation.endTime} · {allocation.room?.code}</p><p className="text-[11px] text-gray-500">{allocation.cohort} · {allocation.department?.code}</p><button onClick={() => onCancel(allocation._id)} className="mt-2 text-[10px] font-black uppercase text-rose-700">Cancel allocation</button></article>)}</div></div>)}</div></section><form onSubmit={onSubmit} className="ui-card h-fit space-y-3"><p className="ui-eyebrow">Allocation engine</p><h3 className="ui-title text-2xl">Schedule a class</h3><label><span className="ui-label">Department</span><select className="ui-input" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value, course: "" })} required><option value="">Select department</option>{departments.map((department) => <option key={department._id} value={department._id}>{department.code} — {department.name}</option>)}</select></label><label><span className="ui-label">Course</span><select className="ui-input" value={form.course} onChange={(event) => setForm({ ...form, course: event.target.value })} required><option value="">Select course</option>{visibleCourses.map((course) => <option key={course._id} value={course._id}>{course.code} — {course.title}</option>)}</select></label><label><span className="ui-label">Room</span><select className="ui-input" value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} required><option value="">Select room</option>{rooms.filter((room) => room.isAvailable !== false).map((room) => <option key={room._id} value={room._id}>{room.code} — {room.name} ({room.capacity || 0})</option>)}</select></label><input className="ui-input" placeholder="Cohort e.g. 2025 Computer Science" value={form.cohort} onChange={(event) => setForm({ ...form, cohort: event.target.value })} required /><input className="ui-input" placeholder="Lecturer name" value={form.lecturer} onChange={(event) => setForm({ ...form, lecturer: event.target.value })} /><div className="grid grid-cols-3 gap-2"><select className="ui-input" value={form.dayOfWeek} onChange={(event) => setForm({ ...form, dayOfWeek: event.target.value })}>{weekdays.map((day) => <option key={day}>{day}</option>)}</select><input className="ui-input" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required /><input className="ui-input" type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} required /></div><textarea className="ui-input" placeholder="Notes or delivery details" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /><button className="ui-btn ui-btn-primary w-full"><CalendarDays className="h-4 w-4" />Publish allocation</button></form></div>;
}

function DepartmentManagement({ departments, form, setForm, onSubmit, onUpdate, onDelete }: { departments: Department[]; form: Record<string, string>; setForm: (form: Record<string, string>) => void; onSubmit: (event: React.FormEvent) => void; onUpdate: (department: Department, active?: boolean) => Promise<void>; onDelete: (department: Department) => Promise<void> }) {
  const [editing, setEditing] = useState<Department | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const beginEdit = (department: Department) => {
    setEditing(department);
    setEditForm({ code: department.code, name: department.name, faculty: department.faculty, headOfDepartment: department.headOfDepartment || "" });
  };
  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    await onUpdate({ ...editing, ...editForm });
    setEditing(null);
  };
  return <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
    <form onSubmit={onSubmit} className="ui-card h-fit space-y-3">
      <p className="ui-eyebrow">Academic structure</p><h3 className="ui-title text-2xl">Add department</h3>
      {["code", "name", "faculty", "headOfDepartment"].map((key) => <input key={key} className="ui-input" placeholder={key === "headOfDepartment" ? "Head of department (optional)" : key.replace(/([A-Z])/g, " $1")} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={key !== "headOfDepartment"} />)}
      <button className="ui-btn ui-btn-primary w-full"><Plus className="h-4 w-4" />Create department</button>
    </form>
    <section className="ui-card">
      <p className="ui-eyebrow">Authoritative register</p><h3 className="ui-title text-2xl">Departments</h3>
      <div className="mt-5 space-y-3">{departments.map((department) => editing?._id === department._id ? <form key={department._id} onSubmit={saveEdit} className="border-2 border-emerald-600 p-4 space-y-2">{["code", "name", "faculty", "headOfDepartment"].map((key) => <input key={key} className="ui-input" placeholder={key} value={editForm[key] || ""} onChange={(event) => setEditForm({ ...editForm, [key]: event.target.value })} required={key !== "headOfDepartment"} />)}<div className="flex gap-2"><button className="ui-btn ui-btn-primary ui-btn-sm">Save changes</button><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setEditing(null)}>Cancel</button></div></form> : <article key={department._id} className="flex flex-wrap items-center justify-between gap-3 border-2 border-gray-200 p-4"><div><strong>{department.code} — {department.name}</strong><p className="text-xs text-gray-500">{department.faculty} · Head: {department.headOfDepartment || "Not assigned"}</p></div><div className="flex gap-2"><span className={`ui-badge ${department.active === false ? "ui-badge-danger" : "ui-badge-success"}`}>{department.active === false ? "Inactive" : "Active"}</span><button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => beginEdit(department)}>Edit</button>{department.active === false ? <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => void onUpdate(department, true)}>Reactivate</button> : <button className="ui-btn ui-btn-sm border border-rose-700 text-rose-700" onClick={() => void onDelete(department)}>Deactivate</button>}</div></article>)}</div>
    </section>
  </div>;
}

function CourseManagement({ courses, departments, form, setForm, onSubmit }: { courses: Course[]; departments: Department[]; form: Record<string, string>; setForm: (form: Record<string, string>) => void; onSubmit: (event: React.FormEvent) => void }) {
  return <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]"><form onSubmit={onSubmit} className="ui-card h-fit space-y-3"><p className="ui-eyebrow">Academic catalogue</p><h3 className="ui-title text-2xl">Add course</h3>{[["code", "Course code"], ["title", "Course title"], ["level", "Level"], ["semester", "Semester"], ["credits", "Credits"], ["expectedEnrollment", "Expected enrollment"], ["lecturer", "Lecturer"]].map(([key, label]) => <input key={key} className="ui-input" placeholder={label} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={key !== "lecturer"} />)}<select className="ui-input" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} required><option value="">Department</option>{departments.map((department) => <option key={department._id} value={department._id}>{department.code} — {department.name}</option>)}</select><button className="ui-btn ui-btn-primary w-full"><Plus className="h-4 w-4" />Create course</button></form><section className="ui-card"><p className="ui-eyebrow">Catalogue</p><h3 className="ui-title text-2xl">Active courses</h3><div className="mt-5 grid gap-3 md:grid-cols-2">{courses.map((course) => <div key={course._id} className="border-2 border-gray-200 p-4"><strong>{course.code}</strong><p>{course.title}</p><p className="mt-2 text-xs text-gray-500">{course.department?.code} · {course.level} · {course.expectedEnrollment} expected</p></div>)}</div></section></div>;
}

function RoomManagement({ rooms, form, setForm, onSubmit, onToggle }: { rooms: Room[]; form: Record<string, string>; setForm: (form: Record<string, string>) => void; onSubmit: (event: React.FormEvent) => void; onToggle: (room: Room) => Promise<void> }) {
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);
  const selectedCoords: [number, number] | null = Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0) ? [latitude, longitude] : null;
  const selectCoords = ([nextLatitude, nextLongitude]: [number, number]) => setForm({ ...form, latitude: nextLatitude.toFixed(6), longitude: nextLongitude.toFixed(6) });
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("This browser does not provide location services.");
      return;
    }
    setLocationError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        selectCoords([position.coords.latitude, position.coords.longitude]);
        setLocating(false);
      },
      (error) => {
        setLocationError(error.code === error.PERMISSION_DENIED ? "Location permission was denied." : "Unable to determine the current location.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  };

  return <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]"><form onSubmit={onSubmit} className="ui-card h-fit space-y-3"><p className="ui-eyebrow">University places register</p><h3 className="ui-title text-2xl">Add location</h3><p className="text-xs text-gray-600">Choose the place type first. Only teaching spaces can be assigned to lectures. Every place still receives coordinates for campus navigation.</p><select className="ui-input" value={form.spaceType} onChange={(event) => setForm({ ...form, spaceType: event.target.value })}><option value="lecture_room">Lecture room</option><option value="laboratory">Laboratory</option><option value="seminar_room">Seminar room</option><option value="office">Office</option><option value="administrative">Administrative office</option><option value="library">Library</option><option value="clinic">Clinic / health centre</option><option value="cafeteria">Cafeteria / food court</option><option value="residence">Residence</option><option value="other">Other campus location</option></select><LocationPickerMap selectedCoords={selectedCoords} onSelectCoords={selectCoords} /><button type="button" onClick={useCurrentLocation} className="ui-btn ui-btn-secondary w-full">{locating ? "Finding current location..." : "Use current device location"}</button>{locationError && <p className="text-xs font-bold text-rose-700">{locationError}</p>}<div className="grid grid-cols-2 gap-2"><input className="ui-input" type="number" step="any" placeholder="Latitude" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} required /><input className="ui-input" type="number" step="any" placeholder="Longitude" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} required /></div>{[["name", "Location name"], ["code", "Location code"], ["building", "Building"], ["capacity", "Capacity / seats"], ["floor", "Floor"]].map(([key, label]) => <input key={key} className="ui-input" type={["capacity", "floor"].includes(key) ? "number" : "text"} placeholder={label} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={key !== "floor"} />)}<input className="ui-input" placeholder="Category or service detail (optional)" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /><button className="ui-btn ui-btn-primary w-full"><Plus className="h-4 w-4" />Register university location</button></form><section className="ui-card"><p className="ui-eyebrow">University places register</p><h3 className="ui-title text-2xl">Campus locations</h3><div className="mt-5 grid gap-3 md:grid-cols-2">{rooms.map((room) => <div key={room._id} className="border-2 border-gray-200 p-4"><div className="flex justify-between"><strong>{room.code}</strong><span className={`ui-badge ${room.isAvailable ? "ui-badge-success" : "ui-badge-danger"}`}>{room.isAvailable ? "Available" : "Offline"}</span></div><p>{room.name} · {room.building}</p><p className="text-xs font-bold uppercase text-emerald-700">{(room.spaceType || "lecture_room").replaceAll("_", " ")}</p><p className="text-xs text-gray-500">{room.capacity || 0} seats</p><p className="mt-2 text-[11px] text-gray-500">Location: {room.latitude ?? "—"}, {room.longitude ?? "—"}</p><button onClick={() => void onToggle(room)} className="ui-btn ui-btn-secondary ui-btn-sm mt-3">{room.isAvailable ? "Take offline" : "Bring online"}</button></div>)}</div></section></div>;
}

function AccountManagement({ accounts, form, setForm, onSubmit }: { accounts: StaffAccount[]; form: Record<string, string>; setForm: (form: Record<string, string>) => void; onSubmit: (event: React.FormEvent) => void }) {
  return <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
    <form onSubmit={onSubmit} className="ui-card h-fit space-y-3">
      <p className="ui-eyebrow">Administrator control</p>
      <h3 className="ui-title text-2xl">Provision account</h3>
      <p className="text-sm text-gray-600">Only administrators can provision staff and administrator access.</p>
      <input className="ui-input" placeholder="Full name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      <input className="ui-input" placeholder="Staff ID e.g. UNZA-ACA-001" value={form.staffId} onChange={(event) => setForm({ ...form, staffId: event.target.value })} required />
      <input className="ui-input" type="email" placeholder="University email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
      <input className="ui-input" placeholder="Department / unit" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
      <input className="ui-input" type="password" minLength={12} placeholder="Temporary password (12+ characters)" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
      <select className="ui-input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="staff">Staff</option><option value="admin">Administrator</option></select>
      <button className="ui-btn ui-btn-primary w-full"><Users className="h-4 w-4" />Create account</button>
    </form>
    <section className="ui-card">
      <p className="ui-eyebrow">Access register</p>
      <h3 className="ui-title text-2xl">Staff and administrators</h3>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-[#052e16] text-xs uppercase"><th className="p-3">Account</th><th className="p-3">Unit</th><th className="p-3">Role</th><th className="p-3">Status</th></tr></thead><tbody>{accounts.map((account) => <tr key={account._id} className="border-b border-gray-200"><td className="p-3"><strong>{account.name}</strong><br /><span className="text-xs text-gray-500">{account.studentId} · {account.email}</span></td><td className="p-3">{account.department || "—"}</td><td className="p-3"><span className="ui-badge ui-badge-neutral">{account.role}</span></td><td className="p-3"><span className="ui-badge ui-badge-success">{account.status}</span></td></tr>)}</tbody></table>
      </div>
    </section>
  </div>;
}
