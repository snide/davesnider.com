<script lang="ts">
  import { T, useThrelte } from '@threlte/core';
  import { OrbitControls } from '@threlte/extras';
  import { STLLoader } from 'three/addons/loaders/STLLoader.js';
  import * as THREE from 'three';

  interface Props {
    url: string;
    autoRotate?: boolean;
    wireframe?: boolean;
    onLoad?: () => void;
    onError?: (message: string) => void;
  }

  let { url, autoRotate = false, wireframe = false, onLoad, onError }: Props = $props();

  let geometry = $state<THREE.BufferGeometry | null>(null);
  let modelColor = $state('#000000');

  const { invalidate } = useThrelte();

  // Get theme-aware model color (softer in light mode)
  function getThemeColor(): string {
    if (typeof window === 'undefined') return '#333333';
    const theme = document.documentElement.getAttribute('data-theme');
    // Light theme uses gray, dark theme uses white
    return theme === 'light' ? '#ffffff' : '#666666';
  }

  // Load the STL file
  $effect(() => {
    const loader = new STLLoader();

    loader.load(
      url,
      (loadedGeometry) => {
        // Rotate from Z-up (CAD/STL convention) to Y-up (Three.js convention)
        loadedGeometry.rotateX(-Math.PI / 2);

        loadedGeometry.computeBoundingBox();
        const box = loadedGeometry.boundingBox!;
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Center horizontally (X, Z) but sit on the grid (Y = 0 at bottom)
        loadedGeometry.translate(-center.x, -box.min.y, -center.z);

        // Recompute bounding box after translation
        loadedGeometry.computeBoundingBox();

        // Compute normals for proper lighting
        loadedGeometry.computeVertexNormals();

        geometry = loadedGeometry;
        modelColor = getThemeColor();
        onLoad?.();
        invalidate();
      },
      undefined,
      (error) => {
        console.error('Error loading STL:', error);
        onError?.(error instanceof Error ? error.message : 'Unknown error');
      }
    );

    return () => {
      if (geometry) {
        geometry.dispose();
      }
    };
  });

  // Update color when theme changes
  $effect(() => {
    if (typeof window === 'undefined') return;

    const observer = new MutationObserver(() => {
      modelColor = getThemeColor();
      invalidate();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });

    // Also listen for media query changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      modelColor = getThemeColor();
      invalidate();
    };
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', handleChange);
    };
  });

  // Calculate camera distance and target based on geometry bounds
  function getModelMetrics(): { distance: number; targetY: number; gridSize: number } {
    if (!geometry || !geometry.boundingBox) return { distance: 5, targetY: 0, gridSize: 10 };
    const box = geometry.boundingBox;
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    return {
      distance: maxDim * 2,
      targetY: size.y / 2,
      gridSize: maxDim * 3
    };
  }

  let modelMetrics = $derived(getModelMetrics());

  // Create fading grid shader material
  const gridMaterial = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color('#888888') },
      uFadeStart: { value: 0.3 },
      uFadeEnd: { value: 0.9 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      varying vec2 vUv;

      void main() {
        // Grid lines
        vec2 grid = abs(fract(vUv * 20.0 - 0.5) - 0.5) / fwidth(vUv * 20.0);
        float line = min(grid.x, grid.y);
        float gridAlpha = 1.0 - min(line, 1.0);

        // Radial fade from center
        vec2 center = vUv - 0.5;
        float dist = length(center) * 2.0;
        float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);

        gl_FragColor = vec4(uColor, gridAlpha * fade * 0.5);
      }
    `
  });
</script>

<!-- Camera -->
<T.PerspectiveCamera makeDefault position={[modelMetrics.distance, modelMetrics.distance * 0.6, modelMetrics.distance]} fov={50}>
  <OrbitControls enableDamping {autoRotate} autoRotateSpeed={2} target.y={modelMetrics.targetY} />
</T.PerspectiveCamera>

<!-- Lighting - neutral white/gray -->
<T.AmbientLight intensity={0.4} color="#ffffff" />
<T.DirectionalLight position={[5, 10, 7]} intensity={0.8} color="#ffffff" />
<T.DirectionalLight position={[-5, -5, -5]} intensity={0.3} color="#aaaaaa" />

<!-- Grid (floor plane with fade) -->
{#if geometry}
  <T.Mesh rotation.x={-Math.PI / 2} material={gridMaterial}>
    <T.PlaneGeometry args={[modelMetrics.gridSize, modelMetrics.gridSize]} />
  </T.Mesh>
{/if}

<!-- Model -->
{#if geometry}
  <T.Mesh {geometry}>
    <T.MeshStandardMaterial color={modelColor} {wireframe} roughness={0.6} metalness={0.1} />
  </T.Mesh>
{/if}
