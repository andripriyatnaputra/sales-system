"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";

type RevenuePlanItem = {
  month: string;
  target_revenue: number;
};

const DIVISIONS = ["Network Communications", "Oil Mining & Goverments", "IT Solutions"] as const;
const STATUSES = ["Carry Over", "Prospect", "New Prospect"] as const;
const PROJECT_TYPES = ["Project Based", "Recurring", "New Recurring"] as const;

export default function NewProjectPage() {
  const router = useRouter();

  // Basic info
  const [description, setDescription] = useState("");
  const [division, setDivision] = useState("IT Solutions");
  const [status, setStatus] = useState("Prospect");
  const [projectType, setProjectType] = useState("Project Based");
  const [sphStatus, setSphStatus] = useState("");
  const [sphReleaseDate, setSphReleaseDate] = useState("");

  // Project Based revenue
  const [pbMonth, setPbMonth] = useState("");
  const [pbValue, setPbValue] = useState("");

  // Recurring revenue (dynamic rows)
  const [dynamicPlans, setDynamicPlans] = useState<RevenuePlanItem[]>([
    { month: "", target_revenue: 0 },
  ]);

  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRecurring =
    projectType === "Recurring" || projectType === "New Recurring";

  // Add/delete/update rows
  const addMonthRow = () => {
    setDynamicPlans([...dynamicPlans, { month: "", target_revenue: 0 }]);
  };

  const deleteMonthRow = (index: number) => {
    setDynamicPlans(dynamicPlans.filter((_, i) => i !== index));
  };

  const updateMonthRow = (index: number, field: keyof RevenuePlanItem, value: any) => {
    setDynamicPlans((rows) =>
      rows.map((r, i) =>
        i === index ? { ...r, [field]: field === "target_revenue" ? Number(value) : value } : r
      )
    );
  };

  // Build payload for revenue plan
  const buildPlansPayload = (): RevenuePlanItem[] => {
    if (!isRecurring) {
      if (!pbMonth || !pbValue) return [];
      const val = Number(pbValue);
      if (isNaN(val) || val <= 0) return [];
      return [{ month: pbMonth, target_revenue: val }];
    }

    // Recurring dynamic monthly plan
    return dynamicPlans.filter(
      (p) => p.month.trim() !== "" && p.target_revenue > 0
    );
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const revenuePlans = buildPlansPayload();
    if (revenuePlans.length === 0) {
      setErrorMsg("Revenue plan belum diisi dengan benar.");
      return;
    }

    const body = {
      description,
      division,
      status,
      project_type: projectType,
      sph_status: sphStatus || undefined,
      sph_release_date: sphReleaseDate || undefined,
      sales_stage: 1,
      revenue_plans: revenuePlans,
    };

    try {
      setIsSubmitting(true);
      await apiPost("/projects", body);
      router.push("/projects");
    } catch (err: any) {
      setErrorMsg(err?.message || "Gagal membuat project.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">New Project</h2>

      <form
        onSubmit={handleSubmit}
        className="bg-white border rounded shadow p-6 space-y-6"
      >
        {/* Project Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div>
            <label className="block text-sm font-medium mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Division *</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={division}
              onChange={(e) => setDivision(e.target.value)}
            >
              {DIVISIONS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Status *</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Project Type *</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
            >
              {PROJECT_TYPES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>

        </div>

        {/* SPH */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div>
            <label className="block text-sm font-medium mb-1">SPH Status</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={sphStatus}
              onChange={(e) => setSphStatus(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">SPH Release Date</label>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={sphReleaseDate}
              onChange={(e) => setSphReleaseDate(e.target.value)}
            />
          </div>

        </div>

        {/* Revenue Plan Section */}
        <div className="border-t pt-4 space-y-4">
          <h3 className="text-lg font-semibold">Revenue Plan</h3>

          {/* Project Based */}
          {!isRecurring && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Month</label>
                <input
                  type="month"
                  className="border rounded px-3 py-2 w-full"
                  value={pbMonth}
                  onChange={(e) => setPbMonth(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Revenue (IDR)
                </label>
                <input
                  type="number"
                  className="border rounded px-3 py-2 w-full"
                  value={pbValue}
                  onChange={(e) => setPbValue(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Recurring Dynamic Table */}
          {isRecurring && (
            <div className="space-y-4">
              <table className="w-full border rounded">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Month</th>
                    <th className="px-3 py-2 text-left">Target Revenue</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dynamicPlans.map((row, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-3 py-2">
                        <input
                          type="month"
                          className="border rounded px-2 py-1 w-full"
                          value={row.month}
                          onChange={(e) =>
                            updateMonthRow(index, "month", e.target.value)
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          className="border rounded px-2 py-1 w-full"
                          value={row.target_revenue}
                          onChange={(e) =>
                            updateMonthRow(
                              index,
                              "target_revenue",
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {dynamicPlans.length > 1 && (
                          <button
                            type="button"
                            onClick={() => deleteMonthRow(index)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Hapus
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button
                type="button"
                onClick={addMonthRow}
                className="px-3 py-2 border rounded bg-white hover:bg-gray-50 text-sm"
              >
                + Tambah Bulan
              </button>
            </div>
          )}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 border border-red-200 rounded">
            {errorMsg}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/projects")}
            className="px-3 py-2 border rounded"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save Project"}
          </button>
        </div>
      </form>
    </div>
  );
}
