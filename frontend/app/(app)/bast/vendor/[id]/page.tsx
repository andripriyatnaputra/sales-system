"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGetBASTVendor } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type BASTVendorItem = {
  id: number;
  item_name: string;
  qty_received: number;
  condition_notes?: string | null;
};

type BASTVendorDetail = {
  id: number;
  bast_number: string;
  po_number?: string;
  received_by_username?: string;
  received_date: string;
  status: string;
  notes?: string | null;
  items?: BASTVendorItem[];
};

const STATUS_BADGE: Record<string, string> = {
  complete: "bg-green-100 text-green-700",
  partial: "bg-amber-100 text-amber-700",
};

export default function BASTVendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [bast, setBast] = useState<BASTVendorDetail | null>(null);

  useEffect(() => {
    apiGetBASTVendor(id).then(setBast);
  }, [id]);

  if (!bast) {
    return (
      <div className="p-6">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">{bast.bast_number}</h1>
          <p className="text-muted-foreground">
            PO: {bast.po_number || "-"} — Diterima oleh {bast.received_by_username || "-"} pada {bast.received_date?.slice(0, 10)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={STATUS_BADGE[bast.status] || "bg-muted"}>{bast.status}</Badge>
          <Button variant="outline" onClick={() => window.open(`/print/bast-vendor/${bast.id}`, "_blank")}>
            Print BAST
          </Button>
          <Button variant="outline" onClick={() => router.push("/bast")}>
            Back
          </Button>
        </div>
      </div>

      {bast.notes && (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Catatan</div>
          <div className="text-sm">{bast.notes}</div>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-3">Item Diterima</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2">Item</th>
              <th className="text-right py-2">Qty Diterima</th>
              <th className="text-left py-2">Catatan Kondisi</th>
            </tr>
          </thead>
          <tbody>
            {(bast.items || []).map((it) => (
              <tr key={it.id} className="border-b">
                <td className="py-2">{it.item_name}</td>
                <td className="py-2 text-right">{it.qty_received}</td>
                <td className="py-2">{it.condition_notes || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
