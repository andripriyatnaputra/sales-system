"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import {
  apiGetDepartments,
  apiGetOrgUnits,
  apiGetRoles,
  apiGetPermissions,
  apiCreateOrgUnit,
  apiUpdateOrgUnit,
  apiDeleteOrgUnit,
  apiCreateRole,
  apiUpdateRole,
  apiDeleteRole,
} from "@/lib/api";

type Department = { id: number; key: string; name: string; has_gm: boolean };
type OrgUnit = { id: number; department_id: number; department_name?: string; key: string; name: string };
type Role = {
  id: number;
  key: string;
  label: string;
  org_unit_id?: number | null;
  department_id?: number | null;
  department_name?: string;
  level: string;
  legacy_role: string;
  permissions?: string[];
};
type Permission = { id: number; key: string; description: string };

const LEVELS = ["staff", "manager", "gm", "executive", "system_admin"];

function OrgStructurePageContent() {
  const [tab, setTab] = useState<"orgunits" | "roles">("orgunits");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [orgUnitModal, setOrgUnitModal] = useState<{ mode: "create" | "edit"; item: OrgUnit | null } | null>(null);
  const [roleModal, setRoleModal] = useState<{ mode: "create" | "edit"; item: Role | null } | null>(null);

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [d, ou, r, p] = await Promise.all([
        apiGetDepartments(),
        apiGetOrgUnits(),
        apiGetRoles(),
        apiGetPermissions(),
      ]);
      setDepartments(Array.isArray(d) ? d : []);
      setOrgUnits(Array.isArray(ou) ? ou : []);
      setRoles(Array.isArray(r) ? r : []);
      setPermissions(Array.isArray(p) ? p : []);
    } catch (e: any) {
      setError(e.message || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const roleCountByOrgUnit = useMemo(() => {
    const map: Record<number, number> = {};
    for (const r of roles) {
      if (r.org_unit_id) map[r.org_unit_id] = (map[r.org_unit_id] || 0) + 1;
    }
    return map;
  }, [roles]);

  const handleDeleteOrgUnit = async (ou: OrgUnit) => {
    if (!confirm(`Hapus org unit "${ou.name}"?`)) return;
    try {
      await apiDeleteOrgUnit(ou.id);
      loadAll();
    } catch (e: any) {
      alert(e.message || "Gagal menghapus");
    }
  };

  const handleDeleteRole = async (r: Role) => {
    if (!confirm(`Hapus role "${r.label}"?`)) return;
    try {
      await apiDeleteRole(r.id);
      loadAll();
    } catch (e: any) {
      alert(e.message || "Gagal menghapus");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Org Structure</h2>
          <p className="text-sm text-muted-foreground">
            Kelola Org Unit (sub-tim) dan Role. Departemen inti tetap tetap (read-only) karena namanya dipakai
            sebagai pengecekan otorisasi di banyak modul.
          </p>
        </div>
        {tab === "orgunits" ? (
          <button
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"
            onClick={() => setOrgUnitModal({ mode: "create", item: null })}
          >
            + New Org Unit
          </button>
        ) : (
          <button
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"
            onClick={() => setRoleModal({ mode: "create", item: null })}
          >
            + New Role
          </button>
        )}
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}

      <div className="flex gap-2 border-b">
        <button
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "orgunits" ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground"
          }`}
          onClick={() => setTab("orgunits")}
        >
          Org Units
        </button>
        <button
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "roles" ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground"
          }`}
          onClick={() => setTab("roles")}
        >
          Roles
        </button>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        {tab === "orgunits" ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Departemen</th>
                <th className="px-3 py-2 text-left">Key</th>
                <th className="px-3 py-2 text-left">Nama</th>
                <th className="px-3 py-2 text-right">Jumlah Role</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center">
                    Loading...
                  </td>
                </tr>
              ) : orgUnits.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground">
                    Belum ada org unit.
                  </td>
                </tr>
              ) : (
                orgUnits.map((ou) => (
                  <tr key={ou.id} className="border-t">
                    <td className="px-3 py-2">{ou.department_name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{ou.key}</td>
                    <td className="px-3 py-2">{ou.name}</td>
                    <td className="px-3 py-2 text-right">{roleCountByOrgUnit[ou.id] || 0}</td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <button
                        className="text-blue-600 text-xs"
                        onClick={() => setOrgUnitModal({ mode: "edit", item: ou })}
                      >
                        Edit
                      </button>
                      <button className="text-red-600 text-xs" onClick={() => handleDeleteOrgUnit(ou)}>
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Key</th>
                <th className="px-3 py-2 text-left">Label</th>
                <th className="px-3 py-2 text-left">Level</th>
                <th className="px-3 py-2 text-left">Departemen/Org Unit</th>
                <th className="px-3 py-2 text-left">Legacy Role</th>
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
              ) : roles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-muted-foreground">
                    Belum ada role.
                  </td>
                </tr>
              ) : (
                roles.map((r) => {
                  const orgUnitName = orgUnits.find((ou) => ou.id === r.org_unit_id)?.name;
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{r.key}</td>
                      <td className="px-3 py-2">{r.label}</td>
                      <td className="px-3 py-2">{r.level}</td>
                      <td className="px-3 py-2">{orgUnitName || r.department_name || "-"}</td>
                      <td className="px-3 py-2">
                        {r.legacy_role === "admin" ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                            admin
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted">user</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right space-x-2">
                        <button
                          className="text-blue-600 text-xs"
                          onClick={() => setRoleModal({ mode: "edit", item: r })}
                        >
                          Edit
                        </button>
                        <button className="text-red-600 text-xs" onClick={() => handleDeleteRole(r)}>
                          Hapus
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {orgUnitModal && (
        <OrgUnitModal
          mode={orgUnitModal.mode}
          item={orgUnitModal.item}
          departments={departments}
          onClose={() => setOrgUnitModal(null)}
          onSaved={() => {
            setOrgUnitModal(null);
            loadAll();
          }}
        />
      )}

      {roleModal && (
        <RoleModal
          mode={roleModal.mode}
          item={roleModal.item}
          departments={departments}
          orgUnits={orgUnits}
          permissions={permissions}
          onClose={() => setRoleModal(null)}
          onSaved={() => {
            setRoleModal(null);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

function OrgUnitModal({
  mode,
  item,
  departments,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  item: OrgUnit | null;
  departments: Department[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [departmentId, setDepartmentId] = useState<number | "">(item?.department_id || "");
  const [key, setKey] = useState(item?.key || "");
  const [name, setName] = useState(item?.name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    try {
      setSaving(true);
      setError("");
      if (mode === "create") {
        if (!departmentId || !key || !name) {
          setError("Departemen, key, dan nama wajib diisi");
          setSaving(false);
          return;
        }
        await apiCreateOrgUnit({ department_id: Number(departmentId), key, name });
      } else if (item) {
        await apiUpdateOrgUnit(item.id, { name });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-5 space-y-4">
        <h3 className="text-lg font-semibold">{mode === "create" ? "New Org Unit" : "Edit Org Unit"}</h3>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Departemen</div>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={departmentId}
              onChange={(e) => setDepartmentId(Number(e.target.value))}
              disabled={mode === "edit"}
            >
              <option value="">-- pilih departemen --</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Key</div>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm font-mono"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="mis. ops_new_subteam"
              disabled={mode === "edit"}
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Nama</div>
            <input className="w-full border rounded-md px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}
        </div>

        <div className="flex justify-end gap-2">
          <button className="px-3 py-2 border rounded-lg text-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleModal({
  mode,
  item,
  departments,
  orgUnits,
  permissions,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  item: Role | null;
  departments: Department[];
  orgUnits: OrgUnit[];
  permissions: Permission[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [key, setKey] = useState(item?.key || "");
  const [label, setLabel] = useState(item?.label || "");
  const [level, setLevel] = useState(item?.level || "staff");
  const [orgUnitId, setOrgUnitId] = useState<number | "">(item?.org_unit_id || "");
  const [departmentId, setDepartmentId] = useState<number | "">(item?.department_id || "");
  const [legacyRole, setLegacyRole] = useState(item?.legacy_role || "user");
  const [selectedPerms, setSelectedPerms] = useState<string[]>(item?.permissions || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const needsOrgUnit = level === "staff" || level === "manager";
  const needsDepartment = level === "gm";
  const gmDepartments = departments.filter((d) => d.has_gm);

  const togglePerm = (key: string) => {
    setSelectedPerms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const save = async () => {
    try {
      setSaving(true);
      setError("");

      const payload = {
        label,
        level,
        org_unit_id: needsOrgUnit ? (orgUnitId ? Number(orgUnitId) : null) : null,
        department_id: needsDepartment ? (departmentId ? Number(departmentId) : null) : null,
        legacy_role: legacyRole,
        permissions: selectedPerms,
      };

      if (mode === "create") {
        if (!key || !label) {
          setError("Key dan label wajib diisi");
          setSaving(false);
          return;
        }
        await apiCreateRole({ key, ...payload });
      } else if (item) {
        await apiUpdateRole(item.id, payload);
      }
      onSaved();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-5 space-y-4 my-8">
        <h3 className="text-lg font-semibold">{mode === "create" ? "New Role" : "Edit Role"}</h3>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Key</div>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm font-mono"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="mis. ops_new_subteam_manager"
              disabled={mode === "edit"}
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Label</div>
            <input className="w-full border rounded-md px-3 py-2 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Level</div>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={level}
              onChange={(e) => {
                setLevel(e.target.value);
                setOrgUnitId("");
                setDepartmentId("");
              }}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {needsOrgUnit && (
            <div className="space-y-1">
              <div className="text-sm font-medium">Org Unit</div>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={orgUnitId}
                onChange={(e) => setOrgUnitId(Number(e.target.value))}
              >
                <option value="">-- pilih org unit --</option>
                {orgUnits.map((ou) => (
                  <option key={ou.id} value={ou.id}>
                    {ou.department_name} — {ou.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {needsDepartment && (
            <div className="space-y-1">
              <div className="text-sm font-medium">Departemen (GM)</div>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={departmentId}
                onChange={(e) => setDepartmentId(Number(e.target.value))}
              >
                <option value="">-- pilih departemen --</option>
                {gmDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <div className="text-sm font-medium">Legacy Role</div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={legacyRole === "user"}
                  onChange={() => setLegacyRole("user")}
                />
                user
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={legacyRole === "admin"}
                  onChange={() => setLegacyRole("admin")}
                />
                admin
              </label>
            </div>
            {legacyRole === "admin" && (
              <div className="text-xs text-rose-600">
                Peringatan: "admin" bypass semua pengecekan departemen/division di seluruh sistem.
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">Permissions</div>
            <div className="space-y-1 border rounded-md p-2">
              {permissions.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedPerms.includes(p.key)}
                    onChange={() => togglePerm(p.key)}
                  />
                  <span className="font-mono text-xs">{p.key}</span>
                  <span className="text-muted-foreground text-xs">{p.description}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}
        </div>

        <div className="flex justify-end gap-2">
          <button className="px-3 py-2 border rounded-lg text-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrgStructurePage() {
  return (
    <AuthGuard requirePermission="roles.manage">
      <OrgStructurePageContent />
    </AuthGuard>
  );
}
