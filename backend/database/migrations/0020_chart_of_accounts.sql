-- 0020_chart_of_accounts.sql
-- Fase 3 Langkah 1: Chart of Accounts. Fondasi wajib sebelum General Ledger
-- (Langkah 2) bisa posting jurnal. COGS dipisah dari Expense supaya Laba
-- Rugi (Langkah 5) bisa hitung Revenue - COGS = Gross Profit, - Expense =
-- Net Income. normal_balance (debit/credit) SENGAJA tidak disimpan sebagai
-- kolom -- diturunkan di Go dari account_type, supaya tidak ada risiko data
-- tidak konsisten. Soft-delete (status) BUKAN hard delete -- akun ini akan
-- di-FK oleh journal_entry_lines begitu Langkah 2 dibangun, sama alasan
-- vendors sudah soft-delete duluan.

CREATE TABLE chart_of_accounts (
    id BIGSERIAL PRIMARY KEY,
    account_code TEXT NOT NULL UNIQUE,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    parent_id BIGINT REFERENCES chart_of_accounts(id),
    status TEXT NOT NULL DEFAULT 'active',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT coa_type_check CHECK (account_type IN ('Asset','Liability','Equity','Revenue','COGS','Expense')),
    CONSTRAINT coa_status_check CHECK (status IN ('active','inactive'))
);

CREATE INDEX idx_coa_parent ON chart_of_accounts(parent_id);

-- Seed generik standar perusahaan jasa/trading -- belum ada COA existing
-- dari akuntan, bisa disesuaikan/ditambah Finance dari UI nanti.
INSERT INTO chart_of_accounts (account_code, account_name, account_type) VALUES
    ('1000', 'Kas', 'Asset'),
    ('1100', 'Bank', 'Asset'),
    ('1200', 'Piutang Usaha', 'Asset'),
    ('1300', 'Persediaan', 'Asset'),
    ('1400', 'Uang Muka', 'Asset'),
    ('1500', 'Aset Tetap', 'Asset'),
    ('1510', 'Akumulasi Penyusutan', 'Asset'),
    ('2000', 'Utang Usaha', 'Liability'),
    ('2100', 'Utang Pajak', 'Liability'),
    ('2200', 'Uang Muka Customer', 'Liability'),
    ('2300', 'Utang Bank', 'Liability'),
    ('3000', 'Modal', 'Equity'),
    ('3100', 'Laba Ditahan', 'Equity'),
    ('4000', 'Pendapatan Jasa/Penjualan', 'Revenue'),
    ('4100', 'Pendapatan Lain-lain', 'Revenue'),
    ('5000', 'Harga Pokok Penjualan/Jasa', 'COGS'),
    ('6000', 'Beban Gaji', 'Expense'),
    ('6100', 'Beban Sewa', 'Expense'),
    ('6200', 'Beban Utilitas', 'Expense'),
    ('6300', 'Beban Operasional Lainnya', 'Expense'),
    ('6400', 'Beban Penyusutan', 'Expense'),
    ('6900', 'Beban Lain-lain', 'Expense');
