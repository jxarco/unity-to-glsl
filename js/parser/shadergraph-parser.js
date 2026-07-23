/**
 * Unity 6 ShaderGraph JSON Parser & AST Builder
 * Handles Unity 6 graph serialization schemas, properties, node definitions, and edge topology.
 */

export class ShaderGraphParser {
  constructor() {
    this.reset();
  }

  reset() {
    this.rawGraph = null;
    this.properties = [];
    this.nodes = new Map();
    this.edges = [];
    this.targetNode = null;
    this.executionOrder = [];
  }

  /**
   * Parse Unity 6 JSON object or string
   */
  parse(jsonInput) {
    this.reset();
    
    let data;
    if (typeof jsonInput === 'string') {
      try {
        data = JSON.parse(jsonInput);
      } catch (err) {
        throw new Error('Invalid JSON format: ' + err.message);
      }
    } else {
      data = jsonInput;
    }

    this.rawGraph = data;

    // 1. Extract Properties
    this.parseProperties(data.m_Properties || data.properties || []);

    // 2. Extract Nodes
    this.parseNodes(data.m_Nodes || data.nodes || []);

    // 3. Extract Edges / Connections
    this.parseEdges(data.m_Edges || data.edges || []);

    // 4. Identify Target Node (Universal Master / PBR / Lit / Unlit Target)
    this.identifyTarget();

    // 5. Build Dependency Topology (Topological Sort)
    this.buildExecutionOrder();

    return {
      properties: this.properties,
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
      target: this.targetNode,
      executionOrder: this.executionOrder
    };
  }

  parseProperties(rawProps) {
    this.properties = rawProps.map((prop, idx) => {
      const name = prop.m_Name || prop.name || `Property_${idx}`;
      const refName = prop.m_ReferenceName || prop.referenceName || `_${name.replace(/\s+/g, '')}`;
      const type = (prop.m_Type || prop.type || 'Vector1').replace('UnityEditor.ShaderGraph.', '');
      const defVal = prop.m_DefaultValue !== undefined ? prop.m_DefaultValue : (type === 'Color' ? { r: 1, g: 1, b: 1, a: 1 } : 0.5);

      return {
        id: prop.m_ObjectId || `prop_${name}`,
        name,
        referenceName: refName,
        type,
        defaultValue: defVal
      };
    });
  }

  parseNodes(rawNodes) {
    rawNodes.forEach((n, idx) => {
      const id = n.m_ObjectId || n.id || `node_${idx}`;
      const rawType = n.m_Type || n.type || 'UnknownNode';
      const nodeType = rawType.replace('UnityEditor.ShaderGraph.', '').replace('UnityEditor.Rendering.Universal.ShaderGraph.', '');
      const name = n.m_Name || n.name || nodeType;

      this.nodes.set(id, {
        id,
        rawType,
        type: nodeType,
        name,
        scale: n.m_Scale !== undefined ? n.m_Scale : 10.0,
        raw: n,
        inputs: {},
        outputs: {}
      });
    });
  }

  parseEdges(rawEdges) {
    this.edges = rawEdges.map(edge => {
      return {
        fromNode: edge.fromNode || edge.m_FromNode,
        fromSlot: edge.fromSlot || edge.m_FromSlot || 'Out',
        toNode: edge.toNode || edge.m_ToNode,
        toSlot: edge.toSlot || edge.m_ToSlot || 'In'
      };
    });
  }

  identifyTarget() {
    // Find UniversalTarget, LitTarget, MasterNode or fallback to last node
    for (const [id, node] of this.nodes.entries()) {
      if (node.type.includes('Target') || node.type.includes('MasterNode')) {
        this.targetNode = node;
        return;
      }
    }
    // Fallback: pick last node
    const allNodes = Array.from(this.nodes.values());
    this.targetNode = allNodes[allNodes.length - 1] || null;
  }

  buildExecutionOrder() {
    const visited = new Set();
    const order = [];

    // Helper map of node ID to incoming edges
    const getInputs = (nodeId) => {
      return this.edges.filter(e => e.toNode === nodeId);
    };

    const visit = (nodeId) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const incoming = getInputs(nodeId);
      for (const edge of incoming) {
        if (this.nodes.has(edge.fromNode)) {
          visit(edge.fromNode);
        }
      }
      if (this.nodes.has(nodeId)) {
        order.push(this.nodes.get(nodeId));
      }
    };

    if (this.targetNode) {
      visit(this.targetNode.id);
    }

    // Include any remaining unconnected nodes
    for (const [id, node] of this.nodes.entries()) {
      if (!visited.has(id)) {
        visit(id);
      }
    }

    this.executionOrder = order;
  }
}
