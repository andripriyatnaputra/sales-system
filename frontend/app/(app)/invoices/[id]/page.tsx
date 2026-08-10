"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGetInvoice, apiUpdateInvoiceStatus, canEditDepartment } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkPaidModal } from "@/components/MarkPaidModal";

type InvoiceDetail = {
  id: number;
  invoice_number: string;
  meta_number?: string;
  sales_order_id: number;
  so_number?: string;
  customer_name?: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  is_overdue: boolean;
  issue_date?: string | null;
  due_date?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  notes?: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  cancelled: "bg-rose-100 text-rose-700",
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [markPaidOpen, setMarkPaidOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetInvoice(id);
      setInv(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const changeStatus = async (status: string) => {
    if (!confirm(`Ubah status invoice jadi "${status}"?`)) return;
    try {
      setUpdating(true);
      setError("");
      await apiUpdateInvoiceStatus(id, status);
      load();
    } catch (e: any) {
      setError(e.message || "Gagal mengubah status");
    } finally {
      setUpdating(false);
    }
  };

  if (loading && !inv) {
    return (
      <div className="p-6">
        <p>Loading...</p>
      </div>
    );
  }
  if (!inv) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Invoice tidak ditemukan.</p>
      </div>
    );
  }

  const canEdit = canEditDepartment("Finance");

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">{inv.invoice_number}</h1>
          <p className="text-muted-foreground">
            {inv.customer_name || "-"} — Sales Order {inv.so_number || "-"} — dari META {inv.meta_number || "-"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={STATUS_BADGE[inv.status] || "bg-muted"}>{inv.status}</Badge>
          {inv.is_overdue && <Badge className="bg-rose-100 text-rose-700">Overdue</Badge>}
          <Button variant="outline" onClick={() => window.open(`/print/invoice/${inv.id}`, "_blank")}>
            Print Invoice
          </Button>
          <Button variant="outline" onClick={() => router.push("/invoices")}>
            Back
          </Button>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Amount</div>
          <div className="font-semibold">{formatIDR(inv.amount)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Tax</div>
          <div className="font-semibold">{formatIDR(inv.tax_amount)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="font-semibold text-lg">{formatIDR(inv.total_amount)}</div>
        </Card>
      </div>

      <Card className="p-4 space-y-1 text-sm">
        <div>Issue Date: {inv.issue_date ? inv.issue_date.slice(0, 10) : "-"}</div>
        <div>Due Date: {inv.due_date ? inv.due_date.slice(0, 10) : "-"}</div>
        <div>Sent At: {inv.sent_at ? new Date(inv.sent_at).toLocaleString("id-ID") : "-"}</div>
        <div>Paid At: {inv.paid_at ? new Date(inv.paid_at).toLocaleString("id-ID") : "-"}</div>
      </Card>

      {inv.notes && (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Catatan</div>
          <div className="text-sm">{inv.notes}</div>
        </Card>
      )}

      {canEdit && (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-2">Ubah Status</div>
          <div className="flex gap-2">
            {inv.status === "draft" && (
              <Button size="sm" onClick={() => changeStatus("sent")} disabled={updating}>
                Tandai Terkirim
              </Button>
            )}
            {inv.status === "sent" && (
              <Button size="sm" onClick={() => setMarkPaidOpen(true)} disabled={updating}>
                Tandai Lunas
              </Button>
            )}
            {(inv.status === "draft" || inv.status === "sent") && (
              <Button size="sm" variant="outline" onClick={() => changeStatus("cancelled")} disabled={updating}>
                Batalkan
              </Button>
            )}
          </div>
        </Card>
      )}

      {markPaidOpen && (
        <MarkPaidModal
          title={`Tandai invoice ${inv.invoice_number} sebagai lunas`}
          amount={inv.total_amount}
          onClose={() => setMarkPaidOpen(false)}
          onConfirm={async (bankAccountId) => {
            await apiUpdateInvoiceStatus(id, "paid", bankAccountId);
            setMarkPaidOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
