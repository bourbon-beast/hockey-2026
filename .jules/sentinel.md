## 2025-04-13 - [XSS in FixtureView]
**Vulnerability:** Raw HTML was being rendered using React's dangerouslySetInnerHTML in src/components/FixtureView.jsx without prior sanitization.
**Learning:** External data should never be trusted when rendering HTML content in React components, as it could contain malicious scripts.
**Prevention:** Always sanitize dynamically injected HTML payloads using DOMPurify before rendering them.
