const fs = require('fs/promises');
const path = require('path');

exports.Uri = class {
    constructor(fsPath) { this.fsPath = path.resolve(fsPath); this.scheme = 'file'; }
    static file(filename) { return new exports.Uri(filename); }
    toString() { return this.fsPath; }
};
exports.workspace = {
    fs: {
        readFile: uri => fs.readFile(uri.fsPath),
        stat: uri => fs.stat(uri.fsPath)
    },
    getConfiguration: () => ({ get: (_key, fallback) => fallback })
};
exports.CancellationTokenSource = class {
    token = { isCancellationRequested: false };
    cancel() { this.token.isCancellationRequested = true; }
    dispose() {}
};
exports.ViewColumn = { Active: -1 };
exports.window = {
    registerCustomEditorProvider: () => ({ dispose() {} })
};
