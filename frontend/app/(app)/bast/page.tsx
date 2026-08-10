"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGetBASTVendorList, apiGetBASTCustomerList } from "@/lib/api";

type BASTVendor = {
  id: number;
  bast_number: string;
  po_number: string;
  received_by_username?: string;
  received_date: string;
  status: string;
  turnaround_days?: number | null;
};

type BASTCustomer = {
  id: number;
  bast_number: string;
  so_number: string;
  delivered_by_username?: string;
  delivered_date: string;
  status: string;
  turnaround_days?: number | null;
};

const STATUS_BADGE: Record<string, string> = {
  complete: "bg-green-100 text-green-700",
  partial: "bg-amber-100 text-amber-700",
};

export default function BASTPage() {
  const [tab, setTab] = useState<"vendor" | "customer">("vendor");
  const [vendorList, setVendorList] = useState<BASTVendor[]>([]);
  const [customerList, setCustomerList] = useState<BASTCustomer[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (tab === "vendor") {
        const data = await apiGetBASTVendorList();
        setVendorList(Array.isArray(data) ? data : []);
      } else {
        const data = await apiGetBASTCustomerList();
        setCustomerList(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">BAST (Berita Acara Serah Terima)</h2>
          <p className="text-sm text-muted-foreground">Penerimaan barang dari vendor dan serah terima ke customer.</p>
        </div>
        <Link
          href={tab === "vendor" ? "/bast/vendor/new" : "/bast/customer/new"}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >
          + New BAST {tab === "vendor" ? "Vendor" : "Customer"}
        </Link>
      </div>

      <div className="flex gap-2 border-b">
        <button
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "vendor" ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground"
          }`}
          onClick={() => setTab("vendor")}
        >
          BAST Vendor
        </button>
        <button
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "customer" ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground"
          }`}
          onClick={() => setTab("customer")}
        >
          BAST Customer
        </button>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        {tab === "vendor" ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">BAST Number</th>
                <th className="px-3 py-2 text-left">Purchase Order</th>
                <th className="px-3 py-2 text-left">Diterima Oleh</th>
                <th className="px-3 py-2 text-left">Tanggal</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Turnaround</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center">
                    Loading...
                  </td>
                </tr>
              ) : vendorList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">
                    Belum ada BAST Vendor.
                  </td>
                </tr>
              ) : (
                vendorList.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{b.bast_number}</td>
                    <td className="px-3 py-2">{b.po_number}</td>
                    <td className="px-3 py-2">{b.received_by_username || "-"}</td>
                    <td className="px-3 py-2">{b.received_date?.slice(0, 10)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[b.status] || "bg-muted"}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {b.turnaround_days != null ? `${b.turnaround_days} hari setelah PO disetujui` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/bast/vendor/${b.id}`} className="text-blue-600 hover:underline">
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">BAST Number</th>
                <th className="px-3 py-2 text-left">Sales Order</th>
                <th className="px-3 py-2 text-left">Diserahkan Oleh</th>
                <th className="px-3 py-2 text-left">Tanggal</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Turnaround</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center">
                    Loading...
                  </td>
                </tr>
              ) : customerList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">
                    Belum ada BAST Customer.
                  </td>
                </tr>
              ) : (
                customerList.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{b.bast_number}</td>
                    <td className="px-3 py-2">{b.so_number}</td>
                    <td className="px-3 py-2">{b.delivered_by_username || "-"}</td>
                    <td className="px-3 py-2">{b.delivered_date?.slice(0, 10)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[b.status] || "bg-muted"}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {b.turnaround_days != null ? `${b.turnaround_days} hari setelah SO dibuat` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/bast/customer/${b.id}`} className="text-blue-600 hover:underline">
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
