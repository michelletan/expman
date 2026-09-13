<script>
  import { fmtMoney } from '../data/format.js';

  let { status, onOpen = () => {} } = $props();

  const pct = $derived(
    status.totalAvailable > 0 ? Math.min(100, Math.round((status.spent / status.totalAvailable) * 100)) : 0
  );
  const barColor = $derived(pct >= 90 ? 'var(--rust)' : 'var(--accent)');
</script>

<button class="budget-card" onclick={() => onOpen(status.category)}>
  <div class="top">
    <div class="cat">
      <span class="dot" style:background={barColor}></span>{status.category}
      {#if status.rolledIn > 0}
        <span class="rollover-tag">+{fmtMoney(status.rolledIn)} rolled over</span>
      {/if}
    </div>
    <div class="nums"><b>{fmtMoney(status.spent)}</b> / {fmtMoney(status.totalAvailable)}</div>
  </div>
  <div class="bar-track"><div class="bar-fill" style:width="{pct}%" style:background={barColor}></div></div>
</button>

<style>
  .budget-card {
    background: #fff; border: 1px solid var(--paper-line); border-radius: 14px;
    padding: 13px 16px; width: 100%; text-align: left; font-family: var(--font-body);
    display: block;
  }
  .top { display: flex; justify-content: space-between; align-items: baseline; }
  .cat { font-weight: 600; font-size: 14.5px; color: var(--ink); display: flex; align-items: center; gap: 8px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .nums { font-size: 13px; font-variant-numeric: tabular-nums; color: var(--ink); opacity: .65; }
  .nums b { opacity: 1; color: var(--ink); }
  .bar-track { height: 6px; background: var(--paper-dim); border-radius: 4px; margin-top: 9px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .rollover-tag {
    font-size: 10px; font-weight: 700; color: var(--green); background: #E4F0E7;
    padding: 2px 6px; border-radius: 6px; margin-left: 2px;
  }
</style>
