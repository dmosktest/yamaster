export const DiffKind = Object.freeze({
  left_only: "left_only",
  right_only: "right_only",
  changed: "changed",
});

export const K8S_ARRAY_KEY_RULES = Object.freeze([
  { pathPattern: "**.containers", keys: ["name"] },
  { pathPattern: "**.initContainers", keys: ["name"] },
  { pathPattern: "**.ephemeralContainers", keys: ["name"] },
  { pathPattern: "**.env", keys: ["name"] },
  { pathPattern: "**.envFrom", keys: ["prefix"] },
  { pathPattern: "**.ports", keys: ["containerPort", "name"] },
  { pathPattern: "**.volumeMounts", keys: ["mountPath", "name"] },
  { pathPattern: "**.volumes", keys: ["name"] },
  { pathPattern: "**.containers.*.lifecycle", keys: ["name"] },
  { pathPattern: "**.tolerations", keys: ["key", "operator", "value", "effect"] },
  { pathPattern: "**.imagePullSecrets", keys: ["name"] },
  { pathPattern: "**.hosts", keys: ["host"] },
  { pathPattern: "**.http.paths", keys: ["path"] },
  { pathPattern: "**.rules", keys: ["host"] },
  { pathPattern: "**.subjects", keys: ["kind", "name", "namespace"] },
]);

