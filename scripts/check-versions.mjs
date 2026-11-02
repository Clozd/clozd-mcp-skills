#!/usr/bin/env node
// Version checks. Usage: check-versions.mjs | --self-test
// plugin.json, the marketplace entry, every SKILL.md and the release manifest must carry the same version.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { metadataVersion, parseFrontmatter } from "./check-skill.mjs";
import { pathToFileURL } from "node:url";

const NESTED_ROOT = "plugins/clozd";

// Pure check.
export function checkVersions({ pluginName, pluginVersion, marketplaceVersions, skillVersions, manifestVersion }) {
  const errors = [];
  if (!pluginVersion) errors.push("plugin.json has no version");
  if (marketplaceVersions[pluginName] === undefined) {
    errors.push(`marketplace.json has no entry named ${pluginName}`);
  } else if (marketplaceVersions[pluginName] !== pluginVersion) {
    errors.push(`marketplace.json version ${marketplaceVersions[pluginName]} != plugin.json version ${pluginVersion}`);
  }
  for (const [skill, version] of Object.entries(skillVersions)) {
    if (version === undefined) errors.push(`${skill}: SKILL.md has no metadata.version`);
    else if (version !== pluginVersion) errors.push(`${skill}: metadata.version ${version} != plugin.json version ${pluginVersion}`);
  }
  if (manifestVersion === undefined) errors.push(".release-please-manifest.json has no version for \".\"");
  else if (manifestVersion !== pluginVersion) errors.push(`.release-please-manifest.json version ${manifestVersion} != plugin.json version ${pluginVersion}`);
  return errors;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function selfTest() {
  const good = {
    pluginName: "p",
    pluginVersion: "0.2.0",
    marketplaceVersions: { p: "0.2.0" },
    skillVersions: { s: "0.2.0" },
    manifestVersion: "0.2.0",
  };
  const cases = [
    { label: "all equal passes", input: good, ok: true },
    { label: "marketplace mismatch fails", input: { ...good, marketplaceVersions: { p: "0.1.0" } }, ok: false },
    { label: "skill mismatch fails", input: { ...good, skillVersions: { s: "0.1.0" } }, ok: false },
    { label: "missing skill version fails", input: { ...good, skillVersions: { s: undefined } }, ok: false },
    { label: "missing marketplace entry fails", input: { ...good, marketplaceVersions: {} }, ok: false },
    { label: "manifest mismatch fails", input: { ...good, manifestVersion: "0.1.0" }, ok: false },
    { label: "manifest missing fails", input: { ...good, manifestVersion: undefined }, ok: false },
    { label: "missing plugin version fails", input: { ...good, pluginVersion: undefined }, ok: false },
  ];
  let failed = 0;
  for (const { label, input, ok } of cases) {
    if ((checkVersions(input).length === 0) !== ok) {
      failed += 1;
      console.error(`self-test FAILED: ${label}`);
    }
  }
  if (failed > 0) process.exit(1);
  console.log(`check-versions self-test ok (${cases.length} cases)`);
}

function main(args) {
  if (args[0] === "--self-test") return selfTest();
  const root = existsSync(`${NESTED_ROOT}/.claude-plugin/plugin.json`) ? NESTED_ROOT : ".";
  const plugin = readJson(`${root}/.claude-plugin/plugin.json`);
  const marketplace = readJson(".claude-plugin/marketplace.json");
  const marketplaceVersions = Object.fromEntries((marketplace.plugins ?? []).map((entry) => [entry.name, entry.version]));
  const skillVersions = {};
  for (const name of readdirSync(`${root}/skills`, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
    const parsed = parseFrontmatter(readFileSync(`${root}/skills/${name}/SKILL.md`, "utf8"));
    skillVersions[name] = parsed.error ? undefined : metadataVersion(parsed.lines);
  }
  const manifestPath = ".release-please-manifest.json";
  const manifestVersion = existsSync(manifestPath) ? readJson(manifestPath)["."] : undefined;
  const errors = checkVersions({
    pluginName: plugin.name,
    pluginVersion: plugin.version,
    marketplaceVersions,
    skillVersions,
    manifestVersion,
  });
  for (const error of errors) console.error(`::error::${error}`);
  if (errors.length > 0) process.exit(1);
  console.log(`versions ok (${plugin.version})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
