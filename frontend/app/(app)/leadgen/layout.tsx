"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/leadgen",            label: "Overview" },
  { href: "/leadgen/agents",     label: "Run Agents" },
  { href: "/leadgen/raw-leads",  label: "Raw Leads" },
  { href: "/leadgen/outreach",   label: "Outreach" },
];

export default function LeadGenLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      {/* Sub-navigation */}
      <div className="mb-5 border-b border-gray-200">
        <div className="flex items-center gap-1 pb-0">
          <div className="flex items-center gap-2 mr-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-sm font-semibold text-gray-700">Lead Generation</span>
          </div>
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/leadgen"
                ? pathname === "/leadgen"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
