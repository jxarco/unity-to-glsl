/**
 * Preset Loader UI Component
 */

export class PresetLoaderUI {
  constructor(selectElementId, onPresetLoaded) {
    this.selectEl = document.getElementById(selectElementId);
    this.onPresetLoaded = onPresetLoaded;

    this.presets = {
      'dissolve': './js/presets/dissolve.shadergraph',
      'hologram': './js/presets/hologram.shadergraph',
      'linear-gradient': './js/presets/linear-gradient.shadergraph',
      'pbr-rimlight': './js/presets/pbr-rimlight.shadergraph',
      'voronoi': './js/presets/voronoi.shadergraph',
      'parallax-mapping': './js/presets/parallax-mapping.shadergraph',
      'checkerboard': './js/presets/checkerboard.shadergraph',
      'tiling-offset': './js/presets/tiling-offset.shadergraph',
      'polar-coordinates': './js/presets/polar-coordinates.shadergraph',
      'toon-ramp': './js/presets/toon-ramp.shadergraph',
      'normal-blend': './js/presets/normal-blend.shadergraph',
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
      const json = await res.json();
      if (this.onPresetLoaded) {
        this.onPresetLoaded(json, key);
      }
    } catch (err) {
      console.error('Failed to load preset:', err);
    }
  }
}
