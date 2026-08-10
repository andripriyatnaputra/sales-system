"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiGetMyWorkQueue, apiGetSalesProgress, WorkQueueItem, SalesProgressItem } from "@/lib/api";
import { Card } from "@/components/ui/card";

import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const DEPARTMENT_COPY: Record<string, string> = {
  "Product & Development": "Projects waiting on your solution, BoQ, or design input.",
  Operations:
    "Installation cost input, PRs to raise, BASTs to complete, post-PO monitoring in progress, and META waiting to be submitted.",
  Procurement: "Vendor cost input, and approved Purchase Requests waiting for a PO.",
  Finance:
    "Pricing input on new projects, vendor payments currently due, META waiting to become an Invoice, and overdue Invoices.",
};

const TYPE_LABEL: Record<string, string> = {
  presales_boq_pending: "Presales",
  presales_installation_pending: "Presales",
  presales_vendorcost_pending: "Presales",
  presales_price_pending: "Presales",
  so_needs_pr: "Needs PR",
  po_needs_bast: "Needs BAST",
  postpo_incomplete: "Post-PO",
  pr_needs_po: "Needs PO",
  payment_due: "Payment Due",
  handed_over_to_ms: "Recurring — Handed Over",
  meta_needs_submit: "META Draft",
  meta_needs_invoice: "Needs Invoice",
  invoice_overdue: "Invoice Overdue",
};

function relativeAge(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function ageInDays(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// Bucket urgensi DALAM "pending" (bukan status baru, murni turunan created_at) --
// threshold 3/14 hari dikalibrasi utk siklus task internal ProDev/Ops/Procurement/
// Finance, BEDA dari AR/AP aging (30/60/90 hari) yang basisnya piutang customer.
type Bucket = "not_responded" | "aging" | "overdue";

const BUCKET_LABEL: Record<Bucket, string> = {
  not_responded: "Belum Direspon",
  aging: "Aging",
  overdue: "Overdue",
};

const BUCKET_CARD_STYLE: Record<Bucket, string> = {
  not_responded: "border-blue-200 bg-blue-50",
  aging: "border-amber-200 bg-amber-50",
  overdue: "border-rose-200 bg-rose-50",
};

const BUCKET_TEXT_STYLE: Record<Bucket, string> = {
  not_responded: "text-blue-700",
  aging: "text-amber-700",
  overdue: "text-rose-700",
};

function getBucket(iso: string): Bucket {
  const days = ageInDays(iso);
  if (days <= 3) return "not_responded";
  if (days <= 14) return "aging";
  return "overdue";
}

function KPITile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Card>
  );
}

// BreakdownChart: klik salah satu bar utk filter tabel di bawahnya ke label
// itu (mis. klik "NetCo" -> tabel cuma tampilkan item NetCo). Klik bar yang
// SAMA lagi -> filter di-clear (toggle). Bar yang lagi aktif disorot beda
// warna supaya jelas filter mana yang sedang jalan.
function BreakdownChart({
  title,
  labels,
  values,
  active,
  onSelect,
}: {
  title: string;
  labels: string[];
  values: number[];
  active?: string | null;
  onSelect?: (label: string) => void;
}) {
  if (labels.length === 0) return null;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{title}</div>
        {active && (
          <button className="text-xs text-blue-600 hover:underline" onClick={() => onSelect?.(active)}>
            Clear filter ✕
          </button>
        )}
      </div>
      <div style={{ height: 180 }}>
        <Bar
          data={{
            labels,
            datasets: [
              {
                data: values,
                backgroundColor: labels.map((l) =>
                  active && l !== active ? "rgba(59,130,246,0.25)" : "rgba(59,130,246,0.85)"
                ),
              },
            ],
          }}
          options={{
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { font: { size: 10 } } }, y: { ticks: { precision: 0 } } },
            onClick: (_evt, elements) => {
              if (!onSelect || !elements.length) return;
              const idx = elements[0].index;
              onSelect(labels[idx]);
            },
            onHover: (evt, elements) => {
              const target = evt.native?.target as HTMLElement | undefined;
              if (target) target.style.cursor = onSelect && elements.length ? "pointer" : "default";
            },
          }}
        />
      </div>
    </Card>
  );
}

type SortDir = "asc" | "desc";
function toggleSort<K extends string>(
  key: K,
  current: { key: K; dir: SortDir } | null,
  setSort: (v: { key: K; dir: SortDir }) => void
) {
  if (current?.key === key) {
    setSort({ key, dir: current.dir === "asc" ? "desc" : "asc" });
  } else {
    setSort({ key, dir: "asc" });
  }
}

