import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  Play, Pause, RotateCcw, Eye, ShieldAlert, Cpu, 
  Activity, Layers, Info, Maximize2, Compass, Zap
} from 'lucide-react';

const HOTSPOTS = [
  {
    id: 'fan',
    name: 'Fan & LPC (Low-Pressure Compressor)',
    station: 'Station 2 / 2.5',
    position: [0, 0, 1.8],
    sensorKey: 's_2',
    sensorName: 'Total Temp at Fan Inlet',
    nominal: '642.5 °R',
    description: 'Titanium wide-chord bypass fan blades. Drives cold bypass air producing ~80% of takeoff thrust.'
  },
  {
    id: 'hpc',
    name: 'HPC (High-Pressure Compressor)',
    station: 'Station 3',
    position: [0, 0, 0.4],
    sensorKey: 's_3',
    sensorName: 'Total Temp at HPC Outlet',
    nominal: '1589.6 °R',
    description: 'Multi-stage axial compressor. Prime location for C-MAPSS blade clearance wear and thermal fatigue degradation.'
  },
  {
    id: 'combustor',
    name: 'Combustion Chamber & HPT',
    station: 'Station 4',
    position: [0, 0, -0.6],
    sensorKey: 's_4',
    sensorName: 'Physical Core Speed',
    nominal: '1405.2 RPM',
    description: 'Annular combustor and high-pressure turbine driving core compressor spool under peak thermal stress.'
  },
  {
    id: 'lpt',
    name: 'LPT (Low-Pressure Turbine) & Exhaust',
    station: 'Station 5',
    position: [0, 0, -1.8],
    sensorKey: 's_11',
    sensorName: 'Exhaust Gas Temp / Static Pressure',
    nominal: '47.4 psia',
    description: 'Multi-stage LPT extracting kinetic energy to drive front fan. Exhaust nozzle directs mixed flow thrust.'
  }
];

