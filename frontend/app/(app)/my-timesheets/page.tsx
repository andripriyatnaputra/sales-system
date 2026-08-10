"use client";

import { useEffect, useState } from "react";
import {
  apiGet,
  apiGetMyTimesheets,
  apiCreateTimesheet,
  apiDeleteTimesheet,
  Timesheet,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ProjectOption = { id: number; project_code: string; description: string };

export default function MyTimesheetsPage() {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [projectId, setProjectId] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetMyTimesheets({ from: from || undefined, to: to || undefined });
      setTimesheets(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    apiGet<any>("/projects").then((data) => {
      const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setProjects(list);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totalHours = timesheets.reduce((sum, t) => sum + t.hours, 0);

  const addTimesheet = async () => {
    if (!projectId || !workDate || !hours || Number(hours) <= 0) {
      setError("Project, tanggal, dan jam (>0) wajib diisi");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await apiCreateTimesheet(projectId, { work_date: workDate, hours: Number(hours), description });
      setWorkDate("");
      setHours("");
      setDescription("");
      load();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const deleteTimesheet = async (t: Timesheet) => {
    if (!confirm(`Hapus entri ${t.work_date.slice(0, 10)} (${t.hours} jam)?`)) return;
    await apiDeleteTimesheet(t.project_id, t.id);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Timesheet Saya</h2>
        <p className="text-sm text-muted-foreground">
          Log jam kerja Anda per project -- biaya tenaga kerja hasilnya masuk ke Project Profitability.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Log Jam Baru</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <select
            className="border rounded-md px-3 py-2 text-sm bg-background"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Pilih Project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_code} - {p.description}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="border rounded-md px-3 py-2 text-sm"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
          />
          <input
            type="number"
            className="border rounded-md px-3 py-2 text-sm"
            placeholder="Jam"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
          <input
            className="border rounded-md px-3 py-2 text-sm"
            placeholder="Deskripsi pekerjaan..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between">
          {error && <div className="text-red-600 text-xs">{error}</div>}
          <Button size="sm" onClick={addTimesheet} disabled={saving} className="ml-auto">
            {saving ? "Menyimpan..." : "Log Jam"}
          </Button>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <input
          type="date"
          className="border rounded-md px-3 py-2 text-sm"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">sampai</span>
        <input
          type="date"
          className="border rounded-md px-3 py-2 text-sm"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <span className="text-sm text-muted-foreground ml-auto">
          Total: <span className="font-semibold text-foreground">{totalHours} jam</span>
        </span>
      </div>

      <Card className="p-4">
        <table className="w-full text-sm">
          <thead className="border-b text-muted-foreground text-xs">
            <tr>
              <th className="text-left py-1.5">Tanggal</th>
              <th className="text-left py-1.5">Project</th>
              <th className="text-right py-1.5">Jam</th>
              <th className="text-left py-1.5">Deskripsi</th>
              <th className="text-right py-1.5">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : timesheets.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-muted-foreground">
                  Belum ada entri timesheet.
                </td>
              </tr>
            ) : (
              timesheets.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="py-1.5 text-muted-foreground">{t.work_date.slice(0, 10)}</td>
                  <td className="py-1.5">{t.project_code}</td>
                  <td className="py-1.5 text-right">{t.hours}</td>
                  <td className="py-1.5">{t.description}</td>
                  <td className="py-1.5 text-right">
                    <button className="text-red-600 text-xs" onClick={() => deleteTimesheet(t)}>
                      Hapus
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
