import type { ApiAssetKpis } from '@/lib/api'

interface AssetSummaryCardsProps {
  kpis: ApiAssetKpis
}

export default function AssetSummaryCards({ kpis }: AssetSummaryCardsProps) {
  const cards = [
    {
      value: kpis.operativo,
      label: 'Activos operativos',
      sublabel: 'En servicio',
      className: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600',
    },
    {
      value: kpis.enRevision,
      label: 'En revisión',
      sublabel: 'Mantenimiento / Alerta',
      className: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600',
    },
    {
      value: kpis.fueraDeServicio,
      label: 'Fuera de servicio',
      sublabel: 'Acción requerida',
      className: 'bg-red-50 dark:bg-red-900/30 text-red-600',
    },
    {
      value: kpis.total,
      label: 'Total',
      sublabel: 'Inventario activo',
      className: 'bg-brand-50 dark:bg-brand-900/30 text-brand-600',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3"
        >
          <div className={`w-10 h-10 rounded-lg ${card.className} flex items-center justify-center text-lg font-semibold`}>
            {card.value}
          </div>
          <div>
            <div className="text-sm font-medium">{card.label}</div>
            <div className="text-xs text-slate-500">{card.sublabel}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
