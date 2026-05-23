## 2025-02-28 - Add ARIA Labels and Titles to Icon-only Buttons
**Learning:** Icon-only SVG buttons lacking aria labels create an accessibility blindspot for screen readers. Using inner SVGs with `aria-hidden="true"` prevents redundant announcements.
**Action:** When adding icon-only SVG buttons in components like `TeamColumn`, explicitly add `title` and `aria-label` attributes to the button container, and apply `aria-hidden="true"` to the inner SVG element.
