"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPut } from "@/lib/api";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatIDR } from "@/lib/utils";
import { SALES_STAGE_PROBABILITY, STAGES } from "@/lib/constants";
import { SalesStageBar } from "@/components/SalesStageBar";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
  Legend
);

type PostPOStatus = "Not Started" | "In Progress" | "Done";

type PostPOMonitoring = {
  stage1_status: PostPOStatus;
  stage2_status: PostPOStatus;
  stage3_status: PostPOStatus;
  stage4_status: PostPOStatus;
  stage5_status: PostPOStatus;

  stage1_date?: string | null;
  stage2_date?: string | null;
  stage3_date?: string | null;
  stage4_date?: string | null;
  stage5_date?: string | null;

  stage1_note?: string | null;
  stage2_note?: string | null;
  stage3_note?: string | null;
  stage4_note?: string | null;
  stage5_note?: string | null;
};

type RevenueItem = {
  month: string;
  target_revenue: number;
  target_realization: number;
};

type ProjectDetailResponse = {
  id: number;
  project_code: string;
  description: string;
  division: string;
  status: string;
  project_type: string;
  sales_stage: number;
  customer_name?: string | null;
  sph_status?: string | null;
  sph_release_date?: string | null;
  revenue_plans?: RevenueItem[];
  postpo_monitoring?: PostPOMonitoring | null;
};

type StageStatusKey =
  | "stage1_status"
  | "stage2_status"
  | "stage3_status"
  | "stage4_status"
  | "stage5_status";

type StageDateKey =
  | "stage1_date"
  | "stage2_date"
  | "stage3_date"
  | "stage4_date"
  | "stage5_date";

type StageNoteKey =
  | "stage1_note"
  | "stage2_note"
  | "stage3_note"
  | "stage4_note"
  | "stage5_note";


