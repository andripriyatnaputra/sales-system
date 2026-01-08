"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatIDR } from "@/lib/utils";

import {
  Chart as ChartJS,
  LineElement,
  BarElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from "chart.js";
import { Line, Bar, Pie } from "react-chartjs-2";
import { AuthGuard } from "@/components/AuthGuard";

// Register all chart plugins
ChartJS.register(
  LineElement,
  BarElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

// ===== Types =====
type BreakdownItem = {
  label: string;
  value: number;
};

type ForecastPoint = {
  month: string;
  target: number;
  realization: number;
};

type PipelineStage = {
  stage: number;
  label: string;
  count: number;
};

type DashboardBudget = {
  total_budget: number;
  total_realization: number;
};

type DashboardTopProject = {
  id: number;
  name: string;
  target_revenue: number;
};

type DashboardCustomerRow = {
  customer: string;
  total_target: number;
  total_real: number;
};

type KPIBlock = { value: number; target: number; pct: number };
type OpportunityBlock = { target: number; conversion: number };

type DashboardResponse = {
  kpis: {
    total_sales: KPIBlock;
    carry_over: KPIBlock;
    project_based: KPIBlock;
    recurring: KPIBlock;
    new_recurring: KPIBlock;
    opportunity: OpportunityBlock;
  };
  totals: {
    total_target_revenue: number;
    total_realization: number;
    total_projects: number;
  };
  pipeline: { stages: PipelineStage[]; total_weighted_revenue?: number };
  division_breakdown: BreakdownItem[];
  type_breakdown: BreakdownItem[];
  customer_contribution: BreakdownItem[];
  status_breakdown: BreakdownItem[];
  budget: DashboardBudget;
  forecast: ForecastPoint[];
  top_projects: DashboardTopProject[];
  customer_table: DashboardCustomerRow[];
};

type Filters = {
  status: string[];
  salesStage: string[];
  projectType: string[];
  customer: string;
  division: string;
  fromMonth: string;
  toMonth: string;
};

// ===== Constants =====
const INITIAL_FILTERS: Filters = {
  status: [],
  salesStage: [],
  projectType: [],
  division: "ALL",
  customer: "ALL",
  fromMonth: "",
  toMonth: "",
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Status" },
  { value: "Carry Over", label: "Carry Over" },
  { value: "Prospect", label: "Prospect" },
  { value: "New Prospect", label: "New Prospect" },
];

const STAGE_OPTIONS = [
  { value: "ALL", label: "All Stages" },
  { value: "1", label: "1. Prospecting" },
  { value: "2", label: "2. Qualification" },
  { value: "3", label: "3. Presales Analysis" },
  { value: "4", label: "4. Quotation" },
  { value: "5", label: "5. Negotiation" },
  { value: "6", label: "6. PO / Contract" },
];

const PROJECT_TYPE_OPTIONS = [
  { value: "ALL", label: "All Types" },
  { value: "Project Based", label: "Project Based" },
  { value: "Recurring", label: "Recurring" },
  { value: "New Recurring", label: "New Recurring" },
];

const DIVISION_OPTIONS = [
  { value: "ALL", label: "All Division" },
  { value: "Network Communications", label: "Network Communications" },
  { value: "Oil Mining & Goverments", label: "Oil Mining & Goverments" },
  { value: "IT Solutions", label: "IT Solutions" },
];

// ===== Helpers =====
function cumulative(values: number[]): number[] {
  const result: number[] = [];
  let running = 0;
  for (let v of values) {
    running += v || 0;
    result.push(running);
  }
  return result;
}

function compactIDR(value: number): string {
  const n = Math.abs(value);
  if (n >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + " B";
  if (n >= 1_000_000) return (value / 1_000_000).toFixed(1).replace(/\.0$/, "") + " M";
  if (n >= 1_000) return (value / 1_000).toFixed(1).replace(/\.0$/, "") + " K";
  return formatIDR(value);
}

function getPercent(value: number, total: number): string {
  if (!total) return "0%";
  return ((value / total) * 100).toFixed(1) + "%";
}

function monthToDate(v: string): string {
  if (!v) return "";
  if (/^\d{4}-\d{2}$/.test(v)) return v + "-01";
  return v;
}

function ym(s: string): string {
  // normalize to "YYYY-MM"
  if (!s) return "";
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  return s.slice(0, 7);
}

function generateMonthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    return `${year}-${m}`;
  });
}

