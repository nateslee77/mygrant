import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import ColumnFilterMenu from "../components/ColumnFilterMenu";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";

const DEFAULT_CATEGORIES = [
  "RPOSD",
  "State of California NRA",
  "Conservancy (RMC,BHUWC)",
  "Cooling Amenities and Fairfax",
  "Other",
];

const EMPTY_FORM = {
  project_name: "",
  category: DEFAULT_CATEGORIES[0],
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

function latestNote(project) {
  const notes = project.notes || [];
  if (notes.length === 0) return null;
  return notes.reduce((latest, n) => (n.created_at > latest.created_at ? n : latest));
}

function NotesCell({ project }) {
  const note = latestNote(project);
  const count = (project.notes || []).length;
  if (!note) return <span className="text-gray-400">—</span>;
  const preview = note.note_text.length > 50 ? `${note.note_text.slice(0, 50)}…` : note.note_text;
  return (
    <span className="text-gray-600" title={note.note_text}>
      {preview}
      {count > 1 && <span className="text-xs text-gray-400"> (+{count - 1} more)</span>}
    </span>
  );
}

function OverdueIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="inline-block mr-1 -mt-0.5">
      <path d="M12 2 1 21h22L12 2zm0 6a1.2 1.2 0 0 1 1.2 1.2v5.2a1.2 1.2 0 0 1-2.4 0V9.2A1.2 1.2 0 0 1 12 8zm0 9.6a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z" />
    </svg>
  );
}

function dueDateBadgeStyle(due) {
  if (due.submitted) return "bg-gray-100 text-gray-400 line-through";
  const daysUntil = Math.ceil((new Date(due.due_date) - new Date(new Date().toDateString())) / 86400000);
  if (daysUntil < 0) return "bg-status-withdrawn/10 text-status-withdrawn";
  if (daysUntil <= 30) return "bg-amber-100 text-amber-700";
  return "bg-status-active/10 text-status-active";
}

