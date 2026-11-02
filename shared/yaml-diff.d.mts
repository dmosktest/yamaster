export declare const DiffKind: {
  readonly left_only: "left_only";
  readonly right_only: "right_only";
  readonly changed: "changed";
};

export type DiffEntry = {
  path: string;
  kind: "left_only" | "right_only" | "changed";
  left?: unknown;
  right?: unknown;
};

export type ArrayKeyRule = {
  pathPattern: string;
  keys: string[];
};

export type CompareOptions = {
  ignorePaths?: string[];
  arrayKeyRules?: ArrayKeyRule[];
  arrayAsSetPaths?: string[];
  arrayAsSet?: boolean;
  preset?: string;
  presets?: string[];
  kubernetes?: boolean;
};

export declare const K8S_ARRAY_KEY_RULES: readonly ArrayKeyRule[];
export declare const K8S_IGNORE_PATHS: readonly string[];

export declare function resolveCompareOptions(
  input?: CompareOptions,
): {
  ignorePaths: string[];
  arrayKeyRules: ArrayKeyRule[];
  arrayAsSetPaths: string[];
  arrayAsSet: boolean;
};

export declare function buildDocumentMap(
  docs: unknown[],
): Record<string, unknown>;

export declare function pairDocuments(
  leftDocs: unknown[] | unknown,
  rightDocs: unknown[] | unknown,
): { left: unknown; right: unknown };

export declare function compareYamlDocs(
  left: unknown,
  right: unknown,
  options?: CompareOptions,
): { diffs: DiffEntry[] };
