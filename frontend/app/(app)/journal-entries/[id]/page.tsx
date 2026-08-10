"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGetJournalEntry, JournalEntry } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { Card } from "@/components/ui/card";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  bast_vendor: "Auto: BAST Vendor",
  payment_schedule_paid: "Auto: Termin Vendor",
  invoice_sent: "Auto: Invoice Terkirim",
  invoice_paid: "Auto: Invoice Lunas",
};

export default function JournalEntryDetailPage() {
  const { id } = useParams();
  const [je, setJe] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await apiGetJournalEntry(id as string);
        setJe(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  if (!je) return <div className="p-6 text-sm text-muted-foreground">Jurnal tidak ditemukan.</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">{je.entry_number}</h2>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full ${
              je.source_type === "manual" ? "bg-muted text-muted-foreground" : "bg-blue-50 text-blue-700"
            }`}
          >
            {SOURCE_LABEL[je.source_type] || je.source_type}
            {je.source_id != null ? ` (ref #${je.source_id})` : ""}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{je.description}</p>
      </div>

      <Card className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-muted-foreground">Tanggal</div>
          <div className="font-medium">{je.entry_date.slice(0, 10)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Dibuat Oleh</div>
          <div className="font-medium">{je.created_by_username}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total Debit</div>
          <div className="font-medium">{formatIDR(je.total_debit)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total Kredit</div>
          <div className="font-medium">{formatIDR(je.total_credit)}</div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-3">Baris Jurnal</div>
        <table className="w-full text-sm">
          <thead className="border-b text-muted-foreground text-xs">
            <tr>
              <th className="text-left py-2">Akun</th>
              <th className="text-left py-2">Project</th>
              <th className="text-left py-2">Memo</th>
              <th className="text-right py-2">Debit</th>
              <th className="text-right py-2">Kredit</th>
            </tr>
          </thead>
          <tbody>
            {(je.lines || []).map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="py-2">
                  {l.account_code} - {l.account_name}
                </td>
                <td className="py-2 text-muted-foreground">{l.project_code || "-"}</td>
                <td className="py-2 text-muted-foreground">{l.memo || "-"}</td>
                <td className="py-2 text-right">{l.debit > 0 ? formatIDR(l.debit) : "-"}</td>
                <td className="py-2 text-right">{l.credit > 0 ? formatIDR(l.credit) : "-"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td colSpan={3} className="py-2 text-right">
                Total
              </td>
              <td className="py-2 text-right">{formatIDR(je.total_debit)}</td>
              <td className="py-2 text-right">{formatIDR(je.total_credit)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}
