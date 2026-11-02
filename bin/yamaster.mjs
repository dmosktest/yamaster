#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  compareYamlDocs,
  pairDocuments,
} from "../shared/yaml-diff.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);

function printHelp() {
  process.stdout.write(`yamaster ${pkg.version}
Logical YAML comparison (by keys/values, not line-by-line).

Usage:
  yamaster <left.yml> <right.yml> [options]

Options:
  --preset kubernetes       Match common Kubernetes list keys and ignore status noise
  --ignore <path>      Ignore path (repeatable; supports * and **)
  --array-as-set       Treat all lists as unordered sets
  --json               Print diffs as JSON
  -h, --help           Show help
  -v, --version        Show version

Exit codes:
  0  no differences
  1  differences found
  2  usage / parse error
`);
}

function parseArgs(argv) {
  const args = {
    left: null,
    right: null,
    preset: null,
    ignorePaths: [],
    arrayAsSet: false,
    json: false,
    help: false,
    version: false,
  };

  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      args.version = true;
      continue;
    }
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg === "--array-as-set") {
      args.arrayAsSet = true;
      continue;
    }
    if (arg === "--preset") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--preset requires a value (kubernetes)");
      }
      args.preset = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--preset=")) {
      args.preset = arg.slice("--preset=".length);
      continue;
    }
    if (arg === "--ignore") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--ignore requires a path");
      }
      args.ignorePaths.push(value);
      i += 1;
      continue;
    }
    if (arg.startsWith("--ignore=")) {
      args.ignorePaths.push(arg.slice("--ignore=".length));
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }

  if (positional.length >= 1) args.left = positional[0];
  if (positional.length >= 2) args.right = positional[1];
  if (positional.length > 2) {
    throw new Error("Expected exactly two file paths");
  }
  return args;
}

function loadDocs(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.trim()) {
    throw new Error(`File is empty: ${filePath}`);
  }
  return yaml.loadAll(text, null, { schema: yaml.DEFAULT_SCHEMA });
}

function formatValue(value) {
  try {
    return yaml.dump(value, { lineWidth: -1, noRefs: true }).trimEnd();
  } catch {
    return String(value);
  }
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 2;
    return;
  }

  if (args.help) {
    printHelp();
    return;
  }
  if (args.version) {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }
  if (!args.left || !args.right) {
    printHelp();
    process.exitCode = 2;
    return;
  }

  let leftDocs;
  let rightDocs;
  try {
    leftDocs = loadDocs(args.left);
    rightDocs = loadDocs(args.right);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 2;
    return;
  }

  const paired = pairDocuments(leftDocs, rightDocs);
  const { diffs } = compareYamlDocs(paired.left, paired.right, {
    preset: args.preset || undefined,
    ignorePaths: args.ignorePaths,
    arrayAsSet: args.arrayAsSet,
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ diffs }, null, 2)}\n`);
  } else if (diffs.length === 0) {
    process.stdout.write("No differences.\n");
  } else {
    for (const diff of diffs) {
      const pathLabel = diff.path || "(root)";
      if (diff.kind === "changed") {
        process.stdout.write(
          `~ ${pathLabel}\n  - ${formatValue(diff.left)}\n  + ${formatValue(diff.right)}\n`,
        );
      } else if (diff.kind === "left_only") {
        process.stdout.write(`- ${pathLabel}\n  ${formatValue(diff.left)}\n`);
      } else {
        process.stdout.write(`+ ${pathLabel}\n  ${formatValue(diff.right)}\n`);
      }
    }
    process.stdout.write(`${diffs.length} difference(s)\n`);
  }

  process.exitCode = diffs.length === 0 ? 0 : 1;
}

main();
