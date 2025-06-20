Binary Image File Viewer Extension – Product Requirements Document  

1. Executive Summary  
   • Purpose: Define requirements for a VS Code extension that lets users open raw binary files (float32, uint8, etc.) as 2D/3D grayscale images with slice navigation, window/level adjustment, and histogram display.  
   • Why now: Engineers dealing with scientific/medical/remote-sensing data need quick visual feedback on raw volume files without leaving their editor.  
   • Scope: MVP supports float32 and uint8/uint16, user-defined dimensions, single-slice view, slider-driven slice navigation, histogram, windowing controls, datatype dropdown.

2. Goals & Success Metrics  
   2.1 Functional goals  
     – Open any .bin or custom-extension file as image.  
     – Render a slice in <100 ms for up to 2048×2048.  
     – Histogram calculation and windowing updates in <50 ms.  
   2.2 Business/UX goals  
     – Seamless VS Code integration (“Open With…” custom editor).  
     – No perceptible editor lag or high memory footprint (<200 MB resident).  
   2.3 Success metrics  
     – 95% of users can open and visualize a 512×512×100 float32 file without crashes.  
     – Avg. slice-render time ≤80 ms on a typical dev machine (4 cores, 16 GB RAM).  
     – <5 bug reports per 1,000 installs in first month.

3. User Personas & Stories  
   3.1 “Quick-Look Researcher”  
     – Needs to spot-check raw volume data.  
     – Story: “As a researcher, I want to open a .bin and immediately see slice 0 so I can verify data integrity.”  
   3.2 “Algorithm Developer”  
     – Tunes window/level to inspect intensity distributions.  
     – Story: “As a dev, I want to slide through slices and adjust windowing to locate regions of interest.”  
   3.3 “Pipeline Integrator”  
     – Switches data types and dims on multiple file formats.  
     – Story: “As an integrator, I want to swap between float32/uint16 and edit width/height to match different files.”

4. Functional Requirements  
   FR1 – File Opening & Activation  
     • Register a Custom Editor Provider for .bin (and user-configurable extensions).  
     • Activation only when user explicitly “Reopen Editor With → Binary Image Viewer.”  
   FR2 – Metadata Input UI  
     • Inputs for width, height, (optional) depth.  
     • Dropdown for data type: float32, uint8, uint16, int16, int32, float64.  
     • Endianness toggle (little/big).  
   FR3 – Slice Navigation  
     • Slider (or spinbox) from 0 to depth–1.  
     • Keyboard shortcuts: ←/→ to decrement/increment slice.  
   FR4 – Image Rendering  
     • Canvas-based grayscale render of current slice.  
     • Automatic aspect ratio preservation or stretch-to-fit.  
     • On‐screen FPS ≥12 when dragging slider.  
   FR5 – Histogram & Windowing  
     • Real-time histogram of current slice (bars or curve).  
     • Two draggable range handles for window min/max.  
     • Automatic “auto‐window” button (e.g. [min,max] from percentiles).  
   FR6 – Settings Persistence  
     • Remember last dims, datatype, windowing per file path.  
   FR7 – Export & Snapshot  
     • “Save PNG” of current slice with applied windowing.  
   FR8 – Error Handling  
     • Invalid metadata → user error message.  
     • OOM or read errors → graceful failure with actionable advice.

5. Non-Functional Requirements  
   NFR1 – Performance  
     • Lazy‐load only one slice into memory at a time.  
     • Offload heavy work (histogram calc) to Web Worker.  
   NFR2 – Memory  
     • Peak ≤ file header + one slice buffer + UI overhead.  
   NFR3 – Responsiveness  
     • UI actions (slider move, window drag) → render/update <50 ms.  
   NFR4 – Cross-Platform  
     • Works on Windows, macOS, Linux.  
   NFR5 – Accessibility  
     • Keyboard‐navigable UI.  
     • Sufficient color contrast in histogram and controls.  
   NFR6 – Security & Permissions  
     • No remote code, only local file I/O.  
     • Sandboxed in VS Code Webview context.

6. UI/UX Requirements  
   6.1 Layout  
     • Top bar: metadata inputs and datatype dropdown.  
     • Main panel: left 70% canvas image; right 30% histogram+window controls.  
     • Bottom: slice slider + current index indicator + Prev/Next buttons.  
   6.2 Theming  
     • Respect VS Code light/dark mode.  
     • Controls styled with VS Code’s CSS variables.  
   6.3 Interaction  
     • Hover tooltips on controls.  
     • Undo/redo window adjustments.  
     • Context menu on canvas: copy image, save PNG.

7. Technical Architecture  
   7.1 Extension Host (TypeScript)  
     • CustomEditorProvider → spawns WebviewPanel.  
     • Manages file handle and passes ArrayBuffer to Webview via postMessage.  
   7.2 Webview (HTML+TS)  
     • CanvasRenderer module: draws pixel buffer to <canvas>.  
     • HistogramWorker (Web Worker): computes histogram for each slice.  
     • UIController: wires DOM controls to events, sends commands back to host (e.g. readSlice).  
   7.3 Data Flow  
     1. User sets dims & type → host reads slice0 via fs.read (offset = 0).  
     2. ArrayBuffer dispatched to webview.  
     3. CanvasRenderer.render(buffer, windowMin, windowMax).  
     4. HistogramWorker.calculate(buffer) → returns bin counts → UIController.drawHistogram.  
   7.4 Dependencies  
     • “vscode” API  
     • Optional histogram library (e.g. simple-bin) or custom code.  
     • Webpack for bundling host and webview code.

8. Milestones & Timeline  
   Milestone 1 (Week 1): Project scaffolding, CustomEditorProvider stub, basic single‐slice render float32.  
   Milestone 2 (Week 2): UI controls for dims, datatype dropdown, slice slider.  
   Milestone 3 (Week 3): Histogram + windowing controls + Web Worker integration.  
   Milestone 4 (Week 4): Settings persistence, “Save PNG”, keyboard shortcuts.  
   Milestone 5 (Week 5): Cross-platform testing, performance tuning, accessibility audit.  
   Milestone 6 (Week 6): Write unit/integration tests, documentation, publish to Marketplace.

9. Risks & Mitigations  
   R1 – Very large files → OOM  
     • Mitigation: slice‐wise read, limit dims, warn user if depth×width×height too large.  
   R2 – Slow histogram computation  
     • Mitigation: off-load to Web Worker, compute only on window range or downsample for preview.  
   R3 – UX clutter  
     • Mitigation: iterative usability testing; collapse advanced controls under “Advanced” panel.  
   R4 – VS Code API changes  
     • Mitigation: lock on stable API versions; test on VS Code Insider and stable.

10. Acceptance Criteria  
   • Loading a 512×512 float32 file renders slice 0 within 100 ms.  
   • Moving slice slider updates image and histogram in <50 ms.  
   • Window min/max sliders adjust grayscale mapping interactively.  
   • User can switch datatype and dims without reloading VS Code.  
   • All core features covered by automated tests with ≥90% code coverage.  
   • Extension packaged as .vsix, installs without errors on all platforms.

Appendix: Glossary of Terms, Sample Wireframe Sketch (see attached), Reference Links to VS Code Custom Editor API.