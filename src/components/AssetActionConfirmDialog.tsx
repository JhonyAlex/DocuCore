import ConfirmDialog from '@/components/ConfirmDialog'
import type { ApiAsset } from '@/lib/api'

export type AssetConfirmedAction =
  | { kind: 'decommission'; statusId: number }
  | { kind: 'delete' }

interface AssetActionConfirmDialogProps {
  asset: ApiAsset
  action: AssetConfirmedAction | null
  busy: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

export default function AssetActionConfirmDialog({ asset, action, busy, error, onConfirm, onCancel }: AssetActionConfirmDialogProps) {
  const deleting = action?.kind === 'delete'

  return (
    <ConfirmDialog
      open={action !== null}
      title={deleting ? 'Eliminar activo' : 'Dar de baja el activo'}
      message={deleting
        ? <>El activo <span className="font-medium text-slate-900 dark:text-slate-100">{asset.code} · {asset.name}</span> se moverá a la papelera y podrá recuperarse durante 30 días. ¿Continuar?</>
        : <>El activo <span className="font-medium text-slate-900 dark:text-slate-100">{asset.code} · {asset.name}</span> pasará a «Fuera de servicio». ¿Continuar?</>
      }
      confirmLabel={deleting ? 'Eliminar' : 'Dar de baja'}
      busyLabel={deleting ? 'Eliminando…' : 'Dando de baja…'}
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
      variant="danger"
    />
  )
}
