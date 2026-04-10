// kitClashes.js — Kit clash data for Mentone Hockey Club
//
// Default kit: BLUE top + YELLOW socks
//
// shirtClash: opponents where blue top clashes → wear WHITE top
// sockClash:  opponents where yellow socks clash → wear BLUE socks
//
// Matching is done case-insensitively and by partial match so
// "Doncaster HC", "Doncaster Hockey Club" etc all trigger correctly.
//
// TODO: Move this data into Firestore config so it can be edited
//       without a code deploy. Seed script: node scripts/seed-clashes.js

export const SHIRT_CLASHES = [
  'Altona',
  'Bayside',
  'Brunswick',
  'Croydon Ranges',
  'Essendon',
  'Footscray',
  'Frankston',
  'Glen Eira',
  'Greater Dandenong Warriors',
  'Greensborough',
  'Hockey Geelong',
  'Maccabi',
  'Melbourne',
  'Razorbacks',
  'MCC',
  'MUHC',
  'Melbourne University',
  'North West Lightning',
  'Old Camberwell',
  'Old Carey',
  'Old East Malvern',
  'Old Melburnians',
  'Old Xaverians',
  'Powerhouse',
  'RMIT',
  'Sandringham',
  "St Bede's",
  'United Khalsa',
  'Waverley',
  'Werribee',
]

export const SOCK_CLASHES = [
  'Doncaster',
  'ECHO',
  'Frankston',
  'Gippsland',
  'Greater Dandenong',
  'Sunshine',
  'Werribee',
]

// Returns clash warnings for a given opponent string
// e.g. checkClash('Doncaster HC') → { shirt: false, socks: true }
export function checkClash(opponent) {
  if (!opponent?.trim()) return { shirt: false, socks: false }
  const opp = opponent.toLowerCase()
  const shirt = SHIRT_CLASHES.some(c => opp.includes(c.toLowerCase()))
  const socks = SOCK_CLASHES.some(c => opp.includes(c.toLowerCase()))
  return { shirt, socks }
}
