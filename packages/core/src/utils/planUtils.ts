/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { isEmpty, fileExists } from './fileUtils.js';
import { isSubpath, resolveToRealPath } from './paths.js';

/**
 * Standard error messages for the plan approval workflow.
 * Shared between backend tools and CLI UI for consistency.
 */
export const PlanErrorMessages = {
  PATH_ACCESS_DENIED: (planPath: string, plansDir: string) =>
    `Access denied: plan path (${planPath}) must be within the designated plans directory (${plansDir}).`,
  FILE_NOT_FOUND: (path: string) =>
    `Plan file does not exist: ${path}. You must create the plan file before requesting approval.`,
  FILE_EMPTY:
    'Plan file is empty. You must write content to the plan file before requesting approval.',
  READ_FAILURE: (detail: string) => `Failed to read plan file: ${detail}`,
} as const;

/**
 * Safely resolves a plan path within the plans directory, preserving subdirectories
 * if they are within the plans directory context.
 *
 * @param planPath The input file path for the plan.
 * @param plansDir The authorized project plans directory.
 * @param targetDir The project root directory.
 * @returns The resolved safe absolute path.
 */
export function resolvePlanPath(
  planPath: string,
  plansDir: string,
  targetDir: string = process.cwd(),
): string {
  const realPlansDir = resolveToRealPath(plansDir);
  const plansDirName = path.basename(plansDir);

  let normalizedPlanPath = planPath;
  if (!path.isAbsolute(planPath)) {
    const segments = planPath.split(/[\\/]+/);
    if (segments.length > 1 && segments[0] === plansDirName) {
      normalizedPlanPath = segments.slice(1).join(path.sep);
    }
  }

  // 1. Try resolving relative to project root (targetDir)
  const resolved = path.isAbsolute(normalizedPlanPath)
    ? normalizedPlanPath
    : path.resolve(targetDir, normalizedPlanPath);

  try {
    const realResolved = resolveToRealPath(resolved);
    if (isSubpath(realPlansDir, realResolved)) {
      return resolved;
    }
  } catch {
    const directResolved = path.resolve(resolved);
    if (isSubpath(realPlansDir, directResolved)) {
      return resolved;
    }
  }

  // 2. Try resolving relative to plansDir
  const nestedResolved = path.resolve(plansDir, normalizedPlanPath);
  try {
    const realNested = resolveToRealPath(nestedResolved);
    if (isSubpath(realPlansDir, realNested)) {
      return nestedResolved;
    }
  } catch {
    const directNested = path.resolve(nestedResolved);
    if (isSubpath(realPlansDir, directNested)) {
      return nestedResolved;
    }
  }

  // 3. Fallback to standard safe behavior (basename) to avoid traversal
  const safeFilename = path.basename(planPath);
  return path.join(plansDir, safeFilename);
}

/**
 * Validates a plan file path for safety (traversal) and existence.
 * @param planPath The untrusted path to the plan file.
 * @param plansDir The authorized project plans directory.
 * @param targetDir The current working directory (project root).
 * @returns An error message if validation fails, or null if successful.
 */
export async function validatePlanPath(
  planPath: string,
  plansDir: string,
  targetDir?: string,
): Promise<string | null> {
  const resolvedPath = resolvePlanPath(planPath, plansDir, targetDir);
  const realPath = resolveToRealPath(resolvedPath);
  const realPlansDir = resolveToRealPath(plansDir);

  if (!isSubpath(realPlansDir, realPath)) {
    return PlanErrorMessages.PATH_ACCESS_DENIED(planPath, realPlansDir);
  }

  if (!(await fileExists(resolvedPath))) {
    return PlanErrorMessages.FILE_NOT_FOUND(planPath);
  }

  return null;
}

/**
 * Validates that a plan file has non-empty content.
 * @param planPath The path to the plan file.
 * @returns An error message if the file is empty or unreadable, or null if successful.
 */
export async function validatePlanContent(
  planPath: string,
): Promise<string | null> {
  try {
    if (await isEmpty(planPath)) {
      return PlanErrorMessages.FILE_EMPTY;
    }
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return PlanErrorMessages.READ_FAILURE(message);
  }
}
