"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGetBillingRequests, canEditDepartment } from "@/lib/api";
import { formatIDR } from "@/lib/utils";

type BillingRequest = {
  id: number;
  meta_number: string;
  so_number?: string;
  requested_by_username?: string;
  status: string;
  amount: number;
  created_at: string;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-rose-100 text-rose-700",
};

export default function BillingRequestsPage() {
  const [list, setList] = useState<BillingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetBillingRequests();
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
      (b) =>
        b.meta_number.toLowerCase().includes(q) ||
        (b.so_number || "").toLowerCase().includes(q) ||
        (b.requested_by_username || "").toLowerCase().includes(q)
    );
  }, [list, search]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">META (Memo Tagih)</h2>
          <p className="text-sm text-muted-foreground">Diajukan Operations untuk minta Finance menagih customer.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="border rounded-lg px-3 py-2 text-sm w-56"
            placeholder="Cari META / SO / pemohon..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {canEditDepartment("Operations") && (
            <Link href="/billing-requests/new" className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">
              + New META
            </Link>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">META Number</th>
              <th className="px-3 py-2 text-left">Sales Order</th>
              <th className="px-3 py-2 text-left">Diajukan Oleh</th>
              <th className="px-3 py-2 text-right">Amount</th>
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
                  Belum ada META.
                </td>
              </tr>
            ) : (
              filtered.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{b.meta_number}</td>
                  <td className="px-3 py-2">{b.so_number || "-"}</td>
                  <td className="px-3 py-2">{b.requested_by_username || "-"}</td>
                  <td className="px-3 py-2 text-right">{formatIDR(b.amount)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[b.status] || "bg-muted"}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/billing-requests/${b.id}`} className="text-blue-600 hover:underline">
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
