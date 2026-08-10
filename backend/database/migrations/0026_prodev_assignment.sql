ALTER TABLE projects ADD COLUMN documents_complete_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN prodev_org_unit_id BIGINT REFERENCES org_units(id);
ALTER TABLE projects ADD COLUMN prodev_assigned_at TIMESTAMPTZ;
