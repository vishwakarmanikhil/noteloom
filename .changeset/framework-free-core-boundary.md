---
'noteloom': patch
---

Internal: enforce a framework-free core. Two React hooks that lived in logic
folders moved into `src/react/` (`useDragResize`, `useRegisterFieldTypes`), and
an ESLint rule now blocks any `.js` outside `src/react/` / `src/commands/` from
importing `react`/`react-dom`. No public API change — every export resolves from
the same paths as before.
