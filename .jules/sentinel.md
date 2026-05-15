## 2025-05-15 - Prevent XSS in FixtureView Weekly Digest
**Vulnerability:** Cross-Site Scripting (XSS) vulnerability found in `src/components/FixtureView.jsx` where dynamically generated `selected.html` was passed directly into React's `dangerouslySetInnerHTML`.
**Learning:** Unsanitized HTML from external sources (e.g., Firestore sync digests) directly rendered via `dangerouslySetInnerHTML` exposes the application to XSS attacks, allowing arbitrary script execution. This is a common pattern when rendering rich text content.
**Prevention:** Always sanitize any dynamic or external HTML content using a robust sanitization library like `DOMPurify` before passing it to `dangerouslySetInnerHTML`.
