## 2024-05-24 - [CRITICAL] Fix open database write access
**Vulnerability:** Open database access configuration (`allow read, write: if true;`) in Firestore rules.
**Learning:** This exposes the entire database to anonymous overwrites and deletions. Such a configuration often occurs during initial development and gets accidentally deployed to production without proper security reviews.
**Prevention:** Always enforce secure Firestore rules (e.g., `allow read: if true; allow write: if request.auth != null;`) before deploying or merging. Implement continuous security scanning to detect insecure database access rules in configuration files.
