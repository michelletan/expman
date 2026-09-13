import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';
import Accounts from '../src/pages/Accounts.svelte';
import { createAccount, getAccount } from '../src/lib/data/db.js';
import { resetDB } from './helpers.js';

beforeEach(resetDB);

function swipeLeft(row) {
  fireEvent.pointerDown(row, { clientX: 300 });
  return fireEvent.pointerUp(row, { clientX: 200 }); // -100px, past the -40px reveal threshold
}

function tap(row) {
  fireEvent.pointerDown(row, { clientX: 300 });
  return fireEvent.pointerUp(row, { clientX: 302 }); // well under the swipe threshold
}

// specs/accounts.md — Accounts screen requirements 12-17
describe('Accounts', () => {
  it('lists every non-deleted account with name, description, and balance', async () => {
    await createAccount({ name: 'Personal Expense', initialBalance: 100 });
    const deleted = await createAccount({ name: 'Gone', initialBalance: 999 });
    const { softDeleteAccount } = await import('../src/lib/data/db.js');
    await softDeleteAccount(deleted.id);

    const { findByText, queryByText } = render(Accounts, { onBack: vi.fn(), onAdd: vi.fn(), onEdit: vi.fn() });

    expect(await findByText('Personal Expense')).toBeInTheDocument();
    expect(await findByText('$100.00')).toBeInTheDocument();
    expect(queryByText('Gone')).not.toBeInTheDocument();
  });

  it('calls onBack and onAdd from the header controls', async () => {
    const onBack = vi.fn();
    const onAdd = vi.fn();
    const { getByText } = render(Accounts, { onBack, onAdd, onEdit: vi.fn() });

    await fireEvent.click(getByText('‹ Back'));
    await fireEvent.click(getByText('+ Add'));
    expect(onBack).toHaveBeenCalled();
    expect(onAdd).toHaveBeenCalled();
  });

  it('tapping a row (no swipe) calls onEdit with that account id', async () => {
    const account = await createAccount({ name: 'Checking' });
    const onEdit = vi.fn();
    const { findByText } = render(Accounts, { onBack: vi.fn(), onAdd: vi.fn(), onEdit });

    const row = (await findByText('Checking')).closest('button');
    await tap(row);

    expect(onEdit).toHaveBeenCalledWith(account.id);
  });

  it('swiping a row reveals its delete button instead of opening edit', async () => {
    await createAccount({ name: 'Checking' });
    const onEdit = vi.fn();
    const { findByText, getByText } = render(Accounts, { onBack: vi.fn(), onAdd: vi.fn(), onEdit });

    const row = (await findByText('Checking')).closest('button');
    await swipeLeft(row);

    expect(row).toHaveClass('shifted');
    expect(getByText('Delete')).toHaveClass('visible');
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('deleting requires confirmation, and soft-deletes on confirm', async () => {
    const account = await createAccount({ name: 'Checking' });
    const { findByText, getByText } = render(Accounts, { onBack: vi.fn(), onAdd: vi.fn(), onEdit: vi.fn() });

    const row = (await findByText('Checking')).closest('button');
    await swipeLeft(row);
    await fireEvent.click(getByText('Delete'));

    expect(getByText('Delete this account?')).toBeInTheDocument();
    expect((await getAccount(account.id)).isDeleted).toBe(false); // not yet, just confirming

    await fireEvent.click(within(getByText('Delete this account?').closest('.confirm-sheet')).getByText('Delete'));

    await waitFor(async () => expect((await getAccount(account.id)).isDeleted).toBe(true));
  });

  it('cancelling the confirm modal leaves the account untouched', async () => {
    const account = await createAccount({ name: 'Checking' });
    const { findByText, getByText, queryByText } = render(Accounts, { onBack: vi.fn(), onAdd: vi.fn(), onEdit: vi.fn() });

    const row = (await findByText('Checking')).closest('button');
    await swipeLeft(row);
    await fireEvent.click(getByText('Delete'));
    await fireEvent.click(getByText('Cancel'));

    expect(queryByText('Delete this account?')).not.toBeInTheDocument();
    expect((await getAccount(account.id)).isDeleted).toBe(false);
  });
});
