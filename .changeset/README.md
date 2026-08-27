# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

When you make a change that should appear in the release notes, run:

```bash
npx changeset
```

Pick the bump type (patch / minor / major) and write a short description — it
creates a markdown file here that gets committed with your PR. At release time,
`npx changeset version` consumes all pending changesets, bumps `package.json`,
and updates `CHANGELOG.md`; `npm publish` then ships it.

Pre-1.0 note (see `docs/repackaging-plan.md`): every phase through 1.0 is
additive, so bumps stay `patch`/`minor`. A `major` changeset is reserved for the
one deliberate breaking release.
