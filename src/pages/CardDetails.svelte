<script>
  import { onMount } from 'svelte';
  import { getCard, getAll } from '../lib/data/db.js';
  import { fmtMoney, fmtDateShort, getCardPeriod } from '../lib/data/format.js';

  let { cardId, onBack } = $props();

  /** @type {any} */
  let card = $state(null);
  /** @type {{start: string, end: string}|null} */
  let period = $state(null);
  /** @type {{ categoryId: string, name: string, amount: number }[]} */
  let targets = $state([]);

  onMount(async () => {
    const [loaded, categories] = await Promise.all([getCard(cardId), getAll('categories')]);
    if (!loaded) return;
    card = loaded;
    period = getCardPeriod(loaded.resetDate);
    const categoryById = new Map(categories.map(c => [c.id, c]));
    targets = loaded.targetSpend.map(t => ({
      categoryId: t.categoryId,
      name: categoryById.get(t.categoryId)?.name ?? 'Uncategorised',
      amount: t.amount
    }));
  });
</script>

<div class="card-details">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">{card?.name ?? 'Card'}</div>
    <span class="spacer"></span>
  </div>

  {#if card && period}
    <div class="content">
      <div class="period">{fmtDateShort(period.start)} – {fmtDateShort(period.end)}</div>

      <div class="section-label">Target spend by category</div>
      <div class="target-list">
        {#each targets as target (target.categoryId)}
          <div class="target-row">
            <span class="cat-name">{target.name}</span>
            <span class="amounts"><span class="placeholder">—</span> / {fmtMoney(target.amount)}</span>
          </div>
        {:else}
          <div class="empty-state">No category targets set.</div>
        {/each}
      </div>
      <p class="note">Actual spend isn't tracked yet — transactions can't be linked to a card until that feature ships.</p>
    </div>
  {/if}
</div>

<style>
  .topbar {
    background: var(--ink); color: var(--paper);
    padding: max(env(safe-area-inset-top), 16px) 20px 16px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .title { font-size: 16px; font-weight: 700; font-family: var(--font-display); }
  .back-btn {
    background: none; border: none; color: var(--paper); font-family: var(--font-body);
    font-size: 14px; font-weight: 600;
  }
  .spacer { width: 40px; }

  .content { background: var(--paper); min-height: 100vh; padding: 16px 20px 90px; }
  .period { font-family: var(--font-body); font-size: 13px; color: var(--ink); opacity: .6; margin-bottom: 16px; }

  .section-label { font-size: 13px; font-weight: 700; color: var(--ink); opacity: .6; margin-bottom: 8px; }
  .target-list { display: flex; flex-direction: column; gap: 8px; }
  .target-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; border-radius: 10px; background: var(--paper-dim);
  }
  .cat-name { font-family: var(--font-body); font-size: 14px; font-weight: 600; color: var(--ink); }
  .amounts { font-family: var(--font-display); font-weight: 600; font-size: 14px; color: var(--ink); }
  .placeholder { opacity: .4; }

  .empty-state { padding: 20px 0; text-align: center; color: var(--ink); opacity: .5; font-size: 14px; }
  .note { font-family: var(--font-body); font-size: 12px; color: var(--ink); opacity: .5; margin-top: 16px; line-height: 1.5; }
</style>
