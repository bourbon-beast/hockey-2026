## 2025-02-18 - Added ARIA labels to Remove Player buttons
**Learning:** Found an accessibility issue pattern where icon-only SVG buttons in team columns lacked `aria-label` or `title` attributes, making them inaccessible to screen readers.
**Action:** Applied standard ARIA attributes (`aria-label`, `title` on the `<button>`) and added `aria-hidden="true"` to the inner `<svg>` icon to prevent redundant/confusing announcements by screen readers.
