## 2026-04-21 - Prevent XSS in HTML Digest View
**Vulnerability:** Selected digest HTML was rendered directly into the DOM using `dangerouslySetInnerHTML` without any sanitization in `FixtureView.jsx`.
**Learning:** The digest payload might be generated from untrusted external sources (or altered in Firestore/transit). Directly rendering it creates a severe Cross-Site Scripting (XSS) vulnerability.
**Prevention:** Whenever rendering raw HTML strings in React using `dangerouslySetInnerHTML`, always sanitize the input payload first using a trusted library like `DOMPurify` (`DOMPurify.sanitize(html)`).
