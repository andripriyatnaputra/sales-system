"use client";

import { useEffect, useRef, useState } from "react";
import {
  apiGetPresalesAnalysis,
  apiUpdatePresalesProdev,
  apiUpdatePresalesOperations,
  apiUpdatePresalesProcurement,
  apiUpdatePresalesFinance,
  apiCreateBOQItem,
  apiUpdateBOQItem,
  apiDeleteBOQItem,
  apiGetPresalesDocuments,
  apiUploadPresalesDocument,
  apiDownloadPresalesDocument,
  apiDeletePresalesDocument,
  apiGetBOQItemHistory,
  apiGetItemCatalog,
  canEditDepartment,
  ItemCatalog,
} from "@/lib/api";
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
import { formatIDR } from "@/lib/utils";

type BOQItem = {
  id: number;
  item_name: string;
  unit?: string | null;
  qty: number;
  estimated_vendor_cost?: number | null;
  estimated_install_cost?: number | null;
  proposed_sell_price?: number | null;
  catalog_item_id?: number | null;
  source_document_id?: number | null;
  source_document_name?: string;
};

type PresalesDocumentItem = {
  id: number;
  section: string;
  file_name: string;
  file_size?: number | null;
  uploaded_by_username?: string;
  notes?: string | null;
  created_at: string;
  supersedes_id?: number | null;
  is_latest: boolean;
};

type BOQItemHistoryEntry = {
  id: number;
  item_name: string;
  unit?: string | null;
  qty?: number | null;
  estimated_vendor_cost?: number | null;
  estimated_install_cost?: number | null;
  proposed_sell_price?: number | null;
  source_document_id?: number | null;
  source_document_name?: string;
  changed_by_username?: string;
  changed_at: string;
};

function formatFileSize(bytes?: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type PresalesAnalysis = {
  id: number;
  project_id: number;
  solution_summary?: string | null;
  boq_status: string;
  boq_aging_days?: number | null;
  boq_approval_request_id?: number | null;
  installation_cost_status: string;
  installation_cost_estimate?: number | null;
  installation_cost_aging_days?: number | null;
  vendor_cost_status: string;
  vendor_cost_estimate?: number | null;
  vendor_cost_aging_days?: number | null;
  pnl_status: string;
  recommended_price?: number | null;
  pnl_aging_days?: number | null;
  overall_status: string;
  approval_request_id?: number | null;
  boq_items?: BOQItem[];
};

function agingChip(status: string, agingDays?: number | null) {
  if (agingDays == null) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  if (status === "submitted") {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        Selesai dalam {agingDays} hari
      </span>
    );
  }
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 italic">
      Berjalan {agingDays} hari
    </span>
  );
}

const OVERALL_LABEL: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", className: "bg-yellow-100 text-yellow-700" },
  pending_approval: { label: "Pending Approval", className: "bg-blue-100 text-blue-700" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700" },
  rejected: { label: "Rejected", className: "bg-rose-100 text-rose-700" },
};

function sectionBadge(status: string) {
  if (status === "submitted") return "bg-green-100 text-green-700";
  if (status === "pending_approval") return "bg-blue-100 text-blue-700";
  return "bg-muted text-muted-foreground";
}

function sectionStatusLabel(status: string) {
  if (status === "submitted") return "Submitted";
  if (status === "pending_approval") return "Menunggu Approval Manajer";
  return "Pending";
}

const canEdit = canEditDepartment;

type SectionKey = "prodev" | "operations" | "procurement" | "finance";

const SECTION_META: Record<
  SectionKey,
  {
    title: string;
    department: string;
    statusField: keyof PresalesAnalysis;
    valueLabel: string;
    valueField: keyof PresalesAnalysis;
    agingField: keyof PresalesAnalysis;
  }
> = {
  prodev: {
    title: "Product & Development — Solusi & BoQ",
    department: "Product & Development",
    statusField: "boq_status",
    valueLabel: "Ringkasan Solusi",
    valueField: "solution_summary",
    agingField: "boq_aging_days",
  },
  operations: {
    title: "Operations — Estimasi Biaya Instalasi",
    department: "Operations",
    statusField: "installation_cost_status",
    valueLabel: "Estimasi Biaya Instalasi (Rp)",
    valueField: "installation_cost_estimate",
    agingField: "installation_cost_aging_days",
  },
  procurement: {
    title: "Procurement — Estimasi Harga Vendor",
    department: "Procurement",
    statusField: "vendor_cost_status",
    valueLabel: "Estimasi Harga Vendor (Rp)",
    valueField: "vendor_cost_estimate",
    agingField: "vendor_cost_aging_days",
  },
  finance: {
    title: "Finance — Rekomendasi Harga Jual",
    department: "Finance",
    statusField: "pnl_status",
    valueLabel: "Rekomendasi Harga Jual (Rp)",
    valueField: "recommended_price",
    agingField: "pnl_aging_days",
  },
};

