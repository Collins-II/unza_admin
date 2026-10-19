"use client";

import { useEffect, useState } from "react";
import { cellValue, type DataResource } from "@/lib/adminData";

export function RecordSelect({ resource, value, onChange, label, filters = {}, required = false, valueField = "_id" }: {
  resource: DataResource; value: string; onChange: (value: string, label?: string) => void; label: string;
  filters?: Record<string, string>; required?: boolean; valueField?: "_id" | "code";
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const filterKey = new URLSearchParams(filters).toString();
  const requestKey = JSON.stringify([resource, search, page, filterKey, retry]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams(filterKey);
        params.set("resource", resource);
        params.set("search", search);
        params.set("page", String(page));
        params.set("limit", "25");
        const response = await fetch(`/api/admin/data?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load choices.");
        if (!controller.signal.aborted) { setRows(data.records); setTotal(data.total); setLoadedKey(requestKey); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load choices.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [resource, search, page, filterKey, retry, requestKey]);
  useEffect(() => {
    if (!value) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ resource, ...(valueField === "_id" ? { id: value } : { search: value }) });
    void (async () => {
      try {
        const response = await fetch(`/api/admin/data?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to resolve selection.");
        if (!controller.signal.aborted) setSelected(data.records.find((record: Record<string, unknown>) => cellValue(record, valueField) === value) || null);
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to resolve selection."); }
    })();
    return () => controller.abort();
  }, [value, resource, valueField, retry]);
  const choices = selected && cellValue(selected, valueField) === value && !rows.some((row) => cellValue(row, valueField) === value) ? [selected, ...rows] : rows;
  return <div className="record-select"><label><span className="ui-label">{label}</span><input type="search" className="ui-input mb-1" maxLength={100} placeholder={`Find ${label.toLowerCase()}...`} aria-label={`Search ${label}`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></label>
    <select aria-label={label} className="ui-input" required={required} value={value} disabled={loading || loadedKey !== requestKey || Boolean(error)} onChange={(event) => { const next = event.target.value; const row = choices.find((row) => cellValue(row, valueField) === next) || null; setSelected(row); onChange(next, row ? [cellValue(row, "code"), cellValue(row, "name") || cellValue(row, "title")].filter(Boolean).join(" — ") : ""); }}>
      <option value="">{loading ? "Loading choices..." : `Select ${label.toLowerCase()}`}</option>
      {value && !choices.some((row) => cellValue(row, valueField) === value) && <option value={value}>{value}</option>}
      {choices.map((row) => <option key={cellValue(row, "_id")} value={cellValue(row, valueField)}>{[cellValue(row, "code"), cellValue(row, "name") || cellValue(row, "title")].filter(Boolean).join(" — ")}</option>)}
    </select>
    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500"><span>{total} matching choices</span><div className="flex gap-2"><button type="button" disabled={loading || page === 0} onClick={() => setPage(page - 1)}>Previous</button><button type="button" disabled={loading || (page + 1) * 25 >= total} onClick={() => setPage(page + 1)}>More</button></div></div>
    {error && <p role="alert" className="text-xs text-rose-700">{error} <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}
  </div>;
}
