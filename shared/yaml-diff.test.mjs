import assert from "node:assert/strict";
import test from "node:test";
import {
  compareYamlDocs,
  pairDocuments,
  resolveCompareOptions,
} from "./yaml-diff.mjs";

test("scalars keep types", () => {
  const { diffs } = compareYamlDocs({ a: "1" }, { a: 1 });
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].kind, "changed");
});

test("object key order does not matter", () => {
  const { diffs } = compareYamlDocs({ b: 1, a: 2 }, { a: 2, b: 1 });
  assert.equal(diffs.length, 0);
});

test("arrays match by index by default", () => {
  const { diffs } = compareYamlDocs({ list: [1, 2, 3] }, { list: [0, 1, 2, 3] });
  assert.ok(diffs.some((d) => d.path === "list.0"));
  assert.ok(diffs.some((d) => d.path === "list.1" || d.path === "list.2" || d.path === "list.3"));
});

test("arrays match by key with kubernetes preset", () => {
  const left = {
    spec: {
      containers: [
        { name: "app", image: "app:1" },
        { name: "sidecar", image: "side:1" },
      ],
    },
  };
  const right = {
    spec: {
      containers: [
        { name: "sidecar", image: "side:1" },
        { name: "app", image: "app:2" },
        { name: "extra", image: "x:1" },
      ],
    },
  };
  const { diffs } = compareYamlDocs(left, right, { preset: "kubernetes" });
  assert.ok(diffs.some((d) => d.path.includes("containers[name=app]") && d.kind === "changed"));
  assert.ok(diffs.some((d) => d.path.includes("containers[name=extra]") && d.kind === "right_only"));
  assert.equal(
    diffs.filter((d) => d.path.includes("containers[name=sidecar]")).length,
    0,
  );
});

test("ignore paths drop status noise", () => {
  const left = {
    metadata: { name: "x", creationTimestamp: "t1" },
    status: { phase: "Running" },
    spec: { replicas: 1 },
  };
  const right = {
    metadata: { name: "x", creationTimestamp: "t2" },
    status: { phase: "Pending" },
    spec: { replicas: 2 },
  };
  const { diffs } = compareYamlDocs(left, right, { preset: "kubernetes" });
  assert.deepEqual(
    diffs.map((d) => d.path),
    ["spec.replicas"],
  );
});

test("array as set ignores order for scalars", () => {
  const { diffs } = compareYamlDocs(
    { args: ["b", "a"] },
    { args: ["a", "b"] },
    { arrayAsSet: true },
  );
  assert.equal(diffs.length, 0);
});

test("pairDocuments maps multi-doc by kind/name", () => {
  const leftDocs = [
    { kind: "Service", metadata: { name: "api" }, spec: { port: 80 } },
    { kind: "Deployment", metadata: { name: "api" }, spec: { replicas: 1 } },
  ];
  const rightDocs = [
    { kind: "Deployment", metadata: { name: "api" }, spec: { replicas: 2 } },
    { kind: "Service", metadata: { name: "api" }, spec: { port: 80 } },
  ];
  const paired = pairDocuments(leftDocs, rightDocs);
  const { diffs } = compareYamlDocs(paired.left, paired.right);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].path, "Deployment/api.spec.replicas");
});

test("resolveCompareOptions merges kubernetes preset", () => {
  const resolved = resolveCompareOptions({
    preset: "kubernetes",
    ignorePaths: ["spec.foo"],
  });
  assert.ok(resolved.ignorePaths.includes("status"));
  assert.ok(resolved.ignorePaths.includes("spec.foo"));
  assert.ok(resolved.arrayKeyRules.some((r) => r.pathPattern === "**.containers"));
});
