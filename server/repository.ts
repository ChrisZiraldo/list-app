import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export type ListKind = 'todo' | 'shopping' | 'agenda';
export interface List { id: string; title: string; kind: ListKind; pinned: boolean; favorite: boolean; createdAt: string; updatedAt: string }
export interface Item { id: string; listId: string; text: string; position: number; completed: boolean; done: boolean; completedAt: string | null; priority: string | null; dueDate: string | null; snoozedUntil: string | null; note: string | null; createdAt: string; updatedAt: string }

const kinds = new Set<ListKind>(['todo', 'shopping', 'agenda']);
function now() { return new Date().toISOString(); }
function validTitle(title: string) {
  const normalized = title.trim();
  if (!normalized || normalized.length > 200 || /[\r\n]/.test(normalized)) throw new Error('title is required and must be a single line');
  return normalized;
}

export class ListsRepository {
  readonly db: Database.Database;

  constructor(filename: string | Database.Database) {
    this.db = typeof filename === 'string' ? new Database(filename) : filename;
    this.db.pragma('foreign_keys = ON');
    this.createSchema();
  }

  private createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('todo','shopping','agenda')),
        pinned INTEGER NOT NULL DEFAULT 0, favorite INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        text TEXT NOT NULL, position INTEGER NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT, priority TEXT, due_date TEXT, snoozed_until TEXT, note TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(list_id, position)
      );
      CREATE INDEX IF NOT EXISTS items_list_position ON items(list_id, position);
    `);
  }

  transaction<T>(operation: () => T): T { return this.db.transaction(operation)(); }

  createList(input: { title: string; kind: ListKind }): List {
    const title = validTitle(input.title);
    if (!kinds.has(input.kind)) throw new Error('invalid list kind');
    const timestamp = now();
    const list: List = { id: randomUUID(), title, kind: input.kind, pinned: false, favorite: false, createdAt: timestamp, updatedAt: timestamp };
    this.db.prepare('INSERT INTO lists (id,title,kind,pinned,favorite,created_at,updated_at) VALUES (@id,@title,@kind,@pinned,@favorite,@createdAt,@updatedAt)').run({ ...list, pinned: 0, favorite: 0 });
    return list;
  }

  listLists(): List[] { return (this.db.prepare('SELECT id,title,kind,CAST(pinned AS INTEGER) AS pinned,CAST(favorite AS INTEGER) AS favorite,created_at AS createdAt,updated_at AS updatedAt FROM lists ORDER BY created_at, id').all() as ListRow[]).map(toList); }

  updateList(listId: string, input: { title?: string; kind?: ListKind; pinned?: boolean; favorite?: boolean }): List {
    const current = this.listLists().find((list) => list.id === listId);
    if (!current) throw new Error('list not found');
    if (input.kind !== undefined && !kinds.has(input.kind)) throw new Error('invalid list kind');
    const title = input.title !== undefined ? validTitle(input.title) : current.title;
    const kind = input.kind ?? current.kind;
    const pinned = input.pinned ?? current.pinned;
    const favorite = input.favorite ?? current.favorite;
    this.db.prepare('UPDATE lists SET title = ?, kind = ?, pinned = ?, favorite = ?, updated_at = ? WHERE id = ?')
      .run(title, kind, pinned ? 1 : 0, favorite ? 1 : 0, now(), listId);
    return this.listLists().find((list) => list.id === listId)!;
  }

  deleteList(listId: string): void {
    const result = this.db.prepare('DELETE FROM lists WHERE id = ?').run(listId);
    if (result.changes === 0) throw new Error('list not found');
  }

  createItem(input: { listId: string; text: string }): Item {
    const text = validTitle(input.text);
    if (!this.db.prepare('SELECT 1 FROM lists WHERE id = ?').get(input.listId)) throw new Error('list not found');
    const position = (this.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM items WHERE list_id = ?').get(input.listId) as { position: number }).position;
    const timestamp = now();
    const item: Item = { id: randomUUID(), listId: input.listId, text, position, completed: false, done: false, completedAt: null, priority: null, dueDate: null, snoozedUntil: null, note: null, createdAt: timestamp, updatedAt: timestamp };
    this.db.prepare('INSERT INTO items (id,list_id,text,position,completed,completed_at,priority,due_date,snoozed_until,note,created_at,updated_at) VALUES (@id,@listId,@text,@position,@completed,@completedAt,@priority,@dueDate,@snoozedUntil,@note,@createdAt,@updatedAt)').run({ ...item, completed: 0 });
    return item;
  }

  getItems(listId: string): Item[] { return (this.db.prepare('SELECT id,list_id AS listId,text,position,CAST(completed AS INTEGER) AS completed,completed_at AS completedAt,priority,due_date AS dueDate,snoozed_until AS snoozedUntil,note,created_at AS createdAt,updated_at AS updatedAt FROM items WHERE list_id = ? ORDER BY position').all(listId) as ItemRow[]).map(toItem); }

  deleteItem(itemId: string): void {
    const result = this.db.prepare('DELETE FROM items WHERE id = ?').run(itemId);
    if (result.changes === 0) throw new Error('item not found');
  }
}
type ListRow = Omit<List, 'pinned' | 'favorite'> & { pinned: number; favorite: number };
type ItemRow = Omit<Item, 'completed' | 'done'> & { completed: number };

function toList(row: ListRow): List { return { ...row, pinned: Boolean(row.pinned), favorite: Boolean(row.favorite) }; }
function toItem(row: ItemRow): Item { const completed = Boolean(row.completed); return { ...row, completed, done: completed }; }