function getYearForTrend(filters: Filters, forecast: ForecastPoint[]): number {
  // Prioritas: fromMonth -> toMonth -> forecast[0] -> current year
  const fy = filters.fromMonth?.slice(0, 4);
  if (fy && /^\d{4}$/.test(fy)) return Number(fy);

  const ty = filters.toMonth?.slice(0, 4);
  if (ty && /^\d{4}$/.test(ty)) return Number(ty);

  const first = forecast?.[0]?.month ? ym(forecast[0].month).slice(0, 4) : "";
  if (first && /^\d{4}$/.test(first)) return Number(first);

  return new Date().getFullYear();
}

function normalizeForecastToYear(
  forecast: ForecastPoint[],
  year: number
): ForecastPoint[] {
  // Map existing forecast by month
  const map = new Map<string, ForecastPoint>();
  for (const f of forecast || []) {
    const key = ym(f.month);
    if (!key) continue;

    // kalau bulan yang sama muncul lebih dari sekali (edge case),
    // kita akumulasi biar aman
    const prev = map.get(key);
    if (prev) {
      map.set(key, {
        month: key,
        target: (prev.target || 0) + (Number(f.target) || 0),
        realization: (prev.realization || 0) + (Number(f.realization) || 0),
      });
    } else {
      map.set(key, {
        month: key,
        target: Number(f.target) || 0,
        realization: Number(f.realization) || 0,
      });
    }
  }

  // Build Jan–Dec, fill missing with 0
  return generateMonthsOfYear(year).map((m) => {
    const hit = map.get(m);
    return hit ?? { month: m, target: 0, realization: 0 };
  });
}

function toggle(arr: string[], value: string) {
  return arr.includes(value)
    ? arr.filter(v => v !== value)
    : [...arr, value];
}


