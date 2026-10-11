import { SupportedDataType } from './constants';
import { getBytesPerPixel, validateMetadata } from './utils';

/**
 * Handles slice reading logic for different planes (axial, coronal)
 */
export class SliceReader {
    /**
     * Calculate the byte range for an axial slice.
     */
    public getAxialSliceRange(
        fileSize: number,
        width: number,
        height: number,
        slice: number,
        dataType: SupportedDataType
    ): { offset: number; length: number } {
        validateMetadata(width, height, dataType);

        if (!Number.isSafeInteger(slice) || slice < 0) {
            throw new Error('Slice index must be a non-negative safe integer');
        }

        const bytesPerPixel = getBytesPerPixel(dataType);
        const length = width * height * bytesPerPixel;
        const offset = slice * length;

        if (!Number.isSafeInteger(length) || !Number.isSafeInteger(offset + length) || offset + length > fileSize) {
            throw new Error('Slice extends beyond file size');
        }

        return { offset, length };
    }

    /**
     * Calculate byte ranges for a coronal slice without loading the whole file.
     */
    public getCoronalSliceRanges(
        fileSize: number,
        width: number,
        height: number,
        slice: number,
        dataType: SupportedDataType
    ): { ranges: Array<{ offset: number; length: number }>; resultWidth: number; resultHeight: number } {
        validateMetadata(width, height, dataType);

        if (!Number.isSafeInteger(slice) || slice < 0) {
            throw new Error('Slice index must be a non-negative safe integer');
        }

        if (slice >= height) {
            throw new Error('Slice extends beyond image height');
        }

        const bytesPerPixel = getBytesPerPixel(dataType);
        const rowBytes = width * bytesPerPixel;
        const axialSliceSize = width * height * bytesPerPixel;
        if (!Number.isSafeInteger(axialSliceSize) || axialSliceSize > fileSize) {
            throw new Error('Slice extends beyond file size');
        }
        const depth = Math.floor(fileSize / axialSliceSize);
        const ranges: Array<{ offset: number; length: number }> = [];

        for (let z = 0; z < depth; z++) {
            ranges.push({
                offset: z * axialSliceSize + slice * rowBytes,
                length: rowBytes
            });
        }

        return {
            ranges,
            resultWidth: width,
            resultHeight: depth
        };
    }
}
