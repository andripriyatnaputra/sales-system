"use client";

import { useEffect, useState } from "react";
import { logout } from "@/lib/api";
import { NotificationBell } from "@/components/NotificationBell";
import { PanelLeftClose, PanelLeftOpen, Menu, X } from "lucide-react";

export function TopBar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onToggleMobile,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onToggleMobile: () => void;
}) {
  const [username, setUsername] = useState<string | null>(null);
  const [division, setDivision] = useState<string | null>(null);

  useEffect(() => {
    setUsername(localStorage.getItem("username"));
    setDivision(localStorage.getItem("division"));
  }, []);

  return (
    <nav className="w-full bg-white border-b shadow-sm sticky top-0 z-40">
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* Desktop collapse toggle */}
          <button
            className="hidden md:block p-2 rounded-md hover:bg-gray-100 text-gray-600"
            onClick={onToggleCollapsed}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-md hover:bg-gray-100 text-gray-600"
            onClick={onToggleMobile}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <img src="/Logo.svg" alt="Starcom" width={28} height={28} className="object-contain" />
            <span className="font-bold text-[15px] tracking-tight leading-none text-gray-900">
              Sales<span className="text-[#2F318B]">Dashboard</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {username && <NotificationBell />}

          {username && (
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm font-medium text-gray-900">{username}</span>
              <span className="text-xs text-gray-400">{division}</span>
            </div>
          )}

          <button
            onClick={logout}
            className="hidden sm:block px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 text-sm text-gray-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
