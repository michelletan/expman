import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import AddAccount from '../src/pages/AddAccount.svelte';
import { createAccount, getAccounts, getAccount } from '../src/lib/data/db.js';
import { resetDB } from './helpers.js';

beforeEach(resetDB);

// specs/accounts.md — Add Account requirements 18-19
describe('AddAccount', () => {
  it('renders empty fields and a disabled Save button in add mode', () => {
    const { getByPlaceholderText, getByText } = render(AddAccount, { accountId: null, onBack: vi.fn(), onSaved: vi.fn() });
    expect(getByPlaceholderText('e.g. Personal Expense')).toHaveValue('');
    expect(getByText('Save')).toBeDisabled();
  });

  it('enables Save once a name is entered, and back/save both work', async () => {
    const onBack = vi.fn();
    const { getByPlaceholderText, getByText } = render(AddAccount, { accountId: null, onBack, onSaved: vi.fn() });

    await fireEvent.click(getByText('‹ Back'));
    expect(onBack).toHaveBeenCalled();

    await fireEvent.input(getByPlaceholderText('e.g. Personal Expense'), { target: { value: 'Travel Fund' } });
    expect(getByText('Save')).not.toBeDisabled();
  });

  it('creates a new account and calls onSaved', async () => {
    const onSaved = vi.fn();
    const { getByPlaceholderText, getByText } = render(AddAccount, { accountId: null, onBack: vi.fn(), onSaved });

    await fireEvent.input(getByPlaceholderText('e.g. Personal Expense'), { target: { value: 'Travel Fund' } });
    await fireEvent.input(getByPlaceholderText('Optional'), { target: { value: 'For trips' } });
    await fireEvent.click(getByText('Save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const accounts = await getAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ name: 'Travel Fund', description: 'For trips' });
  });

  it('pre-fills the form in edit mode and updates the existing account', async () => {
    const existing = await createAccount({ name: 'Old Name', description: 'Old desc', initialBalance: 20 });
    const onSaved = vi.fn();
    const { findByDisplayValue, getByPlaceholderText, getByText } = render(AddAccount, { accountId: existing.id, onBack: vi.fn(), onSaved });

    expect(await findByDisplayValue('Old Name')).toBeInTheDocument();
    expect(getByText('Edit account')).toBeInTheDocument();

    await fireEvent.input(getByPlaceholderText('e.g. Personal Expense'), { target: { value: 'New Name' } });
    await fireEvent.click(getByText('Save'));

    await waitFor(async () => expect((await getAccount(existing.id)).name).toBe('New Name'));
    const updated = await getAccount(existing.id);
    expect(updated.id).toBe(existing.id); // same record, not a new one
    expect(updated.description).toBe('Old desc'); // untouched fields survive
  });
});
