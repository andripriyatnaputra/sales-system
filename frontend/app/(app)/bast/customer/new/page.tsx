"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGetSalesOrders, apiGetSalesOrder, apiCreateBASTCustomer, canEditDepartment } from "@/lib/api";

type SOSummary = {
  id: number;
  so_number: string;
  project_code: string;
  status: string;
};

type SOItem = {
  id: number;
  item_name: string;
  unit?: string | null;
  qty: number;
};

export default function NewBASTCustomerPage() {
  const router = useRouter();

  const [sos, setSos] = useState<SOSummary[]>([]);
  const [selectedSoId, setSelectedSoId] = useState<number | "">("");
  const [soItems, setSoItems] = useState<SOItem[]>([]);
  const [itemSelections, setItemSelections] = useState<Record<number, { selected: boolean; qty: string; notes: string }>>({});

  const [deliveredDate, setDeliveredDate] = useState("");
  const [status, setStatus] = useState("complete");
  const [customerSignatory, setCustomerSignatory] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGetSalesOrders()
      .then((data: any) => setSos(Array.isArray(data) ? data.filter((so: any) => so.status === "active") : []))
      .catch(() => setSos([]));
  }, []);

  useEffect(() => {
    if (!selectedSoId) {
      setSoItems([]);
      return;
    }
    apiGetSalesOrder(selectedSoId).then((so: any) => {
      const items: SOItem[] = so.items || [];
      setSoItems(items);
      const init: Record<number, { selected: boolean; qty: string; notes: string }> = {};
      items.forEach((it) => {
        init[it.id] = { selected: true, qty: String(it.qty), notes: "" };
      });
      setItemSelections(init);
    });
  }, [selectedSoId]);

  const updateItem = (itemId: number, field: "selected" | "qty" | "notes", value: string | boolean) => {
    setItemSelections((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  };

  const submit = async () => {
    if (!selectedSoId) {
      setError("Pilih Sales Order dulu");
      return;
    }
    const items = soItems
      .filter((it) => itemSelections[it.id]?.selected)
      .map((it) => ({
        sales_order_item_id: it.id,
        qty_delivered: Number(itemSelections[it.id].qty) || it.qty,
        notes: itemSelections[it.id].notes || null,
      }));

    if (items.length === 0) {
      setError("Pilih minimal satu item yang diserahterimakan");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const res: any = await apiCreateBASTCustomer({
        sales_order_id: selectedSoId,
        delivered_date: deliveredDate || null,
        status,
        customer_signatory: customerSignatory,
        notes,
        items,
      });
      router.push(`/bast/customer/${res.id}`);
    } catch (e: any) {
      setError(e.message || "Gagal membuat BAST Customer");
    } finally {
      setSaving(false);
    }
  };

  if (!canEditDepartment("Operations")) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Hanya Operations yang bisa membuat BAST Customer.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">BAST Customer Baru</h1>
      <p className="text-sm text-muted-foreground -mt-4">Serah terima barang/jasa ke customer — jadi trigger invoicing (Fase 2).</p>

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Sales Order</label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={selectedSoId}
            onChange={(e) => setSelectedSoId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">-- pilih Sales Order --</option>
            {sos.map((so) => (
              <option key={so.id} value={so.id}>
                {so.so_number} — {so.project_code}
              </option>
            ))}
          </select>
        </div>

        {soItems.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium">Item yang diserahterimakan</label>
            <div className="overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left w-8"></th>
                    <th className="px-2 py-2 text-left">Item</th>
                    <th className="px-2 py-2 text-right">Qty SO</th>
                    <th className="px-2 py-2 text-right">Qty Diserahkan</th>
                    <th className="px-2 py-2 text-left">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {soItems.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={!!itemSelections[it.id]?.selected}
                          onChange={(e) => updateItem(it.id, "selected", e.target.checked)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        {it.item_name} <span className="text-muted-foreground">({it.unit || "-"})</span>
                      </td>
                      <td className="px-2 py-2 text-right">{it.qty}</td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          className="border rounded px-2 py-1 w-20 text-right"
                          value={itemSelections[it.id]?.qty ?? ""}
                          onChange={(e) => updateItem(it.id, "qty", e.target.value)}
                          disabled={!itemSelections[it.id]?.selected}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="border rounded px-2 py-1 w-full"
                          value={itemSelections[it.id]?.notes ?? ""}
                          onChange={(e) => updateItem(it.id, "notes", e.target.value)}
                          disabled={!itemSelections[it.id]?.selected}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium">Tanggal Serah Terima</label>
            <input
              type="date"
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={deliveredDate}
              onChange={(e) => setDeliveredDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">Status</label>
            <select className="w-full border rounded-md px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="complete">Complete (semua terkirim)</option>
              <option value="partial">Partial (sebagian)</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Nama Penerima (Customer)</label>
          <input
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={customerSignatory}
            onChange={(e) => setCustomerSignatory(e.target.value)}
            placeholder="Nama & jabatan penerima di sisi customer"
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
          <button className="px-3 py-2 border rounded" onClick={() => router.push("/bast")}>
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            disabled={saving || !selectedSoId}
            onClick={submit}
          >
            {saving ? "Saving..." : "Buat BAST Customer"}
          </button>
        </div>
      </div>
    </div>
  );
}
