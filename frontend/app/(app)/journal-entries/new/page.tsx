"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGetChartOfAccounts, apiCreateJournalEntry, apiGet, ChartOfAccount } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LineForm = {
  account_id: string;
  project_id: string;
  debit: string;
  credit: string;
  memo: string;
};

const emptyLine = (): LineForm => ({ account_id: "", project_id: "", debit: "", credit: "", memo: "" });

export default function NewJournalEntryPage() {
  const router = useRouter();
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineForm[]>([emptyLine(), emptyLine()]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [projects, setProjects] = useState<{ id: number; project_code: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const accs = await apiGetChartOfAccounts({ status: "active" });
      setAccounts(Array.isArray(accs) ? accs : []);
      try {
        const proj = await apiGet<any>("/projects");
        const arr = Array.isArray(proj) ? proj : proj?.data || [];
        setProjects(arr.map((p: any) => ({ id: p.id, project_code: p.project_code })));
      } catch {
        setProjects([]);
      }
    })();
  }, []);

  // akun leaf saja -- yang TIDAK muncul sebagai parent_id akun lain (mirror
  // validasi backend: akun header/rollup tidak boleh diposting langsung).
  const parentIds = useMemo(() => new Set(accounts.filter((a) => a.parent_id).map((a) => a.parent_id)), [accounts]);
  const postableAccounts = useMemo(
    () => accounts.filter((a) => !Array.from(parentIds).includes(a.id)).sort((a, b) => a.account_code.localeCompare(b.account_code)),
    [accounts, parentIds]
  );

  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  const updateLine = (idx: number, patch: Partial<LineForm>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!description) {
      setError("Deskripsi wajib diisi");
      return;
    }
    if (!balanced) {
      setError("Total debit dan kredit harus balance");
      return;
    }
    const payloadLines = lines
      .filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l) => ({
        account_id: Number(l.account_id),
        project_id: l.project_id ? Number(l.project_id) : null,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        memo: l.memo || null,
      }));
    if (payloadLines.length < 2) {
      setError("Minimal 2 baris jurnal (double-entry)");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const res = await apiCreateJournalEntry({ entry_date: entryDate, description, lines: payloadLines });
      router.push(`/journal-entries/${res.id}`);
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan jurnal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold">Jurnal Baru</h2>
        <p className="text-sm text-muted-foreground">
          Jurnal yang sudah disimpan bersifat permanen -- kalau ada kesalahan, koreksi lewat jurnal baru.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Tanggal</div>
            <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Deskripsi</div>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="mis. Penerimaan pembayaran customer" />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-semibold">Baris Jurnal</div>
          <Button variant="outline" size="sm" onClick={addLine}>
            + Baris
          </Button>
        </div>

        <div className="space-y-2">
          {lines.map((l, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center border-b pb-2">
              <select
                className="col-span-4 border rounded-md px-2 py-1.5 text-sm"
                value={l.account_id}
                onChange={(e) => updateLine(idx, { account_id: e.target.value })}
              >
                <option value="">Pilih akun...</option>
                {postableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_code} - {a.account_name}
                  </option>
                ))}
              </select>
              <select
                className="col-span-2 border rounded-md px-2 py-1.5 text-sm"
                value={l.project_id}
                onChange={(e) => updateLine(idx, { project_id: e.target.value })}
              >
                <option value="">(Tanpa project)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_code}
                  </option>
                ))}
              </select>
              <input
                className="col-span-1 border rounded-md px-2 py-1.5 text-sm"
                placeholder="Memo"
                value={l.memo}
                onChange={(e) => updateLine(idx, { memo: e.target.value })}
              />
              <input
                type="number"
                className="col-span-2 border rounded-md px-2 py-1.5 text-sm text-right"
                placeholder="Debit"
                value={l.debit}
                onChange={(e) => updateLine(idx, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
              />
              <input
                type="number"
                className="col-span-2 border rounded-md px-2 py-1.5 text-sm text-right"
                placeholder="Kredit"
                value={l.credit}
                onChange={(e) => updateLine(idx, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
              />
              <button
                className="col-span-1 text-red-600 text-xs"
                onClick={() => removeLine(idx)}
                disabled={lines.length <= 2}
              >
                Hapus
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-6 mt-4 text-sm">
          <div>
            Total Debit: <span className="font-semibold">{formatIDR(totalDebit)}</span>
          </div>
          <div>
            Total Kredit: <span className="font-semibold">{formatIDR(totalCredit)}</span>
          </div>
          <div className={balanced ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
            {balanced ? "Balance" : "Belum Balance"}
          </div>
        </div>

        {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded mt-3">{error}</div>}

        <div className="flex justify-end mt-4">
          <Button onClick={submit} disabled={saving || !balanced}>
            {saving ? "Menyimpan..." : "Posting Jurnal"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
