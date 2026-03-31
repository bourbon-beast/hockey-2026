## 2024-11-13 - Added ARIA labels to modal close buttons
**Learning:** Found multiple modals in the React codebase (`AllPlayers.jsx`, `PlayerModal.jsx`, `RoundPlanner.jsx`, `UnavailabilityManager.jsx`) that used a simple text '×' as the close button, which is not screen reader friendly.
**Action:** When adding or reviewing modal components, always verify that the close button has an `aria-label` attribute such as "Close modal" to maintain accessibility.
