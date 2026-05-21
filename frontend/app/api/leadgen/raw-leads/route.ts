import { NextRequest, NextResponse } from "next/server";
import { leadgenPool } from "@/lib/leadgen-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await leadgenPool.query(`
      SELECT
        id,
        lead_id,
        source,
        url,
        nama_proyek,
        nama_perusahaan,
        industri,
        lokasi,
        nilai_proyek,
        deadline,
        kebutuhan,
        deskripsi_kebutuhan,
        status,
        created_at,
        updated_at
      FROM raw_leads
      WHERE status = 'active'
      ORDER BY created_at DESC
    `);

    const leads = result.rows.map((row, idx) => ({
      no: idx + 1,
      leadId: row.lead_id,
      sumber: row.source,
      namaProyek: row.nama_proyek,
      namaPerusahaan: row.nama_perusahaan || "",
      urlTender: row.url || "",
      industri: row.industri || "",
      lokasi: row.lokasi || "",
      kebutuhan: row.kebutuhan || "",
      nilaiProyek:
        typeof row.nilai_proyek === "string"
          ? parseInt(row.nilai_proyek, 10)
          : row.nilai_proyek || 0,
      deadline: row.deadline || "",
      status: row.status || "",
      deskripsi: row.deskripsi_kebutuhan || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({ total: leads.length, leads });
  } catch (error) {
    console.error("[API /leadgen/raw-leads]", error);
    return NextResponse.json(
      { error: "Failed to fetch raw leads" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { leadId, status } = await req.json();
    if (!leadId || !status) {
      return NextResponse.json({ error: "leadId and status required" }, { status: 400 });
    }
    await leadgenPool.query(
      `UPDATE raw_leads SET status = $1, updated_at = NOW() WHERE lead_id = $2`,
      [status, leadId]
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /leadgen/raw-leads PATCH]", error);
    return NextResponse.json({ error: "Failed to update lead status" }, { status: 500 });
  }
}
