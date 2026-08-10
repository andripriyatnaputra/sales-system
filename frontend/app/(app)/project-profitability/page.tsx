"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGetAllProjectProfitability } from "@/lib/api";
import { formatIDR } from "@/lib/utils";

type ProfitabilityRow = {
  project_id: number;
  project_code: string;
  description: string;
  customer_name: string;
  target: number;
  committed: number;
  actual_paid: number;
  revenue_realized: number;
  additional_costs: number;
  labor_cost: number;
  real_margin: number;
};

export default function ProjectProfitabilityPage() {
  const [list, setList] = useState<ProfitabilityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetAllProjectProfitability();
      setList(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return list.filter(
      (r) =>
        r.project_code.toLowerCase().includes(q) ||
        (r.customer_name || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q)
    );
  }, [list, search]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Project Profitability</h2>
          <p className="text-sm text-muted-foreground">
            Target vs Committed vs Actual Paid vs Revenue Realized vs Real Margin, diurutkan dari margin terkecil.
          </p>
        </div>
        <input
          className="border rounded-lg px-3 py-2 text-sm w-64"
          placeholder="Cari project / customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Project</th>
              <th className="px-3 py-2 text-left">Customer</th>
              <th className="px-3 py-2 text-right">Target</th>
              <th className="px-3 py-2 text-right">Committed</th>
              <th className="px-3 py-2 text-right">Actual Paid</th>
              <th className="px-3 py-2 text-right">Revenue Realized</th>
              <th className="px-3 py-2 text-right">Labor Cost</th>
              <th className="px-3 py-2 text-right">Real Margin</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="p-4 text-center">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-4 text-center text-muted-foreground">
                  Belum ada project dengan Sales Order.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.project_id} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    {r.project_code}
                    <div className="text-xs text-muted-foreground font-normal">{r.description}</div>
                  </td>
                  <td className="px-3 py-2">{r.customer_name || "-"}</td>
                  <td className="px-3 py-2 text-right">{formatIDR(r.target)}</td>
                  <td className="px-3 py-2 text-right">{formatIDR(r.committed)}</td>
                  <td className="px-3 py-2 text-right">{formatIDR(r.actual_paid)}</td>
                  <td className="px-3 py-2 text-right">{formatIDR(r.revenue_realized)}</td>
                  <td className="px-3 py-2 text-right">{formatIDR(r.labor_cost)}</td>
                  <td
                    className={`px-3 py-2 text-right font-medium ${
                      r.real_margin >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formatIDR(r.real_margin)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/projects/${r.project_id}`} className="text-blue-600 hover:underline">
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
