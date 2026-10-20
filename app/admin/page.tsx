"use client";

import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Building2, CalendarDays, GraduationCap, LayoutDashboard, LogOut, Megaphone, Network, Users } from "lucide-react";
import { AccountManagement, AnnouncementManagement, CourseManagement, DepartmentManagement, Overview, RoomManagement, Timetable } from "@/components/admin/AdminSections";
import { StudentManagement } from "@/components/admin/StudentManagement";
import { BookingsManagement } from "@/components/admin/BookingsManagement";
import { UnzaCatalogue } from "@/components/admin/UnzaCatalogue";
import { RecordSelect } from "@/components/admin/RecordSelect";
import { AdminActivityContext } from "@/components/admin/DataWorkspace";
import type { Department, Metrics, Tab } from "@/components/admin/types";
import "./admin.css";

const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard; description: string }[] = [
  { id: "overview", label: "Operations", icon: LayoutDashboard, description: "A live overview of university operations and your selected planning cycle." },
  { id: "timetable", label: "University timetable", icon: CalendarDays, description: "Review allocations, manage drafts and publish conflict-checked schedules." },
  { id: "bookings", label: "Room bookings", icon: CalendarDays, description: "Review student room requests and manage booking confirmations." },
  { id: "departments", label: "Departments", icon: Network, description: "Manage academic structure, schools and sourced department information." },
  { id: "courses", label: "Courses", icon: BookOpen, description: "Find courses, manage student rosters and configure teaching requirements." },
  { id: "students", label: "Students", icon: GraduationCap, description: "Search the full student register, manage access and process new intakes." },
  { id: "rooms", label: "Campus locations", icon: Building2, description: "Manage teaching spaces, availability and campus navigation coordinates." },
  { id: "accounts", label: "Staff accounts", icon: Users, description: "Provision staff access and manage account status with administrator safeguards." },
  { id: "announcements", label: "Announcements", icon: Megaphone, description: "Browse official communications and publish messages to your audience." },
];
const emptyCourse = { code: "", title: "", department: "", level: "Undergraduate", semester: "Semester 1", credits: "3", expectedEnrollment: "50", sessionsPerWeek: "2", sessionMinutes: "120", lecturer: "" };
const emptyDepartment = { code: "", name: "", faculty: "", headOfDepartment: "" };
const emptyRoom = { name: "", code: "", building: "", capacity: "50", floor: "0", latitude: "", longitude: "", spaceType: "", category: "general" };
const emptyAccount = { name: "", staffId: "", email: "", department: "", password: "", role: "staff" };

