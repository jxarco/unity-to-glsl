import { ShaderGraphParser } from './shadergraph-parser.js';

export class SubGraphRegistry {
  constructor() {
    this.registryByGuid = new Map();
    this.registryByName = new Map();
  }

  clear() {
    this.registryByGuid.clear();
    this.registryByName.clear();
  }

  registerSubGraph(filename, jsonInput) {
    try {
      const parser = new ShaderGraphParser();
      const ast = parser.parse(jsonInput);
      const raw = parser.rawGraph || {};

      let guid = '';
      if (raw.m_Guid && raw.m_Guid.m_GuidSerialized) {
        guid = raw.m_Guid.m_GuidSerialized;
      } else if (raw.m_ObjectId) {
        guid = raw.m_ObjectId;
      }

      const name = filename.replace(/\.(shadersubgraph|shadergraph)$/i, '');
      const normalizedName = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

      const entry = {
        filename,
        name,
        normalizedName,
        guid,
        ast,
        raw
      };

      if (guid) {
        this.registryByGuid.set(guid, entry);
      }
      this.registryByName.set(normalizedName, entry);
      this.registryByName.set(name.toLowerCase(), entry);

      return entry;
    } catch (err) {
      console.warn(`Failed to parse subgraph ${filename}:`, err);
      return null;
    }
  }

  getSubGraph(guidOrName) {
    if (!guidOrName) return null;
    if (this.registryByGuid.has(guidOrName)) {
      return this.registryByGuid.get(guidOrName);
    }
    const normalized = String(guidOrName).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (this.registryByName.has(normalized)) {
      return this.registryByName.get(normalized);
    }
    const lower = String(guidOrName).toLowerCase();
    if (this.registryByName.has(lower)) {
      return this.registryByName.get(lower);
    }
    return null;
  }

  hasSubGraph(guidOrName) {
    return !!this.getSubGraph(guidOrName);
  }
}

export const globalSubGraphRegistry = new SubGraphRegistry();
