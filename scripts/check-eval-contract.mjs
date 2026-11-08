#!/usr/bin/env node
// Validate the organization-scope cases from claude plugin eval's JSON artifact.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CONTRACTS = {
  "authorization-denied": {
    grader: "stops-after-denial", reply: "reports-authorization-blocker",
    tool: "get_programs", input: {},
  },
  "consultancy-ambiguous-organization": {
    grader: "discovers-before-programs", reply: "asks-for-selection",
    tool: "get_organizations", input: {},
  },
  "consultancy-known-organization": {
    grader: "uses-supplied-organization", reply: "no-redundant-confirmation",
    tool: "get_programs", input: { organizationId: "11111111-1111-4111-8111-111111111111" },
  },
};

function readCallPattern(caseName) {
  const source = readFileSync(new URL(`../evals/${caseName}/case.yaml`, import.meta.url), "utf8");
  // These cases deliberately store their single regex as a JSON-quoted YAML scalar.
  const patterns = [...source.matchAll(/^    pattern: (".*")$/gm)];
  assert.equal(patterns.length, 1, `${caseName}: expected one call-sequence pattern`);
  return new RegExp(JSON.parse(patterns[0][1]));
}

function checkResults(result) {
  assert.equal(result.schemaVersion, 1, "unsupported eval result schema");
  assert.equal(result.partial, false, "eval suite did not finish");
  for (const [name, contract] of Object.entries(CONTRACTS)) {
    const cases = result.cases.filter((entry) => entry.name === name);
    assert.equal(cases.length, 1, `${name}: expected exactly one case`);
    const entry = cases[0];
    const runs = entry.arms.with;
    assert.ok(runs.length > 0, `${name}: no with-plugin runs`);
    assert.equal(runs.length, entry.runsPerCase, `${name}: missing runs`);
    for (const [index, run] of runs.entries()) {
      const label = `${name} run ${index + 1}`;
      assert.ok(!run.error && !run.aborted && !run.skippedPaidGraders, `${label}: incomplete run`);
      assert.ok(!run.mocks?.warnings?.some((warning) => warning.includes("no _tools.json entry")), `${label}: missing tool schemas`);
      for (const graderName of [contract.grader, contract.reply]) {
        const grader = run.graders.find((item) => item.name === graderName);
        assert.ok(grader, `${label}: missing ${graderName}`);
        assert.equal(grader.scored, true, `${label}: ${graderName} excluded from gating`);
        assert.equal(grader.passed, true, `${label}: ${graderName} failed`);
      }
      const definition = entry.graders.find((grader) => grader.name === contract.grader);
      assert.equal(definition.type, "regex", `${label}: call check must be deterministic`);
      assert.equal(definition.config.target, "mock_calls", `${label}: wrong call-check target`);
      assert.equal(definition.config.pattern, readCallPattern(name).source, `${label}: unexpected call-check pattern`);
      assert.equal(run.mocks.calls.total, 1, `${label}: expected one discovery/program call and then stop`);
    }
  }
}

function selfTest() {
  const valid = {
    schemaVersion: 1, partial: false,
    cases: Object.entries(CONTRACTS).map(([name, contract]) => ({
      name, runsPerCase: 1,
      graders: [{ name: contract.grader, type: "regex", config: {
        target: "mock_calls", pattern: readCallPattern(name).source,
      } }],
      arms: { with: [{ error: null, skippedPaidGraders: false, mocks: { warnings: [], calls: { total: 1 } }, graders: [
        { name: contract.grader, scored: true, passed: true, evidence: JSON.stringify({
          tool: `mcp__plugin_clozd_clozd__${contract.tool}`, input: contract.input,
          output: name === "authorization-denied" ? "HTTP 403 MCP002" : "fixture result",
        }) },
        { name: contract.reply, scored: true, passed: true },
      ] }] },
    })),
  };
  checkResults(valid);
  const callGrader = (result, index = 0) => result.cases[index].arms.with[0].graders[0];
  const mutateCall = (result, index, mutate) => {
    const grader = callGrader(result, index);
    const call = JSON.parse(grader.evidence);
    mutate(call);
    grader.evidence = JSON.stringify(call);
  };
  const invalid = [
    (result) => { result.partial = true; },
    (result) => { result.cases.pop(); },
    (result) => { result.cases[0].runsPerCase = 3; },
    (result) => { result.cases[0].arms.with[0].error = "timed out"; },
    (result) => { callGrader(result).scored = false; },
    (result) => { callGrader(result).passed = false; },
    (result) => { result.cases[0].arms.with[0].graders[1].passed = false; },
    (result) => { result.cases[0].arms.with[0].mocks.calls.total = 2; },
    (result) => { result.cases[0].graders[0].type = "llm"; },
    (result) => { result.cases[0].graders[0].config.pattern = ".*"; },
    (result) => { result.cases[0].arms.with[0].mocks.warnings.push("no _tools.json entry for get_programs"); },
  ];
  for (const mutate of invalid) {
    const result = structuredClone(valid);
    mutate(result);
    assert.throws(() => checkResults(result));
  }
  const invalidCalls = [
    [0, (call) => { call.tool = "mcp__plugin_clozd_clozd__get_organizations"; }],
    [0, (call) => { call.input.organizationId = "another-org"; }],
    [0, (call) => { call.output = "[]"; }],
    [1, (call) => { call.tool = "mcp__plugin_clozd_clozd__get_programs"; }],
    [2, (call) => { call.input = {}; }],
    [2, (call) => { call.input.organizationId = "wrong-org"; }],
    [2, (call) => { call.input.unsupported = true; }],
  ];
  for (const entry of valid.cases) {
    const evidence = entry.arms.with[0].graders[0].evidence;
    assert.ok(readCallPattern(entry.name).test(evidence));
    assert.ok(!readCallPattern(entry.name).test(""));
    assert.ok(!readCallPattern(entry.name).test(`${evidence}\n${evidence}`));
  }
  for (const [index, mutate] of invalidCalls) {
    const result = structuredClone(valid);
    mutateCall(result, index, mutate);
    const entry = result.cases[index];
    const grader = callGrader(result, index);
    grader.passed = readCallPattern(entry.name).test(grader.evidence);
    assert.equal(grader.passed, false, `${entry.name}: invalid call passed the regex`);
    assert.throws(() => checkResults(result));
  }
  const ordinary = readCallPattern("lose-trigger");
  const programCall = valid.cases[0].arms.with[0].graders[0].evidence;
  const organizationCall = valid.cases[1].arms.with[0].graders[0].evidence;
  const analysisCall = JSON.stringify({ tool: "mcp__plugin_clozd_clozd__get_decision_drivers", input: { programId: "fixture" }, output: "[]" });
  assert.ok(ordinary.test(`${programCall}\n${analysisCall}`));
  assert.ok(!ordinary.test(`${analysisCall}\n${programCall}`));
  assert.ok(!ordinary.test(`${programCall}\n${organizationCall}`));
  assert.ok(!ordinary.test(valid.cases[2].arms.with[0].graders[0].evidence));
  console.log(`eval contract self-test ok (${invalid.length} invalid results, ${invalidCalls.length} invalid calls, empty/repeated calls, ordinary call order)`);
}

try {
  if (process.argv[2] === "--self-test") selfTest();
  else {
    assert.ok(process.argv[2], "usage: check-eval-contract.mjs <eval-results.json> | --self-test");
    checkResults(JSON.parse(readFileSync(process.argv[2], "utf8")));
    console.log("organization-scope eval contract passed");
  }
} catch (error) {
  console.error(`::error::${error.message}`);
  process.exitCode = 1;
}
