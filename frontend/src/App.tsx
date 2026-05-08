import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AuthGuard } from "./auth/AuthGuard";
import { useRefreshUser } from "./auth/useUser";
import { Shell } from "./components/Shell";

// Code-splitting: protected pages don't ship to anonymous status-page
// viewers (the most common audience).
const StatusPage = lazy(() => import("./pages/StatusPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SenderPage = lazy(() => import("./pages/SenderPage"));
const SubscribePage = lazy(() => import("./pages/SubscribePage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));

export default function App() {
  useRefreshUser();
  return (
    <Shell>
      <Suspense fallback={<div className="p-8 text-slate-500">Loading…</div>}>
        <Routes>
          <Route path="/" element={<StatusPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/subscribe" element={<SubscribePage />} />
          <Route
            path="/send"
            element={
              <AuthGuard role="sender">
                <SenderPage />
              </AuthGuard>
            }
          />
          <Route
            path="/admin"
            element={
              <AuthGuard role="admin">
                <AdminPage />
              </AuthGuard>
            }
          />
          <Route
            path="*"
            element={
              <div className="p-8 text-slate-500">Page not found.</div>
            }
          />
        </Routes>
      </Suspense>
    </Shell>
  );
}
