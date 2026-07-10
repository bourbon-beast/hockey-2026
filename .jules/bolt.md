## 2025-02-12 - Prevent O(N) array operations in drag-and-drop render cycle
**Learning:** During frequent React re-renders (like complex drag-and-drop interactions in `useRoundManager`), O(N) array operations (e.g., `filter`, `sort`, `find`) in getter functions or component render bodies cause severe performance bottlenecks and jank.
**Action:** Strictly compute derived states using `useMemo` to pre-build O(1) hash map lookups from the source arrays, ensuring smooth 60fps performance during heavy UI updates.
