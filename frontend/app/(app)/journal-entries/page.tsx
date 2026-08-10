"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGetJournalEntries, apiGetChartOfAccounts, JournalEntry, ChartOfAccount, canEditDepartment } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  bast_vendor: "Auto: BAST Vendor",
  payment_schedule_paid: "Auto: Termin Vendor",
  invoice_sent: "Auto: Invoice Terkirim",
  invoice_paid: "Auto: Invoice Lunas",
};

export default function JournalEntriesPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <JournalEntriesPageInner />
    </Suspense>
  );
}

function JournalEntriesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = searchParams.get("account_id") || "";

  const [list, setList] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetJournalEntries(accountId ? { account_id: Number(accountId) } : undefined);
      setList(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    apiGetChartOfAccounts({ status: "active" }).then((data) => setAccounts(Array.isArray(data) ? data : []));
  }, []);

  const activeAccount = accounts.find((a) => String(a.id) === accountId);

  const setAccountFilter = (value: string) => {
    const qs = value ? `?account_id=${value}` : "";
    router.push(`/journal-entries${qs}`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Jurnal Umum</h2>
          <p className="text-sm text-muted-foreground">
            Riwayat jurnal manual -- sekali diposting bersifat permanen (koreksi lewat jurnal baru, bukan edit).
          </p>
        </div>
        {canEditDepartment("Finance") && (
          <Link href="/journal-entries/new">
            <Button>+ Jurnal Baru</Button>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2">
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background"
          value={accountId}
          onChange={(e) => setAccountFilter(e.target.value)}
        >
          <option value="">Semua Akun</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_code} - {a.account_name}
            </option>
          ))}
        </select>
        {activeAccount && (
          <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700">
            Filter: {activeAccount.account_code} - {activeAccount.account_name}{" "}
            <button className="ml-1 font-semibold" onClick={() => setAccountFilter("")}>
              &times;
            </button>
          </span>
        )}
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Nomor</th>
              <th className="px-3 py-2 text-left">Tanggal</th>
              <th className="px-3 py-2 text-left">Deskripsi</th>
              <th className="px-3 py-2 text-left">Sumber</th>
              <th className="px-3 py-2 text-right">Total Debit</th>
              <th className="px-3 py-2 text-right">Total Kredit</th>
              <th className="px-3 py-2 text-left">Dibuat Oleh</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="p-4 text-center">
                  Loading...
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-muted-foreground">
                  Belum ada jurnal.
                </td>
              </tr>
            ) : (
              list.map((je) => (
                <tr key={je.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{je.entry_number}</td>
                  <td className="px-3 py-2">{je.entry_date.slice(0, 10)}</td>
                  <td className="px-3 py-2">{je.description}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        je.source_type === "manual" ? "bg-muted text-muted-foreground" : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {SOURCE_LABEL[je.source_type] || je.source_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{formatIDR(je.total_debit)}</td>
                  <td className="px-3 py-2 text-right">{formatIDR(je.total_credit)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{je.created_by_username}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/journal-entries/${je.id}`} className="text-blue-600 hover:underline">
                      Detail
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
