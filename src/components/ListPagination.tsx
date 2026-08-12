export default function ListPagination({ page, totalPages, total, limit, onPageChange }: { page: number; totalPages: number; total: number; limit: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null
  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  return <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800">
    <span className="text-slate-500 dark:text-slate-400">Mostrando {start}-{end} de {total} resultados</span>
    <div className="flex items-center gap-1"><button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1} className="rounded-md px-3 py-1.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800">Anterior</button><span className="px-2 text-slate-500">{page} / {totalPages}</span><button type="button" onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className="rounded-md px-3 py-1.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800">Siguiente</button></div>
  </div>
}
