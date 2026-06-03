"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  apiGet,
  apiGetProjectSPHDetails,
  apiGetProjectSPHSummary,
} from "@/lib/api";

type Customer = {
  id: number;
  name: string;
};

type MeResponse = {
  role?: string;
  division?: string;
};

type SPHStatusSummary = {
  status: string;
  count: number;
  target_value: number;
  avg_target_value: number;
};

type SPHAgingBucket = {
  label: string;
  count: number;
  target_value: number;
};

type SPHReasonSummary = {
  reason: string;
  count: number;
  sph_value: number;
  target_value: number;
};

type SPHSummaryResponse = {
  released_count: number;
  initial_target_value: number;
  sph_value: number;
  variance_value: number;
  realization_value: number;
  conversion_rate: number;
  statuses: SPHStatusSummary[];
  aging: SPHAgingBucket[];
  reasons: SPHReasonSummary[];
};

type SPHDetailItem = {
  id: number;
  project_code: string;
  description: string;
  customer_name: string;
  division: string;
  status: string;
  project_type: string;
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

type SPHDetailResponse = {
  data: SPHDetailItem[];
};

const STATUS_ORDER = ["Open", "Win", "Hold", "Loss", "Drop"];

const STAGE_LABELS: Record<number, string> = {
  1: "Prospecting",
  2: "Qualification",
  3: "Presales Analysis",
  4: "Quotation",
  5: "Negotiation",
  6: "Closing",
};

const percent = (value: number, base: number) => {
  if (!base) return "0.0";
  return ((value / base) * 100).toFixed(1);
};

function formatIDR(value: number | null | undefined) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("id-ID").format(amount);
}

