import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  RotateCcw,
  Eye,
  Maximize2,
  Camera,
  Layers,
  HelpCircle,
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
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [fps, setFps] = useState(60);

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const modelRef = useRef(null);
  const meshesRef = useRef([]);
  const anchorsRef = useRef([]);
  const gridRef = useRef(null);
  const ambientLightRef = useRef(null);
  const dirLight1Ref = useRef(null);
  const dirLight2Ref = useRef(null);

  // Test hook exposure when VITE_E2E=1 or dev
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__twin = {
        select: (id) => onSelectComponent && onSelectComponent(id),
        getSelected: () => selectedComponentId,
      };
    }
  }, [selectedComponentId, onSelectComponent]);

  useEffect(() => {
    if (!mountRef.current) return;
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // 1. Scene & Camera setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme === 'light' ? 0xf1f5f9 : 0x060913);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(4, 2.5, 4);
    cameraRef.current = camera;

    // Keyboard navigation (Arrow keys cycle components, Escape clears)
    const handleKeyDown = (e) => {
      const comps = componentMapData.components;
      if (!comps || comps.length === 0) return;
      if (e.key === 'Escape') {
        onSelectComponent && onSelectComponent(null);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        const curIdx = comps.findIndex((c) => c.id === selectedComponentId);
        const nextIdx = curIdx === -1 ? 0 : (curIdx + 1) % comps.length;
        onSelectComponent && onSelectComponent(comps[nextIdx].id);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        const curIdx = comps.findIndex((c) => c.id === selectedComponentId);
        const prevIdx = curIdx === -1 ? comps.length - 1 : (curIdx - 1 + comps.length) % comps.length;
        onSelectComponent && onSelectComponent(comps[prevIdx].id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // 2. Renderer setup capped at DPR 2 with headless fallback
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      rendererRef.current = renderer;
      mountRef.current.innerHTML = '';
      mountRef.current.appendChild(renderer.domElement);
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
      mountRef.current.innerHTML = '';
      mountRef.current.appendChild(dummyCanvas);
      setIsLoaded(true);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }

    // 3. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 15;
    controls.minDistance = 1.2;
    controlsRef.current = controls;

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, theme === 'light' ? 1.3 : 0.8);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const dirLight1 = new THREE.DirectionalLight(0x818cf8, theme === 'light' ? 1.8 : 1.5);
    dirLight1.position.set(5, 8, 5);
    scene.add(dirLight1);
    dirLight1Ref.current = dirLight1;

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, theme === 'light' ? 1.2 : 1.0);
    dirLight2.position.set(-5, -4, -5);
    scene.add(dirLight2);
    dirLight2Ref.current = dirLight2;

    // 5. Grid helper
    const gridColor1 = theme === 'light' ? 0x6366f1 : 0x1e293b;
    const gridColor2 = theme === 'light' ? 0xcbd5e1 : 0x0f172a;
    const grid = new THREE.GridHelper(8, 20, gridColor1, gridColor2);
    grid.position.y = -1.2;
    scene.add(grid);
    gridRef.current = grid;

    // 6. Create hotspot anchor spheres for each component
    const anchorsGroup = new THREE.Group();
    componentMapData.components.forEach((comp) => {
      const pos = comp.anchor_position || [0, 0, 0];
      const geom = new THREE.SphereGeometry(0.12, 16, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x4f46e5,
        emissive: 0x312e81,
        roughness: 0.2,
      });
      const sphere = new THREE.Mesh(geom, mat);
      sphere.position.set(pos[0], pos[1], pos[2]);
      sphere.userData = { componentId: comp.id, name: comp.name, isAnchor: true };
      anchorsGroup.add(sphere);
      anchorsRef.current.push(sphere);
    });
    scene.add(anchorsGroup);

    // 7. Load GLB Model
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

        // Traverse meshes
        const meshes = [];
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.userData.origMaterial = child.material;
            // Match with component keywords
            const mName = (child.name || '').toLowerCase();
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
        setIsLoaded(true); // Proceed with procedural anchors
      }
    );

    // 8. Raycasting for click selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Check anchors first
      const anchorIntersects = raycaster.intersectObjects(anchorsRef.current);
      if (anchorIntersects.length > 0) {
        const hit = anchorIntersects[0].object;
        if (hit.userData.componentId) {
          onSelectComponent && onSelectComponent(hit.userData.componentId);
          return;
        }
      }

      // Check meshes
      if (meshesRef.current.length > 0) {
        const meshIntersects = raycaster.intersectObjects(meshesRef.current);
        if (meshIntersects.length > 0) {
          const hitMesh = meshIntersects[0].object;
          if (hitMesh.userData.componentId) {
            onSelectComponent && onSelectComponent(hitMesh.userData.componentId);
          }
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    // 9. Render loop with FPS measurement
    let animationFrameId;
    let lastTime = performance.now();
    let frameCount = 0;
    let lastFpsUpdate = lastTime;

    const animate = (currentTime) => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);

      frameCount++;
      if (currentTime - lastFpsUpdate >= 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastFpsUpdate)));
        frameCount = 0;
        lastFpsUpdate = currentTime;
      }
    };
    animate(performance.now());

    // 10. Resize observer
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);


    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      if (renderer.domElement) {
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      }
      cancelAnimationFrame(animationFrameId);
      controls.dispose();
      renderer.dispose();
    };
  }, [selectedComponentId, onSelectComponent]);

  // Update component highlighting and color modes
  useEffect(() => {
    // Update anchors
    anchorsRef.current.forEach((sphere) => {
      const cId = sphere.userData.componentId;
      const isSelected = cId === selectedComponentId;
      if (sphere.material) {
        sphere.material.emissive.setHex(isSelected ? 0x22c55e : 0x312e81);
        sphere.scale.setScalar(isSelected ? 1.4 : 1.0);
      }
    });

    // Update meshes
    meshesRef.current.forEach((mesh) => {
      const cId = mesh.userData.componentId;
      const isSelected = cId === selectedComponentId;

      if (mesh.material) {
        mesh.material.transparent = isXray;
        mesh.material.opacity = isXray ? 0.35 : 1.0;

        if (isSelected) {
          mesh.material.emissive = new THREE.Color(0x4338ca);
          mesh.material.emissiveIntensity = 0.6;
        } else {
          mesh.material.emissive = new THREE.Color(0x000000);
          mesh.material.emissiveIntensity = 0.0;
        }
      }
    });
  }, [selectedComponentId, colorMode, isXray]);

  // Synchronize 3D Scene with global theme switch
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(theme === 'light' ? 0xf1f5f9 : 0x060913);
    }
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = theme === 'light' ? 1.3 : 0.8;
    }
    if (dirLight1Ref.current) {
      dirLight1Ref.current.intensity = theme === 'light' ? 1.8 : 1.5;
    }
    if (dirLight2Ref.current) {
      dirLight2Ref.current.intensity = theme === 'light' ? 1.2 : 1.0;
    }
    if (gridRef.current && sceneRef.current) {
      sceneRef.current.remove(gridRef.current);
      gridRef.current.geometry.dispose();
      gridRef.current.material.dispose();
      const gridColor1 = theme === 'light' ? 0x6366f1 : 0x1e293b;
      const gridColor2 = theme === 'light' ? 0xcbd5e1 : 0x0f172a;
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
          onClick={takeScreenshot}
          className="p-1.5 text-text-2 hover:text-text hover:bg-surface-2 rounded-sm transition-colors cursor-pointer"
          title="Screenshot PNG"
        >
          <Camera className="w-3.5 h-3.5" />
        </button>
        <div className="h-3 w-px bg-border mx-0.5"></div>
        <span className="text-xs text-text-muted px-1">{fps} FPS</span>
      </div>

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
