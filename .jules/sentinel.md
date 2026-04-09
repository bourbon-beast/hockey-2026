## 2025-04-09 - [XSS] Unsanitized HTML rendering
**Vulnerability:** Found `dangerouslySetInnerHTML={{ __html: data.html }}` without any sanitization in `src/components/FixtureView.jsx`. This is a classic XSS vector since the app directly dumps unvalidated data into the DOM.
**Learning:** React requires explicit instruction to render unsanitized HTML (hence the name `dangerouslySetInnerHTML`), but developers often forget to actually sanitize the string.
**Prevention:** Always use a library like `dompurify` to sanitize input passed to `dangerouslySetInnerHTML`.
