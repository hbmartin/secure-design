export interface DesignFile {
    /** The file name only (e.g., "design.html") */
    name: string;

    /** Absolute file system path */
    path: string;

    /** Workspace-relative path (e.g., ".superdesign/design_iterations/v1/design.html") */
    relativePath: string;

    /** Workspace name (only present in multi-root workspaces) */
    workspaceName?: string;

    /** File content as string */
    content: string;

    /** File size in bytes */
    size: number;

    /** Last modified date (ISO string) */
    modified: string;

    /** File type - either 'html' or 'svg' */
    fileType: 'html' | 'svg';
}
