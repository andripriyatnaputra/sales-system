"use client";

import { useEffect, useMemo, useState } from "react";
import {
  apiGetItemCatalog,
  apiCreateItemCatalog,
  apiUpdateItemCatalog,
  apiDeleteItemCatalog,
  canEditDepartment,
  ItemCatalog,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
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

export default function ItemCatalogPage() {
  const [items, setItems] = useState<ItemCatalog[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ItemCatalog | null>(null);

  const canEdit = canEditDepartment("Product & Development");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetItemCatalog();
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.item_code.toLowerCase().includes(q) ||
        i.item_name.toLowerCase().includes(q) ||
        (i.category || "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const handleDelete = async (i: ItemCatalog) => {
    if (!confirm(`Nonaktifkan item "${i.item_code} - ${i.item_name}"?`)) return;
    try {
      await apiDeleteItemCatalog(i.id);
      load();
    } catch (e: any) {
      alert(e.message || "Gagal menghapus");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Katalog Item/Jasa</h2>
          <p className="text-sm text-muted-foreground">
            Master item/jasa standar dengan harga reference -- bisa dipilih saat ProDev membuat BoQ, tidak wajib.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="border rounded-lg px-3 py-2 text-sm w-56"
            placeholder="Cari item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {canEdit && (
            <Button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              + Tambah Item
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4">
        <table className="w-full text-sm">
          <thead className="border-b text-muted-foreground text-xs">
            <tr>
              <th className="text-left py-1.5">Kode</th>
              <th className="text-left py-1.5">Nama</th>
              <th className="text-left py-1.5">Unit</th>
              <th className="text-left py-1.5">Kategori</th>
              <th className="text-right py-1.5">Vendor Cost</th>
              <th className="text-right py-1.5">Install Cost</th>
              <th className="text-right py-1.5">Sell Price</th>
              <th className="text-left py-1.5">Status</th>
              {canEdit && <th className="text-right py-1.5">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="py-4 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-4 text-center text-muted-foreground">
                  Belum ada item katalog.
                </td>
              </tr>
            ) : (
              filtered.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="py-1.5 font-medium">{i.item_code}</td>
                  <td className="py-1.5">{i.item_name}</td>
                  <td className="py-1.5 text-muted-foreground">{i.unit || "-"}</td>
                  <td className="py-1.5 text-muted-foreground">{i.category || "-"}</td>
                  <td className="py-1.5 text-right">
                    {i.default_vendor_cost != null ? formatIDR(i.default_vendor_cost) : "-"}
                  </td>
                  <td className="py-1.5 text-right">
                    {i.default_install_cost != null ? formatIDR(i.default_install_cost) : "-"}
                  </td>
                  <td className="py-1.5 text-right">
                    {i.default_sell_price != null ? formatIDR(i.default_sell_price) : "-"}
                  </td>
                  <td className="py-1.5">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        i.status === "active" ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {i.status}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="py-1.5 text-right space-x-2">
                      <button
                        className="text-blue-600 text-xs"
                        onClick={() => {
                          setEditing(i);
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      {i.status === "active" && (
                        <button className="text-red-600 text-xs" onClick={() => handleDelete(i)}>
                          Nonaktifkan
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {modalOpen && (
        <ItemCatalogModal
          item={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ItemCatalogModal({
  item,
  onClose,
  onSaved,
}: {
  item: ItemCatalog | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;
  const [name, setName] = useState(item?.item_name || "");
  const [unit, setUnit] = useState(item?.unit || "");
  const [category, setCategory] = useState(item?.category || "");
  const [vendorCost, setVendorCost] = useState(item?.default_vendor_cost != null ? String(item.default_vendor_cost) : "");
  const [installCost, setInstallCost] = useState(item?.default_install_cost != null ? String(item.default_install_cost) : "");
  const [sellPrice, setSellPrice] = useState(item?.default_sell_price != null ? String(item.default_sell_price) : "");
  const [notes, setNotes] = useState(item?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name) {
      setError("Nama item wajib diisi");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const body = {
        item_name: name,
        unit: unit || null,
        category: category || null,
        default_vendor_cost: vendorCost ? Number(vendorCost) : null,
        default_install_cost: installCost ? Number(installCost) : null,
        default_sell_price: sellPrice ? Number(sellPrice) : null,
        notes: notes || null,
      };
      if (isEdit) {
        await apiUpdateItemCatalog(item!.id, body);
      } else {
        await apiCreateItemCatalog(body);
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
          <DialogTitle>{isEdit ? "Edit Item Katalog" : "Tambah Item Katalog"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Nama Item</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Router Cisco X" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-sm font-medium">Unit</div>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="mis. unit" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Kategori (opsional)</div>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="mis. Hardware" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <div className="text-sm font-medium">Vendor Cost</div>
              <Input type="number" value={vendorCost} onChange={(e) => setVendorCost(e.target.value)} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Install Cost</div>
              <Input type="number" value={installCost} onChange={(e) => setInstallCost(e.target.value)} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Sell Price</div>
              <Input type="number" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Catatan (opsional)</div>
            <textarea
              className="w-full min-h-[60px] border rounded-md px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
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
