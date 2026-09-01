import { formatApiDate, formatDocumentSize } from '@/lib/assetMappers'
import type { ApiDocumentDetail, ApiDocumentVersion } from '@/lib/api'

interface DocumentVersionsListProps {
  currentVersion: ApiDocumentVersion | null
  detail: ApiDocumentDetail | null
  activeTargetKey: string
  previewingTarget: string | null
  saving: boolean
  readOnly?: boolean
  onSelectCurrent: () => void
  onSelectVersion: (version: ApiDocumentDetail['versions'][number]) => void
  onSelectAttachment: (versionNumber: number, attachment: { id: number; originalName: string; mimeType: string }) => void
  onDownloadVersion: (versionNumber?: number) => void
  onDownloadAttachment: (versionNumber: number, attachmentId: number) => void
  onUploadNewVersion: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export default function DocumentVersionsList({
  currentVersion,
  detail,
  activeTargetKey,
  previewingTarget,
  saving,
  readOnly,
  onSelectCurrent,
  onSelectVersion,
  onSelectAttachment,
  onDownloadVersion,
  onDownloadAttachment,
  onUploadNewVersion,
}: DocumentVersionsListProps) {
  const versions = detail?.versions ?? (currentVersion ? [currentVersion] : [])
  const currentVerNum = currentVersion?.version ?? 1

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Historial de versiones
        </h3>
        {!readOnly && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-950/30 px-2.5 py-1 text-xs font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-100/70 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Subir nueva versión</span>
            <input
              type="file"
              multiple
              aria-label="Nueva versión"
              accept=".pdf,.xlsx,.xls,.txt,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain,image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                onUploadNewVersion(e)
                e.currentTarget.value = ''
              }}
              disabled={saving}
              className="sr-only"
            />
          </label>
        )}
      </div>

      {versions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center text-xs text-slate-400">
          Sin versiones registradas.
        </div>
      ) : (
        <ul className="space-y-2">
          {versions.map((ver) => {
            const isCurrent = ver.version === currentVerNum
            const verTargetKey = isCurrent ? 'current' : `v-${ver.version}`
            const isSelected = activeTargetKey === verTargetKey
            const isTargetBusy = previewingTarget === `v-${ver.version}`
            const attachments = ver.attachments ?? []

            return (
              <li
                key={ver.id}
                className={`rounded-lg border p-3 transition-all ${
                  isSelected
                    ? 'border-brand-500 bg-brand-50/40 dark:bg-brand-950/20 dark:border-brand-600 shadow-sm'
                    : isCurrent
                      ? 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                        v{ver.version}
                      </span>
                      {isCurrent ? (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          Vigente
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800">
                          Histórica
                        </span>
                      )}
                      <span className="truncate text-xs text-slate-600 dark:text-slate-400" title={ver.originalName}>
                        · {ver.originalName}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDocumentSize(ver.sizeBytes)} · Subido {formatApiDate(ver.uploadedAt)}
                      {ver.expiryDate && ` · Vence ${formatApiDate(ver.expiryDate)}`}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Ver versión ${ver.version}`}
                      disabled={isTargetBusy}
                      onClick={() => (isCurrent ? onSelectCurrent() : onSelectVersion(ver))}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        isSelected
                          ? 'bg-brand-600 text-white'
                          : 'text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40'
                      } disabled:opacity-40`}
                    >
                      {isTargetBusy ? 'Cargando…' : isSelected ? 'Viendo' : 'Ver'}
                    </button>
                    <button
                      type="button"
                      aria-label={`Descargar versión ${ver.version}`}
                      onClick={() => onDownloadVersion(isCurrent ? undefined : ver.version)}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      title="Descargar versión"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                  </div>
                </div>

                {attachments.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      Archivos complementarios ({attachments.length}):
                    </div>
                    <ul className="space-y-1 pl-1">
                      {attachments.map((att) => {
                        const attKey = `v-${ver.version}-att-${att.id}`
                        const isAttSelected = activeTargetKey === attKey
                        const isAttBusy = previewingTarget === attKey

                        return (
                          <li
                            key={att.id}
                            className={`flex items-center justify-between gap-2 px-2 py-1 rounded text-xs transition-colors ${
                              isAttSelected
                                ? 'bg-brand-100/60 text-brand-900 dark:bg-brand-950/40 dark:text-brand-300'
                                : 'bg-slate-100/60 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="truncate flex-1" title={att.originalName}>
                              📎 {att.originalName}
                            </span>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                aria-label={`Ver ${att.originalName}`}
                                disabled={isAttBusy}
                                onClick={() => onSelectAttachment(ver.version, att)}
                                className={`text-[11px] font-medium ${
                                  isAttSelected
                                    ? 'text-brand-700 font-semibold'
                                    : 'text-brand-600 hover:underline'
                                } disabled:opacity-40`}
                              >
                                {isAttBusy ? '…' : isAttSelected ? 'Viendo' : 'Ver'}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDownloadAttachment(ver.version, att.id)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                                title={`Descargar ${att.originalName}`}
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
