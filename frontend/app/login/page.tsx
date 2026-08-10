"use client";

import { useState } from "react";
import { login } from "@/lib/api";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await login(username, password);

      // backend returns: { token, role, division, username, role_key, department, level, permissions }
      localStorage.setItem("token", res.token);
      localStorage.setItem("role", res.role);
      localStorage.setItem("division", res.division);
      localStorage.setItem("username", res.username);
      localStorage.setItem("role_key", res.role_key || "");
      localStorage.setItem("department", res.department || "");
      localStorage.setItem("level", res.level || "");
      localStorage.setItem("permissions", JSON.stringify(res.permissions || []));

      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login gagal. Periksa kembali username/password Anda.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Brand panel — desktop only */}
      <div className="hidden lg:flex lg:w-[45%] relative flex-col justify-between overflow-hidden bg-[#2F318B] px-14 py-12 text-white">
        <div
          className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #F08519 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #ffffff 0%, transparent 70%)" }}
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-2 shadow-lg">
            <img src="/Logo.svg" alt="Starcoms" className="h-full w-full object-contain" />
          </div>
          <span className="text-sm font-semibold tracking-wide text-white/90">STARCOMS</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Sales Dashboard System
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Kelola pipeline penjualan, proyek, dan laporan keuangan perusahaan
            dalam satu platform terpadu.
          </p>
          <div className="mt-8 h-1 w-12 rounded-full" style={{ background: "#F08519" }} />
        </div>

        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} Starcoms — Sales Dashboard System
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile-only compact header */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl p-2 shadow-sm"
              style={{ background: "#2F318B" }}
            >
              <img src="/Logo.svg" alt="Starcoms" className="h-full w-full object-contain" />
            </div>
            <div className="leading-none">
              <div className="text-base font-semibold tracking-tight text-slate-900">
                Sales Dashboard System
              </div>
              <div className="mt-1 text-xs text-slate-500">Starcoms</div>
            </div>
          </div>

          <div className="mb-7">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Selamat datang kembali
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Masuk dengan akun Anda untuk melanjutkan.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium text-slate-700">
                Username
              </label>
              <Input
                id="username"
                className="h-10"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="e.g. admin"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="h-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !username || !password}
              className="mt-2 w-full bg-[#2F318B] text-white hover:bg-[#25276F]"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Signing in..." : "Login"}
            </Button>

            <p className="pt-1 text-center text-xs text-slate-400">
              Ada kendala login? Hubungi admin sistem.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
