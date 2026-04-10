import { useState, useCallback } from 'react'

type ToastVariant = 'default' | 'destructive'

interface Toast {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
}

let toastId = 0

// Simple global singleton so toast() can be called anywhere
const listeners: Array<(toasts: Toast[]) => void> = []
let globalToasts: Toast[] = []

function notify(toasts: Toast[]) {
  globalToasts = toasts
  listeners.forEach((l) => l(toasts))
}

export function toast(opts: Omit<Toast, 'id'>) {
  const id = String(++toastId)
  notify([...globalToasts, { ...opts, id }])
  setTimeout(() => {
    notify(globalToasts.filter((t) => t.id !== id))
  }, 4000)
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(globalToasts)

  // Subscribe on mount, unsubscribe on unmount
  useState(() => {
    listeners.push(setToasts)
    return () => {
      const idx = listeners.indexOf(setToasts)
      if (idx > -1) listeners.splice(idx, 1)
    }
  })

  const dismiss = useCallback((id: string) => {
    notify(globalToasts.filter((t) => t.id !== id))
  }, [])

  return { toasts, toast, dismiss }
}
