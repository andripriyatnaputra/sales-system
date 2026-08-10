-- 0021_general_ledger.sql
-- Fase 3 Langkah 2: General Ledger + jurnal manual. journal_entries sekali
-- diposting bersifat IMMUTABLE (tidak ada Update/Delete di handler) --
-- koreksi lewat jurnal pembalik/adjusting baru, bukan edit sejarah.
--
-- source_type/source_id disiapkan sekarang (default 'manual') supaya
-- Langkah 3 (auto-posting dari BAST vendor/bayar vendor/invoice) tidak
-- perlu migrasi tambahan lagi. source_id BIGINT (bukan TEXT seperti
-- approval_requests.entity_id) -- mengikuti pola payment_schedules.parent_id,
-- karena bakal menunjuk PK numerik satu tabel sumber, bukan generik lintas
-- banyak entity_type sekaligus.
--
-- FK account_id/project_id SENGAJA tanpa ON DELETE (default RESTRICT) --
-- riwayat jurnal tidak boleh rusak/hilang diam-diam kalau akun/project
-- masih direferensikan.

CREATE TABLE journal_entries (
    id BIGSERIAL PRIMARY KEY,
    entry_number TEXT NOT NULL UNIQUE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_id BIGINT,
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE journal_entry_lines (
    id BIGSERIAL PRIMARY KEY,
    journal_entry_id BIGINT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES chart_of_accounts(id),
    project_id BIGINT REFERENCES projects(id),
    debit NUMERIC(18,2) NOT NULL DEFAULT 0,
    credit NUMERIC(18,2) NOT NULL DEFAULT 0,
    memo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT jel_debit_xor_credit CHECK (
        (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
    )
);

CREATE INDEX idx_jel_entry ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_jel_account ON journal_entry_lines(account_id);
CREATE INDEX idx_jel_project ON journal_entry_lines(project_id);
