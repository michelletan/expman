<script>
  import { onMount } from 'svelte';
  import { getCard, getAll, getCardSpendSummary } from '../lib/data/db.js';
  import { fmtMoney, fmtDateShort, getCardPeriod } from '../lib/data/format.js';

  let { cardId, onBack } = $props();

  /** @type {any} */
  let card = $state(null);
  /** @type {{start: string, end: string}|null} */
  let period = $state(null);
  /** @type {{ categoryId: string, name: string, amount: number, spent: number }[]} */
  let targets = $state([]);
  let totalSpend = $state(0);

  onMount(async () => {
    const loaded = await getCard(cardId);
    if (!loaded) return;
    card = loaded;
    period = getCardPeriod(loaded.resetDate);

    const [categories, summary] = await Promise.all([getAll('categories'), getCardSpendSummary(cardId, period)]);
    const categoryById = new Map(categories.map(c => [c.id, c]));
    totalSpend = summary.total;
    targets = loaded.targetSpend.map(t => ({
      categoryId: t.categoryId,
      name: categoryById.get(t.categoryId)?.name ?? 'Uncategorised',
      amount: t.amount,
      spent: summary.byCategory[t.categoryId] || 0
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
      <div class="total-spend">{fmtMoney(totalSpend)} spent this period</div>

      <div class="section-label">Target spend by category</div>
      <div class="target-list">
        {#each targets as target (target.categoryId)}
          <div class="target-row">
            <span class="cat-name">{target.name}</span>
            <span class="amounts" class:over={target.spent > target.amount}>{fmtMoney(target.spent)} / {fmtMoney(target.amount)}</span>
          </div>
        {:else}
          <div class="empty-state">No category targets set.</div>
        {/each}
      </div>
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
  .period { font-family: var(--font-body); font-size: 13px; color: var(--ink); opacity: .6; margin-bottom: 4px; }
  .total-spend { font-family: var(--font-display); font-size: 20px; font-weight: 600; color: var(--ink); margin-bottom: 20px; }

  .section-label { font-size: 13px; font-weight: 700; color: var(--ink); opacity: .6; margin-bottom: 8px; }
  .target-list { display: flex; flex-direction: column; gap: 8px; }
  .target-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; border-radius: var(--radius); background: var(--paper-dim);
  }
  .cat-name { font-family: var(--font-body); font-size: 14px; font-weight: 600; color: var(--ink); }
  .amounts { font-family: var(--font-display); font-weight: 600; font-size: 14px; color: var(--ink); }
  .amounts.over { color: var(--rust); }

  .empty-state { padding: 20px 0; text-align: center; color: var(--ink); opacity: .5; font-size: 14px; }
</style>
