"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";

type AuthGuardProps = {
  children: ReactNode;
  requireAdmin?: boolean;
  requirePermission?: string;
};

export function AuthGuard({ children, requireAdmin, requirePermission }: AuthGuardProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    apiGet<{ role: string; role_key?: string; level?: string; permissions?: string[] }>("/me")
      .then((me) => {
        if (
          requireAdmin &&
          me.role_key !== "system_admin" &&
          me.level !== "system_admin"
        ) {
          router.replace("/dashboard");
          return;
        }
        if (requirePermission && !me.permissions?.includes(requirePermission)) {
          router.replace("/dashboard");
          return;
        }
        setChecking(false);
      })
      .catch(() => router.replace("/login"));
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
