"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  apiGetSalesOrder,
  apiUpdateSalesOrder,
  apiCreateCustomerPO,
  apiUpdateCustomerPO,
  apiDeleteCustomerPO,
  hasPermission,
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

type SalesOrderItem = {
  id: number;
  item_name: string;
  unit?: string | null;
  qty: number;
  vendor_cost?: number | null;
  install_cost?: number | null;
  sell_price?: number | null;
};

type CustomerPO = {
  id: number;
  po_number: string;
  po_date?: string | null;
  category?: string | null;
  amount?: number | null;
};

type SalesOrderDetail = {
  id: number;
  project_id: number;
  project_code: string;
  so_number: string;
  customer_name?: string;
  total_value: number;
  status: string;
  created_at: string;
  items?: SalesOrderItem[];
  customer_pos?: CustomerPO[];
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  cancelled: "bg-rose-100 text-rose-700",
};

export default function SalesOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [so, setSo] = useState<SalesOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [editingPo, setEditingPo] = useState<CustomerPO | null>(null);

  const canManage = hasPermission("sales_orders.manage");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetSalesOrder(id);
      setSo(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggleStatus = async () => {
    if (!so) return;
    const nextStatus = so.status === "active" ? "cancelled" : "active";
    if (!confirm(`Ubah status SO jadi "${nextStatus}"?`)) return;
    await apiUpdateSalesOrder(so.id, { status: nextStatus });
    load();
  };

  const deletePo = async (po: CustomerPO) => {
    if (!confirm(`Hapus PO customer "${po.po_number}"?`)) return;
    await apiDeleteCustomerPO(id, po.id);
    load();
  };

  if (loading && !so) {
    return (
      <div className="p-6">
        <p>Loading...</p>
      </div>
    );
  }
  if (!so) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Sales Order tidak ditemukan.</p>
      </div>
    );
  }

  const items = so.items || [];
  const customerPOs = so.customer_pos || [];
  const totalCustomerPO = customerPOs.reduce((sum, po) => sum + (po.amount || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">{so.so_number}</h1>
          <p className="text-muted-foreground">
            <Link href={`/projects/${so.project_id}`} className="text-blue-600 hover:underline">
              {so.project_code}
            </Link>
            {so.customer_name ? ` — ${so.customer_name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={STATUS_BADGE[so.status] || "bg-muted"}>{so.status}</Badge>
          {canManage && (
            <Button size="sm" variant="outline" onClick={toggleStatus}>
              {so.status === "active" ? "Cancel SO" : "Aktifkan SO"}
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push("/sales-orders")}>
            Back
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Nilai SO (dari BoQ)</div>
          <div className="font-semibold text-lg">{formatIDR(so.total_value)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total PO Customer Tercatat</div>
          <div className="font-semibold text-lg">{formatIDR(totalCustomerPO)}</div>
        </Card>
      </div>

      {/* ITEMS (snapshot dari BoQ saat closing) */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-1">Item Sales Order</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Snapshot dari BoQ presales saat project closing — bukan referensi hidup, perubahan BoQ setelah ini tidak mengubah data di bawah.
        </p>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2">Item</th>
                <th className="text-left py-2">Unit</th>
                <th className="text-right py-2">Qty</th>
                <th className="text-right py-2">Harga Vendor</th>
                <th className="text-right py-2">Biaya Instalasi</th>
                <th className="text-right py-2">Harga Jual</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-muted-foreground">
                    Tidak ada item.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-b">
                    <td className="py-2">{it.item_name}</td>
                    <td className="py-2">{it.unit || "-"}</td>
                    <td className="py-2 text-right">{it.qty}</td>
                    <td className="py-2 text-right">{it.vendor_cost != null ? formatIDR(it.vendor_cost) : "-"}</td>
                    <td className="py-2 text-right">{it.install_cost != null ? formatIDR(it.install_cost) : "-"}</td>
                    <td className="py-2 text-right">{it.sell_price != null ? formatIDR(it.sell_price) : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* CUSTOMER PO -- bisa lebih dari satu (mis. Material vs Jasa/Instalasi) */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">PO dari Customer</h3>
            <p className="text-xs text-muted-foreground">
              Satu SO bisa punya lebih dari satu PO customer (mis. dipecah Material vs Jasa/Instalasi).
            </p>
          </div>
          {canManage && (
            <Button
              size="sm"
              onClick={() => {
                setEditingPo(null);
                setPoModalOpen(true);
              }}
            >
              + Tambah PO Customer
            </Button>
          )}
        </div>

        <div className="mt-3 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2">No. PO</th>
                <th className="text-left py-2">Kategori</th>
                <th className="text-left py-2">Tanggal</th>
                <th className="text-right py-2">Nilai</th>
                {canManage && <th className="text-right py-2">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {customerPOs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">
                    Belum ada PO customer tercatat.
                  </td>
                </tr>
              ) : (
                customerPOs.map((po) => (
                  <tr key={po.id} className="border-b">
                    <td className="py-2">{po.po_number}</td>
                    <td className="py-2">{po.category || "-"}</td>
                    <td className="py-2">{po.po_date ? po.po_date.slice(0, 10) : "-"}</td>
                    <td className="py-2 text-right">{po.amount != null ? formatIDR(po.amount) : "-"}</td>
                    {canManage && (
                      <td className="py-2 text-right space-x-2">
                        <button
                          className="text-blue-600 text-xs"
                          onClick={() => {
                            setEditingPo(po);
                            setPoModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button className="text-red-600 text-xs" onClick={() => deletePo(po)}>
                          Hapus
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {poModalOpen && (
        <CustomerPOModal
          salesOrderId={id}
          po={editingPo}
          onClose={() => setPoModalOpen(false)}
          onSaved={() => {
            setPoModalOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CustomerPOModal({
  salesOrderId,
  po,
  onClose,
  onSaved,
}: {
  salesOrderId: string;
  po: CustomerPO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!po;
  const [poNumber, setPoNumber] = useState(po?.po_number || "");
  const [category, setCategory] = useState(po?.category || "");
  const [poDate, setPoDate] = useState(po?.po_date ? po.po_date.slice(0, 10) : "");
  const [amount, setAmount] = useState(po?.amount != null ? String(po.amount) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    try {
      setSaving(true);
      setError("");

      const body = {
        po_number: poNumber,
        category: category || null,
        po_date: poDate || null,
        amount: amount ? Number(amount) : null,
      };

      if (isEdit) {
        await apiUpdateCustomerPO(salesOrderId, po!.id, body);
      } else {
        await apiCreateCustomerPO(salesOrderId, body);
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
          <DialogTitle>{isEdit ? "Edit PO Customer" : "Tambah PO Customer"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">No. PO</div>
            <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO/CUST/2026/0001" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Kategori (opsional)</div>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Material / Jasa Instalasi / dst" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Tanggal PO</div>
            <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Nilai PO (Rp)</div>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
