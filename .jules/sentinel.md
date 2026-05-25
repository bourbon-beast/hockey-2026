## 2024-05-25 - Fix XSS Vulnerability in FixtureView
**Vulnerability:** A Cross-Site Scripting (XSS) vulnerability was found in `src/components/FixtureView.jsx` where `dangerouslySetInnerHTML` was used without sanitization.
**Learning:** External content from the database (`selected.html`) was directly injected into the DOM, creating a potential XSS vector if the database is compromised.
**Prevention:** Always sanitize externally sourced HTML using a reliable library like `DOMPurify` before injecting it into the DOM via `dangerouslySetInnerHTML`.