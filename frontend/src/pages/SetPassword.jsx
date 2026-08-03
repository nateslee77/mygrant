import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, setAccessToken } from "../lib/api";

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [invite, setInvite] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvalid(true);
      return;
    }
    api
      .get("/auth/invite-info", { params: { token } })
      .then(({ data }) => setInvite(data))
      .catch(() => setInvalid(true));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/set-password", { token, password });
      setAccessToken(data.access_token);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (invalid) {
    return (
      <CenteredCard>
        <h1 className="text-lg font-semibold text-[#1F2937] mb-2">Invite link invalid or expired</h1>
        <p className="text-sm text-gray-500">
          This invite link is no longer valid. Please contact an administrator to send you a new invite.
        </p>
      </CenteredCard>
    );
  }

  if (!invite) {
    return (
      <CenteredCard>
        <p className="text-sm text-gray-500">Loading…</p>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard>
      <h1 className="text-lg font-semibold text-[#1F2937] mb-1">Activate your account</h1>
      <p className="text-sm text-gray-500 mb-6">
        {invite.name} &middot; {invite.email}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
          />
        </div>

        {error && <div className="text-sm text-status-withdrawn">{error}</div>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-accent hover:bg-accent-dark text-white text-sm font-medium py-2 rounded-md disabled:opacity-60"
        >
          {submitting ? "Activating…" : "Activate Account"}
        </button>
      </form>
    </CenteredCard>
  );
}

function CenteredCard({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-8">{children}</div>
    </div>
  );
}
