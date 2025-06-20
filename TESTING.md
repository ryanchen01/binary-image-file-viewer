# Testing the Binary Image File Viewer Extension

## Prerequisites

1. VS Code installed
2. Node.js and npm installed
3. This extension project compiled

## How to Test

### 1. Compile the Extension

```bash
npm run compile
```

### 2. Test the Extension

1. Open VS Code in the extension directory
2. Press `F5` to launch the Extension Development Host
3. In the new VS Code window, open the `test_image.raw` file
4. Right-click on the file and select "Reopen Editor With..." → "Binary Image Viewer"

### 3. Using the Viewer

1. The extension will open with empty dimension fields:
   - Width: (empty - enter your file's width)
   - Height: (empty - enter your file's height)  
   - Data Type: float32 (default)
   - Slice: 0

2. Enter the correct width and height for your binary file

3. The viewer will automatically calculate and display the number of available slices

4. Click "Load Slice" to render the image

5. The viewer displays:
   - Canvas with the rendered grayscale image
   - File information panel (name, size, number of slices, current slice, dimensions)
   - Error messages if any issues occur

### 4. Testing Different Parameters

- Change the width/height values
- Try different data types (uint8, uint16, int16, int32, float64)
- Change the slice number for multi-slice files

## Test Files

### Creating Test Files

The repository includes a `test_image.raw` file (512x512 float32 random data).

You can create additional test files:

```javascript
// Create a 256x256 uint8 test file
node -e "
const fs = require('fs');
const buffer = Buffer.alloc(256 * 256);
for(let i = 0; i < 256 * 256; i++) {
  buffer[i] = Math.floor(Math.random() * 256);
}
fs.writeFileSync('test_uint8.raw', buffer);
console.log('Created test_uint8.raw');
"
```

```javascript
// Create a 100x100x10 float32 volume (10 slices)
node -e "
const fs = require('fs');
const buffer = Buffer.alloc(100 * 100 * 10 * 4);
for(let i = 0; i < 100 * 100 * 10; i++) {
  const value = Math.sin(i / 1000) * 0.5 + 0.5;
  buffer.writeFloatLE(value, i * 4);
}
fs.writeFileSync('test_volume.raw', buffer);
console.log('Created test_volume.raw - try slice 0-9');
"
```

## What's Working in Milestone 1

✅ **Scaffolding**: Complete VS Code extension project structure with webpack and TypeScript
✅ **Custom Editor Provider**: Registers for `.raw` and `.bin` files  
✅ **Float32 Rendering**: Can read and display float32 binary data as grayscale images
✅ **Basic UI**: Input controls for width, height, data type, and slice selection
✅ **Error Handling**: Basic error messages for invalid parameters or file read errors

## Known Limitations (To be addressed in future milestones)

- No slice navigation controls (slider, prev/next buttons)
- No keyboard shortcuts
- No histogram display
- No window/level controls
- No settings persistence
- No endianness toggle
- Limited to basic grayscale mapping (min/max normalization)

## Next Steps (Milestone 2)

- Enhanced metadata input UI
- Slice navigation with slider and keyboard shortcuts
- Endianness support
- Better error handling and validation
