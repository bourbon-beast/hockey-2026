## 2024-04-18 - Fix XSS in FixtureView HTML rendering
**Vulnerability:** React component `FixtureView.jsx` rendered raw HTML (`selected.html`) using `dangerouslySetInnerHTML` without sanitization.
**Learning:** The application renders external database payloads directly into the DOM which exposes it to Cross-Site Scripting (XSS) attacks if the data is compromised.
**Prevention:** Always use `DOMPurify.sanitize()` before passing any external HTML payload to React's `dangerouslySetInnerHTML`.
