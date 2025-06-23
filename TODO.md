# TODO

## Milestone 1 (Week 1)
- [x] Scaffold VS Code extension project (webpack, tsconfig, host/webview boilerplate)
- [x] Implement CustomEditorProvider stub for `.raw` and user-configurable extensions
- [x] Render a single float32 slice in the Webview canvas

## Milestone 2 (Week 2)
- [x] Build metadata input UI: width, height, optional depth
- [x] Add data-type dropdown (float32, uint8, uint16, int16, int32, float64)
- [x] Implement endianness toggle (little/big)
- [x] Develop slice navigation control: slider, mouse scroll, ←/→ keyboard shortcuts

## Milestone 3 (Week 3)
- [x] Integrate `HistogramWorker` Web Worker for real-time histogram computation
- [x] Implement window/level controls with draggable min/max handles
- [x] Add “Auto-window” button (percentile-based)

## Milestone 4 (Week 4)
- [ ] Persist per-file settings: dims, datatype, windowing
- [ ] Add “Save PNG” export of current slice with applied window/level
- [ ] Implement graceful error handling (invalid metadata, OOM, read errors)
- [ ] Wire up undo/redo for window adjustments

## Milestone 5 (Week 5)
- [ ] Cross-platform testing (Windows, macOS, Linux)
- [ ] Performance tuning: 
  - ensure slice render <100 ms at 2048×2048  
  - histogram/window updates <50 ms  
- [ ] Accessibility audit: keyboard navigation, color-contrast, tooltips
- [ ] Group advanced controls under collapsible “Advanced” panel

## Milestone 6 (Week 6)
- [ ] Write unit & integration tests (≥90% coverage)
- [ ] Update documentation (README, vsc-extension-quickstart.md)
- [ ] Package and validate `.vsix` installation on all platforms

## Backlog & Future Enhancements
- [ ] Support 3D volume rendering and multi‐slice view
- [ ] Downsample preview for very large volumes
- [ ] Context menu on canvas: copy image, additional export formats
- [ ] Optionally integrate third-party histogram library
