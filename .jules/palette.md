## 2026-04-25 - Keyboard accessibility for hover-dependent elements
**Learning:** When styling interactive elements that rely on a parent hover state to become visible (e.g., using Tailwind classes like `opacity-0 group-hover:opacity-100`), they can be inaccessible to keyboard users.
**Action:** Always include `focus-visible:opacity-100` so the element remains visible when focused via keyboard navigation.
