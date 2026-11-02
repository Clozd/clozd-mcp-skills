#!/usr/bin/env node
// Release-file checks on a git diff range. Usage:
//   release-shape.mjs <range> --classify   prints "release" or "other"
//   release-shape.mjs <range> --guard      fails when a version file, the manifest or CHANGELOG.md is hand-edited
//   release-shape.mjs --self-test
// A release change touches exactly the five release files, and its SKILL.md diff is only the version line.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const GIT = "/usr/bin/git";
const SKILL = "plugins/clozd/skills/analyzing-win-loss/SKILL.md";
export const RELEASE_FILES = [
  "plugins/clozd/.claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  SKILL,
  ".release-please-manifest.json",
  "CHANGELOG.md",
];
const VERSION_LINE = /^[+-]\s*version:\s*"?[^"\s]+"?\s*$/;

// Pure. entries are { status, path } from git diff --name-status; skillDiff is the SKILL.md diff with no context.
export function classify(entries, skillDiff) {
  const paths = entries.map((entry) => entry.path);
  // A release change holds exactly the five release files, so a lone CHANGELOG.md edit is not one.
  const onlyRelease = paths.length === RELEASE_FILES.length && RELEASE_FILES.every((path) => paths.includes(path));
  const changedLines = skillDiff.split("\n").filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line));
  const skillOnlyVersion = changedLines.every((line) => VERSION_LINE.test(line));
  const isRelease = onlyRelease && skillOnlyVersion;
  // A file that is only added (the first manifest) is not a hand edit of an existing file.
  // SKILL.md holds the skill text too, so only a change to its version line counts as a release-file edit.
  const skillVersionChanged = changedLines.some((line) => VERSION_LINE.test(line));
  const editsExisting = entries.some(
    (entry) => entry.status !== "A" && RELEASE_FILES.includes(entry.path) && (entry.path !== SKILL || skillVersionChanged),
  );
  return { isRelease, editsExisting };
}

function git(...args) {
  return execFileSync(GIT, args, { encoding: "utf8" });
}

function inspect(range) {
  const entries = git("diff", "--name-status", range)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split("\t");
      return { status: status[0], path: rest[rest.length - 1] };
    });
  const skillDiff = git("diff", "-U0", range, "--", SKILL);
  return classify(entries, skillDiff);
}

function selfTest() {
  const e = (status, path) => ({ status, path });
  const skillVersion = '--- a/x\n+++ b/x\n@@ -5 +5 @@\n-  version: "0.1.3"\n+  version: "0.1.4"\n';
  const skillBody = '--- a/x\n+++ b/x\n@@ -9 +9 @@\n-old text\n+new text\n';
  const all = RELEASE_FILES.map((path) => e("M", path));
  const cases = [
    { label: "all five release files with a version-line diff is a release", got: classify(all, skillVersion), isRelease: true, editsExisting: true },
    { label: "a SKILL.md body change is not a release", got: classify(all, skillBody), isRelease: false, editsExisting: true },
    { label: "an extra file is not a release", got: classify([...all, e("M", "README.md")], skillVersion), isRelease: false, editsExisting: true },
    { label: "four of the five files is not a release", got: classify(all.slice(1), skillVersion), isRelease: false, editsExisting: true },
    { label: "a SKILL.md body edit alone edits no release file", got: classify([e("M", SKILL)], skillBody), isRelease: false, editsExisting: false },
    { label: "a SKILL.md version-line edit alone is flagged", got: classify([e("M", SKILL)], skillVersion), isRelease: false, editsExisting: true },
    { label: "no changes is not a release", got: classify([], ""), isRelease: false, editsExisting: false },
    { label: "an unrelated PR is not a release and edits no release file", got: classify([e("M", "README.md")], ""), isRelease: false, editsExisting: false },
    { label: "adding only the manifest edits no existing release file", got: classify([e("A", ".release-please-manifest.json"), e("M", "scripts/x.mjs")], ""), isRelease: false, editsExisting: false },
    { label: "a hand edit of CHANGELOG.md alone is flagged", got: classify([e("M", "CHANGELOG.md")], ""), isRelease: false, editsExisting: true },
    { label: "a hand edit of CHANGELOG.md with other files is flagged", got: classify([e("M", "CHANGELOG.md"), e("M", "README.md")], ""), isRelease: false, editsExisting: true },
  ];
  let failed = 0;
  for (const { label, got, isRelease, editsExisting } of cases) {
    if (got.isRelease !== isRelease || got.editsExisting !== editsExisting) {
      failed += 1;
      console.error(`self-test FAILED: ${label}`);
    }
  }
  if (failed > 0) process.exit(1);
  console.log(`release-shape self-test ok (${cases.length} cases)`);
}

function main(args) {
  if (args[0] === "--self-test") return selfTest();
  const [range, mode] = args;
  if (!range || !["--classify", "--guard"].includes(mode)) throw new Error("usage: release-shape.mjs <range> --classify|--guard");
  const { isRelease, editsExisting } = inspect(range);
  if (mode === "--classify") {
    console.log(isRelease ? "release" : "other");
    return;
  }
  if (editsExisting && !isRelease) {
    console.error("::error::A version file, the release manifest or CHANGELOG.md changed outside a release change. Do not edit them by hand.");
    process.exit(1);
  }
  console.log("no hand edits of release files");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
