import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import CollapsibleSection from "../components/CollapsibleSection";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { useCappedList } from "../lib/useCappedList";

const ACTION_LABELS = {
  created_grant: "Created grant",
  updated_grant: "Updated grant",
  deleted_grant: "Deleted grant",
  updated_sharepoint_link: "Updated SharePoint link",
  added_note: "Added update note",
  deleted_note: "Deleted update note",
  restored_grant: "Restored grant",
  restored_note: "Restored update note",
  created_award: "Created grant award",
  updated_award: "Updated grant award",
  deleted_award: "Deleted grant award",
  restored_award: "Restored grant award",
  created_deed_restriction: "Created deed restriction",
  updated_deed_restriction: "Updated deed restriction",
  deleted_deed_restriction: "Deleted deed restriction",
  restored_deed_restriction: "Restored deed restriction",
  created_psr_project: "Created status report project",
  updated_psr_project: "Updated status report project",
  deleted_psr_project: "Deleted status report project",
  restored_psr_project: "Restored status report project",
  added_psr_due_date: "Added PSR due date",
  updated_psr_due_date: "Updated PSR due date",
  deleted_psr_due_date: "Deleted PSR due date",
  added_psr_note: "Added status report note",
  deleted_psr_note: "Deleted status report note",
  invited_user: "Invited user",
  changed_role: "Changed user role",
  deactivated_user: "Deactivated user",
  deleted_user_account: "Deleted user account",
};

const RESTORABLE_ACTIONS = new Set([
  "deleted_grant",
  "deleted_note",
  "deleted_award",
  "deleted_deed_restriction",
  "deleted_psr_project",
]);

const CATEGORY_STYLES = {
  created: "bg-status-active/10 text-status-active",
  updated: "bg-accent-light text-accent-dark",
  deleted: "bg-status-withdrawn/10 text-status-withdrawn",
  restored: "bg-purple-100 text-purple-700",
  other: "bg-gray-100 text-gray-600",
};

function categoryFor(action) {
  if (action.startsWith("created_") || action.startsWith("added_") || action === "invited_user") return "created";
  if (action.startsWith("updated_") || action === "changed_role") return "updated";
  if (action.startsWith("deleted_") || action === "deactivated_user") return "deleted";
  if (action.startsWith("restored_")) return "restored";
  return "other";
}

