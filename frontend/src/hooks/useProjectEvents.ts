import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Subscribes to the SSE stream for a project.
 * When another tab/user creates, updates, or deletes a task the query cache
 * is invalidated so the UI updates automatically — no polling needed.
 */
export function useProjectEvents(projectId: string) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!projectId) return

    const token = localStorage.getItem('token')
    if (!token) return

    // EventSource doesn't support custom headers, so we pass the token as a
    // query param. The backend already validates it via the Auth middleware.
    const url = `/api/projects/${projectId}/events?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    }

    es.addEventListener('task.created', invalidate)
    es.addEventListener('task.updated', invalidate)
    es.addEventListener('task.deleted', invalidate)

    es.onerror = () => {
      // EventSource auto-reconnects after an error — nothing to do here.
    }

    return () => {
      es.close()
    }
  }, [projectId, qc])
}
