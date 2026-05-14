## 2025-02-20 - Prevent XSS in HTML rendering
**Vulnerability:** Unsanitized HTML rendering via `dangerouslySetInnerHTML` in `src/components/FixtureView.jsx` (rendering `selected.html`).
**Learning:** Dynamic HTML strings, even if seemingly internal (like fetched round summaries), can be a vector for XSS if not properly sanitized before injection.
**Prevention:** Always use `DOMPurify.sanitize()` to wrap any dynamic HTML payload passed to `dangerouslySetInnerHTML`.
