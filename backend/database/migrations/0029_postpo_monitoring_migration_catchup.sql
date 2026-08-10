CREATE TABLE IF NOT EXISTS project_postpo_monitoring (
    project_id BIGINT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    stage1_status TEXT NOT NULL DEFAULT 'Not Started',
    stage2_status TEXT NOT NULL DEFAULT 'Not Started',
    stage3_status TEXT NOT NULL DEFAULT 'Not Started',
    stage4_status TEXT NOT NULL DEFAULT 'Not Started',
    stage5_status TEXT NOT NULL DEFAULT 'Not Started',
    stage1_date DATE, stage2_date DATE, stage3_date DATE, stage4_date DATE, stage5_date DATE,
    stage1_note TEXT, stage2_note TEXT, stage3_note TEXT, stage4_note TEXT, stage5_note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ppm_s1 CHECK (stage1_status IN ('Not Started','In Progress','Done')),
    CONSTRAINT ppm_s2 CHECK (stage2_status IN ('Not Started','In Progress','Done')),
    CONSTRAINT ppm_s3 CHECK (stage3_status IN ('Not Started','In Progress','Done')),
    CONSTRAINT ppm_s4 CHECK (stage4_status IN ('Not Started','In Progress','Done')),
    CONSTRAINT ppm_s5 CHECK (stage5_status IN ('Not Started','In Progress','Done'))
);
