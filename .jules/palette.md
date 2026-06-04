## 2024-06-04 - ARIA labels for remove player buttons
**Learning:** Icon-only buttons used to remove players or interactions were missing `aria-label` attributes making it difficult for screen readers to convey their purpose. Also, the inner SVGs lacked `aria-hidden="true"`, causing potential confusion.
**Action:** Add `aria-label` and `title` to the `<button>` and `aria-hidden="true"` to the inner `<svg>` when removing players. This is an important, reusable UX pattern for accessible icon buttons in lists.
