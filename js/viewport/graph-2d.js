/**
 * 2D Node Graph Viewport Controller
 * Manages 2D Graph view tab activation, state registration, and canvas placeholder.
 */

export class Graph2DView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.parsedGraph = null;
    this.isActive = false;

    this.init();
  }

  init() {
    if (!this.container) return;
    this.renderPlaceholder();
  }

  /**
   * Called when a new Unity 6 ShaderGraph is loaded/parsed
   */
  updateGraph(parsedGraph) {
    this.parsedGraph = parsedGraph;
    if (this.isActive) {
      this.refresh();
    }
  }

  /**
   * Called when switching to 2D Graph Tab
   */
  activate() {
    this.isActive = true;
    this.refresh();
  }

  deactivate() {
    this.isActive = false;
  }

  refresh() {
    if (!this.container || !this.parsedGraph) return;

    const nodeCount = this.parsedGraph.nodes ? this.parsedGraph.nodes.length : 0;
    const edgeCount = this.parsedGraph.edges ? this.parsedGraph.edges.length : 0;
    const propCount = this.parsedGraph.properties ? this.parsedGraph.properties.length : 0;

    const nodeTypes = Array.from(new Set((this.parsedGraph.nodes || []).map(n => n.type))).slice(0, 4);

    this.container.innerHTML = `
      <div class="graph-grid-bg"></div>
      <div class="graph-placeholder-card">
        <div class="graph-placeholder-icon">
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <h3 class="graph-placeholder-title">2D Node Graph Topology View</h3>
        <p class="graph-placeholder-desc">
          Interactive 2D Node Canvas ready! Graph contains <strong>${nodeCount} Nodes</strong>, 
          <strong>${edgeCount} Connections</strong>, and <strong>${propCount} Properties</strong>.
        </p>
        <div class="graph-nodes-preview">
          ${nodeTypes.map(t => `<span class="node-chip">${t}</span>`).join('')}
        </div>
      </div>
    `;
  }

  renderPlaceholder() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="graph-grid-bg"></div>
      <div class="graph-placeholder-card">
        <div class="graph-placeholder-icon">
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
          </svg>
        </div>
        <h3 class="graph-placeholder-title">2D Node Graph Canvas</h3>
        <p class="graph-placeholder-desc">
          Select a Unity 6 ShaderGraph preset or drop a <code>.shadergraph</code> file to view the graph topology.
        </p>
      </div>
    `;
  }
}
