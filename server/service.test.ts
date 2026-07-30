import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ListsService } from './service.js';

function createService() {
  return new ListsService(new Database(':memory:'));
}

describe('ListsService', () => {
  it('creates a todo list with an immutable id and normalized title', () => {
    const service = createService();

    const list = service.createList({ kind: 'todo', title: '  Family plans  ' });

    expect(list).toMatchObject({ kind: 'todo', title: 'Family plans', pinned: false, favorite: false });
    expect(list.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(service.getList(list.id)).toEqual({ ...list, items: [] });
  });

  it('keeps item metadata with its UUID when an item is reordered', () => {
    const service = createService();
    const list = service.createList({ kind: 'todo', title: 'Home' });
    const first = service.createItem(list.id, { text: 'Buy milk', note: '2% only', priority: 'high' });
    const second = service.createItem(list.id, { text: 'Take bins out' });

    service.moveItem(second.id, first.id);

    expect(service.getList(list.id).items).toEqual([
      expect.objectContaining({ id: second.id, text: 'Take bins out' }),
      expect.objectContaining({ id: first.id, text: 'Buy milk', note: '2% only', priority: 'high' }),
    ]);
  });

  it('stores an explicit reminder time for an agenda item', () => {
    const service = createService();
    const agenda = service.createList({ kind: 'agenda', title: 'Family calendar' });

    const item = service.createItem(agenda.id, { text: 'Leave for dentist', reminderAt: '2026-08-03T13:45:00.000Z' });

    expect(service.getList(agenda.id).items).toEqual([expect.objectContaining({ id: item.id, reminderAt: '2026-08-03T13:45:00.000Z' })]);
  });

  it('rejects a list title that becomes empty after normalization', () => {
    const service = createService();

    expect(() => service.createList({ kind: 'todo', title: ' \n ' })).toThrow('title is required');
  });

  it('renames a list and toggles pinned/favorite', () => {
    const service = createService();
    const list = service.createList({ kind: 'todo', title: 'Home' });

    const updated = service.updateList(list.id, { title: 'Household', pinned: true });

    expect(updated).toMatchObject({ id: list.id, title: 'Household', pinned: true, favorite: false });
  });

  it('deletes a list along with its items', () => {
    const service = createService();
    const list = service.createList({ kind: 'todo', title: 'Home' });
    service.createItem(list.id, { text: 'Buy milk' });

    service.deleteList(list.id);

    expect(() => service.getList(list.id)).toThrow('list not found');
  });

  it('deletes a single item', () => {
    const service = createService();
    const list = service.createList({ kind: 'todo', title: 'Home' });
    const item = service.createItem(list.id, { text: 'Buy milk' });

    service.deleteItem(item.id);

    expect(service.getList(list.id).items).toEqual([]);
  });
});
