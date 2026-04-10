import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Moon, Sun, Zap, CheckCircle2, BarChart3, Users } from 'lucide-react'
import { register as registerUser } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})
type FormData = z.infer<typeof schema>

const features = [
  { icon: CheckCircle2, text: 'Organize tasks with priorities and deadlines' },
  { icon: BarChart3, text: 'Track progress across projects in real-time' },
  { icon: Users, text: 'Collaborate and assign tasks to teammates' },
]

export function RegisterPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuth()
  const { theme, toggle } = useTheme()
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setServerError('')
    try {
      const res = await registerUser(data)
      setAuth(res.user, res.token)
      navigate('/projects')
    } catch (err: any) {
      const fields = err.response?.data?.fields
      if (fields?.email) {
        setServerError(`Email ${fields.email}`)
      } else {
        setServerError(err.response?.data?.error || 'Registration failed. Please try again.')
      }
    }
  }

  return (
    <div className="flex min-h-screen bg-white dark:bg-gray-950">
      {/* Left panel — brand */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-10 lg:flex lg:w-[45%]">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white" />
          <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-white" />
          <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white">TaskFlow</span>
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h2 className="text-3xl font-bold leading-tight text-white">
              Get started<br />in seconds.
            </h2>
            <p className="mt-3 text-indigo-200">
              Join teams who trust TaskFlow to ship their best work.
            </p>
          </div>

          <ul className="space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <Icon className="h-3 w-3 text-white" />
                </div>
                <span className="text-sm text-indigo-100">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-indigo-300">
          © {new Date().getFullYear()} TaskFlow. Built for speed.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-12">
        <button
          onClick={toggle}
          title="Toggle dark mode"
          className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-white">TaskFlow</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Create your account
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Start managing your tasks for free
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {serverError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                {serverError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-gray-300">Full name</Label>
              <Input
                id="name"
                {...register('name')}
                placeholder="Jane Doe"
                autoComplete="name"
                className="h-10"
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">Work email</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                placeholder="you@company.com"
                autoComplete="email"
                className="h-10"
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</Label>
              <Input
                id="password"
                type="password"
                {...register('password')}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                className="h-10"
              />
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              className="h-10 w-full bg-gradient-to-r from-indigo-600 to-violet-600 font-semibold text-white hover:from-indigo-700 hover:to-violet-700"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating account…' : 'Create free account'}
            </Button>

            <p className="text-center text-xs text-gray-400 dark:text-gray-500">
              By signing up you agree to our Terms of Service.
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
