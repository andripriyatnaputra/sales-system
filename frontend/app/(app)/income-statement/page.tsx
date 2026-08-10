"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGetIncomeStatement, IncomeStatement } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { Card } from "@/components/ui/card";

function PLRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 text-sm ${bold ? "font-semibold border-t mt-1 pt-2" : ""}`}>
      <span>{label}</span>
      <span className={value < 0 ? "text-red-600" : ""}>{formatIDR(value)}</span>
    </div>
  );
}

export default function IncomeStatementPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<IncomeStatement | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (f?: string, t?: string) => {
    setLoading(true);
    try {
      const res = await apiGetIncomeStatement(f || undefined, t || undefined);
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
      <div>
        <h2 className="text-xl font-semibold">Laba Rugi</h2>
        <p className="text-sm text-muted-foreground">
          Laporan akuntansi (accrual, dari jurnal GL) — beda dari{" "}
          <Link href="/project-profitability" className="text-blue-600 hover:underline">
            Project Profitability
          </Link>{" "}
          yang cash-basis operasional. Revenue diakui saat invoice terkirim, COGS diakui saat BAST vendor
          diterima — bukan saat uang benar-benar keluar/masuk.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="date"
          className="border rounded-lg px-3 py-2 text-sm"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="Dari"
        />
        <span className="text-sm text-muted-foreground">s/d</span>
        <input
          type="date"
          className="border rounded-lg px-3 py-2 text-sm"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Sampai"
        />
        <button
          className="text-sm px-3 py-2 border rounded-lg hover:bg-gray-50"
          onClick={() => load(from, to)}
        >
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
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-sm font-semibold mb-2">Ringkasan Perusahaan</div>
              <PLRow label="Revenue" value={data.company.revenue} />
              <PLRow label="COGS" value={data.company.cogs} />
              <PLRow label="Gross Profit" value={data.company.gross_profit} bold />
              <PLRow label="Expense" value={data.company.expense} />
              <PLRow label="Net Income" value={data.company.net_income} bold />
            </Card>

            <Card className="p-4">
              <div className="text-sm font-semibold mb-2">Belum Melekat ke Project Manapun</div>
              <p className="text-xs text-muted-foreground mb-2">
                Biaya/pendapatan dari jurnal manual tanpa project_id (mis. beban operasional kantor).
              </p>
              <PLRow label="Revenue" value={data.unassigned.revenue} />
              <PLRow label="COGS" value={data.unassigned.cogs} />
              <PLRow label="Expense" value={data.unassigned.expense} />
              <PLRow label="Net Income" value={data.unassigned.net_income} bold />
            </Card>
          </div>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">By Divisi</div>
            <table className="w-full text-sm">
              <thead className="border-b text-muted-foreground text-xs">
                <tr>
                  <th className="text-left py-1.5">Divisi</th>
                  <th className="text-right py-1.5">Revenue</th>
                  <th className="text-right py-1.5">COGS</th>
                  <th className="text-right py-1.5">Gross Profit</th>
                  <th className="text-right py-1.5">Expense</th>
                  <th className="text-right py-1.5">Net Income</th>
                </tr>
              </thead>
              <tbody>
                {data.by_division.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-3 text-center text-muted-foreground text-xs">
                      Belum ada data.
                    </td>
                  </tr>
                ) : (
                  data.by_division.map((d) => (
                    <tr key={d.division} className="border-b last:border-0">
                      <td className="py-1.5">{d.division}</td>
                      <td className="py-1.5 text-right">{formatIDR(d.revenue)}</td>
                      <td className="py-1.5 text-right">{formatIDR(d.cogs)}</td>
                      <td className="py-1.5 text-right">{formatIDR(d.gross_profit)}</td>
                      <td className="py-1.5 text-right">{formatIDR(d.expense)}</td>
                      <td className={`py-1.5 text-right font-medium ${d.net_income < 0 ? "text-red-600" : ""}`}>
                        {formatIDR(d.net_income)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">By Project</div>
            <table className="w-full text-sm">
              <thead className="border-b text-muted-foreground text-xs">
                <tr>
                  <th className="text-left py-1.5">Project</th>
                  <th className="text-left py-1.5">Divisi</th>
                  <th className="text-right py-1.5">Revenue</th>
                  <th className="text-right py-1.5">COGS</th>
                  <th className="text-right py-1.5">Gross Profit</th>
                  <th className="text-right py-1.5">Expense</th>
                  <th className="text-right py-1.5">Net Income</th>
                  <th className="text-right py-1.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.by_project.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-3 text-center text-muted-foreground text-xs">
                      Belum ada project dgn transaksi GL di periode ini.
                    </td>
                  </tr>
                ) : (
                  data.by_project.map((p) => (
                    <tr key={p.project_id} className="border-b last:border-0">
                      <td className="py-1.5 font-medium">{p.project_code}</td>
                      <td className="py-1.5 text-muted-foreground">{p.division}</td>
                      <td className="py-1.5 text-right">{formatIDR(p.revenue)}</td>
                      <td className="py-1.5 text-right">{formatIDR(p.cogs)}</td>
                      <td className="py-1.5 text-right">{formatIDR(p.gross_profit)}</td>
                      <td className="py-1.5 text-right">{formatIDR(p.expense)}</td>
                      <td className={`py-1.5 text-right font-medium ${p.net_income < 0 ? "text-red-600" : ""}`}>
                        {formatIDR(p.net_income)}
                      </td>
                      <td className="py-1.5 text-right">
                        <Link href={`/projects/${p.project_id}`} className="text-blue-600 hover:underline">
                          Detail
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
