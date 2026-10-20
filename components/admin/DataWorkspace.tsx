"use client";

import { createContext, Fragment, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, RefreshCw, Search, X } from "lucide-react";
import { adminFilterOptions, adminRegisters, cellValue, type DataResource } from "@/lib/adminData";
import { RecordSelect } from "./RecordSelect";

export type BulkAction = { label: string; url: string; body: Record<string, unknown>; warning?: string };
export const AdminActivityContext = createContext<((busy: boolean) => void) | null>(null);
type Result<T> = { records: T[]; total: number; page: number; pageSize: number };
export function downloadCsv(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataWorkspace<T extends { _id: string }>({
  resource, revision = 0, scope = {}, renderDetails, actions = [],
}: {
  resource: DataResource; revision?: number; scope?: Record<string, string>;
  renderDetails?: (record: T, refresh: () => void) => ReactNode; actions?: BulkAction[];
}) {
  const register = adminRegisters[resource];
  const setWorkspaceBusy = useContext(AdminActivityContext);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(register.defaultSort);
  const [direction, setDirection] = useState(resource === "announcements" ? "desc" : "asc");
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [data, setData] = useState<Result<T>>({ records: [], total: 0, page: 0, pageSize: 25 });
  const [loading, setLoading] = useState(true);
  const [loadedQuery, setLoadedQuery] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string[]>([]);
  const sequence = useRef(0);
  const params = new URLSearchParams({ ...scope, ...filters, resource, search: search.trim(), sort, direction, page: String(page), limit: String(limit) });
  const query = params.toString();
  const pending = loading || loadedQuery !== query;

  useEffect(() => {
    const controller = new AbortController();
    const request = ++sequence.current;
    // Abort and debounce every query so an older response cannot replace newer results.
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      setSelected([]);
      setExpanded(null);
      try {
        const response = await fetch(`/api/admin/data?${query}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load records.");
        if (request === sequence.current) {
          setData(result);
          setLoadedQuery(query);
          setPage(result.page);
        }
      } catch (failure) {
        if (!controller.signal.aborted && request === sequence.current) { setError(failure instanceof Error ? failure.message : "Unable to load records."); setLoadedQuery(query); }
      } finally {
        if (!controller.signal.aborted && request === sequence.current) setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, revision, refresh]);

  const changeFilter = (field: string, value: string) => {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(0); setLoading(true); setSelected([]); setExpanded(null);
  };
  const exportCsv = async (onlySelected: boolean) => {
    setBusy(true); setWorkspaceBusy?.(true); setError("");
    try {
      const exportParams = new URLSearchParams(query);
      exportParams.set("export", "csv");
      if (onlySelected) exportParams.set("ids", selected.join(","));
      const response = await fetch(`/api/admin/data?${exportParams}`, { cache: "no-store" });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || "Export failed."); }
      downloadCsv(await response.blob(), `${resource}-${onlySelected ? "selected" : "filtered"}.csv`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Export failed.");
    } finally { setBusy(false); setWorkspaceBusy?.(false); }
  };
  const runBulk = async (action: BulkAction) => {
    if (!window.confirm(`${action.label} for ${selected.length} selected records?\n${action.warning || "Existing authorization and scheduling safeguards apply. Records are processed individually; failures will be listed."}`)) return;
    setBusy(true); setWorkspaceBusy?.(true); setReport([]); setError("");
    const failures: string[] = [];
    let succeeded = 0;
    try {
      for (const id of selected) {
        const label = cellValue(data.records.find((record) => record._id === id), register.columns[0].key) || id;
        const response = await fetch(action.url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...action.body }) });
        const result = await response.json();
        if (!response.ok) failures.push(`${label}: ${result.error || "Update rejected."}`);
        else succeeded += 1;
        if (response.status === 401 || response.status === 403) { failures.push("Stopped: access was denied. Remaining records were not changed."); break; }
      }
    } catch (failure) {
      failures.push(`Stopped: ${failure instanceof Error ? failure.message : "Network failure"}. Check the refreshed records before retrying.`);
    } finally {
      setReport([`${succeeded} record(s) updated. ${failures.length ? "Some updates were not completed." : ""}`, ...failures]);
      setSelected([]); setBusy(false); setWorkspaceBusy?.(false); setLoading(true); setRefresh((current) => current + 1);
    }
  };
  const disabled = busy || pending || Boolean(error);
  const allSelected = data.records.length > 0 && selected.length === data.records.length;
  return <section className="data-workspace ui-card" aria-label={`${register.title} register`} aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="ui-eyebrow">Data workspace</p><h3 className="ui-title text-2xl">{register.title} <span className="data-count">{data.total.toLocaleString()}</span></h3><p className="mt-2 text-xs text-slate-500">Search the full register. Select rows on this page for batch actions.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => setRefresh((current) => current + 1)} aria-label={`Refresh ${register.title}`}><RefreshCw size={15} />Refresh</button><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={disabled} onClick={() => void exportCsv(false)}><Download size={15} />Export filtered CSV</button></div>
    </div>
    <fieldset disabled={busy} className="data-toolbar mt-5">
      <label className="relative min-w-52 flex-1"><span className="sr-only">Search {register.title}</span><Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" /><input type="search" className="ui-input pl-10!" placeholder={`Search ${register.title.toLowerCase()}...`} maxLength={100} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); setLoading(true); setSelected([]); setExpanded(null); }} /></label>
      {register.statuses.length > 0 && <label><span className="sr-only">Status</span><select aria-label="Status filter" className="ui-input" value={filters.status || ""} onChange={(event) => changeFilter("status", event.target.value)}><option value="">All statuses</option>{register.statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
      {register.filters.filter(({ key }) => !(key in scope)).map(({ key, label }) => key === "department" && ["courses", "allocations"].includes(resource)
        ? <RecordSelect key={key} resource="departments" label="Department filter" value={filters[key] || ""} onChange={(value) => changeFilter(key, value)} />
        : <label key={key}><span className="sr-only">{label}</span>{adminFilterOptions[key]
          ? <select className="ui-input" aria-label={`${label} filter`} value={filters[key] || ""} onChange={(event) => changeFilter(key, event.target.value)}><option value="">All {label.toLowerCase()}</option>{adminFilterOptions[key].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select>
          : <input className="ui-input" aria-label={`${label} filter`} maxLength={120} placeholder={label} value={filters[key] || ""} onChange={(event) => changeFilter(key, event.target.value)} />}</label>)}
      {(search || Object.values(filters).some(Boolean)) && <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => { setSearch(""); setFilters({}); setPage(0); setLoading(true); setSelected([]); }}><X size={14} />Clear</button>}
    </fieldset>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <span role="status">{pending ? "Updating results..." : error ? "Results unavailable" : `${data.total.toLocaleString()} matching record(s)`}</span>
      <label className="flex items-center gap-2">Rows per page<select aria-label="Rows per page" className="rounded-lg border border-slate-200 bg-white p-2" value={limit} disabled={busy} onChange={(event) => { setLimit(Number(event.target.value)); setPage(0); setLoading(true); setSelected([]); }}>{[10, 25, 50, 100].map((size) => <option key={size}>{size}</option>)}</select></label>
    </div>
    {error && <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error} <button type="button" className="font-bold underline" onClick={() => setRefresh((current) => current + 1)}>Retry</button></div>}
    {report.length > 0 && <div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><div className="flex justify-between gap-3"><strong>Batch results</strong><button type="button" aria-label="Dismiss batch results" onClick={() => setReport([])}><X size={16} /></button></div><ul className="max-h-48 overflow-auto">{report.map((message, index) => <li key={index}>{message}</li>)}</ul></div>}
    {selected.length > 0 && <div className="data-selection mt-3"><strong>{selected.length} selected on this page</strong><button type="button" disabled={disabled} className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => void exportCsv(true)}>Export selected</button>{actions.map((action) => <button type="button" key={action.label} disabled={disabled} className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => void runBulk(action)}>{action.label}</button>)}<button type="button" disabled={busy} onClick={() => setSelected([])} className="text-xs underline">Clear selection</button>{busy && <span role="status">Processing. Keep this page open...</span>}</div>}
    <div className="data-table-scroll mt-3" tabIndex={0} aria-label={`Scrollable ${register.title} results`} inert={pending || Boolean(error) || busy}>
      <table className="data-table"><caption className="sr-only">{register.title}: paginated results</caption><thead><tr>
        <th className="w-10"><input type="checkbox" aria-label="Select all rows on this page" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? data.records.map((record) => record._id) : [])} /></th>
        {register.columns.map(({ key, label }) => <th key={key} aria-sort={sort === key ? direction === "asc" ? "ascending" : "descending" : "none"}>{register.sorts.includes(key) ? <button type="button" onClick={() => { setSort(key); setDirection(sort === key && direction === "asc" ? "desc" : "asc"); setPage(0); setLoading(true); setSelected([]); }} className="inline-flex items-center gap-1">{label}{sort === key && (direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}</button> : label}</th>)}
        <th>Details</th>
      </tr></thead><tbody>
        {data.records.map((record) => <Fragment key={record._id}><tr data-selected={selected.includes(record._id)}>
          <td><input type="checkbox" aria-label={`Select ${cellValue(record, register.columns[0].key)}`} checked={selected.includes(record._id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, record._id] : current.filter((id) => id !== record._id))} /></td>
          {register.columns.map(({ key }) => <td key={key}><span className={["status", "active", "isAvailable", "role"].includes(key) ? "data-status" : ""}>{cellValue(record, key) || "—"}</span></td>)}
          <td><button type="button" aria-expanded={expanded === record._id} aria-label={`Details for ${cellValue(record, register.columns[0].key)}`} onClick={() => setExpanded(expanded === record._id ? null : record._id)} className="data-detail-button">{expanded === record._id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}View</button></td>
        </tr>{expanded === record._id && <tr><td colSpan={register.columns.length + 2} className="data-detail-cell">{renderDetails ? renderDetails(record, () => setRefresh((current) => current + 1)) : <dl className="grid gap-4 sm:grid-cols-2">{register.columns.map(({ key, label }) => <div key={key}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words">{cellValue(record, key) || "—"}</dd></div>)}</dl>}</td></tr>}</Fragment>)}
        {!data.records.length && <tr><td colSpan={register.columns.length + 2} className="py-14! text-center text-slate-500">{pending ? "Loading records..." : "No matching records. Adjust your filters or add a new record."}</td></tr>}
      </tbody></table>
    </div>
    <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{data.total ? `Showing ${data.page * data.pageSize + 1}–${Math.min((data.page + 1) * data.pageSize, data.total)} of ${data.total.toLocaleString()}` : "No records"} · Exports include up to 10,000 matching rows, without passwords.</span><div className="flex items-center gap-2"><button type="button" disabled={disabled || data.page === 0} className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => { setPage(data.page - 1); setLoading(true); setSelected([]); }}>Previous</button><span>Page {data.page + 1} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button type="button" disabled={disabled || (data.page + 1) * data.pageSize >= data.total} className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => { setPage(data.page + 1); setLoading(true); setSelected([]); }}>Next</button></div></footer>
  </section>;
}
