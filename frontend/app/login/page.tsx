"use client";

import { useState } from "react";
import { login } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await login(username, password);

      // backend returns: { token, role, division, username }
      localStorage.setItem("token", res.token);
      localStorage.setItem("role", res.role);
      localStorage.setItem("division", res.division);
      localStorage.setItem("username", res.username);

      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border overflow-hidden">
          <div className="px-8 py-6 border-b bg-gradient-to-r from-blue-600 to-indigo-600">
            <div className="flex items-center gap-3">
              {/* LOGO */}
              <img
                src="/Logo.svg"   // atau logo.png versi putih
                alt="Sales System"
                className="h-9 w-9 object-contain"
              />

              {/* TITLE */}
              <div className="flex flex-col leading-none">
                <h1 className="text-white text-lg font-semibold tracking-tight">
                  Sales Dashboard System
                </h1>
                <p className="text-white/80 text-[11px] mt-0.5">
                  Sign in to continue
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleLogin} className="px-8 py-7 space-y-4">
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium">Username</label>
              <input
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="e.g. admin"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600"
            >
              {loading ? "Signing in..." : "Login"}
            </button>

            <div className="text-xs text-gray-500 pt-2">
              If you have issues logging in, contact admin.
            </div>
          </form>
        </div>

        <div className="text-center text-xs text-gray-500 mt-4">
          © {new Date().getFullYear()} Starcoms - Sales Dashboard System
        </div>
      </div>
    </div>
  );
}
