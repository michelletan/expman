<script>
  import { onMount } from 'svelte';
  import { getRecurringRules } from '../lib/data/db.js';
  import { fmtMoney, fmtDateShort } from '../lib/data/format.js';

  let { onBack, onAdd, onEdit } = $props();

  const FREQUENCY_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', annual: 'Annual' };

  let upcoming = $state([]);
  let completed = $state([]);

  onMount(load);

  async function load() {
    const rules = await getRecurringRules();
    upcoming = rules.filter(r => r.active).sort((a, b) => (a.nextDueDate || '').localeCompare(b.nextDueDate || ''));
    completed = rules.filter(r => !r.active);
  }
</script>

<div class="recurring">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">Recurring</div>
    <button class="add-btn" onclick={onAdd}>+ Add</button>
  </div>

  <div class="content">
    <div class="section-label">Upcoming</div>
    <div class="rule-list">
      {#each upcoming as rule (rule.id)}
        <button class="rule-row" onclick={() => onEdit(rule.id)}>
          <div class="rule-main">
            <div class="rule-desc">{rule.description || 'Untitled'}</div>
            <div class="rule-meta">{FREQUENCY_LABEL[rule.frequency]} · next {fmtDateShort(rule.nextDueDate)}</div>
          </div>
          <div class="rule-amount" class:income={rule.type === 'income'}>{fmtMoney(rule.amount)}</div>
        </button>
      {:else}
        <div class="empty-state">No upcoming recurring transactions.</div>
      {/each}
    </div>

    {#if completed.length}
      <div class="section-label">Completed</div>
      <div class="rule-list">
        {#each completed as rule (rule.id)}
          <button class="rule-row" onclick={() => onEdit(rule.id)}>
            <div class="rule-main">
              <div class="rule-desc">{rule.description || 'Untitled'}</div>
              <div class="rule-meta">{FREQUENCY_LABEL[rule.frequency]}</div>
            </div>
            <div class="rule-amount" class:income={rule.type === 'income'}>{fmtMoney(rule.amount)}</div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .topbar {
    background: var(--ink); color: var(--paper);
    padding: max(env(safe-area-inset-top), 16px) 20px 16px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .title { font-size: 18px; font-weight: 700; font-family: var(--font-display); }
  .back-btn, .add-btn {
    background: none; border: none; color: var(--paper); font-family: var(--font-body);
    font-size: 14px; font-weight: 600;
  }
  .content { background: var(--paper); min-height: 100vh; padding: 16px 20px 90px; }

  .section-label { font-family: var(--font-body); font-size: 13px; font-weight: 700; color: var(--ink); opacity: .6; margin: 4px 0 8px; }
  .section-label:not(:first-child) { margin-top: 22px; }

  .rule-list { display: flex; flex-direction: column; gap: 8px; }
  .rule-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 13px 16px; border-radius: var(--radius); background: var(--paper-dim); border: none;
    font-family: var(--font-body); text-align: left;
  }
  .rule-main { min-width: 0; }
  .rule-desc { font-size: 14.5px; font-weight: 700; color: var(--ink); }
  .rule-meta { font-size: 12.5px; color: var(--ink); opacity: .6; margin-top: 2px; }
  .rule-amount { font-size: 14.5px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; flex-shrink: 0; margin-left: 10px; }
  .rule-amount.income { color: var(--accent); }

  .empty-state { padding: 24px 0; text-align: center; color: var(--ink); opacity: .5; font-size: 14px; }
</style>
