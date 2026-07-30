import Database from 'better-sqlite3';
import { ListsRepository, type Item, type List, type ListKind } from './repository.js';

type ItemInput = { text: string; note?: string; priority?: 'low' | 'normal' | 'high'; dueDate?: string; snoozedUntil?: string; completed?: boolean; completedAt?: string };

export class ListsService {
  private readonly repository: ListsRepository;

  constructor(database: Database.Database) { this.repository = new ListsRepository(database); }

  createList(input: { title: string; kind: ListKind }): List { return this.repository.createList(input); }

  listLists(): List[] { return this.repository.listLists(); }

  getList(listId: string): List & { items: Item[] } {
    const list = this.repository.listLists().find((candidate) => candidate.id === listId);
    if (!list) throw new Error('list not found');
    return { ...list, items: this.repository.getItems(listId) };
  }

  updateList(listId: string, input: { title?: string; kind?: ListKind; pinned?: boolean; favorite?: boolean }): List {
    return this.repository.updateList(listId, input);
  }

  deleteList(listId: string): void {
    this.repository.deleteList(listId);
  }

  deleteItem(itemId: string): void {
    this.repository.deleteItem(itemId);
  }

  createItem(listId: string, input: ItemInput): Item {
    const item = this.repository.createItem({ listId, text: input.text });
    const priority = input.priority ?? 'normal';
    if (!['low', 'normal', 'high'].includes(priority)) throw new Error('invalid priority');
    const note = input.note?.trim() ?? null;
    if (note && /[\r\n]/.test(note)) throw new Error('note must be a single line');
    const completed = input.completed ?? false;
    this.repository.db.prepare('UPDATE items SET note = ?, priority = ?, due_date = ?, snoozed_until = ?, completed = ?, completed_at = ?, updated_at = ? WHERE id = ?')
      .run(note, priority, input.dueDate ?? null, input.snoozedUntil ?? null, completed ? 1 : 0, completed ? input.completedAt ?? new Date().toISOString() : null, new Date().toISOString(), item.id);
    return this.repository.getItems(listId).find((candidate) => candidate.id === item.id)!;
  }

  updateItem(itemId: string, input: Partial<ItemInput>): Item {
    const existing = this.repository.db.prepare('SELECT list_id AS listId FROM items WHERE id = ?').get(itemId) as { listId: string } | undefined;
    if (!existing) throw new Error('item not found');
    const item = this.repository.getItems(existing.listId).find((candidate) => candidate.id === itemId)!;
    const priority = input.priority ?? item.priority ?? 'normal';
    if (!['low', 'normal', 'high'].includes(priority)) throw new Error('invalid priority');
    const note = input.note === undefined ? item.note : input.note.trim() || null;
    if (note && /[\r\n]/.test(note)) throw new Error('note must be a single line');
    const completed = input.completed ?? item.completed;
    this.repository.db.prepare('UPDATE items SET text = ?, note = ?, priority = ?, due_date = ?, snoozed_until = ?, completed = ?, completed_at = ?, updated_at = ? WHERE id = ?')
      .run(input.text?.trim() || item.text, note, priority, input.dueDate ?? item.dueDate, input.snoozedUntil ?? item.snoozedUntil, completed ? 1 : 0, completed ? item.completedAt ?? new Date().toISOString() : null, new Date().toISOString(), itemId);
    return this.repository.getItems(existing.listId).find((candidate) => candidate.id === itemId)!;
  }

  moveItem(itemId: string, beforeItemId?: string): void {
    this.repository.transaction(() => {
      const item = this.repository.db.prepare('SELECT list_id AS listId FROM items WHERE id = ?').get(itemId) as { listId: string } | undefined;
      if (!item) throw new Error('item not found');
      const items = this.repository.getItems(item.listId).filter((candidate) => candidate.id !== itemId);
      const index = beforeItemId ? items.findIndex((candidate) => candidate.id === beforeItemId) : items.length;
      if (beforeItemId && index < 0) throw new Error('before item not found');
      items.splice(index, 0, this.repository.getItems(item.listId).find((candidate) => candidate.id === itemId)!);
      const update = this.repository.db.prepare('UPDATE items SET position = ?, updated_at = ? WHERE id = ?');
      // Avoid transient UNIQUE(list_id, position) collisions during reorder.
      for (let position = 0; position < items.length; position += 1) update.run(position + 1_000_000, new Date().toISOString(), items[position].id);
      for (let position = 0; position < items.length; position += 1) update.run(position, new Date().toISOString(), items[position].id);
    });
  }
}
