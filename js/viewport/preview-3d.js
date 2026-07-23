/**
 * 3D WebGL Shader Viewport Engine powered by Three.js
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class Preview3D {
  constructor(canvasContainerId) {
    this.container = document.getElementById(canvasContainerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.currentMesh = null;
    this.currentMaterial = null;
    this.materialUniforms = {};
    this.clock = new THREE.Clock();
    this.isAutoRotating = true;
    this.geometryType = 'sphere';

    this.init();
  }

  init() {
    if (!this.container) return;

    const width = this.container.clientWidth || 600;
    const height = this.container.clientHeight || 500;

    // 1. Scene Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090d);

    // 2. Camera Setup
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 4);

    // 3. Renderer Setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    // Clear old contents & append canvas
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // 4. Default Geometry & Material
    this.createMesh(this.geometryType);

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 7);
    this.scene.add(dirLight);

    // 6. Handle Window/Panel Resizing
    window.addEventListener('resize', () => this.onWindowResize());
    const resizeObserver = new ResizeObserver(() => this.onWindowResize());
    resizeObserver.observe(this.container);

    // 7. Mouse Orbit Controls (Basic pointer orbit implementation)
    this.setupOrbitControls();

    // 8. Start Render Loop
    this.animate();
  }

  createMesh(type = 'sphere', customMaterial = null) {
    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      this.currentMesh.geometry.dispose();
    }

    this.geometryType = type;
    let geometry;
    switch (type) {
      case 'cube':
        geometry = new THREE.BoxGeometry(1.8, 1.8, 1.8);
        break;
      case 'torus':
        geometry = new THREE.TorusKnotGeometry(1.0, 0.35, 128, 32);
        break;
      case 'plane':
        geometry = new THREE.PlaneGeometry(2.5, 2.5, 32, 32);
        break;
      case 'sphere':
      default:
        geometry = new THREE.SphereGeometry(1.3, 64, 64);
        break;
    }

    const mat = customMaterial || this.currentMaterial || new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      roughness: 0.3,
      metalness: 0.8
    });

    this.currentMesh = new THREE.Mesh(geometry, mat);
    this.scene.add(this.currentMesh);
  }

  cleanShaderForThreeJS(shaderStr) {
    if (!shaderStr) return '';
    let s = shaderStr;
    // Strip #version directives because Three.js ShaderMaterial prepends its own GLSL header
    s = s.replace(/^\s*#version\s+.*$/gm, '');
    // Strip standalone GLSL 300 precision declarations if redundantly included
    s = s.replace(/^\s*precision\s+(highp|mediump|lowp)\s+float\s*;/gm, '');
    // Convert GLSL 300 fragColor output variable to standard gl_FragColor
    s = s.replace(/^\s*out\s+vec4\s+fragColor\s*;/gm, '');
    s = s.replace(/\bfragColor\b/g, 'gl_FragColor');
    // Convert GLSL 300 in/out varying declarations to standard GLSL 100 varyings
    s = s.replace(/^\s*in\s+(vec[234]|float)\s+(v_\w+)\s*;/gm, 'varying $1 $2;');
    s = s.replace(/^\s*out\s+(vec[234]|float)\s+(v_\w+)\s*;/gm, 'varying $1 $2;');
    return s;
  }

  updateShaderMaterial(vertexShader, fragmentShader, properties = []) {
    // Construct Uniforms from Graph Properties
    const uniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(this.container.clientWidth, this.container.clientHeight) }
    };

    properties.forEach(prop => {
      if (prop.type === 'Color') {
        const c = prop.defaultValue || { r: 1, g: 1, b: 1, a: 1 };
        uniforms[prop.referenceName] = { value: new THREE.Vector4(c.r, c.g, c.b, c.a || 1.0) };
      } else if (prop.type === 'Vector4') {
        const v = prop.defaultValue || { x: 0, y: 0, z: 0, w: 0 };
        uniforms[prop.referenceName] = { value: new THREE.Vector4(v.x, v.y, v.z, v.w) };
      } else if (prop.type === 'Vector1') {
        const val = typeof prop.defaultValue === 'number' ? prop.defaultValue : 0.5;
        uniforms[prop.referenceName] = { value: val };
      }
    });

    this.materialUniforms = uniforms;

    const cleanVS = this.cleanShaderForThreeJS(vertexShader);
    const cleanFS = this.cleanShaderForThreeJS(fragmentShader);

    try {
      const shaderMat = new THREE.ShaderMaterial({
        vertexShader: cleanVS,
        fragmentShader: cleanFS,
        uniforms: this.materialUniforms,
        transparent: true,
        side: THREE.DoubleSide
      });

      this.currentMaterial = shaderMat;
      if (this.currentMesh) {
        this.currentMesh.material = shaderMat;
      }
      return { success: true };
    } catch (err) {
      console.error('Shader compilation error:', err);
      return { success: false, error: err.message };
    }
  }

  updateUniformValue(name, value) {
    if (this.materialUniforms[name]) {
      if (this.materialUniforms[name].value instanceof THREE.Vector4) {
        if (typeof value === 'string' && value.startsWith('#')) {
          const color = new THREE.Color(value);
          this.materialUniforms[name].value.set(color.r, color.g, color.b, 1.0);
        } else if (typeof value === 'object') {
          this.materialUniforms[name].value.set(value.r, value.g, value.b, value.a ?? 1.0);
        }
      } else if (typeof this.materialUniforms[name].value === 'number') {
        this.materialUniforms[name].value = parseFloat(value);
      }
      // Ensure material knows uniforms changed
      if (this.currentMaterial) {
        this.currentMaterial.uniformsNeedUpdate = true;
      }
    }
  }

  setupOrbitControls() {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const dom = this.renderer.domElement;

    dom.addEventListener('mousedown', (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    dom.addEventListener('mousemove', (e) => {
      if (!isDragging || !this.currentMesh) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      this.currentMesh.rotation.y += deltaX * 0.008;
      this.currentMesh.rotation.x += deltaY * 0.008;

      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camera.position.z += e.deltaY * 0.003;
      this.camera.position.z = Math.max(1.5, Math.min(10, this.camera.position.z));
    });
  }

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);

    if (this.materialUniforms.u_resolution) {
      this.materialUniforms.u_resolution.value.set(w, h);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const elapsedTime = this.clock.getElapsedTime();
    if (this.materialUniforms.u_time) {
      this.materialUniforms.u_time.value = elapsedTime;
    }

    if (this.isAutoRotating && this.currentMesh) {
      this.currentMesh.rotation.y += 0.005;
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
