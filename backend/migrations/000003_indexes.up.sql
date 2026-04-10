-- Composite index to speed up the most common filtered query:
-- SELECT ... FROM tasks WHERE project_id = $1 AND status = $2
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
