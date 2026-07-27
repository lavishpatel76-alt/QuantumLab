import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { solveHydrogenOrbital, OrbitalParams, OrbitalResult, realSphericalHarmonic, radialWavefunction } from '../../physics/modules/hydrogenAtom';
import CanvasPlot from '../charts/CanvasPlot';
import Heatmap2D from '../charts/Heatmap2D';

const ORBITALS = [
  { n: 1, l: 0, m: 0, label: '1s', desc: 'Spherical 1s shell. Pure (+) phase sphere.' },
  { n: 2, l: 0, m: 0, label: '2s', desc: 'Spherical 2s shell with 1 radial node. (+) Inner core, (-) outer shell.' },
  { n: 2, l: 1, m: 0, label: '2pz', desc: '2p_z Dumbbell along Z-axis. (+) Top lobe, (-) bottom lobe.' },
  { n: 2, l: 1, m: 1, label: '2px', desc: '2p_x Dumbbell along X-axis. (+) Right lobe, (-) left lobe.' },
  { n: 2, l: 1, m: -1, label: '2py', desc: '2p_y Dumbbell along Y-axis. (+) Front lobe, (-) back lobe.' },
  { n: 3, l: 0, m: 0, label: '3s', desc: 'Spherical 3s shell with 2 radial nodes. (+) → (-) → (+) concentric spheres.' },
  { n: 3, l: 1, m: 0, label: '3pz', desc: '3p_z Dumbbell along Z-axis with 1 radial node.' },
  { n: 3, l: 2, m: 0, label: '3dz²', desc: '3d_{z²} Two (+) Z-lobes with an equatorial (-) donut ring in XY plane.' },
  { n: 3, l: 2, m: 2, label: '3dxy', desc: '3d_{xy} Four 3D cloverleaf lobes in the XY plane.' },
  { n: 4, l: 0, m: 0, label: '4s', desc: 'Spherical 4s shell with 3 radial nodes. 4 concentric shells.' },
  { n: 4, l: 1, m: 0, label: '4pz', desc: '4p_z Dumbbell along Z-axis with 2 radial nodes.' },
  { n: 4, l: 3, m: 0, label: '4f', desc: 'Complex 8-lobe / multi-cone 4f 3D angular structure.' },
];

/** Creates a smooth circular radial-gradient alpha sprite texture for Three.js points */
function createParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.85)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
  gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.08)');
  gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

let cachedParticleTexture: THREE.CanvasTexture | null = null;
function getParticleTexture(): THREE.CanvasTexture {
  if (!cachedParticleTexture) cachedParticleTexture = createParticleTexture();
  return cachedParticleTexture;
}

/** Generates smooth 3D parametric surface meshes for orbital lobes (+ Cyan, - Coral) */
function createOrbitalLobeMesh(n: number, l: number, m: number, rMean: number): THREE.Group {
  const group = new THREE.Group();
  const nTheta = 40, nPhi = 80;

  const posPos: number[] = [];
  const posNeg: number[] = [];

  // Radial scale factor for 3D lobe surface mesh
  const scale = Math.max(8, Math.min(30, rMean * 1.2));

  // Build spherical grid
  for (let i = 0; i < nTheta; i++) {
    const theta1 = (i * Math.PI) / nTheta;
    const theta2 = ((i + 1) * Math.PI) / nTheta;

    for (let j = 0; j < nPhi; j++) {
      const phi1 = (j * 2 * Math.PI) / nPhi;
      const phi2 = ((j + 1) * 2 * Math.PI) / nPhi;

      const evalP = (th: number, ph: number) => {
        const Y = realSphericalHarmonic(l, m, th, ph);
        const rVal = scale * Math.pow(Math.abs(Y), 0.85); // Angular lobe radius
        const sinT = Math.sin(th);
        return {
          x: rVal * sinT * Math.cos(ph),
          y: rVal * sinT * Math.sin(ph),
          z: rVal * Math.cos(th),
          Y,
        };
      };

      const p00 = evalP(theta1, phi1);
      const p10 = evalP(theta2, phi1);
      const p01 = evalP(theta1, phi2);
      const p11 = evalP(theta2, phi2);

      const avgY = (p00.Y + p10.Y + p01.Y + p11.Y) / 4;
      const arr = avgY >= 0 ? posPos : posNeg;

      // Triangle 1
      arr.push(p00.x, p00.y, p00.z, p10.x, p10.y, p10.z, p01.x, p01.y, p01.z);
      // Triangle 2
      arr.push(p10.x, p10.y, p10.z, p11.x, p11.y, p11.z, p01.x, p01.y, p01.z);
    }
  }

  // Positive (+ψ) Lobe Mesh (Electric Cyan)
  if (posPos.length > 0) {
    const geoPos = new THREE.BufferGeometry();
    geoPos.setAttribute('position', new THREE.Float32BufferAttribute(posPos, 3));
    geoPos.computeVertexNormals();
    const matPos = new THREE.MeshPhongMaterial({
      color: 0x00e5ff,
      emissive: 0x005577,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
      shininess: 60,
    });
    group.add(new THREE.Mesh(geoPos, matPos));
  }

  // Negative (-ψ) Lobe Mesh (Neon Coral)
  if (posNeg.length > 0) {
    const geoNeg = new THREE.BufferGeometry();
    geoNeg.setAttribute('position', new THREE.Float32BufferAttribute(posNeg, 3));
    geoNeg.computeVertexNormals();
    const matNeg = new THREE.MeshPhongMaterial({
      color: 0xff3d00,
      emissive: 0x661100,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
      shininess: 60,
    });
    group.add(new THREE.Mesh(geoNeg, matNeg));
  }

  return group;
}

