"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGetARAPAgingSummary, ARAPAgingSummary } from "@/lib/api";
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

function KPITile({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-2xl font-semibold mt-1 ${
          tone === "positive" ? "text-green-600" : tone === "negative" ? "text-red-600" : ""
        }`}
      >
        {value}
      </div>
    </Card>
  );
}

export default function ARAPAgingPage() {
  const [data, setData] = useState<ARAPAgingSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiGetARAPAgingSummary();
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }
  if (!data) return null;

  const labels = data.ar.buckets.map((b) => b.bucket);
  const arValues = data.ar.buckets.map((b) => b.amount);
  const apValues = data.ap.buckets.map((b) => b.amount);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">AR/AP Aging</h2>
        <p className="text-sm text-muted-foreground">
          Ringkasan gabungan piutang customer (Invoice) vs utang vendor (Purchase Order), dikelompokkan ke rentang
          keterlambatan yang sama supaya bisa dibandingkan langsung.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KPITile label="Total AR Outstanding" value={formatIDR(data.ar.total_outstanding)} />
        <KPITile label="Total AP Outstanding" value={formatIDR(data.ap.total_outstanding)} />
        <KPITile
          label="Net Position (AR − AP)"
          value={formatIDR(data.net_position)}
          tone={data.net_position >= 0 ? "positive" : "negative"}
        />
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">Distribusi Aging — AR vs AP</div>
        <div style={{ height: 280 }}>
          <Bar
            data={{
              labels,
              datasets: [
                { label: "AR (Piutang)", data: arValues, backgroundColor: "rgba(59,130,246,0.85)" },
                { label: "AP (Utang)", data: apValues, backgroundColor: "rgba(249,115,22,0.85)" },
              ],
            }}
            options={{
              maintainAspectRatio: false,
              plugins: { legend: { position: "top" } },
              scales: {
                x: { ticks: { font: { size: 11 } } },
                y: { ticks: { callback: (v) => formatIDR(Number(v)) } },
              },
            }}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">AR — Detail per Bucket</div>
          <table className="w-full text-sm">
            <tbody>
              {data.ar.buckets.map((b) => (
                <tr key={b.bucket} className="border-t">
                  <td className="py-1.5">{b.bucket}</td>
                  <td className="py-1.5 text-muted-foreground">{b.count} invoice</td>
                  <td className="py-1.5 text-right font-medium">{formatIDR(b.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href="/invoices" className="text-sm text-blue-600 hover:underline mt-3 inline-block">
            Lihat detail AR (Invoice) →
          </Link>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">AP — Detail per Bucket</div>
          <table className="w-full text-sm">
            <tbody>
              {data.ap.buckets.map((b) => (
                <tr key={b.bucket} className="border-t">
                  <td className="py-1.5">{b.bucket}</td>
                  <td className="py-1.5 text-muted-foreground">{b.count} termin</td>
                  <td className="py-1.5 text-right font-medium">{formatIDR(b.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href="/payment-schedules" className="text-sm text-blue-600 hover:underline mt-3 inline-block">
            Lihat detail AP (Payment Schedules) →
          </Link>
        </Card>
      </div>
    </div>
  );
}
