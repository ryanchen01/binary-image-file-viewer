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
    public async readFileRange(uri: vscode.Uri, offset: number, length: number): Promise<Uint8Array> {
        return this.readFileRanges(uri, [{ offset, length }]);
    }

    /**
     * Read one or more byte ranges with a single file handle.
     */
    public async readFileRanges(uri: vscode.Uri, ranges: Array<{ offset: number; length: number }>): Promise<Uint8Array> {
        let totalLength = 0;
        for (const range of ranges) {
            this.validateFileRange(range.offset, range.length);
            totalLength += range.length;
        }

        try {
            const stats = await this.getFileStats(uri);
            for (const range of ranges) {
                if (range.offset + range.length > stats.size) {
                    throw new Error('Requested range extends beyond file size');
                }
            }

            const fileHandle = await fs.open(uri.fsPath, 'r');
            try {
                const buffer = Buffer.allocUnsafe(totalLength);
                let targetOffset = 0;

                for (const range of ranges) {
                    const { bytesRead } = await fileHandle.read(buffer, targetOffset, range.length, range.offset);
                    if (bytesRead !== range.length) {
                        throw new Error(`Expected ${range.length} bytes but read ${bytesRead}`);
                    }
                    targetOffset += range.length;
                }

                return buffer;
            } finally {
                await fileHandle.close();
            }
        } catch (err) {
            throw new Error(`Unable to read file range: ${err}`);
        }
    }

    private validateFileRange(offset: number, length: number): void {
        if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(length) || length < 0) {
            throw new Error('Invalid file range');
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
