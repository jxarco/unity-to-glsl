/**
 * Monaco GLSL Code Editor & Live Code Transpilation Component
 */

export class CodeEditorUI {
  constructor(containerId, onCodeEdited) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.onCodeEdited = onCodeEdited;
    this.editor = null;
    this.currentOutput = null;
    this.activeTab = 'fragment'; // 'vertex' | 'fragment' | 'full'
    this.isEditable = false;
    this.isInternalUpdate = false;
    this.monacoReady = false;

    this.bindUIEvents();
    this.waitForMonaco();
  }

  waitForMonaco() {
    // Poll for window.require (AMD loader) to be available, then load Monaco
    const check = () => {
      if (typeof window.require === 'function') {
        this.loadMonaco();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  }

  loadMonaco() {
    window.require.config({
      paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
    });

    window.require(['vs/editor/editor.main'], () => {
      this.monacoReady = true;
      this.createEditor();
    });
  }

  createEditor() {
    if (!this.container || !window.monaco) return;

    this.editor = window.monaco.editor.create(this.container, {
      value: '// Loading GLSL shader code...',
      language: 'cpp',
      theme: 'vs-dark',
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      fontFamily: "'Fira Code', Consolas, monospace",
      fontLigatures: true,
      automaticLayout: true,
      padding: { top: 12, bottom: 12 },
      lineNumbers: 'on',
      renderLineHighlight: 'all',
      matchBrackets: 'always',
      wordWrap: 'off'
    });

    // Listen for user edits
    this.editor.onDidChangeModelContent(() => {
      if (this.isInternalUpdate) return;
      if (this.isEditable && this.onCodeEdited) {
        const currentContent = this.editor.getValue();
        this.onCodeEdited(currentContent, this.activeTab);
      }
    });

    // Render buffered content if available
    if (this.currentOutput) {
      this.render();
    }
  }

  bindUIEvents() {
    // 1. Bind Tab Buttons
    const tabs = document.querySelectorAll('.code-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.activeTab = e.currentTarget.dataset.tab;
        this.render();
      });
    });

    // 2. Bind Editable Toggle Switch
    const toggleEditable = document.getElementById('toggle-editable');
    if (toggleEditable) {
      toggleEditable.addEventListener('change', (e) => {
        this.isEditable = e.target.checked;
        if (this.editor) {
          this.editor.updateOptions({ readOnly: !this.isEditable });
        }
      });
    }

    // 3. Bind Copy Button
    const copyBtn = document.getElementById('btn-copy-code');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyToClipboard());
    }

    // 4. Bind Download Button
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
    if (!this.currentOutput) return;

    let codeToShow = '';
    if (this.activeTab === 'vertex') {
      codeToShow = this.currentOutput.vertexShader;
    } else if (this.activeTab === 'full') {
      codeToShow = this.currentOutput.fullGLSL;
    } else {
      codeToShow = this.currentOutput.fragmentShader;
    }

    if (this.editor) {
      this.isInternalUpdate = true;
      this.editor.setValue(codeToShow);
      this.isInternalUpdate = false;
    }
  }

  layout() {
    if (this.editor) {
      this.editor.layout();
    }
  }

  copyToClipboard() {
    const textToCopy = this.editor ? this.editor.getValue() : '';
    if (!textToCopy) return;

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
    const textToDownload = this.editor ? this.editor.getValue() : '';
    if (!textToDownload) return;

    const blob = new Blob([textToDownload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shader_${this.activeTab}.glsl`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
