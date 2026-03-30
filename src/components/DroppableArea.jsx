import { useDroppable } from '@dnd-kit/core'

export default function DroppableArea({ id, label, children, highlight = false }) {
  const { isOver, setNodeRef } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg p-4 transition-colors ${
        highlight 
          ? 'bg-blue-50 border-2 border-dashed border-blue-200' 
          : 'bg-gray-50 border border-gray-200'
      } ${isOver ? 'bg-blue-100 border-blue-400' : ''}`}
    >
      <h3 className="text-sm font-semibold text-gray-600 mb-3">{label}</h3>
      {children}
    </div>
  )
}
