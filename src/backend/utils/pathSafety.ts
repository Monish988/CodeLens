import path from 'path';

/**
 * Validates that a target path is contained within at least one of the allowed root directories.
 * This prevents path traversal attacks.
 */
export function isPathSafe(targetPath: string, allowedRoots: string[]): boolean {
  if (!targetPath || allowedRoots.length === 0) return false;

  const resolvedTarget = path.resolve(targetPath);

  return allowedRoots.some(root => {
    const resolvedRoot = path.resolve(root);
    const relative = path.relative(resolvedRoot, resolvedTarget);
    
    // Path is safe if it doesn't start with '..' and isn't absolute
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  });
}

/**
 * Normalizes a path for consistent database lookups and comparisons.
 */
export function normalizePath(p: string): string {
  return path.resolve(p);
}
