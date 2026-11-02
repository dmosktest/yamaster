import {
  DiffKind as DiffKindEnum,
  K8S_ARRAY_KEY_RULES as K8S_ARRAY_KEY_RULES_IMPL,
  K8S_IGNORE_PATHS as K8S_IGNORE_PATHS_IMPL,
  buildDocumentMap as buildDocumentMapImpl,
  compareYamlDocs as compareYamlDocsImpl,
  pairDocuments as pairDocumentsImpl,
  resolveCompareOptions as resolveCompareOptionsImpl,
  type ArrayKeyRule,
  type CompareOptions,
  type DiffEntry as DiffEntryType,
} from "../shared/yaml-diff.mjs";

export type DiffKind = "left_only" | "right_only" | "changed";
export type DiffEntry = DiffEntryType;
export type { ArrayKeyRule, CompareOptions };

export const DiffKind = DiffKindEnum;
export const K8S_ARRAY_KEY_RULES = K8S_ARRAY_KEY_RULES_IMPL;
export const K8S_IGNORE_PATHS = K8S_IGNORE_PATHS_IMPL;

export function resolveCompareOptions(input?: CompareOptions) {
  return resolveCompareOptionsImpl(input);
}

export function buildDocumentMap(docs: unknown[]) {
  return buildDocumentMapImpl(docs);
}

export function pairDocuments(
  leftDocs: unknown[] | unknown,
  rightDocs: unknown[] | unknown,
) {
  return pairDocumentsImpl(leftDocs, rightDocs);
}

export function compareYamlDocs(
  left: unknown,
  right: unknown,
  options?: CompareOptions,
) {
  return compareYamlDocsImpl(left, right, options) as {
    diffs: DiffEntry[];
  };
}
