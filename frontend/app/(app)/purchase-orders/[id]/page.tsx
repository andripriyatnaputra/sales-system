"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  apiGetPurchaseOrder,
  apiSubmitPurchaseOrder,
  apiCreatePaymentSchedule,
  apiUpdatePaymentSchedule,
  apiDeletePaymentSchedule,
  apiUploadPaymentProof,
  apiDownloadPaymentProof,
  canEditDepartment,
} from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ApprovalStepsPanel } from "@/components/ApprovalStepsPanel";
import { MarkPaidModal } from "@/components/MarkPaidModal";

type POItem = {
  id: number;
  item_name: string;
  unit?: string | null;
  qty: number;
  unit_cost: number;
};

type PaymentSchedule = {
  id: number;
  sequence: number;
  trigger_description?: string | null;
  percentage?: number | null;
  amount: number;
  status: string;
  due_date?: string | null;
  paid_at?: string | null;
  proof_file_name?: string;
  days_overdue?: number;
};

type PurchaseOrderDetail = {
  id: number;
  po_number: string;
  pr_number?: string;
  vendor_name?: string;
  status: string;
  total_value: number;
  approval_request_id?: number | null;
  notes?: string | null;
  items?: POItem[];
  payment_schedules?: PaymentSchedule[];
  po_creation_aging_days?: number | null;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-rose-100 text-rose-700",
  cancelled: "bg-rose-100 text-rose-700",
};

