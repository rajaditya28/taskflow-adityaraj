// Package sse provides a lightweight pub/sub hub for Server-Sent Events.
// Each project has its own set of subscriber channels. When a task is
// created, updated, or deleted the task handler calls hub.Broadcast and
// every connected browser tab receives the event without polling.
package sse

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
)

// Event is the payload sent to all subscribers of a project.
type Event struct {
	Type    string `json:"type"`    // "task.created" | "task.updated" | "task.deleted"
	Payload any    `json:"payload"` // the full task object, or {id} on delete
}

// Hub manages per-project subscriber lists.
type Hub struct {
	mu   sync.RWMutex
	subs map[string][]chan Event // projectID → subscriber channels
}

func NewHub() *Hub {
	return &Hub{subs: make(map[string][]chan Event)}
}

// Subscribe registers a new channel for the given project and returns it.
func (h *Hub) Subscribe(projectID string) chan Event {
	ch := make(chan Event, 16)
	h.mu.Lock()
	h.subs[projectID] = append(h.subs[projectID], ch)
	h.mu.Unlock()
	return ch
}

// Unsubscribe removes the channel and closes it.
func (h *Hub) Unsubscribe(projectID string, ch chan Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	list := h.subs[projectID]
	for i, s := range list {
		if s == ch {
			h.subs[projectID] = append(list[:i], list[i+1:]...)
			break
		}
	}
	close(ch)
}

// Broadcast sends an event to every subscriber of the project.
// It never blocks — slow consumers are skipped.
func (h *Hub) Broadcast(projectID string, evt Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, ch := range h.subs[projectID] {
		select {
		case ch <- evt:
		default:
		}
	}
}

// ServeHTTP streams events to the client until the request context is cancelled.
// Wire it as: r.Get("/projects/{id}/events", func(w,r){ hub.ServeHTTP(w,r,id) })
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request, projectID string) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx buffering

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	ch := h.Subscribe(projectID)
	defer h.Unsubscribe(projectID, ch)

	// Send a heartbeat immediately so the client knows the connection is live.
	fmt.Fprintf(w, "event: connected\ndata: {}\n\n")
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case evt, ok := <-ch:
			if !ok {
				return
			}
			data, _ := json.Marshal(evt)
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evt.Type, data)
			flusher.Flush()
		}
	}
}
