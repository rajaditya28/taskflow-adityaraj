import { Trash2, User, Calendar } from 'lucide-react'
import type { Task, TaskStatus } from '@/types'

const PRIORITY_CONFIG = {
  high:   { label: 'High',   border: 'border-l-rose-500',    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',             dot: 'bg-rose-500' },
  medium: { label: 'Medium', border: 'border-l-amber-400',   badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',         dot: 'bg-amber-400' },
  low:    { label: 'Low',    border: 'border-l-emerald-400', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',  dot: 'bg-emerald-400' },
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; dot: string; badge: string; next: TaskStatus }> = {
  todo:        { label: 'To Do',       dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',         next: 'in_progress' },
  in_progress: { label: 'In Progress', dot: 'bg-indigo-500',  badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',   next: 'done' },
  done:        { label: 'Done',        dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', next: 'todo' },
}

function isOverdue(due: string | null) {
  if (!due) return false
  return new Date(due) < new Date(new Date().toDateString())
}

export interface TaskCardProps {
  task: Task
  canDelete: boolean
  assigneeName?: string
  onClick: () => void
  onDelete: (taskId: string, taskTitle: string, e: React.MouseEvent) => void
  onStatusChange: (status: string) => void
  compact?: boolean
}

export function TaskCard({ task, canDelete, assigneeName, onClick, onDelete, onStatusChange, compact }: TaskCardProps) {
  const priority = PRIORITY_CONFIG[task.priority]
  const status = STATUS_CONFIG[task.status]
  const overdue = isOverdue(task.due_date)

  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer rounded-xl border-l-4 border border-gray-200 bg-white shadow-sm transition-all duration-150 hover:shadow-md hover:-translate-y-px dark:bg-gray-900 dark:border-gray-800 ${priority.border}`}
    >
      <div className={compact ? 'p-3' : 'p-4'}>
        <div className="flex items-start justify-between gap-2">
          <p className={`font-medium leading-snug text-gray-900 dark:text-white ${compact ? 'text-sm' : ''} ${task.status === 'done' ? 'line-through opacity-50' : ''}`}>
            {task.title}
          </p>
          {canDelete && (
            <button
              onClick={(e) => onDelete(task.id, task.title, e)}
              className="shrink-0 rounded-lg p-1 text-gray-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100 dark:text-gray-600 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {!compact && task.description && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{task.description}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange(status.next) }}
            title="Click to advance status"
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-all hover:opacity-75 active:scale-95 ${status.badge}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </button>

          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${priority.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} />
            {priority.label}
          </span>

          {assigneeName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              <User className="h-3 w-3" />{assigneeName}
            </span>
          )}

          {task.due_date && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
              overdue && task.status !== 'done'
                ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
            }`}>
              <Calendar className="h-3 w-3" />{task.due_date}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
