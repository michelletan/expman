<script>
  import { fmtDateShort } from '../data/format.js';
  import ProgressCard from './ProgressCard.svelte';

  // Thin adapter over the shared ProgressCard base (also used by
  // BudgetCard) — translates this domain's card/period props into
  // ProgressCard's generic title/subtitle/spent/total. Content-only, no
  // wrapping button of its own, so callers stay free to wrap it in
  // whatever interaction they need (Cards.svelte's swipeable row,
  // Home's plain tap-to-view row).
  let { card, period, spend, totalTarget } = $props();

  // specs/cards.md requirement 17 — only shown once met, to keep the
  // compact tile quiet; the fuller "$X to go" picture lives in Card
  // Details (requirement 19).
  const minSpendMet = $derived(card.minSpend != null && spend >= card.minSpend);
</script>

<ProgressCard
  title={card.name}
  subtitle="{fmtDateShort(period.start)} – {fmtDateShort(period.end)}"
  tag={minSpendMet ? 'Min spend met' : ''}
  spent={spend}
  total={totalTarget}
/>
