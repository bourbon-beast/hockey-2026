## 2024-05-18 - Avoid O(N) Array Operations in Render Loop Getters
**Learning:** In a complex React drag-and-drop environment, getters inside custom hooks that perform O(N) array operations (like `.filter()`, `.find()`, and `.sort()`) on every render can significantly degrade performance, causing jank during frequent interactions.
**Action:** Replace on-the-fly array filtering and mapping within getter functions with a single `useMemo` block that pre-computes O(1) hash map lookups (e.g., using `new Map()`) for derived state, keyed by `teamId` or `playerId`.
