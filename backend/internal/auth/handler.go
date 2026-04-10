package auth

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"taskflow/internal/httputil"
	mw "taskflow/internal/middleware"
)

// jwtSecret is read once at startup — same pattern as middleware/auth.go.
var jwtSecret []byte

func init() {
	jwtSecret = []byte(os.Getenv("JWT_SECRET"))
}

type Handler struct {
	db *pgxpool.Pool
}

func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

type registerRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type userResponse struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

type authResponse struct {
	Token string       `json:"token"`
	User  userResponse `json:"user"`
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	fields := map[string]string{}
	if req.Name == "" {
		fields["name"] = "is required"
	}
	if req.Email == "" {
		fields["email"] = "is required"
	}
	if len(req.Password) < 8 {
		fields["password"] = "must be at least 8 characters"
	} else if len(req.Password) > 72 {
		fields["password"] = "must be 72 characters or fewer"
	}
	if len(fields) > 0 {
		httputil.WriteValidationError(w, fields)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		slog.Error("bcrypt failed", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	var user userResponse
	err = h.db.QueryRow(r.Context(),
		`INSERT INTO users (id, name, email, password_hash, created_at)
		 VALUES ($1, $2, $3, $4, NOW())
		 RETURNING id, name, email, created_at`,
		uuid.New().String(), req.Name, req.Email, string(hash),
	).Scan(&user.ID, &user.Name, &user.Email, &user.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "unique") {
			httputil.WriteValidationError(w, map[string]string{"email": "already in use"})
			return
		}
		slog.Error("register insert", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	token, err := signToken(user.ID, user.Email)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, authResponse{Token: token, User: user})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	fields := map[string]string{}
	if req.Email == "" {
		fields["email"] = "is required"
	}
	if req.Password == "" {
		fields["password"] = "is required"
	}
	if len(fields) > 0 {
		httputil.WriteValidationError(w, fields)
		return
	}

	var user userResponse
	var hash string
	err := h.db.QueryRow(r.Context(),
		`SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1`,
		req.Email,
	).Scan(&user.ID, &user.Name, &user.Email, &hash, &user.CreatedAt)
	if err == pgx.ErrNoRows {
		httputil.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err != nil {
		slog.Error("login query", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		httputil.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := signToken(user.ID, user.Email)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, authResponse{Token: token, User: user})
}

func signToken(userID, email string) (string, error) {
	claims := mw.Claims{
		UserID: userID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}
