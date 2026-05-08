import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { clearSession } from "../auth/store";
import { useUser } from "../auth/useUser";

type Props = { children: ReactNode };

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive
      ? "bg-slate-900 text-white"
      : "text-slate-700 hover:bg-slate-200"
  }`;

export function Shell({ children }: Props) {
  const user = useUser();
  const navigate = useNavigate();

  async function handleLogout(): Promise<void> {
    try {
      await api.logout();
    } catch {
      // logout is server-side optional; clearing the local session is enough
    }
    clearSession();
    navigate("/login");
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-2">
          <Link to="/" className="font-semibold text-slate-900 mr-auto">
            Service Status
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" className={navLinkClass} end>
              Status
            </NavLink>
            <NavLink to="/subscribe" className={navLinkClass}>
              Subscribe
            </NavLink>
            {user && (
              <NavLink to="/send" className={navLinkClass}>
                Send
              </NavLink>
            )}
            {user?.role === "admin" && (
              <NavLink to="/admin" className={navLinkClass}>
                Admin
              </NavLink>
            )}
            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="ml-2 text-sm text-slate-600 hover:text-slate-900"
              >
                Sign out ({user.display_name})
              </button>
            ) : (
              <NavLink to="/login" className={navLinkClass}>
                Sign in
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
