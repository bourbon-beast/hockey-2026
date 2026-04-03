## 2025-05-18 - Icon-only Button Accessibility
**Learning:** Icon-only buttons (like the cross to remove a player or chevrons for navigation) must have descriptive ARIA labels to be usable by screen readers. Furthermore, the label must provide context. Simply "Remove" is not enough; it needs to be "Remove [Player Name] from squad" so the user knows exactly what action will be taken.
**Action:** Always add contextual `aria-label` attributes to any icon-only button, especially in list/grid views where multiple similar buttons exist.