function compactIDR(value: number | null | undefined): string {
  const n = Math.abs(Number(value || 0));
  if (n >= 1_000_000_000)
    return (
      (Number(value || 0) / 1_000_000_000).toFixed(1).replace(/\.0$/, "") +
      " B"
    );
  if (n >= 1_000_000)
    return (
      (Number(value || 0) / 1_000_000).toFixed(1).replace(/\.0$/, "") + " M"
    );
  if (n >= 1_000)
    return (
      (Number(value || 0) / 1_000).toFixed(1).replace(/\.0$/, "") + " K"
    );
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

function normalizeStatus(value: string | null | undefined) {
  const v = toText(value).trim().toLowerCase();
  if (v === "win") return "Win";
  if (v === "hold") return "Hold";
  if (v === "loss") return "Loss";
  if (v === "drop") return "Drop";
  return "Open";
}

function stageLabel(stage: number) {
  return STAGE_LABELS[stage] || `Stage ${stage}`;
}

function statusCardStyle(status: string) {
  switch (status) {
    case "Open":
      return "border-blue-200 bg-blue-50";
    case "Win":
      return "border-green-200 bg-green-50";
    case "Hold":
      return "border-amber-200 bg-amber-50";
    case "Loss":
      return "border-rose-200 bg-rose-50";
    case "Drop":
      return "border-slate-300 bg-slate-100";
    default:
      return "border-gray-200 bg-white";
  }
}

function agingCardStyle(label: string) {
  switch (label) {
    case "0-7 days":
      return "border-green-200 bg-green-50";
    case "8-14 days":
      return "border-yellow-200 bg-yellow-50";
    case "15-30 days":
      return "border-orange-200 bg-orange-50";
    case ">30 days":
      return "border-red-200 bg-red-50";
    default:
      return "border-gray-200 bg-white";
  }
}

function agingRank(label: string) {
  if (label === "0-7 days") return 1;
  if (label === "8-14 days") return 2;
  if (label === "15-30 days") return 3;
  if (label === ">30 days") return 4;
  return 999;
}

function getContribution(value: number, total: number) {
  if (!total) return "0.0";
  return ((value / total) * 100).toFixed(1);
}

function topStatusByCount(statuses: SPHStatusSummary[]) {
  if (!statuses.length) return null;
  return [...statuses].sort((a, b) => (b.count || 0) - (a.count || 0))[0];
}

function topStatusByValue(statuses: SPHStatusSummary[]) {
  if (!statuses.length) return null;
  return [...statuses].sort(
    (a, b) => Number(b.target_value || 0) - Number(a.target_value || 0)
  )[0];
}

function reasonText(item: SPHDetailItem) {
  if (item.sph_status_reason_category && item.sph_status_reason_note) {
    return `${item.sph_status_reason_category}: ${item.sph_status_reason_note}`;
  }
  return item.sph_status_reason_category || item.sph_status_reason_note || "-";
}

function getAgingDays(sphReleaseDate?: string | null) {
  if (!sphReleaseDate) return null;
  const date = new Date(sphReleaseDate);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function varianceOf(item: SPHDetailItem) {
  const sph = Number(item.sph_value || 0);
  const target = Number(item.target_value || 0);
  if (sph <= 0 || target <= 0) return null;
  return sph - target;
}

export default function ProjectSPHPage() {
  const [summary, setSummary] = useState<SPHSummaryResponse | null>(null);
  const [details, setDetails] = useState<SPHDetailItem[]>([]);
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
  const [sphStatus, setSphStatus] = useState("All");
  const [sphReleaseRange, setSphReleaseRange] = useState("All");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");

  const buildQueryString = () => {
    const params = new URLSearchParams();

    if (division !== "All") params.set("division", division);
    if (customerId !== "All") params.set("customer_id", customerId);
    if (status !== "All") params.set("status", status);
    if (projectType !== "All") params.set("project_type", projectType);
    if (salesStage !== "All") params.set("sales_stage", salesStage);
    if (sphStatus !== "All") params.set("sph_status", sphStatus);

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
        apiGetProjectSPHSummary(buildQueryString()),
        apiGetProjectSPHDetails(buildQueryString()),
        apiGet<any>("/customers"),
        apiGet<any>("/me"),
      ]);

      const s = summaryRes as SPHSummaryResponse;
      const d = detailsRes as SPHDetailResponse;

      setSummary(s || null);
      setDetails(Array.isArray(d?.data) ? d.data : []);
      setCustomers(normalizeCustomers(customersRes));
      setMe((meRes || {}) as MeResponse);

      if ((meRes?.role || "").toLowerCase() === "user" && meRes?.division) {
        setDivision(String(meRes.division));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load SPH data");
    } finally {
      setLoading(false);
    }
  };

  const [selectedReason, setSelectedReason] = useState<string | "All">("All");
  const [selectedAging, setSelectedAging] = useState<string | "All">("All");

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    division,
    customerId,
    status,
    projectType,
    salesStage,
    sphStatus,
    sphReleaseRange,
    startMonth,
    endMonth,
  ]);

  const statusCards = useMemo(() => {
    const map = new Map<string, SPHStatusSummary>();

    for (const statusName of STATUS_ORDER) {
      map.set(statusName, {
        status: statusName,
        count: 0,
        target_value: 0,
        avg_target_value: 0,
      });
    }

    for (const item of summary?.statuses || []) {
      const normalized = normalizeStatus(item.status);
      const existing = map.get(normalized);

      map.set(normalized, {
        status: normalized,
        count: Number(existing?.count || 0) + Number(item.count || 0),
        target_value:
          Number(existing?.target_value || 0) + Number(item.target_value || 0),
        avg_target_value: 0,
      });
    }

    for (const [key, item] of map.entries()) {
      map.set(key, {
        ...item,
        avg_target_value:
          Number(item.count || 0) > 0
            ? Number(item.target_value || 0) / Number(item.count || 0)
            : 0,
      });
    }

    return STATUS_ORDER.map((statusName) => map.get(statusName)!);
  }, [summary]);

  const sortedAging = useMemo(() => {
    return [...(summary?.aging || [])].sort(
      (a, b) => agingRank(a.label) - agingRank(b.label)
    );
  }, [summary]);

  const filteredDetails = useMemo(() => {
  let data = [...details];

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
        item.sph_status_reason_category,
        item.sph_status_reason_note,
      ]
        .map((v) => toText(v).toLowerCase())
        .join(" ");

      return haystack.includes(q);
    });
  }

  if (selectedReason !== "All") {
    data = data.filter((item) => {
      const status = normalizeStatus(item.sph_status);

      return (
        (status === "Loss" || status === "Drop") &&
        (item.sph_status_reason_category || "Unspecified") === selectedReason
      );
    });
  }

  if (selectedAging !== "All") {
    data = data.filter((item) => {
      const normalizedStatus = normalizeStatus(item.sph_status);
      if (normalizedStatus !== "Open" && normalizedStatus !== "Hold") return false;
      const days = getAgingDays(item.sph_release_date);
      if (days === null) return false;
      if (selectedAging === "0-7 days") return days >= 0 && days <= 7;
      if (selectedAging === "8-14 days") return days >= 8 && days <= 14;
      if (selectedAging === "15-30 days") return days >= 15 && days <= 30;
      if (selectedAging === ">30 days") return days > 30;
      return false;
    });
  }

  return data.sort(
    (a, b) => Number(b.sph_value || 0) - Number(a.sph_value || 0)
  );
}, [details, search, selectedReason]);

