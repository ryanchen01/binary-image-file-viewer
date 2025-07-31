# Binary Image File Viewer

A Visual Studio Code extension for viewing and analyzing binary image files with interactive grayscale visualization, slice navigation, and window/level controls.

## Features
- View raw binary as images with configurable data types (uint8/int8/uint16/int16/uint32/int32/float32/float64)
- Axial and coronal planes with instant toggling
- Window/level controls with live preview and reset
- Real-time rendering with auto-scaling to fit the viewport
- Slice navigation via slider, mouse wheel, and arrow keys
- File info panel: name, size, dimensions, estimated slice count
- Robust validation and user-facing error messages

## Supported File Types
- .raw, .bin (other binary types may work if dimensions/data type are known)

## Install
- npm ci, then npm run compile to build
- From VSIX: code --install-extension binary-image-file-viewer.vsix

## Usage
1) Open a .raw or .bin file
2) Enter width, height, data type, endianness
3) Click "Load Slice" and navigate slices; toggle plane as needed

## Development
- Build: npm run compile | Watch: npm run watch | Package: npm run package
- Lint: npm run lint | Test: npm test (pretest compiles and lints)
- Single test: after npm run pretest run: npx mocha out/test/**/*.test.js --grep "pattern"

## Roadmap
- Planned: sagittal plane, MIP rendering, multi-slice views, PNG export, large dataset perf

## License
MIT

## Links
Marketplace (coming soon) • Source: https://github.com/ryanchen01/binary-image-file-viewer
