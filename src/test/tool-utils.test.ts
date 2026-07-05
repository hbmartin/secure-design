import * as assert from 'assert';
import * as path from 'path';
import { validateWorkspacePath, resolveWorkspacePath } from '../tools/tool-utils';
import type { ExecutionContext } from '../types/agent';

const WORKSPACE = path.resolve(path.sep, 'home', 'user', 'landpage');

const context = {
    workingDirectory: WORKSPACE,
    sessionId: 'test-session',
    logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
    },
} as unknown as ExecutionContext;

function testRelativePathIsAccepted(): void {
    assert.strictEqual(validateWorkspacePath('design_iterations/ui.html', context), null);
    assert.strictEqual(
        resolveWorkspacePath('design_iterations/ui.html', context),
        path.join(WORKSPACE, 'design_iterations', 'ui.html')
    );
    console.log('✓ relative paths resolve inside the workspace');
}

function testAbsolutePathInsideWorkspaceIsAccepted(): void {
    const inside = path.join(WORKSPACE, 'theme.css');
    assert.strictEqual(validateWorkspacePath(inside, context), null);
    assert.strictEqual(resolveWorkspacePath(inside, context), inside);
    console.log('✓ absolute paths inside the workspace are accepted');
}

function testHallucinatedAbsolutePrefixIsRemapped(): void {
    // Weaker models emit paths like "/path/to/<workspace name>/UI/theme.css"
    const hallucinated = path.join(path.sep, 'path', 'to', 'landpage', 'UI', 'theme.css');
    assert.strictEqual(validateWorkspacePath(hallucinated, context), null);
    assert.strictEqual(
        resolveWorkspacePath(hallucinated, context),
        path.join(WORKSPACE, 'UI', 'theme.css')
    );
    console.log('✓ hallucinated absolute prefix is remapped into the workspace');
}

function testForeignAbsolutePathIsRejectedWithGuidance(): void {
    const foreign = path.join(path.sep, 'etc', 'passwd');
    const error = validateWorkspacePath(foreign, context);
    assert.ok(error !== null);
    assert.strictEqual(error.error_type, 'security');
    assert.ok(error.error.includes('relative to the workspace root'));
    console.log('✓ out-of-workspace absolute paths are rejected with corrective guidance');
}

function testSiblingDirectoryPrefixIsRejected(): void {
    // "/home/user/landpage-evil" must not pass the "/home/user/landpage" prefix check
    const sibling = `${WORKSPACE}-evil${path.sep}file.txt`;
    const error = validateWorkspacePath(sibling, context);
    assert.ok(error !== null);
    assert.strictEqual(error.error_type, 'security');
    console.log('✓ sibling directories sharing a name prefix are rejected');
}

function testTraversalIsRejected(): void {
    const error = validateWorkspacePath('../outside.txt', context);
    assert.ok(error !== null);
    assert.strictEqual(error.error_type, 'security');
    console.log('✓ ".." traversal is rejected');
}

function main(): void {
    console.log('Running tool-utils workspace path tests...');
    testRelativePathIsAccepted();
    testAbsolutePathInsideWorkspaceIsAccepted();
    testHallucinatedAbsolutePrefixIsRemapped();
    testForeignAbsolutePathIsRejectedWithGuidance();
    testSiblingDirectoryPrefixIsRejected();
    testTraversalIsRejected();
    console.log('All tool-utils tests passed.');
}

main();
