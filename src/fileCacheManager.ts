import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { CONSTANTS } from './constants';

/**
 * Reads binary image ranges with size validation and cancellation
 */
export class FileCacheManager {
    /**
     * Get validated file metadata.
     */
    public async getFileStats(uri: vscode.Uri): Promise<vscode.FileStat> {
        try {
            const stats = await vscode.workspace.fs.stat(uri);
            if (stats.size > CONSTANTS.MAX_FILE_SIZE) {
                throw new Error(`File size ${stats.size} exceeds safe limit`);
            }
            return stats;
        } catch (err) {
            throw new Error(`Unable to read file metadata: ${err}`);
        }
    }

    /**
     * Read one or more byte ranges with a single file handle.
     */
    public async readFileRanges(uri: vscode.Uri, ranges: Array<{ offset: number; length: number }>, token?: vscode.CancellationToken): Promise<Uint8Array> {
        let totalLength = 0;
        for (const range of ranges) {
            if (!Number.isSafeInteger(range.offset) || range.offset < 0 || !Number.isSafeInteger(range.length) || range.length < 0) {
                throw new Error('Invalid file range');
            }
            totalLength += range.length;
            if (!Number.isSafeInteger(totalLength) || totalLength > CONSTANTS.MAX_FILE_SIZE) {
                throw new Error('Requested ranges exceed safe limit');
            }
        }

        try {
            this.throwIfCancelled(token);
            const stats = await this.getFileStats(uri);
            for (const range of ranges) {
                if (!Number.isSafeInteger(range.offset + range.length) || range.offset + range.length > stats.size) {
                    throw new Error('Requested range extends beyond file size');
                }
            }

            this.throwIfCancelled(token);
            const fileHandle = await fs.open(uri.fsPath, 'r');
            try {
                this.throwIfCancelled(token);
                const buffer = Buffer.allocUnsafe(totalLength);
                const targetOffsets: number[] = [];
                let targetOffset = 0;
                for (const range of ranges) {
                    targetOffsets.push(targetOffset);
                    targetOffset += range.length;
                }
                let nextRange = 0;
                let failed = false;
                // Settle every reader before closing the shared handle on failure.
                const results = await Promise.allSettled(Array.from(
                    { length: Math.min(CONSTANTS.FILE_READ_CONCURRENCY, ranges.length) },
                    async (): Promise<void> => {
                        try {
                            while (!failed && nextRange < ranges.length) {
                                this.throwIfCancelled(token);
                                const index = nextRange++;
                                const range = ranges[index];
                                let completed = 0;
                                while (completed < range.length) {
                                    this.throwIfCancelled(token);
                                    const { bytesRead } = await fileHandle.read(
                                        buffer, targetOffsets[index] + completed,
                                        range.length - completed, range.offset + completed
                                    );
                                    if (bytesRead === 0) {
                                        throw new Error('Unexpected end of file while reading slice');
                                    }
                                    completed += bytesRead;
                                }
                            }
                        } catch (error) {
                            failed = true;
                            throw error;
                        }
                    }
                ));
                const failure = results.find(result => result.status === 'rejected');
                if (failure?.status === 'rejected') {
                    throw failure.reason;
                }
                this.throwIfCancelled(token);
                return buffer;
            } finally {
                await fileHandle.close();
            }
        } catch (err) {
            throw new Error(`Unable to read file range: ${err}`);
        }
    }

    private throwIfCancelled(token?: vscode.CancellationToken): void {
        if (token?.isCancellationRequested) {
            throw new Error('Slice read cancelled');
        }
    }
}
