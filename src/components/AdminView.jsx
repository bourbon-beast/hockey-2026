// Admin-only page — consolidates all sync operations and management tools.

import { useState } from 'react'
import { Settings, RefreshCw, Calendar } from 'lucide-react'
import HvStatsSync from './admin/HvStatsSync'

const SECTIONS = [
  { id: 'hv',     label: 'HV Sync',      Icon: RefreshCw, desc: 'Scrapes results, fixtures, player stats & generates weekly digest' },
  { id: 'unavail',label: 'Availability', Icon: Calendar,  desc: 'Sync unavailability from Google Sheets' },
]

export default function AdminView() {
  const [activeSection, setActiveSection] = useState('hv')
  const active = SECTIONS.find(s => s.id === activeSection)

  return (
    <div className="max-w-4xl mx-auto space-y-4">

      {/* ── Page header ── */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
          <Settings size={16} strokeWidth={1.75} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">Admin</h2>
          <p className="text-xs text-slate-400">Data sync &amp; management</p>
        </div>
      </div>

      {/* ── Layout: sidebar nav + content ── */}
      <div className="flex gap-4 items-start">

        {/* Sidebar nav */}
        <div className="w-44 flex-shrink-0 bg-white rounded-xl border border-slate-200 overflow-hidden">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors border-l-2
                ${activeSection === s.id
                  ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
            >
              <s.Icon size={14} strokeWidth={2} className="flex-shrink-0" />
              {s.label}
            </button>
          ))}
        </div>

        {/* Content panel */}
        <div className="flex-1 min-w-0 space-y-3">

          {/* Section header */}
          <div className="flex items-center gap-2">
            {active && <active.Icon size={14} strokeWidth={2} className="text-slate-400 flex-shrink-0" />}
            <p className="text-xs text-slate-500">{active?.desc}</p>
          </div>

          {/* Section content */}
          {activeSection === 'hv'      && <HvStatsSync />}
          {activeSection === 'unavail' && <ComingSoon label="Availability Sync" note="Moving from Round Planner — coming soon" />}
        </div>

      </div>
    </div>
  )
}

function ComingSoon({ label, note }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-xs text-slate-400 mt-1">{note}</p>
    </div>
  )
}
