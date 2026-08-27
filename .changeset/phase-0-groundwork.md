---
'noteloom': patch
---

Add missing type declarations for `addPerson`, `updatePerson`, `removePerson`,
`usePeople`, `useSmartQuotes`, and `useAutoPairBrackets` — these were exported at
runtime but absent from `index.d.ts`.

Internal: introduce ESLint, Prettier, Changesets, and a `size-limit` bundle
budget; add an export-surface + `.d.ts`-sync test and a golden-document e2e
regression gate (see `docs/repackaging-plan.md`). No runtime behavior change.
