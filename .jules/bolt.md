## 2024-04-14 - React Object Identity in useMemo
**Learning:** Extracting primitive values (like strings from optional chaining) from objects before passing them to the dependency array of a `useMemo` hook is crucial for stability. Passing the entire object reference (e.g. `pickerOpen`) causes the memoization to fail on unrelated updates if the parent object is recreated.
**Action:** Always map object properties to primitive constants inside the component body, and use those primitives in the dependency array.
