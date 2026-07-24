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
    this.objectMap = new Map();
  }

  /**
   * Helper to parse concatenated JSON objects (Unity 2021+ ShaderGraph format)
   */
  parseConcatenatedJson(str) {
    const objects = [];
    let depth = 0;
    let inString = false;
    let escape = false;
    let startIdx = -1;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\' && inString) {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') {
          if (depth === 0) startIdx = i;
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0 && startIdx !== -1) {
            const jsonChunk = str.slice(startIdx, i + 1);
            try {
              objects.push(JSON.parse(jsonChunk));
            } catch (e) {
              console.warn('Failed to parse multi-JSON chunk:', e);
            }
            startIdx = -1;
          }
        }
      }
    }
    return objects;
  }

  /**
   * Helper to unpack Unity 6 JSONnodeData wrapper objects
   */
  unpack(item) {
    if (!item) return null;
    let data = item;

    // Handle m_Id pointer resolution if item is a reference object { "m_Id": "..." }
    if (typeof item === 'object' && item.m_Id && !item.m_Type && !item.m_Name && this.objectMap.has(item.m_Id)) {
      data = this.objectMap.get(item.m_Id);
    }

    if (typeof data.JSONnodeData === 'string') {
      try {
        data = JSON.parse(data.JSONnodeData);
      } catch (e) {
        // Keep data as is
      }
    } else if (data.JSONnodeData && typeof data.JSONnodeData === 'object') {
      data = { ...data.JSONnodeData };
    }
    if (item.typeInfo && item.typeInfo.fullName) {
      data.fullName = item.typeInfo.fullName;
    }
    return data;
  }

  /**
   * Parse Unity JSON object, multi-JSON string, or parsed array
   */
  parse(jsonInput) {
    this.reset();
    
    let objectsList = [];
    if (typeof jsonInput === 'string') {
      try {
        const parsed = JSON.parse(jsonInput);
        objectsList = Array.isArray(parsed) ? parsed : [parsed];
      } catch (err) {
        objectsList = this.parseConcatenatedJson(jsonInput);
        if (objectsList.length === 0) {
          throw new Error('Invalid JSON format: ' + err.message);
        }
      }
    } else if (Array.isArray(jsonInput)) {
      objectsList = jsonInput;
    } else {
      objectsList = [jsonInput];
    }

    // Index all objects by m_ObjectId or m_Guid
    objectsList.forEach(obj => {
      if (!obj) return;
      const id = obj.m_ObjectId || (obj.m_Guid && obj.m_Guid.m_GuidSerialized) || obj.m_GuidSerialized;
      if (id) {
        this.objectMap.set(id, obj);
      }
    });

    let data = objectsList.find(o => o && o.m_Type === 'UnityEditor.ShaderGraph.GraphData') || objectsList[0];
    this.rawGraph = data;

    // 1. Extract Properties
    let rawProps = data.m_SerializedProperties || data.m_Properties || data.properties || [];
    if (rawProps.length === 0) {
      rawProps = objectsList.filter(o => o && o.m_Type && o.m_Type.endsWith('ShaderProperty'));
    }
    this.parseProperties(rawProps);

    // 2. Extract Nodes (including vertex & fragment block context nodes)
    let rawNodes = data.m_SerializableNodes || data.m_Nodes || data.nodes || [];
    if (data.m_VertexContext && Array.isArray(data.m_VertexContext.m_Blocks)) {
      rawNodes = [...rawNodes, ...data.m_VertexContext.m_Blocks];
    }
    if (data.m_FragmentContext && Array.isArray(data.m_FragmentContext.m_Blocks)) {
      rawNodes = [...rawNodes, ...data.m_FragmentContext.m_Blocks];
    }
    if (rawNodes.length === 0) {
      rawNodes = objectsList.filter(o => o && o.m_Type && o.m_Type.endsWith('Node'));
    }
    this.parseNodes(rawNodes);

    // 3. Extract Edges / Connections
    const rawEdges = data.m_SerializableEdges || data.m_Edges || data.edges || [];
    this.parseEdges(rawEdges);

    // 4. Identify Target Node (Universal Master / PBR / Lit / Unlit Target / Fragment Color Block)
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
      if (!prop) return null;
      const name = prop.m_Name || prop.name || `Property_${idx}`;
      const refName = (prop.m_OverrideReferenceName && prop.m_OverrideReferenceName.trim())
        || prop.m_DefaultReferenceName
        || prop.m_ReferenceName
        || prop.referenceName
        || `_${name.replace(/\s+/g, '')}`;
      
      let rawType = prop.fullName || prop.m_Type || prop.type || 'Vector1ShaderProperty';
      let type = rawType
        .replace('UnityEditor.ShaderGraph.Internal.', '')
        .replace('UnityEditor.ShaderGraph.', '')
        .replace('ShaderProperty', '');
      if (type === 'Vector1' || type === 'Float') type = 'Vector1';
      else if (type === 'Color') type = 'Color';
      else if (type === 'Vector2') type = 'Vector2';
      else if (type === 'Vector3') type = 'Vector3';
      else if (type === 'Vector4') type = 'Vector4';
      else if (type === 'Texture2D') type = 'Texture2D';
      else if (type === 'Cubemap' || type.includes('Cubemap')) type = 'Cubemap';

      let defVal = prop.m_Value !== undefined ? prop.m_Value : (prop.m_DefaultValue !== undefined ? prop.m_DefaultValue : (type === 'Color' ? { r: 1, g: 1, b: 1, a: 1 } : 0.5));
      
      // If Unity asset defaults are black (0,0,0) or 0.0 value, provide vibrant non-black fallback defaults
      if (type === 'Color' && typeof defVal === 'object' && defVal.r === 0 && defVal.g === 0 && defVal.b === 0) {
        defVal = { r: 0.1, g: 0.7, b: 1.0, a: 1.0 };
      } else if (type === 'Vector1' && (defVal === 0 || defVal === 0.0)) {
        defVal = 0.8;
      }

      const guid = prop.m_ObjectId || (prop.m_Guid ? prop.m_Guid.m_GuidSerialized : (prop.m_GuidSerialized || `prop_${idx}`));

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
    }).filter(Boolean);
  }

  parseNodes(rawNodes) {
    rawNodes.forEach((item, idx) => {
      const n = this.unpack(item);
      if (!n) return;

      const id = n.m_ObjectId || n.m_GuidSerialized || n.id || `node_${idx}`;
      const rawType = n.fullName || n.m_Type || n.type || 'UnknownNode';
      let nodeType = rawType.replace('UnityEditor.ShaderGraph.', '').replace('UnityEditor.Rendering.Universal.ShaderGraph.', '').replace('Node', '');
      let name = n.m_Name || n.name || n.m_SerializedDescriptor || nodeType;

      // Handle PropertyNode specifically
      let boundProperty = null;
      if (nodeType === 'Property' || rawType.includes('PropertyNode')) {
        const propGuid = n.m_PropertyGuidSerialized || (n.m_Property && n.m_Property.m_Id);
        if (propGuid) {
          if (this.propertyGuidMap.has(propGuid)) {
            boundProperty = this.propertyGuidMap.get(propGuid);
            name = boundProperty.name;
          } else if (this.objectMap.has(propGuid)) {
            const propObj = this.objectMap.get(propGuid);
            const resolvedGuid = propObj.m_ObjectId || (propObj.m_Guid && propObj.m_Guid.m_GuidSerialized) || propObj.m_GuidSerialized;
            if (this.propertyGuidMap.has(resolvedGuid)) {
              boundProperty = this.propertyGuidMap.get(resolvedGuid);
              name = boundProperty.name;
            }
          }
        }
      }

      // Catalog slot IDs to slot names
      const slots = n.m_SerializableSlots || n.m_Slots || n.slots || [];
      slots.forEach(slotItem => {
        const slot = this.unpack(slotItem);
        if (!slot) return;
        const slotId = slot.m_Id !== undefined ? slot.m_Id : slot.id;
        const slotName = slot.m_ShaderOutputName || slot.m_DisplayName || slot.name || `Slot_${slotId}`;
        if (slotId !== undefined) {
          this.slotMap.set(`${id}_${slotId}`, slotName);
        }
        if (slotItem.m_Id) {
          this.slotMap.set(`${id}_${slotItem.m_Id}`, slotName);
        }
        if (slot.m_ObjectId) {
          this.slotMap.set(`${id}_${slot.m_ObjectId}`, slotName);
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
      if (!edge) return null;

      let fromNode = edge.fromNode || edge.m_FromNode;
      let fromSlot = edge.fromSlot || edge.m_FromSlot;
      let toNode = edge.toNode || edge.m_ToNode;
      let toSlot = edge.toSlot || edge.m_ToSlot;

      // Check Unity 6 & modern m_OutputSlot / m_InputSlot structure
      if (edge.m_OutputSlot) {
        fromNode = edge.m_OutputSlot.m_Node?.m_Id || edge.m_OutputSlot.m_NodeGUIDSerialized || edge.m_OutputSlot.m_NodeId;
        const fromSlotId = edge.m_OutputSlot.m_SlotId;
        fromSlot = this.slotMap.get(`${fromNode}_${fromSlotId}`) || fromSlotId || 'Out';
      }

      if (edge.m_InputSlot) {
        toNode = edge.m_InputSlot.m_Node?.m_Id || edge.m_InputSlot.m_NodeGUIDSerialized || edge.m_InputSlot.m_NodeId;
        const toSlotId = edge.m_InputSlot.m_SlotId;
        toSlot = this.slotMap.get(`${toNode}_${toSlotId}`) || toSlotId || 'In';
      }

      return {
        fromNode,
        fromSlot: String(fromSlot),
        toNode,
        toSlot: String(toSlot)
      };
    }).filter(e => e && e.fromNode && e.toNode);
  }

  identifyTarget() {
    // Find UniversalTarget, LitTarget, MasterNode, or SurfaceDescription BaseColor block
    for (const [id, node] of this.nodes.entries()) {
      if (node.type.includes('Target') || node.type.includes('Master') || node.name.includes('BaseColor') || node.name.includes('SurfaceDescription')) {
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