function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onClick,
}: {
  label: string;
  sortKey: K;
  sort: { key: K; dir: SortDir } | null;
  onClick: () => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <th
      className="px-3 py-2 text-left cursor-pointer select-none hover:bg-gray-200"
      onClick={onClick}
      title="Klik utk urutkan"
    >
      {label} {active ? (sort!.dir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}

const DIVISION_TABS = ["Semua", "IT Solutions", "NetCo", "Oil Mining & Goverments"] as const;

type SalesSortKey = "project_code" | "customer_name" | "aging_days";

function SalesProgressBoard() {
  const [projects, setProjects] = useState<SalesProgressItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);
  const [tab, setTab] = useState<(typeof DIVISION_TABS)[number]>("Semua");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SalesSortKey; dir: SortDir } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetSalesProgress();
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setIsAdminView(data.division === "ALL");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = projects;
    if (isAdminView && tab !== "Semua") {
      list = list.filter((p) => p.division === tab);
    }
    if (deptFilter) {
      list = list.filter((p) => (p.blocking_department || "Lainnya") === deptFilter);
    }
    const q = search.toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.project_code.toLowerCase().includes(q) ||
          (p.customer_name || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q)
      );
    }
    if (sort) {
      list = [...list].sort((a, b) => {
        let av: string | number = "";
        let bv: string | number = "";
        if (sort.key === "aging_days") {
          av = a.aging_days ?? -1;
          bv = b.aging_days ?? -1;
        } else {
          av = (a[sort.key] || "").toString().toLowerCase();
          bv = (b[sort.key] || "").toString().toLowerCase();
        }
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [projects, isAdminView, tab, deptFilter, search, sort]);

  const FINISHED_LABELS = new Set(["Selesai", "Closed (Loss/Drop)", "On Hold"]);
  const active = projects.filter((p) => !FINISHED_LABELS.has(p.bottleneck_label));
  const oldestWaiting = active.reduce((max, p) => Math.max(max, p.aging_days ?? 0), 0);

  const byDept: Record<string, number> = {};
  for (const p of active) {
    const dept = p.blocking_department || "Lainnya";
    byDept[dept] = (byDept[dept] || 0) + 1;
  }

  const doSort = (key: SalesSortKey) => toggleSort(key, sort, setSort);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
        <KPITile label="Request Aktif" value={active.length} />
        <KPITile label="Menunggu Paling Lama" value={active.length ? `${oldestWaiting} hari` : "-"} />
      </div>

      <BreakdownChart
        title="Distribusi Bottleneck per Departemen (klik utk filter)"
        labels={Object.keys(byDept)}
        values={Object.values(byDept)}
        active={deptFilter}
        onSelect={(label) => setDeptFilter((cur) => (cur === label ? null : label))}
      />

      {isAdminView && (
        <div className="flex gap-2 border-b">
          {DIVISION_TABS.map((d) => (
            <button
              key={d}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === d ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground"
              }`}
              onClick={() => setTab(d)}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <input
          className="border rounded-lg px-3 py-2 text-sm w-56"
          placeholder="Cari project / customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <SortHeader label="Project" sortKey="project_code" sort={sort} onClick={() => doSort("project_code")} />
              <SortHeader label="Customer" sortKey="customer_name" sort={sort} onClick={() => doSort("customer_name")} />
              {isAdminView && <th className="px-3 py-2 text-left">Sub-Tim</th>}
              <th className="px-3 py-2 text-left">Status</th>
              <SortHeader label="Menunggu" sortKey="aging_days" sort={sort} onClick={() => doSort("aging_days")} />
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isAdminView ? 6 : 5} className="p-4 text-center">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={isAdminView ? 6 : 5} className="p-4 text-center text-muted-foreground">
                  Tidak ada request aktif.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.project_id} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    {p.project_code}
                    <div className="text-xs text-muted-foreground font-normal">{p.description}</div>
                  </td>
                  <td className="px-3 py-2">{p.customer_name || "-"}</td>
                  {isAdminView && <td className="px-3 py-2">{p.division}</td>}
                  <td className="px-3 py-2">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                      {p.bottleneck_label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {p.aging_days != null ? `${p.aging_days} hari` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/projects/${p.project_id}`} className="text-blue-600 hover:underline">
                      Detail
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type WorkItemSortKey = "code" | "title" | "created_at";

function DepartmentWorkList({ department }: { department: string }) {
  const [items, setItems] = useState<WorkQueueItem[]>([]);
  const [byDivision, setByDivision] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string | null>(null);
  const [bucketFilter, setBucketFilter] = useState<Bucket | null>(null);
  const [sort, setSort] = useState<{ key: WorkItemSortKey; dir: SortDir } | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetMyWorkQueue();
      setItems(Array.isArray(data.items) ? data.items : []);
      setByDivision(data.by_division || {});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, divisionFilter, bucketFilter, sort]);

  const bucketCounts = useMemo(() => {
    const counts: Record<Bucket, number> = { not_responded: 0, aging: 0, overdue: 0 };
    for (const it of items) counts[getBucket(it.created_at)]++;
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (divisionFilter) {
      list = list.filter((it) => it.division === divisionFilter);
    }
    if (bucketFilter) {
      list = list.filter((it) => getBucket(it.created_at) === bucketFilter);
    }
    const q = search.toLowerCase();
    if (q) {
      list = list.filter(
        (it) =>
          it.code.toLowerCase().includes(q) ||
          it.title.toLowerCase().includes(q) ||
          (it.detail || "").toLowerCase().includes(q)
      );
    }
    if (sort) {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        if (sort.key === "created_at") {
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        } else {
          cmp = a[sort.key].toLowerCase() < b[sort.key].toLowerCase() ? -1 : a[sort.key].toLowerCase() > b[sort.key].toLowerCase() ? 1 : 0;
        }
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [items, divisionFilter, bucketFilter, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const showTypeColumn = useMemo(
    () => new Set(items.map((it) => it.entity_type)).size > 1,
    [items]
  );

  const oldestDays = items.reduce((max, it) => Math.max(max, ageInDays(it.created_at)), 0);
  const doSort = (key: WorkItemSortKey) => toggleSort(key, sort, setSort);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">My Work</h2>
          <p className="text-sm text-muted-foreground">
            {DEPARTMENT_COPY[department] || "Item yang menunggu tindak lanjut Anda."}
          </p>
          <Link href="/approvals?mine=true" className="text-sm text-blue-600 hover:underline">
            See items already in approval →
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="border rounded-lg px-3 py-2 text-sm w-56"
            placeholder="Cari..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KPITile label="Total Pending" value={items.length} />
        <KPITile label="Item Tertua" value={items.length ? `${oldestDays} hari` : "-"} />
        <div className="md:col-span-1">
          <BreakdownChart
            title="Distribusi per Sub-Tim Sales (klik utk filter)"
            labels={Object.keys(byDivision)}
            values={Object.values(byDivision)}
            active={divisionFilter}
            onSelect={(label) => setDivisionFilter((cur) => (cur === label ? null : label))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(["not_responded", "aging", "overdue"] as const).map((b) => {
          const active = bucketFilter === b;
          return (
            <Card
              key={b}
              className={`p-4 cursor-pointer hover:shadow-md transition ${BUCKET_CARD_STYLE[b]} ${
                active ? "ring-2 ring-blue-500" : ""
              }`}
              onClick={() => setBucketFilter((cur) => (cur === b ? null : b))}
            >
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="flex items-end justify-between">
                <div className="text-lg font-semibold">{BUCKET_LABEL[b]}</div>
                <div className="text-2xl font-semibold">{bucketCounts[b]}</div>
              </div>
              {active && <div className="text-[11px] text-muted-foreground mt-1">Click again to clear</div>}
            </Card>
          );
        })}
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              {showTypeColumn && <th className="px-3 py-2 text-left">Type</th>}
              <SortHeader label="Code" sortKey="code" sort={sort} onClick={() => doSort("code")} />
              <SortHeader label="Title" sortKey="title" sort={sort} onClick={() => doSort("title")} />
              <th className="px-3 py-2 text-left">Detail</th>
              <th className="px-3 py-2 text-left">Sub-Tim</th>
              <SortHeader label="Age" sortKey="created_at" sort={sort} onClick={() => doSort("created_at")} />
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={showTypeColumn ? 7 : 6} className="p-4 text-center">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={showTypeColumn ? 7 : 6} className="p-4 text-center text-muted-foreground">
                  Nothing pending — you're all caught up.
                </td>
              </tr>
            ) : (
              paged.map((it) => (
                <tr key={`${it.entity_type}-${it.entity_id}`} className="border-t">
                  {showTypeColumn && (
                    <td className="px-3 py-2">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {TYPE_LABEL[it.entity_type] || it.entity_type}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium">{it.code}</td>
                  <td className="px-3 py-2">{it.title}</td>
                  <td className="px-3 py-2">{it.detail || "-"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{it.division || "-"}</td>
                  <td className={`px-3 py-2 font-medium ${BUCKET_TEXT_STYLE[getBucket(it.created_at)]}`}>
                    {relativeAge(it.created_at)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={it.link} className="text-blue-600 hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center text-sm">
        <div>
          Page {page} of {totalPages}
        </div>
        <div className="space-x-2">
          <button
            className="px-2 py-1 border rounded disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Prev
          </button>
          <button
            className="px-2 py-1 border rounded disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MyWorkPage() {
  const [department, setDepartment] = useState<string>("");
  const [loadedDept, setLoadedDept] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet<any>("/me");
        setDepartment(String(res?.department || ""));
      } catch {
        setDepartment("");
      } finally {
        setLoadedDept(true);
      }
    })();
  }, []);

  if (!loadedDept) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  if (department === "Sales") {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold">My Work</h2>
          <p className="text-sm text-muted-foreground">
            Progress request Anda yang sedang berjalan di ProDev, Operations, Procurement, dan Finance.
          </p>
        </div>
        <SalesProgressBoard />
      </div>
    );
  }

  return (
    <div className="p-6">
      <DepartmentWorkList department={department} />
    </div>
  );
}
