"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGetAllPaymentSchedules } from "@/lib/api";
import { formatIDR } from "@/lib/utils";

type APAgingRow = {
  id: number;
  parent_id: number;
  po_number: string;
  vendor_name: string;
  sequence: number;
  amount: number;
  status: string;
  due_date?: string | null;
  proof_file_name?: string;
  days_overdue: number;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  due: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
};

export default function PaymentSchedulesPage() {
  const [list, setList] = useState<APAgingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetAllPaymentSchedules(statusFilter || undefined);
      setList(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const totalOverdue = useMemo(
    () => list.filter((r) => r.days_overdue > 0).reduce((sum, r) => sum + r.amount, 0),
    [list]
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">AP Aging</h2>
          <p className="text-sm text-muted-foreground">
            Termin pembayaran vendor lintas Purchase Order, diurutkan dari yang paling terlambat.
          </p>
        </div>
        <select
          className="border rounded-lg px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Semua status</option>
          <option value="pending">Pending</option>
          <option value="due">Due</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {totalOverdue > 0 && (
        <div className="text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-2">
          Total nilai termin terlambat: <span className="font-semibold">{formatIDR(totalOverdue)}</span>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">PO Number</th>
              <th className="px-3 py-2 text-left">Vendor</th>
              <th className="px-3 py-2 text-left">Termin #</th>
              <th className="px-3 py-2 text-right">Nominal</th>
              <th className="px-3 py-2 text-left">Jatuh Tempo</th>
              <th className="px-3 py-2 text-left">Hari Terlambat</th>
              <th className="px-3 py-2 text-left">Status</th>
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
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-muted-foreground">
                  Tidak ada termin.
                </td>
              </tr>
            ) : (
              list.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.po_number}</td>
                  <td className="px-3 py-2">{r.vendor_name}</td>
                  <td className="px-3 py-2">{r.sequence}</td>
                  <td className="px-3 py-2 text-right">{formatIDR(r.amount)}</td>
                  <td className="px-3 py-2">{r.due_date ? r.due_date.slice(0, 10) : "-"}</td>
                  <td className="px-3 py-2">
                    {r.days_overdue > 0 ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                        {r.days_overdue} hari
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] || "bg-muted"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/purchase-orders/${r.parent_id}`} className="text-blue-600 hover:underline">
                      Detail PO
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
