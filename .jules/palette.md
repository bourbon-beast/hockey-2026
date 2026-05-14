
## 2024-05-18 - Adding focus states to conditionally visible elements
**Learning:** When styling interactive elements that rely on a parent hover state to become visible (e.g., using Tailwind classes like `opacity-0 group-hover:opacity-100`), they will remain invisible when focused via keyboard navigation unless explicitly addressed.
**Action:** Always include `focus-visible:opacity-100` alongside hover-based visibility classes so the element becomes visible when focused via keyboard.