export default function Turbofan3DView({ 
  telemetry = [], 
  selectedEngineId = 3, 
  onSelectEngine 
}) {
  const mountRef = useRef(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  
  // 3D Controls State
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isWireframe, setIsWireframe] = useState(false);
  const [isXray, setIsXray] = useState(false);
  const [activeHotspot, setActiveHotspot] = useState(null);
  const [cameraView, setCameraView] = useState('iso');

  // Internal Three.js references
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const mixerRef = useRef(null);
  const actionRef = useRef(null);
  const modelRef = useRef(null);
  const materialsRef = useRef([]);

  // Telemetry computation for selected engine
  const engineData = telemetry.filter(t => t.engine_id === selectedEngineId);
  const latestCycle = engineData.length > 0 ? Math.max(...engineData.map(d => d.cycle)) : 125;
  const rulRecord = engineData.find(d => d.cycle === latestCycle && d.sensor === 'rul_prediction');
  const currentRUL = rulRecord ? rulRecord.value : (selectedEngineId === 3 ? 43.2 : 115.0);
  const isAnomaly = currentRUL < 60;

  // Initialize Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene - Aerospace Light Studio Background
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xf1f5f9);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(4.5, 2.5, 4.5);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 15;
    controls.minDistance = 1.2;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // 5. Studio Lighting for Clean Metallic Reflection on Light Background
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(5, 8, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x94a3b8, 1.0); // Soft cool studio fill
    fillLight.position.set(-5, 4, 5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x6366f1, 0.7); // Crisp indigo rim
    rimLight.position.set(-6, -2, -5);
    scene.add(rimLight);

    // Soft ground shadow plane for studio grounding
    const shadowGeo = new THREE.PlaneGeometry(12, 12);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.12 });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.2;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // Subtle Light Studio Grid
    const grid = new THREE.GridHelper(12, 24, 0x6366f1, 0xcbd5e1);
    grid.position.y = -1.21;
    scene.add(grid);

    // 6. Load Turbofan GLB
    const loader = new GLTFLoader();
    setIsLoading(true);
    loader.load(
      '/models/Turbofan_Engine_Animated.glb',
      (gltf) => {
        const model = gltf.scene;
        modelRef.current = model;

        // Auto-center & Normalize Size
        const bbox = new THREE.Box3().setFromObject(model);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3.2 / maxDim; // Normalize scale to ~3.2 units
        model.scale.set(scale, scale, scale);
        model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

        // Collect materials for wireframe/xray modes
        const mats = [];
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              if (Array.isArray(child.material)) {
                mats.push(...child.material);
              } else {
                mats.push(child.material);
              }
            }
          }
        });
        materialsRef.current = mats;

        scene.add(model);

        // 7. Setup Built-in Animation
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          mixerRef.current = mixer;
          const action = mixer.clipAction(gltf.animations[0]);
          action.play();
          actionRef.current = action;
        }

        setIsLoading(false);
      },
      (xhr) => {
        if (xhr.total > 0) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          setLoadingProgress(pct);
        }
      },
      (error) => {
        console.error('Error loading turbofan model:', error);
        setLoadError('Failed to load 3D Turbofan model. Verify /models/Turbofan_Engine_Animated.glb exists.');
        setIsLoading(false);
      }
    );

    // 8. Animation & Render Loop
    const clock = new THREE.Clock();
    let animationFrameId;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (mixerRef.current && isPlaying) {
        mixerRef.current.update(delta * playbackSpeed);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 9. Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update Animation Play / Pause / Speed
  useEffect(() => {
    if (actionRef.current) {
      actionRef.current.paused = !isPlaying;
      actionRef.current.timeScale = playbackSpeed;
    }
  }, [isPlaying, playbackSpeed]);

  // Wireframe toggle
  useEffect(() => {
    materialsRef.current.forEach((m) => {
      if (m) m.wireframe = isWireframe;
    });
  }, [isWireframe]);

  // X-Ray / Transparent casing toggle
  useEffect(() => {
    materialsRef.current.forEach((m) => {
      if (m) {
        m.transparent = isXray;
        m.opacity = isXray ? 0.35 : 1.0;
        m.needsUpdate = true;
      }
    });
  }, [isXray]);

  // Camera Presets
  const setCameraPreset = (view) => {
    if (!cameraRef.current || !controlsRef.current) return;
    setCameraView(view);
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;

    switch (view) {
      case 'front':
        cam.position.set(0, 0, 5.0);
        ctrl.target.set(0, 0, 0);
        break;
      case 'side':
        cam.position.set(5.5, 0, 0);
        ctrl.target.set(0, 0, 0);
        break;
      case 'top':
        cam.position.set(0, 5.5, 0);
        ctrl.target.set(0, 0, 0);
        break;
      case 'exhaust':
        cam.position.set(0, 0, -5.0);
        ctrl.target.set(0, 0, 0);
        break;
      case 'iso':
      default:
        cam.position.set(4.2, 2.2, 4.2);
        ctrl.target.set(0, 0, 0);
        break;
    }
    ctrl.update();
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-100 rounded-2xl overflow-hidden border border-slate-300 shadow-sm">
      {/* Top Controls & Status Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-4 pointer-events-none">
        {/* Left: Engine Selector & Status Pill */}
        <div className="flex items-center gap-3 pointer-events-auto bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-200 shadow-lg text-slate-800">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-indigo-600" />
            <span className="text-xs font-semibold text-slate-500">Digital Twin:</span>
            <select
              value={selectedEngineId}
              onChange={(e) => onSelectEngine && onSelectEngine(parseInt(e.target.value))}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-bold focus:outline-none"
            >
              <option value={3}>Engine #3 (Active Stream)</option>
              <option value={1}>Engine #1</option>
              <option value={2}>Engine #2</option>
              <option value={24}>Engine #24 (Critical)</option>
              <option value={34}>Engine #34 (Hangar Stand)</option>
            </select>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Real-time RUL Badge */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Predicted RUL:</span>
            <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono border ${
              isAnomaly 
                ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse' 
                : 'bg-emerald-50 text-emerald-700 border-emerald-300'
            }`}>
              {currentRUL} cycles
            </span>
          </div>

          {isAnomaly && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
              <ShieldAlert className="h-3 w-3" /> Flagged for AME Inspection
            </span>
          )}
        </div>

        {/* Right: Camera Presets & Render Modes */}
        <div className="flex items-center gap-2 pointer-events-auto bg-white/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-200 shadow-lg text-slate-800">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCameraPreset('iso')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                cameraView === 'iso' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Isometric
            </button>
            <button
              onClick={() => setCameraPreset('front')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                cameraView === 'front' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Intake
            </button>
            <button
              onClick={() => setCameraPreset('side')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                cameraView === 'side' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => setCameraPreset('exhaust')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                cameraView === 'exhaust' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Exhaust
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Mode Toggles */}
          <button
            onClick={() => setIsWireframe(!isWireframe)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isWireframe ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="CAD Wireframe Mode"
          >
            Wireframe
          </button>
          <button
            onClick={() => setIsXray(!isXray)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isXray ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="X-Ray Casing Transparency"
          >
            X-Ray
          </button>
        </div>
      </div>

      {/* 3D Canvas Container */}
      <div 
        ref={mountRef} 
        className="w-full h-full flex-1 cursor-grab active:cursor-grabbing outline-none"
      />

      {/* Loading Screen Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-slate-100/95 backdrop-blur-md flex flex-col items-center justify-center z-30">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full border-4 border-indigo-500/20 border-t-indigo-600 animate-spin" />
            <Layers className="h-8 w-8 text-indigo-600 absolute inset-0 m-auto" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 tracking-wide">Loading 3D Turbofan Digital Twin</h3>
          <p className="text-xs text-slate-600 mt-2 font-mono">
            {loadingProgress > 0 ? `Streaming mesh geometry: ${loadingProgress}%` : 'Initializing WebGL shaders & materials...'}
          </p>
          <div className="w-64 h-1.5 bg-slate-300 rounded-full overflow-hidden mt-4">
            <div 
              className="h-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${Math.max(loadingProgress, 10)}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Banner */}
      {loadError && (
        <div className="absolute inset-0 bg-slate-100/95 flex flex-col items-center justify-center z-30 p-6 text-center">
          <ShieldAlert className="h-12 w-12 text-rose-500 mb-4" />
          <h3 className="text-lg font-bold text-slate-900">3D Asset Loading Failed</h3>
          <p className="text-xs text-slate-600 max-w-md mt-2">{loadError}</p>
        </div>
      )}

      {/* Hotspots Component Sidebar Panel */}
      <div className="absolute top-20 right-4 z-20 w-80 space-y-2 pointer-events-auto">
        <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-xl text-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Compass className="h-4 w-4 text-indigo-600" /> Turbofan Subsystem Sensors
            </h4>
            <span className="text-[10px] text-slate-500 font-mono">C-MAPSS FD001</span>
          </div>

          <div className="space-y-1.5">
            {HOTSPOTS.map((hs) => {
              const isSelected = activeHotspot?.id === hs.id;
              return (
                <button
                  key={hs.id}
                  onClick={() => setActiveHotspot(isSelected ? null : hs)}
                  className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex flex-col gap-1 ${
                    isSelected 
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-950 shadow-sm' 
                      : 'bg-slate-50/80 border-slate-200/80 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="truncate">{hs.name}</span>
                    <span className="text-[10px] text-indigo-600 font-mono">{hs.station}</span>
                  </div>
                  {isSelected && (
                    <div className="mt-2 pt-2 border-t border-indigo-200 text-[11px] text-slate-600 space-y-1">
                      <p className="leading-relaxed">{hs.description}</p>
                      <div className="flex items-center justify-between text-indigo-700 font-mono pt-1">
                        <span>{hs.sensorName}</span>
                        <span className="font-bold">{hs.nominal}</span>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Animation & Spool Controls Bar */}
      <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-4 pointer-events-none">
        {/* Play / Pause / Speed Controller */}
        <div className="flex items-center gap-3 pointer-events-auto bg-white/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-200 shadow-lg text-slate-800">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-sm"
            title={isPlaying ? 'Pause Spool Rotation' : 'Spin Engine Spools'}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">N1 Spool Speed:</span>
            {[0.5, 1.0, 2.0].map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-2 py-0.5 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                  playbackSpeed === spd 
                    ? 'bg-indigo-50 text-indigo-600 border border-indigo-300' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Quick Camera Reset */}
          <button
            onClick={() => setCameraPreset('iso')}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
            title="Reset Camera"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset View
          </button>
        </div>

        {/* Orbit Hint */}
        <div className="pointer-events-auto bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 text-[11px] text-slate-600 shadow-sm flex items-center gap-2">
          <span>Left click + drag to orbit • Right click to pan • Scroll to zoom</span>
        </div>
      </div>
    </div>
  );
}
