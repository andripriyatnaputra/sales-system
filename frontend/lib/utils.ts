import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---------------- SAFE UTILS ----------------

// Always return array, never null/undefined
export function safeArray<T>(value: any): T[] {
  return Array.isArray(value) ? value : [];
}

// Always return string
export function safeString(v: any): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  return String(v);
}

// Always return number (0 if invalid)
export function safeNumber(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// Ensure month always YYYY-MM format
export function safeMonth(v: any): string {
  if (!v) return "";

  if (typeof v === "string") {
    // ISO full date → keep YYYY-MM
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
      return v.slice(0, 7);
    }

    // Already correct YYYY-MM
    if (/^\d{4}-\d{2}$/.test(v)) {
      return v;
    }
  }

  // Invalid format → force blank
  return "";
}


// ---------------- FORMATTERS ----------------

// Format as Indonesian Rupiah with commas, without prefix
export function formatIDR(num: number): string {
  return safeNumber(num).toLocaleString("id-ID");
}

// Format with prefix "Rp"
export function formatRupiah(num: number): string {
  return "Rp " + formatIDR(num);
}

// Convert YYYY-MM to readable format
export function formatMonthLabel(month: string): string {
  // ex: 2025-01 → Jan 2025
  const m = safeMonth(month);
  if (!m) return "-";

  const [year, mon] = m.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  return `${names[Number(mon) - 1]} ${year}`;
}


// ---------------- CSV HELPERS ----------------

export function generateCsv(headers: string[], rows: any[][]) {
  const sanitized = rows.map((row) =>
    row.map((v) => (v === null || v === undefined ? "" : String(v)))
  );

  const lines = [
    headers.join(","),
    ...sanitized.map((cols) => cols.join(",")),
  ];

  return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}
