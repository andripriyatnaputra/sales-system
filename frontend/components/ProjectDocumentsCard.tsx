"use client";

import { useEffect, useRef, useState } from "react";
import {
  apiGetProjectDocuments,
  apiUploadProjectDocument,
  apiDownloadProjectDocument,
  apiDeleteProjectDocument,
  canEditDepartment,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ProjectDocument = {
  id: number;
  category: string;
  file_name: string;
  file_size?: number | null;
  uploaded_by_username?: string;
  notes?: string | null;
  created_at: string;
  expiry_date?: string | null;
  days_until_expiry?: number | null;
  supersedes_id?: number | null;
  is_latest: boolean;
};

const CATEGORY_BADGE: Record<string, string> = {
  RFQ: "bg-blue-100 text-blue-700",
  TOR: "bg-purple-100 text-purple-700",
  SPH: "bg-amber-100 text-amber-700",
  PO: "bg-teal-100 text-teal-700",
  Kontrak: "bg-indigo-100 text-indigo-700",
  BAST: "bg-cyan-100 text-cyan-700",
  Lainnya: "bg-muted text-muted-foreground",
};

// documentCategoryDepartment: cermin backend documentCategoryDepartment di
// project_documents.go -- dipakai filter kategori mana yang bisa diupload
// user yang login (department pemilik dokumen beda-beda per kategori).
const CATEGORY_DEPARTMENT: Record<string, string> = {
  RFQ: "Sales", TOR: "Sales", SPH: "Sales", Kontrak: "Sales",
  PO: "Procurement", BAST: "Operations", Lainnya: "Sales",
};

function formatSize(bytes?: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function expiryBadge(days?: number | null) {
  if (days === null || days === undefined) return <span className="text-muted-foreground">-</span>;
  if (days < 0) {
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">Expired {-days} hari lalu</span>;
  }
  if (days <= 30) {
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{days} hari lagi</span>;
  }
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{days} hari lagi</span>;
}

export function ProjectDocumentsCard({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const availableCategories = Object.keys(CATEGORY_DEPARTMENT).filter((cat) =>
    canEditDepartment(CATEGORY_DEPARTMENT[cat])
  );
  const [category, setCategory] = useState(availableCategories[0] || "RFQ");
  const [notes, setNotes] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [supersedesId, setSupersedesId] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetProjectDocuments(projectId);
      setDocs(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || "Gagal memuat dokumen");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Pilih file dulu");
      return;
    }
    try {
      setUploading(true);
      setError("");
      await apiUploadProjectDocument(projectId, file, category, notes, expiryDate, supersedesId ? Number(supersedesId) : undefined);
      setNotes("");
      setExpiryDate("");
      setSupersedesId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (e: any) {
      setError(e.message || "Upload gagal");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: ProjectDocument) => {
    try {
      await apiDownloadProjectDocument(projectId, doc.id, doc.file_name);
    } catch (e: any) {
      setError(e.message || "Gagal mengunduh");
    }
  };

  const handleDelete = async (doc: ProjectDocument) => {
    if (!confirm(`Hapus dokumen "${doc.file_name}"?`)) return;
    await apiDeleteProjectDocument(projectId, doc.id);
    load();
  };

  const oldVersionCount = docs.filter((d) => d.is_latest === false).length;
  const visibleDocs = docs.filter((d) => showHistory || d.is_latest !== false);
  const supersedeOptions = docs.filter((d) => d.category === category && d.is_latest !== false);

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Dokumen Project</h3>
        <p className="text-xs text-muted-foreground">
          RFQ, TOR, SPH, PO, Kontrak, BAST, dan dokumen lain — menempel di project ini sepanjang siklusnya. Upload
          digate per kategori sesuai departemen pemiliknya, tapi bisa dilihat/di-download semua departemen yang
          punya akses ke project ini. Kontrak/SPH bisa diberi tanggal expiry untuk reminder.
        </p>
      </div>

      {availableCategories.length > 0 && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
            <select
              className="border rounded-md px-3 py-2 text-sm bg-background"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSupersedesId("");
              }}
            >
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <input ref={fileInputRef} type="file" className="text-sm" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
            <input
              className="border rounded-md px-3 py-2 text-sm w-full bg-background"
              placeholder="Catatan (opsional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <input
              type="date"
              className="border rounded-md px-3 py-2 text-sm bg-background"
              title="Tanggal expiry (opsional)"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
          {supersedeOptions.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Versi baru dari (opsional)</div>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={supersedesId}
                onChange={(e) => setSupersedesId(e.target.value)}
              >
                <option value="">(dokumen baru, bukan versi pengganti)</option>
                {supersedeOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.file_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Maks 10MB — PDF, Word, Excel, PPT, atau gambar.</span>
            <Button size="sm" onClick={handleUpload} disabled={uploading}>
              {uploading ? "Mengunggah..." : "Upload"}
            </Button>
          </div>
          {error && <div className="text-red-600 text-xs bg-red-50 p-2 rounded">{error}</div>}
        </div>
      )}

      {oldVersionCount > 0 && (
        <button
          className="text-xs text-blue-600 hover:underline"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? "Sembunyikan versi lama" : `Tampilkan versi lama (${oldVersionCount})`}
        </button>
      )}

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground text-left">
              <th className="py-2">Kategori</th>
              <th className="py-2">Nama File</th>
              <th className="py-2">Ukuran</th>
              <th className="py-2">Expiry</th>
              <th className="py-2">Diupload</th>
              <th className="py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : visibleDocs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-muted-foreground">
                  Belum ada dokumen.
                </td>
              </tr>
            ) : (
              visibleDocs.map((doc) => (
                <tr key={doc.id} className={`border-b ${doc.is_latest === false ? "opacity-60" : ""}`}>
                  <td className="py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${CATEGORY_BADGE[doc.category] || "bg-muted"}`}>
                      {doc.category}
                    </span>
                  </td>
                  <td className="py-2">
                    {doc.file_name}
                    {doc.is_latest === false && (
                      <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        Versi Lama
                      </span>
                    )}
                    {doc.notes && <div className="text-xs text-muted-foreground">{doc.notes}</div>}
                  </td>
                  <td className="py-2">{formatSize(doc.file_size)}</td>
                  <td className="py-2">{expiryBadge(doc.days_until_expiry)}</td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {doc.uploaded_by_username || "-"} &middot; {doc.created_at?.slice(0, 10)}
                  </td>
                  <td className="py-2 text-right space-x-2">
                    <button className="text-blue-600 text-xs" onClick={() => handleDownload(doc)}>
                      Download
                    </button>
                    <button className="text-red-600 text-xs" onClick={() => handleDelete(doc)}>
                      Hapus
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
