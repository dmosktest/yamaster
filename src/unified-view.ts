import type { DiffEntry, DiffKind } from "./yaml-diff";

export type UnifiedMarker = " " | "-" | "+";

export type UnifiedLine = {
  path: string;
  marker: UnifiedMarker;
  text: string;
  kind?: DiffKind;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pathJoin(base: string, segment: string): string {
  return base ? `${base}.${segment}` : segment;
}

function formatLeaf(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function dumpScalar(
  value: unknown,
  path: string,
  indent: string,
  key: string | null,
  marker: UnifiedMarker,
  kind: DiffKind | undefined,
  lines: UnifiedLine[],
): void {
  if (typeof value === "string" && /[\r\n]/.test(value)) {
    const head: UnifiedLine = { path, marker, text: lineText(indent, key, "|") };
    if (kind) head.kind = kind;
    lines.push(head);
    for (const part of normalizeNewlines(value).split("\n")) {
      const row: UnifiedLine = { path, marker, text: `${indent}  ${part}` };
      if (kind) row.kind = kind;
      lines.push(row);
    }
    return;
  }

  const row: UnifiedLine = {
    path,
    marker,
    text: lineText(indent, key, formatLeaf(value)),
  };
  if (kind) row.kind = kind;
  lines.push(row);
}

function scalarsEqual(left: unknown, right: unknown): boolean {
  if (typeof left === "number" && typeof right === "number") {
    return Object.is(left, right);
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  return left === right;
}

function sameContainerKind(
  left: unknown,
  right: unknown,
): "array" | "object" | null {
  if (Array.isArray(left) && Array.isArray(right)) return "array";
  if (isPlainObject(left) && isPlainObject(right)) return "object";
  return null;
}

function lineText(indent: string, key: string | null, valueText: string | null): string {
  const pad = indent;
  if (key === null) {
    return valueText === null ? pad.trimEnd() : `${pad}${valueText}`;
  }
  if (valueText === null) return `${pad}${key}:`;
  return `${pad}${key}: ${valueText}`;
}

function dumpTree(
  value: unknown,
  path: string,
  indent: string,
  key: string | null,
  marker: UnifiedMarker,
  kind: DiffKind,
  lines: UnifiedLine[],
): void {
  if (isPlainObject(value)) {
    lines.push({
      path,
      marker,
      kind,
      text: lineText(indent, key, null),
    });
    const keys = Object.keys(value).sort();
    for (const childKey of keys) {
      dumpTree(
        value[childKey],
        pathJoin(path, childKey),
        `${indent}  `,
        childKey,
        marker,
        kind,
        lines,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    lines.push({
      path,
      marker,
      kind,
      text: lineText(indent, key, null),
    });
    for (let i = 0; i < value.length; i += 1) {
      dumpTree(
        value[i],
        pathJoin(path, String(i)),
        `${indent}  `,
        String(i),
        marker,
        kind,
        lines,
      );
    }
    return;
  }

  dumpScalar(value, path, indent, key, marker, kind, lines);
}

function walk(
  left: unknown,
  right: unknown,
  path: string,
  indent: string,
  key: string | null,
  lines: UnifiedLine[],
): void {
  const leftMissing = left === undefined;
  const rightMissing = right === undefined;

  if (leftMissing && rightMissing) return;

  if (leftMissing) {
    dumpTree(right, path, indent, key, "+", "right_only", lines);
    return;
  }

  if (rightMissing) {
    dumpTree(left, path, indent, key, "-", "left_only", lines);
    return;
  }

  const container = sameContainerKind(left, right);
  if (container === "object") {
    const leftObj = left as Record<string, unknown>;
    const rightObj = right as Record<string, unknown>;
    if (key !== null) {
      lines.push({
        path,
        marker: " ",
        text: lineText(indent, key, null),
      });
    }
    const childIndent = key === null ? indent : `${indent}  `;
    const keys = new Set([...Object.keys(leftObj), ...Object.keys(rightObj)]);
    for (const childKey of [...keys].sort()) {
      const hasLeft = Object.prototype.hasOwnProperty.call(leftObj, childKey);
      const hasRight = Object.prototype.hasOwnProperty.call(rightObj, childKey);
      walk(
        hasLeft ? leftObj[childKey] : undefined,
        hasRight ? rightObj[childKey] : undefined,
        pathJoin(path, childKey),
        childIndent,
        childKey,
        lines,
      );
    }
    return;
  }

  if (container === "array") {
    const leftArr = left as unknown[];
    const rightArr = right as unknown[];
    if (key !== null) {
      lines.push({
        path,
        marker: " ",
        text: lineText(indent, key, null),
      });
    }
    const childIndent = key === null ? indent : `${indent}  `;
    const len = Math.max(leftArr.length, rightArr.length);
    for (let i = 0; i < len; i += 1) {
      walk(
        i < leftArr.length ? leftArr[i] : undefined,
        i < rightArr.length ? rightArr[i] : undefined,
        pathJoin(path, String(i)),
        childIndent,
        String(i),
        lines,
      );
    }
    return;
  }

  if (scalarsEqual(left, right)) {
    dumpScalar(left, path, indent, key, " ", undefined, lines);
    return;
  }

  dumpTree(left, path, indent, key, "-", "changed", lines);
  dumpTree(right, path, indent, key, "+", "changed", lines);
}

export function buildUnifiedView(left: unknown, right: unknown): UnifiedLine[] {
  const lines: UnifiedLine[] = [];
  walk(left, right, "", "", null, lines);
  return lines;
}

export function diffFingerprint(diff: DiffEntry): string {
  return `${diff.kind}\n${stableDump(diff.left)}\n${stableDump(diff.right)}`;
}

function stableDump(value: unknown): string {
  if (value === undefined) return "\u0000undefined";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
