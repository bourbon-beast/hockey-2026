## 2024-05-25 - Prevented Unnecessary Render Filtering in AllPlayers

**Learning:** Component `AllPlayers` was unnecessarily filtering and sorting its entire list of players on every render, even when non-dependency state was updated (e.g. modals opening).
**Action:** Wrapped the `filtered` list in `useMemo` with dependencies on `[players, search, statusFilters, sortBy, sortDir]` to prevent expensive list recalculation on unrelated re-renders.
