<script>
  import { fmtMoney } from '../data/format.js';
  import ProgressCard from './ProgressCard.svelte';

  let { status, onOpen = () => {} } = $props();

  const tag = $derived(status.rolledIn > 0 ? `+${fmtMoney(status.rolledIn)} rolled over` : '');
  const remainingLabel = $derived(
    status.remaining >= 0
      ? `${fmtMoney(status.remaining)} left`
      : `${fmtMoney(Math.abs(status.remaining))} over budget`
  );
</script>

<button class="budget-card" onclick={() => onOpen(status)}>
  <ProgressCard
    title={status.category} {tag} spent={status.spent} total={status.totalAvailable}
    subtitle={remainingLabel} subtitleWarn={status.remaining < 0}
  />
</button>

<style>
  .budget-card {
    background: #fff; border: 1px solid var(--paper-line); border-radius: var(--radius);
    padding: 13px 16px; width: 100%; text-align: left; font-family: var(--font-body);
    display: block;
  }
</style>
