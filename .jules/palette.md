## 2024-04-23 - Focus States for Hover-only UI Elements
**Learning:** Interactive elements that use `group-hover:opacity-100` (or similar hover-triggered visibility) are inaccessible via keyboard navigation because they remain invisible or lack focus indication when tabbed into.
**Action:** When styling elements that rely on a parent hover state to become visible, always include `focus-visible:opacity-100` so the element remains visible when focused via keyboard navigation. Additionally, consider small padding (`p-0.5`) to prevent uncomfortably tight focus rings.
