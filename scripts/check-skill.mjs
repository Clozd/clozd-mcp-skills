#!/usr/bin/env node
// House-rule checks for one skill directory. Usage: check-skill.mjs skills/<name> | --self-test
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_DESCRIPTION = 200;
const MAX_BODY_WARN = 10000;
const ALLOWED_KEYS = new Set(["name", "description", "license", "compatibility", "metadata"]);

// Reads top-level frontmatter keys by string parsing. Returns { error } or { keys, lines, body }.
export function parseFrontmatter(text) {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  if (lines[0] !== "---") return { error: "missing frontmatter" };
  const end = lines.indexOf("---", 1);
  if (end === -1) return { error: "missing frontmatter" };
  const block = lines.slice(1, end);
  const keys = new Map();
  for (const line of block) {
    const colon = line.indexOf(":");
    const key = line.slice(0, colon);
    if (colon > 0 && /^[A-Za-z0-9_-]+$/.test(key)) keys.set(key, line.slice(colon + 1).trim());
  }
  return { keys, lines: block, body: lines.slice(end + 1).join("\n") };
}

function unquote(value) {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

// Reads metadata.version from the indented block under `metadata:`.
export function metadataVersion(lines) {
  const start = lines.findIndex((line) => line.trimEnd() === "metadata:");
  if (start === -1) return undefined;
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith(" ") && !line.startsWith("\t")) break;
    const trimmed = line.trim();
    if (trimmed.startsWith("version:")) return unquote(trimmed.slice("version:".length).trim());
  }
  return undefined;
}

// Pure check. `entries` are paths relative to the skill directory.
export function checkSkill({ text, entries }) {
  const errors = [];
  const warnings = [];
  const parsed = parseFrontmatter(text);
  if (parsed.error) return { errors: [parsed.error], warnings };

  for (const key of parsed.keys.keys()) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`frontmatter key not allowed: ${key}`);
  }

  const raw = parsed.keys.get("description");
  if (raw === undefined || raw === "") {
    errors.push("description missing or empty");
  } else if (/^[>|]/.test(raw)) {
    errors.push("description must be a single-line value, not a block scalar");
  } else {
    const length = unquote(raw).length;
    if (length > MAX_DESCRIPTION) {
      errors.push(`description is ${length} characters, over ${MAX_DESCRIPTION}`);
    }
  }

  if (text.includes("mcp__")) errors.push("SKILL.md contains mcp__");

  for (const entry of entries) {
    if (entry.split("/").includes("scripts")) errors.push(`scripts folder not allowed: ${entry}`);
  }

  if (parsed.body.length > MAX_BODY_WARN) {
    warnings.push(`body is ${parsed.body.length} characters, over ${MAX_BODY_WARN}`);
  }
  return { errors, warnings };
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    out.push(full);
    if (statSync(full).isDirectory()) out.push(...walk(full));
  }
  return out;
}

function selfTest() {
  const skill = (description, extra = "", body = "Body.\n") =>
    `---\nname: demo\ndescription: ${description}\n${extra}---\n\n${body}`;
  const cases = [
    { label: "200-char description passes", text: skill("a".repeat(200)), ok: true },
    { label: "201-char description fails", text: skill("a".repeat(201)), ok: false },
    { label: "extra frontmatter key fails", text: skill("fine", "tools: x\n"), ok: false },
    { label: "mcp__ fails", text: skill("fine", "", "Call mcp__x.\n"), ok: false },
    { label: "block scalar description fails", text: skill(">"), ok: false },
    { label: "scripts folder fails", text: skill("fine"), entries: ["scripts/run.sh"], ok: false },
    { label: "missing frontmatter fails", text: "no frontmatter", ok: false },
  ];
  let failed = 0;
  for (const { label, text, entries = [], ok } of cases) {
    const passed = checkSkill({ text, entries }).errors.length === 0;
    if (passed !== ok) {
      failed += 1;
      console.error(`self-test FAILED: ${label}`);
    }
  }
  const long = checkSkill({ text: skill("fine", "", "x".repeat(10001)), entries: [] });
  if (long.errors.length > 0 || long.warnings.length !== 1) {
    failed += 1;
    console.error("self-test FAILED: long body must warn, not fail");
  }
  if (failed > 0) process.exit(1);
  console.log(`check-skill self-test ok (${cases.length + 1} cases)`);
}

function main(args) {
  if (args[0] === "--self-test") return selfTest();
  const dir = args[0];
  if (!dir) {
    console.error("usage: check-skill.mjs skills/<name> | --self-test");
    process.exit(2);
  }
  let text;
  try {
    text = readFileSync(join(dir, "SKILL.md"), "utf8");
  } catch (error) {
    console.error(`${dir}: cannot read SKILL.md: ${error.message}`);
    process.exit(1);
  }
  const entries = walk(dir).map((path) => relative(dir, path).split("\\").join("/"));
  const { errors, warnings } = checkSkill({ text, entries });
  for (const warning of warnings) console.log(`::warning::${dir}: ${warning}`);
  for (const error of errors) console.error(`::error::${dir}: ${error}`);
  if (errors.length > 0) process.exit(1);
  console.log(`${dir}: ok`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
