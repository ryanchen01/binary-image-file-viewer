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