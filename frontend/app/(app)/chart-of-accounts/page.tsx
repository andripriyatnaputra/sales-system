"use client";

import { useEffect, useMemo, useState } from "react";
import {
  apiGetChartOfAccounts,
  apiCreateAccount,
  apiUpdateAccount,
  apiDeleteAccount,
  canEditDepartment,
  ChartOfAccount,
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

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense"] as const;

const TYPE_LABEL: Record<string, string> = {
  Asset: "Asset (Aset)",
  Liability: "Liability (Kewajiban)",
  Equity: "Equity (Modal)",
  Revenue: "Revenue (Pendapatan)",
  COGS: "COGS (Harga Pokok)",
  Expense: "Expense (Beban)",
};

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ChartOfAccount | null>(null);

  const canEdit = canEditDepartment("Finance");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetChartOfAccounts();
      setAccounts(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, ChartOfAccount[]> = {};
    for (const t of ACCOUNT_TYPES) map[t] = [];
    for (const a of accounts) {
      if (map[a.account_type]) map[a.account_type].push(a);
    }
    return map;
  }, [accounts]);

  const handleDelete = async (a: ChartOfAccount) => {
    if (!confirm(`Nonaktifkan akun "${a.account_code} - ${a.account_name}"?`)) return;
    try {
      await apiDeleteAccount(a.id);
      load();
    } catch (e: any) {
      alert(e.message || "Gagal menghapus");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Chart of Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Master data akun akuntansi -- fondasi untuk General Ledger dan Laporan Keuangan.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            + Tambah Akun
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        ACCOUNT_TYPES.map((type) => (
          <Card key={type} className="p-4">
            <h3 className="text-sm font-semibold mb-3">{TYPE_LABEL[type]}</h3>
            {grouped[type].length === 0 ? (
              <div className="text-xs text-muted-foreground">Belum ada akun.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-1.5">Kode</th>
                    <th className="text-left py-1.5">Nama Akun</th>
                    <th className="text-left py-1.5">Parent</th>
                    <th className="text-left py-1.5">Normal Balance</th>
                    <th className="text-left py-1.5">Status</th>
                    {canEdit && <th className="text-right py-1.5">Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {grouped[type].map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-1.5 font-medium">{a.account_code}</td>
                      <td className="py-1.5">{a.account_name}</td>
                      <td className="py-1.5 text-muted-foreground">{a.parent_code || "-"}</td>
                      <td className="py-1.5 text-muted-foreground capitalize">{a.normal_balance}</td>
                      <td className="py-1.5">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full ${
                            a.status === "active" ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="py-1.5 text-right space-x-2">
                          <button
                            className="text-blue-600 text-xs"
                            onClick={() => {
                              setEditing(a);
                              setModalOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          {a.status === "active" && (
                            <button className="text-red-600 text-xs" onClick={() => handleDelete(a)}>
                              Nonaktifkan
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ))
      )}

      {modalOpen && (
        <AccountModal
          account={editing}
          allAccounts={accounts}
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

function AccountModal({
  account,
  allAccounts,
  onClose,
  onSaved,
}: {
  account: ChartOfAccount | null;
  allAccounts: ChartOfAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!account;
  const [code, setCode] = useState(account?.account_code || "");
  const [name, setName] = useState(account?.account_name || "");
  const [type, setType] = useState<string>(account?.account_type || "Asset");
  const [parentId, setParentId] = useState<string>(account?.parent_id ? String(account.parent_id) : "");
  const [description, setDescription] = useState(account?.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // parent cuma boleh akun top-level dgn account_type SAMA, bukan diri sendiri.
  const parentOptions = allAccounts.filter(
    (a) => a.account_type === type && !a.parent_id && a.id !== account?.id && a.status === "active"
  );

  const save = async () => {
    if (!name || (!isEdit && !code)) {
      setError("Kode dan nama akun wajib diisi");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const body = {
        account_name: name,
        account_type: type,
        parent_id: parentId ? Number(parentId) : null,
        description: description || null,
      };
      if (isEdit) {
        await apiUpdateAccount(account!.id, body);
      } else {
        await apiCreateAccount({ account_code: code, ...body });
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
          <DialogTitle>{isEdit ? "Edit Akun" : "Tambah Akun"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Kode Akun</div>
            <Input value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit} placeholder="mis. 1110" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Nama Akun</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Bank BCA" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Tipe Akun</div>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setParentId("");
              }}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Parent Akun (opsional)</div>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">(Tanpa parent)</option>
              {parentOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_code} - {a.account_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Deskripsi (opsional)</div>
            <textarea
              className="w-full min-h-[70px] border rounded-md px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
