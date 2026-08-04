import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";

const EMPTY_FORM = { project_name: "", grantor: "", award_date: "", amount: "" };

export default function GrantsAwarded() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "editor";
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["grant-awards"],
    queryFn: async () => (await api.get("/grant-awards")).data,
  });
  const items = data?.items || [];

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const saveAward = useMutation({
    mutationFn: async (payload) => {
      if (editingId) {
        return (await api.patch(`/grant-awards/${editingId}`, payload)).data;
      }
      return (await api.post("/grant-awards", payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grant-awards"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      closeForm();
    },
    onError: (err) => setError(err.response?.data?.detail || "Failed to save award"),
  });

  const deleteAward = useMutation({
    mutationFn: async (id) => api.delete(`/grant-awards/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grant-awards"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setDeleteTarget(null);
    },
  });

  function openNewForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setFormOpen(true);
  }

  function openEditForm(award) {
    setEditingId(award.id);
    setForm({
      project_name: award.project_name || "",
      grantor: award.grantor || "",
      award_date: award.award_date || "",
      amount: award.amount ?? "",
    });
    setError("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.project_name.trim()) {
      setError("Project name is required");
      return;
    }
    saveAward.mutate({
      project_name: form.project_name.trim(),
      grantor: form.grantor.trim() || null,
      award_date: form.award_date || null,
      amount: form.amount === "" ? null : parseFloat(form.amount),
    });
  }

  async function handleDownloadReport() {
    const response = await api.get("/grant-awards/report/pdf", { responseType: "blob" });
    const disposition = response.headers["content-disposition"] || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : "grants_awarded_report.pdf";

    const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-sm text-gray-500">Total Awards</div>
          <div className="text-2xl font-semibold text-[#1F2937] mt-1">{data?.total_count ?? "—"}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-sm text-gray-500">Total Amount Awarded</div>
          <div className="text-2xl font-semibold text-[#1F2937] mt-1">{formatCurrency(data?.total_amount)}</div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          onClick={handleDownloadReport}
          className="bg-white border border-gray-300 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-md"
        >
          Download Report (PDF)
        </button>
        {canEdit && (
          <button
            onClick={openNewForm}
            className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            + New Award
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-2.5 font-medium">Project Name</th>
                <th className="px-5 py-2.5 font-medium">Grantor</th>
                <th className="px-5 py-2.5 font-medium">Award Date</th>
                <th className="px-5 py-2.5 font-medium">Amount</th>
                {canEdit && <th className="px-5 py-2.5 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="px-5 py-10 text-center text-gray-400">
                    No grant awards recorded yet.
                  </td>
                </tr>
              )}
              {items.map((a) => (
                <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-2.5 font-medium text-[#1F2937] whitespace-nowrap">{a.project_name}</td>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{a.grantor || "—"}</td>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(a.award_date)}</td>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{formatCurrency(a.amount)}</td>
                  {canEdit && (
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <button onClick={() => openEditForm(a)} className="text-accent hover:underline text-sm mr-3">
                        Edit
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => setDeleteTarget(a)}
                          className="text-status-withdrawn hover:underline text-sm"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={formOpen} title={editingId ? "Edit Award" : "New Award"} onClose={closeForm}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Name <span className="text-status-withdrawn">*</span>
            </label>
            <input
              type="text"
              value={form.project_name}
              onChange={(e) => setForm((f) => ({ ...f, project_name: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grantor</label>
            <input
              type="text"
              value={form.grantor}
              onChange={(e) => setForm((f) => ({ ...f, grantor: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Award Date</label>
              <input
                type="date"
                value={form.award_date}
                onChange={(e) => setForm((f) => ({ ...f, award_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
          </div>

          {error && <div className="text-sm text-status-withdrawn">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeForm} className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveAward.isPending}
              className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-1.5 rounded-md disabled:opacity-60"
            >
              {editingId ? "Save Changes" : "Add Award"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} title="Delete this award?" onClose={() => setDeleteTarget(null)}>
        <p className="text-sm text-gray-600 mb-5">
          This permanently deletes <strong>{deleteTarget?.project_name}</strong> from the awards list. (A record
          that it existed remains in the admin Change Log, and it can be restored from there.)
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={() => deleteAward.mutate(deleteTarget.id)}
            className="bg-status-withdrawn hover:opacity-90 text-white text-sm font-medium px-4 py-1.5 rounded-md"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
