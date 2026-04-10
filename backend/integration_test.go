package main_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"taskflow/internal/auth"
	"taskflow/internal/db"
	mw "taskflow/internal/middleware"
	"taskflow/internal/project"
	"taskflow/internal/sse"
	"taskflow/internal/task"
)

// testApp holds a running test server and its dependencies.
type testApp struct {
	server *httptest.Server
	pool   *pgxpool.Pool
}

func setupTestApp(t *testing.T) *testApp {
	t.Helper()
	ctx := context.Background()

	// Start a real postgres container
	pgContainer, err := postgres.RunContainer(ctx,
		testcontainers.WithImage("postgres:16-alpine"),
		postgres.WithDatabase("testflow"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(30*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("start postgres container: %v", err)
	}
	t.Cleanup(func() { pgContainer.Terminate(ctx) })

	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("get connection string: %v", err)
	}

	// Set env vars so db.NewPool and runMigrations can use them
	host, _ := pgContainer.Host(ctx)
	port, _ := pgContainer.MappedPort(ctx, "5432")
	os.Setenv("DB_HOST", host)
	os.Setenv("DB_PORT", port.Port())
	os.Setenv("DB_USER", "test")
	os.Setenv("DB_PASSWORD", "test")
	os.Setenv("DB_NAME", "testflow")
	os.Setenv("JWT_SECRET", "test-secret-for-integration-tests")
	_ = connStr

	pool, err := db.NewPool(ctx)
	if err != nil {
		t.Fatalf("connect to test db: %v", err)
	}
	t.Cleanup(pool.Close)

	// Run migrations (schema only — skip seed migration 000002)
	if err := runTestMigrations(connStr); err != nil && err != migrate.ErrNoChange {
		t.Fatalf("migrate: %v", err)
	}

	// Build router
	r := chi.NewRouter()
	r.Use(chimw.Recoverer)

	authH := auth.NewHandler(pool)
	projectH := project.NewHandler(pool)
	taskH := task.NewHandler(pool, sse.NewHub())

	r.Post("/auth/register", authH.Register)
	r.Post("/auth/login", authH.Login)

	r.Group(func(r chi.Router) {
		r.Use(mw.Auth)
		r.Get("/projects", projectH.List)
		r.Post("/projects", projectH.Create)
		r.Get("/projects/{id}", projectH.Get)
		r.Patch("/projects/{id}", projectH.Update)
		r.Delete("/projects/{id}", projectH.Delete)
		r.Get("/projects/{id}/tasks", taskH.List)
		r.Post("/projects/{id}/tasks", taskH.Create)
		r.Patch("/tasks/{id}", taskH.Update)
		r.Delete("/tasks/{id}", taskH.Delete)
	})

	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)

	return &testApp{server: srv, pool: pool}
}

func runTestMigrations(dsn string) error {
	// Use os.DirFS so tests don't need access to the embed.FS in main.go.
	d, err := iofs.New(os.DirFS("migrations"), ".")
	if err != nil {
		return fmt.Errorf("iofs: %w", err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", d, "postgres://"+
		os.Getenv("DB_USER")+":"+os.Getenv("DB_PASSWORD")+
		"@"+os.Getenv("DB_HOST")+":"+os.Getenv("DB_PORT")+
		"/"+os.Getenv("DB_NAME")+"?sslmode=disable")
	if err != nil {
		return err
	}
	return m.Up()
}

// doJSON is a small helper that sends a JSON request and returns the response.
func (a *testApp) doJSON(t *testing.T, method, path string, body any, token string) *http.Response {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req, err := http.NewRequest(method, a.server.URL+path, &buf)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	return resp
}

func decodeJSON(t *testing.T, resp *http.Response, out any) {
	t.Helper()
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}

// ── Tests ───────────────────────────────────────────────────────────────────

// Test 1: Register + Login end-to-end
func TestAuthRegisterAndLogin(t *testing.T) {
	app := setupTestApp(t)

	// Register
	resp := app.doJSON(t, http.MethodPost, "/auth/register", map[string]string{
		"name": "Alice", "email": "alice@test.com", "password": "password123",
	}, "")
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("register: want 201, got %d", resp.StatusCode)
	}
	var regBody struct {
		Token string `json:"token"`
		User  struct {
			ID    string `json:"id"`
			Email string `json:"email"`
		} `json:"user"`
	}
	decodeJSON(t, resp, &regBody)
	if regBody.Token == "" {
		t.Fatal("register: expected non-empty token")
	}
	if regBody.User.Email != "alice@test.com" {
		t.Fatalf("register: want email alice@test.com, got %q", regBody.User.Email)
	}

	// Login with same credentials
	resp2 := app.doJSON(t, http.MethodPost, "/auth/login", map[string]string{
		"email": "alice@test.com", "password": "password123",
	}, "")
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("login: want 200, got %d", resp2.StatusCode)
	}
	var loginBody struct{ Token string `json:"token"` }
	decodeJSON(t, resp2, &loginBody)
	if loginBody.Token == "" {
		t.Fatal("login: expected non-empty token")
	}

	// Wrong password → 401
	resp3 := app.doJSON(t, http.MethodPost, "/auth/login", map[string]string{
		"email": "alice@test.com", "password": "wrong",
	}, "")
	if resp3.StatusCode != http.StatusUnauthorized {
		t.Fatalf("bad login: want 401, got %d", resp3.StatusCode)
	}
	resp3.Body.Close()

	// Duplicate email → 400 validation error
	resp4 := app.doJSON(t, http.MethodPost, "/auth/register", map[string]string{
		"name": "Alice2", "email": "alice@test.com", "password": "password123",
	}, "")
	if resp4.StatusCode != http.StatusBadRequest {
		t.Fatalf("duplicate email: want 400, got %d", resp4.StatusCode)
	}
	resp4.Body.Close()
}

