## 2026-04-04 - [CRITICAL] Fix unauthenticated Firestore write access
**Vulnerability:** The `firestore.rules` file allowed public unauthenticated write access to the entire database (`allow read, write: if true;`), meaning anyone could modify or delete data.
**Learning:** Default Firebase security rules are sometimes left overly permissive (`true`) during development and not updated before deployment, exposing the application to data tampering.
**Prevention:** Ensure `firestore.rules` correctly restricts write operations (`allow write: if request.auth != null;`) before deploying or sharing the application publicly. Validate security rules in all initial setups.
