<script>
  import { fmtMoney } from '../data/format.js';

  // Shared base for BudgetCard/CardRow (a cap — stay under `total`) and
  // GoalCard/Card Details' min-spend (a goal — reach `total`). Content-
  // only (no wrapping button), so callers stay free to wrap it in
  // whatever interaction they need (a plain button, a swipeable row,
  // etc.) — same reasoning CardRow already had before this refactor.
  //
  // variant picks what "filling the bar" means: 'cap' (default) turns
  // rust near/over the limit — bad news, spending too much. 'goal' turns
  // green once reached — good news, hit the target. Using the same rust
  // for both used to make a met savings goal or min-spend look like a
  // warning (caught live) — see specs/savings-goals.md, specs/cards.md.
  let { title, subtitle = '', subtitleWarn = false, tag = '', spent, total, variant = 'cap' } = $props();

  const pct = $derived(total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0);
  const barColor = $derived(
    variant === 'goal'
      ? (pct >= 100 ? 'var(--green)' : 'var(--accent)')
      : (pct >= 90 ? 'var(--rust)' : 'var(--accent)')
  );
</script>

<div class="top">
  <div class="label">
    <span class="dot" style:background={barColor}></span>
    <span class="title">{title}</span>
    {#if tag}<span class="tag">{tag}</span>{/if}
  </div>
  <div class="nums"><b>{fmtMoney(spent)}</b> / {fmtMoney(total)}</div>
</div>
{#if subtitle}<div class="subtitle" class:warn={subtitleWarn}>{subtitle}</div>{/if}
<div class="bar-track"><div class="bar-fill" style:width="{pct}%" style:background={barColor}></div></div>

<style>
  .top { display: flex; justify-content: space-between; align-items: baseline; }
  .label { font-weight: 600; font-size: 14.5px; color: var(--ink); display: flex; align-items: center; gap: 8px; min-width: 0; }
  .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .nums { font-size: 13px; font-variant-numeric: tabular-nums; color: var(--ink); opacity: .65; flex-shrink: 0; margin-left: 8px; }
  .nums b { opacity: 1; color: var(--ink); }
  .subtitle { font-family: var(--font-body); font-size: 12.5px; color: var(--ink); opacity: .6; margin-top: 2px; }
  .subtitle.warn { color: var(--rust); opacity: 1; font-weight: 600; }
  .bar-track { height: 6px; background: var(--paper-dim); border-radius: 4px; margin-top: 9px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .tag {
    font-size: 10px; font-weight: 700; color: var(--green); background: #E4F0E7;
    padding: 2px 6px; border-radius: 6px; flex-shrink: 0;
  }
</style>
