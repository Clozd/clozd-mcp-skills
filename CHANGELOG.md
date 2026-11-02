# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

- Fix the `analyzing-win-loss` call order: every user calls `get_organizations` first, then `get_programs` with `organizationId` (the server requires it); bump the plugin to 0.1.2 and update the `lose-trigger` eval and mock to match

- Add `AGENTS.md` and a runner profile with the repo rules for automated jobs
- Add `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` for the `clozd` plugin (0.1.0), which connects to the Clozd MCP server
- Add the read-only `analyzing-win-loss` skill, with references for filters, data layers and report format
- Add `skills/analyzing-win-loss/agents/openai.yaml` so Codex and the ChatGPT desktop app list the skill and know it needs the Clozd MCP server, and add an "Install in Codex" section to the README
- Add CI workflow (`validate`, `versions`, `house-rules`, `evals`) with `scripts/check-versions.mjs` and `scripts/check-skill.mjs`
- Add release workflow that attaches one `.zip` per skill and a `SHA256SUMS` file to each GitHub release, built by `scripts/build-skill-zips.py`
- Make `scripts/check-versions.mjs` and `scripts/build-skill-zips.py` layout-aware (repo root or `plugins/clozd/`), add a full plugin `.zip` when `plugins/clozd/` exists, and add `scripts/test-package-contents.py`
- Move the installable plugin to `plugins/clozd/` (manifest, skill, a customer `README.md`, and copies of `LICENSE` and `SECURITY.md`, which CI keeps identical to the root files) so installs no longer include repository maintenance files, point the marketplace entry at `./plugins/clozd`, and bump the plugin to 0.1.1
- Update CI and the release workflow for the new layout; the release now attaches the full plugin `.zip` as well as the skill `.zip`
- Rewrite the README install status: the repository is public, and there is no downloadable `.zip` for claude.ai until a release is published
- Add a manual `cut-release` workflow that validates `main`, creates the GitHub release (or a release candidate), and attaches the skill and plugin `.zip` files; `release.yml` can now also be called or re-run by tag
