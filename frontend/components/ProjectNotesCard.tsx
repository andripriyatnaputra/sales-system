"use client";

import { useEffect, useState } from "react";
import {
  apiGetProjectNotes,
  apiCreateProjectNote,
  apiDeleteProjectNote,
  canEditDepartment,
  type ProjectNote,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ProjectNotesCard({ projectId }: { projectId: string | number }) {
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const canPost = canEditDepartment("Sales");
  const username = typeof window !== "undefined" ? localStorage.getItem("username") : null;
  const isAdmin = typeof window !== "undefined" ? localStorage.getItem("role") === "admin" : false;

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetProjectNotes(projectId);
      setNotes(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handlePost = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    setError("");
    try {
      await apiCreateProjectNote(projectId, draft.trim());
      setDraft("");
      await load();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan catatan");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (n: ProjectNote) => {
    if (!confirm("Hapus catatan ini?")) return;
    await apiDeleteProjectNote(projectId, n.id);
    await load();
  };

  return (
    <Card className="p-6">
      <div>
        <h3 className="text-sm font-semibold">Catatan / Penjelasan Request</h3>
        <p className="text-xs text-muted-foreground">
          Riwayat konteks/penjelasan tambahan terkait request atau project ini (biasa diisi Sales).
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : notes.length === 0 ? (
          <div className="text-sm text-muted-foreground">Belum ada catatan.</div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-auto">
            {notes.map((n) => {
              const canDelete = isAdmin || n.author_username === username;
              return (
                <div key={n.id} className="border rounded-md px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="whitespace-pre-wrap">{n.note}</div>
                    {canDelete && (
                      <button
                        className="text-rose-600 hover:underline text-xs shrink-0"
                        onClick={() => handleDelete(n)}
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {n.author_username || "-"} &middot; {n.created_at?.slice(0, 10)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {canPost && (
          <div className="space-y-2 pt-2 border-t">
            <textarea
              className="w-full min-h-[80px] border rounded-md px-3 py-2 text-sm"
              placeholder="Tulis catatan baru terkait request atau project ini..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}
            <div className="flex justify-end">
              <Button size="sm" onClick={handlePost} disabled={posting || !draft.trim()}>
                {posting ? "Menyimpan..." : "Tambah Catatan"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
