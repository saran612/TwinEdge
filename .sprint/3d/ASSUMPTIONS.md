# 3D Digital Twin Sprint Assumptions & Decisions

## Key Decisions & Baseline Observations
1. **Model Source**: Model `/models/Turbofan_Engine_Animated.glb` is preserved intact. Any optimized meshes or procedural fallback logic are handled at runtime without altering the source asset.
2. **Double Viewport Architecture**: `DigitalTwinPage.jsx` renders `EngineViewport3D.jsx`. `Turbofan3DView.jsx` was an earlier or alternate component. Both must adhere to the design system and strict Three.js lifecycle rules.
3. **Playback Architecture**: Playback state in `AppContext.jsx` currently lacks precision delta accumulation and decoupling between Replay and Live streams. In Live mode, playback controls must be disabled with tooltips as specified.
4. **Hotspot Pins**: Spheres currently positioned at hardcoded coordinates `[0, 0, 1.8]`, etc. from `component_map.json` without matching the normalized loaded GLTF scale and bounding box.
