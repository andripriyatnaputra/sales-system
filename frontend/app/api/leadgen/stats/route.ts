import { NextResponse } from "next/server";
import { leadgenPool } from "@/lib/leadgen-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [rawResult, qualResult, outreachResult, breakdownResult] = await Promise.all([
      leadgenPool.query(`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(nilai_proyek), 0) AS total_nilai,
          COUNT(DISTINCT source) AS total_sources,
          COUNT(DISTINCT industri) AS total_industries
        FROM raw_leads
        WHERE status = 'active'
      `),
      leadgenPool.query(`
        SELECT COUNT(*) AS total_qualified
        FROM processed_leads
        WHERE is_qualified = TRUE
      `),
      leadgenPool.query(`
        SELECT COUNT(*) AS total_outreach
        FROM outreach_emails
        WHERE status = 'draft'
      `),
      leadgenPool.query(`
        SELECT source, industri, kebutuhan, nilai_proyek
        FROM raw_leads
        WHERE status = 'active'
      `),
    ]);

    const raw = rawResult.rows[0];
    const leads = breakdownResult.rows;

    const bySource: Record<string, number> = {};
    const byIndustry: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const lead of leads) {
      const src = lead.source || "Unknown";
      bySource[src] = (bySource[src] || 0) + 1;

      const ind = lead.industri || "Unknown";
      byIndustry[ind] = (byIndustry[ind] || 0) + 1;

      const kat = lead.kebutuhan || "Unknown";
      byCategory[kat] = (byCategory[kat] || 0) + 1;
    }

    return NextResponse.json({
      total: parseInt(raw.total, 10),
      totalNilai: parseInt(raw.total_nilai, 10),
      totalSources: parseInt(raw.total_sources, 10),
      totalIndustries: parseInt(raw.total_industries, 10),
      totalQualified: parseInt(qualResult.rows[0].total_qualified, 10),
      totalOutreach: parseInt(outreachResult.rows[0].total_outreach, 10),
      bySource,
      byIndustry,
      byCategory,
    });
  } catch (error) {
    console.error("[API /leadgen/stats]", error);
    return NextResponse.json(
      { error: "Failed to fetch leadgen stats" },
      { status: 500 }
    );
  }
}
