"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGetPurchaseOrders, apiGetPurchaseOrder, apiCreateBASTVendor, canEditDepartment } from "@/lib/api";
import { formatIDR } from "@/lib/utils";

type POSummary = {
  id: number;
  po_number: string;
  vendor_name?: string;
  status: string;
};

type POItem = {
  id: number;
  item_name: string;
  unit?: string | null;
  qty: number;
};

type PaymentSchedule = {
  id: number;
  sequence: number;
  trigger_description?: string | null;
  amount: number;
  status: string;
};

export default function NewBASTVendorPage() {
  const router = useRouter();

  const [pos, setPos] = useState<POSummary[]>([]);
  const [selectedPoId, setSelectedPoId] = useState<number | "">("");
  const [poItems, setPoItems] = useState<POItem[]>([]);
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);

  const [itemSelections, setItemSelections] = useState<Record<number, { selected: boolean; qty: string; notes: string }>>({});
  const [triggerScheduleIds, setTriggerScheduleIds] = useState<Record<number, boolean>>({});

  const [receivedDate, setReceivedDate] = useState("");
  const [status, setStatus] = useState("complete");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGetPurchaseOrders("approved")
      .then((data: any) => setPos(Array.isArray(data) ? data : []))
      .catch(() => setPos([]));
  }, []);

  useEffect(() => {
    if (!selectedPoId) {
      setPoItems([]);
      setSchedules([]);
      return;
    }
    apiGetPurchaseOrder(selectedPoId).then((po: any) => {
      const items: POItem[] = po.items || [];
      setPoItems(items);
      const init: Record<number, { selected: boolean; qty: string; notes: string }> = {};
      items.forEach((it) => {
        init[it.id] = { selected: true, qty: String(it.qty), notes: "" };
      });
      setItemSelections(init);

      const pendingSchedules = (po.payment_schedules || []).filter((s: PaymentSchedule) => s.status === "pending");
      setSchedules(pendingSchedules);
      setTriggerScheduleIds({});
    });
  }, [selectedPoId]);

  const updateItem = (itemId: number, field: "selected" | "qty" | "notes", value: string | boolean) => {
    setItemSelections((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  };

  const submit = async () => {
    if (!selectedPoId) {
      setError("Pilih Purchase Order dulu");
      return;
    }
    const items = poItems
      .filter((it) => itemSelections[it.id]?.selected)
      .map((it) => ({
        purchase_order_item_id: it.id,
        qty_received: Number(itemSelections[it.id].qty) || it.qty,
        condition_notes: itemSelections[it.id].notes || null,
      }));

    if (items.length === 0) {
      setError("Pilih minimal satu item yang diterima");
      return;
    }

    const triggerIds = Object.entries(triggerScheduleIds)
      .filter(([, checked]) => checked)
      .map(([id]) => Number(id));

    try {
      setSaving(true);
      setError("");
      const res: any = await apiCreateBASTVendor({
        purchase_order_id: selectedPoId,
        received_date: receivedDate || null,
        status,
        notes,
        items,
        trigger_payment_schedule_ids: triggerIds,
      });
      router.push(`/bast/vendor/${res.id}`);
    } catch (e: any) {
      setError(e.message || "Gagal membuat BAST Vendor");
    } finally {
      setSaving(false);
    }
  };

  if (!canEditDepartment("Operations")) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Hanya Operations yang bisa membuat BAST Vendor.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">BAST Vendor Baru</h1>
      <p className="text-sm text-muted-foreground -mt-4">Verifikasi barang/jasa yang diterima dari vendor sesuai Purchase Order.</p>

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Purchase Order (approved)</label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={selectedPoId}
            onChange={(e) => setSelectedPoId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">-- pilih PO --</option>
            {pos.map((po) => (
              <option key={po.id} value={po.id}>
                {po.po_number} — {po.vendor_name}
              </option>
            ))}
          </select>
          {pos.length === 0 && <p className="text-xs text-muted-foreground">Belum ada PO berstatus approved.</p>}
        </div>

        {poItems.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium">Item yang diterima</label>
            <div className="overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left w-8"></th>
                    <th className="px-2 py-2 text-left">Item</th>
                    <th className="px-2 py-2 text-right">Qty PO</th>
                    <th className="px-2 py-2 text-right">Qty Diterima</th>
                    <th className="px-2 py-2 text-left">Catatan Kondisi</th>
                  </tr>
                </thead>
                <tbody>
                  {poItems.map((it) => (
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
                          placeholder="Kondisi baik / dst"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {schedules.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Termin pembayaran yang terpicu BAST ini (opsional)
            </label>
            <p className="text-xs text-muted-foreground">
              Pilih termin yang statusnya mau diubah jadi "due" karena BAST ini -- keputusan manual, sistem tidak menebak dari deskripsi termin.
            </p>
            <div className="space-y-1">
              {schedules.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm border rounded-lg p-2">
                  <input
                    type="checkbox"
                    checked={!!triggerScheduleIds[s.id]}
                    onChange={(e) => setTriggerScheduleIds((prev) => ({ ...prev, [s.id]: e.target.checked }))}
                  />
                  Termin #{s.sequence}: {s.trigger_description || "-"} — {formatIDR(s.amount)}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium">Tanggal Terima</label>
            <input
              type="date"
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">Status</label>
            <select className="w-full border rounded-md px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="complete">Complete (semua diterima)</option>
              <option value="partial">Partial (sebagian)</option>
            </select>
          </div>
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
            disabled={saving || !selectedPoId}
            onClick={submit}
          >
            {saving ? "Saving..." : "Buat BAST Vendor"}
          </button>
        </div>
      </div>
    </div>
  );
}
