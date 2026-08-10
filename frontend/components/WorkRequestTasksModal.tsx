"use client";

import { useEffect, useState } from "react";
import {
  apiGetWorkRequestTasks,
  apiCreateWorkRequestTask,
  apiUpdateWorkRequestTask,
  apiDeleteWorkRequestTask,
  type WorkRequestTask,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function WorkRequestTasksModal({
  workRequestId,
  workRequestTitle,
  canManage,
  onClose,
}: {
  workRequestId: number;
  workRequestTitle: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const [tasks, setTasks] = useState<WorkRequestTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetWorkRequestTasks(workRequestId);
      setTasks(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workRequestId]);

  const doneCount = tasks.filter((t) => t.is_done).length;
  const percent = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  const handleAdd = async () => {
    if (!title.trim()) return;
    setAdding(true);
    setError("");
    try {
      await apiCreateWorkRequestTask(workRequestId, title.trim());
      setTitle("");
      await load();
    } catch (e: any) {
      setError(e.message || "Gagal menambah task");
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (task: WorkRequestTask) => {
    await apiUpdateWorkRequestTask(workRequestId, task.id, { is_done: !task.is_done });
    await load();
  };

  const handleDelete = async (task: WorkRequestTask) => {
    if (!confirm(`Hapus task "${task.title}"?`)) return;
    await apiDeleteWorkRequestTask(workRequestId, task.id);
    await load();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tasks — {workRequestTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {tasks.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {doneCount}/{tasks.length} selesai
                </span>
                <span>{percent}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-blue-600" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : tasks.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada task.</div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-auto">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={t.is_done}
                    disabled={!canManage}
                    onChange={() => handleToggle(t)}
                  />
                  <span className={`flex-1 ${t.is_done ? "line-through text-muted-foreground" : ""}`}>
                    {t.title}
                  </span>
                  {canManage && (
                    <button className="text-rose-600 hover:underline text-xs" onClick={() => handleDelete(t)}>
                      Hapus
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canManage && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <input
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
                placeholder="Tambah task baru..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
              <Button size="sm" onClick={handleAdd} disabled={adding || !title.trim()}>
                {adding ? "..." : "Tambah"}
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
