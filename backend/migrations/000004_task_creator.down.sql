DROP INDEX IF EXISTS idx_tasks_creator;

ALTER TABLE tasks DROP COLUMN IF EXISTS creator_id;
