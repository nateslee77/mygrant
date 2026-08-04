import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import ColumnFilterMenu from "../components/ColumnFilterMenu";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";

const CATEGORIES = [
  "RPOSD",
  "State of California NRA",
  "Conservancy (RMC,BHUWC)",
  "Cooling Amenities and Fairfax",
  "Other",
];

const EMPTY_FORM = {
  project_name: "",
  category: CATEGORIES[0],
  grantor: "",
  funding_source: "",
  ad_number: "",
  district: "",
  grant_manager: "",
  performance_end_date: "",
  link: "",
};

function nextDueDate(project) {
  const unsubmitted = (project.due_dates || []).filter((d) => !d.submitted);
  if (unsubmitted.length === 0) return null;
  return unsubmitted.reduce((soonest, d) => (d.due_date < soonest.due_date ? d : soonest));
}

function DueBadge({ project }) {
  const due = nextDueDate(project);
  if (!due) {
    const hasAny = (project.due_dates || []).length > 0;
    return <span className="text-xs text-gray-400">{hasAny ? "All submitted" : "No due date set"}</span>;
  }
  const daysUntil = Math.ceil((new Date(due.due_date) - new Date(new Date().toDateString())) / 86400000);
  let style = "bg-gray-100 text-gray-600";
  if (daysUntil < 0) style = "bg-status-withdrawn/10 text-status-withdrawn";
  else if (daysUntil <= 30) style = "bg-amber-100 text-amber-700";
  else style = "bg-status-active/10 text-status-active";
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${style}`}>
      {formatDate(due.due_date)}
      {daysUntil < 0 ? ` (${Math.abs(daysUntil)}d overdue)` : daysUntil <= 30 ? ` (${daysUntil}d)` : ""}
    </span>
  );
}

export default function StatusReports() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "editor";
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["psr-projects"],
    queryFn: async () => (await api.get("/psr-projects")).data,
  });
  const items = data?.items || [];

  const [tab, setTab] = useState(CATEGORIES[0]);
  const [columnFilters, setColumnFilters] = useState({});
  const activeFilterCount = Object.values(columnFilters).filter((v) => v && v.length > 0).length;

  const tabItems = useMemo(() => items.filter((p) => p.category === tab), [items, tab]);

  const columnOptions = useMemo(() => {
    const uniq = (key) =>
      [...new Set(tabItems.map((p) => p[key]).filter((v) => v !== null && v !== undefined && v !== ""))].sort();
    return {
      grant_manager: uniq("grant_manager"),
      district: uniq("district").map(String),
    };
  }, [tabItems]);

  const filteredItems = useMemo(() => {
    return tabItems.filter((p) =>
      Object.entries(columnFilters).every(([key, selected]) => {
        if (!selected || selected.length === 0) return true;
        const value = key === "district" ? String(p[key] ?? "") : p[key];
        return selected.includes(value);
      })
    );
  }, [tabItems, columnFilters]);

  function setColumnFilter(key, values) {
    setColumnFilters((prev) => ({ ...prev, [key]: values }));
  }

  function switchTab(cat) {
    setTab(cat);
    setColumnFilters({});
  }

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailProject, setDetailProject] = useState(null);

  const saveProject = useMutation({
    mutationFn: async (payload) => {
      if (editingId) return (await api.patch(`/psr-projects/${editingId}`, payload)).data;
      return (await api.post("/psr-projects", payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["psr-projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      closeForm();
    },
    onError: (err) => setError(err.response?.data?.detail || "Failed to save"),
  });

  const deleteProject = useMutation({
    mutationFn: async (id) => api.delete(`/psr-projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["psr-projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setDeleteTarget(null);
    },
  });

  function openNewForm() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, category: tab });
    setError("");
    setFormOpen(true);
  }

  function openEditForm(project) {
    setEditingId(project.id);
    setForm({
      project_name: project.project_name || "",
      category: project.category || CATEGORIES[0],
      grantor: project.grantor || "",
      funding_source: project.funding_source || "",
      ad_number: project.ad_number || "",
      district: project.district ?? "",
      grant_manager: project.grant_manager || "",
      performance_end_date: project.performance_end_date || "",
      link: project.link || "",
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
    saveProject.mutate({
      project_name: form.project_name.trim(),
      category: form.category,
      grantor: form.grantor.trim() || null,
      funding_source: form.funding_source.trim() || null,
      ad_number: form.ad_number.trim() || null,
      district: form.district === "" ? null : parseInt(form.district, 10),
      grant_manager: form.grant_manager.trim() || null,
      performance_end_date: form.performance_end_date || null,
      link: form.link.trim() || null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-gray-200">
        {CATEGORIES.map((cat) => {
          const count = items.filter((p) => p.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => switchTab(cat)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
                tab === cat ? "border-accent text-accent-dark" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {cat} <span className="text-xs text-gray-400">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{filteredItems.length} of {tabItems.length} projects</span>
          <p className="text-xs text-gray-400">Tip: click the ▼ icon on a column header to filter.</p>
          {activeFilterCount > 0 && (
            <button onClick={() => setColumnFilters({})} className="text-xs text-accent hover:underline">
              Clear filters ({activeFilterCount})
            </button>
          )}
        </div>
        {canEdit && (
          <button
            onClick={openNewForm}
            className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            + New Project
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-2.5 font-medium">Project Name</th>
                <th className="px-5 py-2.5 font-medium whitespace-nowrap">
                  Grant Manager
                  <ColumnFilterMenu
                    options={columnOptions.grant_manager}
                    selected={columnFilters.grant_manager || []}
                    onChange={(values) => setColumnFilter("grant_manager", values)}
                  />
                </th>
                <th className="px-5 py-2.5 font-medium whitespace-nowrap">
                  District
                  <ColumnFilterMenu
                    options={columnOptions.district}
                    selected={columnFilters.district || []}
                    onChange={(values) => setColumnFilter("district", values)}
                  />
                </th>
                <th className="px-5 py-2.5 font-medium">Performance End Date</th>
                <th className="px-5 py-2.5 font-medium">Next PSR Due</th>
                <th className="px-5 py-2.5 font-medium">Link</th>
                <th className="px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                    {tabItems.length === 0 ? "No projects in this category yet." : "No projects match these filters."}
                  </td>
                </tr>
              )}
              {filteredItems.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-2.5 font-medium text-[#1F2937] whitespace-nowrap">{p.project_name}</td>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{p.grant_manager || "—"}</td>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{p.district ?? "—"}</td>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(p.performance_end_date)}</td>
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    <DueBadge project={p} />
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    {p.link ? (
                      <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-sm">
                        Open ↗
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    <button onClick={() => setDetailProject(p)} className="text-accent hover:underline text-sm mr-3">
                      Details
                    </button>
                    {canEdit && (
                      <button onClick={() => openEditForm(p)} className="text-accent hover:underline text-sm mr-3">
                        Edit
                      </button>
                    )}
                    {isAdmin && (
                      <button onClick={() => setDeleteTarget(p)} className="text-status-withdrawn hover:underline text-sm">
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={formOpen} title={editingId ? "Edit Project" : "New Project"} onClose={closeForm}>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
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
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">AD Number</label>
              <input
                type="text"
                value={form.ad_number}
                onChange={(e) => setForm((f) => ({ ...f, ad_number: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
              <input
                type="number"
                value={form.district}
                onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grant Manager</label>
              <input
                type="text"
                value={form.grant_manager}
                onChange={(e) => setForm((f) => ({ ...f, grant_manager: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Performance End Date</label>
            <input
              type="date"
              value={form.performance_end_date}
              onChange={(e) => setForm((f) => ({ ...f, performance_end_date: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link</label>
            <input
              type="text"
              value={form.link}
              onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
              placeholder="https://…"
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
              disabled={saveProject.isPending}
              className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-1.5 rounded-md disabled:opacity-60"
            >
              {editingId ? "Save Changes" : "Add Project"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} title="Delete this project?" onClose={() => setDeleteTarget(null)}>
        <p className="text-sm text-gray-600 mb-5">
          This permanently deletes <strong>{deleteTarget?.project_name}</strong>, including its PSR due dates and
          notes. (A record remains in the admin Change Log and it can be restored from there.)
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={() => deleteProject.mutate(deleteTarget.id)}
            className="bg-status-withdrawn hover:opacity-90 text-white text-sm font-medium px-4 py-1.5 rounded-md"
          >
            Delete
          </button>
        </div>
      </Modal>

      <ProjectDetailModal
        project={detailProject ? items.find((p) => p.id === detailProject.id) || detailProject : null}
        canEdit={canEdit}
        onClose={() => setDetailProject(null)}
      />
    </div>
  );
}

function ProjectDetailModal({ project, canEdit, onClose }) {
  const queryClient = useQueryClient();
  const [newDueDate, setNewDueDate] = useState("");
  const [noteText, setNoteText] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["psr-projects"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const addDueDate = useMutation({
    mutationFn: async () => (await api.post(`/psr-projects/${project.id}/due-dates`, { due_date: newDueDate })).data,
    onSuccess: () => {
      setNewDueDate("");
      invalidate();
    },
  });

  const toggleSubmitted = useMutation({
    mutationFn: async (due) =>
      (
        await api.patch(`/psr-projects/${project.id}/due-dates/${due.id}`, {
          submitted: !due.submitted,
          submitted_date: !due.submitted ? new Date().toISOString().slice(0, 10) : null,
        })
      ).data,
    onSuccess: invalidate,
  });

  const removeDueDate = useMutation({
    mutationFn: async (dueId) => (await api.delete(`/psr-projects/${project.id}/due-dates/${dueId}`)).data,
    onSuccess: invalidate,
  });

  const addNote = useMutation({
    mutationFn: async () => (await api.post(`/psr-projects/${project.id}/notes`, { note_text: noteText })).data,
    onSuccess: () => {
      setNoteText("");
      invalidate();
    },
  });

  if (!project) return null;

  return (
    <Modal open={!!project} title={project.project_name} onClose={onClose}>
      <div className="space-y-5 max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">Category:</span> {project.category}</div>
          <div><span className="text-gray-500">Grantor:</span> {project.grantor || "—"}</div>
          <div><span className="text-gray-500">Funding Source:</span> {project.funding_source || "—"}</div>
          <div><span className="text-gray-500">AD Number:</span> {project.ad_number || "—"}</div>
          <div><span className="text-gray-500">District:</span> {project.district ?? "—"}</div>
          <div><span className="text-gray-500">Grant Manager:</span> {project.grant_manager || "—"}</div>
          <div><span className="text-gray-500">Performance End Date:</span> {formatDate(project.performance_end_date)}</div>
          <div>
            <span className="text-gray-500">Link:</span>{" "}
            {project.link ? (
              <a href={project.link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                Open ↗
              </a>
            ) : (
              "—"
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">PSR Due Dates</h3>
          <div className="space-y-1.5">
            {(project.due_dates || []).length === 0 && <p className="text-sm text-gray-400">No due dates yet.</p>}
            {(project.due_dates || []).map((d) => (
              <div key={d.id} className="flex items-center justify-between border border-gray-100 rounded-md px-3 py-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={d.submitted}
                    disabled={!canEdit}
                    onChange={() => toggleSubmitted.mutate(d)}
                    className="rounded border-gray-300 text-accent focus:ring-accent"
                  />
                  <span className={d.submitted ? "line-through text-gray-400" : "text-[#1F2937]"}>{formatDate(d.due_date)}</span>
                  {d.submitted && d.submitted_date && (
                    <span className="text-xs text-gray-400">(submitted {formatDate(d.submitted_date)})</span>
                  )}
                </div>
                {canEdit && (
                  <button onClick={() => removeDueDate.mutate(d.id)} className="text-xs text-status-withdrawn hover:underline">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="flex gap-2 mt-2">
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
              <button
                onClick={() => newDueDate && addDueDate.mutate()}
                disabled={!newDueDate || addDueDate.isPending}
                className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-3 py-1.5 rounded-md disabled:opacity-60"
              >
                Add Due Date
              </button>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Update Notes</h3>
          <div className="space-y-2">
            {(project.notes || []).length === 0 && <p className="text-sm text-gray-400">No notes yet.</p>}
            {(project.notes || []).map((n) => (
              <div key={n.id} className="border-b border-gray-50 pb-2">
                <div className="text-xs text-gray-400">{n.author_name} — {new Date(n.created_at).toLocaleDateString()}</div>
                <div className="text-sm text-[#1F2937]">{n.note_text}</div>
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add an update note…"
                className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
              <button
                onClick={() => noteText.trim() && addNote.mutate()}
                disabled={!noteText.trim() || addNote.isPending}
                className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-3 py-1.5 rounded-md disabled:opacity-60"
              >
                Add Note
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