export const K8S_IGNORE_PATHS = Object.freeze([
  "metadata.creationTimestamp",
  "metadata.generation",
  "metadata.resourceVersion",
  "metadata.uid",
  "metadata.managedFields",
  "**.managedFields",
  "status",
  "status.**",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pathAppend(base, segment) {
  if (!base) return segment;
  if (segment.startsWith("[")) return `${base}${segment}`;
  return `${base}.${segment}`;
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

function uniqueStrings(values) {
  return [...new Set(values.filter((v) => typeof v === "string" && v.length > 0))];
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternToRegExp(pattern) {
  const parts = [];
  let i = 0;
  while (i < pattern.length) {
    if (pattern.startsWith("**", i)) {
      parts.push("<<<DS>>>");
      i += 2;
      if (pattern[i] === ".") i += 1;
      continue;
    }
    if (pattern[i] === "*") {
      parts.push("<<<SEG>>>");
      i += 1;
      continue;
    }
    let literal = "";
    while (i < pattern.length && !pattern.startsWith("**", i) && pattern[i] !== "*") {
      literal += pattern[i];
      i += 1;
    }
    parts.push(escapeRegex(literal));
  }

  let source = "^";
  for (const part of parts) {
    if (part === "<<<DS>>>") {
      source += "(?:.*)?";
    } else if (part === "<<<SEG>>>") {
      source += "[^.]+";
    } else {
      source += part;
    }
  }
  source += "$";
  return new RegExp(source);
}

function pathMatches(path, pattern) {
  if (!pattern) return false;
  if (pattern === path) return true;

  if (!pattern.includes("*")) {
    return path === pattern || path.startsWith(`${pattern}.`);
  }

  if (pattern.endsWith(".**")) {
    const prefix = pattern.slice(0, -3);
    if (!prefix.includes("*")) {
      return path === prefix || path.startsWith(`${prefix}.`);
    }
  }

  return patternToRegExp(pattern).test(path);
}

function isIgnoredPath(path, ignorePaths) {
  if (!path || !ignorePaths?.length) return false;
  return ignorePaths.some((pattern) => pathMatches(path, pattern));
}

function pathMatchesRule(path, pathPattern) {
  if (!pathPattern) return false;
  if (pathPattern.startsWith("**.")) {
    const suffix = pathPattern.slice(3);
    return path === suffix || path.endsWith(`.${suffix}`);
  }
  return pathMatches(path, pathPattern);
}

function resolveArrayKeys(path, options) {
  for (const rule of options.arrayKeyRules || []) {
    if (!rule?.keys?.length) continue;
    if (pathMatchesRule(path, rule.pathPattern)) return rule.keys;
  }
  return null;
}

function isArrayAsSetPath(path, options) {
  if (options.arrayAsSet) return true;
  return (options.arrayAsSetPaths || []).some((pattern) => pathMatchesRule(path, pattern));
}

function stableStringify(value) {
  if (value === null) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function formatIdentityValue(value) {
  if (typeof value === "string" && /^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return stableStringify(value);
}

function identityOf(item, keyFields) {
  if (!isPlainObject(item) || !keyFields?.length) return null;
  const tokenParts = [];
  const labelParts = [];
  for (const field of keyFields) {
    if (!Object.prototype.hasOwnProperty.call(item, field)) continue;
    const value = item[field];
    if (value === undefined || value === null) continue;
    tokenParts.push(`${field}=${stableStringify(value)}`);
    labelParts.push(`${field}=${formatIdentityValue(value)}`);
  }
  if (tokenParts.length === 0) return null;
  return {
    token: tokenParts.join("&"),
    label: `[${labelParts.join(",")}]`,
  };
}

function documentPath(doc, index) {
  if (isPlainObject(doc) && typeof doc.kind === "string") {
    const meta = isPlainObject(doc.metadata) ? doc.metadata : null;
    const name =
      meta && typeof meta.name === "string" && meta.name.length > 0
        ? meta.name
        : String(index);
    const ns =
      meta && typeof meta.namespace === "string" && meta.namespace.length > 0
        ? `${meta.namespace}/`
        : "";
    return `${doc.kind}/${ns}${name}`;
  }
  return `doc[${index}]`;
}

export function buildDocumentMap(docs) {
  const map = {};
  const used = new Set();
  (docs || []).forEach((doc, index) => {
    const base = documentPath(doc, index);
    let key = base;
    let n = 2;
    while (used.has(key)) {
      key = `${base}#${n}`;
      n += 1;
    }
    used.add(key);
    map[key] = doc;
  });
  return map;
}

export function pairDocuments(leftDocs, rightDocs) {
  const leftList = Array.isArray(leftDocs) ? leftDocs : [leftDocs];
  const rightList = Array.isArray(rightDocs) ? rightDocs : [rightDocs];
  const multi = leftList.length > 1 || rightList.length > 1;
  if (!multi) {
    return {
      left: leftList.length ? leftList[0] : undefined,
      right: rightList.length ? rightList[0] : undefined,
    };
  }
  return {
    left: buildDocumentMap(leftList),
    right: buildDocumentMap(rightList),
  };
}

export function resolveCompareOptions(input = {}) {
  const ignorePaths = [...(input.ignorePaths || [])];
  const arrayKeyRules = [...(input.arrayKeyRules || [])];
  const arrayAsSetPaths = [...(input.arrayAsSetPaths || [])];
  const presets = new Set(input.presets || []);
  if (input.preset) presets.add(input.preset);
  if (input.kubernetes) presets.add("kubernetes");

  if (presets.has("kubernetes")) {
    ignorePaths.push(...K8S_IGNORE_PATHS);
    arrayKeyRules.push(...K8S_ARRAY_KEY_RULES);
  }

  return {
    ignorePaths: uniqueStrings(ignorePaths),
    arrayKeyRules,
    arrayAsSetPaths: uniqueStrings(arrayAsSetPaths),
    arrayAsSet: Boolean(input.arrayAsSet),
  };
}

function compareArraysByIndex(left, right, path, diffs, options) {
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    compareAt(
      i < left.length ? left[i] : undefined,
      i < right.length ? right[i] : undefined,
      pathAppend(path, String(i)),
      diffs,
      options,
    );
  }
}

function compareArraysAsSet(left, right, path, diffs, options) {
  const rightBuckets = new Map();
  for (let j = 0; j < right.length; j += 1) {
    const token = stableStringify(right[j]);
    const list = rightBuckets.get(token) || [];
    list.push(j);
    rightBuckets.set(token, list);
  }

  const rightUsed = new Set();
  left.forEach((item, i) => {
    const token = stableStringify(item);
    const bucket = rightBuckets.get(token);
    if (bucket && bucket.length) {
      rightUsed.add(bucket.shift());
      return;
    }
    compareAt(item, undefined, pathAppend(path, String(i)), diffs, options);
  });

  right.forEach((item, j) => {
    if (rightUsed.has(j)) return;
    compareAt(undefined, item, pathAppend(path, String(j)), diffs, options);
  });
}

function compareArraysByKey(left, right, path, keyFields, diffs, options) {
  const leftUsed = new Set();
  const rightUsed = new Set();
  const pairs = [];

  for (let i = 0; i < left.length; i += 1) {
    const id = identityOf(left[i], keyFields);
    if (!id) continue;
    for (let j = 0; j < right.length; j += 1) {
      if (rightUsed.has(j)) continue;
      const other = identityOf(right[j], keyFields);
      if (!other || other.token !== id.token) continue;
      pairs.push({ i, j, label: id.label });
      leftUsed.add(i);
      rightUsed.add(j);
      break;
    }
  }

  const leftRest = [];
  for (let i = 0; i < left.length; i += 1) {
    if (!leftUsed.has(i)) leftRest.push(i);
  }
  const rightRest = [];
  for (let j = 0; j < right.length; j += 1) {
    if (!rightUsed.has(j)) rightRest.push(j);
  }

  const restLen = Math.max(leftRest.length, rightRest.length);
  for (let k = 0; k < restLen; k += 1) {
    const i = leftRest[k];
    const j = rightRest[k];
    if (i === undefined) {
      const id = identityOf(right[j], keyFields);
      compareAt(
        undefined,
        right[j],
        pathAppend(path, id?.label ?? String(j)),
        diffs,
        options,
      );
      continue;
    }
    if (j === undefined) {
      const id = identityOf(left[i], keyFields);
      compareAt(
        left[i],
        undefined,
        pathAppend(path, id?.label ?? String(i)),
        diffs,
        options,
      );
      continue;
    }
    const leftId = identityOf(left[i], keyFields);
    const rightId = identityOf(right[j], keyFields);
    pairs.push({
      i,
      j,
      label: leftId?.label ?? rightId?.label ?? null,
    });
  }

  for (const pair of pairs) {
    const segment =
      pair.label != null ? pair.label : String(pair.i);
    compareAt(
      left[pair.i],
      right[pair.j],
      pathAppend(path, segment),
      diffs,
      options,
    );
  }
}

function compareAt(left, right, path, diffs, options) {
  if (isIgnoredPath(path, options.ignorePaths)) return;

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
      const childPath = pathAppend(path, key);
      if (isIgnoredPath(childPath, options.ignorePaths)) continue;
      const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
      const hasRight = Object.prototype.hasOwnProperty.call(right, key);
      compareAt(
        hasLeft ? left[key] : undefined,
        hasRight ? right[key] : undefined,
        childPath,
        diffs,
        options,
      );
    }
    return;
  }

  if (kind === "array") {
    if (isArrayAsSetPath(path, options)) {
      compareArraysAsSet(left, right, path, diffs, options);
      return;
    }
    const keyFields = resolveArrayKeys(path, options);
    if (keyFields) {
      compareArraysByKey(left, right, path, keyFields, diffs, options);
      return;
    }
    compareArraysByIndex(left, right, path, diffs, options);
    return;
  }

  if (scalarsEqual(left, right)) return;

  diffs.push({ path, kind: DiffKind.changed, left, right });
}

export function compareYamlDocs(left, right, options = {}) {
  const resolved = resolveCompareOptions(options);
  const diffs = [];
  compareAt(left, right, "", diffs, resolved);
  return { diffs };
}
