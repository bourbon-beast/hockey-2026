## 2026-05-04 - Fix XSS in FixtureView
**Vulnerability:** Raw HTML from `selected.html` was being rendered directly using React's `dangerouslySetInnerHTML` in `FixtureView.jsx` without sanitization.
**Learning:** When fetching dynamic content (like digests) that may contain HTML, failing to sanitize it before rendering opens up the application to Cross-Site Scripting (XSS) attacks, even if the source is presumed safe (like a database).
**Prevention:** Always use a robust HTML sanitizer like `dompurify` (`DOMPurify.sanitize(html)`) when using `dangerouslySetInnerHTML` to render dynamic HTML content.
