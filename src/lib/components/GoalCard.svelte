<script>
  import { fmtMoney, fmtMoneySigned } from '../data/format.js';
  import ProgressCard from './ProgressCard.svelte';

  // status: {goal, net} from getSavingsGoalStatus (specs/savings-goals.md).
  // net can be negative (spent more than earned) — the bar always clamps
  // to [0, goal] (requirement 7), while the subtitle carries the real
  // signed figure so a negative month is never hidden by the clamp.
  let { status, onOpen = () => {} } = $props();

  const clampedNet = $derived(Math.max(0, Math.min(status.net, status.goal)));
  const reached = $derived(status.net >= status.goal);

  const subtitle = $derived(
    status.net < 0
      ? `${fmtMoneySigned(Math.abs(status.net), 'expense')} so far`
      : reached
        ? 'Goal reached'
        : `${fmtMoney(status.goal - status.net)} to go`
  );
</script>

<button class="goal-card" onclick={() => onOpen()}>
  <ProgressCard title="Savings goal" spent={clampedNet} total={status.goal} {subtitle} subtitleWarn={status.net < 0} />
</button>

<style>
  .goal-card {
    background: #fff; border: 1px solid var(--paper-line); border-radius: var(--radius);
    padding: 13px 16px; width: 100%; text-align: left; font-family: var(--font-body);
    display: block;
  }
</style>
