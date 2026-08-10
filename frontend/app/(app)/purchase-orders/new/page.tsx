"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGetPurchaseRequests, apiGetPurchaseRequest, apiGetVendors, apiCreatePurchaseOrder } from "@/lib/api";
import { formatIDR } from "@/lib/utils";

type PRSummary = {
  id: number;
  pr_number: string;
  so_number?: string;
  status: string;
};

type PRItem = {
  id: number;
  item_name: string;
  unit?: string | null;
  qty: number;
  estimated_unit_cost?: number | null;
};

type Vendor = {
  id: number;
  code: string;
  name: string;
  status: string;
};

type ItemSelection = {
  selected: boolean;
  qty: string;
  unitCost: string;
};

export default function NewPurchaseOrderPage() {
  const router = useRouter();

  const [approvedPRs, setApprovedPRs] = useState<PRSummary[]>([]);
  const [selectedPrId, setSelectedPrId] = useState<number | "">("");
  const [prItems, setPrItems] = useState<PRItem[]>([]);
  const [selections, setSelections] = useState<Record<number, ItemSelection>>({});

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState<number | "">("");

  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGetPurchaseRequests("approved")
      .then((data: any) => setApprovedPRs(Array.isArray(data) ? data : []))
      .catch(() => setApprovedPRs([]));
    apiGetVendors("active")
      .then((data: any) => setVendors(Array.isArray(data) ? data : []))
      .catch(() => setVendors([]));
  }, []);

  useEffect(() => {
    if (!selectedPrId) {
      setPrItems([]);
      setSelections({});
      return;
    }
    apiGetPurchaseRequest(selectedPrId).then((pr: any) => {
      const items: PRItem[] = pr.items || [];
      setPrItems(items);
      const init: Record<number, ItemSelection> = {};
      items.forEach((it) => {
        init[it.id] = {
          selected: true,
          qty: String(it.qty),
          unitCost: it.estimated_unit_cost != null ? String(it.estimated_unit_cost) : "",
        };
      });
      setSelections(init);
    });
  }, [selectedPrId]);

  const updateSelection = (itemId: number, field: keyof ItemSelection, value: string | boolean) => {
    setSelections((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  };

  const total = prItems.reduce((sum, it) => {
    const sel = selections[it.id];
    if (!sel?.selected) return sum;
    return sum + (Number(sel.qty) || 0) * (Number(sel.unitCost) || 0);
  }, 0);

  const submit = async () => {
    if (!selectedPrId || !vendorId) {
      setError("Pilih Purchase Request dan Vendor dulu");
      return;
    }
    const items = prItems
      .filter((it) => selections[it.id]?.selected)
      .map((it) => ({
        purchase_request_item_id: it.id,
        qty: Number(selections[it.id].qty) || it.qty,
        unit_cost: Number(selections[it.id].unitCost) || 0,
      }));

    if (items.length === 0) {
      setError("Pilih minimal satu item");
      return;
    }
    if (items.some((it) => it.unit_cost <= 0)) {
      setError("Harga satuan tiap item harus diisi (hasil negosiasi dengan vendor)");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const res: any = await apiCreatePurchaseOrder({
        purchase_request_id: selectedPrId,
        vendor_id: vendorId,
        notes,
        items,
      });
      router.push(`/purchase-orders/${res.id}`);
    } catch (e: any) {
      setError(e.message || "Gagal membuat Purchase Order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Purchase Order Baru</h1>

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium">Purchase Request (approved)</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={selectedPrId}
              onChange={(e) => setSelectedPrId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">-- pilih PR --</option>
              {approvedPRs.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.pr_number} ({pr.so_number})
                </option>
              ))}
            </select>
            {approvedPRs.length === 0 && (
              <p className="text-xs text-muted-foreground">Belum ada PR berstatus approved.</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium">Vendor</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">-- pilih vendor --</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} — {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {prItems.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium">Item PO (harga hasil negosiasi vendor)</label>
            <div className="overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left w-8"></th>
                    <th className="px-2 py-2 text-left">Item</th>
                    <th className="px-2 py-2 text-right">Estimasi PR</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-right">Harga Satuan Vendor</th>
                  </tr>
                </thead>
                <tbody>
                  {prItems.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={!!selections[it.id]?.selected}
                          onChange={(e) => updateSelection(it.id, "selected", e.target.checked)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        {it.item_name} <span className="text-muted-foreground">({it.unit || "-"})</span>
                      </td>
                      <td className="px-2 py-2 text-right text-muted-foreground">
                        {it.estimated_unit_cost != null ? formatIDR(it.estimated_unit_cost) : "-"}
                      </td>
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
                          value={selections[it.id]?.unitCost ?? ""}
                          onChange={(e) => updateSelection(it.id, "unitCost", e.target.value)}
                          disabled={!selections[it.id]?.selected}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-sm text-right text-muted-foreground">
              Total PO: <span className="font-medium text-foreground">{formatIDR(total)}</span>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-sm font-medium">Catatan (opsional)</label>
          <textarea
            className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <button className="px-3 py-2 border rounded" onClick={() => router.push("/purchase-orders")}>
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            disabled={saving || !selectedPrId || !vendorId}
            onClick={submit}
          >
            {saving ? "Saving..." : "Simpan sebagai Draft"}
          </button>
        </div>
      </div>
    </div>
  );
}