function SingleDueBadge({ due }) {
  const daysUntil = Math.ceil((new Date(due.due_date) - new Date(new Date().toDateString())) / 86400000);
  const overdue = !due.submitted && daysUntil < 0;
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${dueDateBadgeStyle(due)}`}>
      {overdue && <OverdueIcon />}
      {formatDate(due.due_date)}
      {overdue ? ` — passed (${Math.abs(daysUntil)}d)` : !due.submitted && daysUntil <= 30 ? ` (${daysUntil}d)` : ""}
    </span>
  );
}

function DueBadge({ project }) {
  const dueDates = [...(project.due_dates || [])].sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));
  if (dueDates.length === 0) {
    return <span className="text-xs text-gray-400">No due date set</span>;
  }
  return (
    <div className="flex flex-col gap-1 items-start">
      {dueDates.map((d) => (
        <SingleDueBadge key={d.id} due={d} />
      ))}
    </div>
  );
}

function SortableHeader({ label, sortKey, currentSortKey, sortDir, onSort, extra }) {
  return (
    <th className="px-5 py-2.5 font-medium whitespace-nowrap">
      <span className="cursor-pointer select-none" onClick={() => onSort(sortKey)}>
        {label} {currentSortKey === sortKey && (sortDir === "asc" ? "▲" : "▼")}
      </span>
      {extra}
    </th>
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

  const allCategories = useMemo(() => {
    const extra = [...new Set(items.map((p) => p.category))].filter((c) => !DEFAULT_CATEGORIES.includes(c)).sort();
    return [...DEFAULT_CATEGORIES, ...extra];
  }, [items]);

  const [tab, setTab] = useState(DEFAULT_CATEGORIES[0]);
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState({});
  const activeFilterCount = Object.values(columnFilters).filter((v) => v && v.length > 0).length;
  const hasActiveFilters = Boolean(search) || activeFilterCount > 0;
  const [sortKey, setSortKey] = useState("project_name");
  const [sortDir, setSortDir] = useState("asc");

  const tabItems = useMemo(() => items.filter((p) => p.category === tab), [items, tab]);

  const columnOptions = useMemo(() => {
    const uniq = (key) =>
      [...new Set(tabItems.map((p) => p[key]).filter((v) => v !== null && v !== undefined && v !== ""))].sort();
    return {
      grantor: uniq("grantor"),
      grant_manager: uniq("grant_manager"),
    };
  }, [tabItems]);

  const searchedItems = useMemo(() => {
    if (!search.trim()) return tabItems;
    const q = search.trim().toLowerCase();
    return tabItems.filter((p) => {
      const fields = [p.project_name, p.grantor, p.grant_manager, p.funding_source, p.ad_number];
      if (fields.some((v) => v && v.toLowerCase().includes(q))) return true;
      return (p.notes || []).some((n) => n.note_text && n.note_text.toLowerCase().includes(q));
    });
  }, [tabItems, search]);

  const filteredItems = useMemo(() => {
    return searchedItems.filter((p) =>
      Object.entries(columnFilters).every(([key, selected]) => {
        if (!selected || selected.length === 0) return true;
        return selected.includes(p[key]);
      })
    );
  }, [searchedItems, columnFilters]);

  const sortedItems = useMemo(() => {
    const copy = [...filteredItems];
    copy.sort((a, b) => {
      let av, bv;
      if (sortKey === "next_due") {
        av = nextDueDate(a)?.due_date ?? null;
        bv = nextDueDate(b)?.due_date ?? null;
      } else if (sortKey === "performance_end_date") {
        av = a.performance_end_date;
        bv = b.performance_end_date;
      } else {
        av = (a.project_name || "").toLowerCase();
        bv = (b.project_name || "").toLowerCase();
      }
      // nulls always sort last, regardless of direction
      if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
      if (bv === null || bv === undefined) return -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filteredItems, sortKey, sortDir]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function setColumnFilter(key, values) {
    setColumnFilters((prev) => ({ ...prev, [key]: values }));
  }

  function switchTab(cat) {
    setTab(cat);
    setColumnFilters({});
    setSearch("");
  }

  function clearFilters() {
    setColumnFilters({});
    setSearch("");
  }

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pendingDueDates, setPendingDueDates] = useState([]);
  const [newPendingDueDate, setNewPendingDueDate] = useState("");
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editProject, setEditProject] = useState(null);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const createProject = useMutation({
    mutationFn: async (payload) => {
      const project = (await api.post("/psr-projects", payload)).data;
      for (const dueDate of pendingDueDates) {
        await api.post(`/psr-projects/${project.id}/due-dates`, { due_date: dueDate });
      }
      return project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["psr-projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      closeForm();
    },
    onError: (err) => setError(err.response?.data?.detail || "Failed to save"),
  });

  function addPendingDueDate() {
    if (!newPendingDueDate || pendingDueDates.includes(newPendingDueDate)) return;
    setPendingDueDates((d) => [...d, newPendingDueDate].sort());
    setNewPendingDueDate("");
  }

  function removePendingDueDate(date) {
    setPendingDueDates((d) => d.filter((x) => x !== date));
  }

  const deleteProject = useMutation({
    mutationFn: async (id) => api.delete(`/psr-projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["psr-projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setDeleteTarget(null);
    },
  });

  function openNewForm(category) {
    setForm({ ...EMPTY_FORM, category: category || tab });
    setPendingDueDates([]);
    setNewPendingDueDate("");
    setError("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setForm(EMPTY_FORM);
    setPendingDueDates([]);
    setNewPendingDueDate("");
    setError("");
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.project_name.trim()) {
      setError("Project name is required");
      return;
    }
    createProject.mutate({
      project_name: form.project_name.trim(),
      category: form.category.trim() || DEFAULT_CATEGORIES[0],
      grantor: form.grantor.trim() || null,
      funding_source: form.funding_source.trim() || null,
      ad_number: form.ad_number.trim() || null,
      district: form.district === "" ? null : parseInt(form.district, 10),
      grant_manager: form.grant_manager.trim() || null,
      performance_end_date: form.performance_end_date || null,
      link: form.link.trim() || null,
    });
  }

  function handleAddCategory(e) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setAddCategoryOpen(false);
    const cat = newCategoryName.trim();
    setNewCategoryName("");
    openNewForm(cat);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        {allCategories.map((cat) => {
          const count = items.filter((p) => p.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => switchTab(cat)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                tab === cat ? "border-accent text-accent-dark" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {cat} <span className="text-xs text-gray-400">({count})</span>
            </button>
          );
        })}
        {canEdit && (
          <button
            onClick={() => setAddCategoryOpen(true)}
            className="px-3 py-2.5 text-sm font-medium text-gray-400 hover:text-accent whitespace-nowrap"
            title="Add a grantor category"
          >
            + Add Grantor
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project, grantor, manager, AD number, notes…"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
          />
          <span className="text-xs text-gray-500 whitespace-nowrap">{filteredItems.length} of {tabItems.length} projects</span>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-accent hover:underline whitespace-nowrap">
              Clear filters
            </button>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => openNewForm(tab)}
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
                <SortableHeader label="Project Name" sortKey="project_name" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-5 py-2.5 font-medium whitespace-nowrap">
                  Grantor
                  <ColumnFilterMenu
                    options={columnOptions.grantor}
                    selected={columnFilters.grantor || []}
                    onChange={(values) => setColumnFilter("grantor", values)}
                  />
                </th>
                <th className="px-5 py-2.5 font-medium whitespace-nowrap">
                  Grant Manager
                  <ColumnFilterMenu
                    options={columnOptions.grant_manager}
                    selected={columnFilters.grant_manager || []}
                    onChange={(values) => setColumnFilter("grant_manager", values)}
                  />
                </th>
                <SortableHeader
                  label="Performance End Date"
                  sortKey="performance_end_date"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader label="PSR Due Date(s)" sortKey="next_due" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-5 py-2.5 font-medium">Notes</th>
                <th className="px-5 py-2.5 font-medium">Link</th>
                <th className="px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && sortedItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-gray-400">
                    {tabItems.length === 0 ? "No projects in this category yet." : "No projects match these filters."}
                  </td>
                </tr>
              )}
              {sortedItems.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setEditProject(p)}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-5 py-2.5 font-medium text-[#1F2937] whitespace-nowrap">{p.project_name}</td>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{p.grantor || "—"}</td>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{p.grant_manager || "—"}</td>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(p.performance_end_date)}</td>
                  <td className="px-5 py-2.5">
                    <DueBadge project={p} />
                  </td>
                  <td className="px-5 py-2.5 text-sm max-w-xs">
                    <NotesCell project={p} />
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {p.link ? (
                      <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-sm">
                        Open ↗
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditProject(p)} className="text-accent hover:underline text-sm mr-3">
                      Edit
                    </button>
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

      <Modal open={addCategoryOpen} title="Add Grantor Category" onClose={() => setAddCategoryOpen(false)}>
        <form onSubmit={handleAddCategory} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grantor / Category Name</label>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. LA84 Foundation"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
            <p className="text-xs text-gray-400 mt-1">A new tab appears once you save the first project under it.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAddCategoryOpen(false)} className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5">
              Cancel
            </button>
            <button type="submit" className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-1.5 rounded-md">
              Continue
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={formOpen} title="New Project" onClose={closeForm}>
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
            <input
              type="text"
              list="psr-categories"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
            <datalist id="psr-categories">
              {allCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
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
          <div className="grid grid-cols-2 gap-3">
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PSR Due Dates</label>
            {pendingDueDates.length > 0 && (
              <div className="space-y-1 mb-2">
                {pendingDueDates.map((d) => (
                  <div key={d} className="flex items-center justify-between border border-gray-100 rounded-md px-3 py-1.5">
                    <span className="text-sm text-[#1F2937]">{formatDate(d)}</span>
                    <button type="button" onClick={() => removePendingDueDate(d)} className="text-xs text-status-withdrawn hover:underline">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="date"
                value={newPendingDueDate}
                onChange={(e) => setNewPendingDueDate(e.target.value)}
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
              <button
                type="button"
                onClick={addPendingDueDate}
                disabled={!newPendingDueDate}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-md disabled:opacity-50"
              >
                Add Date
              </button>
            </div>
          </div>

          {error && <div className="text-sm text-status-withdrawn">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeForm} className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createProject.isPending}
              className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-1.5 rounded-md disabled:opacity-60"
            >
              Add Project
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

      <ProjectEditModal
        project={editProject ? items.find((p) => p.id === editProject.id) || editProject : null}
        allCategories={allCategories}
        canEdit={canEdit}
        onClose={() => setEditProject(null)}
      />
    </div>
  );
}

function ProjectEditModal({ project, allCategories, canEdit, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(null);
  const [fieldsError, setFieldsError] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [noteText, setNoteText] = useState("");

  const activeProject = project;

  if (activeProject && (!form || form._id !== activeProject.id)) {
    setForm({
      _id: activeProject.id,
      project_name: activeProject.project_name || "",
      category: activeProject.category || "",
      grantor: activeProject.grantor || "",
      funding_source: activeProject.funding_source || "",
      ad_number: activeProject.ad_number || "",
      district: activeProject.district ?? "",
      grant_manager: activeProject.grant_manager || "",
      performance_end_date: activeProject.performance_end_date || "",
      link: activeProject.link || "",
    });
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["psr-projects"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const saveFields = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/psr-projects/${activeProject.id}`, {
          project_name: form.project_name.trim(),
          category: form.category.trim() || activeProject.category,
          grantor: form.grantor.trim() || null,
          funding_source: form.funding_source.trim() || null,
          ad_number: form.ad_number.trim() || null,
          district: form.district === "" ? null : parseInt(form.district, 10),
          grant_manager: form.grant_manager.trim() || null,
          performance_end_date: form.performance_end_date || null,
          link: form.link.trim() || null,
        })
      ).data,
    onSuccess: () => {
      setFieldsError("");
      invalidate();
    },
    onError: (err) => setFieldsError(err.response?.data?.detail || "Failed to save"),
  });

  const addDueDate = useMutation({
    mutationFn: async () => (await api.post(`/psr-projects/${activeProject.id}/due-dates`, { due_date: newDueDate })).data,
    onSuccess: () => {
      setNewDueDate("");
      invalidate();
    },
  });

  const toggleSubmitted = useMutation({
    mutationFn: async (due) =>
      (
        await api.patch(`/psr-projects/${activeProject.id}/due-dates/${due.id}`, {
          submitted: !due.submitted,
          submitted_date: !due.submitted ? new Date().toISOString().slice(0, 10) : null,
        })
      ).data,
    onSuccess: invalidate,
  });

  const removeDueDate = useMutation({
    mutationFn: async (dueId) => (await api.delete(`/psr-projects/${activeProject.id}/due-dates/${dueId}`)).data,
    onSuccess: invalidate,
  });

  const addNote = useMutation({
    mutationFn: async () => (await api.post(`/psr-projects/${activeProject.id}/notes`, { note_text: noteText })).data,
    onSuccess: () => {
      setNoteText("");
      invalidate();
    },
  });

  if (!activeProject || !form) return null;

  const sortedDueDates = [...(activeProject.due_dates || [])].sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));

  return (
    <Modal open={!!activeProject} title={activeProject.project_name} onClose={onClose}>
      <div className="space-y-5 max-h-[70vh] overflow-y-auto">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Project Details</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Project Name</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.project_name}
                onChange={(e) => setForm((f) => ({ ...f, project_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <input
                type="text"
                list="psr-categories-edit"
                disabled={!canEdit}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-gray-50"
              />
              <datalist id="psr-categories-edit">
                {allCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Grantor</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.grantor}
                onChange={(e) => setForm((f) => ({ ...f, grantor: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Funding Source</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.funding_source}
                onChange={(e) => setForm((f) => ({ ...f, funding_source: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">District</label>
              <input
                type="number"
                disabled={!canEdit}
                value={form.district}
                onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Grant Manager</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.grant_manager}
                onChange={(e) => setForm((f) => ({ ...f, grant_manager: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Performance End Date</label>
              <input
                type="date"
                disabled={!canEdit}
                value={form.performance_end_date}
                onChange={(e) => setForm((f) => ({ ...f, performance_end_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-gray-50"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Link</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.link}
                onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                placeholder="https://…"
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-gray-50"
              />
            </div>
          </div>
          {fieldsError && <div className="text-sm text-status-withdrawn mt-2">{fieldsError}</div>}
          {canEdit && (
            <div className="flex justify-end mt-2">
              <button
                onClick={() => saveFields.mutate()}
                disabled={saveFields.isPending}
                className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-1.5 rounded-md disabled:opacity-60"
              >
                Save Changes
              </button>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">PSR Due Dates</h3>
          <div className="space-y-1.5">
            {sortedDueDates.length === 0 && <p className="text-sm text-gray-400">No due dates yet.</p>}
            {sortedDueDates.map((d) => {
              const daysUntil = Math.ceil((new Date(d.due_date) - new Date(new Date().toDateString())) / 86400000);
              const overdue = !d.submitted && daysUntil < 0;
              return (
                <div key={d.id} className="flex items-center justify-between border border-gray-100 rounded-md px-3 py-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={d.submitted}
                      disabled={!canEdit}
                      onChange={() => toggleSubmitted.mutate(d)}
                      className="rounded border-gray-300 text-accent focus:ring-accent"
                    />
                    <span className={d.submitted ? "line-through text-gray-400" : overdue ? "text-status-withdrawn font-medium" : "text-[#1F2937]"}>
                      {overdue && <OverdueIcon />}
                      {formatDate(d.due_date)}
                      {overdue ? " — passed" : ""}
                    </span>
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
              );
            })}
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
            {(activeProject.notes || []).length === 0 && <p className="text-sm text-gray-400">No notes yet.</p>}
            {(activeProject.notes || []).map((n) => (
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
