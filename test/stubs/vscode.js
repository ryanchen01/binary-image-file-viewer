exports.Uri = class {
    constructor(fsPath){ this.fsPath = fsPath; }
    static file(p){ return new exports.Uri(p); }
    toString(){ return this.fsPath; }
};
exports.workspace = {
    fs: {
        async readFile(){ return new Uint8Array(); },
        async stat(){ return { size: 0 }; }
    }
};
exports.window = {
    registerCustomEditorProvider: () => ({})
};
