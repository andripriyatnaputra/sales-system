"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGetPurchaseOrder, apiGetVendor } from "@/lib/api";
import { formatIDR } from "@/lib/utils";
import { PrintDocumentLayout, SignatureBlock } from "@/components/PrintDocumentLayout";

type POItem = {
  id: number;
  item_name: string;
  unit?: string | null;
  qty: number;
  unit_cost: number;
};

type PaymentSchedule = {
  id: number;
  sequence: number;
  trigger_description?: string | null;
  percentage?: number | null;
  amount: number;
};

type POData = {
  po_number: string;
  vendor_id: number;
  vendor_name?: string;
  total_value: number;
  created_at: string;
  notes?: string | null;
  items?: POItem[];
  payment_schedules?: PaymentSchedule[];
};

type Vendor = {
  name: string;
  address?: string | null;
  npwp?: string | null;
  contact_person?: string | null;
};

export default function PrintPOPage() {
  const params = useParams();
  const id = params.id as string;
  const [po, setPo] = useState<POData | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);

  useEffect(() => {
    apiGetPurchaseOrder(id).then((data: any) => {
      setPo(data);
      if (data.vendor_id) apiGetVendor(data.vendor_id).then(setVendor);
    });
  }, [id]);

  if (!po) return null;

  const items = po.items || [];
  const schedules = (po.payment_schedules || []).sort((a, b) => a.sequence - b.sequence);

  return (
    <PrintDocumentLayout documentTitle="Purchase Order" documentNumber={po.po_number}>
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="text-xs text-gray-500 mb-1">Kepada Yth.</div>
          <div className="font-semibold">{vendor?.name || po.vendor_name}</div>
          {vendor?.address && <div className="text-xs">{vendor.address}</div>}
          {vendor?.npwp && <div className="text-xs">NPWP: {vendor.npwp}</div>}
          {vendor?.contact_person && <div className="text-xs">Attn: {vendor.contact_person}</div>}
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Tanggal PO</div>
          <div>{po.created_at?.slice(0, 10)}</div>
        </div>
      </div>

      <table className="w-full text-xs border-collapse mb-6">
        <thead>
          <tr className="border-y border-gray-800">
            <th className="text-left px-2 py-2">Item</th>
            <th className="text-left px-2 py-2">Unit</th>
            <th className="text-right px-2 py-2">Qty</th>
            <th className="text-right px-2 py-2">Harga Satuan</th>
            <th className="text-right px-2 py-2">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-200">
              <td className="px-2 py-2">{it.item_name}</td>
              <td className="px-2 py-2">{it.unit || "-"}</td>
              <td className="px-2 py-2 text-right">{it.qty}</td>
              <td className="px-2 py-2 text-right">{formatIDR(it.unit_cost)}</td>
              <td className="px-2 py-2 text-right">{formatIDR(it.unit_cost * it.qty)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-800 font-semibold">
            <td colSpan={4} className="px-2 py-2 text-right">
              Total
            </td>
            <td className="px-2 py-2 text-right">{formatIDR(po.total_value)}</td>
          </tr>
        </tfoot>
      </table>

      {schedules.length > 0 && (
        <div className="mb-6">
          <div className="font-semibold text-xs mb-2">Syarat Pembayaran</div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-y border-gray-800">
                <th className="text-left px-2 py-1">#</th>
                <th className="text-left px-2 py-1">Deskripsi</th>
                <th className="text-right px-2 py-1">%</th>
                <th className="text-right px-2 py-1">Nominal</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-b border-gray-200">
                  <td className="px-2 py-1">{s.sequence}</td>
                  <td className="px-2 py-1">{s.trigger_description || "-"}</td>
                  <td className="px-2 py-1 text-right">{s.percentage != null ? `${s.percentage}%` : "-"}</td>
                  <td className="px-2 py-1 text-right">{formatIDR(s.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {po.notes && (
        <div className="mb-6">
          <div className="font-semibold text-xs mb-1">Catatan</div>
          <div className="text-xs">{po.notes}</div>
        </div>
      )}

      <div className="flex justify-between mt-16">
        <SignatureBlock role="Menyetujui (Vendor)" />
        <SignatureBlock role="Dibuat oleh (Procurement)" />
      </div>
    </PrintDocumentLayout>
  );
}
