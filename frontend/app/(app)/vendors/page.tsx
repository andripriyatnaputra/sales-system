"use client";

import { useEffect, useMemo, useState } from "react";
import {
  apiGetVendors,
  apiCreateVendor,
  apiUpdateVendor,
  apiDeleteVendor,
  hasPermission,
} from "@/lib/api";

type Vendor = {
  id: number;
  code: string;
  name: string;
  category?: string | null;
  npwp?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_holder?: string | null;
  status: string;
};

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);

  const canManage = hasPermission("vendors.manage");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetVendors();
      setVendors(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.code.toLowerCase().includes(q) ||
        (v.category || "").toLowerCase().includes(q)
    );
  }, [vendors, search]);

  const handleDeactivate = async (v: Vendor) => {
    if (!confirm(`Nonaktifkan vendor "${v.name}"?`)) return;
    await apiDeleteVendor(v.id);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Vendors</h2>
          <p className="text-sm text-muted-foreground">Master data vendor untuk Purchase Order.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="border rounded-lg px-3 py-2 text-sm w-56"
            placeholder="Cari vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {canManage && (
            <button
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"
              onClick={() => {
                setEditVendor(null);
                setModalOpen(true);
              }}
            >
              + New Vendor
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Contact</th>
              <th className="px-3 py-2 text-left">Status</th>
              {canManage && <th className="px-3 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-4 text-center">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                  Belum ada vendor.
                </td>
              </tr>
            ) : (
              filtered.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{v.code}</td>
                  <td className="px-3 py-2">{v.name}</td>
                  <td className="px-3 py-2">{v.category || "-"}</td>
                  <td className="px-3 py-2">{v.contact_person || v.phone || "-"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        v.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {v.status}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right space-x-3">
                      <button
                        className="text-blue-600"
                        onClick={() => {
                          setEditVendor(v);
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      {v.status === "active" && (
                        <button className="text-red-600" onClick={() => handleDeactivate(v)}>
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
      </div>

      {modalOpen && (
        <VendorModal
          vendor={editVendor}
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

function VendorModal({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: Vendor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!vendor;
  const [name, setName] = useState(vendor?.name || "");
  const [category, setCategory] = useState(vendor?.category || "");
  const [npwp, setNpwp] = useState(vendor?.npwp || "");
  const [contactPerson, setContactPerson] = useState(vendor?.contact_person || "");
  const [phone, setPhone] = useState(vendor?.phone || "");
  const [email, setEmail] = useState(vendor?.email || "");
  const [address, setAddress] = useState(vendor?.address || "");
  const [bankName, setBankName] = useState(vendor?.bank_name || "");
  const [bankAccountNumber, setBankAccountNumber] = useState(vendor?.bank_account_number || "");
  const [bankAccountHolder, setBankAccountHolder] = useState(vendor?.bank_account_holder || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    try {
      setSaving(true);
      setError("");

      const body = {
        name,
        category: category || null,
        npwp: npwp || null,
        contact_person: contactPerson || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        bank_name: bankName || null,
        bank_account_number: bankAccountNumber || null,
        bank_account_holder: bankAccountHolder || null,
      };

      if (isEdit) {
        await apiUpdateVendor(vendor!.id, body);
      } else {
        await apiCreateVendor(body);
      }

      onSaved();
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-3 shadow-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold">{isEdit ? "Edit Vendor" : "New Vendor"}</h3>

        <div className="space-y-1">
          <label className="block text-sm">Nama Vendor *</label>
          <input className="border rounded px-3 py-2 w-full" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-sm">Kategori</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Barang / Jasa / Barang & Jasa"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm">NPWP</label>
            <input className="border rounded px-3 py-2 w-full" value={npwp} onChange={(e) => setNpwp(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-sm">Contact Person</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm">Phone</label>
            <input className="border rounded px-3 py-2 w-full" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm">Email</label>
          <input className="border rounded px-3 py-2 w-full" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="space-y-1">
          <label className="block text-sm">Alamat</label>
          <textarea
            className="border rounded px-3 py-2 w-full min-h-[70px]"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-sm">Bank</label>
            <input className="border rounded px-3 py-2 w-full" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm">No. Rekening</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={bankAccountNumber}
              onChange={(e) => setBankAccountNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm">Atas Nama</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={bankAccountHolder}
              onChange={(e) => setBankAccountHolder(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}

        <div className="flex justify-end gap-3 pt-3">
          <button onClick={onClose} className="px-3 py-2 border rounded" disabled={saving}>
            Cancel
          </button>
          <button
            disabled={saving || !name.trim()}
            onClick={save}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
