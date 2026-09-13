import { describe, it, expect, beforeEach } from 'vitest';
import { getAll, getCards, getCard, createCard, updateCard, softDeleteCard } from '../src/lib/data/db.js';
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
  it('updates fields without cascading anywhere (nothing references a card yet)', async () => {
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
