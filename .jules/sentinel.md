## 2024-05-18 - Fix XSS Vulnerability in FixtureView
**Vulnerability:** The `FixtureView` component uses `dangerouslySetInnerHTML` to render the `selected.html` from `weeklyDigests` without sanitizing it first. This is a severe XSS vulnerability because `selected.html` is user data stored in Firestore.
**Learning:** `dangerouslySetInnerHTML` is inherently dangerous and must always be paired with a sanitization library like DOMPurify when rendering data retrieved from a database, even if the data was originally generated internally.
**Prevention:** Always sanitize HTML strings with `DOMPurify.sanitize()` before passing them to `dangerouslySetInnerHTML`. Add `dompurify` as a project dependency.
