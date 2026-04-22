## 2024-04-22 - Fix XSS Vulnerability in FixtureView
**Vulnerability:** The application was directly rendering unsanitized HTML fetched from Firestore into the DOM via React's `dangerouslySetInnerHTML` in `src/components/FixtureView.jsx`. This could allow Cross-Site Scripting (XSS) if malicious HTML content was inserted into the Firestore `weeklyDigests` collection.
**Learning:** Even internal admin tools (like the `syncHv` script that generates the digests) shouldn't implicitly trust data from the database. Defense in depth requires sanitizing inputs right before they are inserted into the DOM.
**Prevention:** Use a reputable HTML sanitizer like `DOMPurify` to clean any HTML strings immediately before passing them to `dangerouslySetInnerHTML`.
