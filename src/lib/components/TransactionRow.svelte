<script>
  import { fmtDateShort, fmtMoneySigned } from '../data/format.js';

  // In Svelte 5, a component's inputs are declared with $props() —
  // this replaces `export let transaction` from Svelte 4.
  // categoryLabel/paymentLabel are resolved by the caller (see
  // resolveTransactionLabels in transactions.js) — this component just
  // lays them out, it never looks anything up itself.
  let { transaction, onOpen = () => {} } = $props();

  const initial = $derived((transaction.categoryLabel || '?').charAt(0).toUpperCase());
  const color = $derived(transaction.type === 'income' ? 'var(--green)' : 'var(--rust)');
</script>

<!--
  This one component replaces the ~6 near-identical rowHTML() string
  functions duplicated today across home.js, activity.js, calendar.js,
  budgetDetail.js and cards.js. Fix a bug or restyle a row once, here,
  and every screen that renders transactions picks it up.
-->
<button class="tx-row" onclick={() => onOpen(transaction.id)}>
  <div class="tx-icon" style:background={color}>{initial}</div>
  <div class="tx-mid">
    <div class="tx-title">{transaction.description || transaction.categoryLabel}</div>
    <div class="tx-sub">
      {fmtDateShort(transaction.date)} · {transaction.categoryLabel}{#if transaction.type === 'expense'} · {transaction.paymentLabel}{/if}
    </div>
  </div>
  <div class="tx-amt" class:pos={transaction.type === 'income'} class:neg={transaction.type !== 'income'}>
    {fmtMoneySigned(transaction.amount, transaction.type)}
  </div>
</button>

<style>
  /* Scoped to this component only — Svelte adds a unique class under
     the hood, so .tx-row here can never leak into or clash with any
     other component's styles. No BEM naming, no CSS Modules import,
     no global css/components.css to hunt through. */
  .tx-row {
    display: flex; align-items: center; gap: 12px; padding: 12px 0;
    border-bottom: 1px solid var(--paper-line); width: 100%;
    background: none; border-left: none; border-right: none; border-top: none;
    text-align: left; font-family: var(--font-body);
  }
  .tx-icon {
    width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; color: #fff; font-weight: 700; font-family: var(--font-display);
  }
  .tx-mid { flex: 1; min-width: 0; }
  .tx-title { font-size: 14.5px; font-weight: 600; color: var(--ink); }
  .tx-sub { font-size: 12.5px; color: var(--ink); opacity: .55; margin-top: 1px; }
  .tx-amt { font-weight: 700; font-size: 14.5px; font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .tx-amt.neg { color: var(--rust); }
  .tx-amt.pos { color: var(--green); }
</style>
