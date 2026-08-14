export type StatusColorKey =
  | 'emerald'
  | 'amber'
  | 'red'
  | 'brand'
  | 'indigo'
  | 'purple'
  | 'cyan'
  | 'slate'

export interface StatusColorDefinition {
  key: StatusColorKey
  label: string
  chipClass: string
  dotClass: string
  bgClass: string
}

export const statusColorDefinitions: StatusColorDefinition[] = [
  {
    key: 'emerald',
    label: 'Verde (Emerald)',
    chipClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    dotClass: 'bg-emerald-500',
    bgClass: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600',
  },
  {
    key: 'amber',
    label: 'Ámbar (Amber)',
    chipClass: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    dotClass: 'bg-amber-500',
    bgClass: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600',
  },
  {
    key: 'red',
    label: 'Rojo (Red)',
    chipClass: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    dotClass: 'bg-red-500',
    bgClass: 'bg-red-50 dark:bg-red-900/30 text-red-600',
  },
  {
    key: 'brand',
    label: 'Azul (Brand)',
    chipClass: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
    dotClass: 'bg-brand-500',
    bgClass: 'bg-brand-50 dark:bg-brand-900/30 text-brand-600',
  },
  {
    key: 'indigo',
    label: 'Índigo (Indigo)',
    chipClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    dotClass: 'bg-indigo-500',
    bgClass: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600',
  },
  {
    key: 'purple',
    label: 'Púrpura (Purple)',
    chipClass: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    dotClass: 'bg-purple-500',
    bgClass: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600',
  },
  {
    key: 'cyan',
    label: 'Cian (Cyan)',
    chipClass: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    dotClass: 'bg-cyan-500',
    bgClass: 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600',
  },
  {
    key: 'slate',
    label: 'Gris (Slate)',
    chipClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    dotClass: 'bg-slate-500',
    bgClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
  },
]

export const DEFAULT_STATUS_COLOR_KEY: StatusColorKey = 'emerald'

const statusColorSet = new Set<string>(statusColorDefinitions.map((item) => item.key))

export function isStatusColorKey(value: unknown): value is StatusColorKey {
  return typeof value === 'string' && statusColorSet.has(value)
}

export const statusColorMap: Record<string, string> = Object.fromEntries(
  statusColorDefinitions.map((item) => [item.key, item.chipClass]),
)

export const statusDotColorMap: Record<string, string> = Object.fromEntries(
  statusColorDefinitions.map((item) => [item.key, item.dotClass]),
)

export const statusBgMap: Record<string, string> = Object.fromEntries(
  statusColorDefinitions.map((item) => [item.key, item.bgClass]),
)
