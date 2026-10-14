import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { CONSTANTS } from './constants';
import { MhdMetadata, parseMhdHeader } from './mhdParser';
import { getBytesPerPixel } from './utils';

const MAX_HEADER_SIZE = 1024 * 1024;
const HEADER_CHUNK_SIZE = 4096;

export interface MhaData {
    readonly metadata: MhdMetadata;
    readonly dataOffset: number;
    readonly dataLength: number;
}

/** Read only the text header, stopping at the newline before embedded pixels. */
export async function readMhaHeader(uri: vscode.Uri, token: vscode.CancellationToken): Promise<MhaData> {
    const handle = await fs.open(uri.fsPath, 'r');
    try {
        const stats = await handle.stat();
        if (stats.size > CONSTANTS.MAX_FILE_SIZE) {
            throw new Error(`File size ${stats.size} exceeds safe limit`);
        }
        const chunks: Buffer[] = [];
        const lines: string[] = [];
        let lineStart = 0;
        let position = 0;
        while (position < stats.size && position < MAX_HEADER_SIZE) {
            if (token.isCancellationRequested) {
                throw new Error('MHA header read cancelled');
            }
            const buffer = Buffer.allocUnsafe(Math.min(HEADER_CHUNK_SIZE, MAX_HEADER_SIZE - position));
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
            if (bytesRead === 0) { break; }
            for (let index = 0; index < bytesRead; index++) {
                if (buffer[index] !== 10) { continue; }
                chunks.push(buffer.subarray(lineStart, index));
                const line = Buffer.concat(chunks).toString('utf8');
                chunks.length = 0;
                lines.push(line);
                lineStart = index + 1;
                const dataFile = /^\s*ElementDataFile\s*=\s*(.*?)\s*$/i.exec(line);
                if (!dataFile) { continue; }
                if (dataFile[1].toUpperCase() !== 'LOCAL') {
                    throw new Error('Unsupported MHA ElementDataFile: expected LOCAL embedded data');
                }
                const metadata = parseMhdHeader(lines.join('\n'), true);
                const dataLength = metadata.width * metadata.height * metadata.depth * getBytesPerPixel(metadata.dataType);
                if (!Number.isSafeInteger(dataLength) || dataLength > CONSTANTS.MAX_FILE_SIZE) {
                    throw new Error('MHA image data exceeds safe limit');
                }
                let dataOffset = position + index + 1;
                const headerSize = /^\s*HeaderSize\s*=\s*(.*?)\s*$/m.exec(lines.join('\n'))?.[1];
                if (headerSize !== undefined) {
                    if (!/^(?:-1|\d+)$/.test(headerSize) || !Number.isSafeInteger(Number(headerSize))) {
                        throw new Error('Invalid MHA HeaderSize');
                    }
                    const size = Number(headerSize);
                    if (size === -1) { dataOffset = stats.size - dataLength; }
                    else if (size > 0) { dataOffset = size; }
                    if (dataOffset < position + index + 1) {
                        throw new Error('Invalid MHA HeaderSize: image data overlaps the text header');
                    }
                }
                if (dataOffset + dataLength > stats.size) {
                    throw new Error('MHA image data is truncated');
                }
                return { metadata, dataOffset, dataLength };
            }
            chunks.push(buffer.subarray(lineStart, bytesRead));
            lineStart = 0;
            position += bytesRead;
        }
        throw new Error('Invalid MHA header: missing newline-terminated ElementDataFile = LOCAL within the 1 MiB header limit');
    } finally {
        await handle.close();
    }
}
