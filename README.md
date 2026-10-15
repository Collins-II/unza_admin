This is the UNZA Central Administration application. It is a [Next.js](https://nextjs.org) application for staff and administrators managing university academic operations.

## Central administration

Only active staff and administrator accounts can sign in. Public registration and the former student-facing routes are disabled. Staff and administrator accounts sign in at `/login` and are routed to `/admin`. The central console currently provides:

- university-wide counts for students, staff, rooms, bookings, and paid orders
- student directory visibility
- room availability publishing and unpublishing
- booking approval and rejection
- official announcements delivered to active staff and administrator accounts
- university timetable planning for departments, courses, cohorts, lecturers, rooms, and semesters
- conflict detection for room, cohort, and lecturer overlaps, including room capacity validation

The `/api/admin/*` routes are protected server-side and require a `staff` or `admin` role. Timetable allocations are stored as central records and can be consumed by future departmental or student clients without duplicating scheduling logic.

## Initial administrator and staff provisioning

When the database contains no staff or administrator account, use `/setup` to create the one-time initial administrator. The setup endpoint closes as soon as it creates the first account. For production deployments, set `INITIAL_ADMIN_SETUP_TOKEN` in the server environment and enter the same token during setup.

After initial setup, sign in as an administrator and use **Staff accounts** in Central Admin to create staff or additional administrator accounts. Staff accounts cannot provision other accounts.

## Room geolocation and student-app integration

Every university location requires real decimal latitude and longitude values when created. The values are stored both as `latitude`/`longitude` and GeoJSON `[longitude, latitude]`, indexed for geospatial queries, and returned by the location register. Locations are classified as teaching spaces (`lecture_room`, `laboratory`, or `seminar_room`) or general university places such as offices, libraries, clinics, cafeterias, residences, administrative offices, and other locations. Only teaching spaces can receive timetable allocations.

The staff-only Central Admin does not expose student pages. A separate student application can consume the read-only integration endpoint:

```text
GET /api/integration/campus
x-student-app-key: <STUDENT_APP_API_KEY>
```

Configure `STUDENT_APP_API_KEY` on the server and the student app. The endpoint returns published timetable allocations, active campus locations with navigation coordinates, departments, and room metadata. It supports `academicYear`, `semester`, `department`, and `type` query filters (for example, `type=office` or `type=lecture_room`).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Campus commerce and DPO

Authenticated students can use `/commerce` to purchase campus services. Checkout creates a pending order, requests a hosted DPO payment token, and redirects the student to DPO. Configure these server-side variables before enabling live checkout:

```env
DPO_COMPANY_TOKEN=your-company-token
DPO_CURRENCY=ZMW
# Optional: use the DPO sandbox/API endpoint supplied for your account
DPO_API_URL=https://secure.3gdirectpay.com/API/v6/
```

Configure DPO to POST payment notifications to `/api/commerce/callback`. The callback marks the matching order as `paid` only when DPO returns result `000`; no card data is stored by this application.

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
