"use client";

import { useEffect, useMemo, useState } from "react";
import {
  apiGetWorkRequests,
  apiCreateWorkRequest,
  apiUpdateWorkRequestStatus,
  apiDeleteWorkRequest,
  apiGet,
  apiGetDepartments,
  canEditDepartment,
  type WorkRequest,
} from "@/lib/api";
import { WorkRequestAttachmentsModal } from "@/components/WorkRequestAttachmentsModal";
import { WorkRequestProgressModal } from "@/components/WorkRequestProgressModal";
import { WorkRequestTasksModal } from "@/components/WorkRequestTasksModal";
import { Card } from "@/components/ui/card";

type Customer = { id: number; name: string };
type Department = { id: number; name: string };

const STATUS_BADGE: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
  cancelled: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancelled",
};

const TYPE_LABEL: Record<string, string> = {
  poc: "POC",
  demo: "Demo",
  internal: "Internal",
};

const STATUS_CARD_STYLE: Record<string, string> = {
  open: "border-blue-200 bg-blue-50",
  in_progress: "border-amber-200 bg-amber-50",
  done: "border-green-200 bg-green-50",
  cancelled: "border-slate-300 bg-slate-100",
};

function isOverdue(wr: WorkRequest): boolean {
  if (wr.status === "done" || wr.status === "cancelled") return false;
  if (!wr.target_date) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(wr.target_date) < startOfToday;
}

