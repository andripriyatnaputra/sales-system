"use client";

import { useEffect, useState } from "react";
import { apiGetBalanceSheet, BalanceSheet } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { Card } from "@/components/ui/card";

function LineTable({ lines }: { lines: { account_code: string; account_name: string; balance: number }[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {lines.map((l) => (
          <tr key={l.account_code} className="border-b last:border-0">
            <td className="py-1.5 text-muted-foreground">{l.account_code}</td>
            <td className="py-1.5">{l.account_name}</td>
            <td className="py-1.5 text-right font-medium">{formatIDR(l.balance)}</td>
          </tr>
        ))}
        {lines.length === 0 && (
          <tr>
            <td colSpan={3} className="py-2 text-xs text-muted-foreground">
              Belum ada saldo.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (date: string) => {
    setLoading(true);
    try {
      const res = await apiGetBalanceSheet(date);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(asOf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Neraca</h2>
          <p className="text-sm text-muted-foreground">
            Posisi keuangan perusahaan (Aset = Kewajiban + Ekuitas) per tanggal tertentu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="border rounded-lg px-3 py-2 text-sm"
            value={asOf}
            onChange={(e) => {
              setAsOf(e.target.value);
              load(e.target.value);
            }}
          />
          {data && (
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                data.balanced ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              }`}
            >
              {data.balanced ? "Balance ✓" : "Tidak Balance ✗"}
            </span>
          )}
        </div>
      </div>

      {loading || !data ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <>
          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">Aset</div>
            <LineTable lines={data.assets} />
            <div className="flex justify-between pt-2 mt-2 border-t font-semibold text-sm">
              <span>Total Aset</span>
              <span>{formatIDR(data.total_assets)}</span>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">Kewajiban</div>
            <LineTable lines={data.liabilities} />
            <div className="flex justify-between pt-2 mt-2 border-t font-semibold text-sm">
              <span>Total Kewajiban</span>
              <span>{formatIDR(data.total_liabilities)}</span>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">Ekuitas</div>
            <table className="w-full text-sm">
              <tbody>
                {data.equity.map((l) => (
                  <tr key={l.account_code} className="border-b">
                    <td className="py-1.5 text-muted-foreground">{l.account_code}</td>
                    <td className="py-1.5">{l.account_name}</td>
                    <td className="py-1.5 text-right font-medium">{formatIDR(l.balance)}</td>
                  </tr>
                ))}
                <tr className="border-b">
                  <td className="py-1.5 text-muted-foreground">-</td>
                  <td className="py-1.5">Laba Berjalan (belum ditutup)</td>
                  <td className="py-1.5 text-right font-medium">{formatIDR(data.current_earnings)}</td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-between pt-2 mt-2 border-t font-semibold text-sm">
              <span>Total Ekuitas</span>
              <span>{formatIDR(data.total_equity)}</span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
