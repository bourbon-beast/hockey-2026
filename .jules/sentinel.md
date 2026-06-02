## 2025-02-26 - [XSS via Digest History]
**Vulnerability:** XSS vulnerability in `FixtureView.jsx` due to unsafe usage of `dangerouslySetInnerHTML` when rendering `selected.html` retrieved from the `weeklyDigests` Firebase collection.
**Learning:** `dangerouslySetInnerHTML` bypasses React's XSS protections and will execute any scripts embedded within the HTML. Even if the data comes from a trusted database, it must be sanitized before rendering.
**Prevention:** Always sanitize HTML data retrieved from a database before rendering it using a library like `DOMPurify`.
