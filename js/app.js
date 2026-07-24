/**
 * Main Application Controller
 */

import { ShaderGraphParser } from './parser/shadergraph-parser.js';
import { GLSLCodeGenerator } from './parser/glsl-codegen.js';
import { Preview3D } from './viewport/preview-3d.js';
import { Graph2DView } from './viewport/graph-2d.js';
import { CodeEditorUI } from './ui/code-editor.js';
import { PresetLoaderUI } from './ui/preset-loader.js';

class Application {
  constructor() {
    this.parser = new ShaderGraphParser();
    this.generator = new GLSLCodeGenerator();
    this.preview3D = null;
    this.graph2D = null;
    this.codeEditor = null;
    this.presetLoader = null;

    this.currentParsedGraph = null;
    this.currentGlslOutput = null;

    this.init();
  }

  init() {
    // 1. Initialize Viewports & UI
    this.preview3D = new Preview3D('canvas-3d-container');
    this.graph2D = new Graph2DView('graph-2d-container');
    
    // Initialize Monaco Editor with live edit listener
    this.codeEditor = new CodeEditorUI('monaco-editor-container', (editedCode, activeTab) => {
      this.handleLiveCodeEdit(editedCode, activeTab);
    });

    // 2. Initialize Preset Loader
    this.presetLoader = new PresetLoaderUI('preset-select', (presetJson, key) => {
      this.loadShaderGraph(presetJson);
    });

    // 3. Setup UI Event Listeners
    this.setupViewportTabs();
    this.setupSidebarToggles();
    this.setupGeometrySelector();
    this.setupDragAndDrop();
    this.setupModal();

    // 4. Load initial default preset
    this.presetLoader.loadPreset('dissolve');
  }

  loadShaderGraph(jsonInput) {
    try {
      // Parse JSON AST
      this.currentParsedGraph = this.parser.parse(jsonInput);

      // Transpile to GLSL
      this.currentGlslOutput = this.generator.transpile(this.currentParsedGraph);

      // Check for unsupported node fallbacks and show warning toast
      if (this.currentGlslOutput.unsupportedNodes && this.currentGlslOutput.unsupportedNodes.length > 0) {
        const nodeList = this.currentGlslOutput.unsupportedNodes.map(n => `"${n.replace('Node', '')}"`).join(', ');
        this.showToast(`Fallback used for unsupported node types: ${nodeList}`, 'warning', 6500);
      }

      // Update 3D Shader Viewport
      this.preview3D.updateShaderMaterial(
        this.currentGlslOutput.threeVertexShader || this.currentGlslOutput.vertexShader,
        this.currentGlslOutput.threeFragmentShader || this.currentGlslOutput.fragmentShader,
        this.currentParsedGraph.properties
      );

      // Update 2D Graph Viewport
      this.graph2D.updateGraph(this.currentParsedGraph);

      // Update Monaco Code Editor
      this.codeEditor.updateCode(this.currentGlslOutput);

      // Render Graph Inspector & Properties Panel
      this.renderGraphInspector();
    } catch (err) {
      console.error('Error compiling ShaderGraph:', err);
      alert('Error parsing Unity 6 ShaderGraph: ' + err.message);
    }
  }

