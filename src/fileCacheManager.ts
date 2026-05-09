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
        if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(length) || length < 0) {
            throw new Error('Invalid file range');
        }

        const cachedData = this.fileCache.get(uri.toString());
        if (cachedData) {
            if (offset + length > cachedData.length) {
                throw new Error('Requested range extends beyond cached file size');
            }
            return cachedData.slice(offset, offset + length);
        }

        try {
            const stats = await this.getFileStats(uri);
            if (offset + length > stats.size) {
                throw new Error('Requested range extends beyond file size');
            }

            if (uri.scheme === 'file') {
                const fileHandle = await fs.open(uri.fsPath, 'r');
                try {
                    const buffer = Buffer.allocUnsafe(length);
                    const { bytesRead } = await fileHandle.read(buffer, 0, length, offset);
                    if (bytesRead !== length) {
                        throw new Error(`Expected ${length} bytes but read ${bytesRead}`);
                    }
                    return buffer;
                } finally {
                    await fileHandle.close();
                }
            }

            const fileData = await this.getFileData(uri);
            return fileData.slice(offset, offset + length);
        } catch (err) {
            throw new Error(`Unable to read file range: ${err}`);
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
