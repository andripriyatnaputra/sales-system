"use client";

import { useEffect, useState } from "react";
import { apiGetCashFlowStatement, CashFlowStatement, CashFlowLine } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { Card } from "@/components/ui/card";

function CategoryCard({ title, lines, total }: { title: string; lines: CashFlowLine[]; total: number }) {
  return (
    <Card className="p-4">
      <div className="text-sm font-semibold mb-2">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td className="py-2 text-xs text-muted-foreground">Tidak ada aktivitas.</td>
            </tr>
          ) : (
            lines.map((l) => (
              <tr key={l.account_code} className="border-b last:border-0">
                <td className="py-1.5 text-muted-foreground">{l.account_code}</td>
                <td className="py-1.5">{l.account_name}</td>
                <td className={`py-1.5 text-right font-medium ${l.amount < 0 ? "text-red-600" : ""}`}>
                  {formatIDR(l.amount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="flex justify-between pt-2 mt-2 border-t font-semibold text-sm">
        <span>Total</span>
        <span className={total < 0 ? "text-red-600" : ""}>{formatIDR(total)}</span>
      </div>
    </Card>
  );
}

export default function CashFlowStatementPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<CashFlowStatement | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (f?: string, t?: string) => {
    setLoading(true);
    try {
      const res = await apiGetCashFlowStatement(f || undefined, t || undefined);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Arus Kas</h2>
          <p className="text-sm text-muted-foreground">
            Metode langsung — pergerakan Kas/Bank per periode, dikelompokkan Operasi/Investasi/Pendanaan.
          </p>
        </div>
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

      <div className="flex items-center gap-2">
        <input
          type="date"
          className="border rounded-lg px-3 py-2 text-sm"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">s/d</span>
        <input
          type="date"
          className="border rounded-lg px-3 py-2 text-sm"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <button className="text-sm px-3 py-2 border rounded-lg hover:bg-gray-50" onClick={() => load(from, to)}>
          Terapkan
        </button>
        {data && (
          <span className="text-xs text-muted-foreground">
            Periode: {data.from} s/d {data.to}
          </span>
        )}
      </div>

      {loading || !data ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">Saldo Awal Kas</span>
              <span className="font-semibold">{formatIDR(data.beginning_cash)}</span>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CategoryCard title="Aktivitas Operasi" lines={data.operating} total={data.operating_total} />
            <CategoryCard title="Aktivitas Investasi" lines={data.investing} total={data.investing_total} />
            <CategoryCard title="Aktivitas Pendanaan" lines={data.financing} total={data.financing_total} />
          </div>

          <Card className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Net Perubahan Kas</span>
              <span className={data.net_change_in_cash < 0 ? "text-red-600 font-medium" : "font-medium"}>
                {formatIDR(data.net_change_in_cash)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t pt-2">
              <span>Saldo Akhir Kas</span>
              <span>{formatIDR(data.ending_cash)}</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
