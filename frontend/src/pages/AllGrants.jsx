import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ColumnFilterMenu from "../components/ColumnFilterMenu";
import StatusPill from "../components/StatusPill";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";

const TABS = [
  { label: "All", value: null },
  { label: "Active", value: "Active" },
  { label: "Closed", value: "Closed" },
];

const EXPIRING_OPTIONS = [
  { label: "Any time", value: "" },
  { label: "Within 1 Month", value: "30" },
  { label: "Within 6 Months", value: "180" },
];

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

  const [tab, setTab] = useState(null);
  const [search, setSearch] = useState("");
  const [expiringWithin, setExpiringWithin] = useState("");
  const [columnFilters, setColumnFilters] = useState({}); // { [columnKey]: string[] of selected values }
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10); // number, or "all"
  const [sortKey, setSortKey] = useState("project_name");
  const [sortDir, setSortDir] = useState("asc");

  const activeColumnFilterCount = Object.values(columnFilters).filter((v) => v && v.length > 0).length;
  const hasActiveFilters = Boolean(search || expiringWithin || activeColumnFilterCount > 0);

  const queryParams = {
    page: 1,
    page_size: PAGE_SIZE,
    ...(tab ? { status: tab } : {}),
    ...(search ? { search } : {}),
    ...(expiringWithin ? { expiring_within: expiringWithin } : {}),
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
    return items.filter((g) =>
      Object.entries(columnFilters).every(([key, selected]) => {
        if (!selected || selected.length === 0) return true;
        const value = key === "district" ? String(g[key] ?? "") : g[key];
        return selected.includes(value);
      })
    );
  }, [data, columnFilters]);

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
    setSearch("");
    setExpiringWithin("");
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
    { key: "orig_exp_date", label: "Orig Exp Date" },
    { key: "current_exp_date", label: "Current Exp Date" },
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

        {canEdit && (
          <button
            onClick={() => navigate("/grants/new")}
            className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            + New Grant
          </button>
        )}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Search">
            <input
              type="text"
              placeholder="Project name…"
              value={search}
              onChange={(e) => resetToPageOne(setSearch)(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </Field>
          <Field label="Expiring">
            <select
              value={expiringWithin}
              onChange={(e) => resetToPageOne(setExpiringWithin)(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            >
              {EXPIRING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <p className="text-xs text-gray-400">
              Tip: click the ▼ icon on a column header (e.g. Grants Manager) to filter by specific values.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
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
                    <StatusPill status={g.status} />
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{g.grantor || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{g.funding_source || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{g.grant_officer || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{g.district ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(g.orig_exp_date)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(g.current_exp_date)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(g.amended_exp_date)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatCurrency(g.grant_amount)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{g.grants_manager || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{g.program_manager || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 max-w-[220px] truncate" title={g.scope || ""}>
                    {g.scope || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {g.sharepoint_link ? (
                      <a
                        href={g.sharepoint_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-accent hover:underline whitespace-nowrap"
                      >
                        Open ↗
                      </a>
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
