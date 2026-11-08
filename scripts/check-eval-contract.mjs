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
      // The harness records the mock-call JSONL shown to this grader as evidence.
      // Check calls directly as well, so a mistaken judge verdict cannot hide them.
      const evidence = run.graders.find((item) => item.name === contract.grader).evidence;
      assert.ok(typeof evidence === "string" && evidence.trim(), `${label}: missing call evidence`);
      const calls = evidence.trim().split("\n").map((line) => JSON.parse(line));
      assert.equal(calls.length, 1, `${label}: expected one discovery/program call and then stop`);
      const call = calls[0];
      assert.equal(call.tool.split("__").at(-1), contract.tool, `${label}: wrong tool`);
      assert.deepEqual(call.input, contract.input, `${label}: wrong arguments`);
      if (name === "authorization-denied") {
        assert.match(call.output, /MCP002/, `${label}: denial was not exercised`);
      }
    }
  }
}

function selfTest() {
  const valid = {
    schemaVersion: 1, partial: false,
    cases: Object.entries(CONTRACTS).map(([name, contract]) => ({
      name, runsPerCase: 1,
      arms: { with: [{ error: null, skippedPaidGraders: false, mocks: { warnings: [] }, graders: [
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
    (result) => { callGrader(result).evidence = ""; },
    (result) => { callGrader(result).evidence += "\n" + callGrader(result).evidence; },
    (result) => mutateCall(result, 0, (call) => { call.tool = "get_organizations"; }),
    (result) => mutateCall(result, 0, (call) => { call.input.organizationId = "another-org"; }),
    (result) => mutateCall(result, 0, (call) => { call.output = "[]"; }),
    (result) => mutateCall(result, 1, (call) => { call.tool = "get_programs"; }),
    (result) => mutateCall(result, 2, (call) => { call.input = {}; }),
    (result) => mutateCall(result, 2, (call) => { call.input.organizationId = "wrong-org"; }),
    (result) => mutateCall(result, 2, (call) => { call.input.unsupported = true; }),
    (result) => { result.cases[0].arms.with[0].mocks.warnings.push("no _tools.json entry for get_programs"); },
  ];
  for (const mutate of invalid) {
    const result = structuredClone(valid);
    mutate(result);
    assert.throws(() => checkResults(result));
  }
  console.log(`eval contract self-test ok (valid result + ${invalid.length} negative controls)`);
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
