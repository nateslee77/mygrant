import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

const PAGE_SIZE = 500;

export default function AllGrants() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "editor";

  const [tab, setTab] = useState(null);
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("");
  const [grantor, setGrantor] = useState("");
  const [fundingSource, setFundingSource] = useState("");
  const [expiringWithin, setExpiringWithin] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("project_name");
  const [sortDir, setSortDir] = useState("asc");

  // Cheap full fetch to populate filter dropdown option lists (dataset is small, ~a few hundred rows).
  const { data: filterSource } = useQuery({
    queryKey: ["grants-filter-options"],
    queryFn: async () => (await api.get("/grants", { params: { page: 1, page_size: 1000 } })).data,
    staleTime: 5 * 60 * 1000,
  });

  const options = useMemo(() => {
    const items = filterSource?.items || [];
    const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
    return {
      districts: uniq(items.map((g) => g.district)),
      grantors: uniq(items.map((g) => g.grantor)),
      fundingSources: uniq(items.map((g) => g.funding_source)),
    };
  }, [filterSource]);

  const hasActiveFilters = Boolean(district || grantor || fundingSource || expiringWithin || search);

  const queryParams = {
    page,
    page_size: PAGE_SIZE,
    ...(tab ? { status: tab } : {}),
    ...(search ? { search } : {}),
    ...(district ? { district } : {}),
    ...(grantor ? { grantor } : {}),
    ...(fundingSource ? { funding_source: fundingSource } : {}),
    ...(expiringWithin ? { expiring_within: expiringWithin } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ["grants", queryParams],
    queryFn: async () => (await api.get("/grants", { params: queryParams })).data,
  });

  const items = data?.items || [];
  const sortedItems = useMemo(() => {
    const copy = [...items];
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
  }, [items, sortKey, sortDir]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

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

  function clearFilters() {
    setSearch("");
    setDistrict("");
    setGrantor("");
    setFundingSource("");
    setExpiringWithin("");
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Field label="Search">
            <input
              type="text"
              placeholder="Project name…"
              value={search}
              onChange={(e) => resetToPageOne(setSearch)(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </Field>
          <Field label="District">
            <FilterSelect value={district} onChange={resetToPageOne(setDistrict)} options={options.districts} allLabel="All Districts" />
          </Field>
          <Field label="Grantor">
            <FilterSelect value={grantor} onChange={resetToPageOne(setGrantor)} options={options.grantors} allLabel="All Grantors" />
          </Field>
          <Field label="Funding Source">
            <FilterSelect
              value={fundingSource}
              onChange={resetToPageOne(setFundingSource)}
              options={options.fundingSources}
              allLabel="All Funding Sources"
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
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200 bg-gray-50 shadow-sm">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-4 py-2.5 font-medium cursor-pointer select-none whitespace-nowrap hover:text-gray-700 ${
                      col.sticky ? "sticky left-0 bg-gray-50 z-20" : ""
                    }`}
                  >
                    {col.label} {sortKey === col.key && (sortDir === "asc" ? "▲" : "▼")}
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
              {sortedItems.map((g, i) => {
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

        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
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

function FilterSelect({ value, onChange, options, allLabel }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
    >
      <option value="">{allLabel}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
