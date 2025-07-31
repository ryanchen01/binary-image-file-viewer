# Changelog

All notable changes to the "binary-image-file-viewer" extension are documented here.

This project adheres to Keep a Changelog and Semantic Versioning.

## [0.4.0]
- Planned: sagittal plane, MIP rendering, multi-slice views, PNG export, large dataset perf
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
