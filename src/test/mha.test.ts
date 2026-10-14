import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { BinaryImageEditorProvider } from '../binaryImageEditorProvider';
import { CONSTANTS } from '../constants';
import { openMhdText, openMhdViewer } from '../mhdCommands';
import { readMhaHeader } from '../mhaReader';
import { parseMhdHeader } from '../mhdParser';

function makeHeader(newline = '\n', extra: string[] = []): Buffer {
    return Buffer.from([
        'ObjectType = Image',
        'NDims = 3',
        'BinaryData = True',
        'BinaryDataByteOrderMSB = True',
        'CompressedData = False',
        'DimSize = 2 3 2',
        'ElementType = MET_USHORT',
        ...extra,
        'ElementDataFile = LOCAL',
        ''
    ].join(newline));
}

suite('MHA embedded images', () => {
    let directory: string;
    let uri: vscode.Uri;
    const token = { isCancellationRequested: false } as vscode.CancellationToken;

    setup(async () => {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'viewer-mha-'));
        uri = vscode.Uri.file(path.join(directory, 'image.mha'));
    });

    teardown(async () => {
        await fs.rm(directory, { recursive: true, force: true });
    });

    for (const newline of ['\n', '\r\n']) {
        test(`reads exact axial and coronal pixel bytes with ${newline === '\n' ? 'LF' : 'CRLF'} headers`, async () => {
            const header = makeHeader(newline);
            const pixels = Buffer.alloc(24);
            for (let index = 0; index < 12; index++) { pixels.writeUInt16BE(1000 + index, index * 2); }
            // Trailing bytes must not create extra coronal rows or slices.
            await fs.writeFile(uri.fsPath, Buffer.concat([header, pixels, Buffer.alloc(24, 255)]));
            const provider = new BinaryImageEditorProvider();
            const document = await provider.openCustomDocument(uri, {} as vscode.CustomDocumentOpenContext, token);
            assert.strictEqual(document.dataUri.fsPath, uri.fsPath);
            assert.strictEqual(document.dataOffset, header.length);

            const messages: any[] = [];
            let receive!: (message: any) => Promise<void>;
            await provider.resolveCustomEditor(document, {
                webview: {
                    postMessage: (message: any) => messages.push(message),
                    onDidReceiveMessage: (listener: any) => { receive = listener; return { dispose: () => undefined }; }
                },
                onDidDispose: () => undefined
            } as any, token);
            await receive({ type: 'ready' });
            assert.deepStrictEqual(messages[0], {
                type: 'fileInfo', fileSize: pixels.length,
                width: 2, height: 3, depth: 2, dataType: 'uint16', endianness: 'big',
                sourceFile: uri.fsPath, metadataFile: uri.fsPath
            });
            for (const slice of [0, 1]) {
                await receive({ type: 'readSlice', requestId: slice, width: 2, height: 3, slice, dataType: 'uint16', plane: 'axial', endianness: false });
                const message = messages[messages.length - 1];
                assert.strictEqual(message.type, 'sliceData');
                assert.strictEqual(message.fileSize, 24);
                assert.strictEqual(message.endianness, false);
                assert.deepStrictEqual(Buffer.from(message.data), pixels.subarray(slice * 12, (slice + 1) * 12));
            }
            await receive({ type: 'readSlice', requestId: 3, width: 2, height: 3, slice: 1, dataType: 'uint16', plane: 'coronal' });
            const coronal = messages[messages.length - 1];
            assert.strictEqual(coronal.width, 2);
            assert.strictEqual(coronal.height, 2);
            assert.deepStrictEqual(Buffer.from(coronal.data), Buffer.concat([pixels.subarray(4, 8), pixels.subarray(16, 20)]));
            await receive({ type: 'readSlice', requestId: 4, width: 2, height: 3, slice: 2, dataType: 'uint16', plane: 'axial' });
            assert.strictEqual(messages[messages.length - 1].type, 'error');

            await fs.truncate(uri.fsPath, header.length + pixels.length - 1);
            await receive({ type: 'ready' });
            assert.match(messages[messages.length - 1].message, /truncated/);
            await receive({ type: 'readSlice', requestId: 5, width: 2, height: 3, slice: 0, dataType: 'uint16' });
            assert.match(messages[messages.length - 1].message, /truncated/);
        });
    }

    test('uses MetaImage defaults for omitted binary, compression, and byte order fields', async () => {
        const header = Buffer.from('NDims = 2\nDimSize = 2 2\nElementType = MET_UCHAR\nElementDataFile = LOCAL\n');
        await fs.writeFile(uri.fsPath, Buffer.concat([header, Buffer.from([10, 13, 0, 255])]));
        const result = await readMhaHeader(uri, token);
        assert.strictEqual(result.dataOffset, header.length);
        assert.strictEqual(result.dataLength, 4);
        assert.strictEqual(result.metadata.depth, 1);
        assert.strictEqual(result.metadata.endianness, 'little');
    });

    test('stops parsing at LOCAL even when pixels look like header fields', async () => {
        const header = makeHeader();
        const pixels = Buffer.from('DimSize = 999 999\nElementType = MET_FLOAT\n');
        await fs.writeFile(uri.fsPath, Buffer.concat([header, pixels]));
        const result = await readMhaHeader(uri, token);
        assert.strictEqual(result.metadata.width, 2);
        assert.strictEqual(result.metadata.dataType, 'uint16');
        assert.strictEqual(result.dataOffset, header.length);
    });

    test('handles a header line and the LOCAL delimiter split across read chunks', async () => {
        const delimiter = 'ElementDataFile = LOCAL\r\n';
        const prefix = makeHeader('\r\n').subarray(0, -Buffer.byteLength(delimiter));
        const padding = Buffer.from('#' + 'x'.repeat(3 * 4096 - 10 - prefix.length - 3) + '\r\n');
        const header = Buffer.concat([prefix, padding, Buffer.from(delimiter)]);
        assert.strictEqual(header.indexOf('ElementDataFile'), 3 * 4096 - 10);
        await fs.writeFile(uri.fsPath, Buffer.concat([header, Buffer.alloc(24)]));
        assert.strictEqual((await readMhaHeader(uri, token)).dataOffset, header.length);
    });

    test('reads a bounded prefix when opening a large volume', async () => {
        const fileSystem = require('fs/promises') as typeof fs;
        const originalOpen = fileSystem.open;
        const header = Buffer.from('DimSize = 1024 1024\nElementType = MET_UCHAR\nElementDataFile = LOCAL\n');
        await fs.writeFile(uri.fsPath, Buffer.concat([header, Buffer.alloc(1024 * 1024)]));
        let bytesRead = 0;
        (fileSystem as any).open = async (...args: Parameters<typeof fs.open>) => {
            const handle = await originalOpen(...args);
            return {
                stat: () => handle.stat(),
                close: () => handle.close(),
                read: async (buffer: Buffer, offset: number, length: number, position: number) => {
                    const result = await handle.read(buffer, offset, length, position);
                    bytesRead += result.bytesRead;
                    return result;
                }
            };
        };
        try {
            assert.strictEqual((await readMhaHeader(uri, token)).dataLength, 1024 * 1024);
            assert.ok(bytesRead <= 4096);
        } finally {
            fileSystem.open = originalOpen;
        }
    });

    test('supports explicit and inferred embedded data offsets', async () => {
        for (const size of ['512', '-1']) {
            const header = makeHeader('\n', [`HeaderSize = ${size}`]);
            await fs.writeFile(uri.fsPath, Buffer.concat([header, Buffer.alloc(512 - header.length), Buffer.alloc(24)]));
            assert.strictEqual((await readMhaHeader(uri, token)).dataOffset, 512);
        }
    });

    test('rejects unsupported or invalid payload descriptions before viewing', async () => {
        const cases: Array<[Buffer, RegExp]> = [
            [makeHeader('\n', ['CompressedData = True']), /CompressedData must be False/],
            [makeHeader('\n', ['BinaryData = False']), /BinaryData must be True/],
            [makeHeader('\n', ['ElementNumberOfChannels = 3']), /Channels must be 1/],
            [makeHeader('\n', ['NDims = 4']), /NDims/],
            [makeHeader('\n', ['DimSize = 9007199254740991 3 2']), /safe limit/],
            [makeHeader('\n', [`DimSize = ${CONSTANTS.MAX_FILE_SIZE} 3 2`]), /safe limit/],
            [makeHeader('\n', ['HeaderSize = 1']), /overlaps/],
            [makeHeader('\n', ['HeaderSize = -2']), /HeaderSize/],
            [makeHeader('\n', ['HeaderSize = 2.5']), /HeaderSize/],
            [Buffer.from('DimSize = 2 3 2\nElementType = MET_USHORT\nElementDataFile = image.raw\n'), /expected LOCAL/]
        ];
        for (const [header, expectedError] of cases) {
            await fs.writeFile(uri.fsPath, Buffer.concat([header, Buffer.alloc(24)]));
            await assert.rejects(readMhaHeader(uri, token), expectedError);
        }
    });

    test('rejects truncated pixels and unterminated or oversized headers', async () => {
        await fs.writeFile(uri.fsPath, Buffer.concat([makeHeader(), Buffer.alloc(23)]));
        await assert.rejects(readMhaHeader(uri, token), /truncated/);
        await fs.writeFile(uri.fsPath, makeHeader().subarray(0, -1));
        await assert.rejects(readMhaHeader(uri, token), /newline-terminated/);
        await fs.writeFile(uri.fsPath, '#'.repeat(1024 * 1024) + '\nElementDataFile = LOCAL\n');
        await assert.rejects(readMhaHeader(uri, token), /header limit/);
    });

    test('honors cancellation and requires a local file URI', async () => {
        await fs.writeFile(uri.fsPath, Buffer.concat([makeHeader(), Buffer.alloc(24)]));
        await assert.rejects(readMhaHeader(uri, { isCancellationRequested: true } as vscode.CancellationToken), /cancelled/);
        await assert.rejects(new BinaryImageEditorProvider().openCustomDocument({
            fsPath: uri.fsPath, scheme: 'https'
        } as vscode.Uri, {} as vscode.CustomDocumentOpenContext, token), /local file system/);
    });

    test('keeps embedded data opt-in for the existing MHD parser', () => {
        assert.throws(() => parseMhdHeader(makeHeader().toString()), /Unsupported MHD ElementDataFile: LOCAL/);
        assert.strictEqual(parseMhdHeader(makeHeader().toString(), true).elementDataFile, 'LOCAL');
    });

    test('viewer and text commands accept uppercase MHA paths and active editors', async () => {
        const targetUri = vscode.Uri.file(path.join(directory, 'image.MHA'));
        const calls: unknown[][] = [];
        const services = {
            executeCommand: async (...args: unknown[]) => { calls.push(args); },
            showErrorMessage: async (message: string) => { assert.fail(message); },
            activeTextEditor: { document: { uri: targetUri } }
        };
        await openMhdViewer(undefined, services);
        await openMhdText(targetUri, services);
        assert.strictEqual(calls[0][1], targetUri);
        assert.strictEqual(calls[0][2], CONSTANTS.VIEW_TYPES.MHD_EDITOR);
        assert.strictEqual(calls[1][2], 'default');
    });
});
