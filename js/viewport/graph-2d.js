/**
 * 2D Node Graph Viewport - Interactive Canvas Renderer
 * Renders Unity 6 ShaderGraph as a visual node graph with connections,
 * color-coded types, panning, and auto-layout.
 */

export class Graph2DView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.canvas = null;
    this.ctx = null;
    this.parsedGraph = null;
    this.isActive = false;

    // Layout data
    this.layoutNodes = new Map(); // id -> { x, y, w, h, node, category, slots }
    this.layoutEdges = [];

    // Pan state
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.scale = 1.0;

    // Node style constants
    this.NODE_WIDTH = 200;
    this.NODE_HEADER_H = 32;
    this.NODE_SLOT_H = 22;
    this.NODE_PADDING = 10;
    this.NODE_SLOT_RADIUS = 5;
    this.LAYER_GAP_X = 280;
    this.NODE_GAP_Y = 30;

    // Color palette by node category
    this.COLORS = {
      property:  { header: '#0d9488', headerText: '#ccfbf1', body: '#0f2e2b', border: '#14b8a6' },
      input:     { header: '#0891b2', headerText: '#cffafe', body: '#0c2a33', border: '#06b6d4' },
      math:      { header: '#2563eb', headerText: '#dbeafe', body: '#0f1a2e', border: '#3b82f6' },
      procedural:{ header: '#d97706', headerText: '#fef3c7', body: '#2a1f0a', border: '#f59e0b' },
      target:    { header: '#dc2626', headerText: '#fee2e2', body: '#2a0f0f', border: '#ef4444' },
      default:   { header: '#475569', headerText: '#f1f5f9', body: '#1a1e26', border: '#64748b' }
    };

    // Slot type colors
    this.SLOT_COLORS = {
      'float':   '#34d399',
      'vec2':    '#38bdf8',
      'vec3':    '#a78bfa',
      'vec4':    '#f472b6',
      'color':   '#f472b6',
      'sampler': '#fbbf24',
      'default': '#94a3b8'
    };

    this.init();
  }

  init() {
    if (!this.container) return;
    this.createCanvas();
    this.setupEvents();
    this.renderPlaceholder();
  }

  createCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.cursor = 'grab';
    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
  }

  resizeCanvas() {
    if (!this.canvas || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.canvasW = rect.width;
    this.canvasH = rect.height;
  }

  setupEvents() {
    if (!this.canvas) return;

    // Pan: mousedown
    this.canvas.addEventListener('mousedown', (e) => {
      this.isPanning = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
    });

    // Pan: mousemove
    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.panX += dx;
      this.panY += dy;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.draw();
    });

    // Pan: mouseup
    window.addEventListener('mouseup', () => {
      this.isPanning = false;
      if (this.canvas) this.canvas.style.cursor = 'grab';
    });

    // Zoom: wheel
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
      const newScale = Math.max(0.3, Math.min(2.5, this.scale * zoomFactor));

      // Zoom towards mouse position
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.panX = mx - (mx - this.panX) * (newScale / this.scale);
      this.panY = my - (my - this.panY) * (newScale / this.scale);
      this.scale = newScale;
      this.draw();
    });

    // Resize observer
    const ro = new ResizeObserver(() => {
      this.resizeCanvas();
      if (this.isActive && this.parsedGraph) this.draw();
    });
    ro.observe(this.container);
  }

  /**
   * Called when a new Unity 6 ShaderGraph is loaded/parsed
   */
  updateGraph(parsedGraph) {
    this.parsedGraph = parsedGraph;
    this.computeLayout();
    if (this.isActive) {
      this.draw();
    }
  }

  activate() {
    this.isActive = true;
    this.resizeCanvas();
    if (this.parsedGraph) {
      if (!isFinite(this.scale) || this.scale <= 0.1 || !isFinite(this.panX)) {
        this.computeLayout();
      }
      this.draw();
    } else {
      this.renderPlaceholder();
    }
  }

  deactivate() {
    this.isActive = false;
  }

  // ────────────────────────── LAYOUT ──────────────────────────

  categorizeNode(type) {
    const t = type.toLowerCase();
    if (t.includes('target') || t.includes('master')) return 'target';
    if (t.includes('property') || t.includes('color') && !t.includes('multiply')) return 'property';
    if (t.includes('time') || t.includes('uv') || t.includes('position') || t.includes('normal') || t.includes('viewdir')) return 'input';
    if (t.includes('noise') || t.includes('fresnel') || t.includes('voronoi') || t.includes('parallax') || t.includes('checkerboard')) return 'procedural';
    if (t.includes('add') || t.includes('subtract') || t.includes('multiply') || t.includes('divide') ||
        t.includes('step') || t.includes('lerp') || t.includes('clamp') || t.includes('sine') ||
        t.includes('rotate') || t.includes('split') || t.includes('combine') ||
        t.includes('power') || t.includes('oneminus') || t.includes('smoothstep') ||
        t.includes('dot') || t.includes('cross') || t.includes('normalize') || t.includes('distance')) return 'math';
    return 'default';
  }

  /** Determine which slots a node has based on edges */
  computeNodeSlots(nodeId, edges) {
    const inputSlots = new Set();
    const outputSlots = new Set();

    edges.forEach(e => {
      if (e.toNode === nodeId) inputSlots.add(e.toSlot);
      if (e.fromNode === nodeId) outputSlots.add(e.fromSlot);
    });

    // Ensure at least one output
    if (outputSlots.size === 0) outputSlots.add('Out');

    return {
      inputs: Array.from(inputSlots),
      outputs: Array.from(outputSlots)
    };
  }

  guessSlotType(slotName) {
    const s = slotName.toLowerCase();
    if (s.includes('color') || s.includes('basecolor') || s.includes('emission')) return 'vec4';
    if (s.includes('uv') || s.includes('tiling')) return 'vec2';
    if (s.includes('normal') || s.includes('position') || s.includes('viewdir')) return 'vec3';
    if (s.includes('alpha') || s.includes('metallic') || s.includes('smoothness') ||
        s.includes('power') || s.includes('edge') || s.includes('time') || s.includes('in') ||
        s.includes('out') || s.includes('a') || s.includes('b')) return 'float';
    return 'default';
  }

  computeLayout() {
    if (!this.parsedGraph) return;
    this.layoutNodes.clear();
    this.layoutEdges = [];

    const { nodes, edges, properties, target } = this.parsedGraph;

    // 1. Create property pseudo-nodes
    const allNodeIds = new Set(nodes.map(n => n.id));
    const propertyNodeIds = new Set();

    edges.forEach(e => {
      if (!allNodeIds.has(e.fromNode) && e.fromNode.startsWith('prop_')) {
        propertyNodeIds.add(e.fromNode);
      }
    });

    // Create property layout entries
    const propMap = new Map();
    properties.forEach(p => {
      propMap.set(`prop_${p.name}`, p);
    });

    // 2. Assign layers via BFS from target (reverse)
    const layerMap = new Map(); // nodeId -> layer number (0 = target, higher = earlier)
    const visited = new Set();

    const assignLayer = (nodeId, layer) => {
      if (visited.has(nodeId)) {
        if (layerMap.has(nodeId) && layerMap.get(nodeId) < layer) {
          layerMap.set(nodeId, layer);
        }
        return;
      }
      visited.add(nodeId);
      layerMap.set(nodeId, layer);

      // Find all nodes feeding into this one
      edges.forEach(e => {
        if (e.toNode === nodeId) {
          assignLayer(e.fromNode, layer + 1);
        }
      });
    };

    if (target) {
      assignLayer(target.id, 0);
    }

    // Assign unvisited nodes
    nodes.forEach(n => {
      if (!visited.has(n.id)) assignLayer(n.id, visited.size);
    });
    propertyNodeIds.forEach(pid => {
      if (!visited.has(pid)) assignLayer(pid, visited.size);
    });

    // 3. Find max layer and invert so target is rightmost
    let maxLayer = 0;
    layerMap.forEach(l => { if (l > maxLayer) maxLayer = l; });

    // Group nodes by layer
    const layers = new Map(); // layerIndex -> [nodeId, ...]
    layerMap.forEach((layer, nodeId) => {
      const invertedLayer = maxLayer - layer;
      if (!layers.has(invertedLayer)) layers.set(invertedLayer, []);
      layers.get(invertedLayer).push(nodeId);
    });

    // 4. Compute node dimensions and positions
    const sortedLayerKeys = Array.from(layers.keys()).sort((a, b) => a - b);
    let totalMaxHeight = 0;

    sortedLayerKeys.forEach(layerIdx => {
      const layerNodeIds = layers.get(layerIdx);
      let yOffset = 0;

      layerNodeIds.forEach(nodeId => {
        const slots = this.computeNodeSlots(nodeId, edges);
        const maxSlots = Math.max(slots.inputs.length, slots.outputs.length, 1);
        const h = this.NODE_HEADER_H + maxSlots * this.NODE_SLOT_H + this.NODE_PADDING;

        // Determine node info
        let name, type, category;
        const realNode = nodes.find(n => n.id === nodeId);
        if (realNode) {
          name = realNode.name;
          type = realNode.type;
          category = this.categorizeNode(type);
        } else if (propertyNodeIds.has(nodeId)) {
          const propName = nodeId.replace('prop_', '');
          const propData = propMap.get(nodeId);
          name = propData ? propData.name : propName;
          type = propData ? propData.type : 'Property';
          category = 'property';
          slots.inputs = [];
          if (slots.outputs.length === 0) slots.outputs = ['Out'];
        } else {
          name = nodeId;
          type = 'Unknown';
          category = 'default';
        }

        const x = layerIdx * this.LAYER_GAP_X;
        const y = yOffset;

        this.layoutNodes.set(nodeId, {
          x, y, w: this.NODE_WIDTH, h,
          name, type, category,
          slots,
          isTarget: target && target.id === nodeId,
          isProperty: propertyNodeIds.has(nodeId)
        });

        yOffset += h + this.NODE_GAP_Y;
      });

      if (yOffset > totalMaxHeight) totalMaxHeight = yOffset;
    });

    // 5. Center vertically per layer
    sortedLayerKeys.forEach(layerIdx => {
      const layerNodeIds = layers.get(layerIdx);
      let layerTotalH = 0;
      layerNodeIds.forEach(nid => {
        const ln = this.layoutNodes.get(nid);
        if (ln) layerTotalH += ln.h + this.NODE_GAP_Y;
      });
      layerTotalH -= this.NODE_GAP_Y;

      const offsetY = (totalMaxHeight - layerTotalH) / 2;
      let runningY = offsetY;
      layerNodeIds.forEach(nid => {
        const ln = this.layoutNodes.get(nid);
        if (ln) {
          ln.y = runningY;
          runningY += ln.h + this.NODE_GAP_Y;
        }
      });
    });

    // 6. Build layout edges with screen-space endpoints
    this.layoutEdges = edges.map(e => {
      const fromNode = this.layoutNodes.get(e.fromNode);
      const toNode = this.layoutNodes.get(e.toNode);
      if (!fromNode || !toNode) return null;

      const fromSlotIdx = fromNode.slots.outputs.indexOf(e.fromSlot);
      const fromSlotY = fromNode.y + this.NODE_HEADER_H + (Math.max(0, fromSlotIdx) + 0.5) * this.NODE_SLOT_H;
      const fromX = fromNode.x + fromNode.w;
      const fromY = fromSlotY;

      const toSlotIdx = toNode.slots.inputs.indexOf(e.toSlot);
      const toSlotY = toNode.y + this.NODE_HEADER_H + (Math.max(0, toSlotIdx) + 0.5) * this.NODE_SLOT_H;
      const toX = toNode.x;
      const toY = toSlotY;

      const slotType = this.guessSlotType(e.fromSlot);

      return { fromX, fromY, toX, toY, slotType, fromSlot: e.fromSlot, toSlot: e.toSlot };
    }).filter(Boolean);

    // 7. Set initial pan to center the graph safely
    const allNodes = Array.from(this.layoutNodes.values());
    if (allNodes.length > 0) {
      const minX = Math.min(...allNodes.map(n => n.x));
      const maxX = Math.max(...allNodes.map(n => n.x + n.w));
      const minY = Math.min(...allNodes.map(n => n.y));
      const maxY = Math.max(...allNodes.map(n => n.y + n.h));
      const graphW = Math.max(10, maxX - minX);
      const graphH = Math.max(10, maxY - minY);

      const targetW = this.canvasW > 0 ? this.canvasW : (this.container?.clientWidth || 800);
      const targetH = this.canvasH > 0 ? this.canvasH : (this.container?.clientHeight || 600);

      const availW = Math.max(100, targetW - 80);
      const availH = Math.max(100, targetH - 80);

      let calcScale = Math.min(1.0, Math.min(availW / graphW, availH / graphH));
      if (!isFinite(calcScale) || calcScale <= 0) calcScale = 0.8;

      this.scale = Math.max(0.2, Math.min(2.0, calcScale));

      const px = (targetW - graphW * this.scale) / 2 - minX * this.scale;
      const py = (targetH - graphH * this.scale) / 2 - minY * this.scale;
      this.panX = isFinite(px) ? px : 40;
      this.panY = isFinite(py) ? py : 40;
    }
  }

  // ────────────────────────── DRAWING ──────────────────────────

  draw() {
    if (!this.ctx || !this.canvas) return;
    this.resizeCanvas();
    const ctx = this.ctx;
    const w = this.canvasW;
    const h = this.canvasH;

    if (w <= 0 || h <= 0) return;

    // Clear
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    this.drawGrid(ctx, w, h);

    // Apply pan & zoom transform
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.scale, this.scale);

    // Draw edges first (behind nodes)
    this.layoutEdges.forEach(edge => this.drawEdge(ctx, edge));

    // Draw nodes
    this.layoutNodes.forEach(node => this.drawNode(ctx, node));

    ctx.restore();

    // Draw HUD overlay
    this.drawHUD(ctx, w, h);
  }

  drawGrid(ctx, w, h) {
    const safeScale = (isFinite(this.scale) && this.scale > 0.05) ? this.scale : 0.8;
    const rawGridSize = 32 * safeScale;
    if (!isFinite(rawGridSize) || rawGridSize <= 4) return;

    const gridSize = Math.max(8, rawGridSize);
    let offsetX = isFinite(this.panX) ? (this.panX % gridSize) : 0;
    if (offsetX < 0) offsetX += gridSize;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;

    for (let x = offsetX; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    let offsetY = isFinite(this.panY) ? (this.panY % gridSize) : 0;
    if (offsetY < 0) offsetY += gridSize;

    for (let y = offsetY; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  drawNode(ctx, node) {
    const { x, y, w, h, name, type, category, slots, isTarget } = node;
    const colors = this.COLORS[category] || this.COLORS.default;

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 4;

    // Node body
    ctx.fillStyle = colors.body;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = isTarget ? 2.5 : 1.5;
    this.roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Header bar
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + 8, y);
    ctx.lineTo(x + w - 8, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + 8);
    ctx.lineTo(x + w, y + this.NODE_HEADER_H);
    ctx.lineTo(x, y + this.NODE_HEADER_H);
    ctx.lineTo(x, y + 8);
    ctx.quadraticCurveTo(x, y, x + 8, y);
    ctx.closePath();
    ctx.fillStyle = colors.header;
    ctx.fill();
    ctx.restore();

    // Header separator
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + this.NODE_HEADER_H);
    ctx.lineTo(x + w, y + this.NODE_HEADER_H);
    ctx.stroke();

    // Node name text
    ctx.fillStyle = colors.headerText;
    ctx.font = 'bold 11px "Google Sans", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const displayName = name.length > 22 ? name.substring(0, 20) + '…' : name;
    ctx.fillText(displayName, x + 10, y + this.NODE_HEADER_H / 2);

    // Target badge
    if (isTarget) {
      const badge = 'TARGET';
      ctx.font = 'bold 8px "Google Sans", system-ui, sans-serif';
      const bw = ctx.measureText(badge).width + 8;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
      this.roundRect(ctx, x + w - bw - 6, y + 8, bw, 16, 4);
      ctx.fill();
      ctx.fillStyle = '#fee2e2';
      ctx.textAlign = 'center';
      ctx.fillText(badge, x + w - bw / 2 - 6, y + 16);
    }

    // Draw slots
    const slotStartY = y + this.NODE_HEADER_H;

    // Input slots (left side)
    slots.inputs.forEach((slotName, i) => {
      const sy = slotStartY + (i + 0.5) * this.NODE_SLOT_H;
      const slotType = this.guessSlotType(slotName);
      const color = this.SLOT_COLORS[slotType] || this.SLOT_COLORS.default;

      // Slot circle
      ctx.beginPath();
      ctx.arc(x, sy, this.NODE_SLOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Slot label
      ctx.fillStyle = '#8b949e';
      ctx.font = '10px "Google Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(slotName, x + 10, sy);
    });

    // Output slots (right side)
    slots.outputs.forEach((slotName, i) => {
      const sy = slotStartY + (i + 0.5) * this.NODE_SLOT_H;
      const slotType = this.guessSlotType(slotName);
      const color = this.SLOT_COLORS[slotType] || this.SLOT_COLORS.default;

      // Slot circle
      ctx.beginPath();
      ctx.arc(x + w, sy, this.NODE_SLOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Slot label
      ctx.fillStyle = '#8b949e';
      ctx.font = '10px "Google Sans", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(slotName, x + w - 10, sy);
    });
  }

  drawEdge(ctx, edge) {
    const { fromX, fromY, toX, toY, slotType } = edge;
    const color = this.SLOT_COLORS[slotType] || this.SLOT_COLORS.default;

    // Bezier curve
    const cpOffset = Math.min(Math.abs(toX - fromX) * 0.5, 120);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.bezierCurveTo(
      fromX + cpOffset, fromY,
      toX - cpOffset, toY,
      toX, toY
    );

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Glow effect
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.bezierCurveTo(
      fromX + cpOffset, fromY,
      toX - cpOffset, toY,
      toX, toY
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.12;
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

  drawHUD(ctx, w, h) {
    // Bottom-left legend
    const legendItems = [
      { color: this.COLORS.property.header, label: 'Properties' },
      { color: this.COLORS.input.header, label: 'Input' },
      { color: this.COLORS.math.header, label: 'Math' },
      { color: this.COLORS.procedural.header, label: 'Procedural' },
      { color: this.COLORS.target.header, label: 'Target / Master' }
    ];

    const lx = 16;
    let ly = h - 16 - legendItems.length * 22;

    // Legend background
    ctx.fillStyle = 'rgba(13, 17, 23, 0.75)';
    this.roundRect(ctx, lx - 6, ly - 8, 140, legendItems.length * 22 + 12, 8);
    ctx.fill();

    ctx.font = '11px "Google Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    legendItems.forEach(item => {
      ctx.fillStyle = item.color;
      this.roundRect(ctx, lx, ly, 12, 12, 3);
      ctx.fill();

      ctx.fillStyle = '#8b949e';
      ctx.fillText(item.label, lx + 18, ly + 6);
      ly += 22;
    });

    // Top-right zoom indicator
    ctx.fillStyle = 'rgba(13, 17, 23, 0.75)';
    this.roundRect(ctx, w - 90, 12, 76, 26, 6);
    ctx.fill();
    ctx.fillStyle = '#8b949e';
    ctx.font = '11px "Google Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(this.scale * 100)}% zoom`, w - 52, 25);
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  renderPlaceholder() {
    if (!this.ctx || !this.canvas) return;
    this.resizeCanvas();
    const ctx = this.ctx;
    const w = this.canvasW;
    const h = this.canvasH;

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // Grid
    this.drawGrid(ctx, w, h);

    // Placeholder card
    const cardW = 360;
    const cardH = 120;
    const cx = (w - cardW) / 2;
    const cy = (h - cardH) / 2;

    ctx.fillStyle = 'rgba(22, 27, 34, 0.9)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, cx, cy, cardW, cardH, 12);
    ctx.fill();
    ctx.stroke();

    // Icon
    ctx.fillStyle = '#38bdf8';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', w / 2, cy + 35);

    // Title
    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 15px "Google Sans", system-ui, sans-serif';
    ctx.fillText('2D Node Graph Canvas', w / 2, cy + 65);

    // Subtitle
    ctx.fillStyle = '#8b949e';
    ctx.font = '12px "Google Sans", system-ui, sans-serif';
    ctx.fillText('Load a ShaderGraph preset to view node topology', w / 2, cy + 90);
  }
}
