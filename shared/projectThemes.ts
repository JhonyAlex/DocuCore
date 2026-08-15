export const projectThemeKeys = ['blue', 'emerald', 'amber', 'rose', 'slate'] as const

export type ProjectThemeKey = typeof projectThemeKeys[number]

export const projectThemeClass: Record<ProjectThemeKey, string> = {
  blue: 'from-brand-500 to-indigo-600',
  emerald: 'from-emerald-500 to-teal-600',
  amber: 'from-amber-500 to-orange-600',
  rose: 'from-purple-500 to-pink-600',
  slate: 'from-slate-600 to-slate-800',
}

export function isProjectThemeKey(value: string): value is ProjectThemeKey {
  return (projectThemeKeys as readonly string[]).includes(value)
}
