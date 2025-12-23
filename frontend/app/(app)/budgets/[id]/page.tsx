"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { formatIDR } from "@/lib/utils";

// Chart.js safe import
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

// ========================
//        TYPES
// ========================

type Budget = {
  id: number;
  division: string;
  month: string; // "YYYY-MM"
  budget_amount: number;
  total_realization?: number;
  remaining?: number;
  achievement?: number;
};

type Realization = {
  id: number;
  category: string;
  amount: number;
  note?: string | null;
  created_at?: string | null;
};

type BudgetDetailResponse = {
  budget: Budget;
  realization: Realization[];
};

// Kategori fix
const BUDGET_CATEGORIES = [
  "AKOMODASI PERDIN MARKETING",
  "ENT & REP",
  "OPERASIONAL MARKETING",
  "AKOMODASI TENDER",
  "PURCHASE ORDER",
  "FIELD TRIAL LITBANG",
];

// ========================
//      MAIN PAGE
// ========================

export default function BudgetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [budget, setBudget] = useState<Budget | null>(null);
  const [realizations, setRealizations] = useState<Realization[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  // Add Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [categoryInput, setCategoryInput] = useState<string>("");
  const [amountInput, setAmountInput] = useState<string>("");
  const [noteInput, setNoteInput] = useState<string>("");
  const [addError, setAddError] = useState<string>("");

  // Edit Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRealization, setEditingRealization] = useState<Realization | null>(null);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // ========================
  //     LOAD DETAIL
  // ========================

  const loadDetail = async () => {
    try {
      setLoading(true);
      setLoadingError(null);

      const data = await apiGet<BudgetDetailResponse>(`/budgets/${id}`);
      setBudget(data.budget);
      setRealizations(Array.isArray(data.realization) ? data.realization : []);
    } catch (e: any) {
      setLoadingError(e?.message || "Gagal memuat detail budget");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadDetail();
  }, [id]);


  // ========================
  //     FILTERING
  // ========================

  const filteredRealizations = useMemo(() => {
    let data = [...realizations];

    if (categoryFilter !== "All") {
      data = data.filter((r) => r.category === categoryFilter);
    }

    data.sort((a, b) =>
      (a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1
    );

    return data;
  }, [realizations, categoryFilter]);

  // ========================
  //       UTILS
  // ========================

  const formatMonthLabel = (month: string) => {
    if (!month || month.length < 7) return month || "-";

    const [y, m] = month.split("-");
    const monthNames = [
      "Jan","Feb","Mar","Apr","May","Jun",
      "Jul","Aug","Sep","Oct","Nov","Dec",
    ];
    return `${monthNames[Number(m) - 1]} ${y}`;
  };

  const achievementClass = (ach?: number) => {
    if (ach == null) return "";
    if (ach > 100) return "text-red-600 font-semibold";   // overbudget
    if (ach >= 80) return "text-green-600 font-semibold"; // healthy
    return "text-yellow-600 font-semibold";               // warning
  };

  const remainingClass = (rem?: number) => {
    if (rem == null) return "";
    if (rem < 0) return "text-red-600 font-semibold";   // overbudget
    return "text-green-600 font-semibold";              // underbudget
  };

  // ========================
  //    ADD HANDLER
  // ========================

  const openAddModal = () => {
    setCategoryInput("");
    setAmountInput("");
    setNoteInput("");
    setAddError("");
    setAddModalOpen(true);
  };

  const handleAddRealization = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");

    if (!categoryInput) return setAddError("Category wajib dipilih.");

    const value = Number(amountInput);
    if (isNaN(value) || value <= 0)
      return setAddError("Amount harus berupa angka > 0.");

    try {
      setSaving(true);
      await apiPost(`/budgets/${id}/realizations`, {
        category: categoryInput,
        amount: value,
        note: noteInput || undefined,
      });
      setAddModalOpen(false);
      await loadDetail();
    } catch (err: any) {
      setAddError(err?.message || "Gagal menambah realisasi.");
    } finally {
      setSaving(false);
    }
  };

  // ========================
  //    EDIT HANDLER
  // ========================

  const openEditModal = (r: Realization) => {
    setEditingRealization(r);
    setCategoryInput(r.category);
    setAmountInput(String(r.amount));
    setNoteInput(r.note || "");
    setEditError("");
    setEditModalOpen(true);
  };

  const handleEditRealization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRealization) return;

    const value = Number(amountInput);
    if (isNaN(value) || value <= 0) {
      return setEditError("Amount harus > 0");
    }

    try {
      setEditSaving(true);
      await apiPut(
        `/budgets/${id}/realizations/${editingRealization.id}`,
        {
          category: categoryInput,
          amount: value,
          note: noteInput || undefined,
        }
      );
      setEditModalOpen(false);
      await loadDetail();
    } catch (err: any) {
      setEditError(err?.message || "Error updating realization");
    } finally {
      setEditSaving(false);
    }
  };

  // ========================
  //   DELETE HANDLER
  // ========================

  const deleteRealization = async (realId: number) => {
    if (!confirm("Hapus realisasi ini?")) return;

    try {
      await apiDelete(
          `/budgets/${id}/realizations/${realId}`
        );
      await loadDetail();
    } catch (e: any) {
      alert(e?.message || "Gagal menghapus realisasi");
    }
  };

  // ========================
  //     EXPORT CSV
  // ========================

  const exportCsv = () => {
    if (!realizations.length) {
      alert("Tidak ada data realisasi.");
      return;
    }

    const headers = ["Category", "Amount", "Note", "Date"];

    const rows = realizations.map((r) => [
      r.category,
      r.amount,
      r.note ?? "",
      r.created_at
        ? new Date(r.created_at).toLocaleDateString("id-ID")
        : "",
    ]);

    const csv =
      headers.join(",") +
      "\n" +
      rows.map((row) => row.join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `budget-${budget?.division}-${budget?.month}.csv`;
    link.click();
  };

  // ========================
  //     SAFE CHART DATA
  // ========================

  const safeChartData = useMemo(() => {
    if (!realizations.length) return null;

    const groups: Record<string, number> = {};
    realizations.forEach((r) => {
      groups[r.category] = (groups[r.category] || 0) + r.amount;
    });

    const categories = Object.keys(groups);
    const values = Object.values(groups);

    if (!categories.length) return null;

    const colors = [
      "#60a5fa",
      "#34d399",
      "#fbbf24",
      "#f87171",
      "#a78bfa",
      "#fb923c",
    ];

    return {
      labels: categories,
      datasets: [
        {
          label: "Amount",
          data: values,
          backgroundColor: categories.map((_, i) => colors[i % colors.length]),
        },
      ],
    };
  }, [realizations]);


  // ========================
  //      RENDERING
  // ========================

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="p-6 text-red-600">
        Error: {loadingError}
      </div>
    );
  }

  if (!budget) {
    return (
      <div className="p-6 text-gray-500">
        Budget tidak ditemukan.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <button
            className="text-xs text-gray-500 hover:underline"
            onClick={() => router.push("/budgets")}
          >
            ← Back to Budgets
          </button>
          <h2 className="text-2xl font-semibold mt-1">Budget Detail</h2>
          <p className="text-xs text-gray-500">
            {budget.division} — {formatMonthLabel(budget.month)}
          </p>
        </div>

        <Link
          href="/budgets"
          className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
        >
          Back
        </Link>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 border rounded-xl shadow-sm">
          <div className="text-xs text-gray-500">Budget</div>
          <div className="text-base font-semibold">
            Rp {formatIDR(budget.budget_amount)}
          </div>
        </div>
        <div className="bg-white p-4 border rounded-xl shadow-sm">
          <div className="text-xs text-gray-500">Total Realization</div>
          <div className="text-base font-semibold text-green-600">
            Rp {formatIDR(budget.total_realization || 0)}
          </div>
        </div>
        <div className="bg-white p-4 border rounded-xl shadow-sm">
          <div className="text-xs text-gray-500">Remaining</div>
          <div className={`text-base font-semibold ${remainingClass(budget.remaining)}`}>
            Rp {formatIDR(budget.remaining || 0)}
          </div>
        </div>
        <div className="bg-white p-4 border rounded-xl shadow-sm">
          <div className="text-xs text-gray-500">% Achievement</div>
          <div className={`text-base ${achievementClass(budget.achievement)}`}>
            {budget.achievement != null
              ? `${budget.achievement.toFixed(1)}%`
              : "-"}
          </div>
        </div>
      </div>

      {/* CHART */}
      <div className="bg-white p-4 border rounded-xl shadow-sm">
        <h3 className="text-sm font-semibold mb-3">Realisasi per Kategori</h3>
        <div className="h-64">
          {safeChartData ? (
            <Bar
              data={safeChartData}
              options={{ responsive: true, maintainAspectRatio: false }}
            />
          ) : (
            <p className="text-xs text-gray-400">Belum ada data untuk chart</p>
          )}
        </div>
      </div>

      
      {/* FILTER + ACTIONS */}
      <div className="bg-white p-4 border rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <select
          className="border px-3 py-2 rounded-lg text-sm"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="All">All Categories</option>
          {BUDGET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm"
          >
            Export CSV
          </button>

          <button
            onClick={openAddModal}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            + Add Realization
          </button>
        </div>
      </div>

      {/* REALIZATION TABLE */}
      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Note</th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredRealizations.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">
                  Belum ada realisasi.
                </td>
              </tr>
            ) : (
              filteredRealizations.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2">{r.category}</td>
                  <td className="px-3 py-2">
                    {r.note?.trim()
                      ? r.note
                      : <span className="text-gray-400 text-xs">-</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString("id-ID")
                      : "-"}
                  </td>
                  <td className="px-3 py-2 text-right text-green-700">
                    Rp {formatIDR(r.amount)}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <button
                      className="text-blue-600 text-xs"
                      onClick={() => openEditModal(r)}
                    >
                      Edit
                    </button>

                    <button
                      className="text-red-600 text-xs"
                      onClick={() => deleteRealization(r.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ADD REALIZATION MODAL */}
      {addModalOpen && (
        <ModalWrapper>
          <form onSubmit={handleAddRealization} className="p-6 space-y-4">
            <ModalHeader title="Add Realization" onClose={() => setAddModalOpen(false)} />

            <div>
              <label className="text-sm font-medium">Category *</label>
              <select
                className="border rounded-lg w-full px-3 py-2 mt-1"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
              >
                <option value="">-- Select Category --</option>
                {BUDGET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Amount (IDR) *</label>
              <input
                type="number"
                className="border rounded-lg w-full px-3 py-2 mt-1"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Note</label>
              <textarea
                className="border rounded-lg w-full px-3 py-2 mt-1 text-sm"
                rows={3}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
              />
            </div>

            {addError && <ErrorBox msg={addError} />}

            <ModalActions
              onClose={() => setAddModalOpen(false)}
              saving={saving}
            />
          </form>
        </ModalWrapper>
      )}

      {/* EDIT REALIZATION MODAL */}
      {editModalOpen && (
        <ModalWrapper>
          <form onSubmit={handleEditRealization} className="p-6 space-y-4">
            <ModalHeader title="Edit Realization" onClose={() => setEditModalOpen(false)} />

            <div>
              <label className="text-sm font-medium">Category *</label>
              <select
                className="border rounded-lg w-full px-3 py-2 mt-1"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
              >
                {BUDGET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Amount (IDR) *</label>
              <input
                type="number"
                className="border rounded-lg w-full px-3 py-2 mt-1"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Note</label>
              <textarea
                className="border rounded-lg w-full px-3 py-2 mt-1 text-sm"
                rows={3}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
              />
            </div>

            {editError && <ErrorBox msg={editError} />}

            <ModalActions
              onClose={() => setEditModalOpen(false)}
              saving={editSaving}
            />
          </form>
        </ModalWrapper>
      )}
    </div>
  );
}

// ========================
//   COMPONENT HELPERS
// ========================

function ModalWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full mx-3">
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex justify-between items-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
    </div>
  );
}

function ModalActions({
  onClose,
  saving,
}: {
  onClose: () => void;
  saving: boolean;
}) {
  return (
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
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
      {msg}
    </div>
  );
}
