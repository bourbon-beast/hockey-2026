
## 2026-04-26 - Focus Visible with Hover Opacity
**Learning:** Interactive elements with `opacity-0 group-hover:opacity-100` become invisible when navigated to via keyboard unless `focus-visible:opacity-100` is added. Icon-only buttons should also have appropriate aria-labels.
**Action:** Add `focus-visible:opacity-100` and aria-labels to hidden hover buttons, such as the remove player buttons in the squad planner.
