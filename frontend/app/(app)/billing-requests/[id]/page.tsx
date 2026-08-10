"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiGetBillingRequest, apiSubmitBillingRequest, canEditDepartment } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApprovalStepsPanel } from "@/components/ApprovalStepsPanel";

type BillingRequestDetail = {
  id: number;
  meta_number: string;
  sales_order_id: number;
  so_number?: string;
  requested_by_username?: string;
  status: string;
  amount: number;
  description?: string | null;
  approval_request_id?: number | null;
  notes?: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-rose-100 text-rose-700",
};

export default function BillingRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [br, setBr] = useState<BillingRequestDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetBillingRequest(id);
      setBr(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const submit = async () => {
    if (!confirm("Submit META ini untuk approval?")) return;
    try {
      setSubmitting(true);
      setError("");
      await apiSubmitBillingRequest(id);
      load();
    } catch (e: any) {
      setError(e.message || "Gagal submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !br) {
    return (
      <div className="p-6">
        <p>Loading...</p>
      </div>
    );
  }
  if (!br) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">META tidak ditemukan.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">{br.meta_number}</h1>
          <p className="text-muted-foreground">
            Sales Order: {br.so_number || "-"} — Diajukan oleh {br.requested_by_username || "-"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={STATUS_BADGE[br.status] || "bg-muted"}>{br.status}</Badge>
          {br.status === "draft" && canEditDepartment("Operations") && (
            <Button size="sm" onClick={submit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit untuk Approval"}
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push("/billing-requests")}>
            Back
          </Button>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}

      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Amount</div>
        <div className="font-semibold text-lg">{formatIDR(br.amount)}</div>
      </Card>

      {br.description && (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Deskripsi</div>
          <div className="text-sm">{br.description}</div>
        </Card>
      )}

      {br.notes && (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Catatan</div>
          <div className="text-sm">{br.notes}</div>
        </Card>
      )}

      {br.approval_request_id && (
        <ApprovalStepsPanel approvalId={br.approval_request_id} onActed={load} />
      )}

      {br.status === "approved" && (
        <Card className="p-4 bg-green-50 border-green-200">
          {canEditDepartment("Finance") ? (
            <p className="text-sm text-green-800">
              META sudah disetujui. Lanjutkan dengan membuat{" "}
              <Link href="/invoices/new" className="underline font-medium">
                Invoice
              </Link>{" "}
              dari META ini.
            </p>
          ) : (
            <p className="text-sm text-green-800">
              META sudah disetujui. Finance akan melanjutkan proses pembuatan Invoice.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
