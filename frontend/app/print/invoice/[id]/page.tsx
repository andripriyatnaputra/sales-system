"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGetInvoice } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { PrintDocumentLayout, SignatureBlock } from "@/components/PrintDocumentLayout";

type InvoiceData = {
  invoice_number: string;
  meta_number?: string;
  so_number?: string;
  customer_name?: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  issue_date?: string | null;
  due_date?: string | null;
  notes?: string | null;
};

export default function PrintInvoicePage() {
  const params = useParams();
  const id = params.id as string;
  const [inv, setInv] = useState<InvoiceData | null>(null);

  useEffect(() => {
    apiGetInvoice(id).then(setInv);
  }, [id]);

  if (!inv) return null;

  return (
    <PrintDocumentLayout documentTitle="Invoice" documentNumber={inv.invoice_number}>
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="text-xs text-gray-500 mb-1">Kepada Yth.</div>
          <div className="font-semibold">{inv.customer_name || "-"}</div>
          <div className="text-xs">Sales Order: {inv.so_number || "-"}</div>
          {inv.meta_number && <div className="text-xs">Ref. META: {inv.meta_number}</div>}
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Tanggal Invoice</div>
          <div>{inv.issue_date ? inv.issue_date.slice(0, 10) : "-"}</div>
          <div className="text-xs text-gray-500 mt-2">Jatuh Tempo</div>
          <div>{inv.due_date ? inv.due_date.slice(0, 10) : "-"}</div>
        </div>
      </div>

      <table className="w-full text-xs border-collapse mb-6">
        <thead>
          <tr className="border-y border-gray-800">
            <th className="text-left px-2 py-2">Deskripsi</th>
            <th className="text-right px-2 py-2">Nominal</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-200">
            <td className="px-2 py-2">Subtotal</td>
            <td className="px-2 py-2 text-right">{formatIDR(inv.amount)}</td>
          </tr>
          <tr className="border-b border-gray-200">
            <td className="px-2 py-2">Pajak</td>
            <td className="px-2 py-2 text-right">{formatIDR(inv.tax_amount)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-800 font-semibold">
            <td className="px-2 py-2 text-right">Total</td>
            <td className="px-2 py-2 text-right">{formatIDR(inv.total_amount)}</td>
          </tr>
        </tfoot>
      </table>

      {inv.notes && (
        <div className="mb-6">
          <div className="font-semibold text-xs mb-1">Catatan</div>
          <div className="text-xs">{inv.notes}</div>
        </div>
      )}

      <div className="flex justify-between mt-16">
        <SignatureBlock role="Diterima (Customer)" />
        <SignatureBlock role="Dibuat oleh (Finance)" />
      </div>
    </PrintDocumentLayout>
  );
}
