package user

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"taskflow/internal/httputil"
)

type Handler struct {
	db *pgxpool.Pool
}

func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

type User struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

// GET /users — lists all users (for assignee dropdown)
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(),
		"SELECT id, name, email, created_at FROM users ORDER BY name ASC")
	if err != nil {
		slog.Error("users list", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	users := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt); err != nil {
			slog.Error("users list scan", "err", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		users = append(users, u)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"users": users})
}

// GET /users/resolve?ids=uuid1,uuid2 — resolves user IDs to names for the frontend.
func (h *Handler) GetByIDs(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("ids")
	if raw == "" {
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"users": []User{}})
		return
	}

	parts := strings.Split(raw, ",")
	ids := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			ids = append(ids, t)
		}
	}
	if len(ids) == 0 {
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"users": []User{}})
		return
	}

	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	query := "SELECT id, name, email, created_at FROM users WHERE id IN (" +
		strings.Join(placeholders, ",") + ")"

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("users by ids", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer rows.Close()

	users := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt); err != nil {
			slog.Error("users scan", "err", err)
			httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		users = append(users, u)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"users": users})
}
