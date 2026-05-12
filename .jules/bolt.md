## 2024-05-18 - [Fix Focus Visibility in Hover Elements]
**Learning:** Elements styled with Tailwind's `opacity-0 group-hover:opacity-100` become invisible unless hovered over. However, this negatively impacts keyboard accessibility as users cannot see the element when it receives focus.
**Action:** Always include `focus-visible:opacity-100` in addition to `group-hover:opacity-100` for elements that should be visible on focus. This ensures that elements remain visible when accessed via keyboard navigation.
## 2024-05-18 - [Memoize Array Computations in Getters]
**Learning:** Returning fresh array filters or mappings inside getter functions (like `getTeamCounts`, `getTeamActiveSelections`, etc.) within hooks causes performance degradation, especially when these getters are called multiple times in child components on every render.
**Action:** Use `useMemo` to pre-compute derived state dictionaries mapping to O(1) lookups whenever possible, instead of repeatedly executing O(N) array filter/find operations.
