import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

const EMPTY_FORM = {
  project_name: "",
  grantor: "",
  funding_source: "",
  status: "Draft",
  notes: "",
  sharepoint_link: "",
};

const STATUS_STYLES = {
  Recorded: "bg-status-active/10 text-status-active",
  Draft: "bg-gray-100 text-gray-600",
};

export default function DeedRestrictions() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "editor";
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["deed-restrictions"],
    queryFn: async () => (await api.get("/deed-restrictions")).data,
  });
  const items = data?.items || [];

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const save = useMutation({
    mutationFn: async (payload) => {
      if (editingId) {
        return (await api.patch(`/deed-restrictions/${editingId}`, payload)).data;
      }
      return (await api.post("/deed-restrictions", payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deed-restrictions"] });
      closeForm();
    },
    onError: (err) => setError(err.response?.data?.detail || "Failed to save"),
  });

  const remove = useMutation({
    mutationFn: async (id) => api.delete(`/deed-restrictions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deed-restrictions"] });
      setDeleteTarget(null);
    },
  });

  function openNewForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setFormOpen(true);
  }

  function openEditForm(item) {
    setEditingId(item.id);
    setForm({
      project_name: item.project_name || "",
      grantor: item.grantor || "",
      funding_source: item.funding_source || "",
      status: item.status || "Draft",
      notes: item.notes || "",
      sharepoint_link: item.sharepoint_link || "",
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
    save.mutate({
      project_name: form.project_name.trim(),
      grantor: form.grantor.trim() || null,
      funding_source: form.funding_source.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
      sharepoint_link: form.sharepoint_link.trim() || null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-sm text-gray-500">Total Deed Restrictions</div>
          <div className="text-2xl font-semibold text-[#1F2937] mt-1">{data?.total_count ?? "—"}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-sm text-gray-500">Recorded</div>
          <div className="text-2xl font-semibold text-[#1F2937] mt-1">{data?.recorded_count ?? "—"}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-sm text-gray-500">Draft</div>
          <div className="text-2xl font-semibold text-[#1F2937] mt-1">{data?.draft_count ?? "—"}</div>
        </div>
      </div>

      <div className="flex items-center justify-end">
        {canEdit && (
          <button
            onClick={openNewForm}
            className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            + New Deed Restriction
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
                <th className="px-5 py-2.5 font-medium">Funding Source</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">SharePoint</th>
                {canEdit && <th className="px-5 py-2.5 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} className="px-5 py-10 text-center text-gray-400">
                    No deed restrictions recorded yet.
                  </td>
                </tr>
              )}
              {items.map((d) => (
                <tr key={d.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-2.5 font-medium text-[#1F2937] whitespace-nowrap">{d.project_name}</td>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{d.grantor || "—"}</td>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{d.funding_source || "—"}</td>
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[d.status] || "bg-gray-100 text-gray-600"}`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    {d.sharepoint_link ? (
                      <a
                        href={d.sharepoint_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline text-sm"
                      >
                        Open ↗
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <button onClick={() => openEditForm(d)} className="text-accent hover:underline text-sm mr-3">
                        Edit
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => setDeleteTarget(d)}
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

      <Modal open={formOpen} title={editingId ? "Edit Deed Restriction" : "New Deed Restriction"} onClose={closeForm}>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grantor</label>
              <input
                type="text"
                value={form.grantor}
                onChange={(e) => setForm((f) => ({ ...f, grantor: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Funding Source</label>
              <input
                type="text"
                value={form.funding_source}
                onChange={(e) => setForm((f) => ({ ...f, funding_source: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            >
              <option value="Draft">Draft</option>
              <option value="Recorded">Recorded</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SharePoint Link</label>
            <input
              type="text"
              value={form.sharepoint_link}
              onChange={(e) => setForm((f) => ({ ...f, sharepoint_link: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </div>

          {error && <div className="text-sm text-status-withdrawn">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeForm} className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5">
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-1.5 rounded-md disabled:opacity-60"
            >
              {editingId ? "Save Changes" : "Add Deed Restriction"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} title="Delete this deed restriction?" onClose={() => setDeleteTarget(null)}>
        <p className="text-sm text-gray-600 mb-5">
          This permanently deletes <strong>{deleteTarget?.project_name}</strong> from the list. (A record that it
          existed remains in the admin Change Log, and it can be restored from there.)
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={() => remove.mutate(deleteTarget.id)}
            className="bg-status-withdrawn hover:opacity-90 text-white text-sm font-medium px-4 py-1.5 rounded-md"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
