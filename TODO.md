# TODO

## Milestone 1 (Week 1)
- [x] Scaffold VS Code extension project (webpack, tsconfig, host/webview boilerplate)
- [x] Implement CustomEditorProvider stub for `.raw` and user-configurable extensions
- [x] Render a single float32 slice in the Webview canvas

## Milestone 2
- [x] Build metadata input UI: width, height, optional depth
- [x] Add data-type dropdown (float32, uint8, uint16, int16, int32, float64)
- [x] Implement endianness toggle (little/big)
- [x] Develop slice navigation control: slider, mouse scroll, ←/→ keyboard shortcuts

## Milestone 3
 - [x] Implement window/level controls with draggable min/max handles
 - [x] Add “Reset” button to restore original window/level (default to full range)

## Milestone 4
- [ ] Implement graceful error handling (invalid metadata, OOM, read errors)

## Milestone 5
- [ ] Cross-platform testing (Windows, macOS, Linux)
- [ ] Performance tuning: 
  - ensure slice render <100 ms at 2048×2048  
- [ ] Accessibility audit: keyboard navigation, color-contrast, tooltips
- [ ] Group advanced controls under collapsible “Advanced” panel

## Milestone 6
- [ ] Write unit & integration tests (≥90% coverage)
- [ ] Update documentation (README, vsc-extension-quickstart.md)
- [ ] Package and validate `.vsix` installation on all platforms

