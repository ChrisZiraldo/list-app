import { describe, expect, it } from 'vitest';
import { ListsRepository } from './repository.js';

describe('ListsRepository', () => {
  it('creates schema and assigns immutable UUIDs to list and items', () => {
    const repository = new ListsRepository(':memory:');
    const list = repository.createList({ title: 'Groceries', kind: 'shopping' });
    const item = repository.createItem({ listId: list.id, text: 'Milk' });

    expect(list.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(item.listId).toBe(list.id);
  });

  it('returns items in stable position order', () => {
    const repository = new ListsRepository(':memory:');
    const list = repository.createList({ title: 'Today', kind: 'todo' });
    repository.createItem({ listId: list.id, text: 'First' });
    repository.createItem({ listId: list.id, text: 'Second' });

    expect(repository.getItems(list.id).map((item) => item.text)).toEqual(['First', 'Second']);
  });

  it('rejects invalid list titles without writing a list', () => {
    const repository = new ListsRepository(':memory:');

    expect(() => repository.createList({ title: '   ', kind: 'todo' })).toThrow('title');
    expect(repository.listLists()).toEqual([]);
  });

  it('rolls back a failed transaction', () => {
    const repository = new ListsRepository(':memory:');
    expect(() =>
      repository.transaction(() => {
      repository.createList({ title: 'Temporary', kind: 'todo' });
      throw new Error('stop');
      }),
    ).toThrow('stop');
    expect(repository.listLists()).toEqual([]);
  });

  it('updates a list title, kind, pinned, and favorite', () => {
    const repository = new ListsRepository(':memory:');
    const list = repository.createList({ title: 'Groceries', kind: 'shopping' });

    const updated = repository.updateList(list.id, { title: 'Weekly groceries', kind: 'todo', pinned: true, favorite: true });

    expect(updated).toMatchObject({ id: list.id, title: 'Weekly groceries', kind: 'todo', pinned: true, favorite: true });
    expect(() => repository.updateList(list.id, { kind: 'bogus' as never })).toThrow('invalid list kind');
    expect(() => repository.updateList('missing', { title: 'x' })).toThrow('list not found');
  });

  it('deletes a list and cascades to its items', () => {
    const repository = new ListsRepository(':memory:');
    const list = repository.createList({ title: 'Groceries', kind: 'shopping' });
    repository.createItem({ listId: list.id, text: 'Milk' });

    repository.deleteList(list.id);

    expect(repository.listLists()).toEqual([]);
    expect(() => repository.deleteList(list.id)).toThrow('list not found');
  });

  it('deletes an item', () => {
    const repository = new ListsRepository(':memory:');
    const list = repository.createList({ title: 'Today', kind: 'todo' });
    const item = repository.createItem({ listId: list.id, text: 'Call Mum' });

    repository.deleteItem(item.id);

    expect(repository.getItems(list.id)).toEqual([]);
    expect(() => repository.deleteItem(item.id)).toThrow('item not found');
  });
});
