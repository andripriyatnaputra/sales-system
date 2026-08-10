"use client";

import { useEffect, useRef, useState } from "react";
import {
  apiGetWorkRequestAttachments,
  apiUploadWorkRequestAttachment,
  apiDownloadWorkRequestAttachment,
  apiDeleteWorkRequestAttachment,
  type WorkRequestAttachment,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

function formatSize(bytes?: number) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkRequestAttachmentsModal({
  workRequestId,
  workRequestTitle,
  canUpload,
  onClose,
}: {
  workRequestId: number;
  workRequestTitle: string;
  canUpload: boolean;
  onClose: () => void;
}) {
  const [attachments, setAttachments] = useState<WorkRequestAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const username = typeof window !== "undefined" ? localStorage.getItem("username") : null;
  const isAdmin = typeof window !== "undefined" ? localStorage.getItem("role") === "admin" : false;

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetWorkRequestAttachments(workRequestId);
      setAttachments(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workRequestId]);

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await apiUploadWorkRequestAttachment(workRequestId, file);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (e: any) {
      setError(e.message || "Upload gagal");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (att: WorkRequestAttachment) => {
    await apiDownloadWorkRequestAttachment(workRequestId, att.id, att.file_name);
  };

  const handleDelete = async (att: WorkRequestAttachment) => {
    if (!confirm(`Hapus lampiran "${att.file_name}"?`)) return;
    await apiDeleteWorkRequestAttachment(workRequestId, att.id);
    await load();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lampiran — {workRequestTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : attachments.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada lampiran.</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-auto">
              {attachments.map((att) => {
                const canDelete = isAdmin || att.uploaded_by_username === username;
                return (
                  <div
                    key={att.id}
                    className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{att.file_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatSize(att.file_size)} &middot; {att.uploaded_by_username || "-"} &middot;{" "}
                        {att.created_at?.slice(0, 10)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        className="text-blue-600 hover:underline text-xs"
                        onClick={() => handleDownload(att)}
                      >
                        Download
                      </button>
                      {canDelete && (
                        <button
                          className="text-rose-600 hover:underline text-xs"
                          onClick={() => handleDelete(att)}
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {canUpload && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png" className="text-sm flex-1" />
              <Button size="sm" onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          )}
          {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
