"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGetSalesOrders, apiCreateBillingRequest, canEditDepartment } from "@/lib/api";

type SalesOrderSummary = {
  id: number;
  so_number: string;
  project_code: string;
  status: string;
};

export default function NewBillingRequestPage() {
  const router = useRouter();

  const [salesOrders, setSalesOrders] = useState<SalesOrderSummary[]>([]);
  const [selectedSoId, setSelectedSoId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGetSalesOrders()
      .then((data: any) => setSalesOrders(Array.isArray(data) ? data.filter((so: any) => so.status === "active") : []))
      .catch(() => setSalesOrders([]));
  }, []);

  const submit = async () => {
    if (!selectedSoId) {
      setError("Pilih Sales Order dulu");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError("Amount wajib diisi (> 0)");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const res: any = await apiCreateBillingRequest({
        sales_order_id: selectedSoId,
        amount: Number(amount),
        description,
        notes,
      });
      router.push(`/billing-requests/${res.id}`);
    } catch (e: any) {
      setError(e.message || "Gagal membuat META");
    } finally {
      setSaving(false);
    }
  };

  if (!canEditDepartment("Operations")) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Hanya Operations yang bisa membuat META.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">META (Memo Tagih) Baru</h1>

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Sales Order</label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={selectedSoId}
            onChange={(e) => setSelectedSoId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">-- pilih Sales Order --</option>
            {salesOrders.map((so) => (
              <option key={so.id} value={so.id}>
                {so.so_number} — {so.project_code}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Amount (Rp)</label>
          <input
            type="number"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Deskripsi (opsional)</label>
          <textarea
            className="w-full border rounded-md px-3 py-2 text-sm min-h-[70px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="mis. Tagihan bulan Agustus 2026 — jasa managed service"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Catatan (opsional)</label>
          <textarea
            className="w-full border rounded-md px-3 py-2 text-sm min-h-[70px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <button className="px-3 py-2 border rounded" onClick={() => router.push("/billing-requests")}>
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            disabled={saving || !selectedSoId}
            onClick={submit}
          >
            {saving ? "Saving..." : "Simpan sebagai Draft"}
          </button>
        </div>
      </div>
    </div>
  );
}
