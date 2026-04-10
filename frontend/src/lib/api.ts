import axios from 'axios'
import type { AuthResponse, Project, ProjectWithTasks, Task } from '@/types'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Auth
export const register = (data: { name: string; email: string; password: string }) =>
  api.post<AuthResponse>('/auth/register', data).then((r) => r.data)

export const login = (data: { email: string; password: string }) =>
  api.post<AuthResponse>('/auth/login', data).then((r) => r.data)

// Projects
export const getProjects = (params?: { page?: number; limit?: number }) =>
  api.get<{ projects: Project[]; total: number; limit: number }>('/projects', { params }).then((r) => r.data)

export const getProject = (id: string) =>
  api.get<ProjectWithTasks>(`/projects/${id}`).then((r) => r.data)

export const createProject = (data: { name: string; description?: string }) =>
  api.post<Project>('/projects', data).then((r) => r.data)

export const updateProject = (id: string, data: { name?: string; description?: string }) =>
  api.patch<Project>(`/projects/${id}`, data).then((r) => r.data)

export const deleteProject = (id: string) =>
  api.delete(`/projects/${id}`)

export const getProjectStats = (id: string) =>
  api.get(`/projects/${id}/stats`).then((r) => r.data)

// Tasks
export const getTasks = (projectId: string, params?: { status?: string; assignee?: string }) =>
  api.get<{ tasks: Task[] }>(`/projects/${projectId}/tasks`, { params }).then((r) => r.data.tasks)

export const createTask = (
  projectId: string,
  data: { title: string; description?: string; status?: string; priority?: string; assignee_id?: string; due_date?: string }
) => api.post<Task>(`/projects/${projectId}/tasks`, data).then((r) => r.data)

export const updateTask = (
  id: string,
  data: { title?: string; description?: string; status?: string; priority?: string; assignee_id?: string | null; due_date?: string | null }
) => api.patch<Task>(`/tasks/${id}`, data).then((r) => r.data)

export const deleteTask = (id: string) =>
  api.delete(`/tasks/${id}`)

// Users
export const listUsers = () =>
  api.get<{ users: { id: string; name: string; email: string }[] }>('/users')
    .then((r) => r.data.users)

export const getUsersByIds = (ids: string[]) =>
  api.get<{ users: { id: string; name: string; email: string }[] }>('/users/resolve', {
    params: { ids: ids.join(',') },
  }).then((r) => r.data.users)

export default api
