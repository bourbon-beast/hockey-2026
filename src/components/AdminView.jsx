// Admin-only page — consolidates all sync operations and management tools.

import { useState } from 'react'
import { Calendar, RefreshCw, Users } from 'lucide-react'
import HvStatsSync from './admin/HvStatsSync'
import AvailabilitySync from './admin/AvailabilitySync'
import AllowedUsersAdmin from './admin/AllowedUsersAdmin'
import PageHeader from './PageHeader'

const SECTIONS = [
  { id: 'hv',     label: 'HV Sync',      Icon: RefreshCw, desc: 'Scrapes results, fixtures, player stats & generates weekly digest' },
  { id: 'unavail',label: 'Availability', Icon: Calendar,  desc: 'Review player form submissions and sync unavailability from Google Sheets' },
  { id: 'users',  label: 'Users',        Icon: Users,     desc: 'Manage emails allowed to access the tracker' },
]

export default function AdminView() {
  const [activeSection, setActiveSection] = useState('hv')
  const active = SECTIONS.find(s => s.id === activeSection)

  return (
    <div className="w-full space-y-4">

      <PageHeader title="Admin" description="Data sync & management" />

      {/* ── Layout: sidebar nav + content ── */}
      <div className="flex flex-col gap-4 items-stretch sm:flex-row sm:items-start">

        {/* Sidebar nav */}
        <div className="w-full sm:w-44 flex-shrink-0 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
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
          {activeSection === 'unavail' && <AvailabilitySync />}
          {activeSection === 'users'   && <AllowedUsersAdmin />}
        </div>

      </div>
    </div>
  )
}
