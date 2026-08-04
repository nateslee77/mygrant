import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AdminIcon, AwardIcon, CameraIcon, DashboardIcon, GrantsIcon, LinksIcon, MapPinIcon } from "./NavIcons";
import NotificationBell from "./NotificationBell";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", exact: true, Icon: DashboardIcon },
  { to: "/grants", label: "All Grants", Icon: GrantsIcon },
  { to: "/grants-awarded", label: "Grants Awarded", Icon: AwardIcon },
  { to: "/property-lookup", label: "Property Lookup", Icon: MapPinIcon },
  { to: "/photo-template", label: "Photo Summary", Icon: CameraIcon },
  { to: "/links-tools", label: "Links & Tools", Icon: LinksIcon },
];

const PAGE_TITLES = {
  "/": "Dashboard",
  "/grants": "All Grants",
  "/grants-awarded": "Grants Awarded",
  "/admin": "Admin",
  "/property-lookup": "Property Lookup",
  "/photo-template": "Photo Summary Template",
  "/links-tools": "Links & Tools",
};

function pageTitleFor(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith("/grants/")) return "Grant Detail";
  return "";
}

const SIDEBAR_STORAGE_KEY = "gms-sidebar-collapsed";

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  return (
    <div className="flex h-screen bg-[#F8F9FA] text-[#1F2937]">
      <aside
        className={`shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden transition-all duration-200 ${
          collapsed ? "w-0 border-r-0" : "w-56"
        }`}
      >
        <div className="w-56 px-5 py-5 border-b border-gray-100">
          <div className="font-semibold text-sm leading-tight">LA County Parks</div>
          <div className="text-xs text-gray-500">Grants Management</div>
        </div>
        <nav className="w-56 flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium ${
                  isActive ? "bg-accent-light text-accent-dark" : "text-gray-600 hover:bg-gray-50"
                }`
              }
            >
              <item.Icon />
              {item.label}
            </NavLink>
          ))}
          {user?.role === "admin" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium ${
                  isActive ? "bg-accent-light text-accent-dark" : "text-gray-600 hover:bg-gray-50"
                }`
              }
            >
              <AdminIcon />
              Admin
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
              aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
              title={collapsed ? "Show sidebar" : "Hide sidebar"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="10" y1="4" x2="10" y2="20" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold">{pageTitleFor(location.pathname)}</h1>
          </div>
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
