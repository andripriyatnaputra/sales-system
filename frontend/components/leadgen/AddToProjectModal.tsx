"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { DIVISIONS, STATUSES, PROJECT_TYPES, SALES_STAGES } from "@/lib/constants";
import { safeMonth } from "@/lib/utils";

interface LeadInfo {
  leadId?: string;
  namaProyek: string;
  namaPerusahaan: string;
  nilaiProyek?: number;
}

interface Customer {
  id: number;
  name: string;
  industry?: string;
  region?: string;
}

type Step = "loading" | "new-customer" | "project";

export function AddToProjectModal({
  lead,
  onClose,
  onSaved,
}: {
  lead: LeadInfo;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [step, setStep] = useState<Step>("loading");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [matchedCustomer, setMatchedCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState("");
  const [lockedDivision, setLockedDivision] = useState<string | null>(null);

  // New customer fields
  const [newCustName, setNewCustName] = useState(lead.namaPerusahaan);
  const [newCustIndustry, setNewCustIndustry] = useState("");
  const [newCustRegion, setNewCustRegion] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);

  // Project fields
  const [description, setDescription] = useState(lead.namaProyek);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [division, setDivision] = useState("IT Solutions");
  const [status, setStatus] = useState("Prospect");
  const [projectType, setProjectType] = useState("Project Based");
  const [salesStage, setSalesStage] = useState(1);
  const [pbMonth, setPbMonth] = useState("");
  const [pbValue, setPbValue] = useState(
    lead.nilaiProyek && lead.nilaiProyek > 0 ? String(lead.nilaiProyek) : ""
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setStep("loading");
    try {
      const [res, meRes] = await Promise.all([
        apiGet<any>("/customers"),
        apiGet<any>("/me").catch(() => null),
      ]);

      // Apply division lock from /me
      const meRole = String(meRes?.role || "");
      const meDiv = String(meRes?.division || "");
      const locked = meRole === "user" && meDiv ? meDiv : null;
      setLockedDivision(locked);
      if (locked) setDivision(locked);

      const list: Customer[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.customers)
        ? res.customers
        : [];
      setCustomers(list);

      // Fuzzy match: cek apakah nama perusahaan dari lead sudah ada di customer
      const q = lead.namaPerusahaan.toLowerCase().trim();
      const match = list.find((c) => {
        const cn = c.name.toLowerCase().trim();
        return cn === q || cn.includes(q) || q.includes(cn);
      });

      if (match) {
        setMatchedCustomer(match);
        setCustomerId(match.id);
        setStep("project");
      } else {
        setStep("new-customer");
      }
    } catch {
      // Gagal load customers — tetap lanjut ke project step dengan dropdown
      setStep("project");
    }
  };

  const handleAddCustomer = async () => {
    if (!newCustName.trim()) return;
    setAddingCustomer(true);
    setError("");
    try {
      await apiPost<any>("/customers", {
        name: newCustName.trim(),
        industry: newCustIndustry.trim() || undefined,
        region: newCustRegion.trim() || undefined,
      });

      // Reload list dan cari customer yang baru dibuat by name
      const res = await apiGet<any>("/customers");
      const list: Customer[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.customers)
        ? res.customers
        : [];
      setCustomers(list);

      const created = list.find(
        (c) => c.name.toLowerCase().trim() === newCustName.toLowerCase().trim()
      );
      if (created) {
        setMatchedCustomer(created);
        setCustomerId(created.id);
      }
      setStep("project");
    } catch (e: any) {
      setError(e.message || "Gagal menambahkan customer");
    } finally {
      setAddingCustomer(false);
    }
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!customerId) {
      setError("Customer wajib dipilih.");
      return;
    }
    if (!pbMonth) {
      setError("Bulan revenue plan wajib diisi.");
      return;
    }
    const val = Number(pbValue);
    if (!pbValue || isNaN(val) || val < 0) {
      setError("Target revenue harus diisi dan tidak boleh negatif.");
      return;
    }

    setSaving(true);
    try {
      await apiPost("/projects", {
        customer_id: Number(customerId),
        description: description.trim(),
        division,
        status,
        project_type: projectType,
        pipeline_status: "Active",
        sales_stage: salesStage,
        sph_release_status: "No",
        revenue_plans: [
          { month: pbMonth, target_revenue: val, sph_revenue: null },
        ],
      });

      // Mark lead as converted so it disappears from the list
      if (lead.leadId) {
        await fetch("/api/leadgen/raw-leads", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.leadId, status: "converted" }),
        });
      }

      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan project");
    } finally {
      setSaving(false);
    }
  };

  // ── Step: Loading ──
  if (step === "loading") {
    return (
      <ModalShell title="Add to Project" onClose={onClose}>
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </ModalShell>
    );
  }

  // ── Step: New Customer ──
  if (step === "new-customer") {
    return (
      <ModalShell title="Customer Belum Terdaftar" onClose={onClose}>
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-800">
              "{lead.namaPerusahaan}" belum ada di database customer.
            </p>
            <p className="text-xs text-amber-600 mt-1">
              Tambahkan sebagai customer baru untuk melanjutkan membuat project.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Nama Customer *</label>
            <input
              className="border rounded-lg w-full px-3 py-2 text-sm"
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Industri</label>
            <input
              className="border rounded-lg w-full px-3 py-2 text-sm"
              placeholder="Perbankan, BUMN, Migas, Pemerintah..."
              value={newCustIndustry}
              onChange={(e) => setNewCustIndustry(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Region / Kota</label>
            <input
              className="border rounded-lg w-full px-3 py-2 text-sm"
              placeholder="Jakarta, Bandung, Surabaya..."
              value={newCustRegion}
              onChange={(e) => setNewCustRegion(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleAddCustomer}
              disabled={addingCustomer || !newCustName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50 hover:bg-blue-700"
            >
              {addingCustomer ? "Menyimpan..." : "Tambah Customer & Lanjut →"}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  // ── Step: Project Form ──
  return (
    <ModalShell title="Tambah Project dari Lead" onClose={onClose} wide>
      <form onSubmit={handleSaveProject} className="space-y-5">

        {/* Info lead asal */}
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          <span className="font-medium">Sumber Lead:</span>{" "}
          {lead.namaProyek}
          {lead.namaPerusahaan && ` — ${lead.namaPerusahaan}`}
        </div>

        {/* Customer info */}
        {matchedCustomer ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            <svg className="w-4 h-4 flex-shrink-0 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>
              Customer: <strong>{matchedCustomer.name}</strong>
            </span>
            <button
              type="button"
              onClick={() => { setMatchedCustomer(null); setCustomerId(""); }}
              className="ml-auto text-xs text-green-600 hover:underline"
            >
              Ganti
            </button>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-1">Customer *</label>
            <select
              className="border rounded-lg w-full px-3 py-2 text-sm"
              value={customerId === "" ? "" : String(customerId)}
              onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : "")}
              required
            >
              <option value="">-- Pilih Customer --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Basic fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Description */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Nama Project *</label>
            <input
              className="border rounded-lg w-full px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Dari lead — bisa diedit sesuai kebutuhan
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Division *</label>
            <select
              className="border rounded-lg w-full px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              disabled={!!lockedDivision}
            >
              {lockedDivision ? (
                <option value={lockedDivision}>{lockedDivision}</option>
              ) : (
                DIVISIONS.filter((d) => d !== "All").map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))
              )}
            </select>
            {lockedDivision && (
              <p className="text-xs text-gray-500 mt-1">Division dikunci sesuai akun Anda.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Status *</label>
            <select
              className="border rounded-lg w-full px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Project Type *</label>
            <select
              className="border rounded-lg w-full px-3 py-2 text-sm"
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
            >
              {PROJECT_TYPES.filter((t) => t !== "New Recurring").map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Sales Stage *</label>
            <select
              className="border rounded-lg w-full px-3 py-2 text-sm"
              value={salesStage}
              onChange={(e) => setSalesStage(Number(e.target.value))}
            >
              {SALES_STAGES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Revenue Plan */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold mb-3">Revenue Plan</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Bulan *</label>
              <input
                type="month"
                className="border rounded-lg w-full px-3 py-2 text-sm"
                value={safeMonth(pbMonth)}
                onChange={(e) => setPbMonth(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Target Revenue (IDR) *</label>
              <input
                type="number"
                className="border rounded-lg w-full px-3 py-2 text-sm"
                value={pbValue}
                onChange={(e) => setPbValue(e.target.value)}
                placeholder="Nilai proyek dalam Rupiah"
                min={1}
              />
              {lead.nilaiProyek && lead.nilaiProyek > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Nilai dari lead: Rp {lead.nilaiProyek.toLocaleString("id-ID")}
                </p>
              )}
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Detail SPH, SPH Number, dan informasi lanjutan dapat dilengkapi melalui menu Edit Project.
        </p>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50 hover:bg-blue-700"
          >
            {saving ? "Menyimpan..." : "Simpan Project"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className={`bg-white rounded-xl shadow-xl w-full mx-4 max-h-[90vh] overflow-auto ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
