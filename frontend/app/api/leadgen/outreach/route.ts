import { NextResponse } from "next/server";
import { leadgenPool } from "@/lib/leadgen-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await leadgenPool.query(`
      SELECT
        rl.lead_id,
        rl.nama_proyek,
        rl.nama_perusahaan,
        rl.url,
        rl.industri,
        rl.kebutuhan,
        rl.lokasi,
        rl.nilai_proyek,
        pl.qualifier_score,
        pl.qualifier_priority,
        pl.is_qualified,
        pl.score_industri,
        pl.score_lokasi,
        pl.score_nilai_proyek,
        pl.score_timing,
        pl.score_breakdown_detail,
        oe.subject  AS email_subjek,
        oe.recipient AS email_kepada,
        oe.body      AS email_isi,
        oe.generated_by
      FROM raw_leads rl
      JOIN processed_leads pl ON rl.lead_id = pl.lead_id
      LEFT JOIN outreach_emails oe ON rl.lead_id = oe.lead_id
      WHERE rl.status = 'active'
      ORDER BY pl.qualifier_score DESC, rl.nilai_proyek DESC
    `);

    const MAX_INDUSTRI = 30;
    const MAX_LOKASI = 20;
    const MAX_NILAI = 30;
    const MAX_TIMING = 20;

    const leads = result.rows.map((row) => {
      const breakdown = row.score_breakdown_detail ?? {};
      return {
        leadId: row.lead_id,
        namaProyek: row.nama_proyek,
        namaPerusahaan: row.nama_perusahaan || "",
        urlTender: row.url || "",
        industri: row.industri || "",
        kebutuhan: row.kebutuhan || "",
        lokasi: row.lokasi || "",
        nilaiProyek:
          typeof row.nilai_proyek === "string"
            ? parseInt(row.nilai_proyek, 10)
            : row.nilai_proyek || 0,
        score: row.qualifier_score || 0,
        priority: row.qualifier_priority || "",
        isQualified: row.is_qualified || false,
        scoreBreakdown: {
          industri: breakdown.industri ?? {
            nilai: row.score_industri || 0,
            maks: MAX_INDUSTRI,
            label: "Industri",
          },
          lokasi: breakdown.lokasi ?? {
            nilai: row.score_lokasi || 0,
            maks: MAX_LOKASI,
            label: "Lokasi",
          },
          nilaiProyek: breakdown.nilaiProyek ?? {
            nilai: row.score_nilai_proyek || 0,
            maks: MAX_NILAI,
            label: "Nilai Proyek",
          },
          timing: breakdown.timing ?? {
            nilai: row.score_timing || 0,
            maks: MAX_TIMING,
            label: "Timing",
          },
        },
        email:
          row.email_subjek
            ? {
                subjek: row.email_subjek,
                kepada: row.email_kepada || "",
                isi: row.email_isi || "",
              }
            : null,
        generatedBy: row.generated_by || "",
      };
    });

    const qualified = leads.filter((l) => l.isQualified).length;

    return NextResponse.json({
      total: leads.length,
      qualified,
      leads,
    });
  } catch (error) {
    console.error("[API /leadgen/outreach]", error);
    return NextResponse.json(
      { error: "Failed to fetch outreach leads" },
      { status: 500 }
    );
  }
}
