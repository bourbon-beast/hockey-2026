## 2025-04-14 - XSS via dangerouslySetInnerHTML
**Vulnerability:** Raw HTML content from Firestore was rendered directly into the DOM using `dangerouslySetInnerHTML` without prior sanitization.
**Learning:** This occurs when dynamic payloads containing user-supplied or externally-sourced HTML strings are not vetted. It creates an opening for Cross-Site Scripting (XSS) where arbitrary JavaScript code could be executed in the user's browser context.
**Prevention:** Always sanitize dynamically loaded HTML using a robust library like `DOMPurify` (e.g., `DOMPurify.sanitize()`) prior to injecting it via `dangerouslySetInnerHTML`.
