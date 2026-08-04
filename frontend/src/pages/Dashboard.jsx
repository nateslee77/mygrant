import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import { useCappedList } from "../lib/useCappedList";

export default function Dashboard() {
  const [window_, setWindow] = useState(30);
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => (await api.get("/dashboard/stats")).data,
  });

  const { data: expiring = [], isLoading: expiringLoading } = useQuery({
    queryKey: ["dashboard-expiring", window_],
    queryFn: async () => (await api.get("/dashboard/expiring", { params: { window: window_ } })).data,
  });

  const { visibleItems, expanded, hasMore, remainingCount, toggle } = useCappedList(expiring, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Grants" value={stats?.active_count ?? "—"} />
        <StatCard label="Closed Grants" value={stats?.closed_count ?? "—"} />
        <StatCard label="Total Active Funding" value={formatCurrency(stats?.total_active_funding)} />
        <StatCard
          label="Total Grants Awarded"
          value={formatCurrency(stats?.total_awards_amount)}
          subValue={stats ? `${stats.total_awards_count} award${stats.total_awards_count === 1 ? "" : "s"}` : null}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-[#1F2937]">Expiring Grants</h2>
          <div className="inline-flex rounded-md border border-gray-200 p-0.5 bg-gray-50">
            {[
              { label: "1 Month", value: 30 },
              { label: "6 Months", value: 180 },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setWindow(opt.value)}
                className={`px-3 py-1 text-sm rounded font-medium ${
                  window_ === opt.value ? "bg-white shadow-sm text-accent-dark" : "text-gray-500"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {!expiringLoading && expiring.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No grants expiring in this window
          </div>
        )}

        {expiring.length > 0 && (
          <>
            <div className={expanded ? "max-h-96 overflow-y-auto" : ""}>
              <table className="w-full text-sm">
                <thead className={expanded ? "sticky top-0 bg-white z-10" : ""}>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-5 py-2 font-medium">Project Name</th>
                    <th className="px-5 py-2 font-medium">Grantor</th>
                    <th className="px-5 py-2 font-medium">Current Exp Date</th>
                    <th className="px-5 py-2 font-medium">District</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((g) => (
                    <tr
                      key={g.id}
                      onClick={() => navigate(`/grants/${g.id}`)}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-5 py-2.5 font-medium text-[#1F2937]">{g.project_name}</td>
                      <td className="px-5 py-2.5 text-gray-600">{g.grantor || "—"}</td>
                      <td className="px-5 py-2.5 text-gray-600">{formatDate(g.current_exp_date)}</td>
                      <td className="px-5 py-2.5 text-gray-600">{g.district ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="px-5 py-3 border-t border-gray-100 text-center">
                <button onClick={toggle} className="text-sm text-accent hover:underline font-medium">
                  {expanded ? "Show less" : `View all ${remainingCount + visibleItems.length} (${remainingCount} more)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, subValue }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-semibold text-[#1F2937] mt-1">{value}</div>
      {subValue && <div className="text-xs text-gray-400 mt-0.5">{subValue}</div>}
    </div>
  );
}
