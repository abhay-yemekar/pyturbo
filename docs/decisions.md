# Accepted decisions

These decisions supplement the [26 October 2026 plan](project-plan.md), preserved
as the planning reference. Its unchecked roadmap and dated claims do not establish
completed implementation or verification.

## Confirmed by the owner

| Decision              | Accepted choice                                                               |
| --------------------- | ----------------------------------------------------------------------------- |
| Project/repository    | PyTurbo; public `abhay-yemekar/pyturbo`                                       |
| GitHub identity       | Personal account `abhay-yemekar`; office credentials remain separate          |
| Hosting design        | Free Cloudflare Pages, Git integration, `main` production branch and previews |
| Default screen        | Exact 80×25 with side bars; Fill available                                    |
| Identifiers           | Factory light green; Classic Yellow preset                                    |
| Phones                | Landscape, exact look and touch controls                                      |
| Pause after run       | Off by default; optional setting                                              |
| Execution             | Browser-only; server mode outside scope                                       |
| Commit identity       | Verified human author/committer; no added author/co-author trailers           |
| Branch/commit/PR text | No agent names                                                                |
| Usage stopping rule   | Owner removed the account-usage percentage threshold for this project         |

The five open product defaults were confirmed together on 26 October 2026. The
repository owner was named directly in the implementation request. New product
choices and stack deviations require confirmation before implementation.

## Available dependency pins

Registry verification confirmed the requested major versions. Direct pins are:
TypeScript 7.0.2, Vite 8.3.5, Pyodide 314.0.7, pnpm 12.15.0, Vitest 5.0.5,
Playwright 1.64.1, Biome 2.6.3, vite-plugin-pwa 2.0.0, Lezer Python 1.1.19,
idb-keyval 6.3.0, and lz-string 1.5.0. The lockfile records the installed graph.
Availability does not establish runtime package counts, speed, download size, or
performance budgets; those claims need measurement.

## Factual corrections and safeguards

- idb-keyval 6.3.0 is **Apache-2.0**, per its distributed `package.json` and
  `LICENCE`; the plan's MIT label was incorrect. No dependency was substituted.
- The font and derived atlas retain CC BY-SA 4.0 separately from MIT code.
  Retrieval provenance, hash, full license, and reproducible atlas instructions
  are in [public/fonts](../public/fonts/README.md).
- Share decoding validates schema/paths and bounds expansion. Loading a share
  opens files in memory without automatically saving or running them.
- Stop wakes blocking input/debugger waits as well as signaling an interrupt.
  A shared debugger mailbox allows commands while the worker is paused.

The owner separately approved the main protection/merge/security settings and
GitHub Actions release PR creation for this repository. GitHub combines PR
creation and approval in one repository setting; the release workflow creates
release PRs, and default workflow token permissions remain read-only.
The owner chose a private GitHub Projects board, with the five statuses in the plan.
The owner also approved `issues: write` for the release workflow's labeling needs.

## Reference questions still open

IDE-only palette defaults, selected-disabled menu color, full golden screens,
actual browser/OS keyboard capture, and detailed Ctrl+O T/U/F/R semantics still
need reference evidence. See [fidelity status](fidelity-status.md) and
[editor details](editor-and-storage.md). No alternate semantics were silently
assigned to these unverified commands.
