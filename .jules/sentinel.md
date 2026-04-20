## 2025-04-03 - Open Firebase Write Access
**Vulnerability:** The firestore.rules file was configured with `allow read, write: if true;`, allowing unauthenticated users to modify or delete any document in the database.
**Learning:** The rules were left open intentionally for initial development ("add auth later when sharing"). This is a common pattern that risks becoming permanent if forgotten.
**Prevention:** Always restrict write access to authenticated users by default (`allow write: if request.auth != null;`). Use Anonymous Authentication if public writes are strictly necessary during initial prototyping, rather than leaving the entire database fully open.
