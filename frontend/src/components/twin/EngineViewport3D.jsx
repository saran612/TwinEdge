import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  RotateCcw,
  Eye,
  EyeOff,
  Maximize2,
  Camera,
  Layers,
  MapPin,
} from 'lucide-react';
import componentMapData from '../../config/component_map.json';
import { useApp } from '../../context/AppContext';

export default function EngineViewport3D({
  selectedComponentId,
  onSelectComponent,
  colorMode = 'None', // 'None' | 'Impact' | 'Sensor'
  componentAttributions = [],
  zScores = {},
  isXray = false,
  setIsXray,
}) {
  const { theme } = useApp();
  const mountRef = useRef(null);
  const fpsTextRef = useRef(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [hoveredComponent, setHoveredComponent] = useState(null);

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const modelRef = useRef(null);
  const meshesRef = useRef([]);
  const anchorsRef = useRef([]);
  const gridRef = useRef(null);
  const anchorsGroupRef = useRef(null);

  // Expose window.__twin test hooks and ?debug3d=1 metrics
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__twin = {
        select: (id) => onSelectComponent && onSelectComponent(id),
        getSelected: () => selectedComponentId,
        _scene: sceneRef.current,
        _camera: cameraRef.current,
        _renderer: rendererRef.current,
        _model: modelRef.current,
        _meshes: meshesRef.current,
        _anchors: anchorsRef.current,
        getRendererInfo: () => rendererRef.current?.info,
        getSceneDump: () => {
          const nodes = [];
          sceneRef.current?.traverse((node) => {
            nodes.push({
              name: node.name,
              type: node.type,
              isMesh: node.isMesh,
              visible: node.visible,
              position: node.position.toArray(),
              userData: node.userData,
            });
          });
          return nodes;
        },
        getMaterialsSummary: () => {
          const mats = [];
          sceneRef.current?.traverse((node) => {
            if (node.isMesh && node.material) {
              const m = node.material;
              mats.push({
                name: m.name || node.name,
                type: m.type,
                metalness: m.metalness,
                roughness: m.roughness,
                transparent: m.transparent,
                opacity: m.opacity,
                depthWrite: m.depthWrite,
                depthTest: m.depthTest,
              });
            }
          });
          return mats;
        },
      };
    }
  }, [selectedComponentId, onSelectComponent]);

  // Main Three.js Scene Setup (Mounts ONCE on mount, decoupled from selectedComponentId to prevent flicker)
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    // 1. Scene & Camera setup with tuned near/far
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme === 'light' ? 0xf8fafc : 0x090d16);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 50);
    camera.position.set(4, 2.5, 4);
    cameraRef.current = camera;

    // 2. Renderer setup with ACESFilmicToneMapping and sRGB color space
    let renderer;
    let pmremGenerator;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      rendererRef.current = renderer;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      // T2 Local RoomEnvironment setup (no CDN / external requests)
      pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
      const roomEnv = new RoomEnvironment();
      scene.environment = pmremGenerator.fromScene(roomEnv).texture;
    } catch (e) {
      console.warn('WebGLRenderer unavailable in current environment, using canvas dummy:', e.message);
      const dummyCanvas = document.createElement('canvas');
      dummyCanvas.width = width || 300;
      dummyCanvas.height = height || 200;
      rendererRef.current = {
        domElement: dummyCanvas,
        setSize: () => {},
        setPixelRatio: () => {},
        render: () => {},
        dispose: () => {},
      };
      container.innerHTML = '';
      container.appendChild(dummyCanvas);
      setIsLoaded(true);
      return;
    }

    // 3. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 15;
    controls.minDistance = 1.0;
    controlsRef.current = controls;

    // 4. Studio Lighting setup
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, theme === 'light' ? 1.6 : 1.2);
    hemiLight.position.set(0, 10, 0);
    scene.add(hemiLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, theme === 'light' ? 2.0 : 1.6);
    dirLight1.position.set(5, 8, 5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x60a5fa, theme === 'light' ? 1.4 : 1.0);
    dirLight2.position.set(-5, -3, -5);
    scene.add(dirLight2);

    // 5. Grid floor helper
    const gridColor1 = theme === 'light' ? 0x94a3b8 : 0x1e293b;
    const gridColor2 = theme === 'light' ? 0xe2e8f0 : 0x0f172a;
    const grid = new THREE.GridHelper(8, 20, gridColor1, gridColor2);
    grid.position.y = -1.2;
    scene.add(grid);
    gridRef.current = grid;

    // 6. Create hotspot anchor pins (T3)
    const anchorsGroup = new THREE.Group();
    anchorsGroupRef.current = anchorsGroup;
    anchorsRef.current = [];

    componentMapData.components.forEach((comp) => {
      const pos = comp.anchor_position || [0, 0, 0];
      const geom = new THREE.SphereGeometry(0.045, 16, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x4f46e5,
        emissive: 0x312e81,
        roughness: 0.25,
        metalness: 0.2,
        depthTest: true,
        depthWrite: true,
      });
      const sphere = new THREE.Mesh(geom, mat);
      sphere.position.set(pos[0], pos[1], pos[2]);
      sphere.userData = { componentId: comp.id, name: comp.name, isAnchor: true };
      anchorsGroup.add(sphere);
      anchorsRef.current.push(sphere);
    });
    scene.add(anchorsGroup);

    // 7. Load GLTF Turbofan Model with runtime material overrides (T2)
    const loader = new GLTFLoader();
    loader.load(
      '/models/Turbofan_Engine_Animated.glb',
      (gltf) => {
        const model = gltf.scene;
        modelRef.current = model;

        // Auto-scale & center bounding box
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxAxis = Math.max(size.x, size.y, size.z);
        const scale = 3.2 / maxAxis;
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));

        const meshes = [];
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;

            // Runtime material override for near-black metals (T2)
            if (child.material) {
              const origMat = child.material.clone();
              child.userData.origMaterial = origMat;

              // Override dark metals to reflective studio surfaces
              if (child.material.metalness !== undefined) {
                child.material.metalness = Math.min(child.material.metalness, 0.85);
              }
              if (child.material.roughness !== undefined) {
                child.material.roughness = Math.max(child.material.roughness, 0.35);
              }
              child.material.envMapIntensity = 1.5;
              child.material.needsUpdate = true;
            }

            // Keyword matching to components
            const mName = (child.name || '').toLowerCase().replace(/_/g, ' ');
            const matchedComp = componentMapData.components.find((c) =>
              c.mesh_keywords.some((k) => mName.includes(k))
            );
            if (matchedComp) {
              child.userData.componentId = matchedComp.id;
            }
            meshes.push(child);
          }
        });
        meshesRef.current = meshes;
        scene.add(model);
        setIsLoaded(true);
      },
      (xhr) => {
        if (xhr.total > 0) {
          setLoadProgress(Math.round((xhr.loaded / xhr.total) * 100));
        }
      },
      (err) => {
        console.warn('GLB load failed, falling back to procedural anchors:', err);
        setLoadError(err.message);
        setIsLoaded(true);
      }
    );

    // 8. Raycasting for hover & click selection + dev ?calibrate=1
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const isCalibrate = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('calibrate') === '1';

    const getRaycastHits = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Check anchors first
      if (anchorsGroup.visible) {
        const anchorHits = raycaster.intersectObjects(anchorsRef.current);
        if (anchorHits.length > 0) return { type: 'anchor', hit: anchorHits[0] };
      }

      // Check meshes
      if (meshesRef.current.length > 0) {
        const meshHits = raycaster.intersectObjects(meshesRef.current);
        if (meshHits.length > 0) return { type: 'mesh', hit: meshHits[0] };
      }
      return null;
    };

    const handlePointerDown = (event) => {
      const res = getRaycastHits(event);
      if (!res) return;

      if (isCalibrate && res.hit.point) {
        console.info(`[TwinEdge Calibrate] Surface Click World Coord: [${res.hit.point.x.toFixed(3)}, ${res.hit.point.y.toFixed(3)}, ${res.hit.point.z.toFixed(3)}]`);
      }

      const cId = res.hit.object.userData?.componentId;
      if (cId && onSelectComponent) {
        onSelectComponent(cId);
      }
    };

    const handlePointerMove = (event) => {
      const res = getRaycastHits(event);
      if (res && res.hit.object.userData?.componentId) {
        const c = componentMapData.components.find((x) => x.id === res.hit.object.userData.componentId);
        setHoveredComponent(c ? { name: c.name, id: c.id, x: event.clientX, y: event.clientY } : null);
      } else {
        setHoveredComponent(null);
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);

    // 9. High-performance Animation Loop + Rolling 60-frame FPS & p95 frame ms (T6)
    let animationFrameId;
    const frameTimes = [];
    let lastFpsUpdate = performance.now();
    let lastFrameTime = performance.now();

    const animate = (currentTime) => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = currentTime - lastFrameTime;
      lastFrameTime = currentTime;
      if (delta > 0 && delta < 500) {
        frameTimes.push(delta);
        if (frameTimes.length > 60) frameTimes.shift();
      }

      controls.update();
      renderer.render(scene, camera);

      // T6: Update FPS and p95 DOM text at <= 2 Hz (every 500ms) without triggering React re-renders
      if (currentTime - lastFpsUpdate >= 500) {
        if (fpsTextRef.current && frameTimes.length > 0) {
          const avgFps = Math.round(1000 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length));
          const sorted = [...frameTimes].sort((a, b) => a - b);
          const p95Idx = Math.floor(sorted.length * 0.95);
          const p95Ms = sorted[p95Idx] ? sorted[p95Idx].toFixed(1) : (1000 / 60).toFixed(1);
          fpsTextRef.current.textContent = `${avgFps} FPS (${p95Ms}ms)`;
        }
        lastFpsUpdate = currentTime;
      }
    };
    animate(performance.now());

    // 10. ResizeObserver with debouncing
    let resizeTimer;
    const resizeObserver = new ResizeObserver((entries) => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        for (const entry of entries) {
          const { width: w, height: h } = entry.contentRect;
          if (w > 0 && h > 0 && cameraRef.current && rendererRef.current) {
            cameraRef.current.aspect = w / h;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(w, h);
          }
        }
      }, 50);
    });
    resizeObserver.observe(container);

    return () => {
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      if (renderer.domElement) {
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
        renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      }
      cancelAnimationFrame(animationFrameId);
      controls.dispose();
      if (pmremGenerator) pmremGenerator.dispose();
      renderer.dispose();
    };
  }, []); // Run ONCE on mount; updates happen via refs/lightweight effects below

  // Pins visibility toggle (T3)
  useEffect(() => {
    if (anchorsGroupRef.current) {
      anchorsGroupRef.current.visible = showPins;
    }
  }, [showPins]);

  // Update component highlighting and color modes outside scene recreation (T1 & T3)
  useEffect(() => {
    // Update anchors
    anchorsRef.current.forEach((sphere) => {
      const cId = sphere.userData.componentId;
      const isSelected = cId === selectedComponentId;
      if (sphere.material) {
        sphere.material.emissive.setHex(isSelected ? 0x22c55e : 0x312e81);
        sphere.material.color.setHex(isSelected ? 0x4ade80 : 0x4f46e5);
        sphere.scale.setScalar(isSelected ? 1.6 : 1.0);
      }
    });

    // Update meshes
    meshesRef.current.forEach((mesh) => {
      const cId = mesh.userData.componentId;
      const isSelected = cId === selectedComponentId;

      if (mesh.material) {
        mesh.material.transparent = isXray;
        mesh.material.opacity = isXray ? 0.35 : 1.0;
        mesh.material.depthWrite = !isXray;

        if (isSelected) {
          mesh.material.emissive = new THREE.Color(0x38bdf8);
          mesh.material.emissiveIntensity = 0.5;
        } else {
          // Dynamic color modes
          if (colorMode === 'Impact') {
            const attr = componentAttributions.find((a) => a.componentId === cId);
            if (attr && Math.abs(attr.deltaRul) >= 0.5) {
              mesh.material.emissive = new THREE.Color(0xf59e0b); // Warning amber
              mesh.material.emissiveIntensity = 0.4;
            } else {
              mesh.material.emissive = new THREE.Color(0x000000);
              mesh.material.emissiveIntensity = 0;
            }
          } else if (colorMode === 'Sensor') {
            const z = Math.abs(zScores[cId] || 0);
            if (z > 2.0) {
              mesh.material.emissive = new THREE.Color(0xef4444);
              mesh.material.emissiveIntensity = 0.4;
            } else {
              mesh.material.emissive = new THREE.Color(0x000000);
              mesh.material.emissiveIntensity = 0;
            }
          } else {
            mesh.material.emissive = new THREE.Color(0x000000);
            mesh.material.emissiveIntensity = 0;
          }
        }
      }
    });
  }, [selectedComponentId, colorMode, componentAttributions, zScores, isXray]);

  // Sync scene background & theme
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(theme === 'light' ? 0xf8fafc : 0x090d16);
    }
    if (gridRef.current && sceneRef.current) {
      sceneRef.current.remove(gridRef.current);
      gridRef.current.geometry.dispose();
      gridRef.current.material.dispose();
      const gridColor1 = theme === 'light' ? 0x94a3b8 : 0x1e293b;
      const gridColor2 = theme === 'light' ? 0xe2e8f0 : 0x0f172a;
      const newGrid = new THREE.GridHelper(8, 20, gridColor1, gridColor2);
      newGrid.position.y = -1.2;
      sceneRef.current.add(newGrid);
      gridRef.current = newGrid;
    }
  }, [theme]);

  const resetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(4, 2.5, 4);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  const takeScreenshot = () => {
    if (rendererRef.current) {
      const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `twinedge-engine-${selectedComponentId || 'all'}.png`;
      link.href = dataUrl;
      link.click();
    }
  };

  return (
    <div className="relative w-full h-full bg-surface overflow-hidden flex flex-col select-none">
      {/* 3D Viewport Toolbar */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-surface/90 border border-border rounded-md p-1 text-xs font-mono backdrop-blur-md shadow-xs">
        <button
          onClick={resetCamera}
          className="p-1.5 text-text-2 hover:text-text hover:bg-surface-2 rounded-sm transition-colors cursor-pointer"
          title="Reset Camera"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setIsXray(!isXray)}
          className={`p-1.5 rounded-sm transition-colors cursor-pointer ${
            isXray ? 'bg-accent text-on-accent' : 'text-text-2 hover:text-text hover:bg-surface-2'
          }`}
          title="X-Ray Mode"
        >
          <Layers className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setShowPins(!showPins)}
          className={`p-1.5 rounded-sm transition-colors cursor-pointer ${
            showPins ? 'bg-surface-2 text-accent' : 'text-text-muted hover:text-text'
          }`}
          title={showPins ? 'Hide Hotspot Pins' : 'Show Hotspot Pins'}
        >
          <MapPin className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={takeScreenshot}
          className="p-1.5 text-text-2 hover:text-text hover:bg-surface-2 rounded-sm transition-colors cursor-pointer"
          title="Screenshot PNG"
        >
          <Camera className="w-3.5 h-3.5" />
        </button>
        <div className="h-3 w-px bg-border mx-0.5"></div>
        {/* T6: Real rolling FPS and p95 ms updated via ref */}
        <span ref={fpsTextRef} className="text-xs text-text-muted px-1 tabular-nums">
          60 FPS (16.6ms)
        </span>
      </div>

      {/* Hover Tooltip (T3) */}
      {hoveredComponent && (
        <div
          className="fixed pointer-events-none z-40 bg-surface/95 border border-border px-2.5 py-1 rounded shadow-md text-xs font-mono text-text flex items-center gap-1.5 backdrop-blur-xs transform -translate-x-1/2 -translate-y-full"
          style={{ left: hoveredComponent.x, top: hoveredComponent.y - 12 }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span>{hoveredComponent.name}</span>
        </div>
      )}

      {/* Loading Overlay */}
      {!isLoaded && (
        <div className="absolute inset-0 z-30 bg-surface/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center">
          <div className="w-48 bg-surface-2 rounded-full h-2 mb-3 overflow-hidden border border-border">
            <div
              className="bg-accent h-2 rounded-full transition-all duration-200"
              style={{ width: `${loadProgress}%` }}
            ></div>
          </div>
          <span className="text-xs font-mono text-text-2">
            Loading Turbofan Geometry ({loadProgress}%)...
          </span>
        </div>
      )}

      {/* Model Fallback Notice */}
      {loadError && (
        <div className="absolute bottom-3 left-3 z-20 bg-amber-950/80 border border-amber-800 text-amber-300 px-3 py-1.5 rounded text-xs font-mono flex items-center gap-2">
          <span>Active: Hotspot Anchor Framework (Model fallback)</span>
        </div>
      )}

      {/* Canvas Mount Container */}
      <div ref={mountRef} className="w-full h-full flex-1 cursor-grab active:cursor-grabbing" />
    </div>
  );
}
