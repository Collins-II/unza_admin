This is the UNZA Central Administration application. It is a [Next.js](https://nextjs.org) application for staff and administrators managing university academic operations.

## Central administration

### Connected academic operations

The Operations workspace replaces the old generic overview with live, access-scoped metrics,
an attention centre, a dated assessment agenda and links to the next academic workflow. Navigation
groups academic delivery, campus operations and governance; no synthetic trends or payment metrics
are shown.

- **Department access:** administrators retain university-wide access. Staff need explicit active
  department IDs assigned by an administrator in **Department access**. Existing staff are unassigned
  by default and blocked until assigned; free-text profile department names never grant permissions.
  Every protected request rechecks account status, role and assignments. Staff can prepare scoped
  courses, rosters, teaching and assessments, and read shared rooms/calendars. Student searches use
  exact active department codes; cross-department enrolment requires an administrator.
  Student lifecycle, account/access management, department/room mutations, bookings, announcements,
  imports and the university audit register remain administrator-only. Existing records are preserved.
- **Academic calendar:** administrators create and approve exact year/semester labels and inclusive
  teaching/assessment dates in Africa/Lusaka. Teaching publication needs an approved calendar;
  non-cancelled assessment creation/edits must fall within its assessment window. Versioned edits,
  approval and archive decisions are audited. Resolve dependent published teaching and non-cancelled
  assessments before changing dates or archiving. Archived calendars are read-only.
  The current institution-wide calendar rejects overlapping approved teaching windows, including
  different semesters/years; programme-specific concurrent calendars are not yet supported.
- **Prepare -> submit -> independent review -> publish:** generation and manual entry save drafts.
  Submit a complete course timetable or one assessment from its workspace. A different active
  administrator approves the exact immutable draft snapshot through **Publication reviews**.
  Submitters, recorded creators and assessment draft editors cannot approve their own work, including administrator-authored
  drafts. At least two separately authenticated administrators are needed for an administrator-led
  preparation/review cycle. Unknown creators of legacy records are not retroactively inferred.
  Changed drafts require rejection and resubmission; duplicate pending submissions are rejected.
  Rejection requires a reason and preserves the draft. Publication revalidates resources, rosters,
  capacity and conflicts, then saves the decision, publication and audit transactionally.
- **Legacy and student continuity:** previously published schedules remain visible, including terms
  without calendars. Add approved dates and review them; do not assume they are newly certified.
  Actual-date teaching/booking conflicts respect approved teaching windows, with conservative
  recurring protection for legacy terms lacking approved dates. Publication cancels conflicting
  bookings only inside its approved teaching dates. The student integration adds approved
  `academicTerms` alongside published `assessments`; existing response fields remain intact.
  The separate student server forwards additive campus fields, but rendering new calendar/assessment
  screens in that application is a separate integration step.

`GET/PATCH /api/admin/access`, `GET/POST/PATCH /api/admin/academic-calendar`,
`GET/POST/PATCH /api/admin/approvals` and `GET /api/admin/approvals/detail?id=...` support these
workspaces. Approval PATCH accepts `{ id, decision: "approve" }` or
`{ id, decision: "reject", reason }`. Teaching/assessment publication requires `approvalId`;
direct generator publication is disabled. Review details explicitly reject submissions exceeding
500 teaching sessions instead of presenting a truncated review.

Run `npm run test:governance` for mocked authorization, immutable review and dated-teaching regression
tests. These tests and the academic suite do not replace authenticated staging tests or real
replica-set transaction/concurrency validation.

### High-volume administration workspace

Mobile summary cards use compact multi-column layouts: overview metrics stay two abreast, timetable-health metrics share one three-card row, and generation-result metrics use two columns. Desktop spacing and layouts are preserved.

All seven registers (students, departments, courses, campus locations, timetable allocations, staff accounts and announcements) use the same searchable table workspace:

- Searches, filters, sorting and counts run on the server through `GET /api/admin/data`. Page sizes are 10, 25, 50 or 100; each sort has an ID tie-breaker. Allocation days sort in teaching-week order. The dashboard uses database aggregates, not the current table page.
- Search is debounced and obsolete requests are aborted. Older responses cannot replace a newer query. Loading/error states disable stale table actions; failures have a retry control. Empty and out-of-range pages are handled explicitly.
- Tables have sticky headers, horizontal scrolling on small screens and one expanded detail row. Department/course/room selectors search and page through choices instead of downloading the full catalogue. Creation panels stay collapsed until needed; the room map and its choices mount only when opened.
- The student register normalizes legacy records with missing or null course enrolments to an empty list and missing password-change flags to false, matching the student API contract. Expanding or editing older student profiles does not require a database migration. Malformed non-array enrolment data is reported as a register error rather than silently discarded.
- Row selection is **current-page only** and clears when the query/page changes or a batch finishes. Students, departments, rooms and administrator-only staff accounts support status/availability actions; timetable allocations support cancellation. Courses and announcements support selected-row export, not unsafe inferred bulk edits. Existing role, last-administrator and timetable locks remain authoritative.
- Batch mutations require confirmation, run sequentially through the existing mutation APIs and report successes and individual failures. They are **not a single atomic transaction**. Navigation inside the workspace is blocked while processing; do not close the browser until the result appears. Network failures stop the batch; inspect refreshed records before retrying.
- CSV export includes either the filtered result set or selected rows, using the displayed columns. It streams from a bounded database cursor and rejects filtered sets above **10,000 rows**; narrow filters rather than expecting silent truncation. Spreadsheet formula cells are neutralized. Account credentials, payment data and timetable stream-member IDs are never exported by the register endpoint. Exports can contain personal information: handle them under university policy. Newly issued temporary credentials have a separate, deliberately explicit secure download.
- Term and planning-department filters apply to operations, timetable and assessments. Other pages have their own resource-specific filters. Student department filters accept the exact stored code (including legacy descriptive codes), while course and allocation department filters use linked department records. Course roster enrolments remain global, not term-specific. Generation previews render 50 sessions and 25 streams per page; publishing still validates the complete schedule.

The query endpoint bounds search/filter lengths, allowlists sort and status values, uses literal (escaped) search patterns, caps query execution time and projects only permitted fields. Contains-searches may still scan data: benchmark against real institution-sized staging data and provision appropriate database indexes before production; this UI update is not a load-capacity certification.

### Production release gates

Run `npm run lint`, `npm test`, `npm run test:bookings`, `npm run test:academics`, `npm run test:governance`, `npm run build`, and `npm run release:check` against the intended deployment configuration. CI runs lint, unit tests, booking/academic/governance workflow tests and a production build on Node 24. `release:check` is read-only and deliberately fails for localhost URLs, missing/short secrets, insufficient administrators, missing database prerequisites, or active/published mock data. A passing result is not proof of secret entropy, backups, security certification or load capacity.

For database-backed authentication regression tests, start a **local test deployment** on port 3100, then explicitly set `ALLOW_LOCAL_AUTH_SMOKE=1` and run `npm run test:live-auth` (`LOCAL_TEST_URL` optionally overrides the local port). The test requires the local server's database URI/authentication secret and an existing active administrator; it creates one random, short-lived test staff account, checks login, session revocation, lockout and audit events, and removes that exact account in `finally`. Audit history is retained. Do not run this against production data or interrupt it before cleanup.

Provision a separate production Atlas replica-set database, a real HTTPS `NEXTAUTH_URL`, an independently generated `NEXTAUTH_SECRET` (32+ characters), `STUDENT_APP_API_KEY`, and `INITIAL_ADMIN_SETUP_TOKEN`. Keep keys server-side and outside Git; configure the student-app server with its matching key. Do not point a production deployment at the demo database. No production domain or credentials are generated automatically.

Use [the environment template](./.env.example) for variable names, not secret values. Never deploy its placeholders.

Staff authorization revalidates current account role/status, so deactivation/demotion invalidates access on the next protected request. Both staff and student credentials use atomic failed-login counters (five failures trigger a 15-minute account lock); legacy plaintext staff passwords are no longer accepted. Apply per-IP/global login limits at the trusted ingress as well, particularly against distributed and unknown-account attempts. Configure at least two named administrators with separate credentials; the last active administrator cannot be demoted or deactivated. Store recovery credentials in your approved secrets vault.

`GET /api/health` is an unauthenticated, non-cached database readiness check returning only `ok`/`unavailable`. Configure uptime alerts for sustained 503 responses and centralized application/Atlas logs. Baseline headers deny framing and objects, restrict base/form origins, disable content sniffing, and enable HSTS in production. The CSP is a baseline policy, not a nonce-based script policy; validate a stricter policy against Next.js and the map before enforcing it.

Critical mutations write durable `AuditEvent` records in the same transaction as the change: staff creation/role/status, student password reset/status, course enrolment changes, department updates/deactivation, generated timetable draft/publication, development mock setup, allocation status changes and official catalogue imports. Administrators can read these through paginated `GET /api/admin/audit?page=0` (50 records per page). Events contain actor IDs and bounded operational metadata, never plaintext passwords or temporary credentials. Provision collection/index permissions; set access and retention policy with the university. This is not an exhaustive record of all application activity.

Before launch, an operator must additionally:

- Enable Atlas backups/point-in-time recovery and perform a documented restore into a separate database. Confirm retention and access controls with university policy.
- Run staging browser tests for staff/student authentication, password change, roster editing, draft save, publication, cancellation, concurrent mutations, and student-app retrieval. Test the student timetable as the first request after a fresh production start.
- Exercise real expected traffic and institution-sized course/roster datasets; record generation latency and hosting time/memory limits. Do not infer capacity from the demo dataset.
- Configure trusted HTTPS ingress, DNS, log retention/alerts, request rate limits, deployment secrets, and audit-log requirements. Full durable university audit trails require operational sign-off; application logs alone do not certify compliance.
- Retain the previous release artifact, snapshot the database before changes, and rehearse rollback. Restore backups only through an approved change procedure.
- Review dependencies and access controls independently. Commit/review all intended source files before tagging a release; this app never commits or deploys automatically.

The development mock records are preserved unless an operator explicitly approves archival/cleanup. They must not be exposed as real university data.

### Verified University of Zambia public catalogue

The **Courses** tab includes **Import verified UNZA catalogue** for administrators. It imports the sourced facts in [the catalogue fixture](./fixtures/unza/catalogue.json) transactionally and can be repeated without duplicating records. Every record retains its official source URL and verification date. `UNZA-*` department codes are local identifiers, not claimed official department codes. Coverage is explicitly limited to the public sources listed in the fixture; website verification is not university approval of an academic-year curriculum.

The current public-source snapshot contains **65 departments across 12 schools**, checked on 2026-10-19. No course-level code/title list could be verified from the researched public pages, so the snapshot intentionally has **zero courses**, with that limitation shown in the admin panel. It is not a complete curriculum import: request an approved UNZA catalogue before entering real course offerings. Existing `MOCK-*` courses remain clearly separate and must never be relabelled as official courses.

Imported courses are **catalogue-only and inactive**: unknown semester, level, credits, expected enrolment, weekly sessions and duration stay absent rather than being invented. They appear in the catalogue panel but not automatic generation or student integration. **Configure scheduling** fills only the known course identity into the existing Add course form; an authorized operator must supply approved missing details before activating it. Real rosters, lecturer assignments and verified teaching-room data must then be provided separately. No catalogue import publishes allocations, modifies existing demo records or enrols mock students.

Course rosters currently apply globally across academic years. Enrolment changes are blocked while any published schedule exists for that course, regardless of the submitted year/semester. Department code changes and deactivation are serialized with scheduling and blocked while any non-cancelled department allocations remain.

Only active staff and administrator accounts can sign in. Public registration and the former student-facing routes are disabled. Staff and administrator accounts sign in at `/login` and are routed to `/admin`. The central console currently provides:

- access-scoped operational counts and actionable academic priorities
- administrator-managed student directory and departmental course roster searches
- room availability publishing and unpublishing
- booking approval and rejection
- official announcements delivered to active staff and administrator accounts
- university timetable planning for departments, courses, cohorts, lecturers, rooms, and semesters
- automatic weekly schedule generation with real course rosters, capacity-based student streams, preferred multiple venues, travel-time checks, and complete-course publication checks
- conflict detection for room, lecturer, and student overlaps, including room capacity and venue availability validation

The `/api/admin/*` routes are protected server-side: central operations are administrator-only and opted-in departmental endpoints require explicit staff scope. Course rosters are explicit links from active `student` user records to courses; assigned staff can search scoped student records and manage those links from the course editor. A course cannot be published until all active enrollees are assigned to capacity-safe streams, all required weekly sessions are scheduled, its calendar is approved and an independent administrator approves the submitted snapshot.

Generation and publication use MongoDB transactions and term-scoped locks. Production MongoDB must support transactions (for example, an Atlas replica set), and the application database user must be able to create the model indexes. Course/room scheduling settings and student enrolments are protected from concurrent timetable writes.

## Initial administrator and staff provisioning

When the database contains no staff or administrator account, use `/setup` to create the one-time initial administrator. The setup endpoint closes as soon as it creates the first account. For production deployments, set `INITIAL_ADMIN_SETUP_TOKEN` in the server environment and enter the same token during setup.

After initial setup, sign in as an administrator and use **Staff accounts** in Central Admin to create staff or additional administrator accounts. Assign approved staff scope separately in **Department access**. Staff accounts cannot provision accounts or grant themselves access.

## Room geolocation and student-app integration

Every university location requires real decimal latitude and longitude values when created. The values are stored both as `latitude`/`longitude` and GeoJSON `[longitude, latitude]`, indexed for geospatial queries, and returned by the location register. Locations are classified as teaching spaces (`lecture_room`, `laboratory`, or `seminar_room`) or general university places such as offices, libraries, clinics, cafeterias, residences, administrative offices, and other locations. Only teaching spaces can receive timetable allocations.

The staff-only Central Admin does not expose student pages. A separate student application can consume the read-only integration endpoint:

```text
GET /api/integration/campus
x-student-app-key: <STUDENT_APP_API_KEY>
```

Configure `STUDENT_APP_API_KEY` on the server and the student app. The endpoint returns published timetable allocations, active campus locations with navigation coordinates, departments, and room metadata. It supports `academicYear`, `semester`, `department`, and `type` query filters (for example, `type=office` or `type=lecture_room`).

To fetch a student's own published timetable, the student app server can call:

```text
GET /api/integration/student-timetable?studentId=<STUDENT_ID>
x-student-app-key: <STUDENT_APP_API_KEY>
```

The endpoint optionally accepts `academicYear` and `semester` and returns only allocations linked to that active student account. Keep `STUDENT_APP_API_KEY` on the server; do not expose it in a browser or mobile client.

The student app can also list, create, and cancel room bookings through the shared booking system:

```text
GET   /api/integration/bookings?studentId=<STUDENT_ID>
POST  /api/integration/bookings
PATCH /api/integration/bookings/<BOOKING_ID>
x-student-app-key: <STUDENT_APP_API_KEY>
```

Create requests send `studentId`, `roomId`, `purpose`, `startTime`, `endTime`, and the purpose-specific details below. Times must be timezone-qualified ISO timestamps on one Lusaka-local calendar date, aligned to whole minutes, and in the future. Every published timetable is authoritative within its approved dates (or conservatively recurring for legacy terms): booking requests are rejected if the room is scheduled or the student has a class at that time. New bookings start as `pending`; pending and confirmed bookings reserve the room. When a valid timetable is published, overlapping pending or confirmed bookings inside its approved teaching dates are automatically cancelled in the same transaction as publication. The booking response and list include `cancellationReason: "timetable_conflict"` so the student app can explain that the class schedule takes priority. Students can edit or cancel only their own bookings; confirmation remains an administrator operation. The student app must derive the student ID from its authenticated server-side session rather than trusting a browser-supplied ID, and must keep the integration key server-side.

### Purpose-based booking authorization

Only online rooms explicitly classified with `spaceType: "lecture_room"` are bookable. Legacy category labels do not authorize bookings: unclassified locations remain hidden until staff verify them. In **Campus locations**, expand a record, select its **Approved location type**, and **Save classification** to update the shared database. Existing allocations, active course preferences and active student bookings protect against incompatible reclassification; resolve them first. No automatic name-based classification or bulk data migration is performed. Laboratories, seminar rooms, libraries and other campus places are not student-bookable.

- `purpose: "Tutorial Group"` requires **at least 48 hours** from submission to start, a positive integer `attendees`, and `tutorialGroup: { groupName, courseCode, topic, leaderName }`. Text limits are 120, 30, 1000 and 120 characters respectively.
- `purpose: "Event"` requires **7–14 days** from submission to start (inclusive), an event `title` (1–120 characters), and a positive integer `attendees`.
- Expected attendees must fit a known room capacity. Optional `conversationId` is for TG Study Circles only; the requester must be a member and the full circle must have at least 50 unique members. The central server verifies this against the shared database rather than trusting browser counts.
- Administrators review requests in **Room bookings**, filter by purpose, and inspect the TG details and submission time. Approval revalidates the purpose, original submission window, room, capacity, active student and current timetable/booking conflicts. Legacy incomplete requests cannot be newly confirmed; ask the student to resubmit. Cancellation remains available.
- To edit, send the same complete payload as creation to `PATCH /api/integration/bookings/<id>`. Central admin records a new `requestedAt`, rechecks advance notice and resets status to `pending`, clearing the previous review. A request containing only `studentId` cancels rather than edits. Started/cancelled requests cannot be edited; started bookings cannot be student-cancelled.

The student app's server requires `ADMIN_APP_URL` pointing to this app and a matching `STUDENT_APP_API_KEY`. Booking creation, modification, cancellation and retrieval must go through these integration endpoints, not independent writes to the booking collection. Both apps currently use the same database for student IDs, room IDs and Study Circle membership. Approval/cancellation actions record the reviewer and an atomic audit event. Timetable publication still overrides conflicting student reservations.

Restart both development servers after updating these schemas so cached Mongoose models load the new fields. Run `npm test` for pure policy/conflict checks and `npm run test:bookings` (Node.js 24+) for mocked central creation, edit, cancellation, staff review and room-classification API tests. These tests do not mutate real bookings or room records.

### Student registration and sign-in

Students are registered by administrators in the **Students** tab (single form or pasted CSV of up to 100 rows). Each student receives a unique numeric student ID (auto-issued as `<year><5-digit sequence>`, or an admin-supplied 8-10 digit ID) and a random temporary password. The password is shown once, stored only as a bcrypt hash, and must be changed at first sign-in. Administrators can reset passwords and deactivate/reactivate accounts; students in a published timetable must be unenrolled and the schedule republished before deactivation. Only `active` students sign in, appear on rosters, or receive timetables.

Students never sign in to Central Admin. The student app's server verifies credentials with the shared key:

```text
POST /api/integration/student-auth      { "studentId": "...", "password": "..." }
POST /api/integration/student-password  { "studentId": "...", "currentPassword": "...", "newPassword": "..." }
x-student-app-key: <STUDENT_APP_API_KEY>
```

Sign-in accepts the assigned student ID only (not email), returns the same generic error for unknown IDs, wrong passwords, and inactive accounts, and locks an account for 15 minutes after 5 consecutive failures. `mustChangePassword: true` in the response means the app must route the student through the password-change endpoint (minimum 10 characters). Existing student records with non-bcrypt passwords must have their passwords reset from the Students tab.

## Mock students for timetable testing

The [student CSV fixtures](./fixtures/students/) version `unza-departments-v2` contain **1,000 fictional students** in **10 batches of 100** across all **65 verified UNZA departments and 12 schools**. The first 25 departments in the source snapshot have 16 students each; the remaining 40 have 15. Each department has test study years 1-4. The years and programme labels are synthetic test cohorts, not verified degree structures or official programme names.

Students use reserved `example.test` emails, IDs `202690001` through `202691000`, and searchable names such as `Mock UNZA-AGR-AEEE Y1 001 Chanda Banda`. The department field matches the local `UNZA-*` identifier in the [sourced catalogue](./fixtures/unza/catalogue.json). Programme fields say `Mock study cohort - <department name>`. No real student information, phone numbers, passwords or credentials are included.

Use a development/test database, not production. These fixtures register real active accounts when imported; they are not a preview mode. IDs and emails are fixed, so importing the same batch again rejects duplicates rather than updating accounts. Check for existing ID/email collisions first. The dataset does not automatically create departments, courses, rooms, or course enrolments.

### Importing the students

**Automatic scheduler connection (development only, separate test database):** Run `npm run dev`, sign in as an **administrator**, and open **University timetable > Generate timetable > Connect mock students**. The action reads the ten CSV batches and the sourced department snapshot, then transactionally connects 1,000 students to **142 explicitly synthetic courses**: two department tests per department (130), plus one shared test per school (12). Every student has three course links, for **3,000 enrolments**. It creates/reuses **16 synthetic 50-seat rooms** and links courses to the actual verified department records, not replacement `MOCK-*` departments. Test courses have two 60-minute weekly sessions and three synthetic credits; none of those settings are official UNZA facts.

After setup, select **all departments** or a `UNZA-*` department and click **Preview schedule**, then **Save as draft** after reviewing the result. All-department previews include other active courses in the selected semester. School-shared courses are owned by their school's first department in the source snapshot; select all departments to include all shared-course conflicts. Academic year comes from the filter at generation time; course enrolments are global across years. Demo coordinates are synthetic nearby test points, not verified room locations. Do not publish demo timetables to real student integrations.

The setup API is disabled outside `NODE_ENV=development` and requires an administrator session and transaction-capable MongoDB. Repeating setup reuses matching records without resetting passwords or settings. Conflicting IDs/emails/codes roll back; inactive department/account conflicts are rejected. Version 2 reuses the legacy student-ID range but changes their department profiles and emails: **do not import it into the existing four-department demo database**. The setup endpoint explicitly rejects that legacy dataset rather than overwriting profiles or cancelling published sessions. Use a separate test database, or obtain explicit approval for a separate migration. Updating fixture files does not update or clean the running database.

Setup verifies the required unique indexes before writing demo records. If legacy accounts share an email address, it reports an index conflict; correct those accounts explicitly before retrying. Retrying rebuilds the required indexes, so a failed index attempt does not require a development-server restart.

New demo accounts receive an undisclosed random password hash; use **Students > Reset password** to issue credentials if testing student sign-in. Existing student passwords are preserved. The database is **not** populated until you confirm the setup action.

**Manual alternative:**

1. Sign in as staff/admin and open **Students > Import students**.
2. Open each file from `students-01.csv` through `students-10.csv` in [fixtures/students](./fixtures/students/), copy its entire contents including the header, and paste/import one file at a time. Do not combine files: each request allows at most 100 students.
3. Confirm **100 registered, 0 rejected** per batch. Save the generated temporary credentials immediately if testing student sign-in; the application shows them only once. Do not commit downloaded credentials.
4. After all imports, search for `Mock ` to confirm 1,000 fixture accounts (the unfiltered directory may also contain existing students).

Regenerate with `npm run mock:students` (Node 22.6+). This writes the ten student batches plus [synthetic course and enrolment fixtures](./fixtures/timetable/) and their [manifest](./fixtures/timetable/manifest.json). It never connects to MongoDB. The manifest includes per-department counts, ID ranges, source URLs, version and synthetic assumptions. The course/enrolment CSVs are reference fixtures, not inputs for the Students CSV importer.

### Cohort and course-enrolment guide

Each department has `MOCK-<departmentCode>-T1` and `MOCK-<departmentCode>-T2`, with every mock student in that department enrolled. Each school has `MOCK-<anchorDepartmentCode>-SHARED`, enrolling its departments' students together. Titles start with **Synthetic**; they are not official UNZA course names or codes. Official public catalogue courses remain unchanged and are not fabricated to fill missing information.

For manual roster setup in a clean test database, search for a department prefix such as `Mock UNZA-AGR-AEEE`. Select all matching students and enrol them into both synthetic department courses and their school's shared course. Repeat for the other departments, following [the explicit enrolment links](./fixtures/timetable/synthetic-enrolments.csv). Student department text alone does not create course links; expected enrolment is not a roster.

### Scheduling checks

Start with a few courses, then expand to all cohorts. Create enough available teaching venues with valid campus coordinates, appropriate space types, and capacities such as 25, 50, 75, and 100. For predictable capacity checks, restrict the tested course's preferred venues to rooms of the specified capacity. Full-load scheduling feasibility depends on your room pool and timetable window; the fixtures alone cannot guarantee every course fits.

- **Department coverage:** Confirm all 65 departments, all 12 schools, 1,000 students and 3,000 enrolment links match the generated manifest. Each department has 15 or 16 students across four test years.
- **Capacity:** Department courses fit one 50-seat stream. School-shared courses exceeding 50 must split into capacity-safe streams, with no duplicate or missing enrollee. Both required weekly sessions must use the same membership.
- **Boundary overflow:** In a separate test course, use exactly 50, 51 or 101 selected fixture students with only 50-seat venues: expect one, two or three streams respectively. Restrict maximum streams below that requirement and verify explicit unscheduled feedback.
- **Student clashes:** Generate the shared courses together with the cohort courses. No student may have overlapping sessions, even across departments or years. Also try manually saving overlapping allocations with a shared student; validation should reject them.
- **Room and lecturer clashes:** Reuse a lecturer across courses and restrict preferred rooms. Verify neither resource is double-booked. Reduce the timetable window or venue pool until infeasible and check explicit unscheduled feedback rather than silent omissions.
- **Travel and venue availability:** Use actual test-campus coordinates for nearby and distant rooms, vary the generator's venue-radius setting, and verify consecutive sessions allow walking/changeover time. Unavailable or non-teaching locations must not be allocated.
- **Publication:** Try publishing an incomplete course before generating all required sessions; it should fail. Once complete, verify every active enrollee has a capacity-safe stream and the required weekly sessions before publication succeeds.
- **Student lifecycle:** Deactivate an unassigned fixture student and confirm they disappear from active roster searches. For a student in a published timetable, unpublish/cancel affected schedules before changing enrolments or deactivating the account. Use a separate test account or restore active status before comparing manifest counts.

## Timetable validation

### Economics departmental source review

The **Economics source review** workspace uses the two supplied 2026 Term I PDF drafts.
[The source transcription](./lib/economicsSource.ts) records Draft 2's 34 course titles, year groups,
lecturer labels, desired streams and allocated slot totals (pages 2-4). Draft 5 page 1 takes precedence
for teaching-grid evidence. No PDFs or personal local file paths are deployed.

1. An administrator previews the evidence and imports the source course metadata. This transaction
   creates `UNZA-HSS-ECON` if missing, creates only missing courses, preserves matching existing courses,
   and aborts on title/department conflicts. It is repeatable and audited; other departments are untouched.
2. New source courses remain inactive catalogue entries. Configure approved credits, Semester 1,
   expected enrolment, session duration and sessions per stream in **Courses**, then enter real student rosters.
   Source stream requests and total hourly slots are not divided into guessed weekly requirements.
3. Review each Draft 5 cell, match its venue to a verified campus room, and record the departmental
   decision. Explicitly correct ambiguous codes/cross-listings using an approved course. For named
   streams, choose enrolled students; otherwise the full active roster is assigned. Save only as a
   draft through the existing allocation validator. Capacity, lecturer/student/room conflicts and
   approved course session length remain authoritative.
4. The PDF heading says **2025/2026** despite the 2026 filenames. Source-review drafts use that
   academic year and local **Semester 1** label for Term I. Select that cycle in the teaching workspace.
   Nothing is automatically published; the complete course/stream schedule must pass publication checks.

Entries including `ECN311`, `ECN4153`, `BB2311`, `BB2421`, `ECN4411/BB4414`, bare venues and codes
absent from the Draft 2 roster are flagged, not silently repaired. Consecutive hourly cells are
preserved as source evidence, not automatically merged into a class. No room capacities/coordinates,
credits, student identities or assessment dates are invented.

### Dated exams, tests and quizzes

The **Exams, tests & quizzes** workspace supports paginated, cycle/department/date-filtered allocations,
draft creation, editing/rescheduling, publication and cancellation. It is separate from weekly teaching.
All date-only values and times use **Africa/Lusaka (UTC+02:00)**.

- Choose an active configured course, a verified available teaching space, a real date/time and at
  least one active staff invigilator. Assign the whole active course roster or an explicit subset
  for split-room sittings. Room capacity must be a positive integer and accommodate every assigned student.
- Draft and published assessments reserve rooms, students and invigilators across all planning terms.
  Adjacent sessions are permitted; overlapping shared resources are rejected. Published teaching
  and confirmed bookings also block assessment creation/publication.
- Teaching creation/publication and student booking requests/confirmation check assessment reservations
  in return. These mutations share the academic configuration lock. They never silently cancel assessments.
- Changes are audited transactionally. PATCH requests require `expectedVersion`; stale edits return
  409. Publication rechecks current capacity, account eligibility, rosters and conflicts. Cancellation
  remains available when dependent records become unavailable. Course/department/room/account changes
  and roster changes are guarded while affected assessments remain active.
- Editing retains the saved student roster. To replace a roster, cancel the old allocation and create
  a reviewed replacement. Student integration endpoints add published `assessments` and `timeZone`
  without exposing other students' IDs or invigilator accounts.

`GET/POST/PATCH /api/admin/assessments` is staff-authenticated. GET accepts `academicYear`, `semester`,
`department`, `date`, one-based `page` and `limit` (max 100). POST accepts `academicYear`, `semester`,
`department`, `course`, `room`, `title`, `assessmentType` (`exam|test|quiz`), `date`, `startTime`, `endTime`,
`invigilatorIds`, and optional `studentIds`. POST always creates a draft. PATCH accepts `id`,
`expectedVersion`, required `status` (`draft|published|cancelled`) and editable POST fields.
The staff name picker is `/api/admin/assessments/invigilators`; it is paginated and does not grant
access to the administrator-only staff account register.

**Production limitations:** approved term dates now bound dated teaching conflicts; legacy terms
without approved calendars retain conservative weekly recurrence. Calendar dates and lecturer-account
identity links must be verified before using the system to certify term-specific operations.
Lecturer-to-invigilator teaching
checks match normalized stored names; PDF lecturer labels are not verified account IDs. Invigilator-to-
invigilator checks use account IDs. This feature does not implement grading, marks, weighting, resits,
seating plans, accessibility arrangements or examination approval policy. Obtain those policies rather
than assuming the teaching drafts establish them. Complete the production release gates above; this
implementation alone is not a university-wide production-readiness certification.

Run `npm run test:academics` for mocked API/service regression tests covering resource conflicts,
cross-term assessment collisions, capacity, publication revalidation, stale updates and audits.
These tests do not replace replica-set transaction/concurrency testing or authenticated staging browser tests.

Run `npm test` for the scheduler and publication-validation regression tests, `npm run lint` for ESLint, and `npx tsc --noEmit` for TypeScript checks. The test command uses Node's built-in TypeScript stripping and requires Node.js 22.6 or newer.

## Getting Started

First, run the development server:

```bash
npm run dev -- --port=3001
```

Open [Central Admin](http://localhost:3001/admin). The separate
[student application](http://localhost:3000) remains on port 3000. Its server must use
`ADMIN_APP_URL=http://localhost:3001` and the matching integration key for local development.

## Academic administration boundary

Unused commerce/DPO helpers and payment metrics have been removed from this central administration
repository. No historical commerce collection was deleted and no commerce functionality in the
separate student application was changed. Payment processing is not part of this academic console.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