export default function WorkRequestBoard({
  types,
  mode,
  title,
  description,
}: {
  types: string[];
  mode: "customer" | "internal";
  title: string;
  description: string;
}) {
  const [list, setList] = useState<WorkRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [attachmentModalWr, setAttachmentModalWr] = useState<WorkRequest | null>(null);
  const [progressModalWr, setProgressModalWr] = useState<WorkRequest | null>(null);
  const [tasksModalWr, setTasksModalWr] = useState<WorkRequest | null>(null);

  const [formType, setFormType] = useState(types[0]);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formDepartmentId, setFormDepartmentId] = useState("");
  const [formTargetDate, setFormTargetDate] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const username = typeof window !== "undefined" ? localStorage.getItem("username") : null;
  const canFulfill = canEditDepartment("Product & Development");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetWorkRequests({
        type: types.join(","),
        mine: mineOnly || undefined,
      });
      setList(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineOnly]);

  useEffect(() => {
    if (mode === "customer") {
      apiGet<Customer[]>("/customers").then((d) => setCustomers(Array.isArray(d) ? d : []));
    } else {
      apiGetDepartments().then((d) => setDepartments(Array.isArray(d) ? d : []));
    }
  }, [mode]);

  const resetForm = () => {
    setFormType(types[0]);
    setFormTitle("");
    setFormDescription("");
    setFormCustomerId("");
    setFormDepartmentId("");
    setFormTargetDate("");
    setFormNotes("");
  };

  const submit = async () => {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      await apiCreateWorkRequest({
        type: formType,
        title: formTitle,
        description: formDescription || undefined,
        customer_id: mode === "customer" ? Number(formCustomerId) || null : null,
        requesting_department_id: mode === "internal" ? Number(formDepartmentId) || null : null,
        target_date: formTargetDate || undefined,
        notes: formNotes || undefined,
      });
      resetForm();
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    await apiUpdateWorkRequestStatus(id, status);
    await load();
  };

  const remove = async (id: number) => {
    if (!confirm("Hapus request ini?")) return;
    await apiDeleteWorkRequest(id);
    await load();
  };

  const canManage = (wr: WorkRequest) => canFulfill || wr.requested_by_username === username;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { open: 0, in_progress: 0, done: 0, cancelled: 0 };
    for (const wr of list) counts[wr.status] = (counts[wr.status] || 0) + 1;
    return counts;
  }, [list]);

  const overdueCount = useMemo(() => list.filter(isOverdue).length, [list]);

  const filtered = useMemo(() => {
    let data = list;
    if (statusFilter) data = data.filter((wr) => wr.status === statusFilter);
    if (overdueOnly) data = data.filter(isOverdue);
    return data;
  }, [list, statusFilter, overdueOnly]);

  const formValid = useMemo(() => {
    if (!formTitle.trim()) return false;
    if (mode === "customer" && !formCustomerId) return false;
    if (mode === "internal" && !formDepartmentId) return false;
    return true;
  }, [formTitle, formCustomerId, formDepartmentId, mode]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
            />
            Punya saya
          </label>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"
          >
            + New Request
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(["open", "in_progress", "done", "cancelled"] as const).map((st) => {
          const active = statusFilter === st;
          return (
            <Card
              key={st}
              className={`p-4 cursor-pointer hover:shadow-md transition ${STATUS_CARD_STYLE[st]} ${
                active ? "ring-2 ring-blue-500" : ""
              }`}
              onClick={() => setStatusFilter((cur) => (cur === st ? "" : st))}
            >
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="flex items-end justify-between">
                <div className="text-lg font-semibold">{STATUS_LABEL[st]}</div>
                <div className="text-2xl font-semibold">{statusCounts[st] || 0}</div>
              </div>
              {active && <div className="text-[11px] text-muted-foreground mt-1">Klik lagi utk hapus filter</div>}
            </Card>
          );
        })}
        <Card
          className={`p-4 cursor-pointer hover:shadow-md transition border-rose-200 bg-rose-50 ${
            overdueOnly ? "ring-2 ring-blue-500" : ""
          }`}
          onClick={() => setOverdueOnly((v) => !v)}
        >
          <div className="text-xs text-muted-foreground">Status</div>
          <div className="flex items-end justify-between">
            <div className="text-lg font-semibold">Overdue</div>
            <div className="text-2xl font-semibold">{overdueCount}</div>
          </div>
          {overdueOnly && <div className="text-[11px] text-muted-foreground mt-1">Klik lagi utk hapus filter</div>}
        </Card>
      </div>

      {showForm && (
        <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3">
          {types.length > 1 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tipe</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                {types.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t] || t}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Judul</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Judul request"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Deskripsi</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={2}
            />
          </div>
          {mode === "customer" ? (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Customer</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                value={formCustomerId}
                onChange={(e) => setFormCustomerId(e.target.value)}
              >
                <option value="">-- pilih customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Departemen Pemohon</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                value={formDepartmentId}
                onChange={(e) => setFormDepartmentId(e.target.value)}
              >
                <option value="">-- pilih departemen --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Target Tanggal</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                value={formTargetDate}
                onChange={(e) => setFormTargetDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Catatan</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              Batal
            </button>
            <button
              onClick={submit}
              disabled={!formValid || saving}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Judul</th>
              {types.length > 1 && <th className="px-3 py-2 text-left">Tipe</th>}
              <th className="px-3 py-2 text-left">{mode === "customer" ? "Customer" : "Departemen"}</th>
              <th className="px-3 py-2 text-left">Pemohon</th>
              <th className="px-3 py-2 text-left">Target</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-4 text-center">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted-foreground">
                  {list.length === 0 ? "Belum ada request." : "Tidak ada request yang cocok filter."}
                </td>
              </tr>
            ) : (
              filtered.map((wr) => (
                <tr key={wr.id} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    {wr.title}
                    {wr.description && (
                      <div className="text-xs text-muted-foreground font-normal">{wr.description}</div>
                    )}
                    {wr.task_count > 0 && (
                      <div className="mt-1 space-y-0.5">
                        <div className="h-1 w-24 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${Math.round((wr.task_done_count / wr.task_count) * 100)}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-muted-foreground font-normal">
                          {wr.task_done_count}/{wr.task_count} task ({Math.round((wr.task_done_count / wr.task_count) * 100)}%)
                        </div>
                      </div>
                    )}
                  </td>
                  {types.length > 1 && <td className="px-3 py-2">{TYPE_LABEL[wr.type] || wr.type}</td>}
                  <td className="px-3 py-2">
                    {mode === "customer" ? wr.customer_name || "-" : wr.requesting_department_name || "-"}
                  </td>
                  <td className="px-3 py-2">{wr.requested_by_username || "-"}</td>
                  <td className="px-3 py-2">{wr.target_date ? wr.target_date.slice(0, 10) : "-"}</td>
                  <td className="px-3 py-2">
                    {canManage(wr) ? (
                      <select
                        className={`text-[11px] px-2 py-1 rounded-full border-0 ${STATUS_BADGE[wr.status] || "bg-muted"}`}
                        value={wr.status}
                        onChange={(e) => updateStatus(wr.id, e.target.value)}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="done">Done</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    ) : (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[wr.status] || "bg-muted"}`}>
                        {STATUS_LABEL[wr.status] || wr.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <button
                      onClick={() => setAttachmentModalWr(wr)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Lampiran ({wr.attachment_count})
                    </button>
                    <button
                      onClick={() => setProgressModalWr(wr)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Progress ({wr.update_count})
                    </button>
                    <button
                      onClick={() => setTasksModalWr(wr)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Tasks ({wr.task_done_count}/{wr.task_count})
                    </button>
                    {canManage(wr) && (
                      <button onClick={() => remove(wr.id)} className="text-rose-600 hover:underline text-xs">
                        Hapus
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {attachmentModalWr && (
        <WorkRequestAttachmentsModal
          workRequestId={attachmentModalWr.id}
          workRequestTitle={attachmentModalWr.title}
          canUpload={canManage(attachmentModalWr)}
          onClose={() => {
            setAttachmentModalWr(null);
            load();
          }}
        />
      )}

      {progressModalWr && (
        <WorkRequestProgressModal
          workRequestId={progressModalWr.id}
          workRequestTitle={progressModalWr.title}
          canPost={canManage(progressModalWr)}
          onClose={() => {
            setProgressModalWr(null);
            load();
          }}
        />
      )}

      {tasksModalWr && (
        <WorkRequestTasksModal
          workRequestId={tasksModalWr.id}
          workRequestTitle={tasksModalWr.title}
          canManage={canManage(tasksModalWr)}
          onClose={() => {
            setTasksModalWr(null);
            load();
          }}
        />
      )}
    </div>
  );
}
