<script>
  import { exportAll, importAll } from '../lib/data/db.js';
  import { todayISO } from '../lib/data/format.js';

  // specs/import-export.md requirements 1-6. Full page (not a sheet like
  // CategoryImportExport.svelte) since it's reached as its own Settings
  // row rather than opened from within an already-open screen.
  let { onBack, onImported } = $props();

  let busy = $state(false);
  let error = $state('');
  /** @type {File|null} */
  let pendingFile = $state(null);
  let confirmOpen = $state(false);

  async function handleExport() {
    const data = await exportAll();
    const json = JSON.stringify(data); // minified — see specs/import-export.md requirement 2
    const filename = `expman-backup-${todayISO()}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    const file = new File([blob], filename, { type: 'application/json' });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    error = '';
    pendingFile = file;
    confirmOpen = true;
  }

  // Validates shape before touching anything — a bad file changes
  // nothing (specs/import-export.md requirement 4).
  async function confirmImport() {
    confirmOpen = false;
    if (!pendingFile) return;
    busy = true;
    try {
      const data = JSON.parse(await pendingFile.text());
      const requiredArrays = ['transactions', 'categories', 'accounts', 'budgets', 'recurring', 'cards'];
      if (!requiredArrays.every(key => Array.isArray(data?.[key]))) {
        throw new Error("That doesn't look like an expman backup file.");
      }
      await importAll(data);
      onImported();
    } catch (/** @type {any} */ err) {
      error = err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message;
    } finally {
      busy = false;
      pendingFile = null;
    }
  }
</script>

<div class="backup">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">Backup</div>
    <span class="spacer"></span>
  </div>

  <div class="content">
    <button class="action-row" onclick={handleExport}>
      <span class="action-title">Export backup</span>
      <span class="action-sub">Save everything — accounts, categories, transactions, cards, recurring rules, budgets — to a file.</span>
    </button>

    <label class="action-row file-row" class:busy>
      <span class="action-title">{busy ? 'Importing…' : 'Import backup'}</span>
      <span class="action-sub">Replaces everything currently in the app with a backup file.</span>
      <input type="file" accept="application/json,.json" onchange={handleFile} disabled={busy} />
    </label>

    {#if error}<p class="error">{error}</p>{/if}
  </div>
</div>

{#if confirmOpen}
  <div class="backdrop" role="button" tabindex="0" onclick={() => confirmOpen = false} onkeydown={(e) => e.key === 'Escape' && (confirmOpen = false)}>
    <div class="confirm-sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
      <div class="confirm-title">Replace everything with this backup?</div>
      <p class="confirm-body">Every account, category, transaction, card, recurring rule, and budget currently in the app will be replaced with what's in this file. This can't be undone.</p>
      <div class="confirm-actions">
        <button class="cancel-confirm-btn" onclick={() => { confirmOpen = false; pendingFile = null; }}>Cancel</button>
        <button class="delete-confirm-btn" onclick={confirmImport}>Replace</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .topbar {
    background: var(--ink); color: var(--paper);
    padding: max(env(safe-area-inset-top), 16px) 20px 16px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .title { font-size: 18px; font-weight: 700; font-family: var(--font-display); }
  .back-btn {
    background: none; border: none; color: var(--paper); font-family: var(--font-body);
    font-size: 14px; font-weight: 600;
  }
  .spacer { width: 40px; }

  .content { background: var(--paper); min-height: 100vh; padding: 16px 20px calc(66px + env(safe-area-inset-bottom) + 24px); }

  .action-row {
    position: relative; display: block; width: 100%; text-align: left; cursor: pointer;
    padding: 16px; border-radius: var(--radius); margin-bottom: 12px; box-sizing: border-box;
    background: var(--paper-dim); border: none;
  }
  .action-title { display: block; font-family: var(--font-body); font-size: 15px; font-weight: 700; color: var(--ink); }
  .action-sub { display: block; font-family: var(--font-body); font-size: 12.5px; color: var(--ink); opacity: .6; margin-top: 4px; line-height: 1.4; }
  .file-row.busy { opacity: .6; cursor: default; }
  .file-row input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

  .error { color: var(--rust); font-family: var(--font-body); font-size: 13px; margin: 10px 0 0; }

  .backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.4);
    display: flex; align-items: center; justify-content: center; z-index: 50; padding: 24px;
  }
  .confirm-sheet { width: 100%; max-width: 340px; background: var(--paper); border-radius: var(--radius); padding: 20px; }
  .confirm-title { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); }
  .confirm-body { font-family: var(--font-body); font-size: 13.5px; color: var(--ink); opacity: .7; margin: 8px 0 18px; line-height: 1.5; }
  .confirm-actions { display: flex; gap: 10px; }
  .cancel-confirm-btn, .delete-confirm-btn {
    flex: 1; padding: 10px; border-radius: var(--radius); border: none; font-family: var(--font-body);
    font-size: 14px; font-weight: 700;
  }
  .cancel-confirm-btn { background: var(--paper-dim); color: var(--ink); }
  .delete-confirm-btn { background: var(--rust); color: #fff; }
</style>
