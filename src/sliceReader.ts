import { SupportedDataType } from './constants';
import { getBytesPerPixel, validateMetadata } from './utils';

/**
 * Handles slice reading logic for different planes (axial, coronal)
 */
export class SliceReader {
    /**
     * Read a specific slice from the binary file data
     */
    public readSlice(
        fileData: Uint8Array,
        width: number,
        height: number,
        slice: number,
        dataType: SupportedDataType,
        plane: string = 'axial'
    ): { sliceData: Uint8Array; resultWidth: number; resultHeight: number } {
        validateMetadata(width, height, dataType);
        const bytesPerPixel = getBytesPerPixel(dataType);

        if (slice < 0) {
            throw new Error('Slice index must be non-negative');
        }

        let sliceData: Uint8Array;
        let resultWidth: number;
        let resultHeight: number;

        if (plane === 'coronal') {
            // For coronal view, we need depth information
            const axialSliceSize = width * height * bytesPerPixel;
            const depth = Math.floor(fileData.length / axialSliceSize);
            
            if (slice >= height) {
                throw new Error('Slice extends beyond image height');
            }

            // Extract coronal slice (all pixels at y=slice across all z slices)
            const coronalSliceSize = width * depth * bytesPerPixel;
            sliceData = new Uint8Array(coronalSliceSize);
            
            const rowBytes = width * bytesPerPixel;
            const maxZ = Math.min(depth, Math.floor(fileData.length / axialSliceSize));
            
            for (let z = 0; z < maxZ; z++) {
                const axialOffset = z * axialSliceSize + slice * rowBytes;
                const coronalOffset = z * rowBytes;
                sliceData.set(fileData.subarray(axialOffset, axialOffset + rowBytes), coronalOffset);
            }
            
            resultWidth = width;
            resultHeight = depth;
        } else {
            // Axial view (default)
            const sliceSize = width * height * bytesPerPixel;
            const offset = slice * sliceSize;
            
            if (offset + sliceSize > fileData.length) {
                throw new Error('Slice extends beyond file size');
            }
            
            sliceData = fileData.slice(offset, offset + sliceSize);
            resultWidth = width;
            resultHeight = height;
        }

        return { sliceData, resultWidth, resultHeight };
    }

    /**
     * Calculate how many slices are available based on file size and metadata
     */
    public calculateMaxSlices(
        fileSize: number,
        width: number,
        height: number,
        dataType: SupportedDataType,
        plane: string = 'axial'
    ): number {
        const bytesPerPixel = getBytesPerPixel(dataType);
        
        if (plane === 'coronal') {
            // For coronal plane, slices are through height dimension
            return height;
        } else {
            // For axial plane, slices are through depth dimension
            const sliceSize = width * height * bytesPerPixel;
            return Math.floor(fileSize / sliceSize);
        }
    }

    /**
     * Validate slice parameters
     */
    public validateSliceParams(
        slice: number,
        width: number,
        height: number,
        fileSize: number,
        dataType: SupportedDataType,
        plane: string = 'axial'
    ): void {
        if (slice < 0) {
            throw new Error('Slice index must be non-negative');
        }

        const maxSlices = this.calculateMaxSlices(fileSize, width, height, dataType, plane);
        if (slice >= maxSlices) {
            throw new Error(`Slice ${slice} exceeds maximum available slices (${maxSlices})`);
        }

        validateMetadata(width, height, dataType);
    }
}