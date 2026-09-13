import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAll, put, exportAll,
  getAccounts, getAccount, createAccount, updateAccount, softDeleteAccount,
  ensureDefaultAccount, getVisibleTransactions, getCurrentBalance, getTransactionsForMonth
} from '../src/lib/data/db.js';
import { resetDB } from './helpers.js';

beforeEach(resetDB);

// specs/accounts.md — "First boot" (requirement 1)
describe('ensureDefaultAccount', () => {
  it('creates a single "Personal Expense" account when the store is empty', async () => {
    await ensureDefaultAccount();
    const accounts = await getAll('accounts');
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ name: 'Personal Expense', initialBalance: 0, description: '', isDeleted: false });
  });

  it('does not create a second default account if one already exists', async () => {
    await ensureDefaultAccount();
    await ensureDefaultAccount();
    const accounts = await getAll('accounts');
    expect(accounts).toHaveLength(1);
  });

  it('does not recreate a default after every account has been soft-deleted', async () => {
    await ensureDefaultAccount();
    const [only] = await getAll('accounts');
    await softDeleteAccount(only.id);

    await ensureDefaultAccount();

    const accounts = await getAll('accounts');
    expect(accounts).toHaveLength(1); // still just the soft-deleted one, not a fresh second default
    expect(accounts[0].isDeleted).toBe(true);
  });
});

// specs/accounts.md — Data model (currency/type dropped)
describe('createAccount', () => {
  it('creates an account without currency or type fields', async () => {
    const account = await createAccount({ name: 'Savings', description: 'Emergency fund', initialBalance: 500 });
    expect(account).not.toHaveProperty('currency');
    expect(account).not.toHaveProperty('type');
    expect(account).toMatchObject({ name: 'Savings', description: 'Emergency fund', initialBalance: 500, isDeleted: false });
    expect(account.id).toBeTruthy();
    expect(account.dateCreated).toBeTruthy();
  });

  it('defaults description and initialBalance when omitted', async () => {
    const account = await createAccount({ name: 'Cash' });
    expect(account.description).toBe('');
    expect(account.initialBalance).toBe(0);
  });

  it('allows two accounts to share the same name', async () => {
    await createAccount({ name: 'Savings' });
    const second = await createAccount({ name: 'Savings' });
    expect(second.name).toBe('Savings');
    expect(await getAccounts()).toHaveLength(2);
  });
});

// specs/accounts.md — requirement 17 (soft delete)
describe('softDeleteAccount', () => {
  it('sets isDeleted instead of removing the row', async () => {
    const account = await createAccount({ name: 'Old Account' });
    await softDeleteAccount(account.id);

    const stillThere = await getAccount(account.id);
    expect(stillThere).toBeTruthy();
    expect(stillThere.isDeleted).toBe(true);
    expect(stillThere.name).toBe('Old Account'); // nothing else about the row changes
  });

  it('is excluded from getAccounts() but not from getAll("accounts")', async () => {
    const keep = await createAccount({ name: 'Keep' });
    const gone = await createAccount({ name: 'Gone' });
    await softDeleteAccount(gone.id);

    const active = await getAccounts();
    expect(active.map(a => a.id)).toEqual([keep.id]);

    const everything = await getAll('accounts');
    expect(everything).toHaveLength(2);
  });

  it("hides the deleted account's transactions from every view-facing read", async () => {
    const deleted = await createAccount({ name: 'Deleted Account' });
    const kept = await createAccount({ name: 'Kept Account' });
    await put('transactions', { id: 't1', accountId: deleted.id, amount: 50, type: 'expense', date: '2026-09-01', category: 'Food' });
    await put('transactions', { id: 't2', accountId: kept.id, amount: 20, type: 'expense', date: '2026-09-02', category: 'Food' });

    await softDeleteAccount(deleted.id);

    const visible = await getVisibleTransactions();
    expect(visible.map(t => t.id)).toEqual(['t2']);

    const monthTxns = await getTransactionsForMonth('2026-09');
    expect(monthTxns.map(t => t.id)).toEqual(['t2']);
  });

  it('is still fully present, with its transactions, in exportAll()', async () => {
    const deleted = await createAccount({ name: 'Deleted Account' });
    await put('transactions', { id: 't1', accountId: deleted.id, amount: 50, type: 'expense', date: '2026-09-01', category: 'Food' });
    await softDeleteAccount(deleted.id);

    const backup = await exportAll();
    expect(backup.accounts.find(a => a.id === deleted.id)).toMatchObject({ isDeleted: true });
    expect(backup.transactions.find(t => t.id === 't1')).toBeTruthy();
  });
});

// specs/accounts.md — requirements 20-21 (id-based references, resolved live)
describe('account references by id', () => {
  it('renaming an account is a single-row update — the transaction still resolves via id', async () => {
    const account = await createAccount({ name: 'Original Name', initialBalance: 100 });
    await put('transactions', { id: 't1', accountId: account.id, amount: 30, type: 'expense', date: '2026-09-01', category: 'Food' });

    await updateAccount(account.id, { name: 'Renamed' });

    const txn = (await getAll('transactions')).find(t => t.id === 't1');
    expect(txn.accountId).toBe(account.id); // untouched — the link never needed to change
    const renamed = await getAccount(account.id);
    expect(renamed.name).toBe('Renamed');

    const balance = await getCurrentBalance(account.id);
    expect(balance).toBe(70); // 100 initial - 30 expense — still resolves after rename
  });
});

// specs/accounts.md — requirement 23 (naive sum, not anchor-date based)
describe('getCurrentBalance', () => {
  it('equals initialBalance plus every transaction ever, income adds and expense subtracts', async () => {
    const account = await createAccount({ name: 'Checking', initialBalance: 1000 });
    await put('transactions', { id: 't1', accountId: account.id, amount: 200, type: 'expense', date: '2020-01-01', category: 'Food' });
    await put('transactions', { id: 't2', accountId: account.id, amount: 500, type: 'income', date: '2026-09-01', category: 'Income' });

    const balance = await getCurrentBalance(account.id);
    expect(balance).toBe(1000 - 200 + 500);
  });

  it('with no accountId, sums every non-deleted account together', async () => {
    const a = await createAccount({ name: 'A', initialBalance: 100 });
    const b = await createAccount({ name: 'B', initialBalance: 50 });
    const deleted = await createAccount({ name: 'C', initialBalance: 999 });
    await softDeleteAccount(deleted.id);

    const total = await getCurrentBalance();
    expect(total).toBe(150);
  });
});
