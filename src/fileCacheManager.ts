import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { CONSTANTS } from './constants';

/**
 * Manages file caching and size validation for binary image files
 */
export class FileCacheManager {
    private fileCache = new Map<string, Uint8Array>();

    /**
     * Get file data from cache or read from disk if not cached
     */
    public async getFileData(uri: vscode.Uri): Promise<Uint8Array> {
        const cacheKey = uri.toString();

        if (this.fileCache.has(cacheKey)) {
            return this.fileCache.get(cacheKey)!;
        }

        try {
            const stats = await vscode.workspace.fs.stat(uri);
            if (stats.size > CONSTANTS.MAX_FILE_SIZE) {
                throw new Error(`File size ${stats.size} exceeds safe limit`);
            }

            const fileData = await vscode.workspace.fs.readFile(uri);
            this.fileCache.set(cacheKey, fileData);
            return fileData;
        } catch (err) {
            throw new Error(`Unable to read file: ${err}`);
        }
    }

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
     * Read a byte range without forcing the whole file into memory.
     */
    public async readFileRange(uri: vscode.Uri, offset: number, length: number, token?: vscode.CancellationToken): Promise<Uint8Array> {
        return this.readFileRanges(uri, [{ offset, length }], token);
    }

    /**
     * Read one or more byte ranges with a single file handle.
     */
    public async readFileRanges(uri: vscode.Uri, ranges: Array<{ offset: number; length: number }>, token?: vscode.CancellationToken): Promise<Uint8Array> {
        let totalLength = 0;
        for (const range of ranges) {
            this.validateFileRange(range.offset, range.length);
            totalLength += range.length;
        }

        try {
            this.throwIfCancelled(token);
            const stats = await this.getFileStats(uri);
            for (const range of ranges) {
                if (range.offset + range.length > stats.size) {
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
                const readNext = async (): Promise<void> => {
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
                };
                // Settle every reader before closing the shared handle on failure.
                const results = await Promise.allSettled(Array.from(
                    { length: Math.min(CONSTANTS.FILE_READ_CONCURRENCY, ranges.length) }, readNext
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

    private validateFileRange(offset: number, length: number): void {
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0) {
            throw new Error('Invalid file range');
        }
    }

    private throwIfCancelled(token?: vscode.CancellationToken): void {
        if (token?.isCancellationRequested) {
            throw new Error('Slice read cancelled');
        }
    }

    /**
     * Remove file from cache
     */
    public evictFile(uri: vscode.Uri): void {
        this.fileCache.delete(uri.toString());
    }

    /**
     * Clear entire cache
     */
    public clearCache(): void {
        this.fileCache.clear();
    }

    /**
     * Check if file is cached
     */
    public isCached(uri: vscode.Uri): boolean {
        return this.fileCache.has(uri.toString());
    }

    /**
     * Get cache size (number of files)
     */
    public getCacheSize(): number {
        return this.fileCache.size;
    }

    /**
     * Force reload file from disk
     */
    public async reloadFile(uri: vscode.Uri): Promise<Uint8Array> {
        this.evictFile(uri);
        return this.getFileData(uri);
    }
}
