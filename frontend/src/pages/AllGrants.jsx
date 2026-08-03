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

const PAGE_SIZE = 50;

export default function AllGrants() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "editor";

  const [tab, setTab] = useState(null);
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("");
  const [grantor, setGrantor] = useState("");
  const [fundingSource, setFundingSource] = useState("");
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
      grantsManagers: uniq(items.map((g) => g.grants_manager)),
      fundingSources: uniq(items.map((g) => g.funding_source)),
    };
  }, [filterSource]);

  const queryParams = {
    page,
    page_size: PAGE_SIZE,
    ...(tab ? { status: tab } : {}),
    ...(search ? { search } : {}),
    ...(district ? { district } : {}),
    ...(grantor ? { grantor } : {}),
    ...(grantsManager ? { grants_manager: grantsManager } : {}),
    ...(fundingSource ? { funding_source: fundingSource } : {}),
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

  const columns = [
    { key: "project_name", label: "Project Name" },
    { key: "grantor", label: "Grantor" },
    { key: "funding_source", label: "Funding Source" },
    { key: "status", label: "Status" },
    { key: "district", label: "District" },
    { key: "current_exp_date", label: "Current Exp Date" },
    { key: "grant_amount", label: "Grant Amount" },
    { key: "grants_manager", label: "Grants Manager" },
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

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search project name…"
          value={search}
          onChange={(e) => resetToPageOne(setSearch)(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
        />
        <FilterSelect label="District" value={district} onChange={resetToPageOne(setDistrict)} options={options.districts} />
        <FilterSelect label="Grantor" value={grantor} onChange={resetToPageOne(setGrantor)} options={options.grantors} />
        <FilterSelect
          label="Grants Manager"
          value={grantsManager}
          onChange={resetToPageOne(setGrantsManager)}
          options={options.grantsManagers}
        />
        <FilterSelect
          label="Funding Source"
          value={fundingSource}
          onChange={resetToPageOne(setFundingSource)}
          options={options.fundingSources}
        />
        {(district || grantor || grantsManager || fundingSource || search) && (
          <button
            onClick={() => {
              setSearch("");
              setDistrict("");
              setGrantor("");
              setGrantsManager("");
              setFundingSource("");
              setPage(1);
            }}
            className="text-sm text-accent hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-4 py-2.5 font-medium cursor-pointer select-none whitespace-nowrap"
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
              {sortedItems.map((g) => (
                <tr
                  key={g.id}
                  onClick={() => navigate(`/grants/${g.id}`)}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-2.5 font-medium text-[#1F2937] whitespace-nowrap">{g.project_name}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{g.grantor || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{g.funding_source || "—"}</td>
                  <td className="px-4 py-2.5">
                    <StatusPill status={g.status} />
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{g.district ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(g.current_exp_date)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatCurrency(g.grant_amount)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{g.grants_manager || "—"}</td>
                </tr>
              ))}
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

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
    >
      <option value="">{label}: All</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
