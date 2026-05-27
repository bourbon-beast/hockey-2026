/** Shared chrome for framed admin/reference pages */
export const PAGE_PANEL_CLASSES =
  'rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-4'

export default function PageHeader({ title, description, actions }) {
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${PAGE_PANEL_CLASSES}`}
    >
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description != null && description !== '' && (
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        )}
      </div>
      {actions != null ? (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
