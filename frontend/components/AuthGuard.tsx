"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

type AuthGuardProps = {
  children: ReactNode;
  requireAdmin?: boolean;
  requirePermission?: string;
};

export function AuthGuard({ children, requireAdmin, requirePermission }: AuthGuardProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();

    if (!token) {
      // belum login → ke /login
      router.replace("/login");
      return;
    }

    // cek role dari localStorage (diset waktu login)
    const role = typeof window !== "undefined" ? localStorage.getItem("role") : null;

    if (requireAdmin && role !== "admin") {
      // kalau butuh admin tapi bukan admin → lempar ke dashboard
      router.replace("/dashboard");
      return;
    }

    if (requirePermission) {
      const permissions: string[] = JSON.parse(
        (typeof window !== "undefined" ? localStorage.getItem("permissions") : null) || "[]"
      );
      if (!permissions.includes(requirePermission)) {
        router.replace("/dashboard");
        return;
      }
    }

    setChecking(false);
  }, [router, requireAdmin, requirePermission]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Checking access...
      </div>
    );
  }

  return <>{children}</>;
}
