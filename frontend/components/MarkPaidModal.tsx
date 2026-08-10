"use client";

import { useEffect, useState } from "react";
import { apiGetCashBankSummary, CashBankAccount } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatIDR } from "@/lib/utils";

// MarkPaidModal: modal generik "pilih rekening lalu tandai lunas" -- dipakai
// di termin PO (Procurement) DAN invoice (Finance), supaya Finance bisa
// pilih rekening spesifik (mis. Bank BCA) alih-alih selalu ke "1100 Bank"
// (Fase 4 Langkah 3).
export function MarkPaidModal({
  title,
  amount,
  onClose,
  onConfirm,
}: {
  title: string;
  amount?: number;
  onClose: () => void;
  onConfirm: (bankAccountId: number) => Promise<void>;
}) {
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiGetCashBankSummary();
        const list = Array.isArray(data) ? data : [];
        setAccounts(list);
        if (list.length > 0) setSelected(String(list[0].id));
      } catch (e: any) {
        setError(e.message || "Gagal memuat daftar rekening");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const confirm = async () => {
    if (!selected) {
      setError("Pilih rekening dulu");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await onConfirm(Number(selected));
    } catch (e: any) {
      setError(e.message || "Gagal memproses pembayaran");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {amount != null && (
            <div className="text-sm text-muted-foreground">
              Jumlah: <span className="font-medium text-foreground">{formatIDR(amount)}</span>
            </div>
          )}
          <div className="space-y-1">
            <div className="text-sm font-medium">Rekening Kas/Bank</div>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={loading}
            >
              {accounts.length === 0 && <option value="">Loading...</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_code} - {a.account_name} ({formatIDR(a.balance)})
                </option>
              ))}
            </select>
          </div>

          {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={confirm} disabled={saving || loading}>
            {saving ? "Memproses..." : "Konfirmasi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
