/**
 * Preset Loader UI Component
 */

export class PresetLoaderUI {
  constructor(selectElementId, onPresetLoaded) {
    this.selectEl = document.getElementById(selectElementId);
    this.onPresetLoaded = onPresetLoaded;

    this.presets = {
      'dissolve': './js/presets/dissolve.json',
      'hologram': './js/presets/hologram.json',
      'pbr-rimlight': './js/presets/pbr-rimlight.json'
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
