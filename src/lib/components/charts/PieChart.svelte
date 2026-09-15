<script>
  import { onMount, onDestroy } from 'svelte';
  import { Chart } from 'chart.js/auto';

  // Thin Chart.js wrapper (specs/reports.md) — labels/values/colors in, a
  // live doughnut chart out. Re-renders in place (chart.data = ...;
  // chart.update()) on prop change rather than destroy+recreate, matching
  // Chart.js's own recommended update pattern; only destroyed on unmount.
  let { labels, values, colors } = $props();

  /** @type {HTMLCanvasElement} */
  let canvasEl;
  /** @type {import('chart.js').Chart | null} */
  let chart = null;

  // Chart.js does its own Object.defineProperty bookkeeping on the data
  // it's handed (for internal change detection) — that throws
  // (`state_descriptors_fixed`) if given a live Svelte 5 $state proxy
  // directly, so everything is snapshotted to plain arrays first.
  onMount(() => {
    chart = new Chart(canvasEl, {
      type: 'doughnut',
      data: { labels: $state.snapshot(labels), datasets: [{ data: $state.snapshot(values), backgroundColor: $state.snapshot(colors), borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12, font: { family: 'Inter' } } } }
      }
    });
  });

  $effect(() => {
    if (!chart) return;
    chart.data.labels = $state.snapshot(labels);
    chart.data.datasets[0].data = $state.snapshot(values);
    chart.data.datasets[0].backgroundColor = $state.snapshot(colors);
    chart.update();
  });

  onDestroy(() => chart?.destroy());
</script>

<div class="chart-wrap">
  <canvas bind:this={canvasEl}></canvas>
</div>

<style>
  .chart-wrap { position: relative; height: 260px; }
</style>
