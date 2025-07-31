AGENTS.md

Build/lint/test
- Install: npm ci
- Build: npm run compile (webpack), watch: npm run watch, package: npm run package
- Lint: npm run lint (eslint src)
- Test (integration via VS Code): npm test (runs @vscode/test-cli). Pretest compiles and lints.
- Single test: use mocha grep via CLI env: npx mocha out/test/**/*.test.js --grep "pattern" after npm run pretest; or run VS Code Test UI.

TypeScript/formatting/style
- Language: TS target ES2022, module Node16, strict: true (tsconfig.json:1-15)
- ESLint: @typescript-eslint with rules: naming-convention for imports camelCase/PascalCase, curly, eqeqeq, no-throw-literal, semi as warnings (eslint.config.mjs:17-27)
- Imports: use ES module syntax; extension code imports from 'vscode' and Node core only; avoid default exports; match existing relative paths (src/*.ts)
- Types: no implicit any; prefer explicit types for public functions; narrow types; use vscode types for API surfaces
- Naming: camelCase for variables/functions; PascalCase for classes; import identifiers camelCase/PascalCase per rule
- Errors: throw Error objects; do not throw literals; wrap fs/workspace calls in try/catch; surface user-facing errors via webview postMessage {type:'error', message}
- Async: prefer async/await with CancellationToken where applicable; avoid blocking I/O
- UI/webview: keep scripts self-contained; no external URLs; set webview.options.enableScripts=true consciously; retainContextWhenHidden as needed
- Performance: cap file sizes (MAX_FILE_SIZE) and use caching (fileCache) patterns as in BinaryImageEditorProvider

Conventions
- Build artifacts in dist/ and out/ are generated; do not edit by hand
- Do not add new deps unless necessary; webpack bundles src/extension.ts only; keep externals.vscode
- Run lint and tests before PRs; ensure package.json main points to dist/extension.js
- No Cursor/Copilot rules present