const totalPages = useMemo(() => {
  return Math.max(1, Math.ceil(filteredDetails.length / pageSize));
}, [filteredDetails.length, pageSize]);

const paginatedDetails = useMemo(() => {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return filteredDetails.slice(start, end);
}, [filteredDetails, page, pageSize]);

  const topValueStatus = useMemo(() => topStatusByValue(statusCards), [statusCards]);

  const criticalAging = useMemo(() => {
    return sortedAging.find((item) => item.label === ">30 days") || null;
  }, [sortedAging]);

  const criticalAgingContribution = useMemo(() => {
    return criticalAging
      ? getContribution(
          Number(criticalAging.target_value || 0),
          Number(summary?.sph_value || 0)
        )
      : "0.0";
  }, [criticalAging, summary]);

  const worstVarianceProjects = useMemo(() => {
    return details
      .map((item) => ({
        ...item,
        variance: varianceOf(item),
      }))
      .filter((item) => item.variance !== null && Number(item.variance) < 0)
      .sort((a, b) => Number(a.variance) - Number(b.variance))
      .slice(0, 5);
  }, [details]);

  const resetFilters = () => {
    setSearch("");
    setCustomerId("All");
    setStatus("All");
    setProjectType("All");
    setSalesStage("All");
    setSphStatus("All");
    setSphReleaseRange("All");
    setStartMonth("");
    setEndMonth("");
    setSelectedReason("All");
    setSelectedAging("All");

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
  }, [search, selectedReason, selectedAging]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">SPH Monitoring</h1>
        <p className="text-sm text-gray-500">
          Monitoring quotation/SPH yang sudah release, status commercial outcome, aging, variance, dan reason loss/drop.
        </p>
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
          className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
        >
          Pipeline
        </Link>
        <Link
          href="/projects/sph"
          className="px-3 py-2 rounded-lg border text-sm bg-gray-900 text-white"
        >
          SPH
        </Link>
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Search project / customer / SPH number / reason..."
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
            <option value="All">All Project Status</option>
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
            value={sphStatus}
            onChange={(e) => setSphStatus(e.target.value)}
          >
            <option value="All">All SPH Status</option>
            {STATUS_ORDER.map((statusName) => (
              <option key={statusName} value={statusName}>
                {statusName}
              </option>
            ))}
          </select>

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

          <div>
            <div className="text-[11px] text-gray-500 mb-1">Target Month From</div>
            <input
              type="month"
              className="border rounded-lg px-3 py-2 text-sm w-full"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
            />
          </div>

          <div>
            <div className="text-[11px] text-gray-500 mb-1">Target Month To</div>
            <input
              type="month"
              className="border rounded-lg px-3 py-2 text-sm w-full"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
            />
          </div>
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
          Loading SPH data...
        </div>
      ) : error ? (
        <div className="bg-white border rounded-xl shadow-sm p-6 text-sm text-red-600">
          {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl shadow-sm p-4">
              <div className="text-xs text-slate-600">Released SPH</div>
              <div className="mt-2 text-2xl font-semibold">
                {summary?.released_count || 0}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl shadow-sm p-4">
              <div className="text-xs text-blue-700">SPH Value</div>
              <div className="mt-2 text-xl font-semibold">
                {compactIDR(summary?.sph_value || 0)}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-4">
              <div className="text-xs text-amber-700">Initial Target</div>
              <div className="mt-2 text-xl font-semibold">
                {compactIDR(summary?.initial_target_value || 0)}
              </div>
            </div>

            <div className="bg-violet-50 border border-violet-200 rounded-xl shadow-sm p-4">
              <div className="text-xs text-violet-700">Variance</div>
              <div
                className={`mt-2 text-xl font-semibold ${
                  (summary?.variance_value || 0) > 0
                    ? "text-green-600"
                    : (summary?.variance_value || 0) < 0
                    ? "text-red-600"
                    : ""
                }`}
              >
                {compactIDR(summary?.variance_value || 0)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {percent(
                  Number(summary?.variance_value || 0),
                  Number(summary?.initial_target_value || 0)
                )}
                %
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-xl shadow-sm p-4">
              <div className="text-xs text-orange-700">Top SPH Outcome by Value</div>
              <div className="mt-2 text-base font-semibold">
                {topValueStatus ? topValueStatus.status : "-"}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                {topValueStatus
                  ? `${compactIDR(topValueStatus.target_value || 0)}`
                  : "-"}
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl shadow-sm p-4">
              <div className="text-xs text-red-700">Critical Aging</div>
              <div className="mt-2 text-base font-semibold">
                {criticalAging ? criticalAging.label : "-"}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                {criticalAging ? `${criticalAging.count} projects` : "-"}
              </div>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl shadow-sm p-4">
            <div className="text-xs text-green-700">Conversion Rate</div>
            <div className="mt-2 text-xl font-semibold">
              {Number(summary?.conversion_rate || 0).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Realization: {compactIDR(summary?.realization_value || 0)}
            </div>
          </div>

          <div className="bg-white border rounded-xl shadow-sm p-4">
            <div className="font-semibold">Management Insight</div>
            <div className="mt-2 text-sm text-gray-700 space-y-1">
              <div>
                Variance total saat ini{" "}
                <b
                  className={
                    (summary?.variance_value || 0) > 0
                      ? "text-green-600"
                      : (summary?.variance_value || 0) < 0
                      ? "text-red-600"
                      : ""
                  }
                >
                  {compactIDR(summary?.variance_value || 0)}
                </b>{" "}
                (
                {percent(
                  Number(summary?.variance_value || 0),
                  Number(summary?.initial_target_value || 0)
                )}
                %)
              </div>

              <div>
                {topValueStatus
                  ? `${topValueStatus.status} memiliki nilai SPH terbesar sebesar ${compactIDR(
                      topValueStatus.target_value || 0
                    )}.`
                  : "Belum ada data status SPH."}
              </div>

              <div>
                {criticalAging
                  ? `${criticalAgingContribution}% nilai SPH aktif (Open/Hold) berada pada bucket ${criticalAging.label}, perlu perhatian lebih untuk percepatan closing.`
                  : "Belum ada aging kritis untuk SPH aktif."}
              </div>

              <div>
                Conversion rate realisasi terhadap total SPH value saat ini sebesar{" "}
                <b
                  className={
                    Number(summary?.conversion_rate || 0) >= 80
                      ? "text-green-600"
                      : Number(summary?.conversion_rate || 0) >= 50
                      ? "text-amber-600"
                      : "text-red-600"
                  }
                >
                  {Number(summary?.conversion_rate || 0).toFixed(1)}%
                </b>
                .
              </div>
            </div>
          </div>

          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <div className="font-semibold">Loss / Drop Reason Breakdown</div>
                <div className="text-xs text-gray-500 mt-1">
                  Penyebab project dengan status SPH Loss atau Drop.
                </div>
              </div>

              {selectedReason !== "All" && (
                <button
                  type="button"
                  onClick={() => setSelectedReason("All")}
                  className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
                >
                  Clear Reason Filter
                </button>
              )}
            </div>

            <div className="p-4 space-y-3">
              {(summary?.reasons || []).length === 0 ? (
                <div className="text-sm text-gray-500">
                  Belum ada reason untuk Loss/Drop.
                </div>
              ) : (
                summary?.reasons.map((item) => {
                  const total = (summary.reasons || []).reduce(
                    (sum, r) => sum + Number(r.sph_value || 0),
                    0
                  );

                  const pct = getContribution(Number(item.sph_value || 0), total);
                  const active = selectedReason === item.reason;

                  return (
                    <button
                      key={item.reason}
                      type="button"
                      onClick={() =>
                        setSelectedReason((prev) =>
                          prev === item.reason ? "All" : item.reason
                        )
                      }
                      className={`w-full text-left border rounded-lg p-3 hover:shadow-sm transition ${
                        active ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{item.reason}</div>
                          <div className="text-xs text-gray-500">
                            {item.count} project(s)
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-semibold">
                            {compactIDR(item.sph_value || 0)}
                          </div>
                          <div className="text-xs text-gray-500">{pct}%</div>
                        </div>
                      </div>

                      <div className="mt-3 h-2 rounded bg-gray-100 overflow-hidden">
                        <div
                          className="h-2 rounded bg-rose-400"
                          style={{ width: `${Math.min(Number(pct), 100)}%` }}
                        />
                      </div>

                      <div className="mt-2 text-[11px] text-gray-400">
                        {active ? "Click again to clear filter" : "Click to filter details"}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <div className="font-semibold">Top 5 Negative Variance Projects</div>
              <div className="text-xs text-gray-500 mt-1">
                Proyek dengan nilai SPH paling turun dibanding target awal.
              </div>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-3 text-left">Project Code</th>
                    <th className="px-3 py-3 text-left">Customer</th>
                    <th className="px-3 py-3 text-left">SPH Status</th>
                    <th className="px-3 py-3 text-right">Initial Target</th>
                    <th className="px-3 py-3 text-right">SPH Value</th>
                    <th className="px-3 py-3 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {worstVarianceProjects.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-6 text-center text-gray-500"
                      >
                        Tidak ada negative variance.
                      </td>
                    </tr>
                  ) : (
                    worstVarianceProjects.map((item) => (
                      <tr key={item.id} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-3 font-mono text-xs">
                          <Link
                            href={`/projects/${item.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {item.project_code}
                          </Link>
                        </td>
                        <td className="px-3 py-3">{item.customer_name || "-"}</td>
                        <td className="px-3 py-3">
                          {normalizeStatus(item.sph_status)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatIDR(item.target_value || 0)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatIDR(item.sph_value || 0)}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-red-600">
                          {formatIDR(item.variance || 0)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {statusCards.map((item) => {
              const highlightDetails = item.status === "Win";

              return (
                <div
                  key={item.status}
                  className={`border rounded-xl shadow-sm p-4 cursor-pointer hover:shadow-md transition ${
                    sphStatus === item.status
                      ? "ring-2 ring-blue-500 border-blue-500"
                      : ""
                  } ${statusCardStyle(item.status)}`}
                  onClick={() =>
                    setSphStatus((prev) =>
                      prev === item.status ? "All" : item.status
                    )
                  }
                >
                  <div className="text-xs text-gray-500">SPH Outcome</div>
                  <div className="mt-1 text-lg font-semibold">{item.status}</div>

                  <div className="mt-3 text-2xl font-semibold">
                    {item.count || 0}
                  </div>
                  <div className="text-xs text-gray-500">Projects</div>

                  <div className="mt-4">
                    <div className="text-xs text-gray-500">Value</div>
                    <div className="font-semibold">
                      {compactIDR(item.target_value || 0)}
                    </div>
                  </div>

                  {highlightDetails && (
                    <>
                      <div className="mt-2">
                        <div className="text-xs text-gray-500">
                          % of Total SPH Value
                        </div>
                        <div className="font-medium">
                          {getContribution(
                            Number(item.target_value || 0),
                            Number(summary?.sph_value || 0)
                          )}
                          %
                        </div>
                      </div>

                      <div className="mt-2">
                        <div className="text-xs text-gray-500">Avg / Project</div>
                        <div className="font-medium">
                          {compactIDR(item.avg_target_value || 0)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <div className="font-semibold">SPH Aging</div>
                <div className="text-xs text-gray-500 mt-1">
                  Distribusi aging untuk SPH aktif (Open/Hold) berdasarkan umur
                  sejak tanggal release. Klik card untuk filter tabel.
                </div>
              </div>

              {selectedAging !== "All" && (
                <button
                  type="button"
                  onClick={() => setSelectedAging("All")}
                  className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 shrink-0"
                >
                  Clear Aging Filter
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-4">
              {sortedAging.length === 0 ? (
                <div className="text-sm text-gray-500 px-1">
                  No aging data found.
                </div>
              ) : (
                sortedAging.map((item) => {
                  const active = selectedAging === item.label;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() =>
                        setSelectedAging((prev) =>
                          prev === item.label ? "All" : item.label
                        )
                      }
                      className={`border rounded-xl p-4 text-left hover:shadow-md transition cursor-pointer ${agingCardStyle(item.label)} ${
                        active ? "ring-2 ring-blue-500 border-blue-500" : ""
                      }`}
                    >
                      <div className="text-xs text-gray-500">{item.label}</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {item.count || 0}
                      </div>
                      <div className="text-xs text-gray-500">Projects</div>
                      <div className="mt-3 font-medium">
                        {compactIDR(item.target_value || 0)}
                      </div>
                      <div className="mt-2 text-sm text-gray-600">
                        {getContribution(
                          Number(item.target_value || 0),
                          Number(summary?.sph_value || 0)
                        )}
                        % of total
                      </div>
                      <div className="mt-2 text-[11px] text-gray-400">
                        {active ? "Click again to clear filter" : "Click to filter details"}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <div className="font-semibold">Released SPH Details</div>
              <div className="text-xs text-gray-500 mt-1">
                {filteredDetails.length} project(s)
              </div>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[1500px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-3 text-left">Project Code</th>
                    <th className="px-3 py-3 text-left">Description</th>
                    <th className="px-3 py-3 text-left">Customer</th>
                    <th className="px-3 py-3 text-left">Division</th>
                    <th className="px-3 py-3 text-left">Stage</th>
                    <th className="px-3 py-3 text-left">SPH Number</th>
                    <th className="px-3 py-3 text-left">SPH Date</th>
                    <th className="px-3 py-3 text-left">Aging</th>
                    <th className="px-3 py-3 text-left">SPH Status</th>
                    <th className="px-3 py-3 text-left">Reason</th>
                    <th className="px-3 py-3 text-right">Initial Target</th>
                    <th className="px-3 py-3 text-right">SPH Value</th>
                    <th className="px-3 py-3 text-right">Variance</th>
                    <th className="px-3 py-3 text-left">Period</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDetails.length === 0 ? (
                    <tr>
                      <td
                        colSpan={14}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        No SPH data found.
                      </td>
                    </tr>
                  ) : (
                    paginatedDetails.map((item) => {
                      const periodText =
                        item.start_month && item.end_month
                          ? `${item.start_month} s/d ${item.end_month}`
                          : item.start_month || item.end_month || "-";

                      const agingDays = getAgingDays(item.sph_release_date);
                      const normalizedStatus = normalizeStatus(item.sph_status);
                      const agingAllowed =
                        normalizedStatus === "Open" || normalizedStatus === "Hold";
                      const variance = varianceOf(item);

                      return (
                        <tr key={item.id} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-3 font-mono text-xs">
                            <Link
                              href={`/projects/${item.id}`}
                              className="text-blue-600 hover:underline"
                            >
                              {item.project_code}
                            </Link>
                          </td>
                          <td className="px-3 py-3 max-w-[320px]">
                            <div className="line-clamp-2" title={item.description || "-"}>
                              {item.description || "-"}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {item.customer_name || "-"}
                          </td>
                          <td className="px-3 py-3">{item.division || "-"}</td>
                          <td className="px-3 py-3">
                            {item.sales_stage}. {stageLabel(item.sales_stage)}
                          </td>
                          <td className="px-3 py-3">
                            {item.sph_number || "-"}
                          </td>
                          <td className="px-3 py-3">
                            {item.sph_release_date
                              ? String(item.sph_release_date).slice(0, 10)
                              : "-"}
                          </td>
                          <td className="px-3 py-3">
                            {!agingAllowed || agingDays === null ? (
                              <span className="text-gray-400">-</span>
                            ) : (
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  agingDays > 30
                                    ? "bg-red-100 text-red-700"
                                    : agingDays > 14
                                    ? "bg-orange-100 text-orange-700"
                                    : agingDays > 7
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-green-100 text-green-700"
                                }`}
                              >
                                {agingDays} days
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                normalizedStatus === "Win"
                                  ? "bg-green-100 text-green-700"
                                  : normalizedStatus === "Hold"
                                  ? "bg-amber-100 text-amber-700"
                                  : normalizedStatus === "Loss"
                                  ? "bg-rose-100 text-rose-700"
                                  : normalizedStatus === "Drop"
                                  ? "bg-slate-200 text-slate-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {normalizedStatus}
                            </span>
                          </td>
                          <td className="px-3 py-3">{reasonText(item)}</td>
                          <td className="px-3 py-3 text-right">
                            {formatIDR(item.target_value || 0)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {item.sph_value !== null && item.sph_value !== undefined ? (
                              <>{formatIDR(item.sph_value)}</>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {variance === null ? (
                              <span className="text-gray-400">-</span>
                            ) : (
                              <span
                                className={`font-semibold ${
                                  variance > 0
                                    ? "text-green-600"
                                    : variance < 0
                                    ? "text-red-600"
                                    : ""
                                }`}
                              >
                              {formatIDR(variance)}
                              </span>
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