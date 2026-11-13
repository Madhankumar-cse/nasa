import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { sampleHeight } from '@/src/engine/terrainEngine';
import {
  HazardLayersState,
  LandingSite,
  SolarEarthState,
  TerrainDataset,
} from '@/src/types/mission';

interface LunarTerrainViewportProps {
  dataset: TerrainDataset;
  sites: LandingSite[];
  selectedSiteId: string | null;
  onSelectSite: (siteId: string) => void;
  hazardLayers: HazardLayersState;
  analysisRevealed: boolean;
  isAnalyzing: boolean;
  scanProgress: number; // 0..1
  solarEarthState: SolarEarthState;
  performanceMode: boolean;
  idleOrbit: boolean;
  cameraFocusNonce: number;
}

// Detect software WebGL (SwiftShader/llvmpipe/WARP) once at module load
const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
})();

// Pre-allocated math helpers outside render loop
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function createProceduralRegolithTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#6f7682';
  ctx.fillRect(0, 0, size, size);

  // Albedo mottling + regolith dust grain
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  for (let i = 0; i < size * size; i++) {
    const s = Math.sin(i * 12.9898) * 43758.5453;
    const n = (s - Math.floor(s)) * 28 - 14;
    const idx = i * 4;
    data[idx] = Math.max(40, Math.min(200, 114 + n));
    data[idx + 1] = Math.max(40, Math.min(200, 118 + n));
    data[idx + 2] = Math.max(45, Math.min(210, 126 + n));
    data[idx + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  // Subtle micro-impact craters
  for (let i = 0; i < 240; i++) {
    const s1 = Math.sin(i * 91.7) * 43758.54;
    const s2 = Math.sin(i * 37.3) * 29384.11;
    const s3 = Math.sin(i * 53.1) * 19384.77;
    const x = (s1 - Math.floor(s1)) * size;
    const y = (s2 - Math.floor(s2)) * size;
    const r = 1.5 + (s3 - Math.floor(s3)) * 9;

    ctx.fillStyle = 'rgba(32, 36, 44, 0.25)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(205, 213, 225, 0.14)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x - 0.8, y + 0.8, r * 0.9, 0, Math.PI);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function SceneEnvironment({ performanceMode }: { performanceMode: boolean }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    const env = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    pmremGenerator.dispose();
    return () => {
      env.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);

  useEffect(() => {
    scene.fog = new THREE.FogExp2('#05070f', performanceMode ? 0.0075 : 0.009);
    return () => {
      scene.fog = null;
    };
  }, [scene, performanceMode]);

  return null;
}

function LunarTerrainMesh({
  dataset,
  performanceMode,
}: {
  dataset: TerrainDataset;
  performanceMode: boolean;
}) {
  const { gl } = useThree();
  const segments = performanceMode ? 64 : 111;

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(dataset.worldSize, dataset.worldSize, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = sampleHeight(dataset, x, z);
      pos.setY(i, y);

      // Subtle mineral / shadow regolith tint by elevation
      const t = THREE.MathUtils.clamp((y + 4.8) / 8.5, 0, 1);
      const shade = 0.44 + t * 0.44;
      colors[i * 3] = shade * 0.96;
      colors[i * 3 + 1] = shade * 0.98;
      colors[i * 3 + 2] = shade * 1.02;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }, [dataset, segments]);

  const defaultTexture = useMemo(() => {
    const tex = createProceduralRegolithTexture();
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return tex;
  }, [gl]);

  const [customTexture, setCustomTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!dataset.customAlbedoUrl) {
      setCustomTexture(null);
      return;
    }
    const loader = new THREE.TextureLoader();
    let active = true;
    loader.load(dataset.customAlbedoUrl, (tex) => {
      if (!active) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      setCustomTexture(tex);
    });
    return () => {
      active = false;
    };
  }, [dataset.customAlbedoUrl, gl]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    return () => {
      defaultTexture.dispose();
    };
  }, [defaultTexture]);

  useEffect(() => {
    return () => {
      customTexture?.dispose();
    };
  }, [customTexture]);

  return (
    <mesh geometry={geometry} receiveShadow castShadow={!performanceMode && !isSoftwareGl}>
      <meshStandardMaterial
        map={customTexture || defaultTexture}
        vertexColors={!customTexture}
        roughness={0.92}
        metalness={0.04}
      />
    </mesh>
  );
}

