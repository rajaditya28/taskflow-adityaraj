import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Moon, Sun, Zap } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'

export function Navbar() {
  const { user, clearAuth } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/80 backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-950/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          to="/projects"
          className="flex items-center gap-2 font-bold text-gray-900 dark:text-white"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="tracking-tight">TaskFlow</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            title="Toggle dark mode"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {user && (
            <>
              <div className="hidden items-center gap-2 sm:flex">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
                  {initials}
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{user.name}</span>
              </div>
              <button
                onClick={() => { clearAuth(); navigate('/login') }}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
