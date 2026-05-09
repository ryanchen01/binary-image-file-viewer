import * as assert from 'assert';
import * as vscode from 'vscode';
import { BinaryImageEditorProvider } from '../binaryImageEditorProvider';
import { SliceReader } from '../sliceReader';
import { applyWindowLevel, calculateMaxSlices, getBytesPerPixel } from '../utils';

suite('BinaryImageEditorProvider', () => {
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    const provider = new BinaryImageEditorProvider(context);

    test('getBytesPerPixel returns expected values', () => {
        assert.strictEqual(getBytesPerPixel('uint8'), 1);
        assert.strictEqual(getBytesPerPixel('uint16'), 2);
        assert.strictEqual(getBytesPerPixel('int16'), 2);
        assert.strictEqual(getBytesPerPixel('float32'), 4);
        assert.strictEqual(getBytesPerPixel('int32'), 4);
        assert.strictEqual(getBytesPerPixel('float64'), 8);
        assert.strictEqual(getBytesPerPixel('unknown' as any), 4);
    });

    test('calculateMaxSlices computes correct slice count', () => {
        const fileSize = 200;
        const slices = calculateMaxSlices(fileSize, 10, 5, 'uint8');
        assert.strictEqual(slices, 4);
    });

    test('slice reader computes axial slice byte ranges', () => {
        const reader = new SliceReader();
        const range = reader.getAxialSliceRange(400, 10, 5, 2, 'uint16');
        assert.deepStrictEqual(range, { offset: 200, length: 100 });
    });

    test('applyWindowLevel maps values into 0-255 range', () => {
        const values = [0, 50, 100, 150];
        const mapped = applyWindowLevel(values, 0, 100);
        assert.deepStrictEqual(Array.from(mapped), [0, 128, 255, 255]);
    });

    test('generated HTML includes window controls', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);
        assert.ok(html.includes('id="windowMin"'));
        assert.ok(html.includes('id="windowMax"'));
        assert.ok(html.includes('id="resetWindow"'));
        assert.ok(html.includes('id="reloadSlice"'));
    });

    test('generated HTML can shrink inside resized VS Code editor area', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);
        assert.ok(html.includes('overflow: auto;'));
        assert.ok(html.includes('min-height: 0;'));
        assert.ok(html.includes('ResizeObserver'));
        assert.ok(!html.includes('calc(100vh - 48px)'));
        assert.ok(!html.includes('min-height: 400px'));
    });

    test('generated HTML coalesces slice requests and supports manual reloads', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);
        assert.ok(html.includes('pendingSliceRequest'));
        assert.ok(html.includes('decodeSliceData'));
        assert.ok(html.includes('requestSlice(false)'));
        assert.ok(html.includes('requestSlice(true)'));
        assert.ok(html.includes('updateFileSize(data.fileSize)'));
        assert.ok(!html.includes('computeGlobalWindow'));
    });

    test('generated HTML preserves window values across slice changes and only clips slider positions to the new slice range', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);
        const updateIndex = html.indexOf('updateSliceRange(currentSliceData);');
        const renderIndex = html.indexOf('renderSlice(currentSliceData);', updateIndex);
        const resetIndex = html.indexOf('resetWindowToSliceRange();', updateIndex);
        assert.ok(updateIndex >= 0);
        assert.ok(renderIndex > updateIndex);
        assert.ok(resetIndex === -1 || resetIndex > renderIndex);
        assert.ok(html.includes('clipWindowValueToSliceRange(windowMin)'));
        assert.ok(!html.includes('syncWindowToSliceRange()'));
        assert.ok(!html.includes('windowMin = clippedWindowMin;'));
        assert.ok(!html.includes('windowMax = clippedWindowMax;'));
        assert.ok(html.includes('windowMinInput.min = controlMin;'));
        assert.ok(html.includes('windowMaxInput.max = controlMax;'));
    });

    test('openCustomDocument returns a document with the same URI', async () => {
        const uri = vscode.Uri.file('/tmp/test.raw');
        const doc = await provider.openCustomDocument(uri, {} as any, {} as any);
        assert.strictEqual(doc.uri.fsPath, uri.fsPath);
        assert.ok(typeof doc.dispose === 'function');
    });
});
