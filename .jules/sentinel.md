## 2026-04-29 - Prevent XSS in Weekly Digests
**Vulnerability:** XSS via `dangerouslySetInnerHTML` rendering un-sanitized weekly digest HTML.
**Learning:** The frontend receives raw HTML for weekly digests from the database and renders it directly. If the HTML data in the database is manipulated, malicious scripts could be executed in the user's browser.
**Prevention:** Always sanitize dynamically rendered HTML content retrieved from an external source using DOMPurify before passing it to `dangerouslySetInnerHTML`.
