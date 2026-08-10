"use client";

import { useEffect, useState } from "react";
import { apiGetApproval, apiApproveApproval, apiRejectApproval } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ApprovalStep = {
  id: number;
  step_order: number;
  approver_role_label?: string;
  approver_user_username?: string;
  status: string;
  acted_by_username?: string;
  acted_at?: string;
  comment?: string;
};

type Approval = {
  id: number;
  entity_type: string;
  entity_label?: string;
  status: string;
  steps?: ApprovalStep[];
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-rose-100 text-rose-700",
  skipped: "bg-muted text-muted-foreground",
};

// ApprovalStepsPanel: dipakai di halaman detail PR/PO/dsb dan di halaman
// Approvals generik -- satu titik render steps + tombol approve/reject.
// Otorisasi SEPENUHNYA di backend (403 kalau bukan giliran/bukan approver-nya);
// komponen ini tidak menyembunyikan tombol berdasarkan tebakan siapa yang login,
// cukup tampilkan error dari backend kalau ditolak.
export function ApprovalStepsPanel({ approvalId, onActed }: { approvalId: number; onActed?: () => void }) {
  const [approval, setApproval] = useState<Approval | null>(null);
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const data = await apiGetApproval(approvalId);
    setApproval(data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalId]);

  const act = async (decision: "approve" | "reject") => {
    try {
      setActing(true);
      setError("");
      if (decision === "approve") await apiApproveApproval(approvalId, comment);
      else await apiRejectApproval(approvalId, comment);
      setComment("");
      await load();
      onActed?.();
    } catch (e: any) {
      setError(e.message || "Gagal memproses approval");
    } finally {
      setActing(false);
    }
  };

  if (!approval) return null;

  const currentStep = (approval.steps || []).find((s) => s.status === "pending");

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Approval</h3>
        <Badge className={STATUS_BADGE[approval.status] || "bg-muted"}>{approval.status}</Badge>
      </div>

      <div className="space-y-2">
        {(approval.steps || []).map((s) => (
          <div key={s.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
            <div>
              <div className="font-medium">
                Step {s.step_order}:{" "}
                {s.approver_user_username ? `${s.approver_user_username} (manager langsung)` : s.approver_role_label}
              </div>
              {s.acted_by_username && (
                <div className="text-xs text-muted-foreground">
                  Diaksi oleh {s.acted_by_username}
                  {s.comment ? ` — "${s.comment}"` : ""}
                </div>
              )}
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status] || "bg-muted"}`}>{s.status}</span>
          </div>
        ))}
      </div>

      {currentStep && (
        <div className="mt-4 space-y-2 border-t pt-4">
          <div className="text-sm text-muted-foreground">
            Menunggu approval dari:{" "}
            <span className="font-medium text-foreground">
              {currentStep.approver_user_username || currentStep.approver_role_label}
            </span>
          </div>
          <input
            className="border rounded px-3 py-2 w-full text-sm"
            placeholder="Komentar (opsional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => act("approve")} disabled={acting}>
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => act("reject")} disabled={acting}>
              Reject
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
