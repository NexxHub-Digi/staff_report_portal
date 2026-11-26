ALTER TABLE reports ADD COLUMN IF NOT EXISTS notification_results jsonb NOT NULL DEFAULT '[]'::jsonb;
