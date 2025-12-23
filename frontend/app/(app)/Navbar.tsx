"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { logout } from "@/lib/api";

export default function Navbar() {
  const [role, setRole] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [division, setDivision] = useState<string | null>(null);

  useEffect(() => {
    setRole(localStorage.getItem("role"));
    setUsername(localStorage.getItem("username"));
    setDivision(localStorage.getItem("division"));
  }, []);

  return (
    <nav className="w-full bg-white border-b shadow-sm sticky top-0 z-50">
      <div className="max-w-[1800px] mx-auto flex justify-between items-center px-6 py-3">

        {/* LEFT */}
        <div className="flex items-center gap-8">
          <span className="font-semibold text-lg tracking-tight">
            Sales Dashboard System
          </span>

          <div className="flex gap-6 text-sm font-medium">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/projects">Projects</Link>
            <Link href="/budgets">Budgets</Link>
            <Link href="/customers">Customers</Link>

            {/* 🔐 ADMIN ONLY */}
            {role === "admin" && (
              <Link href="/users">Users</Link>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-4 text-sm">
          {username && (
            <div className="text-right leading-tight">
              <div className="font-medium">{username}</div>
              <div className="text-xs text-gray-500">{division}</div>
            </div>
          )}

          <button
            onClick={logout}
            className="px-3 py-1.5 border rounded hover:bg-gray-100 text-sm"
          >
            Logout
          </button>
        </div>

      </div>
    </nav>
  );
}
