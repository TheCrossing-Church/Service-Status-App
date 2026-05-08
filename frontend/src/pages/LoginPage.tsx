import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { setSession } from "../auth/store";
import { useUser } from "../auth/useUser";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useUser();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already signed in, send them back where they came from (or to /send).
  if (user) {
    const dest =
      (location.state as { from?: string } | null)?.from ??
      (user.role === "admin" ? "/admin" : "/send");
    navigate(dest, { replace: true });
    return null;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { token, user } = await api.login(username, password);
      setSession(token, user);
      const dest =
        (location.state as { from?: string } | null)?.from ??
        (user.role === "admin" ? "/admin" : "/send");
      navigate(dest, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold mb-2">Sign in</h1>
      <p className="text-sm text-slate-500 mb-6">
        Production staff and admins only. Use your Rock RMS credentials
        when configured, or the local admin account for setup.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Username</span>
          <input
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </label>
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-slate-900 text-white font-medium py-2.5 hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
