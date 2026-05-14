## 2024-05-24 - [XSS] DOMPurify for dangerouslySetInnerHTML
**Vulnerability:** Cross-Site Scripting (XSS) vulnerability was found in `src/components/FixtureView.jsx` where `dangerouslySetInnerHTML={{ __html: selected.html }}` was used without sanitization.
**Learning:** `dangerouslySetInnerHTML` allows direct injection of raw HTML strings into the DOM. Without proper sanitization, this exposes the application to XSS attacks, allowing malicious scripts to execute in the user's browser.
**Prevention:** Always use `DOMPurify.sanitize()` (or a similar sanitization library) to wrap any string passed into `dangerouslySetInnerHTML`.
