import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTask, updateTask, listUsers } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import type { Task } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
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

interface Props {
  open: boolean
  onClose: () => void
  projectId: string
  task?: Task | null
}

export function TaskModal({ open, onClose, projectId, task }: Props) {
  const qc = useQueryClient()

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: listUsers,
    staleTime: 60_000,
  })

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      status: 'todo',
      priority: 'medium',
      due_date: '',
      assignee_id: '',
    },
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
    } else {
      reset({ title: '', description: '', status: 'todo', priority: 'medium', due_date: '', assignee_id: '' })
    }
  }, [task, reset, open])

  const createMut = useMutation({
    mutationFn: (data: FormData) =>
      createTask(projectId, {
        ...data,
        description: data.description || undefined,
        due_date: data.due_date || undefined,
        assignee_id: data.assignee_id || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      toast({ title: 'Task created' })
      onClose()
    },
    onError: () => toast({ title: 'Failed to create task', variant: 'destructive' }),
  })

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

  const onSubmit = (data: FormData) => {
    task ? updateMut.mutate(data) : createMut.mutate(data)
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 pt-2">
          {/* Title */}
          <div className="grid gap-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" {...register('title')} placeholder="Task title" />
            {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div className="grid gap-1.5">
            <Label htmlFor="description">Description <span className="text-xs font-normal text-gray-400">(optional)</span></Label>
            <textarea
              id="description"
              {...register('description')}
              placeholder="Add details, context, or acceptance criteria…"
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Assignee dropdown */}
          <div className="grid gap-1.5">
            <Label>Assignee</Label>
            <Controller
              name="assignee_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-gray-400">Unassigned</span>
                    </SelectItem>
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
              )}
            />
          </div>

          {/* Due date */}
          <div className="grid gap-1.5">
            <Label htmlFor="due_date">Due Date</Label>
            <Input id="due_date" type="date" {...register('due_date')} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700"
            >
              {isPending ? 'Saving…' : task ? 'Save Changes' : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
