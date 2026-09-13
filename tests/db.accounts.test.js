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
    await createAccount({ name: 'Deleted Account' });
    await createAccount({ name: 'Kept Account' });
    await put('transactions', { id: 't1', account: 'Deleted Account', amount: 50, type: 'expense', date: '2026-09-01', category: 'Food' });
    await put('transactions', { id: 't2', account: 'Kept Account', amount: 20, type: 'expense', date: '2026-09-02', category: 'Food' });

    const [deleted] = await getAccounts().then(all => all.filter(a => a.name === 'Deleted Account'));
    await softDeleteAccount(deleted.id);

    const visible = await getVisibleTransactions();
    expect(visible.map(t => t.id)).toEqual(['t2']);

    const monthTxns = await getTransactionsForMonth('2026-09');
    expect(monthTxns.map(t => t.id)).toEqual(['t2']);
  });

  it('is still fully present, with its transactions, in exportAll()', async () => {
    const deleted = await createAccount({ name: 'Deleted Account' });
    await put('transactions', { id: 't1', account: 'Deleted Account', amount: 50, type: 'expense', date: '2026-09-01', category: 'Food' });
    await softDeleteAccount(deleted.id);

    const backup = await exportAll();
    expect(backup.accounts.find(a => a.id === deleted.id)).toMatchObject({ isDeleted: true });
    expect(backup.transactions.find(t => t.id === 't1')).toBeTruthy();
  });
});

// specs/accounts.md — requirements 20-21 (name-based references, rename cascades)
describe('account references by name', () => {
  it('renaming an account cascades into its transactions automatically', async () => {
    const account = await createAccount({ name: 'Original Name', initialBalance: 100 });
    await put('transactions', { id: 't1', account: 'Original Name', amount: 30, type: 'expense', date: '2026-09-01', category: 'Food' });

    await updateAccount(account.id, { name: 'Renamed' });

    const txn = (await getAll('transactions')).find(t => t.id === 't1');
    expect(txn.account).toBe('Renamed');

    const balance = await getCurrentBalance('Renamed');
    expect(balance).toBe(70); // 100 initial - 30 expense — transaction followed the rename
  });

  it('renaming an account also cascades into recurring rules', async () => {
    const account = await createAccount({ name: 'Original Name' });
    await put('recurring', { id: 'r1', account: 'Original Name', description: 'Rent', amount: 500, type: 'expense' });

    await updateAccount(account.id, { name: 'Renamed' });

    const rule = (await getAll('recurring')).find(r => r.id === 'r1');
    expect(rule.account).toBe('Renamed');
  });
});

// specs/accounts.md — requirement 22 (name uniqueness among active accounts)
describe('account name uniqueness', () => {
  it('rejects creating an account with a name already used by an active account', async () => {
    await createAccount({ name: 'Savings' });
    await expect(createAccount({ name: 'Savings' })).rejects.toThrow(/already exists/);
  });

  it('rejects renaming an account to collide with another active account', async () => {
    await createAccount({ name: 'Savings' });
    const other = await createAccount({ name: 'Checking' });
    await expect(updateAccount(other.id, { name: 'Savings' })).rejects.toThrow(/already exists/);
  });

  it('allows a name that was only used by a soft-deleted account', async () => {
    const original = await createAccount({ name: 'Savings' });
    await softDeleteAccount(original.id);

    const recreated = await createAccount({ name: 'Savings' });
    expect(recreated.name).toBe('Savings');
  });

  it('does not reject updateAccount when the name is unchanged', async () => {
    const account = await createAccount({ name: 'Savings', description: 'old' });
    await expect(updateAccount(account.id, { description: 'new' })).resolves.toBeTruthy();
  });
});

// specs/accounts.md — requirement 23 (naive sum, not anchor-date based)
describe('getCurrentBalance', () => {
  it('equals initialBalance plus every transaction ever, income adds and expense subtracts', async () => {
    await createAccount({ name: 'Checking', initialBalance: 1000 });
    await put('transactions', { id: 't1', account: 'Checking', amount: 200, type: 'expense', date: '2020-01-01', category: 'Food' });
    await put('transactions', { id: 't2', account: 'Checking', amount: 500, type: 'income', date: '2026-09-01', category: 'Income' });

    const balance = await getCurrentBalance('Checking');
    expect(balance).toBe(1000 - 200 + 500);
  });

  it('with no accountName, sums every non-deleted account together', async () => {
    await createAccount({ name: 'A', initialBalance: 100 });
    await createAccount({ name: 'B', initialBalance: 50 });
    const deleted = await createAccount({ name: 'C', initialBalance: 999 });
    await softDeleteAccount(deleted.id);

    const total = await getCurrentBalance();
    expect(total).toBe(150);
  });
});