const PS_STATUS_BADGE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  due: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
};

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [psModalOpen, setPsModalOpen] = useState(false);
  const [editingPs, setEditingPs] = useState<PaymentSchedule | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<PaymentSchedule | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetPurchaseOrder(id);
      setPo(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const submit = async () => {
    if (!confirm("Submit PO ini untuk approval?")) return;
    try {
      setSubmitting(true);
      setError("");
      await apiSubmitPurchaseOrder(id);
      load();
    } catch (e: any) {
      setError(e.message || "Gagal submit");
    } finally {
      setSubmitting(false);
    }
  };

  const markPaid = (ps: PaymentSchedule) => {
    setMarkPaidTarget(ps);
  };

  const deleteSchedule = async (ps: PaymentSchedule) => {
    if (!confirm(`Hapus termin #${ps.sequence}?`)) return;
    await apiDeletePaymentSchedule(id, ps.id);
    load();
  };

  if (loading && !po) {
    return (
      <div className="p-6">
        <p>Loading...</p>
      </div>
    );
  }
  if (!po) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Purchase Order tidak ditemukan.</p>
      </div>
    );
  }

  const items = po.items || [];
  const schedules = po.payment_schedules || [];
  const totalScheduled = schedules.reduce((sum, s) => sum + (s.amount || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">{po.po_number}</h1>
          <p className="text-muted-foreground">
            PR: {po.pr_number || "-"} — Vendor: {po.vendor_name || "-"}
          </p>
          {po.po_creation_aging_days != null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              PO dibuat {po.po_creation_aging_days} hari setelah PR disetujui
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Badge className={STATUS_BADGE[po.status] || "bg-muted"}>{po.status}</Badge>
          {po.status === "draft" && canEditDepartment("Procurement") && (
            <Button size="sm" onClick={submit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit untuk Approval"}
            </Button>
          )}
          {po.status === "approved" && (
            <Button variant="outline" onClick={() => window.open(`/print/po/${po.id}`, "_blank")}>
              Print PO
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push("/purchase-orders")}>
            Back
          </Button>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Nilai PO</div>
          <div className="font-semibold text-lg">{formatIDR(po.total_value)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Termin Tersusun</div>
          <div className="font-semibold text-lg">{formatIDR(totalScheduled)}</div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-3">Item Purchase Order</h3>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2">Item</th>
                <th className="text-left py-2">Unit</th>
                <th className="text-right py-2">Qty</th>
                <th className="text-right py-2">Harga Satuan</th>
                <th className="text-right py-2">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b">
                  <td className="py-2">{it.item_name}</td>
                  <td className="py-2">{it.unit || "-"}</td>
                  <td className="py-2 text-right">{it.qty}</td>
                  <td className="py-2 text-right">{formatIDR(it.unit_cost)}</td>
                  <td className="py-2 text-right">{formatIDR(it.unit_cost * it.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Termin Pembayaran</h3>
            <p className="text-xs text-muted-foreground">Bebas dikonfigurasi sesuai kesepakatan (DP/progress/pelunasan, jumlah termin bebas).</p>
          </div>
          {canEditDepartment("Procurement") && (
            <Button
              size="sm"
              onClick={() => {
                setEditingPs(null);
                setPsModalOpen(true);
              }}
            >
              + Tambah Termin
            </Button>
          )}
        </div>

        <div className="mt-3 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 px-2">#</th>
                <th className="text-left py-2 px-2">Deskripsi</th>
                <th className="text-right py-2 px-2">%</th>
                <th className="text-right py-2 px-2">Nominal</th>
                <th className="text-left py-2 px-2">Jatuh Tempo</th>
                <th className="text-left py-2 px-2">Status</th>
                <th className="text-right py-2 px-2">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-muted-foreground">
                    Belum ada termin.
                  </td>
                </tr>
              ) : (
                schedules
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((ps) => (
                    <tr key={ps.id} className="border-b">
                      <td className="py-2 px-2">{ps.sequence}</td>
                      <td className="py-2 px-2">{ps.trigger_description || "-"}</td>
                      <td className="py-2 px-2 text-right">{ps.percentage != null ? `${ps.percentage}%` : "-"}</td>
                      <td className="py-2 px-2 text-right">{formatIDR(ps.amount)}</td>
                      <td className="py-2 px-2">{ps.due_date ? ps.due_date.slice(0, 10) : "-"}</td>
                      <td className="py-2 px-2">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${PS_STATUS_BADGE[ps.status] || "bg-muted"}`}>
                          {ps.status}
                        </span>
                        {!!ps.days_overdue && ps.days_overdue > 0 && (
                          <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                            Terlambat {ps.days_overdue} hari
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right space-x-2">
                        {canEditDepartment("Procurement") ? (
                          <>
                            {ps.status !== "paid" && (
                              <button className="text-green-700 text-xs" onClick={() => markPaid(ps)}>
                                Tandai Lunas
                              </button>
                            )}
                            <button
                              className="text-blue-600 text-xs"
                              onClick={() => {
                                setEditingPs(ps);
                                setPsModalOpen(true);
                              }}
                            >
                              Edit
                            </button>
                            <button className="text-red-600 text-xs" onClick={() => deleteSchedule(ps)}>
                              Hapus
                            </button>
                          </>
                        ) : (
                          !ps.proof_file_name && "-"
                        )}
                        <ProofCell poId={id} ps={ps} canEdit={canEditDepartment("Procurement")} onChanged={load} />
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {po.approval_request_id && <ApprovalStepsPanel approvalId={po.approval_request_id} onActed={load} />}

      {psModalOpen && (
        <PaymentScheduleModal
          poId={id}
          schedule={editingPs}
          nextSequence={schedules.length + 1}
          onClose={() => setPsModalOpen(false)}
          onSaved={() => {
            setPsModalOpen(false);
            load();
          }}
        />
      )}

      {markPaidTarget && (
        <MarkPaidModal
          title={`Tandai termin #${markPaidTarget.sequence} sebagai lunas`}
          amount={markPaidTarget.amount}
          onClose={() => setMarkPaidTarget(null)}
          onConfirm={async (bankAccountId) => {
            await apiUpdatePaymentSchedule(id, markPaidTarget.id, { status: "paid", bank_account_id: bankAccountId });
            setMarkPaidTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ProofCell({
  poId,
  ps,
  canEdit,
  onChanged,
}: {
  poId: string;
  ps: PaymentSchedule;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      await apiUploadPaymentProof(poId, ps.id, file);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onChanged();
    } finally {
      setUploading(false);
    }
  };

  if (ps.proof_file_name) {
    return (
      <button
        className="text-blue-600 text-xs"
        onClick={() => apiDownloadPaymentProof(poId, ps.id, ps.proof_file_name!)}
      >
        Lihat Bukti
      </button>
    );
  }

  if (!canEdit) return null;

  return (
    <span className="inline-flex items-center gap-1">
      <input ref={fileInputRef} type="file" className="text-xs w-24" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" />
      <button className="text-green-700 text-xs" onClick={handleUpload} disabled={uploading}>
        {uploading ? "..." : "Upload Bukti"}
      </button>
    </span>
  );
}

function PaymentScheduleModal({
  poId,
  schedule,
  nextSequence,
  onClose,
  onSaved,
}: {
  poId: string;
  schedule: PaymentSchedule | null;
  nextSequence: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!schedule;
  const [sequence, setSequence] = useState(schedule?.sequence ?? nextSequence);
  const [triggerDescription, setTriggerDescription] = useState(schedule?.trigger_description || "");
  const [percentage, setPercentage] = useState(schedule?.percentage != null ? String(schedule.percentage) : "");
  const [amount, setAmount] = useState(schedule?.amount != null ? String(schedule.amount) : "");
  const [dueDate, setDueDate] = useState(schedule?.due_date ? schedule.due_date.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    try {
      setSaving(true);
      setError("");

      if (isEdit) {
        await apiUpdatePaymentSchedule(poId, schedule!.id, {
          trigger_description: triggerDescription || null,
          percentage: percentage ? Number(percentage) : null,
          amount: amount ? Number(amount) : null,
          due_date: dueDate || null,
        });
      } else {
        await apiCreatePaymentSchedule(poId, {
          sequence,
          trigger_description: triggerDescription || null,
          percentage: percentage ? Number(percentage) : null,
          amount: amount ? Number(amount) : 0,
          due_date: dueDate || null,
        });
      }

      onSaved();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit Termin #${schedule?.sequence}` : "Tambah Termin"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {!isEdit && (
            <div className="space-y-1">
              <div className="text-sm font-medium">Urutan Termin</div>
              <Input type="number" value={sequence} onChange={(e) => setSequence(Number(e.target.value))} />
            </div>
          )}
          <div className="space-y-1">
            <div className="text-sm font-medium">Deskripsi Trigger</div>
            <Input
              value={triggerDescription}
              onChange={(e) => setTriggerDescription(e.target.value)}
              placeholder="DP di awal / Setelah BAST / Net 30 hari / dst"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">Persentase (opsional)</div>
              <Input type="number" value={percentage} onChange={(e) => setPercentage(e.target.value)} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Nominal (Rp)</div>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Jatuh Tempo (opsional)</div>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
