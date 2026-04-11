import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

const STORAGE_KEY = 'taskflow_hint_board_seen'
const DELAY_MS = 3000 // show after 3 seconds

export function useBoardHint() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return
    const timer = setTimeout(() => setVisible(true), DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  return { visible, dismiss }
}

export function BoardViewHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="absolute right-0 top-full z-50 mt-3 w-56">
      {/* Arrow pointing up toward the board toggle */}
      <div className="absolute -top-1.5 right-3 h-3 w-3 rotate-45 border-l border-t border-indigo-200 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950" />

      <div className="relative rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-3 shadow-lg dark:border-indigo-700 dark:bg-indigo-950">
        <button
          onClick={onDismiss}
          className="absolute right-2 top-2 rounded p-0.5 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <p className="pr-4 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
          Try Board view
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-indigo-600/80 dark:text-indigo-400">
          Drag & drop tasks across columns for a Kanban-style workflow.
        </p>
      </div>
    </div>
  )
}
