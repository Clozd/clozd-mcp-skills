# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

- Add `AGENTS.md` and a runner profile with the repo rules for automated jobs
- Add `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` for the `clozd` plugin (0.1.0), which connects to the Clozd MCP server
- Add the read-only `analyzing-win-loss` skill, with references for filters, data layers and report format
- Add `skills/analyzing-win-loss/agents/openai.yaml` so Codex and the ChatGPT desktop app list the skill and know it needs the Clozd MCP server, and add an "Install in Codex" section to the README
- Add CI workflow (`validate`, `versions`, `house-rules`, `evals`) with `scripts/check-versions.mjs` and `scripts/check-skill.mjs`
- Add release workflow that attaches one `.zip` per skill and a `SHA256SUMS` file to each GitHub release, built by `scripts/build-skill-zips.py`
- Make `scripts/check-versions.mjs` and `scripts/build-skill-zips.py` layout-aware (repo root or `plugins/clozd/`), add a full plugin `.zip` when `plugins/clozd/` exists, and add `scripts/test-package-contents.py`
- Rewrite the README install status: the repository is public, and there is no downloadable `.zip` for claude.ai until a release is published
