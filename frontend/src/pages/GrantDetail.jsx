import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ExpiredBadge from "../components/ExpiredBadge";
import InlineEditField from "../components/InlineEditField";
import Modal from "../components/Modal";
import StatusPill from "../components/StatusPill";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";

const SCOPE_COLLAPSE_LENGTH = 400;

export default function GrantDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "editor";
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: grant, isLoading } = useQuery({
    queryKey: ["grant", id],
    queryFn: async () => (await api.get(`/grants/${id}`)).data,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["grant-notes", id],
    queryFn: async () => (await api.get(`/grants/${id}/notes`)).data,
    enabled: !!grant,
  });

  const updateField = useMutation({
    mutationFn: async (patch) => (await api.patch(`/grants/${id}`, patch)).data,
    onSuccess: (data) => {
      queryClient.setQueryData(["grant", id], data);
      queryClient.invalidateQueries({ queryKey: ["grants"] });
    },
  });

  const updateSharePointLink = useMutation({
    mutationFn: async (link) => (await api.patch(`/grants/${id}/sharepoint-link`, { sharepoint_link: link })).data,
    onSuccess: (data) => {
      queryClient.setQueryData(["grant", id], data);
    },
  });

  const addNote = useMutation({
    mutationFn: async (note_text) => (await api.post(`/grants/${id}/notes`, { note_text })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grant-notes", id] });
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId) => api.delete(`/grants/${id}/notes/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grant-notes", id] });
      setNoteToDelete(null);
    },
  });

  const toggleWithdrawn = useMutation({
    mutationFn: async (withdrawn) => (await api.patch(`/grants/${id}`, { withdrawn })).data,
    onSuccess: (data) => {
      queryClient.setQueryData(["grant", id], data);
      queryClient.invalidateQueries({ queryKey: ["grants"] });
    },
  });

  const deleteGrant = useMutation({
    mutationFn: async () => api.delete(`/grants/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grants"] });
      navigate("/grants");
    },
  });

  const [scopeExpanded, setScopeExpanded] = useState(false);
  const [editingSharePoint, setEditingSharePoint] = useState(false);
  const [sharePointDraft, setSharePointDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteToDelete, setNoteToDelete] = useState(null);
  const [confirmDeleteGrant, setConfirmDeleteGrant] = useState(false);

  if (isLoading || !grant) {
    return <div className="text-sm text-gray-400">Loading…</div>;
  }

  const scopeIsLong = (grant.scope || "").length > SCOPE_COLLAPSE_LENGTH;
  const scopeDisplay = !scopeIsLong || scopeExpanded ? grant.scope : `${grant.scope.slice(0, SCOPE_COLLAPSE_LENGTH)}…`;

  async function handleDownloadPdf() {
    const response = await api.get(`/grants/${id}/pdf`, { responseType: "blob" });
    const disposition = response.headers["content-disposition"] || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : `${grant.project_name}_snapshot.pdf`;

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
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-[#1F2937]">{grant.project_name}</h1>
            <StatusPill status={grant.status} />
            {grant.is_expired && <ExpiredBadge />}
            {grant.district !== null && (
              <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2.5 py-1 whitespace-nowrap">
                District {grant.district}
              </span>
            )}
          </div>
          {canEdit && (
            <div className="flex items-center gap-3 mt-1.5">
              {!grant.withdrawn && (
                <button
                  onClick={() =>
                    updateField.mutate({ status_override: grant.status === "Active" ? "closed" : "active" })
                  }
                  className="text-xs font-medium text-accent hover:underline"
                >
                  {grant.status === "Active" ? "Mark as Closed" : "Mark as Active"}
                </button>
              )}
              {!grant.withdrawn && grant.status_override && (
                <span className="text-xs text-gray-400">
                  (manually set —{" "}
                  <button
                    onClick={() => updateField.mutate({ status_override: "auto" })}
                    className="underline hover:text-gray-600"
                  >
                    reset to automatic
                  </button>
                  )
                </span>
              )}
              <button
                onClick={() => toggleWithdrawn.mutate(!grant.withdrawn)}
                className="text-xs text-gray-400 hover:text-status-withdrawn"
              >
                {grant.withdrawn ? "Un-mark as withdrawn" : "Mark as withdrawn"}
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDownloadPdf}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-md whitespace-nowrap"
          >
            Download PDF Snapshot
          </button>
          {isAdmin && (
            <button
              onClick={() => setConfirmDeleteGrant(true)}
              className="bg-white border border-gray-300 hover:bg-status-withdrawn/5 hover:border-status-withdrawn hover:text-status-withdrawn text-gray-500 text-sm font-medium px-3 py-2 rounded-md whitespace-nowrap"
              aria-label="Delete grant"
              title="Delete grant"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        <InlineEditField
          label="Grantor"
          value={grant.grantor}
          editable={canEdit}
          onSave={(v) => updateField.mutateAsync({ grantor: v })}
        />
        <InlineEditField
          label="Grants Manager"
          value={grant.grants_manager}
          editable={canEdit}
          onSave={(v) => updateField.mutateAsync({ grants_manager: v })}
        />
        <InlineEditField
          label="Funding Source / Grant Program"
          value={grant.funding_source}
          editable={canEdit}
          onSave={(v) => updateField.mutateAsync({ funding_source: v })}
        />
        <InlineEditField
          label="Program Manager"
          value={grant.program_manager}
          editable={canEdit}
          onSave={(v) => updateField.mutateAsync({ program_manager: v })}
        />
        <InlineEditField
          label="Grant Officer"
          value={grant.grant_officer}
          editable={canEdit}
          onSave={(v) => updateField.mutateAsync({ grant_officer: v })}
        />
        <InlineEditField
          label="District"
          type="number"
          value={grant.district}
          editable={canEdit}
          onSave={(v) => updateField.mutateAsync({ district: v === null ? null : parseInt(v, 10) })}
        />
        <InlineEditField
          label="Current Expiration Date"
          type="date"
          value={grant.current_exp_date}
          displayValue={formatDate(grant.current_exp_date)}
          editable={canEdit}
          onSave={(v) => updateField.mutateAsync({ current_exp_date: v })}
        />
        <InlineEditField
          label="Grant Amount"
          type="number"
          value={grant.grant_amount}
          displayValue={formatCurrency(grant.grant_amount)}
          editable={canEdit}
          onSave={(v) => updateField.mutateAsync({ grant_amount: v === null ? null : parseFloat(v) })}
        />
        <InlineEditField
          label="Original Expiration Date"
          type="date"
          value={grant.orig_exp_date}
          displayValue={formatDate(grant.orig_exp_date)}
          editable={canEdit}
          onSave={(v) => updateField.mutateAsync({ orig_exp_date: v })}
        />
        <InlineEditField
          label="Amended Expiration Date"
          type="date"
          value={grant.amended_exp_date}
          displayValue={formatDate(grant.amended_exp_date)}
          editable={canEdit}
          onSave={(v) => updateField.mutateAsync({ amended_exp_date: v })}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 mb-2">Scope</h2>
        <p className="text-[15px] leading-relaxed text-[#1F2937] whitespace-pre-wrap">{scopeDisplay || "—"}</p>
        {scopeIsLong && (
          <button
            onClick={() => setScopeExpanded((v) => !v)}
            className="text-sm text-accent hover:underline mt-2"
          >
            {scopeExpanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">SharePoint Folder Link</h2>
        {!editingSharePoint ? (
          <div className="flex items-center gap-3">
            {grant.sharepoint_link ? (
              <a
                href={grant.sharepoint_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-2 rounded-md"
              >
                Open SharePoint Folder
                <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <span className="text-sm text-gray-400">No link on file</span>
            )}
            {canEdit && (
              <button
                onClick={() => {
                  setSharePointDraft(grant.sharepoint_link || "");
                  setEditingSharePoint(true);
                }}
                className="text-gray-300 hover:text-accent"
                aria-label="Edit SharePoint link"
              >
                ✎
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={sharePointDraft}
              onChange={(e) => setSharePointDraft(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              placeholder="https://…"
            />
            <button
              onClick={async () => {
                await updateSharePointLink.mutateAsync(sharePointDraft || null);
                setEditingSharePoint(false);
              }}
              className="text-xs font-medium text-white bg-accent hover:bg-accent-dark rounded px-3 py-1.5"
            >
              Save
            </button>
            <button
              onClick={() => setEditingSharePoint(false)}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">Update History</h2>

        {canEdit && (
          <div className="mb-4 flex gap-2">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add an update…"
              rows={2}
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
            <button
              onClick={async () => {
                if (!noteDraft.trim()) return;
                await addNote.mutateAsync(noteDraft.trim());
                setNoteDraft("");
              }}
              disabled={addNote.isPending}
              className="self-start bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-60"
            >
              Add Update
            </button>
          </div>
        )}

        <div className="space-y-3">
          {notes.length === 0 && <p className="text-sm text-gray-400">No update history yet.</p>}
          {notes.map((n) => (
            <div key={n.id} className="group border-b border-gray-50 last:border-0 pb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-gray-400 mb-0.5">
                  {n.author_name} &middot; {new Date(n.created_at).toLocaleString()}
                </div>
                <div className="text-sm text-[#1F2937] whitespace-pre-wrap">{n.note_text}</div>
              </div>
              {canEdit && (
                <button
                  onClick={() => setNoteToDelete(n)}
                  className="shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-status-withdrawn transition-opacity"
                  aria-label="Delete note"
                  title="Delete note"
                >
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Modal open={!!noteToDelete} title="Delete this update?" onClose={() => setNoteToDelete(null)}>
        <p className="text-sm text-gray-600 mb-5">
          This permanently removes the note from the grant's Update History. This can't be undone (though a record
          of the deletion remains in the admin Change Log).
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setNoteToDelete(null)}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={() => deleteNote.mutate(noteToDelete.id)}
            className="bg-status-withdrawn hover:opacity-90 text-white text-sm font-medium px-4 py-1.5 rounded-md"
          >
            Delete
          </button>
        </div>
      </Modal>

      <Modal open={confirmDeleteGrant} title="Delete this grant?" onClose={() => setConfirmDeleteGrant(false)}>
        <p className="text-sm text-gray-600 mb-5">
          This permanently deletes <strong>{grant.project_name}</strong>, including its full Update History. This
          can't be undone. (A record that this grant existed and was deleted remains in the admin Change Log.)
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setConfirmDeleteGrant(false)}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={() => deleteGrant.mutate()}
            disabled={deleteGrant.isPending}
            className="bg-status-withdrawn hover:opacity-90 text-white text-sm font-medium px-4 py-1.5 rounded-md disabled:opacity-60"
          >
            Delete Grant
          </button>
        </div>
      </Modal>
    </div>
  );
}
