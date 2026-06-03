"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { KebutuhanBadge, IndustriBadge } from "@/components/leadgen/Badge";
import { AddToProjectModal } from "@/components/leadgen/AddToProjectModal";

interface RawLead {
  no: number;
  leadId: string;
  sumber: string;
  namaProyek: string;
  namaPerusahaan: string;
  urlTender: string;
  industri: string;
  lokasi: string;
  kebutuhan: string;
  nilaiProyek: number;
  deadline: string;
  status: string;
  deskripsi: string;
  createdAt: string;
}

function formatNilai(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}jt`;
  return `${n.toLocaleString("id-ID")}`;
}

function formatDate(d: string): string {
  if (!d) return "—";
  if (d.includes("T")) {
    return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  }
  return d;
}

export default function LeadGenRawLeadsPage() {
  const [leads, setLeads] = useState<RawLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({ source: "all", industri: "all", kebutuhan: "all", search: "" });
  const [addToProjectLead, setAddToProjectLead] = useState<RawLead | null>(null);

  useEffect(() => {
    fetch("/api/leadgen/raw-leads")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json();
      })
      .then((d) => { setLeads(d.leads || []); setTotal(d.total || 0); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const sources = ["all", ...Array.from(new Set(leads.map((l) => l.sumber))).filter(Boolean)];
  const industries = ["all", ...Array.from(new Set(leads.map((l) => l.industri))).filter(Boolean)];
  const categories = ["all", ...Array.from(new Set(leads.map((l) => l.kebutuhan))).filter(Boolean)];

  const filtered = leads.filter((l) => {
    if (filter.source !== "all" && l.sumber !== filter.source) return false;
    if (filter.industri !== "all" && l.industri !== filter.industri) return false;
    if (filter.kebutuhan !== "all" && l.kebutuhan !== filter.kebutuhan) return false;
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
            <h1 className="text-xl font-bold text-gray-900">Raw Leads</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Semua leads hasil scraping ({filtered.length} dari {total})
            </p>
          </div>
          <span className="bg-blue-100 text-blue-700 text-sm font-semibold px-3 py-1.5 rounded-full">
            {filtered.length} leads
          </span>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Cari nama proyek / instansi..."
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {[
            { key: "source", label: "Source", options: sources },
            { key: "industri", label: "Industri", options: industries },
            { key: "kebutuhan", label: "Kategori", options: categories },
          ].map(({ key, label, options }) => (
            <div key={key} className="min-w-[140px]">
              <select
                value={(filter as any)[key]}
                onChange={(e) => setFilter({ ...filter, [key]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {options.map((o) => (
                  <option key={o} value={o}>{o === "all" ? `Semua ${label}` : o}</option>
                ))}
              </select>
            </div>
          ))}
          {(filter.source !== "all" || filter.industri !== "all" || filter.kebutuhan !== "all" || filter.search) && (
            <button
              onClick={() => setFilter({ source: "all", industri: "all", kebutuhan: "all", search: "" })}
              className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Reset Filter
            </button>
          )}
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
            <p className="text-base">Belum ada data</p>
            <p className="text-sm mt-1">Jalankan agents untuk scraping leads</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-right w-10">#</th>
                    <th className="px-4 py-3 text-left">Source</th>
                    <th className="px-4 py-3 text-left">Nama Proyek</th>
                    <th className="px-4 py-3 text-left">Instansi</th>
                    <th className="px-4 py-3 text-left">Industri</th>
                    <th className="px-4 py-3 text-left">Kategori</th>
                    <th className="px-4 py-3 text-right">Nilai</th>
                    <th className="px-4 py-3 text-left">Deadline</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((lead, idx) => (
                    <tr key={lead.leadId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-right text-gray-400 tabular-nums text-xs">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-700 rounded">
                          {lead.sumber}
                        </span>
                      </td>
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
                          <span className="font-medium text-xs line-clamp-2 leading-snug">{lead.namaProyek}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[160px]">
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
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {formatDate(lead.deadline)}
                      </td>
                      <td className="px-4 py-3">
                        {lead.status ? (
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                            lead.status.toLowerCase().includes("buka")
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-600"
                          }`}>
                            {lead.status}
                          </span>
                        ) : "—"}
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
