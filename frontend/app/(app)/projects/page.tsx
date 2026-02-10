"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import {
  DIVISIONS,
  PROJECT_TYPES,
  SALES_STAGES,
  SPH_STATUSES,
  STATUSES,
} from "@/lib/constants";
import {
  safeString,
  safeMonth,
  generateCsv,
  downloadBlob,
  safeNumber,
  formatIDR,
} from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { getToken, clearToken } from "@/lib/api";

/* ---------------- Types ---------------- */

type Customer = {
  id: number;
  name: string;
};

type RevenuePlanItem = {
  month: string; // "YYYY-MM"
  target_revenue: number;
};

type PostPOStatus = "Not Started" | "In Progress" | "Done";

type PostPOMonitoring = {
  stage1_status: PostPOStatus;
  stage2_status: PostPOStatus;
  stage3_status: PostPOStatus;
  stage4_status: PostPOStatus;
  stage5_status: PostPOStatus;

  stage1_date?: string | null;
  stage2_date?: string | null;
  stage3_date?: string | null;
  stage4_date?: string | null;
  stage5_date?: string | null;

  stage1_note?: string | null;
  stage2_note?: string | null;
  stage3_note?: string | null;
  stage4_note?: string | null;
  stage5_note?: string | null;
};

type Project = {
  id: number;
  project_code: string;
  description: string;
  division: string;
  status: string;
  project_type: string;
  sales_stage?: number;
  customer_id?: number | null;
  customer_name?: string | null;

  sph_status?: string | null;
  sph_release_date?: string | null;
  sph_release_status?: "Yes" | "No";
  sph_number?: string | null;

  sph_status_reason_category?: string | null;
  sph_status_reason_note?: string | null;

  // For month filtering (if backend includes it)
  revenue_plans?: RevenuePlanItem[];

  total_revenue?: number;
  total_realization?: number;
  start_month?: string | null;
  end_month?: string | null;
  
  postpo_monitoring?: PostPOMonitoring | null;
};

type ProjectWithPlans = Project & {
  revenue_plans?: RevenuePlanItem[];
};

type Me = {
  role: string;
  division: string;
};

type ProjectSummary = {
  total_projects: number;
  prospect_projects: number;
  closing_projects: number;
  in_execution_projects: number;
  completed_projects: number;
  total_target_revenue: number;
};


/* ------------- Helpers ------------- */

const normalizeSPH = (v: any): "Yes" | "No" => {
  if (!v) return "No";
  return String(v).toLowerCase() === "yes" ? "Yes" : "No";
};

const normalizeSPHStatus = (
  v: any
): "Open" | "Win" | "Hold" | "Loss" | "Drop" => {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "win") return "Win";
  if (s === "hold") return "Hold";
  if (s === "loss") return "Loss";
  if (s === "drop") return "Drop";
  return "Open";
};

