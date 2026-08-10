import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ColumnFilterMenu from "../components/ColumnFilterMenu";
import ExpiredBadge from "../components/ExpiredBadge";
import OpenLinkButton from "../components/OpenLinkButton";
import Spinner from "../components/Spinner";
import StatusPill from "../components/StatusPill";
import StickyHorizontalScrollbar from "../components/StickyHorizontalScrollbar";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { downloadFile } from "../lib/download";
import { formatCurrency, formatDate } from "../lib/format";

const TABS = [
  { label: "Active", value: "Active" },
  { label: "Closed", value: "Closed" },
  { label: "All", value: null },
];

const EXPIRATION_FILTERS = [
  { key: "expired", label: "Expired" },
  { key: "exp_7", label: "Expiring in 7 Days" },
  { key: "exp_14", label: "Expiring in 14 Days" },
  { key: "exp_30", label: "Expiring in 1 Month" },
  { key: "exp_180", label: "Expiring in 6 Months" },
];

function grantMatchesExpiration(grant, filter) {
  if (!filter) return true;
  if (filter === "expired") return grant.is_expired;
  if (grant.is_expired || !grant.current_exp_date) return false;
  const daysUntil = Math.ceil((new Date(grant.current_exp_date) - new Date(new Date().toDateString())) / 86400000);
  switch (filter) {
    case "exp_7":
      return daysUntil >= 0 && daysUntil <= 7;
    case "exp_14":
      return daysUntil >= 0 && daysUntil <= 14;
    case "exp_30":
      return daysUntil >= 0 && daysUntil <= 30;
    case "exp_180":
      return daysUntil >= 0 && daysUntil <= 180;
    default:
      return true;
  }
}

// Columns that get a checkbox filter menu on their header (small, discrete value sets).
const FILTERABLE_COLUMNS = new Set([
  "status",
  "grantor",
  "funding_source",
  "grant_officer",
  "district",
  "grants_manager",
  "program_manager",
]);

const PAGE_SIZE = 500; // upper bound fetched from the backend; display pagination happens client-side below
const PAGE_SIZE_OPTIONS = [10, 50, 100];

