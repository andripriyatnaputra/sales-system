"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { canAccessLevel, logout } from "@/lib/api";
import {
  LayoutDashboard,
  ListTodo,
  ClipboardCheck,
  TrendingUp,
  Briefcase,
  FileText,
  Users,
  PieChart,
  ShoppingCart,
  FileCheck,
  Truck,
  Clock,
  PackageCheck,
  Receipt,
  BookOpen,
  Landmark,
  Waves,
  Wallet,
  Package,
  ScrollText,
  Building2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  KeyRound,
  Network,
  FlaskConical,
  Wrench,
  type LucideIcon,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

// Grup nav -- restrukturisasi dari ALL_LINKS/DEPARTMENT_LINKS lama (Navbar.tsx)
// jadi per-fungsi supaya scannable, BUKAN logic filtering baru. Filtering
// per departemen TETAP pakai DEPARTMENT_LINKS di bawah, sama persis.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/my-work", label: "My Work", icon: ListTodo },
      { href: "/approvals", label: "Approvals", icon: ClipboardCheck },
    ],
  },
  {
    label: "Sales & Projects",
    items: [
      { href: "/projects", label: "Projects", icon: Briefcase },
      { href: "/sales-orders", label: "Sales Orders", icon: FileText },
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/project-profitability", label: "Profitability", icon: PieChart },
    ],
  },
  {
    label: "Procurement",
    items: [
      { href: "/purchase-orders", label: "Purchase Orders", icon: FileCheck },
      { href: "/vendors", label: "Vendors", icon: Truck },
      { href: "/payment-schedules", label: "AP Aging", icon: Clock },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/purchase-requests", label: "Purchase Requests", icon: ShoppingCart },
      { href: "/bast", label: "BAST", icon: PackageCheck },
      { href: "/billing-requests", label: "META", icon: Receipt },
    ],
  },
  {
    label: "Finance & Accounting",
    items: [
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/ar-ap-aging", label: "AR/AP Aging", icon: Clock },
      { href: "/chart-of-accounts", label: "Chart of Accounts", icon: BookOpen },
      { href: "/journal-entries", label: "Jurnal Umum", icon: ScrollText },
      { href: "/balance-sheet", label: "Neraca", icon: Landmark },
      { href: "/income-statement", label: "Laba Rugi", icon: TrendingUp },
      { href: "/cash-flow-statement", label: "Arus Kas", icon: Waves },
      { href: "/cash-bank", label: "Kas & Bank", icon: Wallet },
      { href: "/budgets", label: "Budgets", icon: PieChart },
    ],
  },
  {
    label: "Non-Project Work",
    items: [
      { href: "/poc-demo-requests", label: "POC & Demo", icon: FlaskConical },
      { href: "/internal-requests", label: "Internal Dev Request", icon: Wrench },
    ],
  },
  {
    label: "Master Data",
    items: [
      { href: "/item-catalog", label: "Katalog Item/Jasa", icon: Package },
      { href: "/document-expiry", label: "Reminder Dokumen", icon: FileText },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/my-timesheets", label: "Timesheet Saya", icon: Clock },
      { href: "/hourly-rates", label: "Rate Tenaga Kerja", icon: Wallet },
    ],
  },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/users", label: "Users", icon: Users },
  { href: "/audit-logs", label: "Audit Logs", icon: ShieldCheck },
  { href: "/org-structure", label: "Org Structure", icon: Network },
];

