import * as assert from 'assert';
import * as vscode from 'vscode';
import { BinaryImageEditorProvider } from '../binaryImageEditorProvider';

describe('BinaryImageEditorProvider', () => {
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    const provider = new BinaryImageEditorProvider(context);

    it('getBytesPerPixel returns expected values', () => {
        const asAny = provider as any;
        assert.strictEqual(asAny.getBytesPerPixel('uint8'), 1);
        assert.strictEqual(asAny.getBytesPerPixel('uint16'), 2);
        assert.strictEqual(asAny.getBytesPerPixel('int16'), 2);
        assert.strictEqual(asAny.getBytesPerPixel('float32'), 4);
        assert.strictEqual(asAny.getBytesPerPixel('int32'), 4);
        assert.strictEqual(asAny.getBytesPerPixel('float64'), 8);
        assert.strictEqual(asAny.getBytesPerPixel('unknown'), 4);
    });

    it('calculateMaxSlices computes correct slice count', () => {
        const asAny = provider as any;
        const fileSize = 200;
        const slices = asAny.calculateMaxSlices(fileSize, 10, 5, 'uint8');
        assert.strictEqual(slices, 4);
    });

    it('openCustomDocument returns a document with the same URI', async () => {
        const uri = vscode.Uri.file('/tmp/test.raw');
        const doc = await provider.openCustomDocument(uri, {} as any, {} as any);
        assert.strictEqual(doc.uri.fsPath, uri.fsPath);
        assert.ok(typeof doc.dispose === 'function');
    });
});
