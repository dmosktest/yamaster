export declare const DiffKind: {
  readonly left_only: "left_only";
  readonly right_only: "right_only";
  readonly changed: "changed";
};

export declare function compareYamlDocs(
  left: unknown,
  right: unknown,
): {
  diffs: Array<{
    path: string;
    kind: "left_only" | "right_only" | "changed";
    left?: unknown;
    right?: unknown;
  }>;
};
