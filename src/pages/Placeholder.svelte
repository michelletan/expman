<script>
  let { title } = $props();
</script>

<div class="placeholder">
  <div class="topbar"><div class="eyebrow">{title}</div></div>
  <div class="content">
    <div class="empty-state">{title} is coming soon.</div>
  </div>
</div>

<style>
  .topbar {
    background: var(--ink); color: var(--paper);
    padding: max(env(safe-area-inset-top), 16px) 20px 16px;
  }
  .eyebrow { font-size: 18px; font-weight: 700; font-family: var(--font-display); }
  .content { background: var(--paper); min-height: 100vh; padding-bottom: 90px; }
  .empty-state { padding: 60px 24px; text-align: center; color: var(--ink); opacity: .5; font-size: 14px; }
</style>
