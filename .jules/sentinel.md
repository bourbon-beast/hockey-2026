## 2025-02-24 - Cross-Site Scripting (XSS) Vulnerability fixed in FixtureView
**Vulnerability:** XSS vulnerability in `FixtureView.jsx` when dangerously setting HTML on selected digest without sanitization.
**Learning:** External data via Firestore digests is injected blindly using `dangerouslySetInnerHTML`. Need to consistently sanitize using DOMPurify for external data injected into the application layout.
**Prevention:** Always use `DOMPurify.sanitize` prior to evaluating or loading external data through `dangerouslySetInnerHTML` to prevent untrusted execution.
