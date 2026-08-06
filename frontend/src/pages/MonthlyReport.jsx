import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { downloadFile } from "../lib/download";
import { formatCurrency, formatDate } from "../lib/format";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function StatTile({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-semibold text-[#1F2937] mt-1">{value}</div>
    </div>
  );
}

function ReportTable({ title, columns, rows, emptyMessage }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 font-medium text-[#1F2937]">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
              {columns.map((col) => (
                <th key={col.key} className="px-5 py-2.5 font-medium">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-5 py-8 text-center text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-2.5 text-gray-600 whitespace-nowrap">
                    {col.render ? col.render(row) : row[col.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MonthlyReport() {
  const [month, setMonth] = useState(currentMonth());

  const { data, isLoading, isError } = useQuery({
    queryKey: ["monthly-report", month],
    queryFn: async () => (await api.get("/monthly-report", { params: { month } })).data,
    enabled: !!month,
  });

  async function handleDownload(format) {
    await downloadFile(`/monthly-report/${format}`, {
      params: { month },
      fallbackFilename: `monthly_report_${month}.${format}`,
      mimeType:
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  const psrSubmitted = data?.psr_submitted || [];
  const grantsAwarded = data?.grants_awarded || [];
  const psrDue = data?.psr_due || [];
  const psrPerformanceEnding = data?.psr_performance_ending || [];
  const grantsExpiring = data?.grants_expiring || [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleDownload("pdf")}
            disabled={!data}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-md disabled:opacity-50"
          >
            Download Report (PDF)
          </button>
          <button
            onClick={() => handleDownload("docx")}
            disabled={!data}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-md disabled:opacity-50"
          >
            Download Report (Word)
          </button>
        </div>
      </div>

      {isError && (
        <div className="text-sm text-status-withdrawn">Failed to load the monthly report. Please try again.</div>
      )}

      {!isLoading && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatTile label="Status Reports Submitted" value={data.psr_submitted_count} />
            <StatTile label="Grants Awarded" value={`${data.grants_awarded_count} (${formatCurrency(data.grants_awarded_amount)})`} />
            <StatTile label="Status Reports Due" value={data.psr_due_count} />
            <StatTile label="Performance Periods Ending" value={data.psr_performance_ending_count} />
            <StatTile label="Grants Expiring" value={data.grants_expiring_count} />
          </div>

          <ReportTable
            title="Status Reports Submitted"
            emptyMessage="No status reports submitted this month."
            columns={[
              { key: "project_name", label: "Project Name" },
              { key: "category", label: "Category" },
              { key: "grantor", label: "Grantor" },
              { key: "due_date", label: "Due Date", render: (r) => formatDate(r.due_date) },
              { key: "submitted_date", label: "Submitted Date", render: (r) => formatDate(r.submitted_date) },
            ]}
            rows={psrSubmitted}
          />

          <ReportTable
            title="Grants Awarded"
            emptyMessage="No grants awarded this month."
            columns={[
              { key: "project_name", label: "Project Name" },
              { key: "grantor", label: "Grantor" },
              { key: "award_date", label: "Award Date", render: (r) => formatDate(r.award_date) },
              { key: "amount", label: "Amount", render: (r) => formatCurrency(r.amount) },
            ]}
            rows={grantsAwarded}
          />

          <ReportTable
            title="Status Reports Due"
            emptyMessage="No status reports due this month."
            columns={[
              { key: "project_name", label: "Project Name" },
              { key: "category", label: "Category" },
              { key: "grantor", label: "Grantor" },
              { key: "due_date", label: "Due Date", render: (r) => formatDate(r.due_date) },
              { key: "submitted", label: "Status", render: (r) => (r.submitted ? "Submitted" : "Not submitted") },
            ]}
            rows={psrDue}
          />

          <ReportTable
            title="Status Reports — Performance Period Ending"
            emptyMessage="No status report performance periods end this month."
            columns={[
              { key: "project_name", label: "Project Name" },
              { key: "category", label: "Category" },
              { key: "grantor", label: "Grantor" },
              { key: "performance_end_date", label: "Performance End Date", render: (r) => formatDate(r.performance_end_date) },
            ]}
            rows={psrPerformanceEnding}
          />

          <ReportTable
            title="Grants Expiring"
            emptyMessage="No grants expiring this month."
            columns={[
              { key: "project_name", label: "Project Name" },
              { key: "grantor", label: "Grantor" },
              { key: "district", label: "District" },
              { key: "current_exp_date", label: "Expiration Date", render: (r) => formatDate(r.current_exp_date) },
              { key: "grant_amount", label: "Grant Amount", render: (r) => formatCurrency(r.grant_amount) },
            ]}
            rows={grantsExpiring}
          />
        </>
      )}
    </div>
  );
}
