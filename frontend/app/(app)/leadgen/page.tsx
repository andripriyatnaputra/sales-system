"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";

interface LeadGenStats {
  total: number;
  totalNilai: number;
  totalSources: number;
  totalIndustries: number;
  totalQualified: number;
  totalOutreach: number;
  bySource: Record<string, number>;
  byIndustry: Record<string, number>;
  byCategory: Record<string, number>;
}

function formatNilai(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000_000_000) return `Rp ${(n / 1_000_000_000_000).toFixed(1)} T`;
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)} jt`;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export default function LeadGenOverviewPage() {
  const [stats, setStats] = useState<LeadGenStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leadgen/stats")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch stats");
        return r.json();
      })
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthGuard>
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-3 text-sm text-gray-500">Loading stats...</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          <p className="font-semibold mb-1">Tidak dapat terhubung ke database LeadGen</p>
          <p className="text-xs text-red-500">{error}</p>
          <p className="text-xs text-red-400 mt-2">
            Pastikan variabel DATABASE_URL sudah dikonfigurasi dan database leadgen dapat diakses.
          </p>
        </div>
      ) : (
        <div>
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Lead Generation Overview</h1>
            <p className="text-sm text-gray-500 mt-1">
              Sistem lead generation otomatis — scraping tender dari berbagai sumber
            </p>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
            <StatCard
              label="Total Leads"
              value={stats?.total ?? 0}
              color="bg-blue-500"
              icon="📋"
            />
            <StatCard
              label="Total Nilai"
              value={formatNilai(stats?.totalNilai ?? 0)}
              color="bg-green-500"
              icon="💰"
            />
            <StatCard
              label="Sumber Data"
              value={stats?.totalSources ?? 0}
              color="bg-purple-500"
              icon="🌐"
            />
            <StatCard
              label="Industri"
              value={stats?.totalIndustries ?? 0}
              color="bg-orange-500"
              icon="🏭"
            />
            <StatCard
              label="Qualified"
              value={stats?.totalQualified ?? 0}
              color="bg-emerald-500"
              icon="✅"
            />
            <StatCard
              label="Draft Email"
              value={stats?.totalOutreach ?? 0}
              color="bg-indigo-500"
              icon="✉️"
            />
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Link
              href="/leadgen/agents"
              className="flex items-center gap-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-5 transition-all shadow-sm"
            >
              <span className="text-3xl">🚀</span>
              <div>
                <p className="font-semibold">Run Agents</p>
                <p className="text-blue-100 text-xs mt-0.5">Jalankan scraping & AI processing agents</p>
              </div>
            </Link>

            <Link
              href="/leadgen/raw-leads"
              className="flex items-center gap-4 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg p-5 transition-all shadow-sm"
            >
              <span className="text-3xl">📊</span>
              <div>
                <p className="font-semibold text-gray-900">Raw Leads</p>
                <p className="text-gray-500 text-xs mt-0.5">Lihat semua leads hasil scraping</p>
              </div>
            </Link>

            <Link
              href="/leadgen/outreach"
              className="flex items-center gap-4 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg p-5 transition-all shadow-sm"
            >
              <span className="text-3xl">✉️</span>
              <div>
                <p className="font-semibold text-gray-900">Outreach</p>
                <p className="text-gray-500 text-xs mt-0.5">Qualified leads + draft email</p>
              </div>
            </Link>
          </div>

          {/* Breakdown Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BreakdownCard
              title="Leads by Industry"
              data={stats?.byIndustry ?? {}}
              total={stats?.total ?? 1}
              color="bg-blue-500"
            />
            <BreakdownCard
              title="Leads by Category"
              data={stats?.byCategory ?? {}}
              total={stats?.total ?? 1}
              color="bg-green-500"
            />
            <BreakdownCard
              title="Leads by Source"
              data={stats?.bySource ?? {}}
              total={stats?.total ?? 1}
              color="bg-purple-500"
            />
          </div>
        </div>
      )}
    </AuthGuard>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <div className={`mt-2 h-1 w-8 rounded-full ${color}`} />
    </div>
  );
}

function BreakdownCard({
  title,
  data,
  total,
  color,
}: {
  title: string;
  data: Record<string, number>;
  total: number;
  color: string;
}) {
  const sorted = Object.entries(data)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">{title}</h3>
      {sorted.length === 0 ? (
        <p className="text-xs text-gray-400">Belum ada data</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(([key, count]) => (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 capitalize truncate max-w-[160px]">{key}</span>
                <span className="font-medium text-gray-900 ml-2">{count}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className={`${color} h-1.5 rounded-full`}
                  style={{ width: `${Math.min(100, (count / total) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
