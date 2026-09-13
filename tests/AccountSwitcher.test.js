import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import AccountSwitcher from '../src/lib/components/AccountSwitcher.svelte';

const accounts = [
  { id: 'a1', name: 'Personal Expense' },
  { id: 'a2', name: 'Loans' },
  { id: 'a3', name: 'Savings' }
];

// specs/accounts.md — Home requirements 6-7 (switcher modal)
describe('AccountSwitcher', () => {
  it('lists every account passed in', () => {
    const { getByText } = render(AccountSwitcher, { accounts, current: 'a1', onSelect: vi.fn(), onClose: vi.fn() });
    for (const a of accounts) expect(getByText(a.name)).toBeInTheDocument();
  });

  it('highlights the current account', () => {
    const { getByText } = render(AccountSwitcher, { accounts, current: 'a2', onSelect: vi.fn(), onClose: vi.fn() });
    expect(getByText('Loans')).toHaveClass('active');
    expect(getByText('Personal Expense')).not.toHaveClass('active');
  });

  it('calls onSelect with the tapped account id', async () => {
    const onSelect = vi.fn();
    const { getByText } = render(AccountSwitcher, { accounts, current: 'a1', onSelect, onClose: vi.fn() });
    await fireEvent.click(getByText('Savings'));
    expect(onSelect).toHaveBeenCalledWith('a3');
  });

  it('calls onClose when the backdrop is clicked, but not when the sheet itself is', async () => {
    const onClose = vi.fn();
    const { container, getByText } = render(AccountSwitcher, { accounts, current: 'a1', onSelect: vi.fn(), onClose });
    await fireEvent.click(getByText('Switch account')); // inside the sheet
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent.click(container.querySelector('.backdrop'));
    expect(onClose).toHaveBeenCalled();
  });
});
