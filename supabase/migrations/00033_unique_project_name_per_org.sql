-- Prevent duplicate project names within the same organisation.
-- Triggered by double-click creating two "Mittagong Townhouse Development" records.

ALTER TABLE projects ADD CONSTRAINT unique_project_name_per_org UNIQUE (org_id, name);
