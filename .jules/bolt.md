## 2024-05-18 - Memoizing derived object creation in dependency arrays
**Learning:** When using `useMemo` for an expensive calculation, if the dependency array relies on an object created during render (like `playerTeamMap = Object.fromEntries(...)`), the reference equality check will fail on every render, invalidating the memoization cache and negating the performance benefit.
**Action:** Always ensure that derived objects used as dependencies in `useMemo` are themselves memoized using their own `useMemo` hook, or move their creation logic inside the dependent `useMemo` block if they aren't used elsewhere.
## 2024-05-18 - Missing explicit comments explaining the performance improvement
**Learning:** Bolt must always add explicit comments detailing the WHAT, WHY, and IMPACT of optimizations. A code change without comments violates Bolt's boundaries.
**Action:** When adding `useMemo` or other optimizations, always prefix the code with a comment block detailing the reasoning and the measured or expected impact.
