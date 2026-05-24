"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { logout } from "@/lib/api";

export default function Navbar() {
  const [role, setRole] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [division, setDivision] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setRole(localStorage.getItem("role"));
    setUsername(localStorage.getItem("username"));
    setDivision(localStorage.getItem("division"));
  }, []);

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/projects", label: "Projects" },
    { href: "/budgets", label: "Budgets" },
    { href: "/customers", label: "Customers" },
  ];

  return (
    <nav className="w-full bg-white border-b shadow-sm sticky top-0 z-50">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6">

        {/* Main row */}
        <div className="h-14 flex items-center justify-between gap-4">

          {/* LEFT – Logo + Brand + Desktop Nav */}
          <div className="flex items-center gap-6 min-w-0">

            {/* Logo + Brand */}
            <div className="flex items-center gap-2 shrink-0">
              <img
                src="/Logo.svg"
                alt="Starcom"
                width={28}
                height={28}
                className="object-contain"
              />
              <span className="font-bold text-[15px] tracking-tight leading-none text-gray-900">
                Sales<span className="text-[#2F318B]">Dashboard</span>
              </span>
            </div>

            {/* Divider */}
            <div className="hidden md:block h-5 w-px bg-gray-200 shrink-0" />

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/leadgen"
                className="ml-1 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-sm font-semibold"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                Lead Gen
              </Link>
              {role === "admin" && (
                <Link
                  href="/users"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  Users
                </Link>
              )}
            </div>
          </div>

          {/* RIGHT – User info + Logout (desktop) + Hamburger (mobile) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* User info – desktop only */}
            {username && (
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-sm font-medium text-gray-900">{username}</span>
                <span className="text-xs text-gray-400">{division}</span>
              </div>
            )}

            {/* Logout – desktop only */}
            <button
              onClick={logout}
              className="hidden sm:block px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 text-sm text-gray-600 transition-colors"
            >
              Logout
            </button>

            {/* Hamburger – mobile only */}
            <button
              className="md:hidden p-2 rounded-md hover:bg-gray-100 text-gray-600"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileOpen && (
          <div className="md:hidden border-t py-2 pb-4 space-y-0.5">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="block px-3 py-2.5 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                onClick={() => setMobileOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/leadgen"
              className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              onClick={() => setMobileOpen(false)}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Lead Gen
            </Link>
            {role === "admin" && (
              <Link
                href="/users"
                className="block px-3 py-2.5 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                onClick={() => setMobileOpen(false)}
              >
                Users
              </Link>
            )}

            {/* User info + Logout */}
            <div className="pt-3 mt-2 border-t space-y-2 px-3">
              {username && (
                <div>
                  <div className="text-sm font-medium text-gray-900">{username}</div>
                  <div className="text-xs text-gray-500">{division}</div>
                </div>
              )}
              <button
                onClick={logout}
                className="w-full px-3 py-2 border border-gray-200 rounded-md hover:bg-gray-50 text-sm text-gray-600 text-left"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
