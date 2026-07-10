## 2024-05-17 - O(N) Arrays in Getters
**Learning:** Frequent React re-renders with getters containing `O(N)` array operations (like `.filter()`, `.find()`, and `.sort()`) cause performance issues, especially when rendering many components or drag-and-drop. In `useRoundManager.js`, `getTeamCounts`, `getPositionCounts`, `getDuplicatePlayerIds`, and team selection getters compute state on the fly.
**Action:** Use `useMemo` to pre-build O(1) hash map lookups from the source arrays or memoize derived arrays to avoid recalculating on every call.