function HazardOverlayMesh({
  dataset,
  hazardLayers,
  analysisRevealed,
  isAnalyzing,
  scanProgress,
  performanceMode,
}: {
  dataset: TerrainDataset;
  hazardLayers: HazardLayersState;
  analysisRevealed: boolean;
  isAnalyzing: boolean;
  scanProgress: number;
  performanceMode: boolean;
}) {
  const segments = performanceMode ? 64 : 111;
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null);

  const anyZoneVisible =
    (analysisRevealed || isAnalyzing) &&
    (hazardLayers.safeZones || hazardLayers.cautionZones || hazardLayers.highRiskZones);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(dataset.worldSize, dataset.worldSize, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 4);
    const half = dataset.worldSize / 2;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = sampleHeight(dataset, x, z);
      pos.setY(i, y + 0.06);

      const ix = Math.max(
        0,
        Math.min(dataset.gridSize - 1, Math.round(((x + half) / dataset.worldSize) * (dataset.gridSize - 1)))
      );
      const iz = Math.max(
        0,
        Math.min(dataset.gridSize - 1, Math.round(((z + half) / dataset.worldSize) * (dataset.gridSize - 1)))
      );
      const cls = dataset.hazardClasses[iz * dataset.gridSize + ix];

      // Determine visibility by layer toggle & scan sweep frontier
      const scanZLimit = -half + scanProgress * dataset.worldSize;
      const withinScan = analysisRevealed || (isAnalyzing && z <= scanZLimit);

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (withinScan) {
        if (cls === 0 && hazardLayers.safeZones) {
          r = 0.247;
          g = 0.941;
          b = 0.647;
          a = 0.34;
        } else if (cls === 1 && hazardLayers.cautionZones) {
          r = 1.0;
          g = 0.784;
          b = 0.341;
          a = 0.38;
        } else if (cls === 2 && hazardLayers.highRiskZones) {
          r = 1.0;
          g = 0.373;
          b = 0.478;
          a = 0.48;
        }
      }

      colors[i * 4] = r;
      colors[i * 4 + 1] = g;
      colors[i * 4 + 2] = b;
      colors[i * 4 + 3] = a;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    return geo;
  }, [dataset, segments, hazardLayers, analysisRevealed, isAnalyzing, scanProgress]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  if (!anyZoneVisible) return null;

  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshBasicMaterial
        ref={matRef}
        vertexColors
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}

