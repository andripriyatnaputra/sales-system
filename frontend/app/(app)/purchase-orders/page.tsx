"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGetPurchaseOrders } from "@/lib/api";
import { formatIDR } from "@/lib/utils";

type PurchaseOrder = {
  id: number;
  po_number: string;
  pr_number?: string;
  vendor_name?: string;
  status: string;
  total_value: number;
  created_at: string;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-rose-100 text-rose-700",
  cancelled: "bg-rose-100 text-rose-700",
};

export default function PurchaseOrdersPage() {
  const [list, setList] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetPurchaseOrders();
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
      (p) =>
        p.po_number.toLowerCase().includes(q) ||
        (p.pr_number || "").toLowerCase().includes(q) ||
        (p.vendor_name || "").toLowerCase().includes(q)
    );
  }, [list, search]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Purchase Orders</h2>
          <p className="text-sm text-muted-foreground">Dibuat Procurement dari Purchase Request yang sudah approved.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="border rounded-lg px-3 py-2 text-sm w-56"
            placeholder="Cari PO / PR / vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Link href="/purchase-orders/new" className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">
            + New PO
          </Link>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">PO Number</th>
              <th className="px-3 py-2 text-left">Purchase Request</th>
              <th className="px-3 py-2 text-left">Vendor</th>
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
                  Belum ada Purchase Order.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{p.po_number}</td>
                  <td className="px-3 py-2">{p.pr_number || "-"}</td>
                  <td className="px-3 py-2">{p.vendor_name || "-"}</td>
                  <td className="px-3 py-2 text-right">{formatIDR(p.total_value)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status] || "bg-muted"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/purchase-orders/${p.id}`} className="text-blue-600 hover:underline">
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
