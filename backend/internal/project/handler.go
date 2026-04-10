package project

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"taskflow/internal/httputil"
	mw "taskflow/internal/middleware"
)

func parsePage(r *http.Request) (limit, offset, page int) {
	limit = 20
	page = 1
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 100 {
		limit = v
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && v > 1 {
		page = v
	}
	offset = (page - 1) * limit
	return
}

type Handler struct {
	db *pgxpool.Pool
}

func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

type Project struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
	OwnerID     string    `json:"owner_id"`
	CreatedAt   time.Time `json:"created_at"`
}

type ProjectWithTasks struct {
	Project
	Tasks []Task `json:"tasks"`
}

type Task struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description *string   `json:"description"`
	Status      string    `json:"status"`
	Priority    string    `json:"priority"`
	ProjectID   string    `json:"project_id"`
	AssigneeID  *string   `json:"assignee_id"`
	CreatorID   *string   `json:"creator_id"`
	DueDate     *string   `json:"due_date"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// GET /projects?page=1&limit=20
// Returns projects the current user owns or is assigned to tasks within.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	limit, offset, page := parsePage(r)

	var total int
	h.db.QueryRow(r.Context(),
		`SELECT COUNT(DISTINCT p.id) FROM projects p
		 LEFT JOIN tasks t ON t.project_id = p.id
		 WHERE p.owner_id = $1 OR t.assignee_id = $1`,
		claims.UserID,
	).Scan(&total)

	rows, err := h.db.Query(r.Context(),
		`SELECT DISTINCT p.id, p.name, p.description, p.owner_id, p.created_at
		 FROM projects p
		 LEFT JOIN tasks t ON t.project_id = p.id
		 WHERE p.owner_id = $1 OR t.assignee_id = $1
		 ORDER BY p.created_at DESC
		 LIMIT $2 OFFSET $3`,
		claims.UserID, limit, offset,
	)
	if err != nil {
		slog.Error("projects list", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	projects := []Project{}
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt); err != nil {
			slog.Error("projects list scan", "err", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		projects = append(projects, p)
	}
	if err := rows.Err(); err != nil {
		slog.Error("projects list rows", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"projects": projects,
		"total":    total,
		"limit":    limit,
		"page":     page,
	})
}

// POST /projects
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	var req struct {
		Name        string  `json:"name"`
		Description *string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		httputil.WriteValidationError(w, map[string]string{"name": "is required"})
		return
	}
	if len(req.Name) > 255 {
		httputil.WriteValidationError(w, map[string]string{"name": "must be 255 characters or fewer"})
		return
	}

	var p Project
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO projects (id, name, description, owner_id, created_at)
		 VALUES ($1, $2, $3, $4, NOW())
		 RETURNING id, name, description, owner_id, created_at`,
		uuid.New().String(), req.Name, req.Description, claims.UserID,
	).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt)
	if err != nil {
		slog.Error("project create", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, p)
}

