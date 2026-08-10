"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGetBASTCustomer } from "@/lib/api";
import { PrintDocumentLayout, SignatureBlock } from "@/components/PrintDocumentLayout";

type BASTItem = {
  id: number;
  item_name: string;
  qty_delivered: number;
  notes?: string | null;
};

type BASTData = {
  bast_number: string;
  so_number?: string;
  delivered_date: string;
  status: string;
  customer_signatory?: string | null;
  notes?: string | null;
  items?: BASTItem[];
};

export default function PrintBASTCustomerPage() {
  const params = useParams();
  const id = params.id as string;
  const [bast, setBast] = useState<BASTData | null>(null);

  useEffect(() => {
    apiGetBASTCustomer(id).then(setBast);
  }, [id]);

  if (!bast) return null;

  const items = bast.items || [];
  const tanggal = bast.delivered_date?.slice(0, 10);

  return (
    <PrintDocumentLayout documentTitle="Berita Acara Serah Terima" documentNumber={bast.bast_number}>
      <p className="text-xs leading-relaxed mb-4">
        Pada hari ini, tanggal <strong>{tanggal}</strong>, yang bertanda tangan di bawah ini menyatakan telah
        dilaksanakan serah terima barang/jasa dari Perusahaan kepada Customer sehubungan dengan Sales Order
        No. <strong>{bast.so_number || "-"}</strong>, dengan rincian sebagai berikut:
      </p>

      <table className="w-full text-xs border-collapse mb-6">
        <thead>
          <tr className="border-y border-gray-800">
            <th className="text-left px-2 py-2">Item</th>
            <th className="text-right px-2 py-2">Qty Diserahkan</th>
            <th className="text-left px-2 py-2">Catatan</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-200">
              <td className="px-2 py-2">{it.item_name}</td>
              <td className="px-2 py-2 text-right">{it.qty_delivered}</td>
              <td className="px-2 py-2">{it.notes || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs leading-relaxed mb-6">
        Status serah terima: <strong>{bast.status === "complete" ? "Lengkap (Complete)" : "Sebagian (Partial)"}</strong>.
        {bast.notes ? ` Catatan: ${bast.notes}.` : ""} Demikian Berita Acara Serah Terima ini dibuat untuk dipergunakan
        sebagaimana mestinya.
      </p>

      <div className="flex justify-between mt-16">
        <SignatureBlock role="PIHAK PERTAMA (Perusahaan)" />
        <SignatureBlock role="PIHAK KEDUA (Customer)" name={bast.customer_signatory || undefined} />
      </div>
    </PrintDocumentLayout>
  );
}
