## 2024-04-17 - Prevent XSS in Digest Panel
**Vulnerability:** Stored Cross-Site Scripting (XSS) vulnerability due to rendering unsanitized HTML from the database via dangerouslySetInnerHTML.
**Learning:** Raw HTML strings loaded from external/database sources must never be trusted directly.
**Prevention:** Always use a sanitization library like DOMPurify when rendering raw HTML dynamically.
