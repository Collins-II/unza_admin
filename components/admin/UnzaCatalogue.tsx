"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Catalogue = {
  verifiedAt: string;
  scopeNote: string;
  available: { departments: number; courses: number };
  imported: { departments: number; courses: number };
};

export function UnzaCatalogue({ onImported }: { onImported: () => void }) {
  const { data: session } = useSession();
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/unza-catalogue?summary=1");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load catalogue.");
    setCatalogue(data);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error: unknown) => setError(error instanceof Error ? error.message : "Unable to load catalogue."));
  }, [load]);
  const importCatalogue = async () => {
    if (!window.confirm("Import sourced University of Zambia departments and course names? Existing records and demo data are preserved. No schedule, student roster or lecturer assignments will be created.")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/unza-catalogue", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to import catalogue.");
      setNotice(data.message);
      await load();
      onImported();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to import catalogue.");
    } finally {
      setBusy(false);
    }
  };
  return <section className="ui-card mb-6 space-y-3">
    <p className="ui-eyebrow">University of Zambia</p>
    <h3 className="ui-title text-2xl">Verified public UNZA catalogue</h3>
    <p className="text-sm text-gray-600">Official course codes and names only. Local department identifiers start with UNZA-; these are not official university codes. Missing credits, semester, enrolments, level, lecturer and contact hours are not inferred. Catalogue-only courses are excluded from scheduling and student integration.</p>
    {catalogue && <>
      <p className="text-sm">{catalogue.scopeNote}</p>
      <p className="text-xs">Verified {catalogue.verifiedAt}: {catalogue.available.departments} departments and {catalogue.available.courses} courses available; {catalogue.imported.departments} departments and {catalogue.imported.courses} catalogue-only courses imported.</p>
      {catalogue.available.courses === 0 && <p className="text-sm font-bold text-amber-800">Public course codes and titles could not be verified. Import departments now; obtain an approved university course catalogue before adding real courses. Existing demo courses are not official UNZA courses.</p>}
      {session?.user.role === "admin" && <button type="button" className="ui-btn ui-btn-secondary" disabled={busy} onClick={() => void importCatalogue()}>{busy ? "Importing..." : "Import verified UNZA catalogue"}</button>}
      <p className="text-xs text-slate-500">Browse source links in department details. Filter the Courses register by catalogue status to configure approved scheduling details.</p>
    </>}
    {notice && <p role="status" className="text-sm font-bold text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="text-sm font-bold text-rose-800">{error}</p>}
  </section>;
}