// Test 2: Unauthenticated access → 401
func TestUnauthenticatedRequests(t *testing.T) {
	app := setupTestApp(t)

	endpoints := []struct{ method, path string }{
		{"GET", "/projects"},
		{"POST", "/projects"},
	}
	for _, e := range endpoints {
		resp := app.doJSON(t, e.method, e.path, nil, "")
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("%s %s: want 401, got %d", e.method, e.path, resp.StatusCode)
		}
		resp.Body.Close()
	}
}

// Test 3: Full project + task lifecycle
func TestProjectAndTaskLifecycle(t *testing.T) {
	app := setupTestApp(t)

	// Register and get token
	resp := app.doJSON(t, http.MethodPost, "/auth/register", map[string]string{
		"name": "Bob", "email": "bob@test.com", "password": "password123",
	}, "")
	var authBody struct {
		Token string `json:"token"`
		User  struct{ ID string `json:"id"` } `json:"user"`
	}
	decodeJSON(t, resp, &authBody)
	token := authBody.Token

	// Create project
	resp = app.doJSON(t, http.MethodPost, "/projects", map[string]string{
		"name": "Test Project", "description": "integration test project",
	}, token)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create project: want 201, got %d", resp.StatusCode)
	}
	var proj struct{ ID string `json:"id"` }
	decodeJSON(t, resp, &proj)
	if proj.ID == "" {
		t.Fatal("create project: expected non-empty id")
	}

	// Create task
	resp = app.doJSON(t, http.MethodPost, "/projects/"+proj.ID+"/tasks", map[string]string{
		"title": "First Task", "priority": "high",
	}, token)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create task: want 201, got %d", resp.StatusCode)
	}
	var tsk struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	decodeJSON(t, resp, &tsk)
	if tsk.Status != "todo" {
		t.Fatalf("create task: default status want 'todo', got %q", tsk.Status)
	}

	// Update task status
	resp = app.doJSON(t, http.MethodPatch, "/tasks/"+tsk.ID, map[string]string{
		"status": "in_progress",
	}, token)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("update task: want 200, got %d", resp.StatusCode)
	}
	var updated struct{ Status string `json:"status"` }
	decodeJSON(t, resp, &updated)
	if updated.Status != "in_progress" {
		t.Fatalf("update task: want 'in_progress', got %q", updated.Status)
	}

	// List tasks — should include our task
	resp = app.doJSON(t, http.MethodGet, "/projects/"+proj.ID+"/tasks", nil, token)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list tasks: want 200, got %d", resp.StatusCode)
	}
	var taskList struct {
		Tasks []struct{ ID string `json:"id"` } `json:"tasks"`
		Total int                               `json:"total"`
	}
	decodeJSON(t, resp, &taskList)
	if taskList.Total != 1 {
		t.Fatalf("list tasks: want total=1, got %d", taskList.Total)
	}

	// Delete project — cascades to tasks
	resp = app.doJSON(t, http.MethodDelete, "/projects/"+proj.ID, nil, token)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete project: want 204, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

// Test 4: Forbidden — non-owner cannot delete project
func TestProjectOwnershipEnforced(t *testing.T) {
	app := setupTestApp(t)

	// Owner registers and creates a project
	resp := app.doJSON(t, http.MethodPost, "/auth/register", map[string]string{
		"name": "Owner", "email": "owner@test.com", "password": "password123",
	}, "")
	var ownerAuth struct{ Token string `json:"token"` }
	decodeJSON(t, resp, &ownerAuth)

	resp = app.doJSON(t, http.MethodPost, "/projects", map[string]string{"name": "Owner's Project"}, ownerAuth.Token)
	var proj struct{ ID string `json:"id"` }
	decodeJSON(t, resp, &proj)

	// Second user registers
	resp = app.doJSON(t, http.MethodPost, "/auth/register", map[string]string{
		"name": "Intruder", "email": "intruder@test.com", "password": "password123",
	}, "")
	var intruderAuth struct{ Token string `json:"token"` }
	decodeJSON(t, resp, &intruderAuth)

	// Intruder tries to delete owner's project → 403
	resp = app.doJSON(t, http.MethodDelete, "/projects/"+proj.ID, nil, intruderAuth.Token)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("foreign delete: want 403, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

// Test 5: Validation errors return structured 400
func TestValidationErrors(t *testing.T) {
	app := setupTestApp(t)

	// Missing name in register
	resp := app.doJSON(t, http.MethodPost, "/auth/register", map[string]string{
		"email": "noname@test.com", "password": "password123",
	}, "")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing name: want 400, got %d", resp.StatusCode)
	}
	var body struct {
		Error  string            `json:"error"`
		Fields map[string]string `json:"fields"`
	}
	decodeJSON(t, resp, &body)
	if body.Error != "validation failed" {
		t.Fatalf("want error='validation failed', got %q", body.Error)
	}
	if body.Fields["name"] == "" {
		t.Fatal("expected 'name' field error")
	}
}