export default function AdminPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<Tab>("overview");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [academicYear, setAcademicYear] = useState("2026/2027");
  const [semester, setSemester] = useState("Semester 1");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [departmentForm, setDepartmentForm] = useState<Record<string, string>>({ ...emptyDepartment });
  const [courseForm, setCourseForm] = useState<Record<string, string>>({ ...emptyCourse });
  const [allocationForm, setAllocationForm] = useState<Record<string, string>>({ department: "", course: "", room: "", dayOfWeek: "Monday", startTime: "08:00", endTime: "10:00", notes: "" });
  const [roomForm, setRoomForm] = useState<Record<string, string>>({ ...emptyRoom });
  const [announcementForm, setAnnouncementForm] = useState<Record<string, string>>({ title: "", message: "", audience: "all" });
  const [accountForm, setAccountForm] = useState<Record<string, string>>({ ...emptyAccount });
  const summaryRequest = useRef<AbortController | null>(null);
  const mutationPending = useRef(false);
  const allowed = status === "authenticated" && ["staff", "admin"].includes(session.user.role);
  const visibleTabs = tabs.filter(({ id }) => id !== "accounts" || session?.user.role === "admin");
  const activeTab = tabs.find(({ id }) => id === tab) || tabs[0];

  const load = useCallback(async () => {
    summaryRequest.current?.abort();
    const controller = new AbortController();
    summaryRequest.current = controller;
    setSummaryLoading(true);
    try {
      const query = new URLSearchParams({ academicYear, semester, ...(departmentFilter ? { department: departmentFilter } : {}) });
      const response = await fetch(`/api/admin/overview?${query}`, { signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load operations summary.");
      if (!controller.signal.aborted) setMetrics(data.metrics);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load operations summary.");
    } finally { if (!controller.signal.aborted) setSummaryLoading(false); }
  }, [academicYear, departmentFilter, semester]);
  useEffect(() => {
    if (status === "unauthenticated" || (status === "authenticated" && !allowed)) router.replace("/login");
    if (!allowed) return;
    const timer = setTimeout(() => void load(), 250);
    return () => { clearTimeout(timer); summaryRequest.current?.abort(); };
  }, [allowed, status, router, load]);
  useEffect(() => {
    if (!saving && !workspaceBusy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving, workspaceBusy]);

  const mutate = async (url: string, method: "POST" | "PATCH", body: unknown, message: string | ((data: Record<string, unknown>) => string), after?: () => void) => {
    if (mutationPending.current) return false;
    mutationPending.current = true;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The operation could not be completed.");
      after?.();
      setNotice(typeof message === "function" ? message(data) : message);
      setRevision((value) => value + 1);
      void load();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The operation could not be completed.");
      return false;
    } finally { mutationPending.current = false; setSaving(false); }
  };
  const configureCourse = (course: { code: string; title: string; department?: { _id: string } }) => {
    setCourseForm({ ...emptyCourse, code: course.code, title: course.title, department: course.department?._id || "", credits: "", level: "", semester: "", expectedEnrollment: "", sessionsPerWeek: "", sessionMinutes: "" });
    setNotice("Complete the course form with approved scheduling details. Missing values have not been inferred.");
  };
  const updateDepartment = (department: Department, active?: boolean) => mutate("/api/admin/departments", "PATCH",
    active === undefined ? { id: department._id, code: department.code, name: department.name, faculty: department.faculty, headOfDepartment: department.headOfDepartment } : { id: department._id, active }, "Department updated.");
  const selectTab = (next: Tab) => {
    if (saving || workspaceBusy) return;
    if (next === "accounts" && session?.user.role !== "admin") return;
    setTab(next); setError(""); setNotice("");
    if (next === "overview") void load();
  };
  if (!allowed) return <main className="ui-page flex items-center justify-center" role="status">Loading university administration...</main>;
  return <AdminActivityContext.Provider value={setWorkspaceBusy}><main className="admin-shell min-h-screen text-slate-800">
    <div className="mx-auto flex min-h-screen max-w-[1920px]">
      <aside className="admin-sidebar hidden w-60 shrink-0 flex-col p-5 text-white lg:flex">
        <div className="mb-8 px-3 pt-3"><Image src="/images/unza_logo.jpg" width={70} height={70} alt="University of Zambia" className="mb-4 rounded-xl bg-white p-1 object-contain" /><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">University of Zambia</p><h1 className="mt-1 text-xl font-semibold">Central Admin</h1><p className="mt-1 text-xs text-emerald-100/50">Academic operations</p></div>
        <nav aria-label="Administration pages" className="space-y-1">{visibleTabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} disabled={saving || workspaceBusy} aria-current={tab === id ? "page" : undefined} onClick={() => selectTab(id)} className={`admin-nav-item ${tab === id ? "is-active" : ""}`}><Icon size={18} />{label}</button>)}</nav>
        <div className="mt-auto border-t border-white/10 pt-5"><p className="truncate px-3 text-sm font-medium">{session.user.name}</p><p className="mb-3 px-3 text-xs capitalize text-emerald-100/50">{session.user.role}</p><button type="button" disabled={saving || workspaceBusy} onClick={() => void signOut({ callbackUrl: "/login" })} className="admin-nav-item"><LogOut size={17} />Sign out</button></div>
      </aside>
      <section className="min-w-0 flex-1 p-4 pb-12 md:p-7 xl:p-9">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><p className="ui-eyebrow">Workspace / {activeTab.label}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{activeTab.label}</h2><p className="mt-2 max-w-2xl text-sm text-slate-500">{activeTab.description}</p></div><div className="flex items-center gap-3"><span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 sm:block">{session.user.role === "admin" ? "Administrator" : "Staff workspace"}</span><button type="button" disabled={saving || workspaceBusy} onClick={() => void signOut({ callbackUrl: "/login" })} className="ui-btn ui-btn-secondary ui-btn-sm lg:hidden"><LogOut size={16} />Sign out</button></div></header>
        <nav aria-label="Mobile administration pages" className="mb-5 flex gap-2 overflow-x-auto pb-2 lg:hidden">{visibleTabs.map(({ id, label }) => <button type="button" key={id} disabled={saving || workspaceBusy} aria-current={tab === id ? "page" : undefined} onClick={() => selectTab(id)} className={`ui-chip whitespace-nowrap ${tab === id ? "ui-chip-active" : ""}`}>{label}</button>)}</nav>
        {(tab === "overview" || tab === "timetable") && <fieldset disabled={saving || workspaceBusy} className="ui-card mb-5 grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Planning cycle filters"><label><span className="ui-label">Academic year</span><input className="ui-input" maxLength={20} value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} /></label><label><span className="ui-label">Semester</span><select className="ui-input" value={semester} onChange={(event) => setSemester(event.target.value)}><option>Semester 1</option><option>Semester 2</option><option>Summer</option></select></label><RecordSelect resource="departments" label="Planning department" value={departmentFilter} onChange={setDepartmentFilter} /></fieldset>}
        {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}<button type="button" className="ml-3 underline" onClick={() => { setError(""); void load(); }}>Refresh summary</button></div>}
        {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
        {(saving || workspaceBusy) && <p role="status" className="mb-3 text-sm text-emerald-700">Processing your request. Keep this page open until the result appears...</p>}
        <fieldset disabled={saving || workspaceBusy} inert={saving || workspaceBusy} className="min-w-0">
          {tab === "overview" && <>{summaryLoading && <p role="status" className="mb-3 text-xs text-slate-500">Updating operations summary...</p>}{metrics ? <Overview metrics={metrics} setTab={selectTab} /> : <div className="ui-card" role="status">{error ? "Summary unavailable. Refresh to retry." : "Loading operations summary..."}</div>}</>}
          {tab === "timetable" && <Timetable revision={revision} form={allocationForm} setForm={setAllocationForm} academicYear={academicYear} semester={semester} departmentFilter={departmentFilter} onGenerated={(message) => { setNotice(message); setRevision((value) => value + 1); void load(); }} onSubmit={(event) => { event.preventDefault(); void mutate("/api/admin/allocations", "POST", { ...allocationForm, academicYear, semester, status: "draft" }, "Class saved as a draft.", () => setAllocationForm({ ...allocationForm, course: "", room: "", notes: "" })); }} onCancel={(id) => { if (window.confirm("Cancel this allocation? It will be removed from active student timetables.")) void mutate("/api/admin/allocations", "PATCH", { id, status: "cancelled" }, "Class allocation cancelled."); }} onPublish={(id) => { if (window.confirm("Publish the complete course schedule? This takes priority over conflicting pending and confirmed room bookings, which will be cancelled.")) void mutate("/api/admin/allocations", "PATCH", { id, status: "published" }, (data) => `Complete course schedule published.${Number(data.cancelledBookings) > 0 ? ` ${data.cancelledBookings} conflicting booking${Number(data.cancelledBookings) === 1 ? " was" : "s were"} cancelled.` : ""}`); }} />}
          {tab === "bookings" && <BookingsManagement revision={revision} onStatusChange={(id, status) => {
            if (status === "cancelled" && !window.confirm("Cancel this student room booking?")) return;
            void mutate("/api/admin/bookings", "PATCH", { id, status }, status === "confirmed" ? "Booking confirmed." : "Booking cancelled.");
          }} />}
          {tab === "departments" && <DepartmentManagement revision={revision} form={departmentForm} setForm={setDepartmentForm} onUpdate={updateDepartment} onSubmit={(event) => { event.preventDefault(); void mutate("/api/admin/departments", "POST", departmentForm, "Department created.", () => setDepartmentForm({ ...emptyDepartment })); }} />}
          {tab === "courses" && <div className="space-y-5"><CourseManagement revision={revision} form={courseForm} setForm={setCourseForm} academicYear={academicYear} onConfigure={configureCourse} onSubmit={(event) => { event.preventDefault(); void mutate("/api/admin/courses", "POST", { ...courseForm, credits: Number(courseForm.credits), expectedEnrollment: Number(courseForm.expectedEnrollment), sessionsPerWeek: Number(courseForm.sessionsPerWeek), sessionMinutes: Number(courseForm.sessionMinutes) }, "Course saved.", () => setCourseForm({ ...emptyCourse })); }} onSaveCourse={(course, patch) => mutate("/api/admin/courses", "PATCH", { id: course._id, ...patch }, `${course.code} scheduling settings updated.`)} /><details className="admin-composer ui-card"><summary>Verified UNZA catalogue and source information</summary><div className="mt-5"><UnzaCatalogue onImported={() => { setRevision((value) => value + 1); void load(); }} /></div></details></div>}
          {tab === "students" && <StudentManagement />}
          {tab === "rooms" && <RoomManagement revision={revision} form={roomForm} setForm={setRoomForm} onClassify={(room, spaceType) => mutate("/api/admin/rooms", "PATCH", { id: room._id, spaceType }, "Location classification saved. Only lecture rooms are student-bookable.")} onSubmit={(event) => { event.preventDefault(); void mutate("/api/admin/rooms", "POST", { ...roomForm, capacity: Number(roomForm.capacity), floor: Number(roomForm.floor), latitude: Number(roomForm.latitude), longitude: Number(roomForm.longitude) }, "Campus location registered.", () => setRoomForm({ ...emptyRoom })); }} />}
          {tab === "accounts" && session.user.role === "admin" && <AccountManagement revision={revision} form={accountForm} setForm={setAccountForm} onSubmit={(event) => { event.preventDefault(); void mutate("/api/admin/users", "POST", accountForm, "Staff account provisioned.", () => setAccountForm({ ...emptyAccount })); }} />}
          {tab === "announcements" && <AnnouncementManagement revision={revision} form={announcementForm} setForm={setAnnouncementForm} onSubmit={(event) => { event.preventDefault(); if (window.confirm("Publish this announcement to the selected audience?")) void mutate("/api/admin/announcements", "POST", { ...announcementForm, priority: "high" }, "Announcement published.", () => setAnnouncementForm({ title: "", message: "", audience: announcementForm.audience })); }} />}
        </fieldset>
      </section>
    </div>
  </main></AdminActivityContext.Provider>;
}