export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;

  const [project, setProject] = useState<ProjectDetailResponse | null>(null);
  const [revenue, setRevenue] = useState<RevenueItem[]>([]);
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<RevenueItem | null>(null);
  const [realizationInput, setRealizationInput] = useState("");
  const [applyMonth, setApplyMonth] = useState<string>("");
  const [moveMonth, setMoveMonth] = useState<boolean>(false);

  const chartRef = useRef<any>(null);

  const [postpo, setPostpo] = useState<PostPOMonitoring | null>(null);

  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<number | null>(null);
  const [stageStatus, setStageStatus] = useState<PostPOStatus>("Not Started");
  const [stageDate, setStageDate] = useState<string>("");
  const [stageNote, setStageNote] = useState<string>("");


  useEffect(() => {
    const load = async () => {
      const data = await apiGet<ProjectDetailResponse>(`/projects/${id}`);

      setProject(data);
      setRevenue(Array.isArray(data.revenue_plans) ? data.revenue_plans : []);
      setPostpo(data.postpo_monitoring ?? null);
    };
    load();
  }, [id]);

  if (!project)
    return (
      <div className="p-6">
        <p>Loading...</p>
      </div>
    );

  // Revenue Summary
  const totalTarget = revenue.reduce((sum, r) => sum + (r.target_revenue || 0), 0);
  const totalReal = revenue.reduce(
    (sum, r) => sum + (r.target_realization || 0),
    0
  );
  const overallAchievement =
    totalTarget > 0 ? Math.round((totalReal / totalTarget) * 100) : 0;

  // Chart Gradient
  const gradient = chartRef.current
    ? chartRef.current.ctx.createLinearGradient(0, 0, 0, 250)
    : null;

  if (gradient) {
    gradient.addColorStop(0, "rgba(59,130,246,0.4)");
    gradient.addColorStop(1, "rgba(59,130,246,0)");
  }

  const chartData = {
    labels: revenue.map((r) => r.month),
    datasets: [
      {
        label: "Target Revenue",
        data: revenue.map((r) => r.target_revenue),
        borderColor: "rgb(59,130,246)",
        backgroundColor: gradient ?? "rgba(59,130,246,0.2)",
        borderWidth: 2,
        tension: 0.35,
        fill: true,
      },
      {
        label: "Realization",
        data: revenue.map((r) => r.target_realization),
        borderColor: "rgb(16,185,129)",
        borderWidth: 2,
        borderDash: [6, 6], // DOT LINE for realization
        tension: 0.35,
        fill: false,
      },
    ],
  };

  const openModal = (item: RevenueItem) => {
    setSelected(item);
    setRealizationInput(String(item.target_realization || 0));
    setModalOpen(true);
    setApplyMonth(item.month);
    setMoveMonth(false);
  };

  const saveRealization = async () => {
    if (!selected) return;

    setSaving(true);

    try {
      await apiPut(`/projects/${id}/realization/${selected.month}`, {
        realization: Number(realizationInput),
        apply_month: applyMonth || selected.month,
        move: moveMonth && (applyMonth || selected.month) !== selected.month,
      });

      // Update UI
      const targetMonth = (applyMonth || selected.month);
      const realization = Number(realizationInput);

      setRevenue((prev) => {
        const next = [...prev];

        // Clear source jika pindah bulan (agar tidak double)
        if (moveMonth && targetMonth !== selected.month) {
          const srcIdx = next.findIndex((x) => x.month === selected.month);
          if (srcIdx >= 0) {
            next[srcIdx] = { ...next[srcIdx], target_realization: 0 };
          }
        }

        // Upsert destination month
        const dstIdx = next.findIndex((x) => x.month === targetMonth);
        if (dstIdx >= 0) {
          next[dstIdx] = { ...next[dstIdx], target_realization: realization };
        } else {
          next.push({ month: targetMonth, target_revenue: 0, target_realization: realization });
        }

        next.sort((a, b) => a.month.localeCompare(b.month));
        return next;
      });


      setModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Color based on achievement %
  const getColor = (p: number) => {
    if (p >= 100) return "text-green-600 font-semibold";
    if (p >= 70) return "text-yellow-600 font-semibold";
    return "text-red-600 font-semibold";
  };

  const getStageField = (s: number): {
    status: StageStatusKey;
    date: StageDateKey;
    note: StageNoteKey;
  } => {
    return {
      status: `stage${s}_status` as StageStatusKey,
      date: `stage${s}_date` as StageDateKey,
      note: `stage${s}_note` as StageNoteKey,
    };
  };

  const statusRank = (v: PostPOStatus) =>
  v === "Done" ? 2 : v === "In Progress" ? 1 : 0;

  const postpoProgress = (() => {
    if (!postpo) return 0;

    const doneCount = STAGES.reduce((acc, s) => {
      const k = getStageField(s.no).status;
      return acc + (postpo[k] === "Done" ? 1 : 0);
    }, 0);

    return Math.round((doneCount / STAGES.length) * 100);
  })();


  const openStageModal = (stageNo: number) => {
    if (!postpo) return;

    const f = getStageField(stageNo);

    setSelectedStage(stageNo);
    setStageStatus(postpo[f.status]);
    setStageDate((postpo[f.date] ?? "") as string);
    setStageNote((postpo[f.note] ?? "") as string);

    setStageModalOpen(true);
  };

  const saveStage = async () => {
    if (!selectedStage) return;
    setSaving(true);
    try {
      await apiPut(`/projects/${id}/postpo-monitoring`, {
        stage: selectedStage,
        status: stageStatus,
        date: stageDate ? stageDate : null,
        note: stageNote ? stageNote : null,
      });

      // update UI lokal
      setPostpo((prev) => {
        if (!prev) return prev;
        const f = getStageField(selectedStage);
        return {
          ...prev,
          [f.status]: stageStatus,
          [f.date]: stageDate ? stageDate : null,
          [f.note]: stageNote ? stageNote : null,
        } as PostPOMonitoring;
      });

      setStageModalOpen(false);
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">{project.project_code}</h1>
          <p className="text-muted-foreground">{project.description}</p>
        </div>

        <Button variant="outline" onClick={() => router.push("/projects")}>
          Back
        </Button>
      </div>

      <Separator />

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Target</div>
          <div className="font-semibold">Rp {formatIDR(totalTarget)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Realization</div>
          <div className="font-semibold text-green-600">
            Rp {formatIDR(totalReal)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">% Achievement</div>
          <div className={getColor(overallAchievement)}>
            {overallAchievement}%
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Weighted Revenue</div>
          <div className="font-semibold text-blue-600">
            Rp {formatIDR(totalTarget * (SALES_STAGE_PROBABILITY[project.sales_stage] ?? 1))}
          </div>
        </Card>
      </div>

      <Separator />

      {/* CHART */}
      <Card className="p-6 h-80">
        <h3 className="text-sm font-semibold mb-4">Revenue Chart</h3>
        <Line ref={chartRef} data={chartData} />
      </Card>

      {/* POST-PO MONITORING */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Post-PO Project Monitoring</h3>
            <p className="text-xs text-muted-foreground">
              Tahapan setelah PO release untuk tracking eksekusi.
            </p>
          </div>

          <Badge variant="outline">
            Progress: {postpoProgress}%
          </Badge>
        </div>

        <div className="mt-4">
          {/* kalau punya komponen Progress dari shadcn: import { Progress } from "@/components/ui/progress"; */}
          {/* jika belum ada, bisa pakai div biasa */}
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-blue-600" style={{ width: `${postpoProgress}%` }} />
          </div>
        </div>

        {/* Gate: hanya aktif setelah PO release */}
        {project.sales_stage !== 6 ? (
            <div className="mt-4 text-xs text-muted-foreground">
              Post-PO Monitoring aktif setelah Sales Stage = Closing.
            </div>
          ) : (
          <div className="mt-5 space-y-3">
            {STAGES.map((s) => {
              const f = getStageField(s.no);
              const st = postpo?.[f.status] ?? "Not Started";
              const dt = (postpo?.[f.date] ?? "") as string;
              const nt = (postpo?.[f.note] ?? "") as string;

              const badge =
                st === "Done"
                  ? "bg-green-100 text-green-700"
                  : st === "In Progress"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-muted text-muted-foreground";

              return (
                <div key={s.no} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium truncate">
                        {s.no}. {s.title}
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${badge}`}>
                        {st}
                      </span>
                    </div>

                    <div className="mt-1 text-xs text-muted-foreground flex gap-3 flex-wrap">
                      <span>Date: {dt || "-"}</span>
                      <span className="truncate">Note: {nt || "-"}</span>
                    </div>
                  </div>

                  <Button size="sm" variant="outline" onClick={() => openStageModal(s.no)}>
                    Update
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>


      {/* REVENUE TABLE */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-3">Revenue & Realization</h3>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2">Month</th>
              <th className="text-right py-2">Target</th>
              <th className="text-right py-2">Realization</th>
              <th className="text-right py-2">Gap</th>
              <th className="text-right py-2">% Ach</th>
              <th className="text-right py-2">Action</th>
            </tr>
          </thead>

          <tbody>
            {revenue.map((r) => {
              const gap = r.target_realization - r.target_revenue;
              const percent =
                r.target_revenue > 0
                  ? Math.round((r.target_realization / r.target_revenue) * 100)
                  : null;


              return (
                <tr key={r.month} className="border-b">
                  <td className="py-2">{r.month}</td>
                  <td className="py-2 text-right">{formatIDR(r.target_revenue)}</td>

                  <td className="py-2 text-right text-green-600">
                    {formatIDR(r.target_realization)}
                  </td>

                  <td className="py-2 text-right">
                    {gap >= 0 ? (
                      <span className="text-green-600">+{formatIDR(gap)}</span>
                    ) : (
                      <span className="text-red-600">{formatIDR(gap)}</span>
                    )}
                  </td>

                  <td className="py-2 text-right">
                    {percent === null ? (
                      <span className="text-muted-foreground">N/A</span>
                    ) : (
                      <span className={getColor(percent)}>{percent}%</span>
                    )}
                  </td>

                  <td className="py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => openModal(r)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* MODAL EDIT REALIZATION */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Realization</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">Month</div>
              <div className="font-medium">{selected?.month}</div>
            </div>

            <div>
              <div className="text-sm mb-1 font-medium">Apply realization to month</div>
              <Input
                type="month"
                value={applyMonth}
                onChange={(e) => {
                  const v = e.target.value; // YYYY-MM
                  setApplyMonth(v);

                  // Jika bulan beda → otomatis move
                  if (selected?.month && v && v !== selected.month) setMoveMonth(true);
                  if (selected?.month && v === selected.month) setMoveMonth(false);
                }}
              />

              <div className="mt-2 flex items-center gap-2">
                <input
                  id="move-month"
                  type="checkbox"
                  checked={moveMonth}
                  disabled={!!selected?.month && !!applyMonth && applyMonth !== selected.month}
                  onChange={(e) => setMoveMonth(e.target.checked)}
                />
                <label htmlFor="move-month" className="text-sm text-muted-foreground">
                  Move (hapus dari bulan asal) — otomatis aktif jika bulan berbeda
                </label>
              </div>
            </div>


            <div>
              <div className="text-sm text-muted-foreground">Target</div>
              <div className="font-medium">
                Rp {formatIDR(selected?.target_revenue || 0)}
              </div>
            </div>

            <div>
              <div className="text-sm mb-1 font-medium">Realisasi</div>
              <Input
                type="number"
                value={realizationInput}
                onChange={(e) => setRealizationInput(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={saveRealization} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stageModalOpen} onOpenChange={setStageModalOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Post-PO Stage</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="text-sm text-muted-foreground">Stage</div>
            <div className="font-medium">
              {selectedStage ? `${selectedStage}. ${STAGES[selectedStage - 1].title}` : "-"}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">Status</div>
            {/* kalau sudah pakai shadcn Select, gunakan Select.
                Kalau belum, sementara pakai <select> */}
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={stageStatus}
              onChange={(e) => setStageStatus(e.target.value as PostPOStatus)}
            >
              <option value="Not Started">Not Started</option>
              <option value="In Progress">In Progress</option>
              <option value="Done">Done</option>
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">Date</div>
            <Input type="date" value={stageDate} onChange={(e) => setStageDate(e.target.value)} />
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">Note</div>
            <textarea
              className="w-full min-h-[90px] border rounded-md px-3 py-2 text-sm"
              value={stageNote}
              onChange={(e) => setStageNote(e.target.value)}
              placeholder="Catatan update stage..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStageModalOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={saveStage} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    </div>
  );
}