export default function DashboardPage() {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [data, setData] = useState<DashboardResponse | null>(null);
  

  // Fetch data with filters
  useEffect(() => {
    const fetchData = async () => {
      const params = new URLSearchParams();
      

      filters.status.forEach(v => params.append("status", v));
      filters.salesStage.forEach(v => params.append("sales_stage", v));
      filters.projectType.forEach(v => params.append("project_type", v));

      if (filters.division !== "ALL") params.set("division", filters.division);
      if (filters.customer !== "ALL") params.set("customer", filters.customer);

      if (filters.fromMonth) params.set("from", monthToDate(filters.fromMonth));
      if (filters.toMonth) params.set("to", monthToDate(filters.toMonth));

      const url = "/dashboard" + (params.toString() ? `?${params}` : "");
      const res = await apiGet<DashboardResponse>(url);
      setData(res);
    };

    fetchData();
  }, [filters]);

  if (!data) return <div className="p-6 text-sm">Loading...</div>;

  

  // SAFE ARRAYS HARUS PALING ATAS
  const safeForecast = Array.isArray(data.forecast) ? data.forecast : [];
  const safePipeline = Array.isArray(data.pipeline?.stages) ? data.pipeline.stages : [];
  const safeDivision = Array.isArray(data.division_breakdown) ? data.division_breakdown : [];
  const safeTypes = Array.isArray(data.type_breakdown) ? data.type_breakdown : [];
  const safeCustomer = Array.isArray(data.customer_contribution) ? data.customer_contribution : [];
  const safeStatus = Array.isArray(data.status_breakdown) ? data.status_breakdown : [];
  const safeCustomerTable = Array.isArray(data.customer_table) ? data.customer_table : [];

  // customerNames harus pakai safeCustomer!
  //const customerNames = [...new Set(safeCustomer.map(c => c.label))];
  const customerNames = [
    ...new Set(safeCustomerTable.map(c => c.customer)),
  ].filter(Boolean);

  // ===== KPI Calculations =====
  const k = data.kpis;

  const totalSales = k.total_sales;         // value: real semua status, target: baseline only
  const carryOver = k.carry_over;
  const projectBased = k.project_based;     // baseline only
  const recurring = k.recurring;            // baseline only
  const newRecurring = k.new_recurring;     // new prospect only
  const opp = k.opportunity;

  const totalBudget = data.budget.total_budget || 0;
  const totalBudgetReal = data.budget.total_realization || 0;
  const budgetPct = totalBudget ? (totalBudgetReal / totalBudget) * 100 : 0;

  const totalTarget = data.totals.total_target_revenue || 0;
  const totalReal = data.totals.total_realization || 0;
  const achievementPct = totalTarget ? (totalReal / totalTarget) * 100 : 0;

  const statusMap = Object.fromEntries(safeStatus.map(s => [s.label, s.value]));
  const totalCarryOver = statusMap["Carry Over"] || 0;
  const totalProspect = statusMap["Prospect"] || 0;
  const totalNewProspect = statusMap["New Prospect"] || 0;

  const typeMap = Object.fromEntries(safeTypes.map(t => [t.label, t.value]));
  const totalProjectBased = typeMap["Project Based"] || 0;
  const totalRecurring = typeMap["Recurring"] || 0;
  const totalNewRecurring = typeMap["New Recurring"] || 0;

  const totalOpportunity = totalTarget;

  // ===== Cumulative Chart =====
  const trendYear = getYearForTrend(filters, safeForecast);
  const normalizedForecast = normalizeForecastToYear(safeForecast, trendYear);

  const labels = normalizedForecast.map((f) => f.month);
  const cumTarget = cumulative(normalizedForecast.map((f) => f.target));
  const cumReal = cumulative(normalizedForecast.map((f) => f.realization));

  // ===== Funnel (always 6 stages) =====
  const orderedPipeline = [1, 2, 3, 4, 5, 6].map((stage) => {
    console.log("PIPELINE RAW FROM API:", data.pipeline?.stages);
  const hit = safePipeline.find((s) => s.stage === stage);
    return {
      stage,
      label: hit?.label ?? `Stage ${stage}`,
      count: Number(hit?.count ?? 0),
    };
  });

  const stageCounts = orderedPipeline.map(s => s.count);
  const stageCumulative: number[] = new Array(stageCounts.length).fill(0);
  let running = 0;
  // hitung dari belakang (Closing → Prospecting)
  for (let i = stageCounts.length - 1; i >= 0; i--) {
    running += stageCounts[i];
    stageCumulative[i] = running;
  }

  // ===== UI =====
  const kpiPct = (v: number) => (totalTarget ? (v / totalTarget) * 100 : 0);

  const generateMonths = (year: number) => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, "0");
      return `${year}-${m}`;
    });
  };

  const projectTypePieData = {
    labels: safeTypes.map(t => t.label),
    datasets: [
      {
        data: safeTypes.map(t => t.value),
        backgroundColor: [
          "#2563EB",
          "#10B981",
          "#F59E0B",
          "#EC4899",
          "#8B5CF6",
        ],
      },
    ],
  };

  const isDefaultStatus =
    filters.status.length === 2 &&
    filters.status.includes("Prospect") &&
    filters.status.includes("Carry Over");

  const statusLabel =
    filters.status.length === 0
      ? "All"
      : filters.status.join(", ");


  return (
    <AuthGuard>
    <div className="p-4 space-y-6">

      {/* HEADER */}
      {/* HEADER + FILTER BAR WRAPPER */}
      <div className="flex flex-col mb-1">

        {/* ROW 1 – Title + (empty flex) + Filter bar */}
        <div className="flex justify-between items-center">

          {/* LEFT – Dashboard Title */}
          <div className="flex items-center gap-3">
            {/* LOGO */}
            <img
              src="/Logo.svg"      // atau /logo.png
              alt="Sales System"
              className="h-8 w-8 object-contain"
            />

            {/* TITLE + SUBTITLE */}
            <div className="flex flex-col gap-0.5">
              <h1 className="text-3xl font-semibold tracking-tight leading-none">
                Sales Dashboard
              </h1>
              <p className="text-[11px] text-muted-foreground leading-none">
                Sales performance & pipeline overview
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              Status: <span className="font-medium text-foreground">{statusLabel}</span>
            </span>

            {isDefaultStatus && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted border">
                Default: Prospect + Carry Over
              </span>
            )}
          </div>

          {/* RIGHT – Filter Bar */}
          <div className="flex flex-wrap justify-end items-center gap-2">
            {/* Select Status */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  Status {filters.status.length > 0 && `(${filters.status.length})`}
                </Button>
              </PopoverTrigger>

              <PopoverContent className="w-64 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">Project Status</div>

                {STATUS_OPTIONS.filter(s => s.value !== "ALL").map((s) => (
                  <label key={s.value} className="flex items-center gap-2 py-1 cursor-pointer">
                    <Checkbox
                      checked={filters.status.includes(s.value)}
                      onCheckedChange={() =>
                        setFilters((f) => ({
                          ...f,
                          status: toggle(f.status, s.value),
                        }))
                      }
                    />
                    <span className="text-sm">{s.label}</span>
                  </label>
                ))}

                <div className="pt-2 flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8"
                    onClick={() => setFilters((f) => ({ ...f, status: [] }))}
                  >
                    Clear
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() =>
                      setFilters((f) => ({
                        ...f,
                        status: STATUS_OPTIONS.filter(x => x.value !== "ALL").map(x => x.value),
                      }))
                    }
                  >
                    Select all
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            
          {/* Stage */}

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                Stage {filters.salesStage.length > 0 && `(${filters.salesStage.length})`}
              </Button>
            </PopoverTrigger>

            <PopoverContent className="w-64 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Sales Stage</div>

              {STAGE_OPTIONS.filter(s => s.value !== "ALL").map((s) => (
                <label key={s.value} className="flex items-center gap-2 py-1 cursor-pointer">
                  <Checkbox
                    checked={filters.salesStage.includes(s.value)}
                    onCheckedChange={() =>
                      setFilters((f) => ({
                        ...f,
                        salesStage: toggle(f.salesStage, s.value),
                      }))
                    }
                  />
                  <span className="text-sm">{s.label}</span>
                </label>
              ))}

              <div className="pt-2 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8"
                  onClick={() => setFilters((f) => ({ ...f, salesStage: [] }))}
                >
                  Clear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      salesStage: STAGE_OPTIONS.filter(x => x.value !== "ALL").map(x => x.value),
                    }))
                  }
                >
                  Select all
                </Button>
              </div>
            </PopoverContent>
          </Popover>


          {/* Project Type */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                Type {filters.projectType.length > 0 && `(${filters.projectType.length})`}
              </Button>
            </PopoverTrigger>

            <PopoverContent className="w-64 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Project Type</div>

              {PROJECT_TYPE_OPTIONS.filter(t => t.value !== "ALL").map((t) => (
                <label key={t.value} className="flex items-center gap-2 py-1 cursor-pointer">
                  <Checkbox
                    checked={filters.projectType.includes(t.value)}
                    onCheckedChange={() =>
                      setFilters((f) => ({
                        ...f,
                        projectType: toggle(f.projectType, t.value),
                      }))
                    }
                  />
                  <span className="text-sm">{t.label}</span>
                </label>
              ))}

              <div className="pt-2 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8"
                  onClick={() => setFilters((f) => ({ ...f, projectType: [] }))}
                >
                  Clear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      projectType: PROJECT_TYPE_OPTIONS.filter(x => x.value !== "ALL").map(x => x.value),
                    }))
                  }
                >
                  Select all
                </Button>
              </div>
            </PopoverContent>
          </Popover>


          {/* CUSTOMER */}
          <Select
            value={filters.customer}
            onValueChange={(v) => setFilters((f) => ({ ...f, customer: v }))}
          >
            <SelectTrigger className="h-9 w-[180px] text-sm">
              <SelectValue placeholder="Customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Customers</SelectItem>
              {customerNames.map((cust) => (
                <SelectItem key={cust} value={cust}>
                  {cust}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Division */}
          <Select
            value={filters.division}
            onValueChange={(v) => setFilters((f) => ({ ...f, division: v }))}
          >
            <SelectTrigger className="h-9 w-[150px] text-sm">
              <SelectValue placeholder="Division" />
            </SelectTrigger>
            <SelectContent>
              {DIVISION_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* From Month */}
          <Input
            type="month"
            className="h-9 w-[150px] text-sm"
            value={filters.fromMonth}
            onChange={(e) =>
              setFilters((f) => ({ ...f, fromMonth: e.target.value }))
            }
          />

          {/* To Month */}
          <Input
            type="month"
            className="h-9 w-[150px] text-sm"
            value={filters.toMonth}
            onChange={(e) =>
              setFilters((f) => ({ ...f, toMonth: e.target.value }))
            }
          />

          {/* Reset */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-4 text-sm"
            onClick={() => setFilters(INITIAL_FILTERS)}
          >
            Reset
          </Button>
          </div>

        </div>

      </div>
      <Separator className="my-2" />

      {/* ROW 1 – KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7 gap-4">

        <KPI title="Total Sales" value={totalSales.value} pct={totalSales.pct} total={totalSales.target} color="bg-emerald-500" />
        <KPI title="Total Carry Over" value={carryOver.value} pct={carryOver.pct} total={carryOver.target} color="bg-blue-500" />
        <KPI title="Total Project Based" value={projectBased.value} pct={projectBased.pct} total={projectBased.target} color="bg-indigo-500" />
        <KPI title="Total Recurring" value={recurring.value} pct={recurring.pct} total={recurring.target} color="bg-amber-500" />
        <KPI title="Total New Recurring" value={newRecurring.value} pct={newRecurring.pct} total={newRecurring.target} color="bg-rose-500" />

        <Card className="p-4 space-y-2">
          <div className="text-[14px] text-muted-foreground uppercase">Total Opportunity</div>
          <div className="text-xl font-bold">Rp {formatIDR(opp.target)}</div>
          <div className="text-[14px] text-muted-foreground">
            Conversion {(opp.conversion * 100).toFixed(1)}%
          </div>
          <div className="text-[14px] text-muted-foreground">
            Across {data.totals.total_projects} projects
          </div>
        </Card>

        <KPI title="Total Budget" value={totalBudgetReal} pct={budgetPct} total={totalBudget} color="bg-purple-500" />
      </div>


      {/* ROW 2 – CHART + FUNNEL (proporsional) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* CUSTOMER PIE (small) */}
        <Card className="xl:col-span-3 p-4 flex flex-col">
          <h2 className="text-sm font-semibold mb-2">Customer Contribution</h2>

          {/* PIE */}
          <div className="h-40 mb-3">
            <Pie
              data={{
                labels: safeCustomer.map(c => c.label),
                datasets: [
                  {
                    data: safeCustomer.map(c => c.value),
                    backgroundColor: [
                      "#2563EB",
                      "#10B981",
                      "#F59E0B",
                      "#EC4899",
                      "#8B5CF6",
                    ],
                  },
                ],
              }}
              options={{
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
              }}
            />
          </div>

          {/* TOP CUSTOMERS LIST */}
          <div className="mt-auto">
            <div className="text-[11px] uppercase text-muted-foreground mb-1">
              Top Customers
            </div>

            <ul className="space-y-1 text-xs">
              {safeCustomer.slice(0, 5).map((c, i) => (
                <li key={i} className="flex justify-between">
                  <span className="truncate">{c.label}</span>
                  <span className="font-medium">{formatIDR(c.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>


        {/* CUMULATIVE CHART (big) */}
        <Card className="xl:col-span-7 p-4">
          <h2 className="text-sm font-semibold mb-1">Cumulative Target vs Realization</h2>
          <div className="text-[11px] text-muted-foreground mb-3">Year: {trendYear}</div>
          <div className="h-56">
            <Line
              data={{
                labels,
                datasets: [
                  {
                    label: "Target (Cumulative)",
                    data: cumTarget,
                    borderColor: "#2563EB",
                    backgroundColor: "rgba(37,99,235,0.15)",
                    fill: true,
                    tension: 0.3,
                  },
                  {
                    label: "Realization (Cumulative)",
                    data: cumReal,
                    borderColor: "#DC2626",
                    backgroundColor: "rgba(220,38,38,0.1)",
                    fill: false,
                    tension: 0.3,
                  },
                ],
              }}
              options={{
                maintainAspectRatio: false,
                scales: {
                  x: { ticks: { font: { size: 10 } } },
                  y: { ticks: { callback: v => String(v) } },
                },
              }}
            />
          </div>
        </Card>

        {/* FUNNEL (small) */}
        <Card className="xl:col-span-2 p-4 flex flex-col">
        <h2 className="text-sm font-semibold mb-1">
          Sales Funnel (Cumulative)
        </h2>
        <p className="text-[10px] text-muted-foreground mb-2">
          Total deals that have reached this stage or beyond
        </p>

        <div className="flex-1">
          <Bar
            data={{
              labels: orderedPipeline.map(s => s.label),
              datasets: [
                {
                  data: stageCumulative,
                  backgroundColor: "rgba(37,99,235,0.9)",
                },
              ],
            }}
            options={{
              indexAxis: "y",
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) =>
                      `Cumulative deals: ${ctx.raw}`,
                  },
                },
              },
              scales: {
                x: {
                  ticks: { stepSize: 1 },
                  title: {
                    display: true,
                    text: "Number of deals",
                    font: { size: 10 },
                  },
                },
                y: {
                  ticks: { font: { size: 10 } },
                },
              },
            }}
          />
        </div>
      </Card>

      </div>


      {/* ROW 3 – ANALYTICS (proporsional) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* Division Breakdown */}
        <Card className="xl:col-span-3 p-4 flex flex-col">
          <h2 className="text-sm font-semibold mb-2">Division Breakdown</h2>

          <div className="flex-1">
            <Bar
              data={{
                labels: safeDivision.map(d => d.label),
                datasets: [
                  {
                    data: safeDivision.map(d => d.value),
                    backgroundColor: "rgba(59,130,246,0.85)",
                  },
                ],
              }}
              options={{
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { ticks: { font: { size: 10 } } },
                  y: { ticks: { callback: v => String(v) } },
                },
              }}
            />
          </div>
        </Card>


        {/* Customer Performance (table) */}
        <Card className="xl:col-span-6 p-4">
          <h2 className="text-sm font-semibold mb-3">Customer Performance (Sorted by Realization)</h2>
          <div className="max-h-64 overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider">Customer</th>
                  <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider">Target Revenue</th>
                  <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider">Realization</th>
                </tr>
              </thead>
              <tbody>
                {safeCustomerTable.map((row, i) => (
                  <tr key={i} className={i % 2 ? "bg-muted/40" : ""}>
                    <td className="px-3 py-2 text-xs">{row.customer}</td>
                    <td className="px-3 py-2 text-xs text-right">{formatIDR(row.total_target)}</td>
                    <td className="px-3 py-2 text-xs text-right font-semibold">{formatIDR(row.total_real)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Project Type Breakdown */}
        <Card className="xl:col-span-3 p-4 flex flex-col">
          <h2 className="text-sm font-semibold mb-2">Project Type Breakdown</h2>

          <div className="flex-1">
            <Bar
              data={{
                labels: safeTypes.map(t => t.label),
                datasets: [
                  {
                    data: safeTypes.map(t => t.value),
                    backgroundColor: "rgba(16,185,129,0.85)",
                  },
                ],
              }}
              options={{
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { ticks: { font: { size: 10 } } },
                  y: { ticks: { callback: v => String(v) } },
                },
              }}
            />
          </div>
        </Card>
      </div>


      <Separator />

      {/* ROW 4 – TOP PROJECTS */}
      <Card className="p-4">
      <h2 className="text-sm font-semibold mb-3">Customer Performance (Sorted by Realization)</h2>

      <div className="max-h-64 overflow-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider">Customer</th>
              <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider">Target Revenue</th>
              <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider">Realization</th>
            </tr>
          </thead>
          <tbody>
            {safeCustomerTable.map((row, i) => (
              <tr key={i} className={i % 2 ? "bg-muted/40" : ""}>
                <td className="px-3 py-2 text-xs">{row.customer}</td>
                <td className="px-3 py-2 text-xs text-right">{formatIDR(row.total_target)}</td>
                <td className="px-3 py-2 text-xs text-right font-semibold">
                  {formatIDR(row.total_real)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>


    </div>
    </AuthGuard>
  );
}

// ===== KPI CARD COMPONENT =====
function KPI({
  title,
  value,
  pct,
  total,
  color,
}: {
  title: string;
  value: number;
  pct?: number;
  total?: number;
  color: string;
}) {
  return (
    <Card className="p-4 space-y-2">
      <div className="text-[14px] uppercase text-muted-foreground">{title}</div>
      <div className="text-xl font-bold">Rp {formatIDR(value)}</div>

      {pct !== undefined && (
        <>
          <div className="text-[13px] text-muted-foreground">{pct.toFixed(1)}%</div>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className={`h-1.5 rounded-full ${color}`}
              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            />
          </div>
          {total !== undefined && (
            <div className="flex justify-between text-[14px] text-muted-foreground">
              <span>0</span>
              <span>{formatIDR(total)}</span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
