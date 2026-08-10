"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGetSalesOrders } from "@/lib/api";
import { formatIDR } from "@/lib/utils";

type SalesOrder = {
  id: number;
  project_id: number;
  project_code: string;
  so_number: string;
  customer_name?: string;
  total_value: number;
  status: string;
  created_at: string;
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  cancelled: "bg-rose-100 text-rose-700",
};

export default function SalesOrdersPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetSalesOrders();
      setOrders(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(
      (o) =>
        o.so_number.toLowerCase().includes(q) ||
        o.project_code.toLowerCase().includes(q) ||
        (o.customer_name || "").toLowerCase().includes(q)
    );
  }, [orders, search]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Sales Orders</h2>
          <p className="text-sm text-muted-foreground">
            Sales Order dibuat otomatis begitu project closing (Win) — tidak ada create manual.
          </p>
        </div>
        <input
          className="border rounded-lg px-3 py-2 text-sm w-64"
          placeholder="Cari SO number / project / customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">SO Number</th>
              <th className="px-3 py-2 text-left">Project</th>
              <th className="px-3 py-2 text-left">Customer</th>
              <th className="px-3 py-2 text-right">Total Value</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-4 text-center">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                  Belum ada Sales Order.
                </td>
              </tr>
            ) : (
              filtered.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{o.so_number}</td>
                  <td className="px-3 py-2">
                    <Link href={`/projects/${o.project_id}`} className="text-blue-600 hover:underline">
                      {o.project_code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{o.customer_name || "-"}</td>
                  <td className="px-3 py-2 text-right">{formatIDR(o.total_value)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[o.status] || "bg-muted"}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/sales-orders/${o.id}`} className="text-blue-600 hover:underline">
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
