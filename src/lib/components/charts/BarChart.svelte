<script>
  import { onMount, onDestroy } from 'svelte';
  import { Chart } from 'chart.js/auto';

  // Thin Chart.js wrapper (specs/reports.md) — labels + one or more
  // {label, data, color} datasets in, a live bar chart out. `horizontal`
  // flips the index/value axes (Chart 5's top-subcategories ranking reads
  // better as horizontal bars than vertical ones at 5 long names).
  let { labels, datasets, horizontal = false } = $props();

  /** @type {HTMLCanvasElement} */
  let canvasEl;
  /** @type {import('chart.js').Chart | null} */
  let chart = null;

  // Chart.js does its own Object.defineProperty bookkeeping on the data
  // it's handed (for internal change detection) — that throws
  // (`state_descriptors_fixed`) if given a live Svelte 5 $state proxy
  // directly, so everything is snapshotted to plain arrays first.
  function toChartDatasets(ds) {
    return $state.snapshot(ds).map(d => ({ label: d.label, data: d.data, backgroundColor: d.color, borderRadius: 4, borderSkipped: false }));
  }

  onMount(() => {
    chart = new Chart(canvasEl, {
      type: 'bar',
      data: { labels: $state.snapshot(labels), datasets: toChartDatasets(datasets) },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: datasets.length > 1, position: 'bottom', labels: { font: { family: 'Inter' } } } },
        scales: {
          x: { grid: { display: horizontal } },
          y: { grid: { display: !horizontal }, beginAtZero: true }
        }
      }
    });
  });

  $effect(() => {
    if (!chart) return;
    chart.data.labels = $state.snapshot(labels);
    chart.data.datasets = toChartDatasets(datasets);
    chart.update();
  });

  onDestroy(() => chart?.destroy());
</script>

<div class="chart-wrap" class:tall={horizontal}>
  <canvas bind:this={canvasEl}></canvas>
</div>

<style>
  .chart-wrap { position: relative; height: 220px; }
  .chart-wrap.tall { height: 200px; }
</style>
