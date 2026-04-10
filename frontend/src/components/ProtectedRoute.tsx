import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { Navbar } from './Navbar'

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[#0a0a0f]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
