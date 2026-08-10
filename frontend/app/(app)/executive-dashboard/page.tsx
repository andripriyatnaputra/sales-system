"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGetExecutiveDashboard, canAccessLevel } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { Card } from "@/components/ui/card";

import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

type CashAccount = { id: number; account_code: string; account_name: string; balance: number };

type WorstProject = {
  project_id: number;
  project_code: string;
  description: string;
  real_margin: number;
};

type ExecutiveDashboardData = {
  from: string;
  to: string;
  as_of: string;
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  balance_sheet_balanced: boolean;
  revenue: number;
  cogs: number;
  gross_profit: number;
  expense: number;
  net_income: number;
  cash_position: number;
  cash_accounts: CashAccount[];
  ar_total_outstanding: number;
  ar_total_overdue: number;
  ap_total_outstanding: number;
  ap_total_overdue: number;
  net_position: number;
  worst_projects: WorstProject[];
};

function KpiTile({ label, value, positiveGood }: { label: string; value: number; positiveGood?: boolean }) {
  const colored = positiveGood !== undefined;
  const isGood = positiveGood ? value >= 0 : value < 0;
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-semibold text-lg ${colored ? (isGood ? "text-green-600" : "text-red-600") : ""}`}>
        {formatIDR(value)}
      </div>
    </Card>
  );
}

export default function ExecutiveDashboardPage() {
  const canAccess = canAccessLevel("gm");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<ExecutiveDashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (f?: string, t?: string) => {
    setLoading(true);
    try {
      const res = await apiGetExecutiveDashboard(f || undefined, t || undefined);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!canAccess) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Halaman ini khusus level GM ke atas.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Dashboard Eksekutif</h2>
          <p className="text-sm text-muted-foreground">
            Ringkasan lintas laporan (Neraca/Laba Rugi/Kas &amp; Bank/AR-AP/Profitability) untuk management.
          </p>
        </div>
        {data && (
          <span
            className={`text-xs px-2 py-1 rounded-full font-medium ${
              data.balance_sheet_balanced ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}
          >
            {data.balance_sheet_balanced ? "Balance ✓" : "Tidak Balance ✗"}
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
            Periode: {data.from} s/d {data.to} (as of {data.as_of})
          </span>
        )}
      </div>

      {loading || !data ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile label="Total Assets" value={data.total_assets} />
            <KpiTile label="Total Liabilities" value={data.total_liabilities} />
            <KpiTile label="Total Equity" value={data.total_equity} />
            <KpiTile label="Net Income (Periode)" value={data.net_income} positiveGood />
            <KpiTile label="Cash Position" value={data.cash_position} />
            <KpiTile label="AR Outstanding" value={data.ar_total_outstanding} />
            <KpiTile label="AP Outstanding" value={data.ap_total_outstanding} />
            <KpiTile label="Net Position (AR-AP)" value={data.net_position} positiveGood />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-sm font-semibold mb-3">Revenue vs COGS vs Expense</div>
              <Bar
                data={{
                  labels: ["Revenue", "COGS", "Gross Profit", "Expense", "Net Income"],
                  datasets: [
                    {
                      label: "Rp",
                      data: [data.revenue, data.cogs, data.gross_profit, data.expense, data.net_income],
                      backgroundColor: ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#6366f1"],
                    },
                  ],
                }}
                options={{ plugins: { legend: { display: false } } }}
              />
            </Card>

            <Card className="p-4">
              <div className="text-sm font-semibold mb-2">Kas &amp; Bank per Akun</div>
              <table className="w-full text-sm">
                <tbody>
                  {data.cash_accounts.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-1.5 text-muted-foreground">{a.account_code}</td>
                      <td className="py-1.5">{a.account_name}</td>
                      <td className="py-1.5 text-right font-medium">{formatIDR(a.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs text-muted-foreground mt-2">
                AR Overdue: {formatIDR(data.ar_total_overdue)} · AP Overdue: {formatIDR(data.ap_total_overdue)}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">5 Project Margin Terendah</div>
            {data.worst_projects.length === 0 ? (
              <div className="text-xs text-muted-foreground">Belum ada data project.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {data.worst_projects.map((p) => (
                    <tr key={p.project_id} className="border-b last:border-0">
                      <td className="py-1.5">
                        <Link href={`/projects/${p.project_id}`} className="text-blue-600 hover:underline">
                          {p.project_code}
                        </Link>
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                      </td>
                      <td
                        className={`py-1.5 text-right font-medium ${
                          p.real_margin >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatIDR(p.real_margin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
