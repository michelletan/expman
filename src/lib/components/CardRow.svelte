<script>
  import { fmtMoney, fmtDateShort } from '../data/format.js';

  // Content-only — no wrapping button of its own, so callers can put it
  // inside whatever interaction they need (Cards.svelte's swipeable row,
  // Home's plain tap-to-view row), while still showing the exact same
  // tile content everywhere it's used.
  let { card, period, spend, totalTarget } = $props();
</script>

<div class="card-main">
  <div class="card-name">{card.name}</div>
  <div class="card-period">{fmtDateShort(period.start)} – {fmtDateShort(period.end)}</div>
</div>
<div class="card-spend">{fmtMoney(spend)} / {fmtMoney(totalTarget)}</div>

<style>
  .card-main { text-align: left; }
  .card-name { font-family: var(--font-body); font-size: 15px; font-weight: 700; color: var(--ink); }
  .card-period { font-family: var(--font-body); font-size: 12.5px; color: var(--ink); opacity: .6; margin-top: 2px; }
  .card-spend { font-family: var(--font-display); font-weight: 600; font-size: 14px; color: var(--ink); }
</style>
