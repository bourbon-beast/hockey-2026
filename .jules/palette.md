## 2025-05-04 - Improve Icon Button Accessibility in TeamColumn

**Learning:** When using custom icon-only buttons for critical actions (like removing a player or marking them unavailable), providing an `aria-label` is crucial for screen readers. Using `aria-hidden="true"` on the enclosed `svg` prevents redundant noise. Furthermore, adding specific `focus-visible` ring utilities ensures keyboard users have a clear visual indicator without degrading mouse interaction aesthetics. The `p-0.5` padding provides some breathing room for the focus ring outline.

**Action:** Consistently apply `aria-label`, `focus-visible:ring-2`, and `aria-hidden="true"` (on inner SVGs) to all custom icon buttons across the application's components.
