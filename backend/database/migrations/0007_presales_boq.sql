-- 0007_presales_boq.sql
-- Fase 1 langkah 5: Presales Analysis + BoQ sebagai stage-gate sebelum Quotation.
-- Additive. project.sales_stage 4 = Quotation (lihat validateAndNormalizeProjectFlow
-- di helpers.go, "SPH released project must be at least Quotation stage" pakai batas
-- yang sama). Gate: project TIDAK BOLEH pindah dari stage <4 ke stage >=4 kecuali
-- presales_analyses.overall_status = 'approved' -- divalidasi di project_update.go,
-- HANYA berlaku untuk transisi baru (proyek existing yang sudah >=4 tidak kena
-- retroactive block).

CREATE TABLE IF NOT EXISTS presales_analyses (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    solution_summary TEXT,
    boq_status TEXT NOT NULL DEFAULT 'pending',
    installation_cost_status TEXT NOT NULL DEFAULT 'pending',
    installation_cost_estimate NUMERIC(18,2),
    vendor_cost_status TEXT NOT NULL DEFAULT 'pending',
    vendor_cost_estimate NUMERIC(18,2),
    pnl_status TEXT NOT NULL DEFAULT 'pending',
    recommended_price NUMERIC(18,2),
    overall_status TEXT NOT NULL DEFAULT 'draft',
    approval_request_id BIGINT REFERENCES approval_requests(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT presales_boq_status_check CHECK (boq_status IN ('pending', 'submitted')),
    CONSTRAINT presales_install_status_check CHECK (installation_cost_status IN ('pending', 'submitted')),
    CONSTRAINT presales_vendor_status_check CHECK (vendor_cost_status IN ('pending', 'submitted')),
    CONSTRAINT presales_pnl_status_check CHECK (pnl_status IN ('pending', 'submitted')),
    CONSTRAINT presales_overall_status_check CHECK (overall_status IN ('draft', 'in_progress', 'pending_approval', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS boq_items (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    unit TEXT,
    qty NUMERIC(18,2) NOT NULL DEFAULT 1,
    estimated_vendor_cost NUMERIC(18,2),
    estimated_install_cost NUMERIC(18,2),
    proposed_sell_price NUMERIC(18,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_boq_items_project ON boq_items(project_id);
CREATE INDEX IF NOT EXISTS idx_presales_analyses_project ON presales_analyses(project_id);

-- CATATAN: sengaja TIDAK seed approval_matrices untuk entity_type
-- 'presales_price_approval' di sini -- threshold nilai & role approver harga jual
-- final BELUM dikonfirmasi user. Sesuai desain Approval Engine (langkah 3), kalau
-- tidak ada matrix rule yang cocok, approval_request otomatis 'approved' tanpa
-- steps. Artinya: gate 4-bagian (BoQ/install/vendor cost/PnL wajib submitted)
-- TETAP AKTIF, tapi approval berjenjang atas harga belum benar-benar mengunci
-- sampai matrix rule realnya diisi lewat migrasi terpisah.
