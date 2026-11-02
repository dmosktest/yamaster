import {
  DiffKind as DiffKindEnum,
  compareYamlDocs as compareYamlDocsImpl,
} from "../shared/yaml-diff.mjs";

export type DiffKind = "left_only" | "right_only" | "changed";

export type DiffEntry = {
  path: string;
  kind: DiffKind;
  left?: unknown;
  right?: unknown;
};

export type CompareResult = {
  diffs: DiffEntry[];
};

export const DiffKind = DiffKindEnum;

export function compareYamlDocs(
  left: unknown,
  right: unknown,
): CompareResult {
  return compareYamlDocsImpl(left, right) as CompareResult;
}
