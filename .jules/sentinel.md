## 2026-03-28 - Cross-Site Scripting (XSS) in dynamically loaded HTML
**Vulnerability:** A Cross-Site Scripting (XSS) vulnerability was found in `src/components/FixtureView.jsx` where dynamically generated HTML from Firestore (`selected.html`) was rendered unsanitized using React's `dangerouslySetInnerHTML`.
**Learning:** This existed because we assumed HTML returned from the server (digest summaries) was safe. Even if generated internally, injecting raw HTML leaves the app vulnerable to XSS if an attacker manipulates the database content (which is currently open to public writes).
**Prevention:** Always use `DOMPurify.sanitize()` when injecting raw HTML strings dynamically via React's `dangerouslySetInnerHTML`.
