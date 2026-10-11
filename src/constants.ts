import { DATA_TYPES } from './dataTypes';

export const CONSTANTS = {
    // File limits
    MAX_FILE_SIZE: 1024 * 1024 * 1024, // 1024 MB cap to prevent OOM
    SLICE_CACHE_MEMORY_MB: 64,
    FILE_READ_CONCURRENCY: 4,
    
    // Supported data types
    SUPPORTED_DATA_TYPES: Object.keys(DATA_TYPES) as Array<keyof typeof DATA_TYPES>,

    // Message types
    MESSAGE_TYPES: {
        READY: 'ready',
        FILE_INFO: 'fileInfo',
        SLICE_DATA: 'sliceData',
        READ_SLICE: 'readSlice',
        CANCEL_SLICE: 'cancelSlice',
        ERROR: 'error'
    } as const,

    // Custom editor view types
    VIEW_TYPES: {
        BINARY_EDITOR: 'binaryImageViewer.editor',
        MHD_EDITOR: 'binaryImageViewer.mhdEditor'
    } as const,

    // Commands
    COMMANDS: {
        OPEN_MHD_VIEWER: 'binary-image-file-viewer.openMhdViewer',
        OPEN_MHD_TEXT: 'binary-image-file-viewer.openMhdText'
    } as const
} as const;

export type SupportedDataType = keyof typeof DATA_TYPES;
