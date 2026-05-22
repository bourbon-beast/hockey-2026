## 2026-05-22 - Fix XSS Vulnerability in FixtureView
**Vulnerability:** Cross-Site Scripting (XSS) vulnerability via dangerouslySetInnerHTML
**Learning:** Raw HTML derived from external sources (e.g. Firestore) was being rendered without sanitization.
**Prevention:** Always use DOMPurify.sanitize() when rendering HTML with dangerouslySetInnerHTML in React.
