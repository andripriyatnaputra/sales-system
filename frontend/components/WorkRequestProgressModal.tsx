"use client";

import { useEffect, useState } from "react";
import {
  apiGetWorkRequestUpdates,
  apiCreateWorkRequestUpdate,
  apiDeleteWorkRequestUpdate,
  type WorkRequestUpdate,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function WorkRequestProgressModal({
  workRequestId,
  workRequestTitle,
  canPost,
  onClose,
}: {
  workRequestId: number;
  workRequestTitle: string;
  canPost: boolean;
  onClose: () => void;
}) {
  const [updates, setUpdates] = useState<WorkRequestUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const username = typeof window !== "undefined" ? localStorage.getItem("username") : null;
  const isAdmin = typeof window !== "undefined" ? localStorage.getItem("role") === "admin" : false;

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetWorkRequestUpdates(workRequestId);
      setUpdates(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workRequestId]);

  const handlePost = async () => {
    if (!note.trim()) return;
    setPosting(true);
    setError("");
    try {
      await apiCreateWorkRequestUpdate(workRequestId, note.trim());
      setNote("");
      await load();
    } catch (e: any) {
      setError(e.message || "Gagal mengirim update");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (u: WorkRequestUpdate) => {
    if (!confirm("Hapus update ini?")) return;
    await apiDeleteWorkRequestUpdate(workRequestId, u.id);
    await load();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Progress — {workRequestTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : updates.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada update.</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-auto">
              {updates.map((u) => {
                const canDelete = isAdmin || u.author_username === username;
                return (
                  <div key={u.id} className="border rounded-md px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="whitespace-pre-wrap">{u.note}</div>
                      {canDelete && (
                        <button
                          className="text-rose-600 hover:underline text-xs shrink-0"
                          onClick={() => handleDelete(u)}
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {u.author_username || "-"} &middot; {u.created_at?.slice(0, 10)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {canPost && (
            <div className="space-y-2 pt-2 border-t">
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm"
                rows={2}
                placeholder="Tulis update progress..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={handlePost} disabled={posting || !note.trim()}>
                  {posting ? "Mengirim..." : "Kirim"}
                </Button>
              </div>
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
