## 2024-05-02 - Added ARIA labels to icon-only buttons
**Learning:** Found several icon-only buttons (like delete buttons with just an SVG icon inside) without any text alternative or ARIA label.
**Action:** Added `aria-label` attributes to make these interactive elements accessible to screen readers, following the pattern: `<button aria-label="Action name" ...><svg ... /></button>`
