## 2025-05-03 - Cross-Site Scripting (XSS) Vulnerability in FixtureView
**Vulnerability:** XSS vulnerability found in `src/components/FixtureView.jsx` where dynamically loaded HTML was rendered directly without sanitization.
**Learning:** The app rendered a summary/digest containing unsanitized HTML fetched via external sources and displayed it with `dangerouslySetInnerHTML={{ __html: selected.html }}`.
**Prevention:** Always sanitize dynamically rendered HTML inputs with a strong industry-standard library like `DOMPurify` when using `dangerouslySetInnerHTML` to mitigate XSS attacks.
