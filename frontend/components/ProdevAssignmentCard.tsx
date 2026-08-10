"use client";

import { useEffect, useState } from "react";
import {
  apiGet,
  apiMarkProjectDocumentsComplete,
  apiAssignProdevTeam,
  apiGetOrgUnits,
  canEditDepartment,
  canAccessLevel,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PRODEV_DEPARTMENT_ID = 2;

type ProjectAssignmentInfo = {
  documents_complete_at?: string | null;
  prodev_org_unit_id?: number | null;
  prodev_org_unit_name?: string | null;
  prodev_assigned_at?: string | null;
};

type OrgUnit = { id: number; name: string };

export function ProdevAssignmentCard({ projectId }: { projectId: number | string }) {
  const [info, setInfo] = useState<ProjectAssignmentInfo | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [selectedOrgUnit, setSelectedOrgUnit] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // department="Product & Development" + level>=gm -- konsisten gate
  // AssignProdevTeam di backend.
  const canAssign = canEditDepartment("Product & Development") && canAccessLevel("gm");
  const canMarkComplete = canEditDepartment("Sales");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGet<ProjectAssignmentInfo>(`/projects/${projectId}`);
      setInfo(data);
      if (data.prodev_org_unit_id) setSelectedOrgUnit(String(data.prodev_org_unit_id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (canAssign) {
      apiGetOrgUnits(PRODEV_DEPARTMENT_ID).then((data) => setOrgUnits(Array.isArray(data) ? data : []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const toggleComplete = async (complete: boolean) => {
    try {
      setSaving(true);
      setError("");
      await apiMarkProjectDocumentsComplete(projectId, complete);
      load();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const assign = async () => {
    if (!selectedOrgUnit) {
      setError("Pilih sub-tim dulu");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await apiAssignProdevTeam(projectId, Number(selectedOrgUnit));
      load();
    } catch (e: any) {
      setError(e.message || "Gagal assign");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !info) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Loading assignment...</p>
      </Card>
    );
  }
  if (!info) return null;

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Assignment Sub-Tim Product & Development</h3>
        <p className="text-xs text-muted-foreground">
          Sales tandai dokumen lengkap, lalu GM Product & Development assign project ke sub-tim (Network
          Solutions/Development). Assignment ini cuma menentukan visibilitas di My Work masing-masing sub-tim.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Dokumen Project: </span>
          {info.documents_complete_at ? (
            <span className="text-green-700 font-medium">
              Lengkap sejak {info.documents_complete_at.slice(0, 10)}
            </span>
          ) : (
            <span className="text-amber-700 font-medium">Belum lengkap</span>
          )}
        </div>
        {canMarkComplete && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => toggleComplete(!info.documents_complete_at)}
            disabled={saving}
          >
            {info.documents_complete_at ? "Batalkan Tanda Lengkap" : "Tandai Dokumen Lengkap"}
          </Button>
        )}
      </div>

      {!info.documents_complete_at ? (
        <div className="text-xs text-muted-foreground">Menunggu Sales menandai dokumen project lengkap.</div>
      ) : (
        <div className="pt-3 border-t space-y-2">
          <div className="text-sm">
            <span className="text-muted-foreground">Sub-Tim: </span>
            {info.prodev_org_unit_name ? (
              <span className="font-medium">
                {info.prodev_org_unit_name}
                {info.prodev_assigned_at && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (sejak {info.prodev_assigned_at.slice(0, 10)})
                  </span>
                )}
              </span>
            ) : (
              <span className="text-amber-700 font-medium">Belum di-assign</span>
            )}
          </div>

          {canAssign && (
            <div className="flex items-center gap-2">
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background"
                value={selectedOrgUnit}
                onChange={(e) => setSelectedOrgUnit(e.target.value)}
              >
                <option value="">Pilih sub-tim...</option>
                {orgUnits.map((ou) => (
                  <option key={ou.id} value={ou.id}>
                    {ou.name}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={assign} disabled={saving}>
                {info.prodev_org_unit_name ? "Ganti Assignment" : "Assign"}
              </Button>
            </div>
          )}
        </div>
      )}

      {error && <div className="text-red-600 text-xs bg-red-50 p-2 rounded">{error}</div>}
    </Card>
  );
}
