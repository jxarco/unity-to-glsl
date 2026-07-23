/**
 * GLSL Code Generator / Transpiler
 * Converts Unity 6 ShaderGraph AST into WebGL 2.0 (GLSL ES 3.00) Vertex & Fragment Shaders.
 */

export class GLSLCodeGenerator {
  constructor() {
    this.uniforms = [];
    this.varCounter = 0;
    this.typeMap = new Map(); // tracks GLSL type per expression/variable
  }

  generateVarName(prefix = 'v') {
    this.varCounter++;
    return `${prefix}_${this.varCounter}`;
  }

  /** Infer the GLSL type of a known expression string */
  inferType(expr) {
    if (this.typeMap.has(expr)) return this.typeMap.get(expr);
    if (expr.startsWith('vec4')) return 'vec4';
    if (expr.startsWith('vec3')) return 'vec3';
    if (expr.startsWith('vec2')) return 'vec2';
    return 'float';
  }

  /** Promote two types: returns the wider of the two */
  promoteType(a, b) {
    const rank = { 'float': 1, 'vec2': 2, 'vec3': 3, 'vec4': 4 };
    return (rank[a] || 1) >= (rank[b] || 1) ? a : b;
  }

  /** Cast an expression to a target GLSL type */
  castTo(expr, fromType, toType) {
    if (fromType === toType) return expr;
    if (toType === 'float') {
      if (fromType === 'vec4') return `${expr}.x`;
      if (fromType === 'vec3') return `${expr}.x`;
      if (fromType === 'vec2') return `${expr}.x`;
      return expr;
    }
    return `${toType}(${expr})`;
  }

  /**
   * Main transpile entrypoint
   */
  transpile(parsedGraph) {
    this.varCounter = 0;
    this.typeMap = new Map();
    const { properties, nodes, edges, target, executionOrder } = parsedGraph;

    // 1. Generate Uniform Declarations & seed typeMap for properties
    const uniformLines = [];
    properties.forEach(prop => {
      let glslType = 'float';
      if (prop.type === 'Color' || prop.type === 'Vector4') glslType = 'vec4';
      else if (prop.type === 'Vector3') glslType = 'vec3';
      else if (prop.type === 'Vector2') glslType = 'vec2';
      else if (prop.type === 'Texture2D') glslType = 'sampler2D';

      uniformLines.push(`uniform ${glslType} ${prop.referenceName};`);
      this.typeMap.set(prop.referenceName, glslType);
    });
    // Add default time uniform
    uniformLines.push(`uniform float u_time;`);
    uniformLines.push(`uniform vec2 u_resolution;`);
    this.typeMap.set('u_time', 'float');
    this.typeMap.set('u_resolution', 'vec2');

    // Seed built-in variable types
    this.typeMap.set('Time', 'float');
    this.typeMap.set('sin(Time)', 'float');
    this.typeMap.set('UV.xy', 'vec2');
    this.typeMap.set('Position', 'vec3');
    this.typeMap.set('Position.x', 'float');
    this.typeMap.set('Position.y', 'float');
    this.typeMap.set('Position.z', 'float');
    this.typeMap.set('Normal', 'vec3');
    this.typeMap.set('ViewDir', 'vec3');

    // 2. Transpile Node Graph Execution to GLSL Statements
    const nodeVarMap = new Map(); // nodeID_slotName -> GLSL expression / variable name
    const codeBody = [];

    // Pre-populate property nodes/references
    properties.forEach(prop => {
      nodeVarMap.set(`${prop.id}_Out`, prop.referenceName);
      nodeVarMap.set(`${prop.id}_out`, prop.referenceName);
      nodeVarMap.set(`prop_${prop.name}_Out`, prop.referenceName);
      nodeVarMap.set(`prop_${prop.name}_out`, prop.referenceName);
      nodeVarMap.set(`${prop.referenceName}_Out`, prop.referenceName);
    });

    executionOrder.forEach(node => {
      this.transpileNode(node, edges, nodeVarMap, codeBody);
    });

    // 3. Resolve Target Node Outputs (BaseColor, Emission, Alpha, AlphaClip)
    let finalBaseColor = 'vec4(1.0, 1.0, 1.0, 1.0)';
    let finalAlpha = '1.0';
    let finalEmission = 'vec3(0.0)';

    if (target) {
      const incoming = edges.filter(e => e.toNode === target.id);
      incoming.forEach(e => {
        const val = nodeVarMap.get(`${e.fromNode}_${e.fromSlot}`) || 'vec4(1.0)';
        if (e.toSlot === 'BaseColor') finalBaseColor = this.ensureVec4(val);
        else if (e.toSlot === 'Alpha') finalAlpha = this.ensureFloat(val);
        else if (e.toSlot === 'Emission') finalEmission = this.ensureVec3(val);
      });
    }

    // 4. Three.js Fragment Shader (GLSL 100 compatible with Three.js ShaderMaterial)
    const threeFragmentShader = `
precision highp float;

// Uniforms
${uniformLines.join('\n')}

// Varyings from Vertex Shader
varying vec3 v_position;
varying vec3 v_normal;
varying vec2 v_uv;
varying vec3 v_viewDir;

// Procedural Helper Math Functions
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float gradientNoise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i + vec2(0.0,0.0)), hash21(i + vec2(1.0,0.0)), u.x),
               mix(hash21(i + vec2(0.0,1.0)), hash21(i + vec2(1.0,1.0)), u.x), u.y);
}

float fresnelEffect(vec3 normal, vec3 viewDir, float power) {
    return pow(1.0 - clamp(dot(normalize(normal), normalize(viewDir)), 0.0, 1.0), power);
}

void main() {
    // Standard Unity ShaderGraph converted variables
    vec4 UV = vec4(v_uv, 0.0, 0.0);
    float Time = u_time;
    vec3 Position = v_position;
    vec3 Normal = normalize(v_normal);
    vec3 ViewDir = normalize(v_viewDir);

    // Node graph execution steps
${codeBody.map(line => '    ' + line).join('\n')}

    // Target Master Output Assembly
    vec4 baseColor = ${finalBaseColor};
    vec3 emission = ${finalEmission};
    float alpha = ${finalAlpha};

    if (alpha < 0.05) discard;

    vec3 finalRGB = baseColor.rgb + emission;
    gl_FragColor = vec4(finalRGB, alpha);
}
`;

    // 5. Three.js Vertex Shader (GLSL 100 compatible with Three.js ShaderMaterial)
    const threeVertexShader = `
varying vec3 v_position;
varying vec3 v_normal;
varying vec2 v_uv;
varying vec3 v_viewDir;

void main() {
    v_uv = uv;
    v_normal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    v_position = worldPos.xyz;
    v_viewDir = normalize(cameraPosition - worldPos.xyz);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

    // 6. Standalone modern GLSL ES 3.0 Code for viewer & download
    const standaloneVertex = `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform vec3 cameraPosition;

out vec3 v_position;
out vec3 v_normal;
out vec2 v_uv;
out vec3 v_viewDir;

void main() {
    v_uv = uv;
    v_normal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    v_position = worldPos.xyz;
    v_viewDir = normalize(cameraPosition - worldPos.xyz);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
}`;

    const standaloneFragment = `#version 300 es
precision highp float;

${uniformLines.join('\n')}

in vec3 v_position;
in vec3 v_normal;
in vec2 v_uv;
in vec3 v_viewDir;

out vec4 fragColor;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float gradientNoise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i + vec2(0.0,0.0)), hash21(i + vec2(1.0,0.0)), u.x),
               mix(hash21(i + vec2(0.0,1.0)), hash21(i + vec2(1.0,1.0)), u.x), u.y);
}

