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
    this.slotMap = new Map(); // `${nodeId}_${slotId}` -> slotName
    this.propertyGuidMap = new Map(); // propGuid -> property Object
  }

  /**
   * Helper to unpack Unity 6 JSONnodeData wrapper objects
   */
  unpack(item) {
    if (!item) return null;
    let data = item;
    if (typeof item.JSONnodeData === 'string') {
      try {
        data = JSON.parse(item.JSONnodeData);
      } catch (e) {
        data = item;
      }
    }
    if (item.typeInfo && item.typeInfo.fullName) {
      data.fullName = item.typeInfo.fullName;
    }
    return data;
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
    const rawProps = data.m_SerializedProperties || data.m_Properties || data.properties || [];
    this.parseProperties(rawProps);

    // 2. Extract Nodes
    const rawNodes = data.m_SerializableNodes || data.m_Nodes || data.nodes || [];
    this.parseNodes(rawNodes);

    // 3. Extract Edges / Connections
    const rawEdges = data.m_SerializableEdges || data.m_Edges || data.edges || [];
    this.parseEdges(rawEdges);

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
    this.properties = rawProps.map((item, idx) => {
      const prop = this.unpack(item);
      const name = prop.m_Name || prop.name || `Property_${idx}`;
      const refName = prop.m_OverrideReferenceName || prop.m_ReferenceName || prop.referenceName || `_${name.replace(/\s+/g, '')}`;
      
      let rawType = prop.fullName || prop.m_Type || prop.type || 'Vector1ShaderProperty';
      let type = rawType.replace('UnityEditor.ShaderGraph.', '').replace('ShaderProperty', '');
      if (type === 'Vector1') type = 'Vector1';
      else if (type === 'Color') type = 'Color';

      const defVal = prop.m_Value !== undefined ? prop.m_Value : (prop.m_DefaultValue !== undefined ? prop.m_DefaultValue : (type === 'Color' ? { r: 1, g: 1, b: 1, a: 1 } : 0.5));
      const guid = prop.m_Guid ? prop.m_Guid.m_GuidSerialized : (prop.m_GuidSerialized || prop.m_ObjectId || `prop_${idx}`);

      let minVal = undefined;
      let maxVal = undefined;
      // Unity ShaderGraph: m_FloatType === 1 indicates an explicit Slider range property
      if (prop.m_FloatType === 1 && prop.m_RangeValues) {
        minVal = prop.m_RangeValues.x;
        maxVal = prop.m_RangeValues.y;
      }

      const parsedProp = {
        id: guid,
        name,
        referenceName: refName,
        type,
        defaultValue: defVal,
        min: minVal,
        max: maxVal
      };

      this.propertyGuidMap.set(guid, parsedProp);
      return parsedProp;
    });
  }

  parseNodes(rawNodes) {
    rawNodes.forEach((item, idx) => {
      const n = this.unpack(item);
      const id = n.m_GuidSerialized || n.m_ObjectId || n.id || `node_${idx}`;
      const rawType = n.fullName || n.m_Type || n.type || 'UnknownNode';
      const nodeType = rawType.replace('UnityEditor.ShaderGraph.', '').replace('UnityEditor.Rendering.Universal.ShaderGraph.', '').replace('Node', '');
      let name = n.m_Name || n.name || nodeType;

      // Handle PropertyNode specifically
      let boundProperty = null;
      if (nodeType === 'Property' || rawType.includes('PropertyNode')) {
        const propGuid = n.m_PropertyGuidSerialized;
        if (propGuid && this.propertyGuidMap.has(propGuid)) {
          boundProperty = this.propertyGuidMap.get(propGuid);
          name = boundProperty.name;
        }
      }

      // Catalog slot IDs to slot names
      const slots = n.m_SerializableSlots || n.slots || [];
      slots.forEach(slotItem => {
        const slot = this.unpack(slotItem);
        const slotId = slot.m_Id !== undefined ? slot.m_Id : slot.id;
        const slotName = slot.m_ShaderOutputName || slot.m_DisplayName || slot.name || `Slot_${slotId}`;
        if (slotId !== undefined) {
          this.slotMap.set(`${id}_${slotId}`, slotName);
        }
      });

      this.nodes.set(id, {
        id,
        rawType,
        type: nodeType,
        name,
        boundProperty,
        scale: n.m_Scale !== undefined ? n.m_Scale : 10.0,
        raw: n,
        inputs: {},
        outputs: {}
      });
    });
  }

  parseEdges(rawEdges) {
    this.edges = rawEdges.map(item => {
      const edge = this.unpack(item);
      
      let fromNode = edge.fromNode || edge.m_FromNode;
      let fromSlot = edge.fromSlot || edge.m_FromSlot;
      let toNode = edge.toNode || edge.m_ToNode;
      let toSlot = edge.toSlot || edge.m_ToSlot;

      // Check Unity 6 m_OutputSlot / m_InputSlot structure
      if (edge.m_OutputSlot) {
        fromNode = edge.m_OutputSlot.m_NodeGUIDSerialized || edge.m_OutputSlot.m_NodeId;
        const fromSlotId = edge.m_OutputSlot.m_SlotId;
        fromSlot = this.slotMap.get(`${fromNode}_${fromSlotId}`) || fromSlotId || 'Out';
      }

      if (edge.m_InputSlot) {
        toNode = edge.m_InputSlot.m_NodeGUIDSerialized || edge.m_InputSlot.m_NodeId;
        const toSlotId = edge.m_InputSlot.m_SlotId;
        toSlot = this.slotMap.get(`${toNode}_${toSlotId}`) || toSlotId || 'In';
      }

      // If fromNode is a property node, link property reference
      const fromNodeObj = this.nodes.get(fromNode);
      if (fromNodeObj && fromNodeObj.boundProperty) {
        fromNode = `prop_${fromNodeObj.boundProperty.name}`;
      }

      return {
        fromNode,
        fromSlot: String(fromSlot),
        toNode,
        toSlot: String(toSlot)
      };
    }).filter(e => e.fromNode && e.toNode);
  }

  identifyTarget() {
    // Find UniversalTarget, LitTarget, MasterNode or fallback to last node
    for (const [id, node] of this.nodes.entries()) {
      if (node.type.includes('Target') || node.type.includes('Master')) {
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
