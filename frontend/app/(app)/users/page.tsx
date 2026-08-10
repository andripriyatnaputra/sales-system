"use client";

import { useEffect, useState } from "react";
import {
  apiGetUsers,
  apiCreateUser,
  apiUpdateUser,
  apiDeleteUser,
  apiGetDepartments,
  apiGetOrgUnits,
  apiGetRoles,
} from "@/lib/api";
import { AuthGuard } from "@/components/AuthGuard";

type User = {
  id: number;
  username: string;
  role: string;
  division: string;
  role_id?: number;
  role_key?: string;
  role_label?: string;
  role_department?: string;
  role_level?: string;
  manager_id?: number;
};

type Department = { id: number; key: string; name: string; has_gm: boolean };
type OrgUnit = { id: number; department_id: number; key: string; name: string };
type Role = { id: number; key: string; label: string; level: string };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const raw: any = await apiGetUsers();
      const list: User[] = Array.isArray(raw) ? raw : [];
      setUsers(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditUser(null);
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setModalOpen(true);
  };

  const handleDelete = async (u: User) => {
    if (!confirm(`Delete user ${u.username}?`)) return;
    await apiDeleteUser(u.id);
    load();
  };

  return (
    <AuthGuard requirePermission="users.manage">
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">User Management</h2>
          <button
            onClick={openNew}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg"
          >
            + New User
          </button>
        </div>

        <div className="bg-white border rounded-xl shadow-sm overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Username</th>
                <th className="px-3 py-2 text-left">Department</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Manager</th>
                <th className="px-3 py-2 text-left">Division (vertikal)</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center">
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2">{u.username}</td>
                    <td className="px-3 py-2">{u.role_department || "-"}</td>
                    <td className="px-3 py-2">{u.role_label || u.role}</td>
                    <td className="px-3 py-2">
                      {u.manager_id ? users.find((m) => m.id === u.manager_id)?.username || `#${u.manager_id}` : "-"}
                    </td>
                    <td className="px-3 py-2">{u.division}</td>
                    <td className="px-3 py-2 text-right space-x-3">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-blue-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        className="text-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {modalOpen && (
          <UserModal
            user={editUser}
            onClose={() => setModalOpen(false)}
            onSaved={() => {
              setModalOpen(false);
              load();
            }}
          />
        )}
      </div>
    </AuthGuard>
  );
}

function UserModal({
  user,
  onClose,
  onSaved,
}: {
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(user?.username || "");
  const [password, setPassword] = useState("");
  const [division, setDivision] = useState(user?.division || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [orgUnitId, setOrgUnitId] = useState<number | "">("");
  const [roleId, setRoleId] = useState<number | "">(user?.role_id || "");
  const [managerId, setManagerId] = useState<number | "">(user?.manager_id || "");

  // daftar user lain (buat pilih atasan langsung / manager_id) -- exclude diri sendiri
  useEffect(() => {
    apiGetUsers()
      .then((list: any) => setAllUsers(Array.isArray(list) ? list.filter((u: User) => u.id !== user?.id) : []))
      .catch(() => setAllUsers([]));
  }, [user]);

  const isEdit = !!user;
  const selectedDept = departments.find((d) => d.id === departmentId);

  // load departments sekali di awal
  useEffect(() => {
    apiGetDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  // saat edit, cari department dari role_department milik user supaya dropdown ter-preselect
  useEffect(() => {
    if (!user?.role_department || departments.length === 0) return;
    const dept = departments.find((d) => d.name === user.role_department);
    if (dept) setDepartmentId(dept.id);
  }, [user, departments]);

  // load org units saat department berubah
  useEffect(() => {
    if (!departmentId) {
      setOrgUnits([]);
      return;
    }
    apiGetOrgUnits(departmentId as number)
      .then(setOrgUnits)
      .catch(() => setOrgUnits([]));
  }, [departmentId]);

  // load roles: kalau org_unit dipilih -> role staff/manager unit itu;
  // kalau departemen punya GM dan org_unit belum/kosong -> tampilkan juga role GM departemen.
  useEffect(() => {
    if (!departmentId) {
      setRoles([]);
      return;
    }
    apiGetRoles({
      orgUnitId: orgUnitId ? (orgUnitId as number) : undefined,
      departmentId: !orgUnitId ? (departmentId as number) : undefined,
    })
      .then(setRoles)
      .catch(() => setRoles([]));
  }, [departmentId, orgUnitId]);

  const save = async () => {
    try {
      setSaving(true);
      setError("");

      if (!roleId) {
        setError("Role wajib dipilih");
        setSaving(false);
        return;
      }

      const payload: any = {
        username,
        role_id: roleId,
      };
      if (division.trim()) payload.division = division;
      if (managerId) payload.manager_id = managerId;

      if (!isEdit) payload.password = password; // mandatory when creating new user
      else if (password) payload.password = password; // allow password update

      if (!isEdit) {
        await apiCreateUser(payload);
      } else {
        await apiUpdateUser(user.id, payload);
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
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4 shadow-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold">
          {isEdit ? "Edit User" : "Create User"}
        </h3>

        <div className="space-y-2">
          <label className="block text-sm">Username</label>
          <input
            className="border rounded px-3 py-2 w-full"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm">
            Password {isEdit ? "(optional)" : "*"}
          </label>
          <input
            type="password"
            className="border rounded px-3 py-2 w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm">Department</label>
          <select
            className="border rounded px-3 py-2 w-full"
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value ? Number(e.target.value) : "");
              setOrgUnitId("");
              setRoleId("");
            }}
          >
            <option value="">-- pilih departemen --</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {departmentId !== "" && (
          <div className="space-y-2">
            <label className="block text-sm">
              Sub-tim / Org Unit {selectedDept?.has_gm ? "(kosongkan untuk role GM)" : ""}
            </label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={orgUnitId}
              onChange={(e) => {
                setOrgUnitId(e.target.value ? Number(e.target.value) : "");
                setRoleId("");
              }}
            >
              <option value="">
                {selectedDept?.has_gm ? "-- (tanpa sub-tim, untuk GM) --" : "-- pilih sub-tim --"}
              </option>
              {orgUnits.map((ou) => (
                <option key={ou.id} value={ou.id}>
                  {ou.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {departmentId !== "" && (
          <div className="space-y-2">
            <label className="block text-sm">Role / Level</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">-- pilih role --</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm">Manager / Atasan Langsung (opsional)</label>
          <select
            className="border rounded px-3 py-2 w-full"
            value={managerId}
            onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">-- tidak ada / belum ditentukan --</option>
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} {u.role_label ? `(${u.role_label})` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            Dipakai untuk approval berjenjang (mis. Purchase Request/harga presales) -- siapa yang approve langsung sebagai atasan user ini.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm">
            Division / vertikal proyek (opsional, default otomatis dari role)
          </label>
          <input
            className="border rounded px-3 py-2 w-full"
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            placeholder="kosongkan untuk default otomatis"
          />
        </div>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-3">
          <button onClick={onClose} className="px-3 py-2 border rounded">
            Cancel
          </button>
          <button
            disabled={saving}
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
