/**
 * Preset Loader UI Component
 */

export class PresetLoaderUI {
  constructor(selectElementId, onPresetLoaded) {
    this.selectEl = document.getElementById(selectElementId);
    this.onPresetLoaded = onPresetLoaded;

    this.presets = {
      'dissolve': './presets/dissolve.shadergraph',
      'hologram': './presets/hologram.shadergraph',
      'linear-gradient': './presets/linear-gradient.shadergraph',
      'pbr-rimlight': './presets/pbr-rimlight.shadergraph',
      'voronoi': './presets/voronoi.shadergraph',
      'parallax-mapping': './presets/parallax-mapping.shadergraph',
      'checkerboard': './presets/checkerboard.shadergraph',
      'tiling-offset': './presets/tiling-offset.shadergraph',
      'polar-coordinates': './presets/polar-coordinates.shadergraph',
      'toon-ramp': './presets/toon-ramp.shadergraph',
      'normal-blend': './presets/normal-blend.shadergraph',
    };

    this.init();
  }

  init() {
    if (!this.selectEl) return;

    this.selectEl.addEventListener('change', (e) => {
      const presetKey = e.target.value;
      if (presetKey && this.presets[presetKey]) {
        this.loadPreset(presetKey);
      }
    });
  }

  async loadPreset(key) {
    const url = this.presets[key];
    if (!url) return;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const text = await res.text();
      if (this.onPresetLoaded) {
        this.onPresetLoaded(text, key);
      }
    } catch (err) {
      console.error('Failed to load preset:', err);
    }
  }
}
