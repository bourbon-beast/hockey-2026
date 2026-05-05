## 2024-05-18 - XSS via dangerouslySetInnerHTML
**Vulnerability:** XSS via dangerouslySetInnerHTML when rendering weekly digests from Firestore
**Learning:** External data should be treated as untrusted and sanitized before rendering
**Prevention:** Always sanitize external HTML strings using a trusted library like DOMPurify before dangerouslySetInnerHTML
