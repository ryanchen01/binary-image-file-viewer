# Binary Image File Viewer

A Visual Studio Code extension for viewing and analyzing binary image files with advanced visualization capabilities. Perfect for researchers, engineers, and data scientists working with raw binary image data from scientific instruments, medical devices, or custom imaging systems.

## Features

### 🖼️ Binary Image Visualization
- **Multi-format Support**: View binary files as grayscale images with configurable data types
- **Real-time Rendering**: Interactive canvas-based visualization with automatic scaling
- **Multiple Data Types**: Support for uint8, uint16, int16, int32, float32, and float64 formats
- **Endianness Control**: Toggle between little-endian and big-endian byte ordering

### 🎛️ Interactive Controls
- **Metadata Input**: Specify image dimensions (width × height) and data type
- **Slice Navigation**: Navigate through multi-slice volumes with:
  - Range slider for quick navigation
  - Mouse wheel scrolling on canvas
  - Keyboard shortcuts (←/→ arrow keys)
  - Direct slice number input
- **Auto-scaling**: Images automatically scale to fit the viewer window

### 📊 File Information
- **File Statistics**: View file size, dimensions, and calculated slice count
- **Current Slice Info**: Track which slice you're currently viewing
- **Smart Validation**: Automatic bounds checking and error handling

## Supported File Types

- `.raw` files (raw binary image data)
- `.bin` files (binary data files)
- Any binary file containing image data (configurable through VS Code settings)

## Installation

1. Install from the VS Code Marketplace (coming soon)
2. Or install from VSIX:
   - Download the `.vsix` file
   - Run `code --install-extension binary-image-file-viewer.vsix`

## Usage

### Opening Binary Files
1. Open a `.raw` or `.bin` file in VS Code
2. The Binary Image Viewer will automatically activate
3. Configure the image parameters in the control panel

### Basic Workflow
1. **Set Dimensions**: Enter the width and height of your image data
2. **Choose Data Type**: Select the appropriate data type (uint8, float32, etc.)
3. **Set Endianness**: Choose little-endian or big-endian based on your data format
4. **Load Slice**: Click "Load Slice" to render the image
5. **Navigate**: Use the slider, mouse wheel, or arrow keys to browse through slices

### Keyboard Shortcuts
- `←/→` or `↑/↓`: Navigate between slices
- `Mouse Wheel`: Scroll through slices when hovering over the image

## Data Types Supported

| Type | Description | Bytes per Pixel |
|------|-------------|-----------------|
| `uint8` | Unsigned 8-bit integer (0-255) | 1 |
| `uint16` | Unsigned 16-bit integer (0-65535) | 2 |
| `int16` | Signed 16-bit integer (-32768 to 32767) | 2 |
| `int32` | Signed 32-bit integer | 4 |
| `float32` | 32-bit floating point | 4 |
| `float64` | 64-bit floating point | 8 |

## Configuration

Currently, the extension works with files having `.raw` and `.bin` extensions. Future versions will support custom file extension configuration through VS Code settings.

## Examples

### Medical Imaging Data
```
Width: 512
Height: 512
Data Type: uint16
Endianness: Little-Endian
```

### Scientific Instrument Data
```
Width: 1024
Height: 768
Data Type: float32
Endianness: Big-Endian
```

### Raw Camera Data
```
Width: 2048
Height: 1536
Data Type: uint8
Endianness: Little-Endian
```

## Roadmap

### Milestone 4 (Planned)
- [ ] Enhanced error handling

### Future Enhancements
- [ ] MIP rendering
- [ ] Multi-slice view modes
- [ ] PNG export functionality
- [ ] Performance optimizations for large datasets

## Requirements

- Visual Studio Code 1.101.0 or higher
- No additional dependencies required

## Known Issues

- Large files (>100MB) may experience slower loading times
- Maximum recommended image size: 4096×4096 pixels
- Memory usage scales with image dimensions and bit depth

## Contributing

This extension is under active development. Contributions, bug reports, and feature requests are welcome!

## Development

### Building from Source
```bash
git clone <repository-url>
cd binary-image-file-viewer
npm install
npm run compile
```

### Testing
```bash
npm run test
```

### Packaging
```bash
npm run package
```

## License

[Add your license information here]

## Release Notes

### 0.0.1

Initial release with core functionality:
- Basic binary image viewing
- Multiple data type support
- Slice navigation controls
- Endianness toggle
- Interactive UI controls

---

**Enjoy visualizing your binary image data!** 🚀

For questions, issues, or feature requests, please visit our [GitHub repository](https://github.com/your-username/binary-image-file-viewer).
