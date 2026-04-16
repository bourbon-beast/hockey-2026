## 2025-03-01 - Parent Hover State with Keyboard Focus Visibility
**Learning:** Elements that rely on parent hover states to become visible (e.g., `sm:opacity-0 sm:group-hover:opacity-100`) become invisible and inaccessible when focused via keyboard navigation.
**Action:** Always include `focus-visible:opacity-100` alongside hover classes so the element remains visible when focused via keyboard navigation.