function ContourLinesOverlay({
  dataset,
  visible,
}: {
  dataset: TerrainDataset;
  visible: boolean;
}) {
  const geometry = useMemo(() => {
    const step = 2;
    const gSize = dataset.gridSize;
    const half = dataset.worldSize / 2;
    const cell = dataset.worldSize / (gSize - 1);
    const levels = [-3.6, -2.4, -1.2, 0.0, 1.0, 2.0, 3.0];
    const vertices: number[] = [];

    const posAt = (ix: number, iz: number) => ({
      x: -half + ix * cell,
      z: -half + iz * cell,
      h: dataset.heights[iz * gSize + ix],
    });

    for (let iz = 0; iz < gSize - step; iz += step) {
      for (let ix = 0; ix < gSize - step; ix += step) {
        const p00 = posAt(ix, iz);
        const p10 = posAt(ix + step, iz);
        const p01 = posAt(ix, iz + step);
        const p11 = posAt(ix + step, iz + step);

        const minH = Math.min(p00.h, p10.h, p01.h, p11.h);
        const maxH = Math.max(p00.h, p10.h, p01.h, p11.h);

        for (const lv of levels) {
          if (lv < minH || lv > maxH) continue;
          const pts: [number, number, number][] = [];
          const edges: [typeof p00, typeof p00][] = [
            [p00, p10],
            [p10, p11],
            [p11, p01],
            [p01, p00],
          ];
          for (const [a, b] of edges) {
            if ((a.h <= lv && b.h >= lv) || (b.h <= lv && a.h >= lv)) {
              const denom = Math.abs(b.h - a.h) < 1e-5 ? 1e-5 : b.h - a.h;
              const t = THREE.MathUtils.clamp((lv - a.h) / denom, 0, 1);
              pts.push([
                a.x + (b.x - a.x) * t,
                lv + 0.09,
                a.z + (b.z - a.z) * t,
              ]);
            }
          }
          if (pts.length >= 2) {
            vertices.push(pts[0][0], pts[0][1], pts[0][2], pts[1][0], pts[1][1], pts[1][2]);
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geo;
  }, [dataset]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (!visible) return null;

  return (
    <lineSegments geometry={geometry} renderOrder={3}>
      <lineBasicMaterial color="#4be0ff" transparent opacity={0.38} depthWrite={false} />
    </lineSegments>
  );
}

function CraterRimRings({
  dataset,
  visible,
}: {
  dataset: TerrainDataset;
  visible: boolean;
}) {
  if (!visible || dataset.craters.length === 0) return null;

  return (
    <group>
      {dataset.craters.map((crater) => {
        const y = sampleHeight(dataset, crater.x + crater.radius * 0.92, crater.z) + 0.28;
        return (
          <group key={crater.id} position={[crater.x, y, crater.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
              <ringGeometry args={[crater.radius * 0.88, crater.radius * 0.94, 64]} />
              <meshBasicMaterial
                color="#a78bfa"
                transparent
                opacity={0.48}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]} renderOrder={4}>
              <ringGeometry args={[crater.radius * 0.98, crater.radius * 1.02, 64]} />
              <meshBasicMaterial
                color="#a78bfa"
                transparent
                opacity={0.2}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function InstancedLunarRocks({
  dataset,
  performanceMode,
  showDangerMarkers,
}: {
  dataset: TerrainDataset;
  performanceMode: boolean;
  showDangerMarkers: boolean;
}) {
  const rockMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const beaconMeshRef = useRef<THREE.InstancedMesh | null>(null);

  const visibleRocks = useMemo(() => {
    const cap = performanceMode ? 90 : dataset.rocks.length;
    return dataset.rocks.slice(0, cap);
  }, [dataset.rocks, performanceMode]);

  const hazardRocks = useMemo(
    () => visibleRocks.filter((r) => r.isHazard).slice(0, performanceMode ? 18 : 36),
    [visibleRocks, performanceMode]
  );

  const rockGeo = useMemo(() => new THREE.DodecahedronGeometry(0.42, 0), []);
  const beaconGeo = useMemo(() => new THREE.ConeGeometry(0.18, 0.75, 4), []);

  useEffect(() => {
    const mesh = rockMeshRef.current;
    if (!mesh) return;
    for (let i = 0; i < visibleRocks.length; i++) {
      const r = visibleRocks[i];
      _dummy.position.set(r.x, r.y + r.scale * 0.14, r.z);
      _dummy.rotation.set(r.rotX, r.rotY, 0);
      _dummy.scale.set(r.scale * 1.25, r.scale * 0.85, r.scale);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);

      const tint = 0.42 + ((i * 17) % 10) * 0.025;
      _color.setRGB(tint, tint * 1.01, tint * 1.04);
      mesh.setColorAt(i, _color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [visibleRocks]);

  useFrame(({ clock }) => {
    const beaconMesh = beaconMeshRef.current;
    if (!beaconMesh || !showDangerMarkers || hazardRocks.length === 0) return;
    const t = clock.getElapsedTime();
    for (let i = 0; i < hazardRocks.length; i++) {
      const r = hazardRocks[i];
      const pulse = 0.85 + 0.25 * Math.sin(t * 4.2 + i * 0.7);
      _dummy.position.set(r.x, r.y + 0.85 + Math.sin(t * 2.5 + i) * 0.14, r.z);
      _dummy.rotation.set(Math.PI, t * 1.2 + i, 0);
      _dummy.scale.setScalar(pulse);
      _dummy.updateMatrix();
      beaconMesh.setMatrixAt(i, _dummy.matrix);
    }
    beaconMesh.instanceMatrix.needsUpdate = true;
  });

  useEffect(() => {
    return () => {
      rockGeo.dispose();
      beaconGeo.dispose();
    };
  }, [rockGeo, beaconGeo]);

  return (
    <group>
      <instancedMesh
        ref={rockMeshRef}
        args={[rockGeo, undefined, Math.max(1, visibleRocks.length)]}
        castShadow={!performanceMode && !isSoftwareGl}
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial roughness={0.94} metalness={0.08} />
      </instancedMesh>

      {showDangerMarkers && hazardRocks.length > 0 && (
        <instancedMesh
          ref={beaconMeshRef}
          args={[beaconGeo, undefined, hazardRocks.length]}
          frustumCulled={false}
        >
          <meshBasicMaterial color="#ff5f7a" transparent opacity={0.88} />
        </instancedMesh>
      )}
    </group>
  );
}

function LunarDustParticles({
  worldSize,
  performanceMode,
}: {
  worldSize: number;
  performanceMode: boolean;
}) {
  const pointsRef = useRef<THREE.Points | null>(null);
  const count = performanceMode ? 70 : 240;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const s1 = Math.sin(i * 12.13) * 43758.54;
      const s2 = Math.sin(i * 47.91) * 19384.22;
      const s3 = Math.sin(i * 81.53) * 29384.77;
      positions[i * 3] = ((s1 - Math.floor(s1)) - 0.5) * worldSize * 0.92;
      positions[i * 3 + 1] = 0.5 + (s2 - Math.floor(s2)) * 8.5;
      positions[i * 3 + 2] = ((s3 - Math.floor(s3)) - 0.5) * worldSize * 0.92;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count, worldSize]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y = clock.getElapsedTime() * 0.015;
  });

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color="#cbd5e1"
        size={0.14}
        sizeAttenuation
        transparent
        opacity={0.34}
        depthWrite={false}
      />
    </points>
  );
}

function ScanningSweepEffect({
  isAnalyzing,
  scanProgress,
  worldSize,
}: {
  isAnalyzing: boolean;
  scanProgress: number;
  worldSize: number;
}) {
  if (!isAnalyzing) return null;
  const half = worldSize / 2;
  const zPos = -half + scanProgress * worldSize;

  return (
    <group position={[0, 2.2, zPos]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
        <planeGeometry args={[worldSize, 2.6]} />
        <meshBasicMaterial
          color="#4be0ff"
          transparent
          opacity={0.28}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[worldSize, 7.5, 0.14]} />
        <meshBasicMaterial
          color="#4be0ff"
          transparent
          opacity={0.14}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function LandingSiteMarker({
  site,
  terrainHeight,
  isSelected,
  onSelect,
}: {
  site: LandingSite;
  terrainHeight: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const ringRef = useRef<THREE.Mesh | null>(null);
  const expandRingRef = useRef<THREE.Mesh | null>(null);
  const beamRef = useRef<THREE.Mesh | null>(null);

  const colorHex =
    site.riskLevel === 'safe'
      ? '#3ff0a5'
      : site.riskLevel === 'caution'
      ? '#ffc857'
      : '#ff5f7a';

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      const s = isSelected ? 1 + Math.sin(t * 3.4) * 0.12 : 1 + Math.sin(t * 2) * 0.05;
      ringRef.current.scale.set(s, s, 1);
    }
    if (expandRingRef.current && isSelected) {
      const cycle = (t * 0.65) % 1;
      const scale = 0.65 + cycle * 1.15;
      expandRingRef.current.scale.set(scale, scale, 1);
      (expandRingRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - cycle) * 0.55;
    }
    if (beamRef.current) {
      const mat = beamRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = isSelected ? 0.34 + Math.sin(t * 3.0) * 0.1 : 0.12;
    }
  });

  const riskLabel =
    site.riskLevel === 'safe' ? 'SAFE' : site.riskLevel === 'caution' ? 'CAUTION' : 'HIGH RISK';

  return (
    <group position={[site.x, terrainHeight + 0.14, site.z]}>
      {/* Landing Pad Base */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={6}
      >
        <circleGeometry args={[0.7, 32]} />
        <meshBasicMaterial color={isSelected ? '#4be0ff' : colorHex} transparent opacity={0.55} />
      </mesh>

      {/* Pulsing Selection Ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} renderOrder={7}>
        <ringGeometry args={[site.ellipseRadiusWorld * 0.52, site.ellipseRadiusWorld * 0.58, 48]} />
        <meshBasicMaterial
          color={isSelected ? '#4be0ff' : colorHex}
          transparent
          opacity={isSelected ? 0.85 : 0.45}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Expanding Landing Ellipse Ring when Selected */}
      {isSelected && (
        <mesh ref={expandRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} renderOrder={7}>
          <ringGeometry args={[site.ellipseRadiusWorld * 0.92, site.ellipseRadiusWorld, 56]} />
          <meshBasicMaterial
            color="#4be0ff"
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Animated Vertical Holographic Beam */}
      <mesh ref={beamRef} position={[0, isSelected ? 6.2 : 3.2, 0]} renderOrder={5}>
        <cylinderGeometry args={[0.04, isSelected ? 0.36 : 0.18, isSelected ? 12.4 : 6.4, 16, 1, true]} />
        <meshBasicMaterial
          color={isSelected ? '#4be0ff' : colorHex}
          transparent
          opacity={isSelected ? 0.36 : 0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Compact 3-part Lander Marker Beacon when selected */}
      {isSelected && (
        <group position={[0, 0.35, 0]}>
          <mesh castShadow>
            <octahedronGeometry args={[0.32, 0]} />
            <meshStandardMaterial color="#4be0ff" metalness={0.85} roughness={0.2} emissive="#4be0ff" emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[0, -0.22, 0]}>
            <cylinderGeometry args={[0.42, 0.54, 0.12, 8]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.75} roughness={0.35} />
          </mesh>
        </group>
      )}

      {/* Interactive Holographic HTML Tag */}
      <Html
        position={[0, isSelected ? 4.4 : 2.8, 0]}
        center
        distanceFactor={38}
        zIndexRange={[10, 0]}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`group flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1 text-left whitespace-nowrap transition-transform duration-150 hover:scale-105 ${
            isSelected
              ? 'border-[#4be0ff]/80 bg-[#071020]/95 shadow-[0_0_20px_rgba(75,224,255,0.28)]'
              : 'border-slate-700/80 bg-[#0a0f1d]/90 hover:border-slate-500'
          }`}
        >
          <span className="font-mono text-[11px] font-semibold text-[#4be0ff]">
            {site.id}
          </span>
          <span className="font-mono text-[11px] font-semibold text-white">
            {site.safetyScore}
          </span>
          <span
            className="font-mono text-[9px] font-semibold tracking-wider"
            style={{ color: colorHex }}
          >
            {riskLabel}
          </span>
        </button>
      </Html>
    </group>
  );
}

function CameraController({
  selectedSite,
  dataset,
  idleOrbit,
  cameraFocusNonce,
}: {
  selectedSite: LandingSite | null;
  dataset: TerrainDataset;
  idleOrbit: boolean;
  cameraFocusNonce: number;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const flyActiveRef = useRef(false);
  const userInteractingRef = useRef(false);
  const lastFocusNonceRef = useRef(cameraFocusNonce);
  const lastSiteIdRef = useRef<string | null>(selectedSite?.id ?? null);

  useEffect(() => {
    const siteChanged = selectedSite?.id !== lastSiteIdRef.current;
    const nonceChanged = cameraFocusNonce !== lastFocusNonceRef.current;
    if (selectedSite && (siteChanged || nonceChanged)) {
      lastSiteIdRef.current = selectedSite.id;
      lastFocusNonceRef.current = cameraFocusNonce;
      flyActiveRef.current = true;
    }
  }, [selectedSite, cameraFocusNonce]);

  useFrame((_state, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (flyActiveRef.current && selectedSite && !userInteractingRef.current) {
      const y = sampleHeight(dataset, selectedSite.x, selectedSite.z);
      _targetLook.set(selectedSite.x, y + 0.6, selectedSite.z);
      _targetPos.set(selectedSite.x + 15.5, y + 12.5, selectedSite.z + 17.5);

      const dampFactor = 1 - Math.exp(-3.4 * Math.min(delta, 0.05));
      camera.position.lerp(_targetPos, dampFactor);
      controls.target.lerp(_targetLook, dampFactor);

      if (
        camera.position.distanceTo(_targetPos) < 0.18 &&
        controls.target.distanceTo(_targetLook) < 0.12
      ) {
        flyActiveRef.current = false;
      }
    }

    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={!isSoftwareGl}
      dampingFactor={0.06}
      autoRotate={idleOrbit && !isSoftwareGl && !flyActiveRef.current}
      autoRotateSpeed={0.35}
      minDistance={11}
      maxDistance={76}
      minPolarAngle={0.22}
      maxPolarAngle={Math.PI * 0.45}
      onStart={() => {
        userInteractingRef.current = true;
        flyActiveRef.current = false;
      }}
      onEnd={() => {
        userInteractingRef.current = false;
      }}
    />
  );
}

export default function LunarTerrainViewport({
  dataset,
  sites,
  selectedSiteId,
  onSelectSite,
  hazardLayers,
  analysisRevealed,
  isAnalyzing,
  scanProgress,
  solarEarthState,
  performanceMode,
  idleOrbit,
  cameraFocusNonce,
}: LunarTerrainViewportProps) {
  const [contextLost, setContextLost] = useState(false);

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedSiteId) ?? sites[0] ?? null,
    [sites, selectedSiteId]
  );

  // Convert Sun azimuth & elevation to directional light position
  const sunPos = useMemo<[number, number, number]>(() => {
    const azRad = (solarEarthState.sunAzimuthDeg * Math.PI) / 180;
    const elDeg = Math.max(4, solarEarthState.sunElevationDeg + 9); // subtle visual elevation lift so south-pole shadows read crisply
    const elRad = (elDeg * Math.PI) / 180;
    const dist = 65;
    return [
      Math.cos(azRad) * Math.cos(elRad) * dist,
      Math.sin(elRad) * dist,
      Math.sin(azRad) * Math.cos(elRad) * dist,
    ];
  }, [solarEarthState.sunAzimuthDeg, solarEarthState.sunElevationDeg]);

  const dpr: [number, number] = isSoftwareGl || performanceMode ? [1, 1] : [1, 1.75];

  if (contextLost) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-slate-800 bg-[#070b15] p-6 text-center">
        <p className="font-display text-lg font-semibold text-white">3D WebGL Context Interrupted</p>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          Your browser paused the hardware graphics context. Click below to restore the lunar terrain inspector.
        </p>
        <button
          type="button"
          onClick={() => setContextLost(false)}
          className="mt-4 cursor-pointer rounded-lg border border-[#4be0ff]/40 bg-[#4be0ff]/15 px-4 py-2 text-xs font-medium text-[#4be0ff] hover:bg-[#4be0ff]/25"
        >
          Restore 3D Viewport
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#05070f]">
      <Canvas
        shadows={!performanceMode && !isSoftwareGl}
        dpr={dpr}
        camera={{ position: [28, 22, 34], fov: 44, near: 0.2, far: 260 }}
        gl={{
          antialias: !isSoftwareGl && !performanceMode,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.12,
        }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            setContextLost(true);
          });
          canvas.addEventListener('webglcontextrestored', () => {
            setContextLost(false);
          });
        }}
      >
        <color attach="background" args={['#05070f']} />
        <SceneEnvironment performanceMode={performanceMode} />

        {/* Lunar South-Pole Directional Sunlight + Cool Earthshine Hemisphere Fill */}
        <hemisphereLight args={['#8fb4ff', '#101522', 0.42]} />
        <directionalLight
          position={sunPos}
          intensity={2.45}
          color="#fff4e0"
          castShadow={!performanceMode && !isSoftwareGl}
          shadow-mapSize-width={performanceMode ? 512 : 1024}
          shadow-mapSize-height={performanceMode ? 512 : 1024}
          shadow-camera-near={5}
          shadow-camera-far={160}
          shadow-camera-left={-44}
          shadow-camera-right={44}
          shadow-camera-top={44}
          shadow-camera-bottom={-44}
          shadow-bias={-0.0005}
          shadow-normalBias={0.03}
        />
        {/* Rim fill light for lunar ridge definition */}
        <directionalLight position={[-40, 18, -35]} intensity={0.45} color="#5b8cff" />

        <LunarTerrainMesh dataset={dataset} performanceMode={performanceMode} />

        <HazardOverlayMesh
          dataset={dataset}
          hazardLayers={hazardLayers}
          analysisRevealed={analysisRevealed}
          isAnalyzing={isAnalyzing}
          scanProgress={scanProgress}
          performanceMode={performanceMode}
        />

        <ContourLinesOverlay dataset={dataset} visible={hazardLayers.contourLines} />
        <CraterRimRings dataset={dataset} visible={hazardLayers.craterRims} />

        <InstancedLunarRocks
          dataset={dataset}
          performanceMode={performanceMode}
          showDangerMarkers={hazardLayers.boulderMarkers && (analysisRevealed || isAnalyzing)}
        />

        <LunarDustParticles worldSize={dataset.worldSize} performanceMode={performanceMode} />

        <ScanningSweepEffect
          isAnalyzing={isAnalyzing}
          scanProgress={scanProgress}
          worldSize={dataset.worldSize}
        />

        {hazardLayers.siteMarkers &&
          sites.map((site) => (
            <LandingSiteMarker
              key={site.id}
              site={site}
              terrainHeight={sampleHeight(dataset, site.x, site.z)}
              isSelected={site.id === selectedSite?.id}
              onSelect={() => onSelectSite(site.id)}
            />
          ))}

        <CameraController
          selectedSite={selectedSite}
          dataset={dataset}
          idleOrbit={idleOrbit}
          cameraFocusNonce={cameraFocusNonce}
        />
      </Canvas>
    </div>
  );
}
