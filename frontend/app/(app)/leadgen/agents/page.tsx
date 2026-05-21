"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";

type AgentType =
  | "pengadaan"
  | "civd"
  | "civd-file"
  | "pamjaya"
  | "kai"
  | "bjb"
  | "airnav"
  | "classifier"
  | "qualifier"
  | "outreach";

interface AgentConfig {
  id: AgentType;
  name: string;
  description: string;
  category: "scraping" | "processing";
  icon: string;
}

const AGENTS: AgentConfig[] = [
  { id: "pengadaan", name: "Pengadaan.com",        description: "Scrape tender dari tender.pengadaan.com",                  category: "scraping",    icon: "🌐" },
  { id: "civd",      name: "CIVD SKK Migas",        description: "Scrape tender dari civd.skkmigas.go.id (real-time)",        category: "scraping",    icon: "⛽" },
  { id: "civd-file", name: "CIVD Procurement List", description: "Import procurement list dari file lokal (1.682 entries)",   category: "scraping",    icon: "📁" },
  { id: "pamjaya",   name: "PAM Jaya",              description: "Scrape tender dari eproc.pamjaya.co.id",                    category: "scraping",    icon: "💧" },
  { id: "kai",       name: "KAI RAPID",             description: "Scrape tender dari rapid.kai.id",                           category: "scraping",    icon: "🚆" },
  { id: "bjb",       name: "Bank BJB",              description: "Scrape tender dari eproc.bankbjb.co.id (API)",              category: "scraping",    icon: "🏦" },
  { id: "airnav",    name: "Airnav Indonesia",       description: "Scrape tender dari eproc.airnavindonesia.co.id",            category: "scraping",    icon: "✈️" },
  { id: "classifier", name: "Classifier",           description: "Klasifikasi relevansi tender dengan Claude AI",             category: "processing",  icon: "🤖" },
  { id: "qualifier",  name: "Qualifier",            description: "Scoring dan prioritas leads berdasarkan ICP",               category: "processing",  icon: "📊" },
  { id: "outreach",   name: "Outreach",             description: "Generate email outreach yang dipersonalisasi",              category: "processing",  icon: "✉️" },
];

export default function LeadGenAgentsPage() {
  const [selectedAgents, setSelectedAgents] = useState<Set<AgentType>>(new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [backendError, setBackendError] = useState<string | null>(null);

  const toggle = (id: AgentType) => {
    const next = new Set(selectedAgents);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedAgents(next);
  };

  const selectAll = (cat: "scraping" | "processing") => {
    const next = new Set(selectedAgents);
    AGENTS.filter((a) => a.category === cat).forEach((a) => next.add(a.id));
    setSelectedAgents(next);
  };

  const deselectAll = (cat: "scraping" | "processing") => {
    const next = new Set(selectedAgents);
    AGENTS.filter((a) => a.category === cat).forEach((a) => next.delete(a.id));
    setSelectedAgents(next);
  };

  const runAgents = async () => {
    if (selectedAgents.size === 0) return;
    setRunning(true);
    setProgress([]);
    setBackendError(null);

    try {
      const response = await fetch("/api/leadgen/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents: Array.from(selectedAgents) }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }));
        setBackendError(err.error || "Gagal terhubung ke leadgen backend");
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split("\n").filter((l) => l.trim())) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.message) setProgress((prev) => [...prev, data.message]);
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      setBackendError(`Error: ${err}`);
    } finally {
      setRunning(false);
    }
  };

  const scraping = AGENTS.filter((a) => a.category === "scraping");
  const processing = AGENTS.filter((a) => a.category === "processing");

  return (
    <AuthGuard>
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Run Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pilih agent scraping dan processing yang ingin dijalankan</p>
        </div>

        {backendError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">Leadgen backend tidak tersedia</p>
            <p className="text-xs text-red-500 mt-1">{backendError}</p>
            <p className="text-xs text-red-400 mt-1">
              Pastikan LEADGEN_BACKEND_URL sudah dikonfigurasi dan backend starcom-leadgen sedang berjalan.
            </p>
          </div>
        )}

        {/* Scraping Agents */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Scraping Agents</h2>
            <div className="flex gap-3">
              <button onClick={() => selectAll("scraping")} className="text-xs text-blue-600 hover:underline">Pilih Semua</button>
              <button onClick={() => deselectAll("scraping")} className="text-xs text-gray-400 hover:underline">Hapus Semua</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {scraping.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                selected={selectedAgents.has(agent.id)}
                disabled={running}
                onToggle={() => toggle(agent.id)}
                accent="blue"
              />
            ))}
          </div>
        </div>

        {/* Processing Agents */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Processing Agents</h2>
            <div className="flex gap-3">
              <button onClick={() => selectAll("processing")} className="text-xs text-blue-600 hover:underline">Pilih Semua</button>
              <button onClick={() => deselectAll("processing")} className="text-xs text-gray-400 hover:underline">Hapus Semua</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {processing.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                selected={selectedAgents.has(agent.id)}
                disabled={running}
                onToggle={() => toggle(agent.id)}
                accent="green"
              />
            ))}
          </div>
        </div>

        {/* Run Button */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={runAgents}
            disabled={running || selectedAgents.size === 0}
            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              running || selectedAgents.size === 0
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            }`}
          >
            {running
              ? "Sedang Berjalan..."
              : `Jalankan Agent (${selectedAgents.size})`}
          </button>
          {selectedAgents.size > 0 && !running && (
            <span className="text-xs text-gray-500">{selectedAgents.size} agent dipilih</span>
          )}
          {running && (
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-600" />
              Processing...
            </div>
          )}
        </div>

        {/* Progress Log */}
        {progress.length > 0 && (
          <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-semibold text-sm">Progress Log</span>
              <span className="text-gray-400">{progress.length} events</span>
            </div>
            <div className="space-y-0.5 max-h-80 overflow-y-auto">
              {progress.map((msg, i) => (
                <div key={i} className="text-gray-300 leading-relaxed">{msg}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}

function AgentCard({
  agent,
  selected,
  disabled,
  onToggle,
  accent,
}: {
  agent: AgentConfig;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  accent: "blue" | "green";
}) {
  const borderCls = selected
    ? accent === "blue"
      ? "border-blue-500 bg-blue-50"
      : "border-green-500 bg-green-50"
    : "border-gray-200 bg-white hover:border-gray-300";
  const checkCls = accent === "blue" ? "text-blue-600" : "text-green-600";

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`p-4 rounded-lg border-2 text-left transition-all ${borderCls} ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{agent.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{agent.name}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{agent.description}</p>
        </div>
        {selected && (
          <svg className={`w-5 h-5 flex-shrink-0 ${checkCls}`} fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
    </button>
  );
}
