"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  apiGet,
  apiGetProjectPipelineDetails,
  apiGetProjectPipelineSummary,
} from "@/lib/api";

type Customer = {
  id: number;
  name: string;
};

type MeResponse = {
  role?: string;
  division?: string;
};

type PipelineStageSummary = {
  stage: number;
  label: string;
  count: number;
  target_value: number;
  sph_value?: number;
  realization_value: number;
  avg_target_value: number;
  hold_count?: number;
  hold_value?: number;
  loss_count?: number;
  loss_value?: number;
  drop_count?: number;
  drop_value?: number;
};

type PipelineSummaryResponse = {
  total_projects: number;
  total_target_value: number;
  total_realization: number;
  avg_deal_size: number;
  stages: PipelineStageSummary[];
};

type PipelineDetailItem = {
  id: number;
  project_code: string;
  description: string;
  customer_name: string;
  division: string;
  status: string;
  project_type: string;
  pipeline_status: string;
  sales_stage: number;
  sph_release_status: string;
  sph_status?: string | null;
  sph_number?: string | null;
  sph_release_date?: string | null;
  sph_status_reason_category?: string | null;
  sph_status_reason_note?: string | null;
  target_value: number;
  sph_value?: number | null;
  realization_value: number;
  start_month?: string | null;
  end_month?: string | null;
};

type PipelineDetailResponse = {
  data: PipelineDetailItem[];
};

const STAGE_LABELS: Record<number, string> = {
  1: "Prospecting",
  2: "Qualification",
  3: "Presales Analysis",
  4: "Quotation",
  5: "Negotiation",
  6: "Closing",
};

const normalizeSPHStatus = (
  v: any
): "Not Released" | "Open" | "Win" | "Hold" | "Loss" | "Drop" => {
  const s = String(v ?? "").trim().toLowerCase();

  if (!s) return "Not Released";
  if (s === "open") return "Open";
  if (s === "win") return "Win";
  if (s === "hold") return "Hold";
  if (s === "loss") return "Loss";
  if (s === "drop") return "Drop";

  return "Not Released";
};

function formatIDR(value: number | null | undefined) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("id-ID").format(amount);
}

function compactIDR(value: number | null | undefined): string {
  const n = Math.abs(Number(value || 0));
  if (n >= 1_000_000_000) return (Number(value || 0) / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + " B";
  if (n >= 1_000_000) return (Number(value || 0) / 1_000_000).toFixed(1).replace(/\.0$/, "") + " M";
  if (n >= 1_000) return (Number(value || 0) / 1_000).toFixed(1).replace(/\.0$/, "") + " K";
  return formatIDR(Number(value || 0));
}

function toText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeCustomers(res: any): Customer[] {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.customers)) return res.customers;
  return [];
}

function stageLabel(stage: number) {
  return STAGE_LABELS[stage] || `Stage ${stage}`;
}

function stageCardStyle(stage: number) {
  switch (stage) {
    case 1:
      return "border-slate-200 bg-slate-50";
    case 2:
      return "border-cyan-200 bg-cyan-50";
    case 3:
      return "border-violet-200 bg-violet-50";
    case 4:
      return "border-amber-200 bg-amber-50";
    case 5:
      return "border-orange-200 bg-orange-50";
    case 6:
      return "border-green-200 bg-green-50";
    default:
      return "border-gray-200 bg-white";
  }
}

function getContribution(value: number, total: number) {
  if (!total) return "0.0";
  return ((value / total) * 100).toFixed(1);
}

function topStageByCount(stages: PipelineStageSummary[]) {
  if (!stages.length) return null;
  return [...stages].sort((a, b) => (b.count || 0) - (a.count || 0))[0];
}

function topStageByValue(stages: PipelineStageSummary[]) {
  if (!stages.length) return null;
  return [...stages].sort(
    (a, b) => Number(b.target_value || 0) - Number(a.target_value || 0)
  )[0];
}

