## 2024-05-18 - Expensive O(N) operations inside render blocks
**Learning:** Performing multiple iterations (like array maps and filters) over large collections (e.g. `allPlayers`) directly inside a component's render body forces unnecessary calculations on every re-render, especially evident in interactive UI like dragging or typing.
**Action:** Always wrap heavy derived states or hash maps with `useMemo` so that they only recalculate when their dependencies change. Extracted inner variable calculations outside of map/filter callbacks when they only depend on external values.