export function PresalesAnalysisCard({ projectId }: { projectId: number | string }) {
  const [data, setData] = useState<PresalesAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [sectionModal, setSectionModal] = useState<SectionKey | null>(null);
  const [boqModalOpen, setBoqModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BOQItem | null>(null);
  const [historyItem, setHistoryItem] = useState<BOQItem | null>(null);
  const [docs, setDocs] = useState<PresalesDocumentItem[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await apiGetPresalesAnalysis(projectId);
      setData(d);
    } finally {
      setLoading(false);
    }
  };

  const loadDocs = async () => {
    try {
      const d = await apiGetPresalesDocuments(projectId);
      setDocs(Array.isArray(d) ? d : []);
    } catch {
      setDocs([]);
    }
  };

  useEffect(() => {
    load();
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading && !data) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Loading presales analysis...</p>
      </Card>
    );
  }
  if (!data) return null;

  const overall = OVERALL_LABEL[data.overall_status] || OVERALL_LABEL.draft;
  const items = data.boq_items || [];
  const boqTotal = items.reduce((sum, it) => sum + (it.proposed_sell_price || 0) * it.qty, 0);

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Presales Analysis</h3>
          <p className="text-xs text-muted-foreground">
            ProDev, Operations, Procurement, dan Finance harus menyelesaikan bagiannya masing-masing sebelum project bisa lanjut ke stage Quotation.
          </p>
        </div>
        <Badge className={overall.className}>{overall.label}</Badge>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        {(Object.keys(SECTION_META) as SectionKey[]).map((key) => {
          const meta = SECTION_META[key];
          const status = String(data[meta.statusField] || "pending");
          const rawValue = data[meta.valueField];
          const displayValue =
            key === "prodev"
              ? (rawValue as string) || "(belum diisi)"
              : rawValue != null
              ? formatIDR(Number(rawValue))
              : "(belum diisi)";

          return (
            <div key={key} className="border rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{meta.title}</div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${sectionBadge(status)}`}>
                  {sectionStatusLabel(status)}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground truncate">{displayValue}</div>
              <div className="mt-1.5">{agingChip(status, data[meta.agingField] as number | null | undefined)}</div>
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canEdit(meta.department) || status === "pending_approval"}
                  onClick={() => setSectionModal(key)}
                  title={
                    status === "pending_approval"
                      ? "Menunggu approval manajer, tidak bisa diubah dulu"
                      : !canEdit(meta.department)
                      ? `Hanya ${meta.department} yang bisa mengisi bagian ini`
                      : undefined
                  }
                >
                  Update
                </Button>
              </div>
              <SectionAttachments
                projectId={projectId}
                section={key}
                docs={docs.filter((d) => d.section === key)}
                canUpload={canEdit(meta.department)}
                onChanged={loadDocs}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Bill of Quantity (BoQ)</h4>
          {canEdit("Product & Development") && (
            <Button
              size="sm"
              onClick={() => {
                setEditingItem(null);
                setBoqModalOpen(true);
              }}
            >
              + Tambah Item
            </Button>
          )}
        </div>

        <div className="mt-3 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2">Item</th>
                <th className="text-left py-2">Unit</th>
                <th className="text-right py-2">Qty</th>
                <th className="text-right py-2">Harga Vendor</th>
                <th className="text-right py-2">Biaya Instalasi</th>
                <th className="text-right py-2">Harga Jual</th>
                <th className="text-right py-2">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-muted-foreground">
                    Belum ada BoQ item.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-b">
                    <td className="py-2">
                      {it.item_name}
                      {it.source_document_name && (
                        <div className="text-[11px] text-muted-foreground">Sumber: {it.source_document_name}</div>
                      )}
                    </td>
                    <td className="py-2">{it.unit || "-"}</td>
                    <td className="py-2 text-right">{it.qty}</td>
                    <td className="py-2 text-right">{it.estimated_vendor_cost != null ? formatIDR(it.estimated_vendor_cost) : "-"}</td>
                    <td className="py-2 text-right">{it.estimated_install_cost != null ? formatIDR(it.estimated_install_cost) : "-"}</td>
                    <td className="py-2 text-right">{it.proposed_sell_price != null ? formatIDR(it.proposed_sell_price) : "-"}</td>
                    <td className="py-2 text-right space-x-2">
                      <button className="text-blue-600 text-xs" onClick={() => setHistoryItem(it)}>
                        Riwayat
                      </button>
                      {canEdit("Product & Development") && (
                        <>
                          <button
                            className="text-blue-600 text-xs"
                            onClick={() => {
                              setEditingItem(it);
                              setBoqModalOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="text-red-600 text-xs"
                            onClick={async () => {
                              if (!confirm(`Hapus item "${it.item_name}"?`)) return;
                              await apiDeleteBOQItem(projectId, it.id);
                              load();
                            }}
                          >
                            Hapus
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="font-medium">
                  <td colSpan={5} className="py-2 text-right">
                    Total Nilai Jual
                  </td>
                  <td className="py-2 text-right">{formatIDR(boqTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {sectionModal && (
        <SectionModal
          sectionKey={sectionModal}
          data={data}
          onClose={() => setSectionModal(null)}
          onSaved={() => {
            setSectionModal(null);
            load();
          }}
          projectId={projectId}
        />
      )}

      {boqModalOpen && (
        <BOQItemModal
          item={editingItem}
          projectId={projectId}
          docs={docs}
          onClose={() => setBoqModalOpen(false)}
          onSaved={() => {
            setBoqModalOpen(false);
            load();
          }}
        />
      )}

      {historyItem && (
        <BOQHistoryModal
          item={historyItem}
          projectId={projectId}
          onClose={() => setHistoryItem(null)}
        />
      )}
    </Card>
  );
}

function SectionAttachments({
  projectId,
  section,
  docs,
  canUpload,
  onChanged,
}: {
  projectId: number | string;
  section: SectionKey;
  docs: PresalesDocumentItem[];
  canUpload: boolean;
  onChanged: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [supersedesId, setSupersedesId] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const oldVersionCount = docs.filter((d) => d.is_latest === false).length;
  const visibleDocs = docs.filter((d) => showHistory || d.is_latest !== false);
  const supersedeOptions = docs.filter((d) => d.is_latest !== false);

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Pilih file dulu");
      return;
    }
    try {
      setUploading(true);
      setError("");
      await apiUploadPresalesDocument(projectId, section, file, undefined, supersedesId ? Number(supersedesId) : undefined);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSupersedesId("");
      onChanged();
    } catch (e: any) {
      setError(e.message || "Upload gagal");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: PresalesDocumentItem) => {
    try {
      await apiDownloadPresalesDocument(projectId, doc.id, doc.file_name);
    } catch (e: any) {
      setError(e.message || "Gagal mengunduh");
    }
  };

  const handleDelete = async (doc: PresalesDocumentItem) => {
    if (!confirm(`Hapus lampiran "${doc.file_name}"?`)) return;
    try {
      await apiDeletePresalesDocument(projectId, doc.id);
      onChanged();
    } catch (e: any) {
      setError(e.message || "Gagal menghapus");
    }
  };

  return (
    <div className="mt-3 pt-3 border-t">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-medium text-muted-foreground">Lampiran</div>
        {oldVersionCount > 0 && (
          <button className="text-[11px] text-blue-600 hover:underline" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Sembunyikan versi lama" : `Versi lama (${oldVersionCount})`}
          </button>
        )}
      </div>
      {visibleDocs.length === 0 ? (
        <div className="text-xs text-muted-foreground mb-2">Belum ada lampiran.</div>
      ) : (
        <ul className="space-y-1 mb-2">
          {visibleDocs.map((doc) => (
            <li key={doc.id} className={`flex items-center justify-between gap-2 text-xs ${doc.is_latest === false ? "opacity-60" : ""}`}>
              <span className="truncate">
                {doc.file_name}{" "}
                <span className="text-muted-foreground">({formatFileSize(doc.file_size)})</span>
                {doc.is_latest === false && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Versi Lama</span>
                )}
              </span>
              <span className="flex gap-2 shrink-0">
                <button className="text-blue-600" onClick={() => handleDownload(doc)}>
                  Download
                </button>
                <button className="text-red-600" onClick={() => handleDelete(doc)}>
                  Hapus
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div className="space-y-1.5">
          {supersedeOptions.length > 0 && (
            <select
              className="w-full border rounded-md px-2 py-1 text-xs bg-background"
              value={supersedesId}
              onChange={(e) => setSupersedesId(e.target.value)}
            >
              <option value="">(dokumen baru, bukan versi pengganti)</option>
              {supersedeOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  Versi baru dari: {d.file_name}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="text-xs flex-1 min-w-0"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
            />
            <Button size="sm" variant="outline" onClick={handleUpload} disabled={uploading}>
              {uploading ? "..." : "Lampirkan"}
            </Button>
          </div>
        </div>
      )}
      {error && <div className="text-red-600 text-xs mt-1">{error}</div>}
    </div>
  );
}

function SectionModal({
  sectionKey,
  data,
  projectId,
  onClose,
  onSaved,
}: {
  sectionKey: SectionKey;
  data: PresalesAnalysis;
  projectId: number | string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = SECTION_META[sectionKey];
  const currentStatus = String(data[meta.statusField] || "pending");
  const currentValue = data[meta.valueField];

  const [textValue, setTextValue] = useState(sectionKey === "prodev" ? (currentValue as string) || "" : "");
  const [numValue, setNumValue] = useState(sectionKey !== "prodev" && currentValue != null ? String(currentValue) : "");
  const [status, setStatus] = useState(currentStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    try {
      setSaving(true);
      setError("");

      if (sectionKey === "prodev") {
        await apiUpdatePresalesProdev(projectId, { solution_summary: textValue, status });
      } else if (sectionKey === "operations") {
        await apiUpdatePresalesOperations(projectId, {
          installation_cost_estimate: numValue ? Number(numValue) : null,
          status,
        });
      } else if (sectionKey === "procurement") {
        await apiUpdatePresalesProcurement(projectId, {
          vendor_cost_estimate: numValue ? Number(numValue) : null,
          status,
        });
      } else if (sectionKey === "finance") {
        await apiUpdatePresalesFinance(projectId, {
          recommended_price: numValue ? Number(numValue) : null,
          status,
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
          <DialogTitle>{meta.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {sectionKey === "prodev" ? (
            <div className="space-y-1">
              <div className="text-sm font-medium">{meta.valueLabel}</div>
              <textarea
                className="w-full min-h-[110px] border rounded-md px-3 py-2 text-sm"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder="Ringkasan solusi/desain..."
              />
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-sm font-medium">{meta.valueLabel}</div>
              <Input type="number" value={numValue} onChange={(e) => setNumValue(e.target.value)} />
            </div>
          )}

          <div className="space-y-1">
            <div className="text-sm font-medium">Status</div>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="pending">Pending</option>
              <option value="submitted">Submitted</option>
            </select>
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

function BOQItemModal({
  item,
  projectId,
  docs,
  onClose,
  onSaved,
}: {
  item: BOQItem | null;
  projectId: number | string;
  docs: PresalesDocumentItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;
  const [itemName, setItemName] = useState(item?.item_name || "");
  const [unit, setUnit] = useState(item?.unit || "");
  const [qty, setQty] = useState(String(item?.qty ?? 1));
  const [vendorCost, setVendorCost] = useState(item?.estimated_vendor_cost != null ? String(item.estimated_vendor_cost) : "");
  const [installCost, setInstallCost] = useState(item?.estimated_install_cost != null ? String(item.estimated_install_cost) : "");
  const [sellPrice, setSellPrice] = useState(item?.proposed_sell_price != null ? String(item.proposed_sell_price) : "");
  const [catalogItemId, setCatalogItemId] = useState(item?.catalog_item_id ? String(item.catalog_item_id) : "");
  const [sourceDocumentId, setSourceDocumentId] = useState(item?.source_document_id ? String(item.source_document_id) : "");
  const [catalog, setCatalog] = useState<ItemCatalog[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const sourceDocOptions = docs.filter((d) => d.is_latest !== false);

  useEffect(() => {
    apiGetItemCatalog({ status: "active" })
      .then((data) => setCatalog(Array.isArray(data) ? data : []))
      .catch(() => setCatalog([]));
  }, []);

  const pickFromCatalog = (id: string) => {
    setCatalogItemId(id);
    const found = catalog.find((c) => String(c.id) === id);
    if (!found) return;
    setItemName(found.item_name);
    if (found.unit) setUnit(found.unit);
    if (found.default_vendor_cost != null) setVendorCost(String(found.default_vendor_cost));
    if (found.default_install_cost != null) setInstallCost(String(found.default_install_cost));
    if (found.default_sell_price != null) setSellPrice(String(found.default_sell_price));
  };

  const save = async () => {
    try {
      setSaving(true);
      setError("");

      const body = {
        item_name: itemName,
        unit: unit || null,
        qty: qty ? Number(qty) : 1,
        estimated_vendor_cost: vendorCost ? Number(vendorCost) : null,
        estimated_install_cost: installCost ? Number(installCost) : null,
        proposed_sell_price: sellPrice ? Number(sellPrice) : null,
        catalog_item_id: catalogItemId ? Number(catalogItemId) : null,
        source_document_id: sourceDocumentId ? Number(sourceDocumentId) : null,
      };

      if (isEdit) {
        await apiUpdateBOQItem(projectId, item!.id, body);
      } else {
        await apiCreateBOQItem(projectId, body);
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
          <DialogTitle>{isEdit ? "Edit BoQ Item" : "Tambah BoQ Item"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {catalog.length > 0 && (
            <div className="space-y-1">
              <div className="text-sm font-medium">Pilih dari Katalog (opsional)</div>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={catalogItemId}
                onChange={(e) => pickFromCatalog(e.target.value)}
              >
                <option value="">(Input manual)</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.item_code} - {c.item_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <div className="text-sm font-medium">Nama Item</div>
            <Input value={itemName} onChange={(e) => setItemName(e.target.value)} />
          </div>
          {sourceDocOptions.length > 0 && (
            <div className="space-y-1">
              <div className="text-sm font-medium">Dokumen Sumber (opsional)</div>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={sourceDocumentId}
                onChange={(e) => setSourceDocumentId(e.target.value)}
              >
                <option value="">(tidak ada)</option>
                {sourceDocOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.section} - {d.file_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">Unit</div>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit / paket / dst" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Qty</div>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Estimasi Harga Vendor (Rp)</div>
            <Input type="number" value={vendorCost} onChange={(e) => setVendorCost(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Estimasi Biaya Instalasi (Rp)</div>
            <Input type="number" value={installCost} onChange={(e) => setInstallCost(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Harga Jual Diajukan (Rp)</div>
            <Input type="number" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
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

// BOQHistoryModal: nilai LAMA tiap kali item ini diedit (dari boq_item_history,
// disnapshot backend SEBELUM apply update) -- beda dari audit_logs yang cuma
// simpan nilai baru yang dikirim, ini justru jejak "apa nilai sebelum diubah".
function BOQHistoryModal({
  item,
  projectId,
  onClose,
}: {
  item: BOQItem;
  projectId: number | string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<BOQItemHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiGetBOQItemHistory(projectId, item.id)
      .then((data) => setEntries(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Riwayat — {item.item_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-80 overflow-auto">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum pernah diedit.</div>
          ) : (
            entries.map((h) => (
              <div key={h.id} className="border rounded-md px-3 py-2 text-sm space-y-1">
                <div className="text-xs text-muted-foreground">
                  {h.changed_by_username || "-"} &middot; {h.changed_at?.slice(0, 10)}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                  <div>Item: {h.item_name}</div>
                  <div>Unit: {h.unit || "-"}</div>
                  <div>Qty: {h.qty ?? "-"}</div>
                  <div>Harga Vendor: {h.estimated_vendor_cost != null ? formatIDR(h.estimated_vendor_cost) : "-"}</div>
                  <div>Biaya Instalasi: {h.estimated_install_cost != null ? formatIDR(h.estimated_install_cost) : "-"}</div>
                  <div>Harga Jual: {h.proposed_sell_price != null ? formatIDR(h.proposed_sell_price) : "-"}</div>
                </div>
                {h.source_document_name && (
                  <div className="text-xs text-muted-foreground">Dokumen sumber saat itu: {h.source_document_name}</div>
                )}
              </div>
            ))
          )}
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
