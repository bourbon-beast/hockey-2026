## 2025-06-13 - XSS Vulnerability in Fixture Digest View
**Vulnerability:** The application was vulnerable to Cross-Site Scripting (XSS) in the `FixtureView.jsx` component due to unsanitized HTML input being passed directly to React's `dangerouslySetInnerHTML` from `selected.html`.
**Learning:** This existed because `selected.html` could potentially contain untrusted user content from the digest generation step, and the app lacked a robust sanitization mechanism for dynamic HTML rendering.
**Prevention:** Always use an established library like `dompurify` to sanitize untrusted HTML before rendering it using `dangerouslySetInnerHTML`.