function fieldLabel(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtVal(v) {
  return v === null || v === undefined || v === "" ? "(blank)" : String(v);
}

// Every change is normalized to { field, after, before? } so the table can render
// a consistent "Field: before → after" (or "Field: value" when there's no before)
// regardless of which action produced it.
function describeEntry(entry) {
  const label = ACTION_LABELS[entry.action] || entry.action;
  const detail = entry.detail || {};
  const subject =
    entry.grant_project_name ||
    detail.project_name ||
    detail.after?.project_name ||
    detail.email ||
    detail.name ||
    null;

  const UPDATE_ACTIONS = ["updated_grant", "updated_award", "updated_deed_restriction", "updated_psr_project"];
  if (UPDATE_ACTIONS.includes(entry.action) && detail.after) {
    const before = detail.before || {};
    const after = detail.after;
    const changes = Object.keys(after)
      .filter((key) => key !== "project_name")
      .map((key) => ({ field: fieldLabel(key), before: fmtVal(before[key]), after: fmtVal(after[key]) }));
    return { label, subject, changes };
  }

  if (entry.action === "updated_sharepoint_link") {
    return { label, subject, changes: [{ field: "SharePoint Link", before: fmtVal(detail.before), after: fmtVal(detail.after) }] };
  }

  const CREATE_ACTIONS = ["created_grant", "created_award", "created_deed_restriction", "created_psr_project"];
  if (CREATE_ACTIONS.includes(entry.action) && detail.after) {
    const after = detail.after;
    const changes = Object.keys(after)
      .filter((key) => key !== "project_name" && after[key] !== null && after[key] !== "" && after[key] !== undefined)
      .map((key) => ({ field: fieldLabel(key), after: fmtVal(after[key]) }));
    return { label, subject, changes };
  }

  if (entry.action === "changed_role" && detail.before !== undefined) {
    return { label, subject, changes: [{ field: "Role", before: fmtVal(detail.before), after: fmtVal(detail.after) }] };
  }

  if (entry.action === "invited_user") {
    return { label, subject: detail.email, changes: [{ field: "Role", after: fmtVal(detail.role) }] };
  }

  if (entry.action === "deleted_user_account") {
    return {
      label,
      subject: detail.name || detail.email,
      changes: [
        { field: "Email", after: fmtVal(detail.email) },
        { field: "Role", after: fmtVal(detail.role) },
      ],
    };
  }

  if (
    ["added_note", "deleted_note", "restored_note", "added_psr_note", "deleted_psr_note"].includes(entry.action) &&
    detail.note_text
  ) {
    const text = detail.note_text.length > 100 ? `${detail.note_text.slice(0, 100)}…` : detail.note_text;
    return { label, subject, changes: [{ field: "Note", after: `"${text}"` }] };
  }

  if (["added_psr_due_date", "deleted_psr_due_date"].includes(entry.action) && detail.due_date) {
    return { label, subject, changes: [{ field: "Due Date", after: fmtVal(detail.due_date) }] };
  }

  if (entry.action === "updated_psr_due_date" && detail.changes) {
    const changes = Object.entries(detail.changes).map(([key, value]) => ({ field: fieldLabel(key), after: fmtVal(value) }));
    return { label, subject, changes };
  }

  if (entry.action.startsWith("restored_")) {
    const changes = [];
    if (detail.notes_restored !== undefined) changes.push({ field: "Notes restored", after: fmtVal(detail.notes_restored) });
    changes.push({ field: "Restored from", after: "a deletion logged earlier in this Change Log" });
    return { label, subject, changes };
  }

  // Fallback for deletions: show the non-empty fields captured in the snapshot
  // so there's still a record of what was removed.
  if (detail.snapshot) {
    const snap = detail.snapshot;
    const changes = Object.keys(snap)
      .filter((key) => key !== "project_name" && key !== "created_at" && snap[key] !== null && snap[key] !== "")
      .map((key) => ({ field: fieldLabel(key), after: fmtVal(snap[key]) }));
    return { label, subject, changes };
  }

  return { label, subject, changes: [] };
}

const USER_STATUS_STYLES = {
  invited: "bg-gray-100 text-gray-600",
  active: "bg-status-active/10 text-status-active",
  deactivated: "bg-status-withdrawn/10 text-status-withdrawn",
};

const ROLE_OPTIONS = ["viewer", "editor", "admin"];

export default function Admin() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await api.get("/admin/users")).data,
  });

  const { data: auditLog } = useQuery({
    queryKey: ["admin-audit-log"],
    queryFn: async () => (await api.get("/admin/audit-log", { params: { page_size: 200 } })).data,
  });
  const auditItems = auditLog?.items || [];
  const {
    visibleItems: visibleAuditItems,
    expanded: auditExpanded,
    hasMore: auditHasMore,
    remainingCount: auditRemainingCount,
    toggle: toggleAuditExpanded,
  } = useCappedList(auditItems, 10);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteError, setInviteError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteLinkRole, setInviteLinkRole] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [confirmAdminOpen, setConfirmAdminOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [restoreError, setRestoreError] = useState("");

  const restoreEntry = useMutation({
    mutationFn: async (entryId) => (await api.post(`/admin/audit-log/${entryId}/restore`)).data,
    onSuccess: () => {
      setRestoreError("");
      queryClient.invalidateQueries({ queryKey: ["admin-audit-log"] });
      queryClient.invalidateQueries({ queryKey: ["grants"] });
      queryClient.invalidateQueries({ queryKey: ["grants-filter-options"] });
    },
    onError: (err) => {
      setRestoreError(err.response?.data?.detail || "Failed to restore");
    },
  });

  const invite = useMutation({
    mutationFn: async ({ email, role }) => (await api.post("/admin/users/invite", { email, role })).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setInviteLink(data.invite_link);
      setInviteLinkRole(data.role);
      setLinkCopied(false);
      setInviteEmail("");
      setInviteRole("viewer");
      setInviteError("");
    },
    onError: (err) => {
      setInviteError(err.response?.data?.detail || "Failed to generate invite link");
      setInviteLink("");
    },
  });

  function copyInviteLink() {
    navigator.clipboard.writeText(inviteLink);
    setLinkCopied(true);
  }

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }) => (await api.patch(`/admin/users/${userId}/role`, { role })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const deactivate = useMutation({
    mutationFn: async (userId) => (await api.patch(`/admin/users/${userId}/deactivate`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDeactivateTarget(null);
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (userId) => api.delete(`/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-log"] });
      setDeleteTarget(null);
      setDeleteError("");
    },
    onError: (err) => {
      setDeleteError(err.response?.data?.detail || "Failed to delete user");
    },
  });

  function submitInvite(e) {
    e.preventDefault();
    setInviteError("");
    setInviteLink("");
    if (inviteRole === "admin") {
      setConfirmAdminOpen(true);
      return;
    }
    invite.mutate({ email: inviteEmail, role: inviteRole });
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 mb-4">Invite User</h2>
        <form onSubmit={submitInvite} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              placeholder="name@parks.lacounty.gov"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={invite.isPending}
            className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-60"
          >
            Generate Invite Link
          </button>
        </form>
        {inviteError && <div className="text-sm text-status-withdrawn mt-2">{inviteError}</div>}
        {inviteLink && (
          <div className="mt-4 border border-gray-200 rounded-md p-3 bg-gray-50">
            <div className="text-xs text-gray-500 mb-1.5">
              Invite link ({inviteLinkRole[0]?.toUpperCase() + inviteLinkRole.slice(1)}) — expires in 72 hours:
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                onFocus={(e) => e.target.select()}
                className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm font-mono bg-white"
              />
              <button
                onClick={copyInviteLink}
                className="shrink-0 bg-white border border-gray-300 hover:bg-gray-100 text-sm font-medium px-3 py-1.5 rounded-md"
              >
                {linkCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </div>

      <CollapsibleSection title="Users" headerExtra={<span className="text-xs text-gray-400">{users.length}</span>}>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="px-6 py-2 font-medium">Name</th>
              <th className="px-6 py-2 font-medium">Email</th>
              <th className="px-6 py-2 font-medium">Role</th>
              <th className="px-6 py-2 font-medium">Status</th>
              <th className="px-6 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-50 last:border-0">
                <td className="px-6 py-3 font-medium text-[#1F2937]">{u.name}</td>
                <td className="px-6 py-3 text-gray-600">{u.email}</td>
                <td className="px-6 py-3">
                  <select
                    value={u.role}
                    disabled={u.status === "deactivated"}
                    onChange={(e) => changeRole.mutate({ userId: u.id, role: e.target.value })}
                    className="border border-gray-300 rounded px-2 py-1 text-sm disabled:opacity-50 disabled:bg-gray-50"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r[0].toUpperCase() + r.slice(1)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-3">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${USER_STATUS_STYLES[u.status]}`}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="px-6 py-3 whitespace-nowrap">
                  {u.id === currentUser?.id ? (
                    <span className="text-xs text-gray-400">(you)</span>
                  ) : (
                    <>
                      {u.status !== "deactivated" && (
                        <button
                          onClick={() => setDeactivateTarget(u)}
                          className="text-sm text-status-withdrawn hover:underline mr-3"
                        >
                          Deactivate
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setDeleteError("");
                          setDeleteTarget(u);
                        }}
                        className="text-sm text-status-withdrawn hover:underline"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Change Log"
        headerExtra={<span className="text-xs text-gray-400">{auditItems.length}</span>}
      >
        {auditItems.length === 0 && (
          <div className="px-6 pb-6 text-sm text-gray-400">No changes recorded yet.</div>
        )}
        {restoreError && <div className="px-6 pt-4 text-sm text-status-withdrawn">{restoreError}</div>}
        {auditItems.length > 0 && (
          <>
            <div className={auditExpanded ? "max-h-[42rem] overflow-y-auto" : ""}>
              <table className="w-full max-w-full text-sm" style={{ tableLayout: "auto" }}>
                <thead className={auditExpanded ? "sticky top-0 bg-white z-10" : ""}>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2.5 font-medium w-32">When</th>
                    <th className="px-4 py-2.5 font-medium w-32">By</th>
                    <th className="px-4 py-2.5 font-medium w-64">Change</th>
                    <th className="px-4 py-2.5 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAuditItems.map((entry) => {
                    const { label, subject, changes } = describeEntry(entry);
                    const canRestore = RESTORABLE_ACTIONS.has(entry.action);
                    const category = categoryFor(entry.action);
                    return (
                      <tr key={entry.id} className="border-b border-gray-50 last:border-0 align-top hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {new Date(entry.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 font-medium text-[#1F2937] break-words">{entry.user_name}</td>
                        <td className="px-4 py-3 break-words">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${CATEGORY_STYLES[category]}`}
                          >
                            {label}
                          </span>
                          {subject && <div className="mt-1 text-sm font-medium text-[#1F2937]">{subject}</div>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 break-words">
                          {changes.length > 0 ? (
                            <ul className="space-y-1">
                              {changes.map((c, i) => (
                                <li key={i} className="text-xs leading-relaxed">
                                  <span className="text-gray-500">{c.field}: </span>
                                  {c.before !== undefined ? (
                                    <>
                                      <span className="text-gray-400 line-through">{c.before}</span>
                                      <span className="text-gray-400"> → </span>
                                      <span className="font-medium text-[#1F2937]">{c.after}</span>
                                    </>
                                  ) : (
                                    <span className="font-medium text-[#1F2937]">{c.after}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                          {canRestore && (
                            <button
                              onClick={() => restoreEntry.mutate(entry.id)}
                              disabled={restoreEntry.isPending}
                              className="mt-1.5 text-xs text-accent hover:underline font-medium disabled:opacity-50"
                            >
                              Restore
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {auditHasMore && (
              <div className="px-6 py-3 border-t border-gray-100 text-center">
                <button onClick={toggleAuditExpanded} className="text-sm text-accent hover:underline font-medium">
                  {auditExpanded ? "Show less" : `View all ${auditRemainingCount + visibleAuditItems.length} (${auditRemainingCount} more)`}
                </button>
              </div>
            )}
          </>
        )}
      </CollapsibleSection>

      <Modal open={confirmAdminOpen} title="Grant admin access?" onClose={() => setConfirmAdminOpen(false)}>
        <p className="text-sm text-gray-600 mb-5">
          You're about to invite <strong>{inviteEmail}</strong> as an <strong>Admin</strong>, which grants full
          access including user management. Are you sure?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setConfirmAdminOpen(false)}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setConfirmAdminOpen(false);
              invite.mutate({ email: inviteEmail, role: inviteRole });
            }}
            className="bg-status-withdrawn hover:opacity-90 text-white text-sm font-medium px-4 py-1.5 rounded-md"
          >
            Confirm Admin Invite
          </button>
        </div>
      </Modal>

      <Modal open={!!deactivateTarget} title="Deactivate user?" onClose={() => setDeactivateTarget(null)}>
        <p className="text-sm text-gray-600 mb-5">
          <strong>{deactivateTarget?.name}</strong> will immediately lose access to the system. This can only be
          undone by re-inviting them.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDeactivateTarget(null)}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={() => deactivate.mutate(deactivateTarget.id)}
            className="bg-status-withdrawn hover:opacity-90 text-white text-sm font-medium px-4 py-1.5 rounded-md"
          >
            Deactivate
          </button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} title="Delete user?" onClose={() => setDeleteTarget(null)}>
        <p className="text-sm text-gray-600 mb-5">
          <strong>{deleteTarget?.name}</strong> will be permanently deleted. Their notes and change-log history will
          be preserved. This cannot be undone.
        </p>
        {deleteError && <div className="text-sm text-status-withdrawn mb-3">{deleteError}</div>}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDeleteTarget(null)}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={() => deleteUser.mutate(deleteTarget.id)}
            disabled={deleteUser.isPending}
            className="bg-status-withdrawn hover:opacity-90 text-white text-sm font-medium px-4 py-1.5 rounded-md disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