// GET /projects/:id
// Caller must be the project owner or assigned to at least one task in the project.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	id := chi.URLParam(r, "id")

	var p ProjectWithTasks
	err := h.db.QueryRow(r.Context(),
		`SELECT id, name, description, owner_id, created_at FROM projects WHERE id = $1`, id,
	).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt)
	if err == pgx.ErrNoRows {
		httputil.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		slog.Error("project get", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Access check: owner or assignee on any task in this project.
	if p.OwnerID != claims.UserID {
		var isMember bool
		h.db.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM tasks WHERE project_id = $1 AND assignee_id = $2)`,
			id, claims.UserID,
		).Scan(&isMember)
		if !isMember {
			httputil.WriteError(w, http.StatusForbidden, "forbidden")
			return
		}
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT id, title, description, status, priority, project_id, assignee_id, creator_id,
		        to_char(due_date, 'YYYY-MM-DD'), created_at, updated_at
		 FROM tasks WHERE project_id = $1 ORDER BY created_at DESC`, id,
	)
	if err != nil {
		slog.Error("project get tasks", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	p.Tasks = []Task{}
	for rows.Next() {
		var t Task
		if err := rows.Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority,
			&t.ProjectID, &t.AssigneeID, &t.CreatorID, &t.DueDate, &t.CreatedAt, &t.UpdatedAt); err != nil {
			slog.Error("project get tasks scan", "err", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		p.Tasks = append(p.Tasks, t)
	}
	if err := rows.Err(); err != nil {
		slog.Error("project get tasks rows", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, p)
}

// PATCH /projects/:id — owner only
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	id := chi.URLParam(r, "id")

	var ownerID string
	err := h.db.QueryRow(r.Context(), `SELECT owner_id FROM projects WHERE id = $1`, id).Scan(&ownerID)
	if err == pgx.ErrNoRows {
		httputil.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		slog.Error("project update fetch", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if ownerID != claims.UserID {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name != nil {
		if *req.Name == "" {
			httputil.WriteValidationError(w, map[string]string{"name": "must not be empty"})
			return
		}
		if len(*req.Name) > 255 {
			httputil.WriteValidationError(w, map[string]string{"name": "must be 255 characters or fewer"})
			return
		}
	}

	var p Project
	err = h.db.QueryRow(r.Context(),
		`UPDATE projects SET
		   name = COALESCE($1, name),
		   description = COALESCE($2, description)
		 WHERE id = $3
		 RETURNING id, name, description, owner_id, created_at`,
		req.Name, req.Description, id,
	).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt)
	if err != nil {
		slog.Error("project update", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, p)
}

// DELETE /projects/:id — owner only, cascades to all tasks
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	id := chi.URLParam(r, "id")

	var ownerID string
	err := h.db.QueryRow(r.Context(), `SELECT owner_id FROM projects WHERE id = $1`, id).Scan(&ownerID)
	if err == pgx.ErrNoRows {
		httputil.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		slog.Error("project delete fetch", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if ownerID != claims.UserID {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	if _, err := h.db.Exec(r.Context(), `DELETE FROM projects WHERE id = $1`, id); err != nil {
		slog.Error("project delete", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /projects/:id/stats — task counts by status and by assignee
// Caller must be the project owner or a task assignee.
func (h *Handler) Stats(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	id := chi.URLParam(r, "id")

	var ownerID string
	err := h.db.QueryRow(r.Context(), `SELECT owner_id FROM projects WHERE id = $1`, id).Scan(&ownerID)
	if err == pgx.ErrNoRows {
		httputil.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		slog.Error("stats fetch project", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if ownerID != claims.UserID {
		var isMember bool
		h.db.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM tasks WHERE project_id = $1 AND assignee_id = $2)`,
			id, claims.UserID,
		).Scan(&isMember)
		if !isMember {
			httputil.WriteError(w, http.StatusForbidden, "forbidden")
			return
		}
	}

	byStatus := map[string]int{}
	rows, err := h.db.Query(r.Context(),
		`SELECT status, COUNT(*) FROM tasks WHERE project_id = $1 GROUP BY status`, id)
	if err != nil {
		slog.Error("stats by status", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			slog.Error("stats by status scan", "err", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		byStatus[status] = count
	}
	if err := rows.Err(); err != nil {
		slog.Error("stats by status rows", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	type assigneeStat struct {
		AssigneeID string `json:"assignee_id"`
		Count      int    `json:"count"`
	}
	byAssignee := []assigneeStat{}
	rows2, err := h.db.Query(r.Context(),
		`SELECT assignee_id, COUNT(*) FROM tasks
		 WHERE project_id = $1 AND assignee_id IS NOT NULL
		 GROUP BY assignee_id`, id)
	if err != nil {
		slog.Error("stats by assignee", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows2.Close()
	for rows2.Next() {
		var s assigneeStat
		if err := rows2.Scan(&s.AssigneeID, &s.Count); err != nil {
			slog.Error("stats by assignee scan", "err", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		byAssignee = append(byAssignee, s)
	}
	if err := rows2.Err(); err != nil {
		slog.Error("stats by assignee rows", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"by_status":   byStatus,
		"by_assignee": byAssignee,
	})
}
