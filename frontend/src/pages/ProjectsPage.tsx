import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ChevronLeft, ChevronRight, FolderOpen, ArrowRight } from 'lucide-react'
import { getProjects, createProject, deleteProject } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/lib/auth'
import type { Project } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'

const PAGE_SIZE = 12

const ACCENTS = [
  { from: 'from-indigo-500', to: 'to-violet-600', shadow: 'group-hover:shadow-indigo-200 dark:group-hover:shadow-indigo-900' },
  { from: 'from-violet-500', to: 'to-purple-600', shadow: 'group-hover:shadow-violet-200 dark:group-hover:shadow-violet-900' },
  { from: 'from-blue-500', to: 'to-indigo-600', shadow: 'group-hover:shadow-blue-200 dark:group-hover:shadow-blue-900' },
  { from: 'from-emerald-500', to: 'to-teal-600', shadow: 'group-hover:shadow-emerald-200 dark:group-hover:shadow-emerald-900' },
  { from: 'from-rose-500', to: 'to-pink-600', shadow: 'group-hover:shadow-rose-200 dark:group-hover:shadow-rose-900' },
  { from: 'from-amber-500', to: 'to-orange-600', shadow: 'group-hover:shadow-amber-200 dark:group-hover:shadow-amber-900' },
  { from: 'from-cyan-500', to: 'to-blue-600', shadow: 'group-hover:shadow-cyan-200 dark:group-hover:shadow-cyan-900' },
  { from: 'from-fuchsia-500', to: 'to-violet-600', shadow: 'group-hover:shadow-fuchsia-200 dark:group-hover:shadow-fuchsia-900' },
]

function projectAccent(name: string) {
  const code = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return ACCENTS[code % ACCENTS.length]
}

function ProjectInitials({ name }: { name: string }) {
  const words = name.trim().split(/\s+/)
  const initials = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
  return <span className="text-2xl font-bold tracking-tight text-white">{initials}</span>
}

function CreateProjectModal({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => createProject({ name, description: description || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setOpen(false)
      setName('')
      setDescription('')
      toast({ title: 'Project created' })
      onCreated()
    },
    onError: (err: any) => {
      setError(err.response?.data?.fields?.name || 'Failed to create project')
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 font-semibold text-white shadow-sm hover:from-indigo-700 hover:to-violet-700">
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 pt-2">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="grid gap-1.5">
            <Label>Project name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website Redesign" autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this project about?"
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || !name.trim()}
              className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700"
            >
              {mut.isPending ? 'Creating…' : 'Create project'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['projects', page],
    queryFn: () => getProjects({ page, limit: PAGE_SIZE }),
  })

  const projects = data?.projects ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const deleteMut = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast({ title: 'Project deleted' })
    },
    onError: () => toast({ title: 'Failed to delete project', variant: 'destructive' }),
  })

  const handleDelete = (p: Project, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setConfirmDelete(p)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Good to see you,</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {user?.name} 👋
          </h1>
          {total > 0 && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {total} project{total !== 1 ? 's' : ''} in your workspace
            </p>
          )}
        </div>
        <CreateProjectModal onCreated={() => setPage(1)} />
      </div>

      {isLoading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-gray-200 bg-white overflow-hidden dark:border-gray-800 dark:bg-gray-900">
              <div className="h-24 bg-gray-200 dark:bg-gray-800" />
              <div className="p-5 space-y-3">
                <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-800" />
                <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-800/50" />
                <div className="h-3 w-4/5 rounded bg-gray-100 dark:bg-gray-800/50" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to load projects. Please refresh.
        </div>
      )}

      {!isLoading && !isError && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-24 text-center dark:border-gray-800">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/30 dark:to-violet-900/30">
            <FolderOpen className="h-8 w-8 text-indigo-400 dark:text-indigo-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">No projects yet</h3>
          <p className="mt-1 max-w-xs text-sm text-gray-500 dark:text-gray-400">
            Create your first project to start organizing tasks and collaborating with your team.
          </p>
        </div>
      )}

      {!isLoading && !isError && projects.length > 0 && (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const accent = projectAccent(p.name)
              const daysAgo = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000)
              const ageLabel = daysAgo === 0 ? 'Created today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`
              return (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className={`group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${accent.shadow} dark:border-gray-800 dark:bg-gray-900`}
                >
                  {/* Gradient header with initials */}
                  <div className={`relative flex items-end justify-between overflow-hidden bg-gradient-to-br ${accent.from} ${accent.to} px-5 pb-4 pt-6`}>
                    {/* Background blobs for depth */}
                    <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10" />
                    <div className="absolute -bottom-6 -left-4 h-16 w-16 rounded-full bg-black/10" />
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                      <ProjectInitials name={p.name} />
                    </div>
                    {p.owner_id === user?.id && (
                      <button
                        onClick={(e) => handleDelete(p, e)}
                        className="relative rounded-lg p-1.5 text-white/60 opacity-0 transition-all hover:bg-white/20 hover:text-white group-hover:opacity-100"
                        title="Delete project"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="truncate font-semibold text-gray-900 dark:text-white">{p.name}</h2>
                    {p.description ? (
                      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{p.description}</p>
                    ) : (
                      <p className="mt-1.5 text-sm italic text-gray-300 dark:text-gray-600">No description</p>
                    )}

                    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
                      <span className="text-xs text-gray-400 dark:text-gray-500">{ageLabel}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 transition-colors group-hover:text-indigo-700 dark:text-indigo-400 dark:group-hover:text-indigo-300">
                        Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete project?"
        description={confirmDelete ? `"${confirmDelete.name}" and all its tasks will be permanently deleted. This cannot be undone.` : ''}
        confirmLabel="Delete project"
        onConfirm={() => {
          if (confirmDelete) deleteMut.mutate(confirmDelete.id)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
        loading={deleteMut.isPending}
      />
    </div>
  )
}
