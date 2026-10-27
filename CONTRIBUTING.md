# Contributing

Read the [plan](docs/project-plan.md), [decisions](docs/decisions.md), and
[implementation status](docs/implementation-status.md). Propose new product or
stack decisions before implementing them.

## Setup and checks

Use Node.js 24 and pnpm 12.15.0. Serve through Vite rather than opening HTML
directly: Python input/debugging needs the configured COOP/COEP headers.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm exec playwright install
pnpm test:e2e
```

The first runtime load and new packages require a network connection. Keep the
lockfile committed. Local lefthook hooks check staged formatting/lint and commit
titles; they do not replace relevant tests.

## Issue → branch → PR

1. Open an issue with the problem, expected behavior, and acceptance criteria.
2. Branch from current `main` as `<issue-number>-<short-description>`.
3. Make focused Conventional Commits, such as
   `feat(editor): add block indentation` or `fix(runtime): wake stopped input`.
4. Push the feature branch and open a draft PR using the repository template.
   Describe the resulting behavior, screenshots where relevant, and exact checks.
5. Resolve review conversations and require passing CI before squash merge.
   Keep `main` deployable; do not rewrite shared history.

Use the verified human Git identity. Do not add extra author/co-author trailers
or agent names to branch names, commit messages, or PR text. Keep personal and
office credentials separate and leave global Git/SSH configuration unchanged.

## Releases

Release-please proposes version/changelog PRs. Versions remain `0.x` during
development; breaking changes increment the minor version until the planned v1
launch. Changelog author attribution is disabled. Merging a release PR is a
separate maintainer decision after its checks pass.

The workflow uses the built-in repository token and the approved permissions
for release PRs and labels. That token does not automatically trigger CI on its
own PRs; see the [release-please credential documentation](https://github.com/googleapis/release-please-action#other-actions-on-release-please-prs).
Run the CI workflow on the release PR's exact head branch before merging:

```sh
gh workflow run ci.yml --repo abhay-yemekar/pyturbo --ref <release-pr-head-branch>
```

Verify that all five required checks are green on that PR's current commit.

## Implementation expectations

- Preserve the shared character-cell model for windows, editor, overlaps and
  shadows. Editing must remain responsive before Python loads.
- Put Python and blocking input/debugger waits in the worker. Validate both
  successful and rejected input paths.
- Preserve unsaved buffers when storage fails; keep filenames project-relative.
- Add focused tests under `tests/unit` or `tests/e2e`. Report untested behavior
  honestly; a successful build does not certify visual or runtime fidelity.
- For UI work, attach a PyTurbo screenshot and describe reference comparison.
  Do not commit proprietary Borland screenshots or approve a baseline merely
  because the implementation generated it.
- Do not add secrets, paid services, server execution, telemetry, or account
  storage incidentally. Preserve third-party notices and the separate CC BY-SA
  license for font/atlas derivatives.

See [SECURITY.md](SECURITY.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
