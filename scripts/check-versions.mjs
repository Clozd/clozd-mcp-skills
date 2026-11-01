#!/usr/bin/env node
// Version checks. Usage: check-versions.mjs | --self-test
// On pull_request (GITHUB_BASE_REF set) a change under skills/ or .claude-plugin/
// also needs a plugin.json version that differs from the base branch.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { metadataVersion, parseFrontmatter } from "./check-skill.mjs";
import { pathToFileURL } from "node:url";

const BUMP_PREFIXES = ["skills/", ".claude-plugin/"];

// Pure check. baseVersion and changedPaths are undefined when there is no base to compare.
export function checkVersions({ pluginName, pluginVersion, marketplaceVersions, skillVersions, baseVersion, changedPaths }) {
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
  const needsBump = changedPaths?.some((path) => BUMP_PREFIXES.some((prefix) => path.startsWith(prefix)));
  if (needsBump && baseVersion !== undefined && baseVersion === pluginVersion) {
    errors.push(`skills/ or .claude-plugin/ changed but plugin.json version is still ${pluginVersion}; bump it`);
  }
  return errors;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadBase(baseRef) {
  const ref = `origin/${baseRef}`;
  try {
    git("rev-parse", "--verify", ref);
  } catch {
    throw new Error(`base ref ${ref} not found; fetch it (checkout needs fetch-depth: 0)`);
  }
  const changedPaths = git("diff", "--name-only", `${ref}...HEAD`).split("\n").filter(Boolean);
  let baseVersion;
  try {
    git("cat-file", "-e", `${ref}:.claude-plugin/plugin.json`);
    baseVersion = JSON.parse(git("show", `${ref}:.claude-plugin/plugin.json`)).version;
  } catch {
    // plugin.json absent at base: first introduction, nothing to compare against
    console.log(`${ref} has no plugin.json; skipping the bump check`);
  }
  return { baseVersion, changedPaths };
}

function selfTest() {
  const good = {
    pluginName: "p",
    pluginVersion: "0.2.0",
    marketplaceVersions: { p: "0.2.0" },
    skillVersions: { s: "0.2.0" },
    baseVersion: "0.1.0",
    changedPaths: ["skills/s/SKILL.md"],
  };
  const cases = [
    { label: "equal and bumped passes", input: good, ok: true },
    { label: "evals-only change needs no bump", input: { ...good, pluginVersion: "0.1.0", marketplaceVersions: { p: "0.1.0" }, skillVersions: { s: "0.1.0" }, changedPaths: ["evals/x"] }, ok: true },
    { label: "no base skips the bump check", input: { ...good, baseVersion: undefined, changedPaths: undefined }, ok: true },
    { label: "marketplace mismatch fails", input: { ...good, marketplaceVersions: { p: "0.1.0" } }, ok: false },
    { label: "skill mismatch fails", input: { ...good, skillVersions: { s: "0.1.0" } }, ok: false },
    { label: "missing skill version fails", input: { ...good, skillVersions: { s: undefined } }, ok: false },
    { label: "missing marketplace entry fails", input: { ...good, marketplaceVersions: {} }, ok: false },
    { label: "skills change without bump fails", input: { ...good, baseVersion: "0.2.0" }, ok: false },
    { label: ".claude-plugin change without bump fails", input: { ...good, baseVersion: "0.2.0", changedPaths: [".claude-plugin/marketplace.json"] }, ok: false },
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
  const plugin = readJson(".claude-plugin/plugin.json");
  const marketplace = readJson(".claude-plugin/marketplace.json");
  const marketplaceVersions = Object.fromEntries((marketplace.plugins ?? []).map((entry) => [entry.name, entry.version]));
  const skillVersions = {};
  for (const name of readdirSync("skills", { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
    const parsed = parseFrontmatter(readFileSync(`skills/${name}/SKILL.md`, "utf8"));
    skillVersions[name] = parsed.error ? undefined : metadataVersion(parsed.lines);
  }
  const baseRef = process.env.GITHUB_BASE_REF;
  let base = {};
  if (baseRef) base = loadBase(baseRef);
  else console.log("GITHUB_BASE_REF not set; skipping the bump check");
  const errors = checkVersions({
    pluginName: plugin.name,
    pluginVersion: plugin.version,
    marketplaceVersions,
    skillVersions,
    ...base,
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
