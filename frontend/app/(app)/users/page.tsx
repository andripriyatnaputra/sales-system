"use client";

import { useEffect, useState } from "react";
import {
  apiGetUsers,
  apiCreateUser,
  apiUpdateUser,
  apiDeleteUser,
} from "@/lib/api";
import { AuthGuard } from "@/components/AuthGuard";

type User = {
  id: number;
  username: string;
  role: string;
  division: string;
};

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
    <AuthGuard requireAdmin>
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
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Division</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center">
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2">{u.username}</td>
                    <td className="px-3 py-2">{u.role}</td>
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
  const [role, setRole] = useState(user?.role || "user");
  const [division, setDivision] = useState(user?.division || "IT Solutions");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!user;

  const save = async () => {
    try {
      setSaving(true);
      setError("");

      const payload: any = {
        username,
        role,
        division,
      };

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
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4 shadow-lg">
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
          <label className="block text-sm">Role</label>
          <select
            className="border rounded px-3 py-2 w-full"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm">Division</label>
          <select
            className="border rounded px-3 py-2 w-full"
            value={division}
            onChange={(e) => setDivision(e.target.value)}
          >
            <option value="NetCo">Network Communications</option>
            <option value="Oil Mining & Goverments">Oil Mining & Goverments</option>
            <option value="IT Solutions">IT Solutions</option>
          </select>
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
