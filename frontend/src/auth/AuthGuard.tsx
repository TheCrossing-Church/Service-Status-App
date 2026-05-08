import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "./useUser";

type Props = {
  children: ReactNode;
  // If set, only allow users with this role; others get bounced to "/".
  role?: "admin" | "sender";
};

export function AuthGuard({ children, role }: Props) {
  const user = useUser();
  const location = useLocation();
  if (!user) {
    // Preserve where they were trying to go so login can bounce them back.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (role && user.role !== role && user.role !== "admin") {
    // Admins implicitly have all role gates; everyone else needs an exact match.
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
