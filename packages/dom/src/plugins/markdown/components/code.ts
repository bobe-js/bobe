import { bobe, Store } from 'bobe';
import './code.css';
import './markdown.css';
import './tokyo-night-dark.css';


class Code extends Store {
  activeIndex = 0;
  files: Array<{ name: string; html: string }> = [];

  switchTab(i: number) { this.activeIndex = i }

  get activeFile() { return this.files[this.activeIndex]; }
  preview = null;

  normalBlock = null;
  fullBlock = null;

  isFull = false;

  toggleFull = () => {
    this.isFull = !this.isFull;
    console.log('isFull', this.isFull);
    
  }

  get blockTarget() {
    return this.isFull ? this.fullBlock : this.normalBlock;
  }

  ui = bobe`
    div ref={normalBlock} class="code-block"
    div ref={fullBlock} class={isFull ? "code-block-full code-block-full-active" : "code-block-full"}  
    tp node={blockTarget}   
      div class="code-tabs"
        button class="full-button" onclick={toggleFull} text={isFull ? '收起' : '全屏'}
        for files; file i; file.path
          button class={activeIndex === i ? 'code-tab code-tab-active' : 'code-tab'} onclick={() => switchTab(i)} text={file.name}
      div ref={normalPreview} class="code-panel-preview"
        pre class="code-panel" 
          code class="hljs" html={activeFile.html}
        if preview  
          div class="code-preview"
            {preview}            
  `;
}

export default Code;
