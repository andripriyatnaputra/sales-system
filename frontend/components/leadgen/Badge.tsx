const KEBUTUHAN_COLOR: Record<string, string> = {
  "jaringan":          "bg-blue-100 text-blue-800",
  "it-infrastructure": "bg-purple-100 text-purple-800",
  "software":          "bg-green-100 text-green-800",
  "sistem-integrasi":  "bg-yellow-100 text-yellow-800",
  "cybersecurity":     "bg-red-100 text-red-800",
  "cctv":              "bg-orange-100 text-orange-800",
  "cloud":             "bg-sky-100 text-sky-800",
};

const INDUSTRI_COLOR: Record<string, string> = {
  "Migas":        "bg-amber-100 text-amber-900",
  "Pertambangan": "bg-stone-100 text-stone-800",
  "BUMN":         "bg-indigo-100 text-indigo-800",
  "Perbankan":    "bg-emerald-100 text-emerald-800",
  "Pemerintah":   "bg-gray-100 text-gray-800",
  "Kesehatan":    "bg-rose-100 text-rose-800",
  "Pendidikan":   "bg-teal-100 text-teal-800",
  "Manufaktur":   "bg-cyan-100 text-cyan-800",
};

export function KebutuhanBadge({ value }: { value: string }) {
  const cls = KEBUTUHAN_COLOR[value] ?? "bg-gray-100 text-gray-700";
  const label = value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export function IndustriBadge({ value }: { value: string }) {
  const cls = INDUSTRI_COLOR[value] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {value}
    </span>
  );
}

export function ScoreBadge({ score, qualified }: { score: number; qualified: boolean }) {
  const cls = qualified
    ? "bg-green-100 text-green-800 ring-1 ring-green-300"
    : score >= 40
    ? "bg-yellow-100 text-yellow-800"
    : "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {score}
      {qualified && <span title="Qualified">✓</span>}
    </span>
  );
}

export function PriorityBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    tinggi: "bg-red-100 text-red-800",
    sedang: "bg-yellow-100 text-yellow-800",
    rendah: "bg-gray-100 text-gray-600",
  };
  const cls = map[value?.toLowerCase()] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {value}
    </span>
  );
}
