// src/components/AdminView.jsx
// Admin-only page — consolidates all sync operations and management tools.
// Syncs currently live on other pages too — they'll be moved here once each
// section is built out. For now this is the shell + HV Stats sync.

import { useState } from 'react'
import { Settings, RefreshCw, Users, Calendar } from 'lucide-react'
import HvStatsSync from './admin/HvStatsSync'

const SECTIONS = [
  { id: 'hv',     label: 'HV Stats',      Icon: RefreshCw,  desc: 'Scrape match cards, review & confirm player stats' },
  { id: 'unavail',label: 'Availability',  Icon: Calendar,   desc: 'Sync unavailability from Google Sheets' },
  { id: 'ladder', label: 'Ladder',        Icon: Users,      desc: 'Update ladder positions from HV' },
]

export default function AdminView() {
  const [activeSection, setActiveSection] = useState('hv')

  return (
    <div className="space-y-4">

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

      {/* ── Section tabs ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-100">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 text-xs font-semibold border-b-2 transition-colors ${
                activeSection === s.id
                  ? 'border-blue-600 text-blue-600 bg-blue-50/40'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              <s.Icon size={16} strokeWidth={1.75} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* ── Section description ── */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
          <p className="text-xs text-slate-500">
            {SECTIONS.find(s => s.id === activeSection)?.desc}
          </p>
        </div>
      </div>

      {/* ── Section content ── */}
      {activeSection === 'hv'      && <HvStatsSync />}
      {activeSection === 'unavail' && <ComingSoon label="Availability Sync" note="Moving from Round Planner — coming soon" />}
      {activeSection === 'ladder'  && <ComingSoon label="Ladder Sync" note="Moving from Fixture view — coming soon" />}

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
