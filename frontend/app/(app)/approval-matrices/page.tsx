"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import {
  apiCreateApprovalMatrix,
  apiDeleteApprovalMatrix,
  apiGetApprovalMatrices,
  apiGetDepartments,
  apiGetRoles,
  apiUpdateApprovalMatrix,
} from "@/lib/api";

type Department = { id: number; name: string };
type Role = { id: number; label: string; level: string };
type Matrix = {
  id: number;
  entity_type: string;
  department_id?: number;
  department_name?: string;
  min_amount: number;
  max_amount?: number;
  step_order: number;
  approver_type: "role" | "requester_manager";
  approver_role_id?: number;
  approver_role_label?: string;
};

const emptyForm = {
  entity_type: "",
  department_id: "" as number | "",
  min_amount: "0",
  max_amount: "",
  step_order: "1",
  approver_type: "requester_manager" as "role" | "requester_manager",
  approver_role_id: "" as number | "",
};

function ApprovalMatricesContent() {
  const [matrices, setMatrices] = useState<Matrix[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Matrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [matrixRows, departmentRows, roleRows] = await Promise.all([
        apiGetApprovalMatrices(),
        apiGetDepartments(),
        apiGetRoles(),
      ]);
      setMatrices(Array.isArray(matrixRows) ? matrixRows : []);
      setDepartments(Array.isArray(departmentRows) ? departmentRows : []);
      setRoles(Array.isArray(roleRows) ? roleRows.filter((r: Role) => ["manager", "gm", "executive"].includes(r.level)) : []);
    } catch (e: any) {
      setError(e.message || "Gagal memuat approval matrix");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (item: Matrix) => {
    setEditing(item);
    setForm({
      entity_type: item.entity_type,
      department_id: item.department_id || "",
      min_amount: String(item.min_amount),
      max_amount: item.max_amount == null ? "" : String(item.max_amount),
      step_order: String(item.step_order),
      approver_type: item.approver_type,
      approver_role_id: item.approver_role_id || "",
    });
    setError("");
  };

  const reset = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
  };

  const save = async () => {
    const min = Number(form.min_amount);
    const max = form.max_amount === "" ? null : Number(form.max_amount);
    const step = Number(form.step_order);
    if (!form.entity_type.trim() || !Number.isFinite(min) || min < 0 || (max !== null && (!Number.isFinite(max) || max < min)) || step < 1) {
      setError("Entity type, rentang nominal, dan step harus valid");
      return;
    }
    if (form.approver_type === "role" && !form.approver_role_id) {
      setError("Role approver wajib dipilih");
      return;
    }

    const body = {
      entity_type: form.entity_type.trim(),
      department_id: form.department_id || null,
      min_amount: min,
      max_amount: max,
      step_order: step,
      approver_type: form.approver_type,
      approver_role_id: form.approver_type === "role" ? form.approver_role_id : null,
    };
    setSaving(true);
    try {
      if (editing) await apiUpdateApprovalMatrix(editing.id, body);
      else await apiCreateApprovalMatrix(body);
      reset();
      await load();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan approval matrix");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: Matrix) => {
    if (!confirm(`Hapus matrix ${item.entity_type} step ${item.step_order}?`)) return;
    try {
      await apiDeleteApprovalMatrix(item.id);
      if (editing?.id === item.id) reset();
      await load();
    } catch (e: any) {
      setError(e.message || "Gagal menghapus approval matrix");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Approval Matrix</h2>
        <p className="text-sm text-muted-foreground">
          Konfigurasi hanya untuk System Admin. Matrix yang belum dibuat akan memblokir submission, bukan auto-approve.
        </p>
      </div>

      {error && <div className="text-red-700 bg-red-50 border border-red-200 rounded p-3 text-sm">{error}</div>}

      <div className="border rounded-xl p-4 space-y-3 bg-white">
        <h3 className="font-medium">{editing ? "Edit matrix" : "Tambah matrix"}</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <input className="border rounded px-3 py-2" placeholder="entity_type, mis. purchase_request" value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value })} />
          <select className="border rounded px-3 py-2" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value ? Number(e.target.value) : "" })}>
            <option value="">Semua departemen</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input className="border rounded px-3 py-2" type="number" min="0" placeholder="Min amount" value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: e.target.value })} />
          <input className="border rounded px-3 py-2" type="number" min="0" placeholder="Max amount (kosong = tanpa batas)" value={form.max_amount} onChange={(e) => setForm({ ...form, max_amount: e.target.value })} />
          <input className="border rounded px-3 py-2" type="number" min="1" placeholder="Step order" value={form.step_order} onChange={(e) => setForm({ ...form, step_order: e.target.value })} />
          <select className="border rounded px-3 py-2" value={form.approver_type} onChange={(e) => setForm({ ...form, approver_type: e.target.value as Matrix["approver_type"], approver_role_id: "" })}>
            <option value="requester_manager">Manager langsung requester</option>
            <option value="role">Role tertentu</option>
          </select>
          {form.approver_type === "role" && (
            <select className="border rounded px-3 py-2" value={form.approver_role_id} onChange={(e) => setForm({ ...form, approver_role_id: e.target.value ? Number(e.target.value) : "" })}>
              <option value="">Pilih role approver</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          )}
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 bg-blue-600 text-white rounded" disabled={saving} onClick={save}>{saving ? "Menyimpan..." : editing ? "Simpan perubahan" : "Tambah"}</button>
          {editing && <button className="px-3 py-2 border rounded" onClick={reset}>Batal</button>}
        </div>
      </div>

      <div className="border rounded-xl overflow-auto bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-100"><tr><th className="p-3 text-left">Entity</th><th className="p-3 text-left">Departemen</th><th className="p-3 text-left">Nominal</th><th className="p-3 text-left">Step</th><th className="p-3 text-left">Approver</th><th className="p-3 text-right">Aksi</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="p-4 text-center">Loading...</td></tr> : matrices.length === 0 ? <tr><td colSpan={6} className="p-4 text-center">Belum ada matrix.</td></tr> : matrices.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-3 font-medium">{item.entity_type}</td>
                <td className="p-3">{item.department_name || "Semua"}</td>
                <td className="p-3">{item.min_amount.toLocaleString("id-ID")} – {item.max_amount == null ? "∞" : item.max_amount.toLocaleString("id-ID")}</td>
                <td className="p-3">{item.step_order}</td>
                <td className="p-3">{item.approver_type === "requester_manager" ? "Manager langsung requester" : item.approver_role_label}</td>
                <td className="p-3 text-right space-x-2"><button className="text-blue-700" onClick={() => startEdit(item)}>Edit</button><button className="text-red-700" onClick={() => remove(item)}>Hapus</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ApprovalMatricesPage() {
  return <AuthGuard requirePermission="approval.matrix.manage"><ApprovalMatricesContent /></AuthGuard>;
}
