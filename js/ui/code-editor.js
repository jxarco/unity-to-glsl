/**
 * GLSL Code Viewer & Syntax Highlighter Component
 */

export class CodeEditorUI {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentOutput = null;
    this.activeTab = 'fragment'; // 'vertex' | 'fragment' | 'full'

    this.init();
  }

  init() {
    // Bind Tab click events if tab elements exist
    const tabs = document.querySelectorAll('.code-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.activeTab = e.currentTarget.dataset.tab;
        this.render();
      });
    });

    // Bind Copy Button
    const copyBtn = document.getElementById('btn-copy-code');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyToClipboard());
    }

    // Bind Download Button
    const downloadBtn = document.getElementById('btn-download-glsl');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadGLSL());
    }
  }

  updateCode(glslOutput) {
    this.currentOutput = glslOutput;
    this.render();
  }

  render() {
    if (!this.container || !this.currentOutput) return;

    let codeToShow = '';
    if (this.activeTab === 'vertex') {
      codeToShow = this.currentOutput.vertexShader;
    } else if (this.activeTab === 'full') {
      codeToShow = this.currentOutput.fullGLSL;
    } else {
      codeToShow = this.currentOutput.fragmentShader;
    }

    const highlightedHTML = this.highlightGLSL(codeToShow);
    this.container.innerHTML = `<pre><code>${highlightedHTML}</code></pre>`;
  }

  highlightGLSL(code) {
    // Basic regex token highlighter for GLSL ES 3.0
    return code
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/(\/\/.*)/g, '<span class="token-comment">$1</span>')
      .replace(/\b(uniform|in|out|precision|highp|mediump|lowp|void|main|return|if|else|for|while)\b/g, '<span class="token-keyword">$1</span>')
      .replace(/\b(float|int|vec2|vec3|vec4|mat3|mat4|sampler2D|bool)\b/g, '<span class="token-type">$1</span>')
      .replace(/\b(sin|cos|tan|step|smoothstep|mix|pow|clamp|normalize|dot|cross|length|distance|gradientNoise|fresnelEffect|fract|floor)\b/g, '<span class="token-builtin">$1</span>')
      .replace(/\b([0-9]+\.[0-9]*|[0-9]*\.[0-9]+|[0-9]+)\b/g, '<span class="token-number">$1</span>');
  }

  copyToClipboard() {
    if (!this.currentOutput) return;
    const textToCopy = this.activeTab === 'vertex' ? this.currentOutput.vertexShader :
                       this.activeTab === 'full' ? this.currentOutput.fullGLSL :
                       this.currentOutput.fragmentShader;

    navigator.clipboard.writeText(textToCopy).then(() => {
      const copyBtn = document.getElementById('btn-copy-code');
      if (copyBtn) {
        const origText = copyBtn.innerText;
        copyBtn.innerText = 'Copied!';
        setTimeout(() => copyBtn.innerText = origText, 1800);
      }
    });
  }

  downloadGLSL() {
    if (!this.currentOutput) return;
    const textToDownload = this.currentOutput.fullGLSL;
    const blob = new Blob([textToDownload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'converted_shader.glsl';
    a.click();
    URL.revokeObjectURL(url);
  }
}
