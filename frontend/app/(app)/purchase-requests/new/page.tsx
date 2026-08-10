"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGetSalesOrders, apiGetSalesOrder, apiCreatePurchaseRequest, canEditDepartment } from "@/lib/api";
import { formatIDR } from "@/lib/utils";

type SalesOrderSummary = {
  id: number;
  so_number: string;
  project_code: string;
  status: string;
};

type SalesOrderItem = {
  id: number;
  item_name: string;
  unit?: string | null;
  qty: number;
  vendor_cost?: number | null;
};

type ItemSelection = {
  selected: boolean;
  qty: string;
  estimatedUnitCost: string;
};

export default function NewPurchaseRequestPage() {
  const router = useRouter();

  const [salesOrders, setSalesOrders] = useState<SalesOrderSummary[]>([]);
  const [selectedSoId, setSelectedSoId] = useState<number | "">("");
  const [soItems, setSoItems] = useState<SalesOrderItem[]>([]);
  const [selections, setSelections] = useState<Record<number, ItemSelection>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGetSalesOrders()
      .then((data: any) => setSalesOrders(Array.isArray(data) ? data.filter((so: any) => so.status === "active") : []))
      .catch(() => setSalesOrders([]));
  }, []);

  useEffect(() => {
    if (!selectedSoId) {
      setSoItems([]);
      setSelections({});
      return;
    }
    apiGetSalesOrder(selectedSoId).then((so: any) => {
      const items: SalesOrderItem[] = so.items || [];
      setSoItems(items);
      const init: Record<number, ItemSelection> = {};
      items.forEach((it) => {
        init[it.id] = {
          selected: false,
          qty: String(it.qty),
          estimatedUnitCost: it.vendor_cost != null ? String(it.vendor_cost) : "",
        };
      });
      setSelections(init);
    });
  }, [selectedSoId]);

  const toggleItem = (itemId: number) => {
    setSelections((prev) => ({ ...prev, [itemId]: { ...prev[itemId], selected: !prev[itemId].selected } }));
  };

  const updateSelection = (itemId: number, field: "qty" | "estimatedUnitCost", value: string) => {
    setSelections((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  };

  const selectedCount = Object.values(selections).filter((s) => s.selected).length;
  const estimatedTotal = soItems.reduce((sum, it) => {
    const sel = selections[it.id];
    if (!sel?.selected) return sum;
    const qty = Number(sel.qty) || 0;
    const cost = Number(sel.estimatedUnitCost) || 0;
    return sum + qty * cost;
  }, 0);

  const submit = async () => {
    if (!selectedSoId) {
      setError("Pilih Sales Order dulu");
      return;
    }
    const items = soItems
      .filter((it) => selections[it.id]?.selected)
      .map((it) => ({
        sales_order_item_id: it.id,
        qty: Number(selections[it.id].qty) || it.qty,
        estimated_unit_cost: selections[it.id].estimatedUnitCost ? Number(selections[it.id].estimatedUnitCost) : null,
      }));

    if (items.length === 0) {
      setError("Pilih minimal satu item untuk diajukan");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const res: any = await apiCreatePurchaseRequest({ sales_order_id: selectedSoId, notes, items });
      router.push(`/purchase-requests/${res.id}`);
    } catch (e: any) {
      setError(e.message || "Gagal membuat Purchase Request");
    } finally {
      setSaving(false);
    }
  };

  if (!canEditDepartment("Operations")) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Hanya Operations yang bisa membuat Purchase Request.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Purchase Request Baru</h1>

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

        {soItems.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium">Pilih item yang perlu dibeli dari vendor</label>
            <div className="overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left w-8"></th>
                    <th className="px-2 py-2 text-left">Item</th>
                    <th className="px-2 py-2 text-right">Qty (SO)</th>
                    <th className="px-2 py-2 text-right">Qty Diajukan</th>
                    <th className="px-2 py-2 text-right">Estimasi Harga Satuan</th>
                  </tr>
                </thead>
                <tbody>
                  {soItems.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={!!selections[it.id]?.selected} onChange={() => toggleItem(it.id)} />
                      </td>
                      <td className="px-2 py-2">
                        {it.item_name} <span className="text-muted-foreground">({it.unit || "-"})</span>
                      </td>
                      <td className="px-2 py-2 text-right">{it.qty}</td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          className="border rounded px-2 py-1 w-20 text-right"
                          value={selections[it.id]?.qty ?? ""}
                          onChange={(e) => updateSelection(it.id, "qty", e.target.value)}
                          disabled={!selections[it.id]?.selected}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          className="border rounded px-2 py-1 w-32 text-right"
                          value={selections[it.id]?.estimatedUnitCost ?? ""}
                          onChange={(e) => updateSelection(it.id, "estimatedUnitCost", e.target.value)}
                          disabled={!selections[it.id]?.selected}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-sm text-right text-muted-foreground">
              {selectedCount} item dipilih — Estimasi total: <span className="font-medium text-foreground">{formatIDR(estimatedTotal)}</span>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-sm font-medium">Catatan (opsional)</label>
          <textarea
            className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Keterangan tambahan untuk PR ini..."
          />
        </div>

        {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <button className="px-3 py-2 border rounded" onClick={() => router.push("/purchase-requests")}>
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
