import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { AdminRoute, ProtectedRoute } from "./components/ProtectedRoute";
import Admin from "./pages/Admin";
import AllGrants from "./pages/AllGrants";
import Dashboard from "./pages/Dashboard";
import GrantDetail from "./pages/GrantDetail";
import GrantsAwarded from "./pages/GrantsAwarded";
import Login from "./pages/Login";
import NewGrant from "./pages/NewGrant";
import PhotoTemplate from "./pages/PhotoTemplate";
import PropertyLookup from "./pages/PropertyLookup";
import SetPassword from "./pages/SetPassword";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/grants" element={<AllGrants />} />
          <Route path="/grants/new" element={<NewGrant />} />
          <Route path="/grants/:id" element={<GrantDetail />} />
          <Route path="/grants-awarded" element={<GrantsAwarded />} />
          <Route path="/property-lookup" element={<PropertyLookup />} />
          <Route path="/photo-template" element={<PhotoTemplate />} />

          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
