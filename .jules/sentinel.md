## 2024-03-24 - Cross-Site Scripting (XSS) in dangerouslySetInnerHTML
**Vulnerability:** HTML strings directly loaded from external sources (e.g. Firestore) were being blindly rendered in React components via `dangerouslySetInnerHTML`.
**Learning:** External content must always be treated as untrusted and properly sanitized to prevent Cross-Site Scripting (XSS) attacks. React does not sanitize `dangerouslySetInnerHTML` inputs.
**Prevention:** Always use a sanitization library like `DOMPurify.sanitize()` when rendering raw HTML in React using `dangerouslySetInnerHTML`.