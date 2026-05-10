## 2026-05-10 - DOMPurify for dangerouslySetInnerHTML
**Vulnerability:** XSS vulnerability through direct use of dangerouslySetInnerHTML with un-sanitized external HTML in FixtureView.jsx.
**Learning:** The usage of dangerouslySetInnerHTML can lead to direct XSS attacks if data originates from potentially untrusted or loosely-controlled external sources (like digest HTML). React's built-in protections do not cover this.
**Prevention:** Always use an industry-standard sanitization library such as DOMPurify whenever dangerouslySetInnerHTML is required to render HTML.
