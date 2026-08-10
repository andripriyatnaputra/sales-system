"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGetInvoices, canEditDepartment } from "@/lib/api";
import { formatIDR } from "@/lib/utils";

type Invoice = {
  id: number;
  invoice_number: string;
  meta_number?: string;
  so_number?: string;
  customer_name?: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  is_overdue: boolean;
  due_date?: string | null;
  created_at: string;
  issuance_aging_days?: number | null;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  cancelled: "bg-rose-100 text-rose-700",
};

export default function InvoicesPage() {
  const [list, setList] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetInvoices();
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
      (i) =>
        i.invoice_number.toLowerCase().includes(q) ||
        (i.so_number || "").toLowerCase().includes(q) ||
        (i.customer_name || "").toLowerCase().includes(q)
    );
  }, [list, search]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Invoice</h2>
          <p className="text-sm text-muted-foreground">Dikonversi Finance dari META yang sudah disetujui.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="border rounded-lg px-3 py-2 text-sm w-56"
            placeholder="Cari Invoice / SO / customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {canEditDepartment("Finance") && (
            <Link href="/invoices/new" className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">
              + New Invoice
            </Link>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Invoice Number</th>
              <th className="px-3 py-2 text-left">Customer</th>
              <th className="px-3 py-2 text-left">Sales Order</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left">Jatuh Tempo</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Aging Terbit</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="p-4 text-center">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-muted-foreground">
                  Belum ada Invoice.
                </td>
              </tr>
            ) : (
              filtered.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{i.invoice_number}</td>
                  <td className="px-3 py-2">{i.customer_name || "-"}</td>
                  <td className="px-3 py-2">{i.so_number || "-"}</td>
                  <td className="px-3 py-2 text-right">{formatIDR(i.total_amount)}</td>
                  <td className="px-3 py-2">
                    {i.due_date ? i.due_date.slice(0, 10) : "-"}
                    {i.is_overdue && (
                      <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                        Overdue
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[i.status] || "bg-muted"}`}>
                      {i.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {i.issuance_aging_days != null ? `${i.issuance_aging_days} hari setelah META disetujui` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/invoices/${i.id}`} className="text-blue-600 hover:underline">
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
