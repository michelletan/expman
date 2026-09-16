<script>
  import { exportCategories, importCategories } from '../data/db.js';

  let { onImported, onClose } = $props();

  let error = $state('');
  let busy = $state(false);

  async function handleExport() {
    const data = await exportCategories();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const file = new File([blob], 'expman-categories.json', { type: 'application/json' });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'expman categories' });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'expman-categories.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    error = '';
    busy = true;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data?.categories)) throw new Error("That doesn't look like an expman categories file.");
      await importCategories(data.categories);
      onImported();
    } catch (/** @type {any} */ err) {
      error = err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message;
    } finally {
      busy = false;
      e.target.value = '';
    }
  }
</script>

<div class="backdrop" role="button" tabindex="0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
  <div class="sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
    <div class="title">Import / export categories</div>

    <button class="action-btn" onclick={handleExport}>Export categories</button>

    <label class="action-btn file-btn" class:busy>
      {busy ? 'Importing…' : 'Import categories'}
      <input type="file" accept="application/json,.json" onchange={handleFile} disabled={busy} />
    </label>
    <p class="hint">Importing replaces your entire category list.</p>

    {#if error}<p class="error">{error}</p>{/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.4);
    display: flex; align-items: flex-end; justify-content: center; z-index: 50;
  }
  .sheet {
    width: 100%; max-width: 480px; background: var(--paper);
    border-radius: var(--radius) var(--radius) 0 0; padding: 18px 20px max(env(safe-area-inset-bottom), 20px);
  }
  .title {
    font-family: var(--font-display); font-size: 16px; font-weight: 700;
    color: var(--ink); margin-bottom: 14px;
  }
  .action-btn {
    position: relative; display: flex; align-items: center; justify-content: center;
    width: 100%; padding: 12px; border-radius: var(--radius); margin-bottom: 10px; cursor: pointer;
    font-family: var(--font-body); font-size: 14px; font-weight: 700;
    background: var(--paper-dim); color: var(--ink); border: none; box-sizing: border-box;
  }
  .file-btn.busy { opacity: .6; cursor: default; }
  .file-btn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .hint { font-family: var(--font-body); font-size: 12px; color: var(--ink); opacity: .55; margin: 0; }
  .error { color: var(--rust); font-family: var(--font-body); font-size: 13px; margin: 10px 0 0; }
</style>
