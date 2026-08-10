"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGetBASTCustomer } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type BASTCustomerItem = {
  id: number;
  item_name: string;
  qty_delivered: number;
  notes?: string | null;
};

type BASTCustomerDetail = {
  id: number;
  bast_number: string;
  so_number?: string;
  delivered_by_username?: string;
  delivered_date: string;
  status: string;
  customer_signatory?: string | null;
  notes?: string | null;
  items?: BASTCustomerItem[];
};

const STATUS_BADGE: Record<string, string> = {
  complete: "bg-green-100 text-green-700",
  partial: "bg-amber-100 text-amber-700",
};

export default function BASTCustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [bast, setBast] = useState<BASTCustomerDetail | null>(null);

  useEffect(() => {
    apiGetBASTCustomer(id).then(setBast);
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
            SO: {bast.so_number || "-"} — Diserahkan oleh {bast.delivered_by_username || "-"} pada {bast.delivered_date?.slice(0, 10)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={STATUS_BADGE[bast.status] || "bg-muted"}>{bast.status}</Badge>
          <Button variant="outline" onClick={() => window.open(`/print/bast-customer/${bast.id}`, "_blank")}>
            Print BAST
          </Button>
          <Button variant="outline" onClick={() => router.push("/bast")}>
            Back
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bast.customer_signatory && (
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Diterima Oleh (Customer)</div>
            <div className="text-sm font-medium">{bast.customer_signatory}</div>
          </Card>
        )}
        {bast.notes && (
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Catatan</div>
            <div className="text-sm">{bast.notes}</div>
          </Card>
        )}
      </div>

      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-3">Item Diserahterimakan</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2">Item</th>
              <th className="text-right py-2">Qty Diserahkan</th>
              <th className="text-left py-2">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {(bast.items || []).map((it) => (
              <tr key={it.id} className="border-b">
                <td className="py-2">{it.item_name}</td>
                <td className="py-2 text-right">{it.qty_delivered}</td>
                <td className="py-2">{it.notes || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
