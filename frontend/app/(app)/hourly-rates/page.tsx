"use client";

import { useEffect, useState } from "react";
import {
  apiGetUsersForRateManagement,
  apiUpdateUserHourlyRate,
  UserRate,
  canEditDepartment,
} from "@/lib/api";
import { Card } from "@/components/ui/card";

export default function HourlyRatesPage() {
  const [users, setUsers] = useState<UserRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const canEdit = canEditDepartment("Finance") || canEditDepartment("HR GA & Legal");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetUsersForRateManagement();
      setUsers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (userId: number) => {
    const value = drafts[userId];
    if (value === undefined || value === "" || Number(value) < 0) return;
    try {
      setSavingId(userId);
      await apiUpdateUserHourlyRate(userId, Number(value));
      load();
    } finally {
      setSavingId(null);
    }
  };

  if (!canEdit) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Halaman ini khusus Finance / HR GA & Legal.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Rate Tenaga Kerja</h2>
        <p className="text-sm text-muted-foreground">
          Rate per jam tiap user -- dipakai hitung biaya tenaga kerja (Labor Cost) di Project Profitability.
        </p>
      </div>

      <Card className="p-4">
        <table className="w-full text-sm">
          <thead className="border-b text-muted-foreground text-xs">
            <tr>
              <th className="text-left py-1.5">Username</th>
              <th className="text-left py-1.5">Division</th>
              <th className="text-right py-1.5">Rate/Jam</th>
              <th className="text-right py-1.5">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-1.5 font-medium">{u.username}</td>
                  <td className="py-1.5 text-muted-foreground">{u.division}</td>
                  <td className="py-1.5 text-right">
                    <input
                      type="number"
                      className="border rounded-md px-2 py-1 text-sm w-32 text-right"
                      defaultValue={u.hourly_rate ?? ""}
                      placeholder="0"
                      onChange={(e) => setDrafts((d) => ({ ...d, [u.id]: e.target.value }))}
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      className="text-blue-600 text-xs"
                      onClick={() => save(u.id)}
                      disabled={savingId === u.id}
                    >
                      {savingId === u.id ? "..." : "Simpan"}
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