/* ------------- Main Page ------------- */

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [me, setMe] = useState<Me | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string>("All");
  const [customerFilter, setCustomerFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [sphFilter, setSphFilter] = useState<string>("All");
  const [sphStatusFilter, setSphStatusFilter] = useState<
    "All" | "Open" | "Win" | "Hold" | "Loss" | "Drop"
  >("All");
  const [projectTypeFilter, setProjectTypeFilter] = useState<string>("All");
  const [salesStageFilter, setSalesStageFilter] = useState<string>("All");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");

  const [executionFilter, setExecutionFilter] =
    useState<"all" | "in_execution" | "completed">("all");

  type CardMode = "all" | "pipeline" | "closing" | "in_execution" | "completed";
  const [cardMode, setCardMode] = useState<CardMode>("all");

  // Sorting
  const [sortKey, setSortKey] =
    useState<
      | "project_code"
      | "division"
      | "status"
      | "project_type"
      | "total_revenue"
      | "total_realization"
    >("project_code");

  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingProject, setEditingProject] = useState<ProjectWithPlans | null>(
    null
  );
  const [editingRevenue, setEditingRevenue] = useState<RevenuePlanItem[]>([]);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  /* -------- Load Projects -------- */

  const loadProjects = async () => {
    try {
      setLoading(true);
      setLoadingError(null);

      const data = await apiGet<any>("/projects");
      const list: Project[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : [];

      setProjects(list);
    } catch (e: any) {
      setLoadingError(e.message || "Gagal memuat project");
    } finally {
      setLoading(false);
    }
  };

  /* -------- Load Customers for filter & modal -------- */

  const loadCustomers = async () => {
    try {
      const res = await apiGet<any>("/customers");
      const list: Customer[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.customers)
        ? res.customers
        : [];
      setCustomers(list);
    } catch (e) {
      console.error("Failed to load customers:", e);
      setCustomers([]);
    }
  };

  /* -------- Load Me (role + division) -------- */

  const loadMe = async () => {
    try {
      const res = await apiGet<any>("/me");
      setMe({
        role: String(res?.role || ""),
        division: String(res?.division || ""),
      });
    } catch {
      setMe(null);
    }
  };

  useEffect(() => {
    loadProjects();
    loadCustomers();
    loadMe();
  }, []);

  // Reset page saat filter/search berubah
  useEffect(() => {
    setPage(1);
  }, [
    divisionFilter,
    customerFilter,
    statusFilter,
    sphFilter,
    projectTypeFilter,
    salesStageFilter,
    startMonth,
    endMonth,
    search,
    executionFilter,
    cardMode,  
    sphStatusFilter,
  ]);

  const [summary, setSummary] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    apiGet<ProjectSummary>("/projects/summary").then(setSummary);
  }, []);

  /* -------- Filtering & Sorting -------- */


  // Untuk kebutuhan kartu SPH Status: hitung berdasarkan filter lain (tanpa filter SPH Status)
  const filteredSortedBaseForSphCards = useMemo(() => {
    let data = [...projects];

    // 1️⃣ Division
    if (divisionFilter !== "All") data = data.filter((p) => p.division === divisionFilter);

    // 2️⃣ Customer
    if (customerFilter !== "All") data = data.filter((p) => String(p.customer_id ?? "") === customerFilter);

    // 3️⃣ Status
    if (statusFilter !== "All") data = data.filter((p) => p.status === statusFilter);

    // 4️⃣ SPH Released
    if (sphFilter !== "All") data = data.filter((p) => normalizeSPH(p.sph_release_status) === sphFilter);

    // 5️⃣ Project Type
    if (projectTypeFilter !== "All") data = data.filter((p) => p.project_type === projectTypeFilter);

    // 6️⃣ Sales Stage
    if (salesStageFilter !== "All") data = data.filter((p) => String(p.sales_stage ?? "") === salesStageFilter);

    if (cardMode === "pipeline") {
      data = data.filter((p) => {
        const st = Number(p.sales_stage || 0);
        return st > 0 && st < 6;
      });
    }

    if (executionFilter !== "all") {
      data = data.filter((p) => {
        const m = p.postpo_monitoring;
        if (!m) return false;

        const done =
          m.stage1_status === "Done" &&
          m.stage2_status === "Done" &&
          m.stage3_status === "Done" &&
          m.stage4_status === "Done" &&
          m.stage5_status === "Done";

        return executionFilter === "completed" ? done : !done;
      });
    }

    // 7️⃣ Month Filter (Revenue Plan)
    if (startMonth || endMonth) {
      data = data.filter((p) => {
        const s = p.start_month?.slice(0, 7);
        const e = p.end_month?.slice(0, 7);

        if (!s || !e) return false;

        if (startMonth && endMonth) return !(e < startMonth || s > endMonth);
        if (startMonth) return e >= startMonth;
        if (endMonth) return s <= endMonth;
        return true;
      });
    }

    // 8️⃣ Search
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        (p) =>
          p.project_code.toLowerCase().includes(q) ||
          safeString(p.description).toLowerCase().includes(q)
      );
    }

    return data;
  }, [
    projects,
    divisionFilter,
    customerFilter,
    statusFilter,
    sphFilter,
    projectTypeFilter,
    salesStageFilter,
    startMonth,
    endMonth,
    search,
    executionFilter,
    cardMode,
    sphStatusFilter,
  ]);

  const sphCounts = useMemo(() => {
    const base = filteredSortedBaseForSphCards;
    const statuses = ["Open", "Win", "Hold", "Loss", "Drop"] as const;

    const counts: Record<string, number> = {};
    for (const st of statuses) {
      counts[st] = base.filter((p) => normalizeSPHStatus(p.sph_status) === st).length;
    }
    return counts;
  }, [filteredSortedBaseForSphCards]);

  const filteredSorted = useMemo(() => {
    let data = [...projects];

    // 1️⃣ Division
    if (divisionFilter !== "All") {
      data = data.filter((p) => p.division === divisionFilter);
    }

    // 2️⃣ Customer
    if (customerFilter !== "All") {
      data = data.filter((p) => String(p.customer_id ?? "") === customerFilter);
    }

    // 3️⃣ Status
    if (statusFilter !== "All") {
      data = data.filter((p) => p.status === statusFilter);
    }

    // 4️⃣ SPH Released
    if (sphFilter !== "All") {
      data = data.filter((p) => normalizeSPH(p.sph_release_status) === sphFilter);
    }
    
    // 4️⃣b SPH Status (Open/Win/Hold/Loss/Drop)
    if (sphStatusFilter !== "All") {
      data = data.filter((p) => normalizeSPHStatus(p.sph_status) === sphStatusFilter);
    }

    // 5️⃣ Project Type
    if (projectTypeFilter !== "All") {
      data = data.filter((p) => p.project_type === projectTypeFilter);
    }

    // 6️⃣ Sales Stage
    if (salesStageFilter !== "All") {
      data = data.filter((p) => String(p.sales_stage ?? "") === salesStageFilter);
    }

    if (cardMode === "pipeline") {
      data = data.filter((p) => {
        const st = Number(p.sales_stage || 0);
        return st > 0 && st < 6;
      });
    }

    if (executionFilter !== "all") {
      data = data.filter((p) => {
        const m = p.postpo_monitoring;
        if (!m) return false;

        const done =
          m.stage1_status === "Done" &&
          m.stage2_status === "Done" &&
          m.stage3_status === "Done" &&
          m.stage4_status === "Done" &&
          m.stage5_status === "Done";

        return executionFilter === "completed" ? done : !done;
      });
    }

    // 7️⃣ Month Filter (Revenue Plan)
    if (startMonth || endMonth) {
      data = data.filter((p) => {
        const s = p.start_month?.slice(0, 7);
        const e = p.end_month?.slice(0, 7);

        if (!s || !e) return false;

        const sMonth = s;
        const eMonth = e;

        if (startMonth && endMonth) {
          return !(eMonth < startMonth || sMonth > endMonth);
        }
        if (startMonth) {
          return eMonth >= startMonth;
        }
        if (endMonth) {
          return sMonth <= endMonth;
        }
        return true;
      });
    }

    // 8️⃣ Search
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        (p) =>
          p.project_code.toLowerCase().includes(q) ||
          safeString(p.description).toLowerCase().includes(q)
      );
    }

    // 9️⃣ Sorting
    data.sort((a, b) => {
      const av = (a as any)[sortKey] ?? "";
      const bv = (b as any)[sortKey] ?? "";

      // numeric sorting for revenue & realization
      if (sortKey === "total_revenue" || sortKey === "total_realization") {
        const na = Number(av) || 0;
        const nb = Number(bv) || 0;
        return sortDir === "asc" ? na - nb : nb - na;
      }

      // fallback string sorting
      const sa = String(av);
      const sb = String(bv);
      if (sa < sb) return sortDir === "asc" ? -1 : 1;
      if (sa > sb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return data;
  }, [
    projects,
    divisionFilter,
    customerFilter,
    statusFilter,
    sphFilter,
    projectTypeFilter,
    salesStageFilter,
    startMonth,
    endMonth,
    search,
    sortKey,
    sortDir,
    executionFilter,
    cardMode,
    sphStatusFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / pageSize));
  const paged = filteredSorted.slice((page - 1) * pageSize, page * pageSize);

  /* -------- Handlers -------- */

  const openCreateModal = () => {
    setModalMode("create");
    setEditingProject(null);
    setEditingRevenue([{ month: "", target_revenue: 0 }]);
    setModalError("");
    setModalOpen(true);
  };

  const openEditModal = async (p: Project) => {
    try {
      setModalMode("edit");
      setModalError("");

      const detail = await apiGet<any>(`/projects/${p.id}`);

      let revenue: any[] = [];
      try {
        const r = await apiGet<any>(`/projects/${p.id}/revenue-plan`);
        revenue = Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : [];
      } catch {
        revenue = [];
      }

      const merged: ProjectWithPlans = {
        ...p,
        sph_status: normalizeSPHStatus(detail.sph_status ?? p.sph_status),
        sph_release_date: detail.sph_release_date,
        sales_stage: detail.sales_stage,
        sph_release_status: detail.sph_release_status ?? p.sph_release_status,
        sph_number: detail.sph_number ?? p.sph_number,

        // ✅ TAMBAH INI
        sph_status_reason_category:
          detail.sph_status_reason_category ?? p.sph_status_reason_category,
        sph_status_reason_note:
          detail.sph_status_reason_note ?? p.sph_status_reason_note,

        revenue_plans: revenue.map((x: any) => ({
          month: x.month,
          target_revenue: x.target_revenue,
        })),
      };


      setEditingProject(merged);

      setEditingRevenue(
        revenue.map((r: any) => ({
          month: r.month.slice(0, 7),
          target_revenue: r.target_revenue,
        }))
      );

      setModalOpen(true);
    } catch (e: any) {
      alert(e.message || "Gagal memuat detail project");
    }
  };

  const handleDelete = async (p: Project) => {
    if (!confirm(`Yakin ingin menghapus project ${p.project_code}?`)) return;
    try {
      await apiDelete(`/projects/${p.id}`);
      await loadProjects();
    } catch (e: any) {
      alert(e.message || "Gagal menghapus project");
    }
  };


const handleExportCsv = async () => {
  try {
    const params = new URLSearchParams();

    // ✅ year mengikuti startMonth/endMonth jika ada, kalau tidak pakai tahun sekarang
    const inferredYear =
      startMonth?.slice(0, 4) ||
      endMonth?.slice(0, 4) ||
      String(new Date().getFullYear());
    params.set("year", inferredYear);

    // Filter mengikuti FE (kecuali All => tidak dikirim)
    if (divisionFilter !== "All") params.set("division", divisionFilter);
    if (customerFilter !== "All") params.set("customer_id", customerFilter);
    if (statusFilter !== "All") params.set("status", statusFilter);
    if (sphFilter !== "All") params.set("sph_released", sphFilter);
    if (sphStatusFilter !== "All") params.set("sph_status", sphStatusFilter);
    if (projectTypeFilter !== "All") params.set("project_type", projectTypeFilter);
    if (salesStageFilter !== "All") params.set("sales_stage", salesStageFilter);

    if (startMonth) params.set("start_month", startMonth);
    if (endMonth) params.set("end_month", endMonth);

    if (search.trim()) params.set("q", search.trim());

    if (executionFilter !== "all") params.set("execution", executionFilter);
    if (cardMode) params.set("card_mode", cardMode);

    const token = getToken();
    if (!token) {
      alert("Session expired: missing token");
      window.location.href = "/login";
      return;
    }

    const res = await fetch(`/api/projects/export/csv?${params.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      clearToken();
      window.location.href = "/login";
      return;
    }

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `Export failed: ${res.status}`);
    }

    const blob = await res.blob();
    downloadBlob(blob, `projects_export_${params.get("year")}.csv`);
  } catch (e: any) {
    alert(e?.message ?? "Gagal export CSV");
  }
};




  const handleSave = async (payload: any) => {
    try {
      setModalSaving(true);

      if (modalMode === "create") {
        await apiPost("/projects", payload);
      } else if (modalMode === "edit" && editingProject) {
        await apiPut(`/projects/${editingProject.id}`, payload);
      }

      setModalOpen(false);
      await loadProjects();
    } catch (e: any) {
      setModalError(e.message || "Gagal menyimpan project");
    } finally {
      setModalSaving(false);
    }
  };

  const formatMonthLabel = (month: string) => {
    if (!month || month.length < 7) return month || "-";
    const [y, m] = month.split("-");
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const idx = Number(m) - 1;
    const name = monthNames[idx] || m;
    return `${name} ${y}`;
  };

  const resetAllFilters = () => {
    setDivisionFilter("All");
    setCustomerFilter("All");
    setStatusFilter("All");
    setSphFilter("All");
    setSphStatusFilter("All");
    setProjectTypeFilter("All");
    setSalesStageFilter("All");
    setStartMonth("");
    setEndMonth("");
    setSearch("");
    setSphStatusFilter("All");
    setExecutionFilter("all"); // ✅ penting (biar ga nyangkut)
    setCardMode("all");        // ✅ penting
  };


  const applyCardFilter = (
    type: "pipeline" | "closing" | "in_execution" | "completed"
  ) => {
    resetAllFilters();

    // setTimeout menjaga urutan state reset -> apply
    setTimeout(() => {
      if (type === "pipeline") {
        // ✅ Pipeline = sales_stage < 6 (bukan stage 1)
        setCardMode("pipeline");
        return;
      }

     if (type === "closing") {
        setCardMode("closing");
        setSalesStageFilter("6");
        setExecutionFilter("all"); // ✅ pastikan closing = all closing
        return;
      }


      if (type === "in_execution") {
        setCardMode("in_execution");
        setSalesStageFilter("6");            // execution hanya untuk stage 6
        setExecutionFilter("in_execution");  // filter postPO not done
        return;
      }

      if (type === "completed") {
        setCardMode("completed");
        setSalesStageFilter("6");           // completed juga stage 6
        setExecutionFilter("completed");    // postPO done
        return;
      }
    }, 0);
  };


  /* -------- Render -------- */

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Projects</h2>
          <p className="text-xs text-gray-500">
            Sales pipeline &amp; revenue tracking
          </p>
        </div>


        <div className="flex gap-2">
          <button
            onClick={handleExportCsv}
            className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            Export CSV
          </button>

          <button
            onClick={openCreateModal}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            + New Project
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
          
          {/* TOTAL */}
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Total Projects</div>
            <div className="text-xl font-semibold">{summary.total_projects}</div>
          </Card>

          {/* PIPELINE */}
          <Card
            className="p-4 cursor-pointer hover:shadow-md transition"
            onClick={() => applyCardFilter("pipeline")}
          >
            <div className="text-xs text-muted-foreground">Pipeline</div>
            <div className="text-xl font-semibold text-indigo-600">
              {summary.prospect_projects}
            </div>
          </Card>

          {/* CLOSING */}
          <Card
            className="p-4 cursor-pointer hover:shadow-md transition"
            onClick={() => applyCardFilter("closing")}
          >
            <div className="text-xs text-muted-foreground">Closing</div>
            <div className="text-xl font-semibold text-blue-600">
              {summary.closing_projects}
            </div>
          </Card>

          {/* IN EXECUTION */}
          <Card
            className="p-4 cursor-pointer hover:shadow-md transition"
            onClick={() => applyCardFilter("in_execution")}
          >
            <div className="text-xs text-muted-foreground">In Execution</div>
            <div className="text-xl font-semibold text-yellow-600">
              {summary.in_execution_projects}
            </div>
          </Card>

          {/* COMPLETED */}
          <Card
            className="p-4 cursor-pointer hover:shadow-md transition"
            onClick={() => applyCardFilter("completed")}
          >
            <div className="text-xs text-muted-foreground">Completed</div>
            <div className="text-xl font-semibold text-green-600">
              {summary.completed_projects}
            </div>
          </Card>

          {/* TARGET REVENUE */}
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Target Revenue</div>
            <div className="text-sm font-semibold">
              Rp {formatIDR(summary.total_target_revenue)}
            </div>
          </Card>

        </div>
      )}


      
      {/* SPH STATUS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {(["Open", "Win", "Hold", "Loss", "Drop"] as const).map((st) => {
          const count = filteredSortedBaseForSphCards.filter(
            (p) => normalizeSPHStatus(p.sph_status) === st
          ).length;

          const active = sphStatusFilter === st;

          return (
            <Card
              key={st}
              className={`p-4 cursor-pointer hover:shadow-md transition ${
                active ? "ring-2 ring-blue-500" : ""
              }`}
              onClick={() => setSphStatusFilter((prev) => (prev === st ? "All" : st))}
            >
              <div className="text-xs text-muted-foreground">SPH Status</div>
              <div className="flex items-end justify-between">
                <div className="text-lg font-semibold">{st}</div>
                <div className="text-xl font-semibold">{count}</div>
              </div>
              {active && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  Click again to clear
                </div>
              )}
            </Card>
          );
        })}
      </div>

{/* FILTERS */}
      <div className="bg-white p-4 border rounded-xl shadow-sm space-y-3">
        <input
          placeholder="Search project..."
          className="border px-3 py-2 rounded-lg w-full text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          {/* Division */}
          <select
            className="border px-3 py-2 rounded-lg text-sm"
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
          >
            <option value="All">All Divisions</option>
            {DIVISIONS.filter((d) => d !== "All").map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Customer */}
          <select
            className="border px-3 py-2 rounded-lg text-sm"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="All">All Customers</option>
            {customers.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Status */}
          <select
            className="border px-3 py-2 rounded-lg text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* SPH Released */}
          <select
            className="border px-3 py-2 rounded-lg text-sm"
            value={sphFilter}
            onChange={(e) => setSphFilter(e.target.value)}
          >
            <option value="All">SPH Released (All)</option>
            <option value="Yes">SPH Released = Yes</option>
            <option value="No">SPH Released = No</option>
          </select>

          {/* Project Type */}
          <select
            className="border px-3 py-2 rounded-lg text-sm"
            value={projectTypeFilter}
            onChange={(e) => setProjectTypeFilter(e.target.value)}
          >
            <option value="All">All Project Types</option>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Sales Stage */}
          <select
            className="border px-3 py-2 rounded-lg text-sm"
            value={salesStageFilter}
            onChange={(e) => setSalesStageFilter(e.target.value)}
          >
            <option value="All">All Sales Stages</option>
            {SALES_STAGES.map((s) => (
              <option key={s.value} value={String(s.value)}>
                {s.label}
              </option>
            ))}
          </select>

          {/* Start Month */}
          <input
            type="month"
            className="border px-3 py-2 rounded-lg text-sm"
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
          />

          {/* End Month */}
          <input
            type="month"
            className="border px-3 py-2 rounded-lg text-sm"
            value={endMonth}
            onChange={(e) => setEndMonth(e.target.value)}
          />

          {/* Reset */}
          <button
            type="button"
            onClick={() => {
              resetAllFilters();
            }}
            className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            Reset Filters
          </button>
        </div>

        {/* Sorting Controls */}
        <div className="flex flex-wrap gap-2 pt-2 border-t mt-2 pt-3">
          <select
            className="border px-3 py-2 rounded-lg text-sm"
            value={sortKey}
            onChange={(e) =>
              setSortKey(
                e.target.value as
                  | "project_code"
                  | "division"
                  | "status"
                  | "project_type"
                  | "total_revenue"
                  | "total_realization"
              )
            }
          >
            <option value="project_code">Sort by Code</option>
            <option value="division">Sort by Division</option>
            <option value="status">Sort by Status</option>
            <option value="project_type">Sort by Type</option>
            <option value="total_revenue">Sort by Revenue</option>
            <option value="total_realization">Sort by Realization</option>
          </select>

          <button
            type="button"
            className="border px-3 py-2 rounded-lg text-sm"
            onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
          >
            {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        {loading ? (
          <div className="p-4 text-sm text-gray-500">Loading...</div>
        ) : loadingError ? (
          <div className="p-4 text-sm text-red-600">{loadingError}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Division</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Stage</th>
                <th className="px-3 py-2 text-left">SPH Released?</th>
                <th className="px-3 py-2 text-left">SPH Status</th>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="px-3 py-2 text-right">Total Revenue</th>
                <th className="px-3 py-2 text-right">Total Realization</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-4 text-center text-gray-500">
                    No projects found.
                  </td>
                </tr>
              ) : (
                paged.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link
                        href={`/projects/${p.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {p.project_code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{p.description}</td>
                    <td className="px-3 py-2">{p.customer_name || "-"}</td>
                    <td className="px-3 py-2">{p.division}</td>
                    <td className="px-3 py-2">{p.project_type}</td>
                    <td className="px-3 py-2">{p.status}</td>
                    <td className="px-3 py-2">
                      {SALES_STAGES.find((s) => s.value === p.sales_stage)?.label ||
                        "-"}
                    </td>
                    <td className="px-3 py-2">
                      {normalizeSPH(p.sph_release_status) === "Yes" ? (
                        <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                          Yes
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded">
                          No
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2">
                      <span className="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded">
                        {normalizeSPHStatus(p.sph_status)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {normalizeSPHStatus(p.sph_status) === "Loss" ||
                      normalizeSPHStatus(p.sph_status) === "Drop" ? (
                        <div className="text-xs">
                          <div className="font-medium">
                            {p.sph_status_reason_category || "-"}
                          </div>
                          {p.sph_status_reason_note ? (
                            <div className="text-muted-foreground line-clamp-2">
                              {p.sph_status_reason_note}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      Rp {formatIDR(p.total_revenue || 0)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      Rp {formatIDR(p.total_realization || 0)}
                    </td>
                    <td className="px-3 py-2 text-right space-x-3">
                      <button className="text-blue-600" onClick={() => openEditModal(p)}>
                        Edit
                      </button>
                      <button className="text-red-600" onClick={() => handleDelete(p)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* PAGINATION */}
      <div className="flex justify-between items-center text-sm">
        <div>
          Page {page} of {totalPages}
        </div>
        <div className="space-x-2">
          <button
            className="px-2 py-1 border rounded"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <button
            className="px-2 py-1 border rounded"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {/* MODAL */}
      {modalOpen && (
        <ProjectModal
          mode={modalMode}
          project={editingProject}
          initialRevenue={editingRevenue}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          saving={modalSaving}
          error={modalError}
          customers={customers}
          me={me}
        />
      )}
    </div>
  );
}

/* ------------- Project Modal ------------- */

type ModalProps = {
  mode: "create" | "edit";
  project: ProjectWithPlans | null;
  initialRevenue: RevenuePlanItem[];
  onClose: () => void;
  onSave: (payload: {
    customer_id: number;
    description: string;
    division: string;
    status: string;
    project_type: string;
    sph_status?: string;
    sph_release_date?: string;
    sph_release_status?: "Yes" | "No";
    sph_number?: string | null;
    sph_status_reason_category?: string;
    sph_status_reason_note?: string;
    sales_stage: number;
    revenue_plans: RevenuePlanItem[];
  }) => Promise<void>;
  saving: boolean;
  error: string;
  customers: Customer[];
  me: { role: string; division: string } | null;
};

function ProjectModal({
  mode,
  project,
  initialRevenue,
  onClose,
  onSave,
  saving,
  error,
  customers,
  me,
}: ModalProps) {
  // Basic Fields
  const [description, setDescription] = useState(project?.description || "");

  const meRole = me?.role || "";
  const meDiv = me?.division || "";
  const isUser = meRole === "user";
  const lockedDivision = isUser && meDiv ? meDiv : null;

  const [division, setDivision] = useState(lockedDivision || project?.division || "IT Solutions");
  const [status, setStatus] = useState(project?.status || "Prospect");

  // Customer
  const [customerId, setCustomerId] = useState<number | "">(project?.customer_id ?? "");

  const [projectType, setProjectType] = useState(project?.project_type || "Project Based");

  const NEW_RECURRING = "New Recurring";
  const canUseNewRecurring = status === "New Prospect";

  const projectTypeOptions = useMemo(() => {
    return PROJECT_TYPES.filter((t) => {
      if (t === NEW_RECURRING) return canUseNewRecurring;
      return true;
    });
  }, [canUseNewRecurring]);

  useEffect(() => {
    if (lockedDivision) setDivision(lockedDivision);
  }, [lockedDivision]);

  useEffect(() => {
    if (!canUseNewRecurring && projectType === NEW_RECURRING) {
      setProjectType("Recurring");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const [sphStatus, setSphStatus] = useState(project?.sph_status || "");

  const [sphReasonCategory, setSphReasonCategory] = useState(
    project?.sph_status_reason_category || ""
  );

  const [sphReasonNote, setSphReasonNote] = useState(
    project?.sph_status_reason_note || ""
  );

  const [sphReleaseDate, setSphReleaseDate] = useState(project?.sph_release_date || "");

  const [salesStage, setSalesStage] = useState(project?.sales_stage || 1);

  const [sphReleaseStatus, setSphReleaseStatus] = useState<"Yes" | "No">(
    project?.sph_release_status ?? "No"
  );

  const [sphNumber, setSphNumber] = useState(project?.sph_number || "");

  const [sphNumberError, setSphNumberError] = useState("");

  const isRecurring = projectType === "Recurring" || projectType === "New Recurring";

  // Revenue init
  const safeInitial = Array.isArray(initialRevenue) ? initialRevenue : [];

  const [pbMonth, setPbMonth] = useState(!isRecurring && safeInitial[0]?.month ? safeInitial[0].month : "");

  const [pbValue, setPbValue] = useState(
    !isRecurring && safeInitial[0]?.target_revenue ? String(safeInitial[0].target_revenue) : ""
  );

  const [plans, setPlans] = useState<RevenuePlanItem[]>(
    isRecurring
      ? safeInitial.length > 0
        ? safeInitial
        : [{ month: "", target_revenue: 0 }]
      : [{ month: "", target_revenue: 0 }]
  );

  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [topError, setTopError] = useState("");

  /* ---- Revenue Helpers ---- */

  const addRow = () => {
    setPlans((prev) => [...prev, { month: "", target_revenue: 0 }]);
  };

  const deleteRow = (idx: number) => {
    setPlans((prev) => prev.filter((_, i) => i !== idx));
  };

  const hasDuplicateMonths = (items: RevenuePlanItem[]) => {
    const months = items.map((p) => p.month);
    return new Set(months).size !== months.length;
  };

  const validatePlans = (items: RevenuePlanItem[]) => {
    const errs: string[] = [];

    items.forEach((p, idx) => {
      let msg = "";
      if (!p.month) msg = "Bulan wajib diisi";
      else if (!p.target_revenue || p.target_revenue <= 0) msg = "Revenue harus > 0";

      errs[idx] = msg;
    });

    setRowErrors(errs);

    if (hasDuplicateMonths(items)) {
      setTopError("Ada bulan yang duplikat.");
    } else {
      setTopError("");
    }

    return errs.every((m) => !m) && !hasDuplicateMonths(items);
  };

  const updateRow = (idx: number, field: keyof RevenuePlanItem, value: any) => {
    setPlans((prev) => {
      const updated = prev.map((p, i) =>
        i === idx
          ? {
              ...p,
              [field]: field === "target_revenue" ? Number(value) : value,
            }
          : p
      );

      if (isRecurring) validatePlans(updated);
      return updated;
    });
  };

  const buildPayloadRevenue = (): RevenuePlanItem[] => {
    if (!isRecurring) {
      const val = Number(pbValue);
      if (!pbMonth || isNaN(val) || val <= 0) return [];
      return [{ month: pbMonth, target_revenue: val }];
    }

    return plans.filter(
      (p) => p && typeof p === "object" && p.month && p.target_revenue && p.target_revenue > 0
    );
  };

  const sortByMonth = (items: RevenuePlanItem[]) => [...items].sort((a, b) => (a.month > b.month ? 1 : -1));

  useEffect(() => {
    if (sphReleaseStatus === "No") {
      setSphNumber("");
      setSphNumberError("");
    }
  }, [sphReleaseStatus]);

  useEffect(() => {
    // Open/Win/Hold -> clear alasan
    if (sphStatus !== "Loss" && sphStatus !== "Drop") {
      setSphReasonCategory("");
      setSphReasonNote("");
    }
  }, [sphStatus]);

useEffect(() => {
  // kalau bukan Other, kosongkan note biar tidak nyangkut
  if (sphReasonCategory !== "Other") setSphReasonNote("");
}, [sphReasonCategory]);

  /* ---- Submit ---- */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTopError("");

    if (!customerId) {
      setTopError("Customer wajib dipilih.");
      return;
    }

    // Enforce FE rule (extra safety)
    if (projectType === NEW_RECURRING && status !== "New Prospect") {
      setTopError(`Project Type "${NEW_RECURRING}" hanya diperbolehkan jika Status = "New Prospect".`);
      return;
    }

    const revenue_plans = buildPayloadRevenue();

    if (revenue_plans.length === 0) {
      setTopError("Revenue plan belum diisi dengan benar.");
      return;
    }

    if (isRecurring && !validatePlans(revenue_plans)) {
      return;
    }

    const sorted = sortByMonth(revenue_plans);

    if (sphReleaseStatus === "Yes" && (!sphNumber || sphNumber.trim() === "")) {
      setSphNumberError("SPH Number wajib diisi jika status SPH Release = Yes.");
      return;
    } else {
      setSphNumberError("");
    }

    const isLossDrop = sphStatus === "Loss" || sphStatus === "Drop";
    if (isLossDrop) {
      if (!sphReasonCategory) {
        setTopError("Reason Category wajib jika SPH Status = Loss/Drop.");
        return;
      }
      if (sphReasonCategory === "Other" && !sphReasonNote.trim()) {
        setTopError("Keterangan wajib jika Reason Category = Other.");
        return;
      }
    }

    await onSave({
      customer_id: Number(customerId),
      description,
      division,
      status,
      project_type: projectType,
      sph_status: sphStatus || undefined,
      sph_release_date: sphReleaseDate || undefined,
      sph_release_status: sphReleaseStatus,
      sph_number: sphNumber || undefined,
      sales_stage: salesStage,
      revenue_plans: sorted,
      sph_status_reason_category: isLossDrop ? (sphReasonCategory || undefined) : undefined,
      sph_status_reason_note: isLossDrop ? (sphReasonNote || undefined) : undefined,
    });
  };

  /* ---- Render Modal ---- */

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg max-w-3xl w-full mx-3 max-h-[90vh] overflow-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* HEADER */}
          <div className="flex justify-between">
            <h3 className="text-xl font-semibold">{mode === "create" ? "New Project" : "Edit Project"}</h3>
            <button type="button" onClick={onClose} className="text-gray-500">
              ✕
            </button>
          </div>

          {/* BASIC FIELDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Description *</label>
              <input
                className="border rounded-lg w-full px-3 py-2 mt-1"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">Division *</label>
              <select
                className="border rounded-lg w-full px-3 py-2 mt-1 disabled:bg-gray-100"
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                disabled={!!lockedDivision}
              >
                {lockedDivision ? (
                  <option value={lockedDivision}>{lockedDivision}</option>
                ) : (
                  DIVISIONS.filter((d) => d !== "All").map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))
                )}
              </select>
              {lockedDivision && (
                <p className="text-xs text-gray-500 mt-1">Division dikunci sesuai akun Anda.</p>
              )}
            </div>

            {/* Customer */}
            <div>
              <label className="text-sm font-medium">Customer *</label>
              <select
                className="border rounded-lg w-full px-3 py-2 mt-1"
                value={customerId === "" ? "" : String(customerId)}
                onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : "")}
                required
              >
                <option value="">-- Select Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Status *</label>
              <select
                className="border rounded-lg w-full px-3 py-2 mt-1"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Project Type *</label>
              <select
                className="border rounded-lg w-full px-3 py-2 mt-1"
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
              >
                {projectTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {!canUseNewRecurring && (
                <p className="text-xs text-gray-500 mt-1">
                  Opsi <b>New Recurring</b> hanya tersedia jika Status = <b>New Prospect</b>.
                </p>
              )}
            </div>
          </div>
          {/* SALES STAGE + SPH */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Sales Stage *</label>
              <select
                className="border rounded-lg w-full px-3 py-2 mt-1"
                value={salesStage}
                onChange={(e) => setSalesStage(Number(e.target.value))}
              >
                {SALES_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">SPH Status</label>
              <select
                className="border rounded-lg w-full px-3 py-2 mt-1"
                value={sphStatus}
                onChange={(e) => setSphStatus(e.target.value)}
              >
                <option value="">- Select Status -</option>
                {SPH_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {(sphStatus === "Loss" || sphStatus === "Drop") && (
              <>
                <div>
                  <label className="text-sm font-medium">Reason Category *</label>
                  <select
                    className="border rounded-lg w-full px-3 py-2 mt-1"
                    value={sphReasonCategory}
                    onChange={(e) => setSphReasonCategory(e.target.value)}
                  >
                    <option value="">- Select Reason -</option>
                    <option value="Administrasi">Administrasi</option>
                    <option value="Teknis">Teknis</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Keterangan {sphReasonCategory === "Other" ? "*" : ""}
                  </label>
                  <textarea
                    className="border rounded-lg w-full px-3 py-2 mt-1"
                    rows={3}
                    value={sphReasonNote}
                    onChange={(e) => setSphReasonNote(e.target.value)}
                    placeholder="Isi keterangan (wajib jika Other)"
                  />
                </div>
              </>
            )}


            {/* SPH Released? */}
            <div>
              <label className="text-sm font-medium">SPH Release Status *</label>
              <select
                className="border rounded-lg w-full px-3 py-2 mt-1"
                value={sphReleaseStatus}
                onChange={(e) => setSphReleaseStatus(e.target.value as "Yes" | "No")}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>

            {/* SPH Number */}
            <div>
              <label className="text-sm font-medium">
                SPH Number {sphReleaseStatus === "Yes" && "*"}
              </label>
              <input
                type="text"
                className={`border rounded-lg w-full px-3 py-2 mt-1 ${
                  sphNumberError ? "border-red-500" : ""
                }`}
                placeholder="SPH-2025-001"
                value={sphNumber}
                onChange={(e) => setSphNumber(e.target.value)}
                disabled={sphReleaseStatus === "No"}
              />
              {sphNumberError && (
                <p className="text-xs text-red-600 mt-1">{sphNumberError}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">SPH Release Date</label>
              <input
                type="date"
                className="border rounded-lg w-full px-3 py-2 mt-1"
                value={sphReleaseDate || ""}
                onChange={(e) => setSphReleaseDate(e.target.value)}
              />
            </div>
          </div>

          {/* REVENUE SECTION */}
          <div className="pt-4 border-t space-y-5">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-semibold">Revenue Plan</h4>
              <span className="text-xs text-gray-500">
                {isRecurring
                  ? "Recurring: multi-bulan, nilai tiap bulan bisa berbeda."
                  : "Project Based: hanya 1 bulan."}
              </span>
            </div>

            {/* PROJECT BASED */}
            {!isRecurring ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Month</label>
                  <input
                    type="month"
                    className="mt-1 border rounded-lg w-full px-3 py-2"
                    value={safeMonth(pbMonth)}
                    onChange={(e) => setPbMonth(safeMonth(e.target.value))}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Revenue (IDR)</label>
                  <input
                    type="number"
                    className="mt-1 border rounded-lg w-full px-3 py-2"
                    value={pbValue}
                    onChange={(e) => setPbValue(e.target.value)}
                    placeholder="10000000"
                  />
                </div>
              </div>
            ) : (
              <>
                {/* RECURRING TABLE */}
                <table className="w-full border rounded-lg text-sm overflow-hidden">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left w-40">Month</th>
                      <th className="px-3 py-2 text-left">Target Revenue (IDR)</th>
                      <th className="px-3 py-2 text-right w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((row, idx) => {
                      const monthValue = safeMonth(row.month);
                      return (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <input
                              type="month"
                              className={`border rounded-lg px-2 py-1 w-full ${
                                rowErrors[idx] ? "border-red-500" : ""
                              }`}
                              value={monthValue}
                              onChange={(e) =>
                                updateRow(idx, "month", safeMonth(e.target.value))
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              className={`border rounded-lg px-2 py-1 w-full ${
                                rowErrors[idx] ? "border-red-500" : ""
                              }`}
                              value={row.target_revenue || ""}
                              placeholder="10000000"
                              onChange={(e) =>
                                updateRow(idx, "target_revenue", safeNumber(e.target.value))
                              }
                            />
                            {rowErrors[idx] && (
                              <div className="text-xs text-red-600 mt-1">
                                {rowErrors[idx]}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {plans.length > 1 && (
                              <button
                                type="button"
                                onClick={() => deleteRow(idx)}
                                className="text-xs text-red-600 hover:text-red-800"
                              >
                                Hapus
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <button
                  type="button"
                  onClick={addRow}
                  className="px-3 py-2 border rounded-lg bg-white hover:bg-gray-100 text-xs font-medium"
                >
                  + Tambah Bulan
                </button>
              </>
            )}

            {/* GLOBAL ERROR */}
            {(topError || error) && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
                {topError || error}
              </div>
            )}
          </div>

          {/* FOOTER */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 border rounded text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
