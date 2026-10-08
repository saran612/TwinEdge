# 3D Digital Twin & Playback Sprint Decisions & Assumptions

## Assumption 1: Component Anchor Clustering
- **Finding**: The original Turbofan GLB model (`Turbofan_Engine_Animated.glb`) contains 1,616 meshes. Several key components (such as combustor flame elements, casing rings, and gear spools) have distinct bounding boxes, while other components like turbine blades share common parent hierarchies.
- **Decision**: Hotspot anchor pins are mapped to the true geometric centroid of their corresponding mesh cluster in world space, bounded strictly within the model's bounding box ($X \in [-1.60, 1.41]$, $Y \in [-1.15, 1.15]$, $Z \in [-1.25, 1.43]$).
- **Measurement**: All 9 anchors are verified to be inside the model bounding box with distance to the nearest mesh surface $\le 0.183$ units.

## Assumption 2: Zero-Dependency Local PBR Lighting
- **Hard Limit**: No CDN or external asset fetches.
- **Decision**: Three.js `RoomEnvironment` bundled with `three/examples/jsm/environments/RoomEnvironment.js` is compiled via `PMREMGenerator` at canvas mount time. Combined with runtime material overrides clamping metalness to $\le 0.85$ and roughness to $\ge 0.35$, this elevates the model luminance from 0 (pitch black) to a mean luminance of 147.75.

## Assumption 3: Decoupling Selection from Canvas Lifecycle
- **Finding**: Passing `selectedComponentId` into the primary Three.js `useEffect` dependency array caused the entire 1,616-mesh scene graph and WebGL canvas to be unmounted and re-instantiated on every click or arrow key press.
- **Decision**: Initialize the scene, renderer, controls, and model loader once on mount (`[]`). Selection highlights and dynamic color modes (Impact, Sensor) are updated in a dedicated, lightweight effect that modifies `material.emissive` without touching geometries or the render loop.
