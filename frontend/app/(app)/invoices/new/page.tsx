"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGetBillingRequests, apiCreateInvoice, canEditDepartment } from "@/lib/api";
import { formatIDR } from "@/lib/utils";

type BillingRequestSummary = {
  id: number;
  meta_number: string;
  so_number?: string;
  amount: number;
  status: string;
};

export default function NewInvoicePage() {
  const router = useRouter();

  const [billingRequests, setBillingRequests] = useState<BillingRequestSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [taxAmount, setTaxAmount] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGetBillingRequests("approved")
      .then((data: any) => setBillingRequests(Array.isArray(data) ? data : []))
      .catch(() => setBillingRequests([]));
  }, []);

  const selected = billingRequests.find((b) => b.id === selectedId);

  const submit = async () => {
    if (!selectedId) {
      setError("Pilih META dulu");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const res: any = await apiCreateInvoice({
        billing_request_id: selectedId,
        tax_amount: taxAmount ? Number(taxAmount) : 0,
        issue_date: issueDate,
        due_date: dueDate,
        notes,
      });
      router.push(`/invoices/${res.id}`);
    } catch (e: any) {
      setError(e.message || "Gagal membuat Invoice");
    } finally {
      setSaving(false);
    }
  };

  if (!canEditDepartment("Finance")) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Hanya Finance yang bisa membuat Invoice.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Invoice Baru</h1>

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium">META (Memo Tagih) — approved</label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">-- pilih META --</option>
            {billingRequests.map((b) => (
              <option key={b.id} value={b.id}>
                {b.meta_number} — {b.so_number} — {formatIDR(b.amount)}
              </option>
            ))}
          </select>
          {billingRequests.length === 0 && (
            <p className="text-xs text-muted-foreground">Belum ada META berstatus approved.</p>
          )}
        </div>

        {selected && (
          <div className="text-sm bg-muted/30 border rounded-lg p-3">
            Amount dari META: <span className="font-medium">{formatIDR(selected.amount)}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium">Tax Amount (opsional)</label>
            <input
              type="number"
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">Issue Date</label>
            <input
              type="date"
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Due Date</label>
          <input
            type="date"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
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
          <button className="px-3 py-2 border rounded" onClick={() => router.push("/invoices")}>
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            disabled={saving || !selectedId}
            onClick={submit}
          >
            {saving ? "Saving..." : "Buat Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
