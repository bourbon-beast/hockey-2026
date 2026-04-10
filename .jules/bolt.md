## 2024-05-18 - RoundPlanner Memoization
**Learning:** Found a specific React performance bottleneck where `getAvailablePlayers` performed expensive O(N) filtering and sorting on every render, blocking the main thread.
**Action:** When working on large lists and map manipulations (like filtering unavailabilities and games played metrics) inside renders, wrap them in `useMemo` with explicit granular dependencies, and avoid invoking filtering functions inline in the JSX mapping.
