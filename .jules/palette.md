## 2025-04-05 - Context-Aware ARIA Labels in Lists
**Learning:** When dealing with multiple identical interactive elements in a list (like remove buttons), simple static ARIA labels like "Remove" are insufficient for screen reader users as they lose context of *what* is being removed.
**Action:** Always interpolate unique identifying information (like a name or ID) into `aria-label`s within mapped lists to provide clear, actionable context (e.g., `aria-label="Remove ${item.name} from list"`).
