"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { DIVISIONS } from "@/lib/constants";
import { formatIDR } from "@/lib/utils";

// Chart
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);

// ---------- Types ----------

type Budget = {
  id: number;
  division: string;
  month: string; // "YYYY-MM"
  budget_amount: number;
  total_realization?: number;
  remaining?: number;
  achievement?: number;
};

type TrendPoint = {
  month: string;       // "YYYY-MM"
  budget: number;
  realization: number;
};

type Me = {
  role: string;
  division: string;
};

// ---------- Main Page ----------

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string>("All");
  const [yearFilter, setYearFilter] = useState<string>("All");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Modal edit budget
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);

  // Modal create budget
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Trend data
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  // ---------- Load Budgets ----------

  const loadBudgets = async () => {
    try {
      setLoading(true);
      setLoadingError(null);

      const data = await apiGet<Budget[]>("/budgets");
      setBudgets(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setLoadingError(e?.message || "Gagal memuat data budget");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBudgets();
    apiGet<Me>("/me")
      .then((res) => {
        setMe({
          role: String(res?.role || ""),
          division: String(res?.division || ""),
        });
      })
      .catch(() => setMe(null));
  }, []);

  // Reset page ketika filter/search berubah
  useEffect(() => {
    setPage(1);
  }, [search, divisionFilter, yearFilter]);

  // ---------- Year Options (dinamis dari data) ----------

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    budgets.forEach((b) => {
      if (b.month && b.month.length >= 4) {
        years.add(b.month.slice(0, 4));
      }
    });
    return Array.from(years).sort();
  }, [budgets]);

  // ---------- Filtering & Sorting ----------

  const filteredSorted = useMemo(() => {
    let data = [...budgets];

    if (divisionFilter !== "All") {
      data = data.filter((b) => b.division === divisionFilter);
    }

    if (yearFilter !== "All") {
      data = data.filter(
        (b) => b.month && b.month.startsWith(yearFilter)
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        (b) =>
          b.division.toLowerCase().includes(q) ||
          b.month.toLowerCase().includes(q)
      );
    }

    // sort by month ascending
    data.sort((a, b) => {
      const av = a.month || "";
      const bv = b.month || "";
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });

    return data;
  }, [budgets, divisionFilter, yearFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / pageSize));
  const paged = filteredSorted.slice((page - 1) * pageSize, page * pageSize);

  // ---------- Helpers ----------

  const formatMonthLabel = (month: string) => {
    // month = "YYYY-MM"
    if (!month || month.length < 7) return month || "-";
    const [y, m] = month.split("-");
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const idx = Number(m) - 1;
    const name = monthNames[idx] || m;
    return `${name} ${y}`;
  };

  const achievementClass = (ach?: number) => {
    if (ach == null) return "";
    if (ach >= 100) return "text-red-600 font-semibold";
    if (ach >= 80) return "text-yellow-600 font-semibold";
    return "text-green-600 font-semibold";
  };

  const remainingClass = (rem?: number) => {
    if (rem == null) return "";
    if (rem < 0) return "text-red-600 font-semibold";
    return "";
  };

  const openEditBudget = (b: Budget) => {
    setSelectedBudget(b);
    setEditModalOpen(true);
  };

  const handleSaveBudgetAmount = async (id: number, newAmount: number) => {
    await apiPut(`/budgets/${id}`, { budget_amount: newAmount });
    await loadBudgets();
  };

  const handleExportCsv = () => {
    if (!filteredSorted.length) {
      alert("Tidak ada data yang dapat diexport.");
      return;
    }

    const headers = [
      "Month",
      "Division",
      "Budget",
      "Realization",
      "Achievement (%)",
      "Remaining",
    ];

    const rows = filteredSorted.map((b) => [
      b.month,
      b.division,
      b.budget_amount,
      b.total_realization ?? 0,
      b.achievement?.toFixed(1) ?? "0",
      b.remaining ?? 0,
    ]);

    const csv =
      headers.join(",") +
      "\n" +
      rows.map((r) => r.join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "budgets_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------- Load Trend (Budget vs Realisasi per bulan) ----------

  const loadTrend = async (division: string, year: string) => {
    try {
      setTrendLoading(true);
      setTrendError(null);

      const data = await apiGet<{ trend: TrendPoint[] }>(
        `/budgets/trend?division=${encodeURIComponent(
          division
        )}&year=${encodeURIComponent(year)}`
      );

      setTrend(Array.isArray(data.trend) ? data.trend : []);
    } catch (e: any) {
      setTrendError(e?.message || "Gagal memuat data trend.");
      setTrend([]);
    } finally {
      setTrendLoading(false);
    }
  };

  useEffect(() => {
    // load trend hanya jika division & year spesifik
    if (divisionFilter !== "All" && yearFilter !== "All") {
      loadTrend(divisionFilter, yearFilter);
    } else {
      setTrend([]);
    }
  }, [divisionFilter, yearFilter]);

  const monthlyTrendData = useMemo(() => {
    if (!trend.length) return null;

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    const labels = trend.map((t) => {
      const [y, m] = t.month.split("-");
      const idx = Number(m) - 1;
      return `${monthNames[idx] || m} ${y}`;
    });

    const budgetsData = trend.map((t) => t.budget);
    const realizationsData = trend.map((t) => t.realization);

    return {
      labels,
      datasets: [
        {
          label: "Budget",
          data: budgetsData,
          borderColor: "#4f46e5",
          backgroundColor: "rgba(79,70,229,0.3)",
          fill: true,
          tension: 0.3,
        },
        {
          label: "Realization",
          data: realizationsData,
          borderColor: "#10b981",
          backgroundColor: "rgba(16,185,129,0.3)",
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }, [trend]);

  // ---------- Render ----------

  return (
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Budgets</h2>
          <p className="text-xs text-gray-500">
            Budget marketing per division &amp; per month
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
            onClick={() => setCreateModalOpen(true)}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            + Add Budget
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div className="bg-white p-4 border rounded-xl shadow-sm space-y-3">
        <input
          placeholder="Search by month or division..."
          className="border px-3 py-2 rounded-lg w-full text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="flex gap-2 flex-wrap">
          {/* Division Filter */}
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

          {/* Year Filter */}
          <select
            className="border px-3 py-2 rounded-lg text-sm"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="All">All Years</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TREND CHART */}
      {divisionFilter !== "All" && yearFilter !== "All" && (
        <div className="bg-white p-4 border rounded-xl shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold">
              Trend Bulanan (Budget vs Realisasi)
            </h3>
            <div className="text-xs text-gray-500">
              {divisionFilter} — {yearFilter}
            </div>
          </div>

          <div className="h-72">
            {trendLoading ? (
              <div className="text-xs text-gray-500">Loading trend...</div>
            ) : trendError ? (
              <div className="text-xs text-red-600">{trendError}</div>
            ) : monthlyTrendData ? (
              <Line
                data={monthlyTrendData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: "top" as const },
                  },
                  scales: {
                    y: { beginAtZero: true },
                  },
                }}
              />
            ) : (
              <p className="text-xs text-gray-400">
                Belum ada data trend untuk kombinasi Division &amp; Year ini.
              </p>
            )}
          </div>
        </div>
      )}

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
                <th className="px-3 py-2 text-left">Month</th>
                <th className="px-3 py-2 text-left">Division</th>
                <th className="px-3 py-2 text-right">Budget</th>
                <th className="px-3 py-2 text-right">Realization</th>
                <th className="px-3 py-2 text-right">% Ach</th>
                <th className="px-3 py-2 text-right">Remaining</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-4 text-center text-gray-500"
                  >
                    No budget data.
                  </td>
                </tr>
              ) : (
                paged.map((b) => (
                  <tr key={b.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <Link
                        href={`/budgets/${b.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {formatMonthLabel(b.month)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{b.division}</td>
                    <td className="px-3 py-2 text-right">
                      Rp {formatIDR(b.budget_amount || 0)}
                    </td>
                    <td className="px-3 py-2 text-right text-green-700">
                      Rp {formatIDR(b.total_realization || 0)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={achievementClass(b.achievement)}>
                        {b.achievement != null
                          ? `${b.achievement.toFixed(1)}%`
                          : "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={remainingClass(b.remaining)}>
                        Rp {formatIDR(b.remaining || 0)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right space-x-3">
                      <button
                        className="text-blue-600 text-xs"
                        onClick={() => openEditBudget(b)}
                      >
                        Edit Budget
                      </button>
                      <Link
                        href={`/budgets/${b.id}`}
                        className="text-gray-700 text-xs underline"
                      >
                        Detail
                      </Link>
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
            onClick={() => setPage(page - 1)}
          >
            Prev
          </button>
          <button
            className="px-2 py-1 border rounded"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {editModalOpen && selectedBudget && (
        <EditBudgetModal
          budget={selectedBudget}
          onClose={() => setEditModalOpen(false)}
          onSaved={handleSaveBudgetAmount}
        />
      )}

      {createModalOpen && (
        <CreateBudgetModal
          onClose={() => setCreateModalOpen(false)}
          onCreated={loadBudgets}
          me={me}
        />
      )}
    </div>
  );
}

// ---------- Edit Budget Modal ----------

type EditBudgetModalProps = {
  budget: Budget;
  onClose: () => void;
  onSaved: (id: number, newAmount: number) => Promise<void>;
};

function EditBudgetModal({ budget, onClose, onSaved }: EditBudgetModalProps) {
  const [amountInput, setAmountInput] = useState<string>(
    budget.budget_amount ? String(budget.budget_amount) : ""
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const totalReal = budget.total_realization || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const value = Number(amountInput);
    if (isNaN(value) || value < 0) {
      setError("Budget amount harus berupa angka ≥ 0.");
      return;
    }
    if (value < totalReal) {
      setError(
        `Budget tidak boleh lebih kecil dari total realisasi (${formatIDR(
          totalReal
        )}).`
      );
      return;
    }

    try {
      setSaving(true);
      await onSaved(budget.id, value);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan budget.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full mx-3">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Edit Budget</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 text-lg"
            >
              ✕
            </button>
          </div>

          <div className="text-xs text-gray-500">
            {budget.division} — {budget.month}
          </div>

          <div>
            <label className="text-sm font-medium">Budget Amount (IDR)</label>
            <input
              type="number"
              className="border rounded-lg w-full px-3 py-2 mt-1"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              min={0}
            />
            <p className="text-xs text-gray-500 mt-1">
              Total realisasi saat ini: Rp {formatIDR(totalReal)}
            </p>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
              {error}
            </div>
          )}

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
              {saving ? "Saving..." : "Save Budget"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Create Budget Modal ----------

function CreateBudgetModal({
  onClose,
  onCreated,
  me,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
  me: Me | null;
}) {
  const meRole = me?.role || "";
  const meDiv = me?.division || "";
  const lockedDivision = meRole === "user" && meDiv ? meDiv : null;

  const [division, setDivision] = useState(lockedDivision || "IT Solutions");
  const [month, setMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lockedDivision) {
      setDivision(lockedDivision);
    }
  }, [lockedDivision]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!month) {
      setError("Month wajib dipilih.");
      return;
    }

    const value = Number(amount);
    if (isNaN(value) || value < 0) {
      setError("Budget amount harus ≥ 0.");
      return;
    }

    try {
      setSaving(true);
      await apiPost("/budgets", {
        division,
        month,
        budget_amount: value,
      });
      await onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Gagal membuat budget.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full mx-3">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Create Budget</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 text-lg"
            >
              ✕
            </button>
          </div>

          <div>
            <label className="text-sm font-medium">Division *</label>
            <select
              className="border rounded-lg w-full px-3 py-2 mt-1"
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              disabled={!!lockedDivision}
            >
              {DIVISIONS.filter((d) => d !== "All").map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            {lockedDivision && (
              <p className="text-xs text-gray-500 mt-1">
                Division dikunci sesuai akun.
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Month *</label>
            <input
              type="month"
              className="border rounded-lg w-full px-3 py-2 mt-1"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Budget Amount *</label>
            <input
              type="number"
              className="border rounded-lg w-full px-3 py-2 mt-1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
              {error}
            </div>
          )}

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
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
            >
              {saving ? "Saving..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
