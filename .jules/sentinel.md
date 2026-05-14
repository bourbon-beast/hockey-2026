
## 2024-05-23 - XSS Vulnerability in FixtureView
**Vulnerability:** XSS vulnerability through unsanitized use of `dangerouslySetInnerHTML` for digest history.
**Learning:** External data from Firestore was rendered directly as HTML without sanitization, leading to a Cross-Site Scripting (XSS) risk.
**Prevention:** Always sanitize any dynamic HTML content retrieved from a database before rendering it with `dangerouslySetInnerHTML`. Use `dompurify` to sanitize HTML content.
