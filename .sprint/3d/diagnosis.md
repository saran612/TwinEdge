# 3D Digital Twin & Playback Engine Diagnosis (T0)

## WebGL Environment
- **Renderer String**: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`
- **Vendor**: `Google Inc. (Google)`
- **Canvas Count**: 1 active `<canvas>` context in DOM.
- **Scene Nodes**: 5,392 nodes, 1,625 meshes (1,616 GLB meshes + 9 anchor spheres).

---

## Ranked Root Causes & Findings

### 1. [CRITICAL] 3D View Flickering & Model Re-creation
- **File & Line**: [frontend/src/components/twin/EngineViewport3D.jsx:334](file:///home/saran/projects/twinedge/frontend/src/components/twin/EngineViewport3D.jsx#L334)
- **Root Cause**: The main Three.js initialization `useEffect` lists `[selectedComponentId, onSelectComponent]` in its dependency array. Every time a user clicks or arrows to another component, the entire Three.js renderer, scene, 1,616 meshes, and GLTF loader are completely torn down (`renderer.dispose()`, `mountRef.current.innerHTML = ''`) and recreated from scratch. This causes intense visible flickering, memory churning, and GPU readbacks.
- **Evidence**: Static flicker test passed with 0 diff pixels when static, but component selection triggers complete unmount/remount loop.

### 2. [CRITICAL] Playback Does Not Advance
- **File & Line**: [frontend/src/context/AppContext.jsx:21](file:///home/saran/projects/twinedge/frontend/src/context/AppContext.jsx#L21) & [frontend/src/pages/DigitalTwinPage.jsx:311](file:///home/saran/projects/twinedge/frontend/src/pages/DigitalTwinPage.jsx#L311)
- **Root Cause**: `AppContext` defines `isPlaying`, `playbackSpeed`, and `currentCycle`, but there is **no animation tick interval or requestAnimationFrame accumulator** running in `AppContext`! When the play button is clicked, `isPlaying` toggles to `true`, but no timer advances `currentCycle`. Additionally, `dataSource` is decoupled from playback controls.
- **Evidence**: `currentCycle` stays statically pinned at 30 regardless of `isPlaying: true`.

### 3. [MAJOR] Model Renders Almost Black
- **File & Line**: [frontend/src/components/twin/EngineViewport3D.jsx:125](file:///home/saran/projects/twinedge/frontend/src/components/twin/EngineViewport3D.jsx#L125)
- **Root Cause**:
  1. The GLTF model materials are `MeshPhysicalMaterial` with average `metalness: 0.78` and average `roughness: 0.998`. Highly metallic PBR materials in Three.js require an **environment map (`scene.environment` / RoomEnvironment)** to reflect ambient light; directional and ambient lights alone fail to illuminate metallic microfacets, rendering the model pitch black.
  2. `scene.environment` is `null` (not set).
  3. `renderer.outputColorSpace` is not configured for standard sRGB (`THREE.SRGBColorSpace`).
- **Evidence**: `matStats.hasEnvMapCount: 0`, `sceneHasEnv: false`, `metalnessAvg: 0.781`.

### 4. [MAJOR] Hotspot Spheres Floating Outside Model
- **File & Line**: [frontend/src/components/twin/EngineViewport3D.jsx:150](file:///home/saran/projects/twinedge/frontend/src/components/twin/EngineViewport3D.jsx#L150) & [frontend/src/config/component_map.json:11](file:///home/saran/projects/twinedge/frontend/src/config/component_map.json#L11)
- **Root Cause**:
  - The model bounding box in world space is $X \in [-1.60, 1.41]$, $Y \in [-1.15, 1.15]$, $Z \in [-1.25, 1.43]$.
  - The hardcoded anchor positions in `component_map.json` place `fan` at $X = -1.8$ (outside model), `lpt` at $X = 1.5$ (outside model), `nozzle` at $X = 2.2$ (far outside model in empty space).
  - Furthermore, anchor spheres are added to `scene` instead of being parented to `modelRef.current`, so any rotation or model scaling misaligns them.
- **Evidence**: Geometric analysis proved 3 of the 9 anchor spheres are strictly outside `modelBox`.

### 5. [MODERATE] Icons Render at ~8px Instead of 16-20px
- **File & Line**: [frontend/src/components/ui/Button.jsx:64](file:///home/saran/projects/twinedge/frontend/src/components/ui/Button.jsx#L64)
- **Root Cause**:
  - `IconButton` delegates to `<Button size="sm">` which applies `px-3` (12px horizontal padding).
  - With a fixed button width of 32px (`w-8`), applying `12px` padding on both sides leaves only `32 - 24 = 8px` of content width. The flex container squashes the 16px SVG down to 8px!
  - `p-0` was specified, but due to Tailwind class order or missing `!p-0` / explicit padding reset in `IconButton`, `px-3` overrode `p-0`.
- **Evidence**: Playwright measured `playBtn svgWidth: 8px` with parent padding `0px 12px`.

### 6. [MODERATE] Impact Panel "0 Cycles Rank #1"
- **File & Line**: [frontend/src/pages/DigitalTwinPage.jsx:103](file:///home/saran/projects/twinedge/frontend/src/pages/DigitalTwinPage.jsx#L103) & [190](file:///home/saran/projects/twinedge/frontend/src/pages/DigitalTwinPage.jsx#L190)
- **Root Cause**: At cycle 30 (or when healthy), predicted RUL is at the cap (125 cycles). Counterfactual restoration of healthy sensors results in $\Delta \text{RUL} = 0$, yet the UI blindly displays `Rank #1` and `0 cycles RUL delta` instead of adhering to the specification: *"if predicted RUL >= cap or every component |delta| < 0.5, show 'No measurable impact: predicted RUL is at the cap' and hide the rank"*.

### 7. [MODERATE] Sidebar Labels Truncated & Panel Bottom Clipped
- **File & Line**: [frontend/src/components/layout/GlobalShell.jsx:219](file:///home/saran/projects/twinedge/frontend/src/components/layout/GlobalShell.jsx#L219) & [frontend/src/pages/DigitalTwinPage.jsx:143](file:///home/saran/projects/twinedge/frontend/src/pages/DigitalTwinPage.jsx#L143)
- **Root Cause**:
  - The right tab container in `DigitalTwinPage` has `overflow-hidden` without an inner `overflow-y-auto` scroll container, causing the bottom action button "Open in Simulation lab" to clip at smaller viewports (e.g. 720p).
  - Sidebar width `w-60` (240px) with `p-4` (16px each side) leaves 208px, which clips longer labels if fonts or icons expand without `flex-1 min-w-0`.
