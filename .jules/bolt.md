## 2024-04-09 - React Array Filtering Performance
**Learning:** In large components with complex data relationships like `RoundPlanner.jsx`, computing filtered availability arrays inline during render (e.g. `getAvailablePlayers()`) causes noticeable UI lag as N grows, due to repeated execution of deep filters and sets.
**Action:** Always wrap expensive list derivations in `useMemo` specifically when the derivation relies on multiple independent filters and maps. Ensure primitive properties like `pickerOpen?.teamId` are used in dependency arrays rather than large complex objects.