  showToast(message, type = 'warning', duration = 5000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; margin-top:1px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    if (type === 'error') {
      icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; margin-top:1px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else if (type === 'info') {
      icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; margin-top:1px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `${icon}<div><strong style="display:block; margin-bottom:2px; font-weight:600; font-size:12px;">ShaderGraph Warning</strong><span>${message}</span></div>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-closing');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, duration);
  }

  handleLiveCodeEdit(editedCode, activeTab) {
    if (!this.currentParsedGraph || !this.currentGlslOutput) return;

    let vShader = this.currentGlslOutput.threeVertexShader;
    let fShader = this.currentGlslOutput.threeFragmentShader;

    if (activeTab === 'fragment') {
      fShader = editedCode;
    } else if (activeTab === 'vertex') {
      vShader = editedCode;
    }

    this.preview3D.updateShaderMaterial(vShader, fShader, this.currentParsedGraph.properties);
  }

  setupSidebarToggles() {
    const mainContent = document.getElementById('main-content');
    const toggleLeft = document.getElementById('btn-toggle-left-panel');
    const toggleRight = document.getElementById('btn-toggle-right-panel');
    const expandLeft = document.getElementById('expand-left-btn');
    const expandRight = document.getElementById('expand-right-btn');

    const updateLayouts = () => {
      setTimeout(() => {
        if (this.preview3D) this.preview3D.onWindowResize();
        if (this.codeEditor) this.codeEditor.layout();
      }, 310);
    };

    if (toggleLeft && expandLeft && mainContent) {
      toggleLeft.addEventListener('click', () => {
        mainContent.classList.add('collapsed-left');
        updateLayouts();
      });
      expandLeft.addEventListener('click', () => {
        mainContent.classList.remove('collapsed-left');
        updateLayouts();
      });
    }

    if (toggleRight && expandRight && mainContent) {
      toggleRight.addEventListener('click', () => {
        mainContent.classList.add('collapsed-right');
        updateLayouts();
      });
      expandRight.addEventListener('click', () => {
        mainContent.classList.remove('collapsed-right');
        updateLayouts();
      });
    }

    // Setup resizable right panel
    this.setupResizeHandle(mainContent);
  }

  setupResizeHandle(mainContent) {
    const handle = document.getElementById('panel-resize-handle');
    if (!handle || !mainContent) return;

    const MIN_WIDTH = 280;
    const MAX_WIDTH = 800;
    let isResizing = false;
    let startX = 0;
    let startWidth = 480;

    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--right-panel-width')) || 480;
      handle.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const delta = startX - e.clientX;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
      document.documentElement.style.setProperty('--right-panel-width', newWidth + 'px');

      if (this.preview3D) this.preview3D.onWindowResize();
      if (this.codeEditor) this.codeEditor.layout();
    });

    window.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  setupViewportTabs() {
    const tab3D = document.getElementById('tab-view-3d');
    const tab2D = document.getElementById('tab-view-2d');

    const view3D = document.getElementById('view-3d');
    const view2D = document.getElementById('view-2d');

    if (tab3D && tab2D && view3D && view2D) {
      tab3D.addEventListener('click', () => {
        tab3D.classList.add('active');
        tab2D.classList.remove('active');
        view3D.classList.add('active');
        view2D.classList.remove('active');
        this.graph2D.deactivate();
        this.preview3D.onWindowResize();
      });

      tab2D.addEventListener('click', () => {
        tab2D.classList.add('active');
        tab3D.classList.remove('active');
        view2D.classList.add('active');
        view3D.classList.remove('active');
        this.graph2D.activate();
      });
    }
  }

  setupGeometrySelector() {
    const geomSelect = document.getElementById('mesh-select');
    if (geomSelect) {
      geomSelect.addEventListener('change', (e) => {
        this.preview3D.createMesh(e.target.value);
      });
    }

    const rotateToggle = document.getElementById('toggle-rotate');
    if (rotateToggle) {
      rotateToggle.addEventListener('change', (e) => {
        if (this.preview3D) {
          this.preview3D.isAutoRotating = e.target.checked;
        }
      });
    }
  }

  renderGraphInspector() {
    const propContainer = document.getElementById('properties-container');
    const nodeContainer = document.getElementById('nodes-container');

    if (!this.currentParsedGraph) return;

    // Render Properties controls
    if (propContainer) {
      propContainer.innerHTML = '';
      if (this.currentParsedGraph.properties.length === 0) {
        propContainer.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">No properties in graph</div>`;
      }

      this.currentParsedGraph.properties.forEach(prop => {
        const group = document.createElement('div');
        group.className = 'prop-group';

        const label = document.createElement('div');
        label.className = 'prop-label';
        label.innerHTML = `<span>${prop.name}</span><span class="prop-value">${prop.referenceName}</span>`;
        group.appendChild(label);

        if (prop.type === 'Color') {
          const wrapper = document.createElement('div');
          wrapper.className = 'color-picker-wrapper';
          const input = document.createElement('input');
          input.type = 'color';
          const defC = prop.defaultValue || { r: 1, g: 1, b: 1 };
          const hexColor = '#' + [defC.r, defC.g, defC.b].map(x => {
            const hex = Math.round((x || 0) * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
          }).join('');
          input.value = hexColor;

          input.addEventListener('input', (e) => {
            this.preview3D.updateUniformValue(prop.referenceName, e.target.value);
          });

          wrapper.appendChild(input);
          wrapper.appendChild(document.createTextNode(` ${prop.name}`));
          group.appendChild(wrapper);
        } else if (prop.type === 'Vector1') {
          const input = document.createElement('input');
          input.type = 'range';
          input.className = 'range-input';

          const nameLower = (prop.name + ' ' + prop.referenceName).toLowerCase();
          const defaultVal = (typeof prop.defaultValue === 'number') ? prop.defaultValue : (prop.defaultValue?.x ?? 0.5);

          const isRotation = nameLower.includes('rotation') || nameLower.includes('angle');
          const isDensityOrScale = nameLower.includes('density') || nameLower.includes('scale') || nameLower.includes('tiling') || nameLower.includes('frequency');

          let minVal, maxVal, stepVal;

          if (prop.min !== undefined && prop.max !== undefined) {
            minVal = prop.min;
            maxVal = prop.max;
            stepVal = (maxVal - minVal) > 10 ? 0.1 : 0.01;
          } else if (isRotation) {
            minVal = 0;
            maxVal = defaultVal <= 1.0 ? 1 : 50;
            stepVal = defaultVal <= 1.0 ? 0.01 : 0.1;
          } else if (isDensityOrScale) {
            minVal = 0.1;
            maxVal = Math.max(30, defaultVal * 3);
            stepVal = 0.1;
          } else {
            minVal = 0;
            maxVal = Math.max(1, defaultVal > 1.0 ? defaultVal * 2 : 1);
            stepVal = maxVal > 5 ? 0.1 : 0.01;
          }

          input.min = String(minVal);
          input.max = String(maxVal);
          input.step = String(stepVal);
          input.value = String(defaultVal);

          // Editable numeric input field
          const numInput = document.createElement('input');
          numInput.type = 'number';
          numInput.className = 'prop-val-input';
          numInput.step = 'any';
          numInput.value = String(defaultVal);

          // Sync range slider -> numeric input box
          input.addEventListener('input', (e) => {
            numInput.value = e.target.value;
            this.preview3D.updateUniformValue(prop.referenceName, e.target.value);
          });

          // Sync numeric input box -> range slider & 3D viewport
          numInput.addEventListener('input', (e) => {
            const num = parseFloat(e.target.value);
            if (!isNaN(num)) {
              if (num > parseFloat(input.max)) input.max = String(num * 1.5);
              if (num < parseFloat(input.min)) input.min = String(num);
              input.value = String(num);
              this.preview3D.updateUniformValue(prop.referenceName, num);
            }
          });

          label.appendChild(numInput);
          group.appendChild(input);
        } else if (prop.type === 'Texture2D') {
          const wrapper = document.createElement('div');
          wrapper.className = 'texture-picker-wrapper';
          wrapper.style.display = 'flex';
          wrapper.style.flexDirection = 'column';
          wrapper.style.gap = '6px';
          wrapper.style.marginTop = '4px';

          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = 'image/*';
          fileInput.style.display = 'none';

          const btn = document.createElement('button');
          btn.className = 'btn btn-secondary btn-sm';
          btn.style.width = '100%';
          btn.style.justifyContent = 'center';
          btn.style.fontSize = '11px';
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg> Choose Image (${prop.name})...`;

          btn.addEventListener('click', () => fileInput.click());

          fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (evt) => {
                const dataUrl = evt.target.result;
                this.preview3D.updateTextureUniform(prop.referenceName, dataUrl);
                btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ${file.name}`;
              };
              reader.readAsDataURL(file);
            }
          });

          wrapper.appendChild(btn);
          wrapper.appendChild(fileInput);
          group.appendChild(wrapper);
        } else if (prop.type === 'Vector2' || prop.type === 'Vector3' || prop.type === 'Vector4') {
          const wrapper = document.createElement('div');
          wrapper.className = 'vector-inputs-wrapper';
          wrapper.style.display = 'flex';
          wrapper.style.gap = '6px';
          wrapper.style.marginTop = '4px';

          const components = prop.type === 'Vector2' ? ['x', 'y'] : (prop.type === 'Vector3' ? ['x', 'y', 'z'] : ['x', 'y', 'z', 'w']);
          const currentVal = (typeof prop.defaultValue === 'object' && prop.defaultValue) ? { ...prop.defaultValue } : { x: 0, y: 0, z: 0, w: 0 };

          components.forEach(comp => {
            const compBox = document.createElement('div');
            compBox.style.display = 'flex';
            compBox.style.alignItems = 'center';
            compBox.style.gap = '3px';
            compBox.style.flex = '1';

            const compTag = document.createElement('span');
            compTag.textContent = comp.toUpperCase();
            compTag.style.fontSize = '10px';
            compTag.style.color = 'var(--text-muted)';

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'prop-val-input';
            input.step = 'any';
            input.value = String(currentVal[comp] !== undefined ? currentVal[comp] : 0);
            input.style.width = '100%';

            input.addEventListener('input', (e) => {
              const val = parseFloat(e.target.value);
              currentVal[comp] = isNaN(val) ? 0 : val;
              this.preview3D.updateUniformValue(prop.referenceName, currentVal);
            });

            compBox.appendChild(compTag);
            compBox.appendChild(input);
            wrapper.appendChild(compBox);
          });

          group.appendChild(wrapper);
        } else if (prop.type === 'Cubemap') {
          const wrapper = document.createElement('div');
          wrapper.className = 'texture-picker-wrapper';
          wrapper.style.display = 'flex';
          wrapper.style.flexDirection = 'column';
          wrapper.style.gap = '6px';
          wrapper.style.marginTop = '4px';

          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = 'image/*';
          fileInput.style.display = 'none';

          const btn = document.createElement('button');
          btn.className = 'btn btn-secondary btn-sm';
          btn.style.width = '100%';
          btn.style.justifyContent = 'center';
          btn.style.fontSize = '11px';
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> Choose Cubemap Texture (${prop.name})...`;

          btn.addEventListener('click', () => fileInput.click());

          fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (evt) => {
                const dataUrl = evt.target.result;
                this.preview3D.updateCubemapUniform(prop.referenceName, dataUrl);
                btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ${file.name}`;
              };
              reader.readAsDataURL(file);
            }
          });

          wrapper.appendChild(btn);
          wrapper.appendChild(fileInput);
          group.appendChild(wrapper);
        }

        propContainer.appendChild(group);
      });
    }

    // Render Node list
    if (nodeContainer) {
      nodeContainer.innerHTML = '';
      this.currentParsedGraph.nodes.forEach(node => {
        const item = document.createElement('div');
        item.className = 'node-tree-item';
        item.innerHTML = `
          <span>${node.name}</span>
          <span class="node-type-tag">${node.type}</span>
        `;
        nodeContainer.appendChild(item);
      });
    }
  }

  setupDragAndDrop() {
    const dropzone = document.getElementById('file-dropzone');
    const fileInput = document.getElementById('file-input');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.readShaderFile(file);
      });

      window.addEventListener('dragover', (e) => e.preventDefault());
      window.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.shadergraph') || file.name.endsWith('.json') || file.name.endsWith('.txt'))) {
          this.readShaderFile(file);
        }
      });
    }
  }

  readShaderFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.loadShaderGraph(e.target.result);
      const modal = document.getElementById('import-modal');
      if (modal) modal.classList.remove('open');
    };
    reader.readAsText(file);
  }

  setupModal() {
    const importBtn = document.getElementById('btn-open-import');
    const modal = document.getElementById('import-modal');
    const closeBtn = document.getElementById('btn-close-modal');
    const parseTextBtn = document.getElementById('btn-parse-text');
    const jsonTextarea = document.getElementById('json-textarea');

    if (importBtn && modal && closeBtn) {
      importBtn.addEventListener('click', () => modal.classList.add('open'));
      closeBtn.addEventListener('click', () => modal.classList.remove('open'));
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
    }

    if (parseTextBtn && jsonTextarea) {
      parseTextBtn.addEventListener('click', () => {
        const content = jsonTextarea.value.trim();
        if (content) {
          this.loadShaderGraph(content);
          if (modal) modal.classList.remove('open');
        }
      });
    }
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new Application();
});
