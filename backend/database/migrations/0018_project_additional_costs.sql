-- 0018_project_additional_costs.sql
-- Fase 2 langkah 3: biaya/change-order di luar PO awal -- prasyarat supaya
-- Project Profitability View (langkah 4) akurat. CRUD sederhana, tanpa
-- Approval Engine, mirror budget_realization (juga tanpa approval).
-- Additive.

CREATE TABLE IF NOT EXISTS project_additional_costs (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    incurred_date DATE,
    created_by BIGINT NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_additional_costs_project ON project_additional_costs(project_id);
