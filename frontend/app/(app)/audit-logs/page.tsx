"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { apiGetAuditLogs } from "@/lib/api";
import { AuthGuard } from "@/components/AuthGuard";

type AuditLogItem = {
  id: number;
  actor_user_id?: number | null;
  actor_username: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  entity_label?: string | null;
  changes?: string | null;
  created_at: string;
};

const ACTION_BADGE: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-rose-100 text-rose-700",
  upload: "bg-purple-100 text-purple-700",
  handover: "bg-amber-100 text-amber-700",
  login_failed: "bg-rose-100 text-rose-700 font-semibold",
};

function AuditLogsPageContent() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetAuditLogs(entityType ? { entity_type: entityType } : undefined);
      setLogs(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType]);

  const entityTypes = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.entity_type))).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter(
      (l) =>
        l.actor_username.toLowerCase().includes(q) ||
        (l.entity_label || "").toLowerCase().includes(q) ||
        (l.entity_id || "").toLowerCase().includes(q)
    );
  }, [logs, search]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Audit Logs</h2>
          <p className="text-sm text-muted-foreground">
            Riwayat aktivitas lintas modul (200 terbaru per filter). Wired ke: user, project, presales, BoQ,
            sales order, PR/PO, BAST, project documents, presales documents, handover Ops.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
          >
            <option value="">Semua entity type</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            className="border rounded-lg px-3 py-2 text-sm w-56"
            placeholder="Cari actor / label / entity id..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Waktu</th>
              <th className="px-3 py-2 text-left">Actor</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Entity Type</th>
              <th className="px-3 py-2 text-left">Label / ID</th>
              <th className="px-3 py-2 text-right">Detail</th>
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
                  Belum ada audit log.
                </td>
              </tr>
            ) : (
              filtered.map((l) => (
                <Fragment key={l.id}>
                  <tr className="border-t">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(l.created_at).toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2 font-medium">{l.actor_username || "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${ACTION_BADGE[l.action] || "bg-muted"}`}>
                        {l.action}
                      </span>
                    </td>
                    <td className="px-3 py-2">{l.entity_type}</td>
                    <td className="px-3 py-2">{l.entity_label || l.entity_id || "-"}</td>
                    <td className="px-3 py-2 text-right">
                      {l.changes && (
                        <button
                          className="text-blue-600 hover:underline"
                          onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                        >
                          {expandedId === l.id ? "Sembunyikan" : "Lihat"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === l.id && l.changes && (
                    <tr className="border-t bg-gray-50">
                      <td colSpan={6} className="px-3 py-2">
                        <pre className="text-xs whitespace-pre-wrap break-all">
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(l.changes as string), null, 2);
                            } catch {
                              return l.changes;
                            }
                          })()}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AuditLogsPage() {
  return (
    <AuthGuard requirePermission="audit.view">
      <AuditLogsPageContent />
    </AuthGuard>
  );
}
