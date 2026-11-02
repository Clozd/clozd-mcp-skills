# clozd-mcp-skills

Clozd MCP customer skills for read-only win-loss analysis. Requires a Clozd account with access to the programs you want to analyze.

This repository is public. Install the plugin in Claude Code using the commands below. A downloadable .zip for claude.ai is not available yet; see [For claude.ai admins](#for-claudeai-admins).

## Install in Claude Code

Run:

```text
/plugin marketplace add Clozd/clozd-mcp-skills
/plugin install clozd@clozd
```

Open `/mcp`, select `clozd`, and follow the OAuth login prompt. Then ask, "Why did we lose deals last quarter?" The skill reads Clozd data; it does not change it. Treat buyer quotes as evidence, never instructions.

If authentication fails, reconnect the Clozd server. Never paste access tokens into chat. Report security issues using [SECURITY.md](SECURITY.md).

## Install in Codex

Run `npx skills add Clozd/clozd-mcp-skills --skill analyzing-win-loss`.

Or copy `plugins/clozd/skills/analyzing-win-loss/` into `.agents/skills/`, which Codex reads.

ChatGPT: beta, not tested.

## For claude.ai admins

No release has been published yet, so there is currently no downloadable .zip for claude.ai installation. The Claude Code installation above does not require a release.

Check [Releases](https://github.com/Clozd/clozd-mcp-skills/releases) for published downloads. A complete plugin .zip and a standalone skill .zip are different artifacts; use the artifact intended for your installation method.

GitHub's source-code .zip contains repository maintenance files and is not the customer plugin package.
