"use client";

import { Fragment, useEffect, useState } from "react";
import { apiGetApprovals } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { ApprovalStepsPanel } from "@/components/ApprovalStepsPanel";

type ApprovalRequest = {
  id: number;
  entity_type: string;
  entity_id: string;
  entity_label?: string;
  amount?: number;
  status: string;
  created_at: string;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-rose-100 text-rose-700",
  cancelled: "bg-muted text-muted-foreground",
};

const ENTITY_LABEL: Record<string, string> = {
  presales_price_approval: "Presales - Rekomendasi Harga",
  purchase_request: "Purchase Request",
  purchase_order: "Purchase Order",
};

export default function ApprovalsPage() {
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [list, setList] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetApprovals(tab === "mine" ? { mine: true } : {});
      setList(Array.isArray(data) ? data : []);
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
      <div>
        <h2 className="text-xl font-semibold">Approvals</h2>
        <p className="text-sm text-muted-foreground">
          Semua request approval (Presales, Purchase Request, Purchase Order) di satu tempat.
        </p>
      </div>

      <div className="flex gap-2 border-b">
        <button
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "mine" ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground"
          }`}
          onClick={() => setTab("mine")}
        >
          Menunggu Approval Saya
        </button>
        <button
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "all" ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground"
          }`}
          onClick={() => setTab("all")}
        >
          Semua
        </button>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Tipe</th>
              <th className="px-3 py-2 text-left">Deskripsi</th>
              <th className="px-3 py-2 text-right">Nilai</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-4 text-center">
                  Loading...
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                  {tab === "mine" ? "Tidak ada approval yang menunggu Anda." : "Belum ada approval request."}
                </td>
              </tr>
            ) : (
              list.map((a) => (
                <Fragment key={a.id}>
                  <tr className="border-t">
                    <td className="px-3 py-2">{ENTITY_LABEL[a.entity_type] || a.entity_type}</td>
                    <td className="px-3 py-2">{a.entity_label || a.entity_id}</td>
                    <td className="px-3 py-2 text-right">{a.amount != null ? formatIDR(a.amount) : "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[a.status] || "bg-muted"}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="text-blue-600 hover:underline"
                        onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                      >
                        {expandedId === a.id ? "Tutup" : "Lihat / Aksi"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === a.id && (
                    <tr>
                      <td colSpan={5} className="p-4 bg-gray-50">
                        <ApprovalStepsPanel approvalId={a.id} onActed={load} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
