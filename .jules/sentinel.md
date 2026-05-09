## 2024-05-09 - Cross-Site Scripting (XSS) in FixtureView
**Vulnerability:** Found `dangerouslySetInnerHTML={{ __html: selected.html }}` in `src/components/FixtureView.jsx` without any sanitization.
**Learning:** Data from `getDigestHistory()` (likely from Firestore or external source) is rendered directly as HTML. This exposes the application to XSS if the data source is compromised.
**Prevention:** Always sanitize dynamic HTML content using `DOMPurify.sanitize()` before rendering it via `dangerouslySetInnerHTML`.