export default function ProjectPipelinePage() {
  const [summary, setSummary] = useState<PipelineSummaryResponse | null>(null);
  const [details, setDetails] = useState<PipelineDetailItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [division, setDivision] = useState("All");
  const [customerId, setCustomerId] = useState("All");
  const [status, setStatus] = useState("All");
  const [projectType, setProjectType] = useState("All");
  const [salesStage, setSalesStage] = useState("All");
  const [sphReleased, setSphReleased] = useState("All");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [sphReleaseRange, setSphReleaseRange] = useState("All");  

  const [selectedStage, setSelectedStage] = useState<number | "All">("All");

  const buildQueryString = () => {
    const params = new URLSearchParams();

    if (division !== "All") params.set("division", division);
    if (customerId !== "All") params.set("customer_id", customerId);
    if (status !== "All") params.set("status", status);
    if (projectType !== "All") params.set("project_type", projectType);
    if (salesStage !== "All") params.set("sales_stage", salesStage);
    if (sphReleased !== "All") params.set("sph_released", sphReleased);
    if (sphReleaseRange !== "All") {
        params.set("sph_release_range", sphReleaseRange);
    }

    if (startMonth) params.set("from", `${startMonth}-01`);
    if (endMonth) params.set("to", `${endMonth}-01`);

    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const [summaryRes, detailsRes, customersRes, meRes] = await Promise.all([
        apiGetProjectPipelineSummary(buildQueryString()),
        apiGetProjectPipelineDetails(buildQueryString()),
        apiGet<any>("/customers"),
        apiGet<any>("/me"),
      ]);

      const s = summaryRes as PipelineSummaryResponse;
      const d = detailsRes as PipelineDetailResponse;

      setSummary(s || null);
      setDetails(Array.isArray(d?.data) ? d.data : []);
      setCustomers(normalizeCustomers(customersRes));
      setMe((meRes || {}) as MeResponse);

      if ((meRes?.role || "").toLowerCase() === "user" && meRes?.division) {
        setDivision(String(meRes.division));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load pipeline data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [division, customerId, status, projectType, salesStage, sphReleased, sphReleaseRange, startMonth, endMonth]);

  const stageCards = useMemo(() => {
    const map = new Map<number, PipelineStageSummary>();

    for (let i = 1; i <= 6; i++) {
      map.set(i, {
        stage: i,
        label: stageLabel(i),
        count: 0,
        target_value: 0,
        realization_value: 0,
        avg_target_value: 0,
        sph_value: 0,
        hold_count: 0,
        hold_value: 0,
        loss_count: 0,
        loss_value: 0,
        drop_count: 0,
        drop_value: 0,
      });
    }

    for (const item of summary?.stages || []) {
      map.set(item.stage, {
        ...item,
        label: item.label || stageLabel(item.stage),
      });
    }

    return Array.from(map.values()).sort((a, b) => a.stage - b.stage);
  }, [summary]);

  const topCountStage = useMemo(() => topStageByCount(stageCards), [stageCards]);
  const topValueStage = useMemo(() => topStageByValue(stageCards), [stageCards]);
  const totalSPHValue = useMemo(() => {
    return stageCards.reduce(
      (sum, stage) => sum + Number(stage.sph_value || 0),
      0
    );
  }, [stageCards]);

  

  const filteredDetails = useMemo(() => {
    let data = [...details];

    if (selectedStage !== "All") {
      data = data.filter((item) => item.sales_stage === selectedStage);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((item) => {
        const haystack = [
          item.project_code,
          item.description,
          item.customer_name,
          item.division,
          item.status,
          item.project_type,
          item.sph_status,
          item.sph_number,
        ]
          .map((v) => toText(v).toLowerCase())
          .join(" ");

        return haystack.includes(q);
      });
    }

    return data.sort((a, b) => Number(b.target_value || 0) - Number(a.target_value || 0));
  }, [details, selectedStage, search]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredDetails.length / pageSize));
  }, [filteredDetails.length, pageSize]);

  const paginatedDetails = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return filteredDetails.slice(start, end);
  }, [filteredDetails, page, pageSize]);

  const resetFilters = () => {
    setSearch("");
    setCustomerId("All");
    setStatus("All");
    setProjectType("All");
    setSalesStage("All");
    setSphReleased("All");
    setStartMonth("");
    setEndMonth("");
    setSelectedStage("All");
    setSphReleaseRange("All");

    if ((me?.role || "").toLowerCase() === "user" && me?.division) {
      setDivision(String(me.division));
    } else {
      setDivision("All");
    }
  };

  const userIsRestrictedDivision = (me?.role || "").toLowerCase() === "user";

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    division,
    customerId,
    status,
    projectType,
    salesStage,
    sphReleased,
    sphReleaseRange,
    selectedStage,
    startMonth,
    endMonth,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline Monitoring</h1>
          <p className="text-sm text-gray-500">
            Monitoring jumlah project dan nilai target pada setiap sales stage.
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b pb-3">
        <Link
          href="/projects"
          className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
        >
          Projects
        </Link>
        <Link
          href="/projects/pipeline"
          className="px-3 py-2 rounded-lg border text-sm bg-gray-900 text-white"
        >
          Pipeline
        </Link>
        <Link
          href="/projects/sph"
          className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
        >
          SPH
        </Link>
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Search project / customer / SPH..."
            className="border rounded-lg px-3 py-2 text-sm w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="border rounded-lg px-3 py-2 text-sm w-full"
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            disabled={userIsRestrictedDivision}
          >
            <option value="All">All Divisions</option>
            <option value="NetCo">NetCo</option>
            <option value="Oil Gas & Mining">Oil Gas & Mining</option>
            <option value="IT Solutions">IT Solutions</option>
          </select>

          <select
            className="border rounded-lg px-3 py-2 text-sm w-full"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="All">All Customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={String(customer.id)}>
                {customer.name}
              </option>
            ))}
          </select>

          <select
            className="border rounded-lg px-3 py-2 text-sm w-full"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="All">All Status</option>
            <option value="Carry Over">Carry Over</option>
            <option value="Prospect">Prospect</option>
            <option value="New Prospect">New Prospect</option>
          </select>

          <select
            className="border rounded-lg px-3 py-2 text-sm w-full"
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
          >
            <option value="All">All Project Types</option>
            <option value="Project Based">Project Based</option>
            <option value="Recurring">Recurring</option>
            <option value="New Recurring">New Recurring</option>
          </select>

          <select
            className="border rounded-lg px-3 py-2 text-sm w-full"
            value={salesStage}
            onChange={(e) => setSalesStage(e.target.value)}
          >
            <option value="All">All Sales Stages</option>
            {Object.entries(STAGE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {key}. {label}
              </option>
            ))}
          </select>

          <select
            className="border rounded-lg px-3 py-2 text-sm w-full"
            value={sphReleased}
            onChange={(e) => setSphReleased(e.target.value)}
          >
            <option value="All">SPH Released (All)</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>

          <input
            type="month"
            className="border rounded-lg px-3 py-2 text-sm w-full"
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
          />

          <input
            type="month"
            className="border rounded-lg px-3 py-2 text-sm w-full"
            value={endMonth}
            onChange={(e) => setEndMonth(e.target.value)}
          />

          <select
            className="border rounded-lg px-3 py-2 text-sm w-full"
            value={sphReleaseRange}
            onChange={(e) => setSphReleaseRange(e.target.value)}
          >
            <option value="All">SPH Release Date (All)</option>
            <option value="last_week">Last Week</option>
            <option value="last_2_weeks">Last 2 Weeks</option>
            <option value="last_month">Last Month</option>
            <option value="ytd">Year To Date</option>
          </select>
        </div>

        

        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetFilters}
            className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            Reset Filter
          </button>
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-2 border rounded-lg text-sm bg-gray-900 text-white hover:bg-black"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border rounded-xl shadow-sm p-6 text-sm text-gray-500">
          Loading pipeline data...
        </div>
      ) : error ? (
        <div className="bg-white border rounded-xl shadow-sm p-6 text-sm text-red-600">
          {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
  <div className="bg-slate-50 border border-slate-200 rounded-xl shadow-sm p-4">
    <div className="text-xs text-slate-600">Total Pipeline Projects</div>
    <div className="mt-2 text-2xl font-semibold">
      {summary?.total_projects || 0}
    </div>
  </div>

  <div className="bg-blue-50 border border-blue-200 rounded-xl shadow-sm p-4">
    <div className="text-xs text-blue-700">Total Target Value</div>
    <div className="mt-2 text-xl font-semibold">
      Rp {compactIDR(summary?.total_target_value || 0)}
    </div>
  </div>

  <div className="bg-green-50 border border-green-200 rounded-xl shadow-sm p-4">
    <div className="text-xs text-green-700">Total SPH Value</div>
    <div className="mt-2 text-xl font-semibold">
      Rp {compactIDR(totalSPHValue)}
    </div>
  </div>

  <div className="bg-violet-50 border border-violet-200 rounded-xl shadow-sm p-4">
    <div className="text-xs text-violet-700">Average Deal Size</div>
    <div className="mt-2 text-xl font-semibold">
      Rp {compactIDR(summary?.avg_deal_size || 0)}
    </div>
  </div>

  <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-4">
    <div className="text-xs text-amber-700">Top Stage by Count</div>
    <div className="mt-2 text-base font-semibold">
      {topCountStage ? topCountStage.label : "-"}
    </div>
    <div className="mt-1 text-sm text-gray-600">
      {topCountStage ? `${topCountStage.count} projects` : "-"}
    </div>
  </div>

  <div className="bg-orange-50 border border-orange-200 rounded-xl shadow-sm p-4">
    <div className="text-xs text-orange-700">Top Stage by Value</div>
    <div className="mt-2 text-base font-semibold">
      {topValueStage ? topValueStage.label : "-"}
    </div>
    <div className="mt-1 text-sm text-gray-600">
      {topValueStage
        ? `Rp ${compactIDR(topValueStage.target_value || 0)}`
        : "-"}
    </div>
  </div>
</div>

<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
  {stageCards.map((stage) => {
    const active = selectedStage === stage.stage;
    const isClosing = stage.stage === 6;
    const hasRisk =
      Number(stage.hold_count || 0) > 0 ||
      Number(stage.drop_count || 0) > 0;

    return (
      <button
        key={stage.stage}
        type="button"
        onClick={() =>
          setSelectedStage((prev) =>
            prev === stage.stage ? "All" : stage.stage
          )
        }
        className={`text-left border rounded-xl shadow-sm p-3 hover:shadow-md transition h-full flex flex-col ${
          active ? "ring-2 ring-blue-500 border-blue-500" : ""
        } ${stageCardStyle(stage.stage)}`}
      >
        <div>
          <div className="text-xs text-gray-500">Stage {stage.stage}</div>

          <div className="mt-1 font-semibold leading-tight">
            {stage.label}
          </div>

          {(() => {
            const totalProjects = Number(stage.count || 0);
            const holdProjects = Number(stage.hold_count || 0);
            const dropProjects = Number(stage.drop_count || 0);
            const activeProjects = Math.max(
              0,
              totalProjects - holdProjects - dropProjects
            );

            return (
              <>
                <div className="mt-2 text-xl font-semibold leading-none">
                  {activeProjects}
                </div>
                <div className="text-[11px] text-gray-500">
                  Active dari {totalProjects} Total Project
                </div>
              </>
            );
          })()}

          <div className="mt-3">
            <div className="text-[11px] text-gray-500">Active Target</div>
            <div className="font-semibold leading-tight">
              Rp {compactIDR(
                    (stage.target_value || 0) -
                      (stage.hold_value || 0) -
                      (stage.drop_value || 0)
                  )}
            </div>
          </div>

          {(stage.stage === 4 || stage.stage === 5) && (
            <div className="mt-2">
              <div className="text-[11px] text-gray-500">SPH Value</div>
              <div className="font-semibold leading-tight">
                Rp {compactIDR(stage.sph_value || 0)}
              </div>
            </div>
          )}
        </div>

        {!isClosing && (
        <div className="mt-3 rounded-lg bg-white/60 border border-white/70 p-2 space-y-1">
          <div className="text-[11px] text-gray-500">Pipeline Risk</div>

          {hasRisk ? (
          <>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-amber-700">Hold</span>
              <span className="font-medium">
                {stage.hold_count || 0} • Rp{" "}
                {compactIDR(stage.hold_value || 0)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-rose-700">Drop</span>
              <span className="font-medium">
                {stage.drop_count || 0} • Rp{" "}
                {compactIDR(stage.drop_value || 0)}
              </span>
            </div>
          </>
        ) : (
          <div className="text-xs text-gray-400">No Hold/Drop Pipeline</div>
        )}
        </div>
        )}

        {isClosing && (
          <div className="mt-3 rounded-lg bg-white/60 border border-white/70 p-2 space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-gray-500">Realization</span>
              <span className="font-medium">
                Rp {compactIDR(stage.realization_value || 0)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-gray-500">Achievement</span>
              <span className="font-medium">
                {getContribution(
                  Number(stage.realization_value || 0),
                  Number(stage.target_value || 0)
                )}
                %
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-gray-500">% of Total</span>
              <span className="font-medium">
                {getContribution(
                  Number(stage.target_value || 0),
                  Number(summary?.total_target_value || 0)
                )}
                %
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-gray-500">Avg / Project</span>
              <span className="font-medium">
                Rp {compactIDR(stage.avg_target_value || 0)}
              </span>
            </div>
          </div>
        )}
      </button>
    );
  })}
</div>

<div className="bg-white border rounded-xl shadow-sm overflow-hidden">
  <div className="p-4 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-2">
    <div>
      <div className="font-semibold">
        {selectedStage === "All"
          ? "Pipeline Details"
          : `Pipeline Details - ${stageLabel(selectedStage)}`}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {filteredDetails.length} project(s)
      </div>
    </div>

    {selectedStage !== "All" && (
      <button
        type="button"
        onClick={() => setSelectedStage("All")}
        className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
      >
        Show All Stages
      </button>
    )}
  </div>

  <div className="overflow-auto">
    <table className="w-full text-sm min-w-[1350px]">
      <thead className="bg-gray-100">
        <tr>
          <th className="px-3 py-3 text-left">Project Code</th>
          <th className="px-3 py-3 text-left">Description</th>
          <th className="px-3 py-3 text-left">Customer</th>
          <th className="px-3 py-3 text-left">Division</th>
          <th className="px-3 py-3 text-left">Status</th>
          <th className="px-3 py-3 text-left">Pipeline Status</th>
          <th className="px-3 py-3 text-left">Stage</th>
          <th className="px-3 py-3 text-left">SPH</th>
          <th className="px-3 py-3 text-right">Initial Target</th>
          <th className="px-3 py-3 text-right">SPH Value</th>
          <th className="px-3 py-3 text-right">Variance</th>
          <th className="px-3 py-3 text-left">Period</th>
        </tr>
      </thead>

      <tbody>
        {filteredDetails.length === 0 ? (
          <tr>
            <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
              No pipeline data found.
            </td>
          </tr>
        ) : (
          paginatedDetails.map((item) => {
            const normalizedSPHStatus =
              item.sph_release_status === "Yes"
                ? normalizeSPHStatus(item.sph_status)
                : "Not Released";

            const periodText =
              item.start_month && item.end_month
                ? `${item.start_month} s/d ${item.end_month}`
                : item.start_month || item.end_month || "-";

            const variance =
              Number(item.sph_value || 0) > 0
                ? Number(item.sph_value || 0) -
                  Number(item.target_value || 0)
                : null;

            const actualSPHStatus = normalizeSPHStatus(item.sph_status);

            const rowClass =
              actualSPHStatus === "Loss"
                ? "bg-rose-50 hover:bg-rose-100"
                : actualSPHStatus === "Hold"
                ? "bg-amber-50 hover:bg-amber-100"
                : actualSPHStatus === "Drop"
                ? "bg-slate-100 hover:bg-slate-200"
                : "hover:bg-gray-50";

            return (
              <tr key={item.id} className={`border-t ${rowClass}`}>
                <td className="px-3 py-3 font-mono text-xs">
                  <Link
                    href={`/projects/${item.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {item.project_code}
                  </Link>
                </td>

                <td className="px-3 py-3">{item.description || "-"}</td>
                <td className="px-3 py-3">{item.customer_name || "-"}</td>
                <td className="px-3 py-3">{item.division || "-"}</td>
                <td className="px-3 py-3">{item.status || "-"}</td>

                <td className="px-3 py-3">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    item.pipeline_status === "Hold"
                      ? "bg-amber-100 text-amber-700"
                      : item.pipeline_status === "Drop"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {item.pipeline_status || "Active"}
                </span>
              </td>

                <td className="px-3 py-3">
                  {item.sales_stage}. {stageLabel(item.sales_stage)}
                </td>

                <td className="px-3 py-3">
                  {(() => {
                    const isReleased =
                      String(item.sph_release_status || "").trim().toLowerCase() === "yes";

                    const actualSPHStatus = isReleased
                      ? normalizeSPHStatus(item.sph_status)
                      : "Not Released";

                    const statusStyle: Record<string, { icon: string; color: string }> = {
                      "Not Released": {
                        icon: "📄",
                        color: "bg-gray-100 text-gray-600",
                      },
                      Open: {
                        icon: "🟦",
                        color: "bg-blue-100 text-blue-700",
                      },
                      Win: {
                        icon: "✅",
                        color: "bg-green-100 text-green-700",
                      },
                      Hold: {
                        icon: "⚠️",
                        color: "bg-amber-100 text-amber-700",
                      },
                      Loss: {
                        icon: "❌",
                        color: "bg-rose-100 text-rose-700",
                      },
                      Drop: {
                        icon: "⛔",
                        color: "bg-slate-200 text-slate-700",
                      },
                    };

                    const current = statusStyle[actualSPHStatus] || statusStyle["Not Released"];

                    return (
                      <span
                        className={`inline-flex w-fit items-center gap-1 px-2 py-1 rounded text-xs font-medium ${current.color}`}
                      >
                        <span>{current.icon}</span>
                        <span>{actualSPHStatus}</span>
                      </span>
                    );
                  })()}
                </td>
                
                <td className="px-3 py-3 text-right">
                  Rp {formatIDR(item.target_value || 0)}
                </td>

                <td className="px-3 py-3 text-right">
                  {Number(item.sph_value || 0) > 0 ? (
                    <>Rp {formatIDR(item.sph_value || 0)}</>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>

                <td className="px-3 py-3 text-right">
                  {variance !== null ? (
                    <span
                      className={`font-semibold ${
                        variance > 0
                          ? "text-green-600"
                          : variance < 0
                          ? "text-red-600"
                          : "text-gray-600"
                      }`}
                    >
                      Rp {formatIDR(variance)}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>

                <td className="px-3 py-3">{periodText}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </div>
</div>
{filteredDetails.length > 0 && (
  <div className="flex justify-between items-center text-sm">
    <div>Page {page} of {totalPages}</div>
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
)}
        </>
      )}
    </div>
  );
}