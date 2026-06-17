## 2025-02-14 - O(1) hash map lookups for frequent React getters
**Learning:** Functions returned from a custom React hook (like `getters` in `useRoundManager.js`) that execute O(N) array operations (`.filter()`, `.sort()`, `.find()`) can significantly degrade render performance (e.g., during complex drag-and-drop interactions) when called repeatedly across many child components.
**Action:** Pre-compute derived state once per data change using `useMemo` to build hash maps, and have the getter functions return O(1) lookups from the memoized object instead.
