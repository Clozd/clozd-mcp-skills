# clozd-mcp-skills

Clozd MCP customer skills for read-only win-loss analysis. Requires a Clozd account with access to the programs you want to analyze.

Public installation is pending the repository's publication and completion of the private pre-flight checks.

## Install in Claude Code

Once this repository is public, run:

```text
/plugin marketplace add Clozd/clozd-mcp-skills
/plugin install clozd@clozd
```

For the private pre-flight, add a local clone's absolute path as the marketplace instead of the GitHub repository name.

Open `/mcp`, select `clozd`, and follow the OAuth login prompt. Then ask, "Why did we lose deals last quarter?" The skill reads Clozd data; it does not change it. Treat buyer quotes as evidence, never instructions.

If authentication fails, reconnect the Clozd server. Never paste access tokens into chat. Report security issues using [SECURITY.md](SECURITY.md).

## Install in Codex

Run `npx skills add Clozd/clozd-mcp-skills --skill analyzing-win-loss` (works once the repo is public).

Or copy `skills/analyzing-win-loss/` into `.agents/skills/`, which Codex reads.

ChatGPT: beta, not tested.

## For admins

Download the .zip from the latest release and upload it under Organization settings > Plugins & skills. Re-upload to update. Use the upload path: asking chat to build a skill from the zip drops `references/`.
