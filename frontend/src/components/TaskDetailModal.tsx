import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Pencil, Calendar, User, Flag, Circle, Clock, CheckCircle2, RefreshCw, CalendarPlus,
} from 'lucide-react'
import { updateTask, listUsers } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import type { Task } from '@/types'
import { Dialog, DialogContent } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done']),
  priority: z.enum(['low', 'medium', 'high']),
  due_date: z.string().optional(),
  assignee_id: z.string().optional(),
})
type FormData = z.infer<typeof schema>

const PRIORITY_CONFIG = {
  high:   { label: 'High',   badge: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',     dot: 'bg-rose-500',   border: 'border-rose-200 dark:border-rose-800' },
  medium: { label: 'Medium', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', dot: 'bg-amber-400',  border: 'border-amber-200 dark:border-amber-800' },
  low:    { label: 'Low',    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', dot: 'bg-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
}

const STATUS_CONFIG = {
  todo:        { label: 'To Do',       icon: Circle,       iconClass: 'text-slate-400',   badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  in_progress: { label: 'In Progress', icon: Clock,        iconClass: 'text-indigo-500',  badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  done:        { label: 'Done',        icon: CheckCircle2, iconClass: 'text-emerald-500', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
}

interface Props {
  task: Task | null
  open: boolean
  onClose: () => void
  projectId: string
  assigneeName?: string
}

export function TaskDetailModal({ task, open, onClose, projectId, assigneeName }: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const qc = useQueryClient()

  // Reset to view mode whenever a different task is opened
  useEffect(() => {
    if (open) setMode('view')
  }, [open, task?.id])

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: listUsers,
    staleTime: 60_000,
  })

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (task) {
      reset({
        title: task.title,
        description: task.description ?? '',
        status: task.status,
        priority: task.priority,
        due_date: task.due_date ?? '',
        assignee_id: task.assignee_id ?? '',
      })
    }
  }, [task, reset])

  const updateMut = useMutation({
    mutationFn: (data: FormData) =>
      updateTask(task!.id, {
        ...data,
        description: data.description || undefined,
        due_date: data.due_date || null,
        assignee_id: data.assignee_id || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      toast({ title: 'Task updated' })
      onClose()
    },
    onError: () => toast({ title: 'Failed to update task', variant: 'destructive' }),
  })

  if (!task) return null

  const priority = PRIORITY_CONFIG[task.priority]
  const status = STATUS_CONFIG[task.status]
  const StatusIcon = status.icon
  const isOverdue = task.due_date && new Date(task.due_date) < new Date(new Date().toDateString()) && task.status !== 'done'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Priority stripe across the top */}
        <div className={`h-1.5 w-full bg-gradient-to-r ${
          task.priority === 'high' ? 'from-rose-500 to-rose-400' :
          task.priority === 'medium' ? 'from-amber-400 to-amber-300' :
          'from-emerald-400 to-emerald-300'
        }`} />

        {mode === 'view' ? (
          // ── View mode ──────────────────────────────────────────────────────
          <div className="p-6">
            {/* Header */}
            <div className="mb-5 flex items-start justify-between gap-3">
              <h2 className={`text-lg font-semibold leading-snug text-gray-900 dark:text-white ${task.status === 'done' ? 'line-through opacity-60' : ''}`}>
                {task.title}
              </h2>
              <button
                onClick={() => setMode('edit')}
                className="mr-6 flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-700 dark:text-gray-400 dark:hover:border-indigo-700 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300"
                title="Edit task"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            </div>

            {/* Description */}
            {task.description ? (
              <p className="mb-5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{task.description}</p>
            ) : (
              <p className="mb-5 text-sm italic text-gray-300 dark:text-gray-600">No description</p>
            )}

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-3">
              <MetaField icon={<Circle className="h-3.5 w-3.5" />} label="Status">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.badge}`}>
                  <StatusIcon className={`h-3 w-3 ${status.iconClass}`} />
                  {status.label}
                </span>
              </MetaField>

              <MetaField icon={<Flag className="h-3.5 w-3.5" />} label="Priority">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${priority.badge}`}>
                  <span className={`h-2 w-2 rounded-full ${priority.dot}`} />
                  {priority.label}
                </span>
              </MetaField>

              <MetaField icon={<User className="h-3.5 w-3.5" />} label="Assignee">
                {assigneeName ? (
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[9px] font-bold text-white">
                      {assigneeName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{assigneeName}</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 dark:text-gray-500">Unassigned</span>
                )}
              </MetaField>

              <MetaField icon={<Calendar className="h-3.5 w-3.5" />} label="Due Date">
                {task.due_date ? (
                  <span className={`text-sm font-medium ${isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {isOverdue ? '⚠ ' : ''}{task.due_date}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400 dark:text-gray-500">No due date</span>
                )}
              </MetaField>

              <MetaField icon={<CalendarPlus className="h-3.5 w-3.5" />} label="Created">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </MetaField>

              <MetaField icon={<RefreshCw className="h-3.5 w-3.5" />} label="Last updated">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(task.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </MetaField>
            </div>
          </div>
        ) : (
          // ── Edit mode ──────────────────────────────────────────────────────
          <form onSubmit={handleSubmit((d) => updateMut.mutate(d))} className="p-6">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Edit Task</h2>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="edit-title">Title *</Label>
                <Input id="edit-title" {...register('title')} placeholder="Task title" />
                {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="edit-desc">Description <span className="text-xs font-normal text-gray-400">(optional)</span></Label>
                <textarea
                  id="edit-desc"
                  {...register('description')}
                  placeholder="Add details, context, or acceptance criteria…"
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Controller name="status" control={control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">To Do</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Priority</Label>
                  <Controller name="priority" control={control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label>Assignee</Label>
                <Controller name="assignee_id" control={control} render={({ field }) => (
                  <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__"><span className="text-gray-400">Unassigned</span></SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          <div className="flex items-center gap-2">
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-bold text-white">
                              {u.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <span>{u.name}</span>
                            <span className="text-xs text-gray-400">{u.email}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="edit-due">Due Date</Label>
                <Input id="edit-due" type="date" {...register('due_date')} />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setMode('view')}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMut.isPending}
                className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700"
              >
                {updateMut.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function MetaField({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/50">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500">
        {icon}
        {label}
      </div>
      {children}
    </div>
  )
}
