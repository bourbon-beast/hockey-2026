## 2024-05-24 - Optimize O(N) array operations in getters
**Learning:** Frequent React re-renders during drag-and-drop interactions cause O(N) array operations (like `.filter()`, `.sort()`, `.find()`) inside getters to become severe performance bottlenecks.
**Action:** Compute derived states strictly using `useMemo` to pre-build O(1) hash map lookups from the source arrays. Wrap getter functions with `useCallback` to return the memoized lookups.
