const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const debug = process.argv.includes('--debug');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd(result => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });
            console.log('[watch] build finished');
        });
    },
};

async function main() {
    const ctx = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: debug ? 'inline' : !production,
        sourcesContent: !!debug,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [
            /* add to the end of plugins array */
            esbuildProblemMatcherPlugin,
        ],
    });

    // Webview build context
    const webviewCtx = await esbuild.context({
        entryPoints: ['src/webview/index.tsx'],
        bundle: true,
        format: 'esm',
        minify: production && !debug,
        sourcemap: debug ? 'inline' : !production,
        sourcesContent: !!debug,
        platform: 'browser',
        outfile: 'dist/webview.js',
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
        loader: {
            '.css': 'text',
            '.png': 'file',
            '.jpg': 'file',
            '.svg': 'file',
        },
        define: {
            'process.env.NODE_ENV': production ? '"production"' : '"development"',
        },
        jsx: 'automatic', // This enables JSX support
        keepNames: debug, // Preserve function names for better stack traces
    });

    if (watch) {
        await Promise.all([ctx.watch(), webviewCtx.watch()]);
        console.log('Watching for changes...');
    } else {
        await Promise.all([ctx.rebuild(), webviewCtx.rebuild()]);
        await ctx.dispose();
        await webviewCtx.dispose();

        console.log('Build complete!');
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
