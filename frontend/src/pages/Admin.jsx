import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import CollapsibleSection from "../components/CollapsibleSection";
import Modal from "../components/Modal";
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
  invited_user: "Invited user",
  changed_role: "Changed user role",
  deactivated_user: "Deactivated user",
};

const RESTORABLE_ACTIONS = new Set(["deleted_grant", "deleted_note"]);

function fieldLabel(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function describeEntry(entry) {
  const label = ACTION_LABELS[entry.action] || entry.action;
  const subject = entry.grant_project_name || entry.detail?.project_name || entry.detail?.email || null;

  if (entry.action === "updated_grant" && entry.detail?.after) {
    const fields = Object.keys(entry.detail.after).map(fieldLabel).join(", ");
    return { label, subject, extra: fields ? `Fields changed: ${fields}` : null };
  }
  if (entry.action === "changed_role" && entry.detail) {
    return { label, subject, extra: `${entry.detail.before} → ${entry.detail.after}` };
  }
  if (entry.action === "invited_user" && entry.detail) {
    return { label, subject: entry.detail.email, extra: `Role: ${entry.detail.role}` };
  }
  if (
    (entry.action === "added_note" || entry.action === "deleted_note" || entry.action === "restored_note") &&
    entry.detail?.note_text
  ) {
    return { label, subject, extra: `"${entry.detail.note_text.slice(0, 80)}${entry.detail.note_text.length > 80 ? "…" : ""}"` };
  }
  return { label, subject, extra: null };
}

const USER_STATUS_STYLES = {
  invited: "bg-gray-100 text-gray-600",
  active: "bg-status-active/10 text-status-active",
  deactivated: "bg-status-withdrawn/10 text-status-withdrawn",
};

const ROLE_OPTIONS = ["viewer", "editor", "admin"];

export default function Admin() {
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
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [confirmAdminOpen, setConfirmAdminOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setInviteEmail("");
      setInviteRole("viewer");
      setInviteSuccess("Invite sent.");
      setInviteError("");
    },
    onError: (err) => {
      setInviteError(err.response?.data?.detail || "Failed to send invite");
      setInviteSuccess("");
    },
  });

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

  function submitInvite(e) {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess("");
    if (inviteRole === "admin") {
      setConfirmAdminOpen(true);
      return;
    }
    invite.mutate({ email: inviteEmail, role: inviteRole });
  }

  return (
    <div className="space-y-6 max-w-4xl">
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
            Send Invite
          </button>
        </form>
        {inviteError && <div className="text-sm text-status-withdrawn mt-2">{inviteError}</div>}
        {inviteSuccess && <div className="text-sm text-status-active mt-2">{inviteSuccess}</div>}
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
                <td className="px-6 py-3">
                  {u.status !== "deactivated" && (
                    <button
                      onClick={() => setDeactivateTarget(u)}
                      className="text-sm text-status-withdrawn hover:underline"
                    >
                      Deactivate
                    </button>
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
            <div className={`overflow-x-auto ${auditExpanded ? "max-h-[32rem] overflow-y-auto" : ""}`}>
              <table className="w-full text-sm">
                <thead className={auditExpanded ? "sticky top-0 bg-white z-10" : ""}>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                    <th className="px-6 py-2 font-medium">When</th>
                    <th className="px-6 py-2 font-medium">By</th>
                    <th className="px-6 py-2 font-medium">Action</th>
                    <th className="px-6 py-2 font-medium">Details</th>
                    <th className="px-6 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAuditItems.map((entry) => {
                    const { label, subject, extra } = describeEntry(entry);
                    const canRestore = RESTORABLE_ACTIONS.has(entry.action);
                    return (
                      <tr key={entry.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-6 py-3 text-gray-500 whitespace-nowrap">
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-3 font-medium text-[#1F2937] whitespace-nowrap">{entry.user_name}</td>
                        <td className="px-6 py-3 text-gray-700 whitespace-nowrap">
                          {label}
                          {subject && <span className="text-gray-500"> — {subject}</span>}
                        </td>
                        <td className="px-6 py-3 text-gray-500">{extra || "—"}</td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          {canRestore && (
                            <button
                              onClick={() => restoreEntry.mutate(entry.id)}
                              disabled={restoreEntry.isPending}
                              className="text-sm text-accent hover:underline font-medium disabled:opacity-50"
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
    </div>
  );
}
