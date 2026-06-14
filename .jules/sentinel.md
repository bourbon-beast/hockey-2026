## 2025-02-21 - XSS Vulnerability in FixtureView
**Vulnerability:** The `FixtureView.jsx` component rendered raw, unsanitized HTML (from `selected.html`) using React's `dangerouslySetInnerHTML`.
**Learning:** Bypassing React's built-in XSS protections using `dangerouslySetInnerHTML` directly with user/database-provided content allows for potential injection of malicious scripts if the database data is compromised or not perfectly sanitized before storage.
**Prevention:** Always use a reputable HTML sanitizer like `DOMPurify` to clean the HTML input before passing it to `dangerouslySetInnerHTML` to ensure malicious scripts are stripped out.
