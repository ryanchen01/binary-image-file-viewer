export const CONSTANTS = {
    // File limits
    MAX_FILE_SIZE: 1024 * 1024 * 1024, // 1024 MB cap to prevent OOM
    
    // Supported data types
    SUPPORTED_DATA_TYPES: [
        'uint8', 'int8', 'uint16', 'int16', 
        'uint32', 'int32', 'float32', 'float64'
    ] as const,
    
    // Default values
    DEFAULT_DATA_TYPE: 'float32',
    DEFAULT_ENDIANNESS: 'little',
    DEFAULT_PLANE: 'axial',
    
    // UI constants
    CANVAS_PADDING: 40,
    RESIZE_DELAY: 100,
    
    // Message types
    MESSAGE_TYPES: {
        READY: 'ready',
        FILE_INFO: 'fileInfo',
        SLICE_DATA: 'sliceData',
        READ_SLICE: 'readSlice',
        COMPUTE_GLOBAL_WINDOW: 'computeGlobalWindow',
        WINDOW_DATA: 'windowData',
        ERROR: 'error'
    } as const,
    
    // File extensions
    SUPPORTED_EXTENSIONS: ['.raw', '.bin'] as const
} as const;

export type SupportedDataType = typeof CONSTANTS.SUPPORTED_DATA_TYPES[number];
export type MessageTypes = typeof CONSTANTS.MESSAGE_TYPES[keyof typeof CONSTANTS.MESSAGE_TYPES];
export type SupportedExtension = typeof CONSTANTS.SUPPORTED_EXTENSIONS[number];