import { useState, useEffect } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'

// Self-contained badge — shows count of unavailability items needing review.
// Isolates Firestore listener away from App.jsx auth flow.
export default function UnavailBadge() {
  const [sheetCount, setSheetCount] = useState(0)
  const [formCount, setFormCount] = useState(0)

  useEffect(() => {
    const unsubSheet = onSnapshot(doc(db, 'config', 'unavailUnmatchedNames'), snap => {
      if (!snap.exists()) { setSheetCount(0); return }
      const names = snap.data().names || []
      setSheetCount(new Set(names.map(n => n.sheet_name)).size)
    })
    const unsubForms = onSnapshot(
      query(collection(db, 'unavailabilitySubmissions'), where('status', '==', 'pending')),
      snap => setFormCount(snap.size),
      () => setFormCount(0)
    )
    return () => {
      unsubSheet()
      unsubForms()
    }
  }, [])

  const count = sheetCount + formCount
  if (count === 0) return null

  return (
    <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
      {count}
    </span>
  )
}