export default function HydrogenAtomModule() {
  const [orbitalIdx, setOrbitalIdx] = useState(0);
  const [plotView, setPlotView] = useState<'3d' | 'radial' | 'angular' | 'crosssection'>('3d');
  const [colorScheme, setColorScheme] = useState<'phase' | 'density'>('phase');
  const [nPointsChoice, setNPointsChoice] = useState<number>(12000);
  const [pointSize, setPointSize] = useState<number>(0.35);
  const [showLobeMesh, setShowLobeMesh] = useState<boolean>(true);
  const [liveRandomize, setLiveRandomize] = useState<boolean>(true);
  const [result, setResult] = useState<OrbitalResult | null>(null);
  const [computing, setComputing] = useState(false);

  const threeContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ down: false, lastX: 0, lastY: 0 });
  const rotRef = useRef({ theta: 0.4, phi: 0.4 });
  const pointsRef = useRef<THREE.Points | null>(null);
  const lobeMeshRef = useRef<THREE.Group | null>(null);

  const orbital = ORBITALS[orbitalIdx];

  // Compute orbital data
  useEffect(() => {
    setComputing(true);
    const id = setTimeout(() => {
      const params: OrbitalParams = {
        n: orbital.n,
        l: orbital.l,
        m: orbital.m,
        Nr: 400,
        Ntheta: 180,
        nPoints: nPointsChoice,
      };
      const res = solveHydrogenOrbital(params);
      setResult(res);
      setComputing(false);
    }, 10);
    return () => clearTimeout(id);
  }, [orbitalIdx, nPointsChoice]);

  // Three.js Scene Setup
  useEffect(() => {
    const container = threeContainerRef.current;
    if (!container || plotView !== '3d') return;

    const W = container.clientWidth || 400;
    const H = container.clientHeight || 300;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x070a12, 1);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Ambient & Directional Lighting for 3D Lobe Meshes
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(20, 30, 40);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0x3b82f6, 0.5);
    dirLight2.position.set(-20, -20, -30);
    scene.add(dirLight2);

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
    const baseDist = Math.max(25, orbital.n * orbital.n * 5.5);
    camera.position.set(0, 0, baseDist);
    cameraRef.current = camera;

    // Coordinate Axes (X=Red, Y=Green, Z=Blue)
    const axesLen = Math.max(16, orbital.n * orbital.n * 3.8);
    const createAxis = (end: THREE.Vector3, color: number) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), end]);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75, linewidth: 1.5 });
      return new THREE.Line(geo, mat);
    };
    scene.add(createAxis(new THREE.Vector3(axesLen, 0, 0), 0xef4444)); // X = Red
    scene.add(createAxis(new THREE.Vector3(0, axesLen, 0), 0x22c55e)); // Y = Green
    scene.add(createAxis(new THREE.Vector3(0, 0, axesLen), 0x3b82f6)); // Z = Blue

    // Interactive mouse rotation and zoom
    const onMouseDown = (e: MouseEvent) => {
      mouseRef.current.down = true;
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseRef.current.down) return;
      rotRef.current.phi   += (e.clientX - mouseRef.current.lastX) * 0.008;
      rotRef.current.theta += (e.clientY - mouseRef.current.lastY) * 0.008;
      rotRef.current.theta = Math.max(-1.5, Math.min(1.5, rotRef.current.theta));
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
    };
    const onMouseUp = () => { mouseRef.current.down = false; };
    const onWheel = (e: WheelEvent) => {
      if (!cameraRef.current) return;
      cameraRef.current.position.z += e.deltaY * 0.08;
      cameraRef.current.position.z = Math.max(5, Math.min(400, cameraRef.current.position.z));
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel);

    let frameCount = 0;

    // Animation Loop with Live Moving Randomization
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      if (!cameraRef.current || !rendererRef.current || !sceneRef.current) return;

      const r = cameraRef.current.position.z;
      const theta = rotRef.current.theta;
      const phi = rotRef.current.phi;

      cameraRef.current.position.x = r * Math.sin(theta) * Math.cos(phi);
      cameraRef.current.position.y = r * Math.sin(theta) * Math.sin(phi);
      cameraRef.current.position.z = r * Math.cos(theta);
      cameraRef.current.lookAt(0, 0, 0);

      // Live Shimmering Quantum Cloud Motion (Moving Randomization)
      if (liveRandomize && pointsRef.current && result) {
        frameCount++;
        if (frameCount % 2 === 0) {
          const geo = pointsRef.current.geometry;
          const posAttr = geo.attributes.position as THREE.BufferAttribute;
          const posArr = posAttr.array as Float32Array;
          const nP = result.pointCloud.length / 4;
          const numShimmer = Math.floor(nP * 0.04); // Resample 4% of points every 2 frames

          for (let k = 0; k < numShimmer; k++) {
            const idx1 = Math.floor(Math.random() * nP);
            const idx2 = Math.floor(Math.random() * nP);

            // Jitter / swap positions to simulate quantum probability flux
            const x1 = posArr[idx1 * 3], y1 = posArr[idx1 * 3 + 1], z1 = posArr[idx1 * 3 + 2];
            const x2 = posArr[idx2 * 3], y2 = posArr[idx2 * 3 + 1], z2 = posArr[idx2 * 3 + 2];

            posArr[idx1 * 3]     = x2 + (Math.random() - 0.5) * 0.15;
            posArr[idx1 * 3 + 1] = y2 + (Math.random() - 0.5) * 0.15;
            posArr[idx1 * 3 + 2] = z2 + (Math.random() - 0.5) * 0.15;

            posArr[idx2 * 3]     = x1 + (Math.random() - 0.5) * 0.15;
            posArr[idx2 * 3 + 1] = y1 + (Math.random() - 0.5) * 0.15;
            posArr[idx2 * 3 + 2] = z1 + (Math.random() - 0.5) * 0.15;
          }
          posAttr.needsUpdate = true;
        }
      }

      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);

      if (pointsRef.current) {
        if (pointsRef.current.geometry) pointsRef.current.geometry.dispose();
        if (pointsRef.current.material) (pointsRef.current.material as THREE.Material).dispose();
        pointsRef.current = null;
      }
      if (lobeMeshRef.current && sceneRef.current) {
        sceneRef.current.remove(lobeMeshRef.current);
        lobeMeshRef.current = null;
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [plotView, orbital.n, liveRandomize, result]);

  // Update 3D Point Cloud Buffer & 3D Lobe Mesh
  useEffect(() => {
    if (!result || plotView !== '3d' || !sceneRef.current) return;

    // Clean up previous point cloud
    if (pointsRef.current) {
      sceneRef.current.remove(pointsRef.current);
      if (pointsRef.current.geometry) pointsRef.current.geometry.dispose();
      if (pointsRef.current.material) (pointsRef.current.material as THREE.Material).dispose();
      pointsRef.current = null;
    }

    // Clean up previous 3D Lobe Mesh
    if (lobeMeshRef.current) {
      sceneRef.current.remove(lobeMeshRef.current);
      lobeMeshRef.current = null;
    }

    // Build 3D Lobe Surface Mesh
    if (showLobeMesh) {
      const lobeMeshGroup = createOrbitalLobeMesh(orbital.n, orbital.l, orbital.m, result.meanRadius);
      sceneRef.current.add(lobeMeshGroup);
      lobeMeshRef.current = lobeMeshGroup;
    }

    const nP = result.pointCloud.length / 4;
    if (nP === 0) return;

    const positions = new Float32Array(nP * 3);
    const colors = new Float32Array(nP * 3);

    let maxAbsPsi = 0;
    for (let i = 0; i < nP; i++) {
      const absV = Math.abs(result.pointCloud[i * 4 + 3]);
      if (absV > maxAbsPsi) maxAbsPsi = absV;
    }
    if (maxAbsPsi === 0) maxAbsPsi = 1;

    for (let i = 0; i < nP; i++) {
      positions[i * 3 + 0] = result.pointCloud[i * 4 + 0];
      positions[i * 3 + 1] = result.pointCloud[i * 4 + 1];
      positions[i * 3 + 2] = result.pointCloud[i * 4 + 2];

      const psiVal = result.pointCloud[i * 4 + 3];
      const intensity = Math.min(1, Math.abs(psiVal) / maxAbsPsi);

      if (colorScheme === 'phase') {
        // Quantum Phase Color Map:
        // ψ > 0 (Positive Phase) = Electric Cyan (#00e5ff)
        // ψ < 0 (Negative Phase) = Neon Coral (#ff3d00)
        if (psiVal >= 0) {
          colors[i * 3 + 0] = 0.0 * intensity + 0.0;
          colors[i * 3 + 1] = 0.9 * intensity + 0.1;
          colors[i * 3 + 2] = 1.0 * intensity + 0.2;
        } else {
          colors[i * 3 + 0] = 1.0 * intensity + 0.2;
          colors[i * 3 + 1] = 0.24 * intensity + 0.05;
          colors[i * 3 + 2] = 0.0 * intensity + 0.0;
        }
      } else {
        // Density Gradient (Deep Blue -> Yellow)
        colors[i * 3 + 0] = Math.min(1, intensity * 1.4);
        colors[i * 3 + 1] = Math.min(1, intensity * 0.9 + 0.1);
        colors[i * 3 + 2] = Math.max(0, 1 - intensity * 1.2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleTexture = getParticleTexture();

    const mat = new THREE.PointsMaterial({
      size: pointSize,
      map: particleTexture,
      vertexColors: true,
      transparent: true,
      opacity: showLobeMesh ? 0.55 : 0.70,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      alphaTest: 0.002,
    });

    const points = new THREE.Points(geo, mat);
    sceneRef.current.add(points);
    pointsRef.current = points;
  }, [result, plotView, pointSize, colorScheme, showLobeMesh, orbital.n, orbital.l, orbital.m]);

  return (
    <div className="module-container">
      <div className="canvas-area">
        {/* Navigation Tabs */}
        <div className="module-tabs" style={{ background: 'var(--bg-surface)', padding: '6px 10px 0', border: '1px solid var(--border-subtle)', borderBottom: 'none', borderRadius: 'var(--panel-radius) var(--panel-radius) 0 0', flexShrink: 0 }}>
          {(['3d', 'radial', 'angular', 'crosssection'] as const).map(t => (
            <div key={t} className={`module-tab ${plotView === t ? 'active' : ''}`} onClick={() => setPlotView(t)}>
              {t === '3d' ? '3D Spherical Cloud & Lobe Mesh' : t === 'radial' ? 'Radial Density P(r)' : t === 'angular' ? 'Angular Density |Y|²' : '2D XZ Cross-Section'}
            </div>
          ))}
          {computing && <div className="spinner" style={{ marginLeft: 'auto', marginTop: 4 }} />}
        </div>

        {/* Main Display Area */}
        <div className="canvas-panel" style={{ flex: 2, minHeight: 400, borderRadius: '0 var(--panel-radius) var(--panel-radius) var(--panel-radius)' }}>
          <div className="canvas-panel-header">
            <span className="canvas-panel-title">
              ψ_{orbital.label} (n={orbital.n}, l={orbital.l}, m={orbital.m}) — {orbital.desc}
            </span>
            {result && (
              <span className="canvas-panel-badge badge-teal" style={{ marginLeft: 'auto' }}>
                Eₙ = {result.energy.toFixed(6)} Eₕ
              </span>
            )}
          </div>

          <div style={{ flex: 1, position: 'relative' }}>
            {plotView === '3d' && (
              <div
                ref={threeContainerRef}
                className="three-container"
                style={{ width: '100%', height: '100%', cursor: 'grab' }}
              >
                {!result && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>Calculating 3D orbital geometry...</div>}

                {/* On-screen Phase & Axis Legend */}
                <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(11, 15, 23, 0.88)', backdropFilter: 'blur(6px)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '8px 14px', display: 'flex', gap: 16, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#00e5ff', boxShadow: '0 0 8px #00e5ff' }} />
                    <span style={{ color: '#00e5ff' }}>Positive Phase (+ψ)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff3d00', boxShadow: '0 0 8px #ff3d00' }} />
                    <span style={{ color: '#ff3d00' }}>Negative Phase (-ψ)</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                    Axes: <span style={{ color: '#ef4444' }}>X</span> <span style={{ color: '#22c55e' }}>Y</span> <span style={{ color: '#3b82f6' }}>Z</span>
                  </div>
                </div>
              </div>
            )}

            {plotView === 'radial' && result && (
              <CanvasPlot config={{
                lines: [
                  { data: result.radialProbDensity, color: 'var(--accent-teal)', label: 'P(r) = r²|R|²', lineWidth: 2 },
                  { data: Array.from(result.radialWF).map(v => Math.abs(v)), color: 'var(--accent-primary)', label: '|R_nl(r)|', lineWidth: 1.2, dashed: true },
                ],
                xData: result.rGrid,
                xLabel: 'r [a.u. = a₀]',
                yLabel: 'P(r) [a₀⁻¹]',
                vLines: [
                  { x: result.mostProbableRadius, color: 'var(--accent-amber)', label: 'r_mp' },
                  { x: result.meanRadius, color: 'var(--accent-green)', label: '⟨r⟩' },
                ],
              }} />
            )}

            {plotView === 'angular' && result && (
              <CanvasPlot config={{
                lines: [
                  { data: result.angularDensity, color: 'var(--accent-purple)', label: '|Y_l^m(θ)|²', lineWidth: 2 },
                ],
                xData: Array.from(result.thetaGrid).map(t => (t * 180) / Math.PI),
                xLabel: 'θ [degrees]',
                yLabel: '|Y_l^m|²',
              }} />
            )}

            {plotView === 'crosssection' && result && (
              <Heatmap2D
                data={result.crossSection}
                nx={result.crossSectionSize}
                ny={result.crossSectionSize}
                xLabel="x [a.u.]"
                yLabel="z [a.u.] (vertical axis)"
                colormap="magma"
                xRange={[-result.crossSectionRange, result.crossSectionRange]}
              />
            )}
          </div>
        </div>

        {/* Calculated Orbital Properties */}
        {result && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--panel-radius)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 14, padding: '8px 14px', flexWrap: 'wrap' }}>
              {[
                { label: 'n', val: result.n.toString() },
                { label: 'l', val: result.l.toString() },
                { label: 'm', val: result.m.toString() },
                { label: 'Eₙ = -1/(2n²)', val: result.energy.toFixed(6) + ' Eₕ' },
                { label: 'r_mp', val: result.mostProbableRadius.toFixed(3) + ' a₀' },
                { label: '⟨r⟩', val: result.meanRadius.toFixed(3) + ' a₀' },
                { label: 'Radial nodes', val: `${result.nodes.radialNodes} (n-l-1)` },
                { label: 'Angular nodes', val: `${result.nodes.angularNodes} (l)` },
              ].map(({ label, val }) => (
                <div key={label} className="obs-item">
                  <div className="obs-label">{label}</div>
                  <div className="obs-value" style={{ fontSize: 12 }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Math reference */}
        <div className="math-panel" style={{ borderRadius: 'var(--panel-radius)', border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div className="math-panel-content">
            <div className="math-block">
              <div className="math-block-label">Exact Solution</div>
              <div className="math-eq">ψ_nlm(r,θ,φ) = R_nl(r) · Y_l^m(θ,φ)</div>
              <div className="math-eq">Eₙ = -1/(2n²) Eₕ = {result?.energy.toFixed(6)} Eₕ</div>
            </div>
            <div className="math-block">
              <div className="math-block-label">Radial Function</div>
              <div className="math-eq">R_nl(r) = Nₙₗ e^(-r/n) (2r/n)^l L^(2l+1)_(n-l-1)(2r/n)</div>
            </div>
            <div className="math-block">
              <div className="math-block-label">Mean Radius</div>
              <div className="math-eq">⟨r⟩ = (3n² - l(l+1))/2 = {result?.meanRadius.toFixed(3)} a₀</div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Sidebar */}
      <div className="control-panel">
        <div className="control-section">
          <div className="control-section-title">Orbital Select</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {ORBITALS.map((o, i) => (
              <button
                key={i}
                className={`btn ${orbitalIdx === i ? 'btn-primary' : 'btn-ghost'}`}
                style={{ justifyContent: 'flex-start', gap: 10, fontSize: 12 }}
                onClick={() => setOrbitalIdx(i)}
              >
                <span style={{ fontFamily: 'var(--font-mono)', minWidth: 36 }}>{o.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>n={o.n} l={o.l} m={o.m}</span>
              </button>
            ))}
          </div>
        </div>

        {plotView === '3d' && (
          <div className="control-section">
            <div className="control-section-title">3D Visualization & Dynamics</div>

            <div className="control-row">
              <label className="control-label">3D Lobe Surface Mesh</label>
              <button
                className={`btn ${showLobeMesh ? 'btn-primary' : 'btn-ghost'}`}
                style={{ width: '100%', fontSize: 11, marginTop: 2 }}
                onClick={() => setShowLobeMesh(v => !v)}
              >
                {showLobeMesh ? '✓ 3D Lobe Shape Mesh ON' : '3D Lobe Shape Mesh OFF'}
              </button>
            </div>

            <div className="control-row" style={{ marginTop: 8 }}>
              <label className="control-label">Live Quantum Motion</label>
              <button
                className={`btn ${liveRandomize ? 'btn-primary' : 'btn-ghost'}`}
                style={{ width: '100%', fontSize: 11, marginTop: 2 }}
                onClick={() => setLiveRandomize(v => !v)}
              >
                {liveRandomize ? '⚡ Moving Randomization ON' : 'Moving Randomization PAUSED'}
              </button>
            </div>

            <div className="control-row" style={{ marginTop: 8 }}>
              <label className="control-label">Color Scheme</label>
              <select className="control-select" value={colorScheme} onChange={e => setColorScheme(e.target.value as 'phase' | 'density')}>
                <option value="phase">Quantum Phase (+ Cyan / - Orange)</option>
                <option value="density">Probability Density Gradient</option>
              </select>
            </div>

            <div className="btn-row" style={{ margin: '8px 0' }}>
              {[
                { label: '5k (Fast)', count: 5000 },
                { label: '12k (Balanced)', count: 12000 },
                { label: '25k (Dense)', count: 25000 },
              ].map(opt => (
                <button
                  key={opt.count}
                  className={`btn ${nPointsChoice === opt.count ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: 10, padding: '4px 6px' }}
                  onClick={() => setNPointsChoice(opt.count)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="control-row">
              <label className="control-label">Particle Radius</label>
              <input
                className="control-input"
                type="range"
                min="0.1"
                max="0.8"
                step="0.02"
                value={pointSize}
                onChange={e => setPointSize(parseFloat(e.target.value))}
              />
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', marginLeft: 4 }}>{pointSize.toFixed(2)}</span>
            </div>

            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 6 }}>
              • 3D Lobe Mesh shows exact orbital shape<br />
              • Live motion shimmers quantum probability<br />
              • 🖱 Left-drag: Rotate orbital<br />
              • 🖱 Scroll: Zoom in/out
            </div>
          </div>
        )}

        {result && (
          <div className="control-section">
            <div className="control-section-title">Quantum Numbers & Geometry</div>
            <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', lineHeight: 1.9, color: 'var(--text-secondary)' }}>
              <div>n = {result.n} (principal)</div>
              <div>l = {result.l} (orbital / angular)</div>
              <div>m = {result.m} (magnetic)</div>
              <div>s = ±½ (electron spin)</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 10 }}>
                Radial nodes = {result.n - result.l - 1}<br />
                Angular nodes = {result.l}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
