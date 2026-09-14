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
</script>

<ProgressCard
  title={card.name}
  subtitle="{fmtDateShort(period.start)} – {fmtDateShort(period.end)}"
  spent={spend}
  total={totalTarget}
/>
