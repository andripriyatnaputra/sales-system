"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGetExpiringDocuments } from "@/lib/api";
import { Card } from "@/components/ui/card";

type ExpiringDocument = {
  id: number;
  project_id: number;
  project_code: string;
  project_description: string;
  category: string;
  file_name: string;
  expiry_date: string;
  days_until_expiry: number;
};

const CATEGORY_BADGE: Record<string, string> = {
  RFQ: "bg-blue-100 text-blue-700",
  TOR: "bg-purple-100 text-purple-700",
  SPH: "bg-amber-100 text-amber-700",
  PO: "bg-teal-100 text-teal-700",
  Kontrak: "bg-indigo-100 text-indigo-700",
  BAST: "bg-cyan-100 text-cyan-700",
  Lainnya: "bg-muted text-muted-foreground",
};

function expiryBadge(days: number) {
  if (days < 0) {
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">Expired {-days} hari lalu</span>;
  }
  if (days <= 30) {
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{days} hari lagi</span>;
  }
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{days} hari lagi</span>;
}

export default function DocumentExpiryPage() {
  const [docs, setDocs] = useState<ExpiringDocument[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiGetExpiringDocuments();
        setDocs(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Reminder Dokumen</h2>
        <p className="text-sm text-muted-foreground">
          Dokumen (SPH/PO/Kontrak/BAST/dll) lintas-project yang punya tanggal expiry, diurutkan yang paling
          dekat atau sudah lewat lebih dulu.
        </p>
      </div>

      <Card className="p-4">
        <table className="w-full text-sm">
          <thead className="border-b text-muted-foreground text-xs">
            <tr>
              <th className="text-left py-1.5">Project</th>
              <th className="text-left py-1.5">Kategori</th>
              <th className="text-left py-1.5">Nama File</th>
              <th className="text-left py-1.5">Tanggal Expiry</th>
              <th className="text-left py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : docs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-muted-foreground">
                  Belum ada dokumen dengan tanggal expiry.
                </td>
              </tr>
            ) : (
              docs.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="py-1.5">
                    <Link href={`/projects/${d.project_id}`} className="text-blue-600 hover:underline">
                      {d.project_code}
                    </Link>
                    <div className="text-xs text-muted-foreground">{d.project_description}</div>
                  </td>
                  <td className="py-1.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${CATEGORY_BADGE[d.category] || "bg-muted"}`}>
                      {d.category}
                    </span>
                  </td>
                  <td className="py-1.5">{d.file_name}</td>
                  <td className="py-1.5 text-muted-foreground">{d.expiry_date?.slice(0, 10)}</td>
                  <td className="py-1.5">{expiryBadge(d.days_until_expiry)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