const DEPARTMENT_LINKS: Record<string, string[]> = {
  Sales: ["/dashboard", "/my-work", "/projects", "/sales-orders", "/customers", "/project-profitability", "/document-expiry", "/my-timesheets", "/approvals", "/poc-demo-requests", "/internal-requests"],
  "Product & Development": ["/dashboard", "/my-work", "/item-catalog", "/my-timesheets", "/approvals", "/poc-demo-requests", "/internal-requests"],
  Operations: ["/dashboard", "/my-work", "/purchase-requests", "/bast", "/billing-requests", "/document-expiry", "/my-timesheets", "/approvals", "/internal-requests"],
  Procurement: ["/my-work", "/purchase-orders", "/payment-schedules", "/vendors", "/item-catalog", "/document-expiry", "/my-timesheets", "/approvals", "/internal-requests"],
  Finance: ["/my-work", "/purchase-orders", "/bast", "/invoices", "/payment-schedules", "/ar-ap-aging", "/chart-of-accounts", "/journal-entries", "/balance-sheet", "/income-statement", "/cash-flow-statement", "/cash-bank", "/budgets", "/project-profitability", "/document-expiry", "/my-timesheets", "/hourly-rates", "/approvals", "/internal-requests"],
  "HR GA & Legal": ["/document-expiry", "/my-timesheets", "/hourly-rates", "/approvals", "/internal-requests"],
};

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname?.startsWith(item.href + "/");
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function GroupSection({
  group,
  openGroups,
  toggleGroup,
  onNavigate,
}: {
  group: NavGroup;
  openGroups: Set<string>;
  toggleGroup: (label: string) => void;
  onNavigate?: () => void;
}) {
  if (group.items.length === 0) return null;
  const isOpen = openGroups.has(group.label);
  return (
    <div>
      <button
        onClick={() => toggleGroup(group.label)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
      >
        <span>{group.label}</span>
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {isOpen && (
        <div className="space-y-0.5 mt-0.5">
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  collapsed,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const [role, setRole] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [division, setDivision] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(NAV_GROUPS.map((g) => g.label))
  );

  useEffect(() => {
    setRole(localStorage.getItem("role"));
    setUsername(localStorage.getItem("username"));
    setDivision(localStorage.getItem("division"));
    setDepartment(localStorage.getItem("department"));
  }, []);

  const isAdmin = role === "admin" || role === "system_admin";
  const canSeeExecutiveDashboard = username != null && (isAdmin || canAccessLevel("gm"));
  const allowedHrefs = department ? DEPARTMENT_LINKS[department] : undefined;

  const filterItems = (items: NavItem[]) =>
    isAdmin || !allowedHrefs ? items : items.filter((i) => allowedHrefs.includes(i.href));

  const groups = NAV_GROUPS.map((g) => ({ ...g, items: filterItems(g.items) }));
  const overviewExtra: NavItem[] = canSeeExecutiveDashboard
    ? [{ href: "/executive-dashboard", label: "Dashboard Eksekutif", icon: TrendingUp }]
    : [];
  const groupsWithExtras = groups.map((g) =>
    g.label === "Overview" ? { ...g, items: [...g.items, ...overviewExtra] } : g
  );

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const renderContent = (showMobileFooter: boolean) => (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
        {groupsWithExtras.map((g) => (
          <GroupSection
            key={g.label}
            group={g}
            openGroups={openGroups}
            toggleGroup={toggleGroup}
            onNavigate={onMobileClose}
          />
        ))}

        {isAdmin && (
          <GroupSection
            group={{ label: "Admin", items: ADMIN_ITEMS }}
            openGroups={openGroups}
            toggleGroup={toggleGroup}
            onNavigate={onMobileClose}
          />
        )}
      </div>

      <div className="p-2 border-t border-sidebar-border space-y-2">
        <Link
          href="/leadgen"
          onClick={onMobileClose}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-sm font-semibold"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          Lead Gen
        </Link>

        {/* User info + Logout -- cuma di overlay mobile, desktop sudah ada di TopBar */}
        {showMobileFooter && (
          <div className="pt-2 border-t border-sidebar-border px-1 space-y-2">
            {username && (
              <div>
                <div className="text-sm font-medium text-sidebar-foreground">{username}</div>
                <div className="text-xs text-sidebar-foreground/60">{division}</div>
              </div>
            )}
            <button
              onClick={logout}
              className="w-full px-3 py-2 border border-sidebar-border rounded-md hover:bg-sidebar-accent text-sm text-sidebar-foreground/80 text-left"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside
        className={`hidden md:block shrink-0 border-r border-sidebar-border bg-sidebar sticky top-0 h-screen transition-all ${
          collapsed ? "w-0 overflow-hidden" : "w-64"
        }`}
      >
        <div className="w-64 h-full">{renderContent(false)}</div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={onMobileClose} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-sidebar border-r border-sidebar-border shadow-xl">
            {renderContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}
