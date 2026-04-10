package task

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"taskflow/internal/httputil"
	mw "taskflow/internal/middleware"
	"taskflow/internal/sse"
)

type Handler struct {
	db  *pgxpool.Pool
	hub *sse.Hub
}

func NewHandler(db *pgxpool.Pool, hub *sse.Hub) *Handler {
	return &Handler{db: db, hub: hub}
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

var validStatuses = map[string]bool{"todo": true, "in_progress": true, "done": true}
var validPriorities = map[string]bool{"low": true, "medium": true, "high": true}

func parsePage(r *http.Request) (limit, offset, page int) {
	limit = 50
	page = 1
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 200 {
		limit = v
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && v > 1 {
		page = v
	}
	offset = (page - 1) * limit
	return
}

// isMemberOf returns true if userID is the project owner or is assigned to any task in the project.
func (h *Handler) isMemberOf(r *http.Request, projectID, userID string) (isOwner bool, member bool, err error) {
	var ownerID string
	err = h.db.QueryRow(r.Context(), `SELECT owner_id FROM projects WHERE id = $1`, projectID).Scan(&ownerID)
	if err != nil {
		return false, false, err
	}
	if ownerID == userID {
		return true, true, nil
	}
	var assignee bool
	h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM tasks WHERE project_id = $1 AND assignee_id = $2)`,
		projectID, userID,
	).Scan(&assignee)
	return false, assignee, nil
}

// GET /projects/:id/tasks?status=&assignee=&page=1&limit=50
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	projectID := chi.URLParam(r, "id")

	// Validate ?status= before hitting the DB — Postgres ENUM rejects unknown values with a 500.
	statusFilter := r.URL.Query().Get("status")
	if statusFilter != "" && !validStatuses[statusFilter] {
		httputil.WriteValidationError(w, map[string]string{"status": "must be todo, in_progress, or done"})
		return
	}
	assigneeFilter := r.URL.Query().Get("assignee")

	isOwner, member, err := h.isMemberOf(r, projectID, claims.UserID)
	if err == pgx.ErrNoRows {
		httputil.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		slog.Error("tasks list fetch project", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	_ = isOwner
	if !member {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	limit, offset, page := parsePage(r)

	where := "project_id = $1"
	args := []any{projectID}
	argIdx := 2

	if statusFilter != "" {
		where += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, statusFilter)
		argIdx++
	}
	if assigneeFilter != "" {
		where += fmt.Sprintf(" AND assignee_id = $%d", argIdx)
		args = append(args, assigneeFilter)
		argIdx++
	}

	var total int
	h.db.QueryRow(r.Context(), "SELECT COUNT(*) FROM tasks WHERE "+where, args...).Scan(&total)

	query := fmt.Sprintf(
		`SELECT id, title, description, status, priority, project_id, assignee_id, creator_id,
		        to_char(due_date, 'YYYY-MM-DD'), created_at, updated_at
		 FROM tasks WHERE %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d`,
		where, argIdx, argIdx+1,
	)
	args = append(args, limit, offset)

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("tasks list", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	tasks := []Task{}
	for rows.Next() {
		var t Task
		if err := rows.Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority,
			&t.ProjectID, &t.AssigneeID, &t.CreatorID, &t.DueDate, &t.CreatedAt, &t.UpdatedAt); err != nil {
			slog.Error("tasks list scan", "err", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		tasks = append(tasks, t)
	}
	if err := rows.Err(); err != nil {
		slog.Error("tasks list rows", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"tasks": tasks,
		"total": total,
		"limit": limit,
		"page":  page,
	})
}

// POST /projects/:id/tasks
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	projectID := chi.URLParam(r, "id")

	// Access check: caller must be the project owner or an existing assignee.
	_, member, err := h.isMemberOf(r, projectID, claims.UserID)
	if err == pgx.ErrNoRows {
		httputil.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		slog.Error("task create fetch project", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !member {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		Title       string  `json:"title"`
		Description *string `json:"description"`
		Status      string  `json:"status"`
		Priority    string  `json:"priority"`
		AssigneeID  *string `json:"assignee_id"`
		DueDate     *string `json:"due_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	fields := map[string]string{}
	if req.Title == "" {
		fields["title"] = "is required"
	} else if len(req.Title) > 255 {
		fields["title"] = "must be 255 characters or fewer"
	}
	if req.Status == "" {
		req.Status = "todo"
	} else if !validStatuses[req.Status] {
		fields["status"] = "must be todo, in_progress, or done"
	}
	if req.Priority == "" {
		req.Priority = "medium"
	} else if !validPriorities[req.Priority] {
		fields["priority"] = "must be low, medium, or high"
	}
	if req.DueDate != nil && *req.DueDate != "" {
		if _, err := time.Parse("2006-01-02", *req.DueDate); err != nil {
			fields["due_date"] = "must be a valid date in YYYY-MM-DD format"
		}
	}
	if len(fields) > 0 {
		httputil.WriteValidationError(w, fields)
		return
	}

	// Validate assignee_id refers to a real user.
	if req.AssigneeID != nil && *req.AssigneeID != "" {
		var exists bool
		h.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, *req.AssigneeID).Scan(&exists)
		if !exists {
			httputil.WriteValidationError(w, map[string]string{"assignee_id": "user not found"})
			return
		}
	}

	var t Task
	err = h.db.QueryRow(r.Context(),
		`INSERT INTO tasks (id, title, description, status, priority, project_id, assignee_id, creator_id, due_date, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, NOW(), NOW())
		 RETURNING id, title, description, status, priority, project_id, assignee_id, creator_id,
		           to_char(due_date, 'YYYY-MM-DD'), created_at, updated_at`,
		uuid.New().String(), req.Title, req.Description, req.Status, req.Priority,
		projectID, req.AssigneeID, claims.UserID, req.DueDate,
	).Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority,
		&t.ProjectID, &t.AssigneeID, &t.CreatorID, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		slog.Error("task create", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	h.hub.Broadcast(projectID, sse.Event{Type: "task.created", Payload: t})
	httputil.WriteJSON(w, http.StatusCreated, t)
}

// PATCH /tasks/:id — project owner or any project member may update.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	id := chi.URLParam(r, "id")

	var t Task
	err := h.db.QueryRow(r.Context(),
		`SELECT id, title, description, status, priority, project_id, assignee_id, creator_id,
		        to_char(due_date, 'YYYY-MM-DD'), created_at, updated_at
		 FROM tasks WHERE id = $1`, id,
	).Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority,
		&t.ProjectID, &t.AssigneeID, &t.CreatorID, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if err == pgx.ErrNoRows {
		httputil.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		slog.Error("task update fetch", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	_, member, err := h.isMemberOf(r, t.ProjectID, claims.UserID)
	if err != nil {
		slog.Error("task update member check", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !member {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
		Status      *string `json:"status"`
		Priority    *string `json:"priority"`
		AssigneeID  *string `json:"assignee_id"`
		DueDate     *string `json:"due_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate all provided fields before touching the DB.
	fields := map[string]string{}
	if req.Title != nil {
		if *req.Title == "" {
			fields["title"] = "must not be empty"
		} else if len(*req.Title) > 255 {
			fields["title"] = "must be 255 characters or fewer"
		}
	}
	if req.Status != nil && !validStatuses[*req.Status] {
		fields["status"] = "must be todo, in_progress, or done"
	}
	if req.Priority != nil && !validPriorities[*req.Priority] {
		fields["priority"] = "must be low, medium, or high"
	}
	if req.DueDate != nil && *req.DueDate != "" {
		if _, err := time.Parse("2006-01-02", *req.DueDate); err != nil {
			fields["due_date"] = "must be a valid date in YYYY-MM-DD format"
		}
	}
	if len(fields) > 0 {
		httputil.WriteValidationError(w, fields)
		return
	}

	// Validate assignee_id refers to a real user.
	if req.AssigneeID != nil && *req.AssigneeID != "" {
		var exists bool
		h.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, *req.AssigneeID).Scan(&exists)
		if !exists {
			httputil.WriteValidationError(w, map[string]string{"assignee_id": "user not found"})
			return
		}
	}

	// Build the SET clause only for fields that were actually provided.
	sets := []string{"updated_at = NOW()"}
	args := []any{}
	idx := 1

	if req.Title != nil {
		sets = append(sets, fmt.Sprintf("title = $%d", idx))
		args = append(args, *req.Title)
		idx++
	}
	if req.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", idx))
		args = append(args, *req.Description)
		idx++
	}
	if req.Status != nil {
		sets = append(sets, fmt.Sprintf("status = $%d", idx))
		args = append(args, *req.Status)
		idx++
	}
	if req.Priority != nil {
		sets = append(sets, fmt.Sprintf("priority = $%d", idx))
		args = append(args, *req.Priority)
		idx++
	}
	if req.AssigneeID != nil {
		sets = append(sets, fmt.Sprintf("assignee_id = $%d", idx))
		args = append(args, *req.AssigneeID)
		idx++
	}
	if req.DueDate != nil {
		sets = append(sets, fmt.Sprintf("due_date = $%d::date", idx))
		args = append(args, *req.DueDate)
		idx++
	}

	// If the body was empty, nothing to do — return the task unchanged.
	if idx == 1 {
		httputil.WriteJSON(w, http.StatusOK, t)
		return
	}

	args = append(args, id)
	query := fmt.Sprintf(
		`UPDATE tasks SET %s WHERE id = $%d
		 RETURNING id, title, description, status, priority, project_id, assignee_id, creator_id,
		           to_char(due_date, 'YYYY-MM-DD'), created_at, updated_at`,
		strings.Join(sets, ", "), idx,
	)

	err = h.db.QueryRow(r.Context(), query, args...).Scan(
		&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority,
		&t.ProjectID, &t.AssigneeID, &t.CreatorID, &t.DueDate, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		slog.Error("task update", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	h.hub.Broadcast(t.ProjectID, sse.Event{Type: "task.updated", Payload: t})
	httputil.WriteJSON(w, http.StatusOK, t)
}

// DELETE /tasks/:id — project owner or task creator.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	id := chi.URLParam(r, "id")

	var projectID string
	var creatorID *string
	err := h.db.QueryRow(r.Context(),
		`SELECT project_id, creator_id FROM tasks WHERE id = $1`, id,
	).Scan(&projectID, &creatorID)
	if err == pgx.ErrNoRows {
		httputil.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		slog.Error("task delete fetch", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	var ownerID string
	if err := h.db.QueryRow(r.Context(),
		`SELECT owner_id FROM projects WHERE id = $1`, projectID,
	).Scan(&ownerID); err != nil {
		slog.Error("task delete fetch owner", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	isOwner := ownerID == claims.UserID
	isCreator := creatorID != nil && *creatorID == claims.UserID
	if !isOwner && !isCreator {
		httputil.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	if _, err := h.db.Exec(r.Context(), `DELETE FROM tasks WHERE id = $1`, id); err != nil {
		slog.Error("task delete", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	h.hub.Broadcast(projectID, sse.Event{Type: "task.deleted", Payload: map[string]string{"id": id}})
	w.WriteHeader(http.StatusNoContent)
}
