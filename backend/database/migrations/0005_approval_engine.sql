-- 0005_approval_engine.sql
-- Fase 1 langkah 3: Approval Engine generik + Approval Matrix.
-- Additive. Dipakai lintas modul MASA DEPAN (Purchase Request, Purchase Order,
-- payment_schedules, invoice, dst -- belum ada tabelnya sekarang) lewat entity_type
-- + entity_id polymorphic, bukan FK langsung ke tabel spesifik.
--
-- Konsep: approval_matrices = KONFIGURASI (untuk entity_type+departemen+rentang
-- nilai tertentu, langkah approval apa saja & role apa yang approve tiap langkah).
-- approval_requests + approval_steps = INSTANCE aktual saat sesuatu diajukan approval,
-- di-generate dari approval_matrices saat submit.
--
-- Approval berjenjang SEKUENSIAL: step_order 2 baru bisa diaksi setelah step_order 1
-- disetujui (divalidasi di kode Go, bukan constraint DB).

CREATE TABLE IF NOT EXISTS approval_matrices (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    department_id BIGINT REFERENCES departments(id), -- NULL = berlaku semua departemen
    min_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    max_amount NUMERIC(18,2), -- NULL = tanpa batas atas
    step_order INT NOT NULL,
    approver_role_id BIGINT NOT NULL REFERENCES roles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT approval_matrices_step_order_positive CHECK (step_order >= 1),
    UNIQUE (entity_type, department_id, min_amount, step_order)
);

CREATE TABLE IF NOT EXISTS approval_requests (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_label TEXT,
    amount NUMERIC(18,2),
    department_id BIGINT REFERENCES departments(id),
    requested_by BIGINT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT approval_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS approval_steps (
    id BIGSERIAL PRIMARY KEY,
    approval_request_id BIGINT NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    approver_role_id BIGINT NOT NULL REFERENCES roles(id),
    status TEXT NOT NULL DEFAULT 'pending',
    acted_by BIGINT REFERENCES users(id),
    acted_at TIMESTAMPTZ,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT approval_steps_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'skipped')),
    UNIQUE (approval_request_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_entity ON approval_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_steps_request ON approval_steps(approval_request_id);
CREATE INDEX IF NOT EXISTS idx_approval_steps_role ON approval_steps(approver_role_id, status);

-- Contoh/placeholder matrix untuk verifikasi mekanisme (entity_type='test_entity').
-- INI BUKAN kebijakan bisnis final -- saat Purchase Request/PO/Payment dibangun
-- (Fase 1 langkah 7), threshold nilai & role approver yang REAL harus dikonfirmasi
-- dulu ke user sebelum dipakai produksi.
INSERT INTO approval_matrices (entity_type, department_id, min_amount, max_amount, step_order, approver_role_id)
SELECT 'test_entity', NULL, tier.min_amount, tier.max_amount, tier.step_order, r.id
FROM (VALUES
    (0::numeric, 9999999::numeric, 1, 'sales_it_solutions_manager'),
    (10000000, 99999999, 1, 'sales_it_solutions_manager'),
    (10000000, 99999999, 2, 'product_development_gm'),
    (100000000, NULL, 1, 'sales_it_solutions_manager'),
    (100000000, NULL, 2, 'product_development_gm'),
    (100000000, NULL, 3, 'executive')
) AS tier(min_amount, max_amount, step_order, role_key)
JOIN roles r ON r.key = tier.role_key
ON CONFLICT DO NOTHING;
