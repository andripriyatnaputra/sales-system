"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGetCashBankSummary, CashBankAccount } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export default function CashBankPage() {
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiGetCashBankSummary();
        setAccounts(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const total = accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Kas & Bank</h2>
        <p className="text-sm text-muted-foreground">
          Saldo berjalan tiap akun Kas/Bank -- termasuk rekening spesifik (mis. Bank BCA) yang ditambah lewat{" "}
          <Link href="/chart-of-accounts" className="text-blue-600 hover:underline">
            Chart of Accounts
          </Link>{" "}
          sbg akun anak dari "1100 Bank".
        </p>
      </div>

      <Card className="p-4">
        <table className="w-full text-sm">
          <thead className="border-b text-muted-foreground text-xs">
            <tr>
              <th className="text-left py-1.5">Kode</th>
              <th className="text-left py-1.5">Nama Akun</th>
              <th className="text-right py-1.5">Saldo</th>
              <th className="text-right py-1.5">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">
                  Belum ada akun Kas/Bank.
                </td>
              </tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-1.5 font-medium">{a.account_code}</td>
                  <td className="py-1.5">{a.account_name}</td>
                  <td className="py-1.5 text-right">{formatIDR(a.balance)}</td>
                  <td className="py-1.5 text-right">
                    <Link href={`/journal-entries?account_id=${a.id}`} className="text-blue-600 text-xs hover:underline">
                      Lihat Transaksi
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {accounts.length > 0 && (
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="py-1.5" colSpan={2}>
                  Total
                </td>
                <td className="py-1.5 text-right">{formatIDR(total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </div>
  );
}
