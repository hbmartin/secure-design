import * as path from 'path';
import * as fs from 'fs';
import type { ExecutionContext } from '../types/agent';

/**
 * Standard error response structure for all tools
 */
export interface ToolErrorResponse {
    success: false;
    error: string;
    error_type?:
        | 'validation'
        | 'security'
        | 'file_not_found'
        | 'permission'
        | 'execution'
        | 'unknown';
    details?: any;
}

/**
 * Standard success response structure for all tools
 */
export interface ToolSuccessResponse {
    success: true;
    [key: string]: any;
}

export type ToolResponse = ToolSuccessResponse | ToolErrorResponse;

/**
 * Generic error handler that converts exceptions/errors to standardized error responses
 */
export function handleToolError(
    error: unknown,
    context?: string,
    errorType: ToolErrorResponse['error_type'] = 'unknown'
): ToolErrorResponse {
    let errorMessage: string;
    let details: any;

    if (error instanceof Error) {
        errorMessage = error.message;
        details = {
            name: error.name,
            stack: error.stack?.split('\n').slice(0, 3), // Truncated stack trace
        };
    } else if (typeof error === 'string') {
        errorMessage = error;
    } else {
        errorMessage = 'An unknown error occurred';
        details = { originalError: error };
    }

    // Add context if provided
    if (context) {
        errorMessage = `${context}: ${errorMessage}`;
    }

    console.error(`Tool error (${errorType}): ${errorMessage}`);

    return {
        success: false,
        error: errorMessage,
        error_type: errorType,
        details,
    };
}

function isWithinDirectory(resolvedPath: string, directory: string): boolean {
    return resolvedPath === directory || resolvedPath.startsWith(directory + path.sep);
}

/**
 * Models (especially smaller local ones) often hallucinate an absolute prefix
 * for workspace files, e.g. "/path/to/<workspace name>/UI/theme.css". When the
 * workspace directory name appears as a segment of an out-of-workspace
 * absolute path, remap the remainder into the workspace. Returns null when no
 * safe remapping exists.
 */
function remapAbsolutePathIntoWorkspace(filePath: string, workspaceDir: string): string | null {
    const workspaceName = path.basename(workspaceDir);
    if (workspaceName.length === 0) {
        return null;
    }

    const segments = path.normalize(filePath).split(path.sep).filter(Boolean);
    const workspaceIndex = segments.lastIndexOf(workspaceName);
    if (workspaceIndex === -1) {
        return null;
    }

    const remapped = path.resolve(workspaceDir, ...segments.slice(workspaceIndex + 1));
    return isWithinDirectory(remapped, workspaceDir) ? remapped : null;
}

/**
 * Validate if a path is within the workspace directory (supports both absolute and relative paths)
 */
export function validateWorkspacePath(
    filePath: string,
    context: ExecutionContext
): ToolErrorResponse | null {
    try {
        // Prevent directory traversal attacks
        if (filePath.includes('..')) {
            return handleToolError(
                'Path cannot contain ".." for security reasons',
                'Path validation',
                'security'
            );
        }

        const normalizedWorkspace = path.normalize(context.workingDirectory);

        // Handle both absolute and relative paths
        let resolvedPath: string;
        if (path.isAbsolute(filePath)) {
            resolvedPath = path.normalize(filePath);
        } else {
            resolvedPath = path.resolve(context.workingDirectory, filePath);
        }

        // Check if path is within workspace boundary
        if (!isWithinDirectory(resolvedPath, normalizedWorkspace)) {
            if (remapAbsolutePathIntoWorkspace(filePath, normalizedWorkspace) !== null) {
                return null;
            }
            return handleToolError(
                `Path must be within the workspace directory (${normalizedWorkspace}): ${filePath}. ` +
                    `Use a path relative to the workspace root instead, e.g. ".superdesign/design_iterations/file.html"`,
                'Security check',
                'security'
            );
        }

        return null; // No error
    } catch (error) {
        return handleToolError(error, 'Path validation', 'validation');
    }
}

/**
 * Safely resolve a file path (supports both absolute and relative paths).
 * Must stay in sync with validateWorkspacePath so a validated path resolves
 * to the same location the validation approved.
 */
export function resolveWorkspacePath(filePath: string, context: ExecutionContext): string {
    if (path.isAbsolute(filePath)) {
        const normalized = path.normalize(filePath);
        const normalizedWorkspace = path.normalize(context.workingDirectory);
        if (isWithinDirectory(normalized, normalizedWorkspace)) {
            return normalized;
        }
        return remapAbsolutePathIntoWorkspace(filePath, normalizedWorkspace) ?? normalized;
    } else {
        return path.resolve(context.workingDirectory, filePath);
    }
}

/**
 * Create a success response
 */
export function createSuccessResponse(data: Record<string, any>): ToolSuccessResponse {
    return {
        success: true,
        ...data,
    };
}

/**
 * Validation helper for required string parameters
 */
export function validateRequiredString(value: any, paramName: string): ToolErrorResponse | null {
    if (!value || typeof value !== 'string' || value.trim() === '') {
        return handleToolError(
            `${paramName} is required and must be a non-empty string`,
            'Parameter validation',
            'validation'
        );
    }
    return null;
}

/**
 * Validation helper for file existence
 */
export function validateFileExists(
    absolutePath: string,
    filePath: string
): ToolErrorResponse | null {
    try {
        if (!fs.existsSync(absolutePath)) {
            return handleToolError(
                `File not found: ${filePath}`,
                'File existence check',
                'file_not_found'
            );
        }
        return null;
    } catch (error) {
        return handleToolError(error, 'File existence check', 'permission');
    }
}

/**
 * Validation helper for directory existence
 */
export function validateDirectoryExists(
    absolutePath: string,
    dirPath: string
): ToolErrorResponse | null {
    try {
        if (!fs.existsSync(absolutePath)) {
            return handleToolError(
                `Directory not found: ${dirPath}`,
                'Directory existence check',
                'file_not_found'
            );
        }

        const stats = fs.statSync(absolutePath);
        if (!stats.isDirectory()) {
            return handleToolError(
                `Path is not a directory: ${dirPath}`,
                'Directory validation',
                'validation'
            );
        }

        return null;
    } catch (error) {
        return handleToolError(error, 'Directory validation', 'permission');
    }
}
