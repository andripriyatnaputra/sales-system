"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiGetProjectSPHDetails, apiGetProjectSPHSummary } from "@/lib/api";

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

type SPHSummaryResponse = {
  released_count: number;
  released_value: number;
  statuses: SPHStatusSummary[];
  aging: SPHAgingBucket[];
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

export default function ProjectSPHPage() {
  const [summary, setSummary] = useState<SPHSummaryResponse | null>(null);
  const [details, setDetails] = useState<SPHDetailItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [division, setDivision] = useState("All");
  const [customerId, setCustomerId] = useState("All");
  const [status, setStatus] = useState("All");
  const [projectType, setProjectType] = useState("All");
  const [salesStage, setSalesStage] = useState("All");
  const [sphStatus, setSphStatus] = useState("All");
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

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [division, customerId, status, projectType, salesStage, sphStatus, startMonth, endMonth]);

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
      map.set(normalized, {
        ...item,
        status: normalized,
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

    return data.sort((a, b) => Number(b.target_value || 0) - Number(a.target_value || 0));
  }, [details, search]);

  const topCountStatus = useMemo(() => topStatusByCount(statusCards), [statusCards]);
  const topValueStatus = useMemo(() => topStatusByValue(statusCards), [statusCards]);

  const criticalAging = useMemo(() => {
    return sortedAging.find((item) => item.label === ">30 days") || null;
  }, [sortedAging]);

  const criticalAgingContribution = useMemo(() => {
    return criticalAging
      ? getContribution(
          Number(criticalAging.target_value || 0),
          Number(summary?.released_value || 0)
        )
      : "0.0";
  }, [criticalAging, summary]);

  const resetFilters = () => {
    setSearch("");
    setCustomerId("All");
    setStatus("All");
    setProjectType("All");
    setSalesStage("All");
    setSphStatus("All");
    setStartMonth("");
    setEndMonth("");

    if ((me?.role || "").toLowerCase() === "user" && me?.division) {
      setDivision(String(me.division));
    } else {
      setDivision("All");
    }
  };

  const userIsRestrictedDivision = (me?.role || "").toLowerCase() === "user";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">SPH Management</h1>
          <p className="text-sm text-gray-500">
            Monitoring status SPH, nilai target, aging, dan detail project terkait.
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl shadow-sm p-4">
              <div className="text-xs text-slate-600">Total SPH Released</div>
              <div className="mt-2 text-2xl font-semibold">{summary?.released_count || 0}</div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl shadow-sm p-4">
              <div className="text-xs text-blue-700">Released Value</div>
              <div className="mt-2 text-xl font-semibold">
                Rp {compactIDR(summary?.released_value || 0)}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-4">
              <div className="text-xs text-amber-700">Top Status by Count</div>
              <div className="mt-2 text-base font-semibold">
                {topCountStatus ? topCountStatus.status : "-"}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                {topCountStatus ? `${topCountStatus.count} projects` : "-"}
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-xl shadow-sm p-4">
              <div className="text-xs text-orange-700">Top Status by Value</div>
              <div className="mt-2 text-base font-semibold">
                {topValueStatus ? topValueStatus.status : "-"}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                {topValueStatus ? `Rp ${compactIDR(topValueStatus.target_value || 0)}` : "-"}
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

          <div className="bg-white border rounded-xl shadow-sm p-4">
            <div className="font-semibold">Management Insight</div>
            <div className="mt-2 text-sm text-gray-700 space-y-1">
              <div>
                {topValueStatus
                  ? `${topValueStatus.status} memiliki nilai SPH terbesar sebesar Rp ${compactIDR(
                      topValueStatus.target_value || 0
                    )}.`
                  : "Belum ada data status SPH."}
              </div>
              <div>
                {criticalAging
                ? `${criticalAgingContribution}% nilai SPH aktif (Open/Hold) berada pada bucket ${criticalAging.label}, perlu perhatian lebih untuk percepatan closing.`
                : "Belum ada aging kritis untuk SPH aktif."}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {statusCards.map((item) => {
                const highlightDetails = item.status === "Win";

                return (
                    <div
                    key={item.status}
                    className={`border rounded-xl shadow-sm p-4 cursor-pointer hover:shadow-md transition ${
                        sphStatus === item.status ? "ring-2 ring-blue-500 border-blue-500" : ""
                    } ${statusCardStyle(item.status)}`}
                    onClick={() =>
                        setSphStatus((prev) => (prev === item.status ? "All" : item.status))
                    }
                    >
                    <div className="text-xs text-gray-500">SPH Status</div>
                    <div className="mt-1 text-lg font-semibold">{item.status}</div>

                    <div className="mt-3 text-2xl font-semibold">{item.count || 0}</div>
                    <div className="text-xs text-gray-500">Projects</div>

                    <div className="mt-4">
                        <div className="text-xs text-gray-500">Target Value</div>
                        <div className="font-semibold">
                        Rp {compactIDR(item.target_value || 0)}
                        </div>
                    </div>

                    {highlightDetails && (
                        <>
                        <div className="mt-2">
                            <div className="text-xs text-gray-500">% of Total SPH Value</div>
                            <div className="font-medium">
                            {getContribution(
                                Number(item.target_value || 0),
                                Number(summary?.released_value || 0)
                            )}%
                            </div>
                        </div>

                        <div className="mt-2">
                            <div className="text-xs text-gray-500">Avg / Project</div>
                            <div className="font-medium">
                            Rp {compactIDR(item.avg_target_value || 0)}
                            </div>
                        </div>
                        </>
                    )}
                    </div>
                );
            })}
          </div>

          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <div className="font-semibold">SPH Aging</div>
              <div className="text-xs text-gray-500 mt-1">
                Distribusi aging untuk SPH aktif (Open/Hold) berdasarkan umur sejak tanggal release.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-4">
              {sortedAging.length === 0 ? (
                <div className="text-sm text-gray-500 px-1">No aging data found.</div>
              ) : (
                sortedAging.map((item) => (
                  <div
                    key={item.label}
                    className={`border rounded-xl p-4 ${agingCardStyle(item.label)}`}
                  >
                    <div className="text-xs text-gray-500">{item.label}</div>
                    <div className="mt-2 text-2xl font-semibold">{item.count || 0}</div>
                    <div className="text-xs text-gray-500">Projects</div>
                    <div className="mt-3 font-medium">
                      Rp {compactIDR(item.target_value || 0)}
                    </div>
                    <div className="mt-2 text-sm text-gray-600">
                      {getContribution(
                        Number(item.target_value || 0),
                        Number(summary?.released_value || 0)
                      )}% of total
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <div className="font-semibold">SPH Details</div>
              <div className="text-xs text-gray-500 mt-1">
                {filteredDetails.length} project(s)
              </div>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[1400px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-3 text-left">Project Code</th>
                    <th className="px-3 py-3 text-left">Customer</th>
                    <th className="px-3 py-3 text-left">Division</th>
                    <th className="px-3 py-3 text-left">Stage</th>
                    <th className="px-3 py-3 text-left">SPH Number</th>
                    <th className="px-3 py-3 text-left">SPH Date</th>
                    <th className="px-3 py-3 text-left">Aging</th>
                    <th className="px-3 py-3 text-left">SPH Status</th>
                    <th className="px-3 py-3 text-left">Reason</th>
                    <th className="px-3 py-3 text-right">Target Value</th>
                    <th className="px-3 py-3 text-right">Realization</th>
                    <th className="px-3 py-3 text-left">Period</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDetails.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                        No SPH data found.
                      </td>
                    </tr>
                  ) : (
                    filteredDetails.map((item) => {
                      const periodText =
                        item.start_month && item.end_month
                          ? `${item.start_month} s/d ${item.end_month}`
                          : item.start_month || item.end_month || "-";

                      const agingDays = getAgingDays(item.sph_release_date);
                      const normalizedStatus = normalizeStatus(item.sph_status);

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
                          <td className="px-3 py-3">{item.customer_name || "-"}</td>
                          <td className="px-3 py-3">{item.division || "-"}</td>
                          <td className="px-3 py-3">
                            {item.sales_stage}. {stageLabel(item.sales_stage)}
                          </td>
                          <td className="px-3 py-3">{item.sph_number || "-"}</td>
                          <td className="px-3 py-3">
                            {item.sph_release_date
                              ? String(item.sph_release_date).slice(0, 10)
                              : "-"}
                          </td>
                          <td className="px-3 py-3">
                            {(() => {
                              const normalizedStatus = normalizeStatus(item.sph_status);
                              const agingAllowed = normalizedStatus === "Open" || normalizedStatus === "Hold";

                              if (!agingAllowed || agingDays === null) {
                                return <span className="text-gray-400">-</span>;
                              }

                              return (
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
                              );
                            })()}
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
                            Rp {formatIDR(item.target_value || 0)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            Rp {formatIDR(item.realization_value || 0)}
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
        </>
      )}
    </div>
  );
}