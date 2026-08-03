import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Modal from "../components/Modal";
import { api } from "../lib/api";

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

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [confirmAdminOpen, setConfirmAdminOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);

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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <h2 className="text-sm font-semibold text-gray-500 px-6 pt-6 pb-3">Users</h2>
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
