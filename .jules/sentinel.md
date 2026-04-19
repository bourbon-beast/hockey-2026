## 2025-02-28 - XSS vulnerability in dangerouslySetInnerHTML
**Vulnerability:** Raw HTML injection into dangerouslySetInnerHTML in FixtureView.jsx
**Learning:** Need to always sanitize user or external input before injecting HTML
**Prevention:** Always use DOMPurify or similar when dynamically setting raw HTML
