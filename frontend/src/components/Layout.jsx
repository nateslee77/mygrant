import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", exact: true },
  { to: "/grants", label: "All Grants" },
];

const PAGE_TITLES = {
  "/": "Dashboard",
  "/grants": "All Grants",
  "/admin": "Admin",
};

function pageTitleFor(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith("/grants/")) return "Grant Detail";
  return "";
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="flex h-screen bg-[#F8F9FA] text-[#1F2937]">
      <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="font-semibold text-sm leading-tight">LA County Parks</div>
          <div className="text-xs text-gray-500">Grants Management</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-medium ${
                  isActive ? "bg-accent-light text-accent-dark" : "text-gray-600 hover:bg-gray-50"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          {user?.role === "admin" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-medium ${
                  isActive ? "bg-accent-light text-accent-dark" : "text-gray-600 hover:bg-gray-50"
                }`
              }
            >
              Admin
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <h1 className="text-lg font-semibold">{pageTitleFor(location.pathname)}</h1>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <UserMenu user={user} logout={logout} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function UserMenu({ user, logout }) {
  return (
    <div className="relative group">
      <button className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-gray-100">
        <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-sm font-semibold">
          {user?.name?.[0]?.toUpperCase() || "?"}
        </div>
        <span className="text-sm font-medium text-gray-700">{user?.name}</span>
      </button>
      <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 hidden group-hover:block z-50">
        <div className="px-3 py-1.5 text-xs text-gray-400 capitalize">{user?.role}</div>
        <button
          onClick={logout}
          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
