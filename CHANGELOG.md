# Changelog

All notable changes to the "binary-image-file-viewer" extension are documented here.

This project adheres to Keep a Changelog and Semantic Versioning.

## [6.0.1] - 2026-05-09
### Changed
- Preserved the active window/level values when switching slices while keeping the window sliders bounded to the current slice's min/max range.

## [0.6.0] - 2026-05-09
### Added
- Added a manual reload button to refresh the current slice when the backing image file changes.

### Changed
- Optimized remote slice navigation by reading axial slices by byte range instead of reloading the full file.
- Coalesced rapid slice navigation so only the latest pending slice request is loaded while another request is in flight.
- Encoded slice data as base64 to reduce webview message overhead compared with JSON number arrays.
- Reset window/level min and max from each loaded slice instead of using a global image range.
- Updated file size and slice count after slice reloads so changes on disk are reflected in the UI.
- Improved webview resize handling so the canvas and sidebar adapt to VS Code editor area changes.

## [0.5.1] - 2025-08-20
### Changed
- Restored compatibility metadata for VS Code 1.45.0.
- Updated `@types/vscode` development dependency metadata to match the supported VS Code engine.

## [0.5.0] - 2025-07-31
### Improved
- Enhanced UI layout stability with fixed-width input controls to prevent layout shifting
- Added consistent spacing and sizing for all control elements
- Improved responsive layout with better flexbox constraints
- Enhanced visual
- Centered range sliders alignment with other control elements
- Extended windowing sliders to full width to match button dimensions
- Added focus states, shadows, and improved typography throughout the interface

## [0.4.0]
- Fixed line ending inconsistencies across source files
- Removed unused imports and improved code formatting
- Standardized documentation structure and formatting

## [0.3.1] - 2025-07-31
### Fixed
- Line ending inconsistencies across TypeScript and JavaScript files
- Removed unused `fs` import in binaryImageEditorProvider.ts
- Standardized formatting in test stubs and configuration files

### Changed
- Updated CHANGELOG.md to follow Keep a Changelog format more strictly
- Streamlined README.md while preserving essential information
- Cleaned up project documentation structure

## [0.3.0] - 2025-07-31
### Added
- Coronal plane viewing alongside axial
- Window/level controls with interactive sliders
- Global min/max computation for optimal windowing
- Enhanced validation and user-facing error messages in webview

### Changed
- Optimized slice rendering to a single-pass pipeline
- Cached file data with 1GB safety cap to prevent OOM

### Fixed
- Bounds checking for slice navigation and metadata inputs

## [0.2.x]
### Added
- Initial custom editor with axial slice viewing
- Basic keyboard and mouse wheel navigation

## [0.1.x]
- Initial scaffolding and packaging setup
