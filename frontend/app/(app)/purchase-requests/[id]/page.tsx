"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiGetPurchaseRequest, apiSubmitPurchaseRequest, canEditDepartment } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApprovalStepsPanel } from "@/components/ApprovalStepsPanel";

type PRItem = {
  id: number;
  sales_order_item_id: number;
  item_name: string;
  unit?: string | null;
  qty: number;
  estimated_unit_cost?: number | null;
};

type PurchaseRequestDetail = {
  id: number;
  pr_number: string;
  sales_order_id: number;
  so_number?: string;
  requested_by_username?: string;
  status: string;
  total_estimated_value: number;
  approval_request_id?: number | null;
  notes?: string | null;
  items?: PRItem[];
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-rose-100 text-rose-700",
};

export default function PurchaseRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [pr, setPr] = useState<PurchaseRequestDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetPurchaseRequest(id);
      setPr(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const submit = async () => {
    if (!confirm("Submit PR ini untuk approval?")) return;
    try {
      setSubmitting(true);
      setError("");
      await apiSubmitPurchaseRequest(id);
      load();
    } catch (e: any) {
      setError(e.message || "Gagal submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !pr) {
    return (
      <div className="p-6">
        <p>Loading...</p>
      </div>
    );
  }
  if (!pr) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Purchase Request tidak ditemukan.</p>
      </div>
    );
  }

  const items = pr.items || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">{pr.pr_number}</h1>
          <p className="text-muted-foreground">
            Sales Order: {pr.so_number || "-"} — Diajukan oleh {pr.requested_by_username || "-"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={STATUS_BADGE[pr.status] || "bg-muted"}>{pr.status}</Badge>
          {pr.status === "draft" && canEditDepartment("Operations") && (
            <Button size="sm" onClick={submit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit untuk Approval"}
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push("/purchase-requests")}>
            Back
          </Button>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}

      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Total Estimasi Nilai</div>
        <div className="font-semibold text-lg">{formatIDR(pr.total_estimated_value)}</div>
      </Card>

      {pr.notes && (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Catatan</div>
          <div className="text-sm">{pr.notes}</div>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-3">Item Diajukan</h3>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2">Item</th>
                <th className="text-left py-2">Unit</th>
                <th className="text-right py-2">Qty</th>
                <th className="text-right py-2">Estimasi Harga Satuan</th>
                <th className="text-right py-2">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">
                    Tidak ada item.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-b">
                    <td className="py-2">{it.item_name}</td>
                    <td className="py-2">{it.unit || "-"}</td>
                    <td className="py-2 text-right">{it.qty}</td>
                    <td className="py-2 text-right">{it.estimated_unit_cost != null ? formatIDR(it.estimated_unit_cost) : "-"}</td>
                    <td className="py-2 text-right">
                      {it.estimated_unit_cost != null ? formatIDR(it.estimated_unit_cost * it.qty) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {pr.approval_request_id && (
        <ApprovalStepsPanel approvalId={pr.approval_request_id} onActed={load} />
      )}

      {pr.status === "approved" && (
        <Card className="p-4 bg-green-50 border-green-200">
          <p className="text-sm text-green-800">
            PR sudah disetujui. Lanjutkan dengan membuat{" "}
            <Link href="/purchase-orders/new" className="underline font-medium">
              Purchase Order
            </Link>{" "}
            dari PR ini.
          </p>
        </Card>
      )}
    </div>
  );
}
