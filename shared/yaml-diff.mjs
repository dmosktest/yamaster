export const DiffKind = Object.freeze({
  left_only: "left_only",
  right_only: "right_only",
  changed: "changed",
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pathJoin(base, segment) {
  return base ? `${base}.${segment}` : String(segment);
}

function isMissing(value) {
  return value === undefined;
}

function scalarsEqual(left, right) {
  if (typeof left === "number" && typeof right === "number") {
    return Object.is(left, right);
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  return left === right;
}

function sameContainerKind(left, right) {
  if (Array.isArray(left) && Array.isArray(right)) return "array";
  if (isPlainObject(left) && isPlainObject(right)) return "object";
  return null;
}

function compareAt(left, right, path, diffs) {
  const leftMissing = isMissing(left);
  const rightMissing = isMissing(right);

  if (leftMissing && rightMissing) return;

  if (leftMissing) {
    diffs.push({ path, kind: DiffKind.right_only, right });
    return;
  }

  if (rightMissing) {
    diffs.push({ path, kind: DiffKind.left_only, left });
    return;
  }

  const kind = sameContainerKind(left, right);
  if (kind === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of [...keys].sort()) {
      const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
      const hasRight = Object.prototype.hasOwnProperty.call(right, key);
      compareAt(
        hasLeft ? left[key] : undefined,
        hasRight ? right[key] : undefined,
        pathJoin(path, key),
        diffs,
      );
    }
    return;
  }

  if (kind === "array") {
    const len = Math.max(left.length, right.length);
    for (let i = 0; i < len; i += 1) {
      compareAt(
        i < left.length ? left[i] : undefined,
        i < right.length ? right[i] : undefined,
        pathJoin(path, String(i)),
        diffs,
      );
    }
    return;
  }

  if (scalarsEqual(left, right)) return;

  diffs.push({ path, kind: DiffKind.changed, left, right });
}

export function compareYamlDocs(left, right) {
  const diffs = [];
  compareAt(left, right, "", diffs);
  return { diffs };
}