export default function AllGrants() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "editor";

  const [tab, setTab] = useState("Active");
  const [search, setSearch] = useState("");
  const [expirationFilter, setExpirationFilter] = useState(null);
  const [columnFilters, setColumnFilters] = useState({}); // { [columnKey]: string[] of selected values }
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10); // number, or "all"
  const [sortKey, setSortKey] = useState("project_name");
  const [sortDir, setSortDir] = useState("asc");
  const scrollContainerRef = useRef(null);

  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(null); // null | "full" | "summary"
  const reportMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (reportMenuRef.current && !reportMenuRef.current.contains(e.target)) setReportMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function buildFiltersDescription() {
    const parts = [];
    const activeTab = TABS.find((t) => t.value === tab);
    if (activeTab?.value) parts.push(`Status: ${activeTab.label}`);
    if (search) parts.push(`Search: "${search}"`);
    if (expirationFilter) {
      const opt = EXPIRATION_FILTERS.find((o) => o.key === expirationFilter);
      if (opt) parts.push(opt.label);
    }
    Object.entries(columnFilters).forEach(([key, values]) => {
      if (!values || values.length === 0) return;
      const label = columns.find((c) => c.key === key)?.label || key;
      parts.push(`${label}: ${values.join(", ")}`);
    });
    const sortLabel = columns.find((c) => c.key === sortKey)?.label || sortKey;
    parts.push(`Sorted by: ${sortLabel} (${sortDir === "asc" ? "ascending" : "descending"})`);
    return parts.join("; ");
  }

  async function handleDownloadReport(reportType) {
    setReportMenuOpen(false);
    setDownloadingReport(reportType);
    try {
      await downloadFile("/grants/report/pdf", {
        method: "post",
        data: {
          report_type: reportType,
          grant_ids: sortedItems.map((g) => g.id),
          filters_description: buildFiltersDescription() || null,
        },
        fallbackFilename: `grants_${reportType}_report.pdf`,
        mimeType: "application/pdf",
      });
    } finally {
      setDownloadingReport(null);
    }
  }

  const activeColumnFilterCount = Object.values(columnFilters).filter((v) => v && v.length > 0).length;
  const hasActiveFilters = Boolean(search || expirationFilter || activeColumnFilterCount > 0 || tab !== "Active");

  const queryParams = {
    page: 1,
    page_size: PAGE_SIZE,
    ...(tab ? { status: tab } : {}),
    ...(search ? { search } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ["grants", queryParams],
    queryFn: async () => (await api.get("/grants", { params: queryParams })).data,
  });

  // Column filter menu option lists are derived straight from the live query result above
  // (no separate cached fetch), so they can never go stale relative to what's on screen —
  // add/rename a manager elsewhere and it shows up here as soon as this list refetches.
  const columnOptions = useMemo(() => {
    const items = data?.items || [];
    const uniq = (key) => [...new Set(items.map((g) => g[key]).filter((v) => v !== null && v !== undefined && v !== ""))].sort();
    return {
      status: uniq("status"),
      grantor: uniq("grantor"),
      funding_source: uniq("funding_source"),
      grant_officer: uniq("grant_officer"),
      district: uniq("district").map(String),
      grants_manager: uniq("grants_manager"),
      program_manager: uniq("program_manager"),
    };
  }, [data]);

  const filteredItems = useMemo(() => {
    const items = data?.items || [];
    return items.filter((g) => {
      if (!grantMatchesExpiration(g, expirationFilter)) return false;
      return Object.entries(columnFilters).every(([key, selected]) => {
        if (!selected || selected.length === 0) return true;
        const value = key === "district" ? String(g[key] ?? "") : g[key];
        return selected.includes(value);
      });
    });
  }, [data, columnFilters, expirationFilter]);

  const sortedItems = useMemo(() => {
    const copy = [...filteredItems];
    copy.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (av === null || av === undefined) av = "";
      if (bv === null || bv === undefined) bv = "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filteredItems, sortKey, sortDir]);

  const totalAmount = useMemo(
    () => sortedItems.reduce((sum, g) => sum + (g.grant_amount ? Number(g.grant_amount) : 0), 0),
    [sortedItems]
  );

  const effectiveRowsPerPage = rowsPerPage === "all" ? Math.max(sortedItems.length, 1) : rowsPerPage;
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / effectiveRowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sortedItems.slice((currentPage - 1) * effectiveRowsPerPage, currentPage * effectiveRowsPerPage);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function resetToPageOne(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  function setColumnFilter(key, values) {
    setColumnFilters((prev) => ({ ...prev, [key]: values }));
    setPage(1);
  }

  function clearFilters() {
    setTab("Active");
    setSearch("");
    setExpirationFilter(null);
    setColumnFilters({});
    setPage(1);
  }

  const columns = [
    { key: "project_name", label: "Project Name", sticky: true },
    { key: "status", label: "Status" },
    { key: "grantor", label: "Grantor" },
    { key: "funding_source", label: "Funding Source" },
    { key: "grant_officer", label: "Grant Officer" },
    { key: "district", label: "District" },
    { key: "current_exp_date", label: "Current Exp Date" },
    { key: "orig_exp_date", label: "Orig Exp Date" },
    { key: "amended_exp_date", label: "Amended Exp Date" },
    { key: "grant_amount", label: "Grant Amount" },
    { key: "grants_manager", label: "Grants Manager" },
    { key: "program_manager", label: "Program Manager" },
    { key: "scope", label: "Scope" },
    { key: "sharepoint_link", label: "SharePoint" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-md border border-gray-200 p-0.5 bg-white">
            {TABS.map((t) => (
              <button
                key={t.label}
                onClick={() => resetToPageOne(setTab)(t.value)}
                className={`px-4 py-1.5 text-sm rounded font-medium ${
                  tab === t.value ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="text-sm text-gray-500">
            {sortedItems.length} grant{sortedItems.length === 1 ? "" : "s"}
            {hasActiveFilters || tab ? ` match${sortedItems.length === 1 ? "es" : ""}` : ""}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-gray-500">Total Amount</div>
            <div className="text-lg font-semibold text-[#1F2937]">{formatCurrency(totalAmount)}</div>
          </div>
          <div className="relative" ref={reportMenuRef}>
            <button
              onClick={() => setReportMenuOpen((o) => !o)}
              disabled={!!downloadingReport}
              className="bg-white border border-gray-300 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-md inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {downloadingReport && <Spinner className="w-3.5 h-3.5" />}
              {downloadingReport ? "Downloading…" : "Download Report"}
              {!downloadingReport && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`transition-transform ${reportMenuOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
            </button>
            {reportMenuOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <button
                  onClick={() => handleDownloadReport("full")}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Full Report (PDF)
                </button>
                <button
                  onClick={() => handleDownloadReport("summary")}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Summary Report (PDF)
                </button>
              </div>
            )}
          </div>
          {canEdit && (
            <button
              onClick={() => navigate("/grants/new")}
              className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-2 rounded-md"
            >
              + New Grant
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filters</h2>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-sm text-accent hover:underline font-medium">
              Clear all
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <Field label="Search">
            <input
              type="text"
              placeholder="Project name…"
              value={search}
              onChange={(e) => resetToPageOne(setSearch)(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </Field>
          <div className="flex items-end">
            <p className="text-xs text-gray-400">
              Tip: click the ▼ icon on a column header (e.g. Grants Manager) to filter by specific values.
            </p>
          </div>
        </div>

        <Field label="Expiration">
          <div className="flex flex-wrap gap-1">
            {EXPIRATION_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => resetToPageOne(setExpirationFilter)(expirationFilter === f.key ? null : f.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap border ${
                  expirationFilter === f.key
                    ? "bg-amber-100 text-amber-700 border-amber-300"
                    : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto" ref={scrollContainerRef}>
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200 bg-gray-50 shadow-sm">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-2.5 font-medium select-none whitespace-nowrap hover:text-gray-700 ${
                      col.sticky ? "sticky left-0 bg-gray-50 z-20" : ""
                    }`}
                  >
                    <span className="cursor-pointer" onClick={() => handleSort(col.key)}>
                      {col.label} {sortKey === col.key && (sortDir === "asc" ? "▲" : "▼")}
                    </span>
                    {FILTERABLE_COLUMNS.has(col.key) && (
                      <ColumnFilterMenu
                        options={columnOptions[col.key] || []}
                        selected={columnFilters[col.key] || []}
                        onChange={(values) => setColumnFilter(col.key, values)}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!isLoading && sortedItems.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-gray-400">
                    No grants match these filters.
                  </td>
                </tr>
              )}
              {pageItems.map((g, i) => {
                const rowBg = i % 2 === 1 ? "bg-gray-50" : "bg-white";
                return (
                <tr
                  key={g.id}
                  onClick={() => navigate(`/grants/${g.id}`)}
                  className={`group border-b border-gray-100 last:border-0 hover:bg-gray-100 cursor-pointer ${rowBg}`}
                >
                  <td
                    className={`px-4 py-2.5 font-medium text-[#1F2937] whitespace-nowrap sticky left-0 z-[5] group-hover:bg-gray-100 ${rowBg}`}
                  >
                    {g.project_name}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <StatusPill status={g.status} />
                      {g.is_expired && <ExpiredBadge />}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{g.grantor || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{g.funding_source || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{g.grant_officer || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{g.district ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(g.current_exp_date)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(g.orig_exp_date)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(g.amended_exp_date)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatCurrency(g.grant_amount)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{g.grants_manager || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{g.program_manager || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 max-w-[220px] truncate" title={g.scope || ""}>
                    {g.scope || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {g.sharepoint_link ? (
                      <OpenLinkButton url={g.sharepoint_link} />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
          <span>
            {sortedItems.length === 0
              ? "0 grants"
              : `Showing ${(currentPage - 1) * effectiveRowsPerPage + 1}–${Math.min(currentPage * effectiveRowsPerPage, sortedItems.length)} of ${sortedItems.length}`}
          </span>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Show</span>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setRowsPerPage(n);
                    setPage(1);
                  }}
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    rowsPerPage === n ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => {
                  setRowsPerPage("all");
                  setPage(1);
                }}
                className={`px-2 py-1 rounded text-xs font-medium ${
                  rowsPerPage === "all" ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                All
              </button>
            </div>

            {rowsPerPage !== "all" && totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-xs text-gray-400">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <StickyHorizontalScrollbar targetRef={scrollContainerRef} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
