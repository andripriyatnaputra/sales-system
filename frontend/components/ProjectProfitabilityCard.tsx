"use client";

import { useEffect, useState } from "react";
import {
  apiGetProjectProfitability,
  apiGetProjectAdditionalCosts,
  apiCreateProjectAdditionalCost,
  apiDeleteProjectAdditionalCost,
  apiGetProjectTimesheets,
  apiCreateTimesheet,
  apiDeleteTimesheet,
  Timesheet,
  canEditDepartment,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/utils";

type Profitability = {
  target: number;
  committed: number;
  actual_paid: number;
  revenue_realized: number;
  additional_costs: number;
  labor_cost: number;
  real_margin: number;
};

type AdditionalCost = {
  id: number;
  description: string;
  amount: number;
  incurred_date?: string | null;
  created_by_username?: string;
  notes?: string | null;
};

export function ProjectProfitabilityCard({ projectId }: { projectId: number | string }) {
  const [profitability, setProfitability] = useState<Profitability | null>(null);
  const [costs, setCosts] = useState<AdditionalCost[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [tsDate, setTsDate] = useState("");
  const [tsHours, setTsHours] = useState("");
  const [tsDesc, setTsDesc] = useState("");
  const [tsSaving, setTsSaving] = useState(false);
  const [tsError, setTsError] = useState("");

  const myUsername = typeof window !== "undefined" ? localStorage.getItem("username") : null;

  const load = async () => {
    setLoading(true);
    try {
      const [p, c, t] = await Promise.all([
        apiGetProjectProfitability(projectId).catch(() => null),
        apiGetProjectAdditionalCosts(projectId).catch(() => []),
        apiGetProjectTimesheets(projectId).catch(() => []),
      ]);
      setProfitability(p);
      setNotFound(!p);
      setCosts(Array.isArray(c) ? c : []);
      setTimesheets(Array.isArray(t) ? t : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const addCost = async () => {
    if (!description || !amount || Number(amount) <= 0) {
      setError("Deskripsi dan amount (>0) wajib diisi");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await apiCreateProjectAdditionalCost(projectId, { description, amount: Number(amount) });
      setDescription("");
      setAmount("");
      load();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const deleteCost = async (cost: AdditionalCost) => {
    if (!confirm(`Hapus additional cost "${cost.description}"?`)) return;
    await apiDeleteProjectAdditionalCost(projectId, cost.id);
    load();
  };

  const addTimesheet = async () => {
    if (!tsDate || !tsHours || Number(tsHours) <= 0) {
      setTsError("Tanggal dan jam (>0) wajib diisi");
      return;
    }
    try {
      setTsSaving(true);
      setTsError("");
      await apiCreateTimesheet(projectId, { work_date: tsDate, hours: Number(tsHours), description: tsDesc });
      setTsDate("");
      setTsHours("");
      setTsDesc("");
      load();
    } catch (e: any) {
      setTsError(e.message || "Gagal menyimpan");
    } finally {
      setTsSaving(false);
    }
  };

  const deleteTimesheet = async (ts: Timesheet) => {
    if (!confirm(`Hapus entri timesheet ${ts.work_date.slice(0, 10)} (${ts.hours} jam)?`)) return;
    await apiDeleteTimesheet(projectId, ts.id);
    load();
  };

  if (loading && !profitability && !notFound) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Loading profitability...</p>
      </Card>
    );
  }

  if (notFound) {
    return (
      <Card className="p-6">
        <h3 className="text-sm font-semibold">Project Profitability</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Belum tersedia — project ini belum Win / belum ada Sales Order.
        </p>
      </Card>
    );
  }

  if (!profitability) return null;

  const marginPositive = profitability.real_margin >= 0;

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Project Profitability</h3>
        <p className="text-xs text-muted-foreground">
          Target dari revenue plan, Committed dari PO approved, Actual Paid dari termin yang sudah lunas.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Target</div>
          <div className="font-semibold">{formatIDR(profitability.target)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Committed</div>
          <div className="font-semibold">{formatIDR(profitability.committed)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Actual Paid</div>
          <div className="font-semibold">{formatIDR(profitability.actual_paid)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Revenue Realized</div>
          <div className="font-semibold">{formatIDR(profitability.revenue_realized)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Labor Cost</div>
          <div className="font-semibold">{formatIDR(profitability.labor_cost)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Real Margin</div>
          <div className={`font-semibold ${marginPositive ? "text-green-600" : "text-red-600"}`}>
            {formatIDR(profitability.real_margin)}
          </div>
        </div>
      </div>

      <div className="pt-3 border-t">
        <div className="text-xs font-medium text-muted-foreground mb-2">Additional Costs</div>
        {costs.length === 0 ? (
          <div className="text-xs text-muted-foreground mb-2">Belum ada additional cost.</div>
        ) : (
          <table className="w-full text-sm mb-2">
            <tbody>
              {costs.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-1.5">{c.description}</td>
                  <td className="py-1.5 text-right">{formatIDR(c.amount)}</td>
                  <td className="py-1.5 text-right w-20">
                    {canEditDepartment("Finance") && (
                      <button className="text-red-600 text-xs" onClick={() => deleteCost(c)}>
                        Hapus
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {canEditDepartment("Finance") && (
          <div className="flex items-center gap-2">
            <input
              className="border rounded-md px-2 py-1.5 text-sm flex-1"
              placeholder="Deskripsi biaya tambahan..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <input
              type="number"
              className="border rounded-md px-2 py-1.5 text-sm w-32"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Button size="sm" onClick={addCost} disabled={saving}>
              {saving ? "..." : "Tambah"}
            </Button>
          </div>
        )}
        {error && <div className="text-red-600 text-xs mt-1">{error}</div>}
      </div>

      <div className="pt-3 border-t">
        <div className="text-xs font-medium text-muted-foreground mb-2">Timesheet</div>
        {timesheets.length === 0 ? (
          <div className="text-xs text-muted-foreground mb-2">Belum ada jam kerja tercatat.</div>
        ) : (
          <table className="w-full text-sm mb-2">
            <tbody>
              {timesheets.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="py-1.5 text-muted-foreground">{t.work_date.slice(0, 10)}</td>
                  <td className="py-1.5">{t.username}</td>
                  <td className="py-1.5 text-right">{t.hours} jam</td>
                  <td className="py-1.5">{t.description}</td>
                  <td className="py-1.5 text-right w-16">
                    {t.username === myUsername && (
                      <button className="text-red-600 text-xs" onClick={() => deleteTimesheet(t)}>
                        Hapus
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex items-center gap-2">
          <input
            type="date"
            className="border rounded-md px-2 py-1.5 text-sm"
            value={tsDate}
            onChange={(e) => setTsDate(e.target.value)}
          />
          <input
            type="number"
            className="border rounded-md px-2 py-1.5 text-sm w-24"
            placeholder="Jam"
            value={tsHours}
            onChange={(e) => setTsHours(e.target.value)}
          />
          <input
            className="border rounded-md px-2 py-1.5 text-sm flex-1"
            placeholder="Deskripsi pekerjaan..."
            value={tsDesc}
            onChange={(e) => setTsDesc(e.target.value)}
          />
          <Button size="sm" onClick={addTimesheet} disabled={tsSaving}>
            {tsSaving ? "..." : "Log Jam"}
          </Button>
        </div>
        {tsError && <div className="text-red-600 text-xs mt-1">{tsError}</div>}
      </div>
    </Card>
  );
}
