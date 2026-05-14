## 2024-05-24 - Memoize Expensive Getters
**Learning:** O(N) array operations (`.filter`, `.sort`) inside getter functions called multiple times per render cycle (especially during drag-and-drop interactions) cause massive CPU overhead and garbage collection, severely degrading performance to the point of UI lag.
**Action:** When a component needs to access subsets of a larger array repeatedly (e.g., separating players by team, counting by position), process the main array exactly once using `useMemo` into an O(1) hash map lookup, and have the getters simply read from that pre-computed map.
