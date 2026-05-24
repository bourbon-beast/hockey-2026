## 2025-02-18 - Memoize team selections to prevent O(N) operations during drag-and-drop
**Learning:** React re-renders during frequent drag-and-drop interactions execute component getter functions synchronously. When these getter functions perform expensive O(N) operations (such as `.filter()`, `.sort()`, and `.find()`) on `roundData.selections`, it severely bottlenecks the main thread and drops frames.
**Action:** Always pre-calculate derived states into O(1) hash map lookups using `useMemo` to keep render cycles lean and maintain 60fps during complex interactions.
