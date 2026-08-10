"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGetBASTVendor } from "@/lib/api";
import { PrintDocumentLayout, SignatureBlock } from "@/components/PrintDocumentLayout";

type BASTItem = {
  id: number;
  item_name: string;
  qty_received: number;
  condition_notes?: string | null;
};

type BASTData = {
  bast_number: string;
  po_number?: string;
  received_date: string;
  status: string;
  notes?: string | null;
  items?: BASTItem[];
};

export default function PrintBASTVendorPage() {
  const params = useParams();
  const id = params.id as string;
  const [bast, setBast] = useState<BASTData | null>(null);

  useEffect(() => {
    apiGetBASTVendor(id).then(setBast);
  }, [id]);

  if (!bast) return null;

  const items = bast.items || [];
  const tanggal = bast.received_date?.slice(0, 10);

  return (
    <PrintDocumentLayout documentTitle="Berita Acara Serah Terima" documentNumber={bast.bast_number}>
      <p className="text-xs leading-relaxed mb-4">
        Pada hari ini, tanggal <strong>{tanggal}</strong>, yang bertanda tangan di bawah ini menyatakan telah
        dilaksanakan serah terima barang/jasa dari Vendor kepada Perusahaan sehubungan dengan Purchase Order
        No. <strong>{bast.po_number || "-"}</strong>, dengan rincian sebagai berikut:
      </p>

      <table className="w-full text-xs border-collapse mb-6">
        <thead>
          <tr className="border-y border-gray-800">
            <th className="text-left px-2 py-2">Item</th>
            <th className="text-right px-2 py-2">Qty Diterima</th>
            <th className="text-left px-2 py-2">Kondisi / Catatan</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-200">
              <td className="px-2 py-2">{it.item_name}</td>
              <td className="px-2 py-2 text-right">{it.qty_received}</td>
              <td className="px-2 py-2">{it.condition_notes || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs leading-relaxed mb-6">
        Status penerimaan: <strong>{bast.status === "complete" ? "Lengkap (Complete)" : "Sebagian (Partial)"}</strong>.
        {bast.notes ? ` Catatan: ${bast.notes}.` : ""} Demikian Berita Acara Serah Terima ini dibuat untuk dipergunakan
        sebagaimana mestinya.
      </p>

      <div className="flex justify-between mt-16">
        <SignatureBlock role="PIHAK PERTAMA (Vendor)" />
        <SignatureBlock role="PIHAK KEDUA (Operations)" />
      </div>
    </PrintDocumentLayout>
  );
}
