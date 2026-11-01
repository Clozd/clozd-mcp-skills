#!/usr/bin/env node
// House-rule checks for one skill directory. Usage: check-skill.mjs skills/<name> | --self-test
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_DESCRIPTION = 200;
const MAX_BODY_WARN = 10000;
const ALLOWED_KEYS = new Set(["name", "description", "license", "compatibility", "metadata"]);

// Reads top-level frontmatter keys by regex. Returns { error } or { keys, lines, body }.
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(text);
  if (!match) return { error: "missing frontmatter" };
  const lines = match[1].split(/\r?\n/);
  const keys = new Map();
  for (const line of lines) {
    const key = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
    if (key) keys.set(key[1], key[2].trim());
  }
  return { keys, lines, body: match[2] ?? "" };
}

function unquote(value) {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

// Reads metadata.version from the indented block under `metadata:`.
export function metadataVersion(lines) {
  const start = lines.findIndex((line) => /^metadata:[ \t]*$/.test(line));
  if (start === -1) return undefined;
  for (const line of lines.slice(start + 1)) {
    if (!/^[ \t]/.test(line)) break;
    const version = /^[ \t]+version:[ \t]*(.+?)[ \t]*$/.exec(line);
    if (version) return unquote(version[1]);
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
