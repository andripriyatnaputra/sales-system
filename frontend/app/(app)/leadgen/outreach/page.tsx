"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { KebutuhanBadge, IndustriBadge, ScoreBadge, PriorityBadge } from "@/components/leadgen/Badge";
import { EmailButton } from "@/components/leadgen/EmailModal";
import { AddToProjectModal } from "@/components/leadgen/AddToProjectModal";

interface ScoreBreakdownItem {
  nilai: number;
  maks: number;
  label: string;
}

interface OutreachLead {
  leadId: string;
  namaProyek: string;
  namaPerusahaan: string;
  urlTender: string;
  industri: string;
  kebutuhan: string;
  lokasi: string;
  nilaiProyek: number;
  score: number;
  priority: string;
  isQualified: boolean;
  scoreBreakdown: {
    industri: ScoreBreakdownItem;
    lokasi: ScoreBreakdownItem;
    nilaiProyek: ScoreBreakdownItem;
    timing: ScoreBreakdownItem;
  };
  email: { subjek: string; kepada: string; isi: string } | null;
  generatedBy: string;
}

function formatNilai(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}jt`;
  return `${n.toLocaleString("id-ID")}`;
}

function ScoreBar({ breakdown }: { breakdown: ScoreBreakdownItem }) {
  const pct = breakdown.maks > 0 ? Math.round((breakdown.nilai / breakdown.maks) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <span className="w-14 text-right shrink-0">{breakdown.label}</span>
      <div className="w-16 bg-gray-200 rounded-full h-1.5">
        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums">{breakdown.nilai}/{breakdown.maks}</span>
    </div>
  );
}

export default function LeadGenOutreachPage() {
  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [total, setTotal] = useState(0);
  const [qualified, setQualified] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({ onlyQualified: false, search: "" });
  const [addToProjectLead, setAddToProjectLead] = useState<OutreachLead | null>(null);

  useEffect(() => {
    fetch("/api/leadgen/outreach")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json();
      })
      .then((d) => {
        setLeads(d.leads || []);
        setTotal(d.total || 0);
        setQualified(d.qualified || 0);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = leads.filter((l) => {
    if (filter.onlyQualified && !l.isQualified) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      return (
        l.namaProyek.toLowerCase().includes(q) ||
        l.namaPerusahaan.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <AuthGuard>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Outreach</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Leads dengan ICP scoring + draft email outreach
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <span className="bg-green-100 text-green-800 font-semibold px-3 py-1.5 rounded-full">
              {qualified} qualified
            </span>
            <span className="bg-gray-100 text-gray-700 font-semibold px-3 py-1.5 rounded-full">
              {total} total
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Cari nama proyek / instansi..."
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input
              type="checkbox"
              checked={filter.onlyQualified}
              onChange={(e) => setFilter({ ...filter, onlyQualified: e.target.checked })}
              className="rounded border-gray-300"
            />
            Hanya Qualified
          </label>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            <p className="font-semibold">Gagal memuat data</p>
            <p className="text-xs mt-1 text-red-500">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-lg border border-gray-200">
            <p className="text-base">Belum ada data outreach</p>
            <p className="text-sm mt-1">Jalankan pipeline: Classifier → Qualifier → Outreach</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Nama Proyek</th>
                    <th className="px-4 py-3 text-left">Instansi</th>
                    <th className="px-4 py-3 text-left">Industri</th>
                    <th className="px-4 py-3 text-left">Kategori</th>
                    <th className="px-4 py-3 text-right">Nilai</th>
                    <th className="px-4 py-3 text-center">Score</th>
                    <th className="px-4 py-3 text-center">Prioritas</th>
                    <th className="px-4 py-3 text-left">Breakdown</th>
                    <th className="px-4 py-3 text-center">Email</th>
                    <th className="px-4 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((lead) => (
                    <tr
                      key={lead.leadId}
                      className={`hover:bg-gray-50 transition-colors ${lead.isQualified ? "bg-green-50/30" : ""}`}
                    >
                      <td className="px-4 py-3 max-w-xs">
                        {lead.urlTender ? (
                          <a
                            href={lead.urlTender}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-medium text-xs line-clamp-2 leading-snug"
                          >
                            {lead.namaProyek}
                          </a>
                        ) : (
                          <span className="font-medium text-xs line-clamp-2">{lead.namaProyek}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[150px]">
                        <span className="text-xs text-gray-700 line-clamp-2">{lead.namaPerusahaan}</span>
                        {lead.lokasi && <span className="text-xs text-gray-400 block">{lead.lokasi}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <IndustriBadge value={lead.industri} />
                      </td>
                      <td className="px-4 py-3">
                        <KebutuhanBadge value={lead.kebutuhan} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 whitespace-nowrap text-xs">
                        {formatNilai(lead.nilaiProyek)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ScoreBadge score={lead.score} qualified={lead.isQualified} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {lead.priority ? <PriorityBadge value={lead.priority} /> : "—"}
                      </td>
                      <td className="px-4 py-3 min-w-[200px]">
                        <div className="space-y-1.5">
                          <ScoreBar breakdown={lead.scoreBreakdown.industri} />
                          <ScoreBar breakdown={lead.scoreBreakdown.lokasi} />
                          <ScoreBar breakdown={lead.scoreBreakdown.nilaiProyek} />
                          <ScoreBar breakdown={lead.scoreBreakdown.timing} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {lead.email ? (
                          <EmailButton email={lead.email} instansi={lead.namaPerusahaan} />
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setAddToProjectLead(lead)}
                          className="text-xs px-2.5 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors whitespace-nowrap font-medium"
                        >
                          + Add to Project
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add to Project Modal */}
      {addToProjectLead && (
        <AddToProjectModal
          lead={{
            leadId: addToProjectLead.leadId,
            namaProyek: addToProjectLead.namaProyek,
            namaPerusahaan: addToProjectLead.namaPerusahaan,
            nilaiProyek: addToProjectLead.nilaiProyek,
          }}
          onClose={() => setAddToProjectLead(null)}
          onSaved={() => {
            setLeads((prev) => prev.filter((l) => l.leadId !== addToProjectLead.leadId));
            setAddToProjectLead(null);
          }}
        />
      )}
    </AuthGuard>
  );
}
