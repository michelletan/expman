import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAll, getCards, getCard, createCard, updateCard, softDeleteCard,
  createAccount, createCategory, createTransaction, getCardSpendSummary
} from '../src/lib/data/db.js';
import { resetDB } from './helpers.js';

beforeEach(resetDB);

// specs/cards.md — requirements 8-10, Data model
describe('createCard / getCards', () => {
  it('creates a card with no currency/uniqueness constraints', async () => {
    const a = await createCard({ name: 'POSB', resetDate: 11 });
    const b = await createCard({ name: 'POSB', resetDate: 5 }); // duplicate name allowed
    expect(a.isDeleted).toBe(false);
    expect(a.targetSpend).toEqual([]);
    const active = await getCards();
    expect(new Set(active.map(c => c.id))).toEqual(new Set([a.id, b.id])); // getCards() has no ordering guarantee
  });

  it('stores targetSpend entries by categoryId', async () => {
    const card = await createCard({
      name: 'POSB', resetDate: 11,
      targetSpend: [{ categoryId: 'cat_food', amount: 300 }]
    });
    expect(card.targetSpend).toEqual([{ categoryId: 'cat_food', amount: 300 }]);
  });
});

describe('updateCard / softDeleteCard', () => {
  it('updates fields without cascading anywhere (only paymentMethod on transactions links to a card, and that\'s by id)', async () => {
    const card = await createCard({ name: 'Old Name', resetDate: 11 });
    await updateCard(card.id, { name: 'New Name' });
    const updated = await getCard(card.id);
    expect(updated.name).toBe('New Name');
  });

  it('soft-deletes: excluded from getCards(), row survives in getAll', async () => {
    const keep = await createCard({ name: 'Keep', resetDate: 1 });
    const gone = await createCard({ name: 'Gone', resetDate: 1 });
    await softDeleteCard(gone.id);

    const active = await getCards();
    expect(active.map(c => c.id)).toEqual([keep.id]);

    const everything = await getAll('cards');
    expect(everything).toHaveLength(2);
    expect(everything.find(c => c.id === gone.id).isDeleted).toBe(true);
  });
});

// Linked via transactions.paymentMethod (a card's id), not a separate
// cardId field — see db.js's cards section header comment.
describe('getCardSpendSummary', () => {
  it('sums only expense transactions paid on this card, within the given period', async () => {
    const account = await createAccount({ name: 'Checking' });
    const card = await createCard({ name: 'POSB', resetDate: 1 });
    const food = await createCategory({ name: 'Food', type: 'expense' });
    const period = { start: '2026-03-01', end: '2026-03-31' };

    await createTransaction({ accountId: account.id, amount: 40, type: 'expense', categoryId: food.id, paymentMethod: card.id, date: '2026-03-05' });
    await createTransaction({ accountId: account.id, amount: 15, type: 'expense', paymentMethod: card.id, date: '2026-03-10' }); // uncategorised
    await createTransaction({ accountId: account.id, amount: 999, type: 'expense', paymentMethod: card.id, date: '2026-02-28' }); // outside period
    await createTransaction({ accountId: account.id, amount: 999, type: 'expense', paymentMethod: 'cash', date: '2026-03-05' }); // different payment method
    await createTransaction({ accountId: account.id, amount: 999, type: 'income', paymentMethod: null, date: '2026-03-05' }); // income, not spend

    const summary = await getCardSpendSummary(card.id, period);

    expect(summary.total).toBe(55);
    expect(summary.byCategory).toEqual({ [food.id]: 40 });
  });

  it('returns zero spend for a card with no matching transactions', async () => {
    const card = await createCard({ name: 'POSB', resetDate: 1 });
    const summary = await getCardSpendSummary(card.id, { start: '2026-03-01', end: '2026-03-31' });
    expect(summary.total).toBe(0);
    expect(summary.byCategory).toEqual({});
  });
});
