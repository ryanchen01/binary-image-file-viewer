import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { BinaryImageEditorProvider } from '../binaryImageEditorProvider';
import { CONSTANTS } from '../constants';
import { FileCacheManager } from '../fileCacheManager';
import { SliceReader } from '../sliceReader';

suite('Slice I/O', () => {
    test('concurrent coronal extraction preserves row order and exact bytes', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'viewer-io-'));
        try {
            const filename = path.join(directory, 'volume.raw');
            const bytes = Buffer.from(Array.from({ length: 8 * 4 * 16 * 2 }, (_, index) => index % 251));
            await fs.writeFile(filename, bytes);
            const uri = vscode.Uri.file(filename);
            const reader = new SliceReader();
            const manager = new FileCacheManager();
            const { ranges } = reader.getCoronalSliceRanges(bytes.length, 8, 4, 2, 'uint16');
            const result = await manager.readFileRanges(uri, ranges);
            assert.deepStrictEqual(Buffer.from(result), Buffer.concat(ranges.map(range => bytes.subarray(range.offset, range.offset + range.length))));

            const messages: any[] = [];
            const provider = new BinaryImageEditorProvider({ subscriptions: [] } as any);
            await (provider as any).readSlice({ postMessage: (message: any) => messages.push(message) }, uri, 8, 4, 2, 'uint16', true, 'coronal');
            assert.strictEqual(messages[0].encoding, 'binary');
            assert.ok(messages[0].data instanceof ArrayBuffer);
            assert.strictEqual(messages[0].data.byteLength, result.byteLength, 'pooled buffers must not send unrelated bytes');
            assert.deepStrictEqual(Buffer.from(messages[0].data), Buffer.from(result));
        } finally {
            await fs.rm(directory, { recursive: true, force: true });
        }
    });

    test('rejects cancellation before opening a file', async () => {
        const manager = new FileCacheManager();
        await assert.rejects(manager.readFileRanges(vscode.Uri.file('/not/a/file'), [{ offset: 0, length: 1 }], {
            isCancellationRequested: true
        } as vscode.CancellationToken), /cancelled/);
    });

    test('limits concurrency, handles short reads, and closes only after all readers finish', async () => {
        const fileSystem = require('fs/promises') as typeof fs;
        const originalOpen = fileSystem.open;
        let active = 0;
        let peak = 0;
        let closed = false;
        const manager = new FileCacheManager();
        manager.getFileStats = async () => ({ size: 512 } as vscode.FileStat);
        (fileSystem as any).open = async () => ({
            read: async (buffer: Buffer, target: number, length: number, offset: number) => {
                active++; peak = Math.max(peak, active);
                await new Promise<void>(resolve => setImmediate(resolve));
                const bytesRead = Math.min(2, length);
                for (let i = 0; i < bytesRead; i++) { buffer[target + i] = (offset + i) % 256; }
                active--;
                return { bytesRead };
            },
            close: async () => { assert.strictEqual(active, 0); closed = true; }
        });
        try {
            const ranges = Array.from({ length: 32 }, (_, i) => ({ offset: i * 8, length: 4 }));
            const result = await manager.readFileRanges(vscode.Uri.file('/mock'), ranges);
            const expected = ranges.flatMap(range => Array.from({ length: range.length }, (_, i) => (range.offset + i) % 256));
            assert.deepStrictEqual(Array.from(result), expected);
            assert.ok(peak > 1);
            assert.ok(peak <= CONSTANTS.FILE_READ_CONCURRENCY);
            assert.ok(closed);
        } finally {
            fileSystem.open = originalOpen;
        }
    });

    test('stops scheduling rows on cancellation and waits for in-flight reads before closing', async () => {
        const fileSystem = require('fs/promises') as typeof fs;
        const originalOpen = fileSystem.open;
        const token = { isCancellationRequested: false };
        let started = 0;
        let finished = 0;
        let closed = false;
        const manager = new FileCacheManager();
        manager.getFileStats = async () => ({ size: 1000 } as vscode.FileStat);
        (fileSystem as any).open = async () => ({
            read: async (_buffer: Buffer, _target: number, length: number) => {
                started++;
                await new Promise<void>(resolve => setImmediate(resolve));
                token.isCancellationRequested = true;
                finished++;
                return { bytesRead: length };
            },
            close: async () => { assert.strictEqual(finished, started); closed = true; }
        });
        try {
            const ranges = Array.from({ length: 100 }, (_, offset) => ({ offset, length: 1 }));
            await assert.rejects(manager.readFileRanges(vscode.Uri.file('/mock'), ranges, token as vscode.CancellationToken), /cancelled/);
            assert.ok(started <= CONSTANTS.FILE_READ_CONCURRENCY);
            assert.ok(closed);
        } finally {
            fileSystem.open = originalOpen;
        }
    });

    test('panel messages cancel a pending read before slice data crosses the remote connection', async () => {
        const provider = new BinaryImageEditorProvider({ subscriptions: [] } as any);
        const manager = (provider as any).fileCacheManager;
        manager.getFileStats = async () => ({ size: 4 });
        let startRead!: () => void;
        const started = new Promise<void>(resolve => { startRead = resolve; });
        let finishRead!: () => void;
        const pending = new Promise<void>(resolve => { finishRead = resolve; });
        manager.readFileRange = async (_uri: any, _offset: number, _length: number, token: vscode.CancellationToken) => {
            startRead(); await pending;
            assert.ok(token.isCancellationRequested);
            return new Uint8Array(4);
        };
        let receive!: (message: any) => Promise<void>;
        const messages: any[] = [];
        const document = await provider.openCustomDocument(vscode.Uri.file('/mock.raw'), {} as any, {} as any);
        await provider.resolveCustomEditor(document, {
            webview: {
                postMessage: (message: any) => messages.push(message),
                onDidReceiveMessage: (listener: any) => { receive = listener; return { dispose: () => undefined }; }
            }, onDidDispose: () => undefined
        } as any, {} as any);
        const read = receive({ type: 'readSlice', requestId: 1, width: 2, height: 2, slice: 0, dataType: 'uint8' });
        await started;
        await receive({ type: 'cancelSlice', requestId: 1 });
        finishRead(); await read;
        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0].type, 'error');
        assert.strictEqual(messages[0].cancelled, true);
    });

    test('a failed row stops new reads and waits for existing reads before closing', async () => {
        const fileSystem = require('fs/promises') as typeof fs;
        const originalOpen = fileSystem.open;
        let active = 0;
        let started = 0;
        let closed = false;
        const manager = new FileCacheManager();
        manager.getFileStats = async () => ({ size: 100 } as vscode.FileStat);
        (fileSystem as any).open = async () => ({
            read: async (_buffer: Buffer, _target: number, length: number, offset: number) => {
                active++; started++;
                await new Promise<void>(resolve => setImmediate(resolve));
                active--;
                if (offset === 0) { throw new Error('disk read failed'); }
                return { bytesRead: length };
            },
            close: async () => { assert.strictEqual(active, 0); closed = true; }
        });
        try {
            await assert.rejects(manager.readFileRanges(vscode.Uri.file('/mock'),
                Array.from({ length: 100 }, (_, offset) => ({ offset, length: 1 }))
            ), /disk read failed/);
            assert.ok(started <= CONSTANTS.FILE_READ_CONCURRENCY);
            assert.ok(closed);
        } finally {
            fileSystem.open = originalOpen;
        }
    });
});
