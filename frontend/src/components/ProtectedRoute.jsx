import { Navigate, Outlet } from "react-router-dom";
import Spinner from "./Spinner";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function AdminRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return <Outlet />;
}

function FullScreenSpinner() {
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-3 text-gray-400 text-sm px-4">
      <Spinner className="w-6 h-6 text-accent" />
      <span>Loading…</span>
      <p className="text-xs text-gray-400 max-w-xs text-center">
        If the site hasn't been used in a while, please wait about a minute for it to wake up.
      </p>
    </div>
  );
}
