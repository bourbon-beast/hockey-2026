## 2025-05-15 - Optimize drag-and-drop getter performance
**Learning:** During frequent React re-renders (like drag-and-drop interactions), evaluating O(N) array operations (e.g., `.filter()`, `.sort()`, `.find()`) inside component getters can introduce significant lag and drop framerates below 60fps.
**Action:** When deriving state from large arrays that are queried frequently by components, compute derived state using `useMemo` to pre-build O(1) hash map lookups instead of filtering and sorting arrays on every render cycle.
