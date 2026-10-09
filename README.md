# Binary Image File Viewer

A Visual Studio Code extension for viewing and analyzing binary image files with interactive grayscale visualization, slice navigation, and window/level controls.

## Features
- View raw binary as images with configurable data types (uint8/int8/uint16/int16/uint32/int32/float32/float64)
- Axial and coronal planes with instant toggling
- Window/level controls with live preview and reset, with pixel conversion in a web worker
- Hover over a pixel to see its original value and zero-based image coordinates in the left sidebar
- Real-time rendering with auto-scaling to fit the viewport
- Slice navigation via slider, mouse wheel, and arrow keys
- File info panel: name, size, dimensions, estimated slice count
- Robust validation and user-facing error messages
- Bounded slice caching, nearest-slice prefetching, and cancellation of obsolete reads

## Supported File Types
- .raw, .bin (other binary types may work if dimensions/data type are known)

## Install
- Requires VS Code 1.57 or newer for efficient binary messages between the extension and viewer
- npm ci, then npm run compile to build
- From VSIX: code --install-extension binary-image-file-viewer.vsix

## Usage
1) Open a .raw or .bin file
2) Enter width, height, data type, endianness
3) Click "Load Slice" and navigate slices; toggle plane as needed

## Remote SSH and memory

The extension runs in the workspace host. With Remote SSH, it reads files on the
remote machine and sends slice bytes to the local webview. Pixel conversion,
statistics, and live window/level adjustments run in a local web worker. Adjusting
window/level does not reread the file or send pixel data over SSH.

`binaryImageViewer.sliceCacheMemoryMB` sets the decoded slice cache budget per
editor, with a default of 64 MiB. Reopen the viewer after changing it. Larger
slices reduce the prefetch radius, and slices larger than the budget still display
without entering the cache. The displayed slice, its worker copy, and canvas
buffers use additional memory beyond this budget.

Coronal views read only the required rows, with at most four reads in flight per
request. Navigation cancels obsolete reads and skips stale responses.

## Development
- Build: npm run compile | Watch: npm run watch | Package: npm run package
- Lint: npm run lint | Test: npm test (pretest compiles and lints)
- Single test: after npm run pretest run: npx mocha out/test/**/*.test.js --grep "pattern"

## Roadmap
- Planned: sagittal plane, MIP rendering, multi-slice views, PNG export, large dataset perf

## License
MIT

## Links
Marketplace https://marketplace.visualstudio.com/items?itemName=ryanchen01.binary-image-file-viewer • Source: https://github.com/ryanchen01/binary-image-file-viewer