float fresnelEffect(vec3 normal, vec3 viewDir, float power) {
    return pow(1.0 - clamp(dot(normalize(normal), normalize(viewDir)), 0.0, 1.0), power);
}

void main() {
    vec4 UV = vec4(v_uv, 0.0, 0.0);
    float Time = u_time;
    vec3 Position = v_position;
    vec3 Normal = normalize(v_normal);
    vec3 ViewDir = normalize(v_viewDir);

${codeBody.map(line => '    ' + line).join('\n')}

    vec4 baseColor = ${finalBaseColor};
    vec3 emission = ${finalEmission};
    float alpha = ${finalAlpha};

    if (alpha < 0.05) discard;

    vec3 finalRGB = baseColor.rgb + emission;
    fragColor = vec4(finalRGB, alpha);
}`;

    return {
      vertexShader: standaloneVertex,
      fragmentShader: standaloneFragment,
      threeVertexShader,
      threeFragmentShader,
      fullGLSL: `// --- VERTEX SHADER ---\n${standaloneVertex}\n\n// --- FRAGMENT SHADER ---\n${standaloneFragment}`
    };
  }

  transpileNode(node, edges, varMap, codeBody) {
    const getSlotVal = (slotName, defaultFallback) => {
      // 1. Exact match
      let edge = edges.find(e => e.toNode === node.id && e.toSlot === slotName);
      // 2. Case-insensitive match
      if (!edge) {
        edge = edges.find(e => e.toNode === node.id && e.toSlot.toLowerCase() === slotName.toLowerCase());
      }
      if (edge) {
        const val = varMap.get(`${edge.fromNode}_${edge.fromSlot}`) ||
                    varMap.get(`${edge.fromNode}_Out`) ||
                    varMap.get(`${edge.fromNode}_out`);
        if (val) return val;
      }
      return defaultFallback;
    };

    const outVar = this.generateVarName(`n_${node.type.replace('Node', '').toLowerCase()}`);

    switch (node.type) {
      case 'TimeNode':
      case 'Time':
        varMap.set(`${node.id}_Time`, 'Time');
        varMap.set(`${node.id}_Sine Time`, 'sin(Time)');
        varMap.set(`${node.id}_Out`, 'Time');
        break;

      case 'UVNode':
      case 'UV':
        varMap.set(`${node.id}_Out`, 'UV.xy');
        break;

      case 'PositionNode':
      case 'Position':
        varMap.set(`${node.id}_Out`, 'Position');
        varMap.set(`${node.id}_Y`, 'Position.y');
        varMap.set(`${node.id}_X`, 'Position.x');
        varMap.set(`${node.id}_Z`, 'Position.z');
        break;

      case 'SineNode':
      case 'Sine': {
        const input = getSlotVal('In', 'Time');
        const castInput = this.castTo(input, this.inferType(input), 'float');
        codeBody.push(`float ${outVar} = sin(${castInput});`);
        this.typeMap.set(outVar, 'float');
        varMap.set(`${node.id}_Out`, outVar);
        break;
      }

      case 'GradientNoiseNode':
      case 'GradientNoise': {
        const uvVal = getSlotVal('UV', 'UV.xy');
        const scale = node.scale || 10.0;
        const castUV = this.castTo(uvVal, this.inferType(uvVal), 'vec2');
        codeBody.push(`float ${outVar} = gradientNoise(${castUV} * ${scale.toFixed(1)});`);
        this.typeMap.set(outVar, 'float');
        varMap.set(`${node.id}_Out`, outVar);
        break;
      }

      case 'StepNode':
      case 'Step': {
        const edgeVal = getSlotVal('Edge', '0.5');
        const inVal = getSlotVal('In', '0.0');
        const castEdge = this.castTo(edgeVal, this.inferType(edgeVal), 'float');
        const castIn = this.castTo(inVal, this.inferType(inVal), 'float');
        codeBody.push(`float ${outVar} = step(${castEdge}, ${castIn});`);
        this.typeMap.set(outVar, 'float');
        varMap.set(`${node.id}_Out`, outVar);
        break;
      }

      case 'FresnelNode':
      case 'Fresnel': {
        const powerVal = getSlotVal('Power', '3.0');
        const castPow = this.castTo(powerVal, this.inferType(powerVal), 'float');
        codeBody.push(`float ${outVar} = fresnelEffect(Normal, ViewDir, ${castPow});`);
        this.typeMap.set(outVar, 'float');
        varMap.set(`${node.id}_Out`, outVar);
        break;
      }

      case 'MultiplyNode':
      case 'Multiply': {
        const a = getSlotVal('A', '1.0');
        const b = getSlotVal('B', '1.0');
        const tA = this.inferType(a);
        const tB = this.inferType(b);
        const outType = this.promoteType(tA, tB);
        const castA = this.castTo(a, tA, outType);
        const castB = this.castTo(b, tB, outType);
        codeBody.push(`${outType} ${outVar} = ${castA} * ${castB};`);
        this.typeMap.set(outVar, outType);
        varMap.set(`${node.id}_Out`, outVar);
        break;
      }

      case 'AddNode':
      case 'Add': {
        const a = getSlotVal('A', '0.0');
        const b = getSlotVal('B', '0.0');
        const tA = this.inferType(a);
        const tB = this.inferType(b);
        const outType = this.promoteType(tA, tB);
        const castA = this.castTo(a, tA, outType);
        const castB = this.castTo(b, tB, outType);
        codeBody.push(`${outType} ${outVar} = ${castA} + ${castB};`);
        this.typeMap.set(outVar, outType);
        varMap.set(`${node.id}_Out`, outVar);
        break;
      }

      case 'SubtractNode':
      case 'Subtract': {
        const a = getSlotVal('A', '0.0');
        const b = getSlotVal('B', '0.0');
        const tA = this.inferType(a);
        const tB = this.inferType(b);
        const outType = this.promoteType(tA, tB);
        const castA = this.castTo(a, tA, outType);
        const castB = this.castTo(b, tB, outType);
        codeBody.push(`${outType} ${outVar} = ${castA} - ${castB};`);
        this.typeMap.set(outVar, outType);
        varMap.set(`${node.id}_Out`, outVar);
        break;
      }

      default:
        // Generic fallback for unhandled nodes
        varMap.set(`${node.id}_Out`, 'vec4(1.0)');
        this.typeMap.set('vec4(1.0)', 'vec4');
        break;
    }
  }

  ensureVec4(val) {
    const t = this.inferType(val);
    if (t === 'vec4') return val;
    if (t === 'vec3') return `vec4(${val}, 1.0)`;
    return `vec4(vec3(${val}), 1.0)`;
  }

  ensureVec3(val) {
    const t = this.inferType(val);
    if (t === 'vec3') return val;
    if (t === 'vec4') return `${val}.rgb`;
    return `vec3(${val})`;
  }

  ensureFloat(val) {
    const t = this.inferType(val);
    if (t === 'float') return val;
    if (t === 'vec4') return `${val}.a`;
    if (t === 'vec3') return `${val}.x`;
    if (t === 'vec2') return `${val}.x`;
    return val;
  }
}
