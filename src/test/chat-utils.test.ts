import * as assert from 'assert';
import { normalizeToolInput } from '../webview/utils/chatUtils';

function testObjectInputPassesThrough(): void {
    const raw = { file_path: 'design.html', description: 'Create page' };
    const { input, display } = normalizeToolInput(raw);
    assert.deepStrictEqual(input, raw);
    assert.ok(display.includes('design.html'));
    console.log('✓ object input passes through');
}

function testStringInputIsParsed(): void {
    // DeepSeek and some OpenRouter-routed models deliver input as a JSON string,
    // which previously crashed rendering with:
    // "Cannot use 'in' operator to search for 'description'"
    const raw = JSON.stringify({
        file_path: 'design_iterations/ui_1.html',
        create_dirs: true,
        content: '<html></html>',
    });
    const { input, display } = normalizeToolInput(raw);
    assert.ok(input !== undefined);
    assert.strictEqual(input.file_path, 'design_iterations/ui_1.html');
    assert.strictEqual(input.create_dirs, true);
    assert.ok(display.includes('ui_1.html'));
    console.log('✓ JSON string input is parsed to an object');
}

function testMalformedStringInputDoesNotThrow(): void {
    // Truncated mid-stream payloads must render raw instead of crashing
    const raw = '{"file_path": "design.html", "content": "<html>';
    const { input, display } = normalizeToolInput(raw);
    assert.strictEqual(input, undefined);
    assert.strictEqual(display, raw);
    console.log('✓ malformed JSON string renders raw without throwing');
}

function testNullAndUndefined(): void {
    assert.deepStrictEqual(normalizeToolInput(undefined), { input: undefined, display: '' });
    assert.deepStrictEqual(normalizeToolInput(null), { input: undefined, display: '' });
    console.log('✓ null/undefined input is handled');
}

function testNonObjectJsonString(): void {
    const { input, display } = normalizeToolInput('"just a string"');
    assert.strictEqual(input, undefined);
    assert.strictEqual(display, '"just a string"');
    console.log('✓ non-object JSON string renders raw');
}

function testArrayAndPrimitiveInputs(): void {
    const arrayResult = normalizeToolInput([1, 2, 3]);
    assert.strictEqual(arrayResult.input, undefined);
    const numberResult = normalizeToolInput(42);
    assert.strictEqual(numberResult.input, undefined);
    assert.strictEqual(numberResult.display, '42');
    console.log('✓ array and primitive inputs are handled');
}

function main(): void {
    console.log('Running chatUtils.normalizeToolInput tests...');
    testObjectInputPassesThrough();
    testStringInputIsParsed();
    testMalformedStringInputDoesNotThrow();
    testNullAndUndefined();
    testNonObjectJsonString();
    testArrayAndPrimitiveInputs();
    console.log('All chatUtils tests passed.');
}

main();
