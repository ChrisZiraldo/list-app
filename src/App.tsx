import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';

type ListKind = 'todo' | 'shopping' | 'agenda';
type Priority = 'low' | 'normal' | 'high';
type SortMode = 'manual' | 'priority' | 'dueDate';

type List = { id: string; title: string; kind: ListKind; pinned: boolean; favorite: boolean };
type Item = {
  id: string;
  text: string;
  completed: boolean;
  note: string | null;
  priority: Priority | null;
  dueDate: string | null;
  reminderAt: string | null;
  position: number;
};
type ListDetail = List & { items: Item[] };

const KIND_LABELS: Record<ListKind, string> = { todo: 'Todo', shopping: 'Shopping', agenda: 'Agenda' };
const KINDS = Object.keys(KIND_LABELS) as ListKind[];
const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };
const PRIORITY_LABELS: Record<Priority, string> = { high: 'High priority', normal: 'Normal priority', low: 'Low priority' };

function apiPath(path: string) {
  return `${import.meta.env.BASE_URL}api${path}`;
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (response.status === 204) return undefined as T;
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await response.json() : undefined;
  if (!response.ok) throw new Error((body && typeof body === 'object' && 'error' in body ? String(body.error) : undefined) ?? 'Request failed');
  return body as T;
}

function sortItems(items: Item[], mode: SortMode): Item[] {
  if (mode === 'manual') return [...items].sort((a, b) => a.position - b.position);
  if (mode === 'priority')
    return [...items].sort((a, b) => PRIORITY_RANK[a.priority ?? 'normal'] - PRIORITY_RANK[b.priority ?? 'normal'] || a.position - b.position);
  return [...items].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return a.position - b.position;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate) || a.position - b.position;
  });
}

function neighborForMove(manualOrder: Item[], itemId: string, direction: 'up' | 'down'): { beforeItemId?: string } | null {
  const index = manualOrder.findIndex((item) => item.id === itemId);
  if (index === -1) return null;
  if (direction === 'up') {
    if (index === 0) return null;
    return { beforeItemId: manualOrder[index - 1].id };
  }
  if (index >= manualOrder.length - 1) return null;
  const targetIndex = index + 2;
  return { beforeItemId: targetIndex < manualOrder.length ? manualOrder[targetIndex].id : undefined };
}

function isOverdue(dueDate: string | null, completed: boolean): boolean {
  if (!dueDate || completed) return false;
  const todayIso = new Date().toISOString().slice(0, 10);
  return dueDate < todayIso;
}

function formatDueDate(dueDate: string): string {
  const [year, month, day] = dueDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toReminderIso(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function formatReminderTime(reminderAt: string): string {
  return new Date(reminderAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function PlusIcon() {
  return (
    <span className="qa-icon" aria-hidden="true">
      <svg className="qa-icon-glyph" viewBox="0 0 16 16">
        <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function App() {
  const [lists, setLists] = useState<List[]>([]);
  const [selected, setSelected] = useState<ListDetail | null>(null);
  const [newListName, setNewListName] = useState('');
  const [newListKind, setNewListKind] = useState<ListKind>('todo');
  const [newItemText, setNewItemText] = useState('');
  const [newItemPriority, setNewItemPriority] = useState<Priority>('normal');
  const [newItemDueDate, setNewItemDueDate] = useState('');
  const [newItemReminderAt, setNewItemReminderAt] = useState('');
  const [newItemNote, setNewItemNote] = useState('');
  const [showItemDetails, setShowItemDetails] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('manual');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState<{ text: string; note: string; priority: Priority; dueDate: string; reminderAt: string }>({
    text: '',
    note: '',
    priority: 'normal',
    dueDate: '',
    reminderAt: '',
  });
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  async function withPending<T>(key: string, action: () => Promise<T>): Promise<T | undefined> {
    setPending((current) => new Set(current).add(key));
    try {
      return await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
      return undefined;
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  function reloadLists() {
    return withPending('lists', () => requestJson<List[]>(apiPath('/lists')).then(setLists));
  }

  function reloadSelected(listId: string) {
    return withPending('list-detail', () => requestJson<ListDetail>(apiPath(`/lists/${listId}`)).then(setSelected));
  }

  useEffect(() => {
    reloadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const orderedLists = useMemo(() => [...lists].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.favorite) - Number(a.favorite)), [lists]);
  const manualOrder = useMemo(() => (selected ? sortItems(selected.items, 'manual') : []), [selected]);
  const visibleItems = useMemo(() => (selected ? sortItems(selected.items, sortMode) : []), [selected, sortMode]);
  const completedCount = selected?.items.filter((item) => item.completed).length ?? 0;

  async function createList(event: FormEvent) {
    event.preventDefault();
    if (!newListName.trim()) return;
    const list = await withPending('create-list', () =>
      requestJson<List>(apiPath('/lists'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newListName, kind: newListKind }),
      }),
    );
    if (!list) return;
    setLists((current) => [...current, list]);
    setNewListName('');
    setNewListKind('todo');
    setSelected({ ...list, items: [] });
  }

  async function openList(list: List) {
    setSortMode('manual');
    setEditingItemId(null);
    setEditingTitle(false);
    setMenuOpen(false);
    await reloadSelected(list.id);
  }

  async function renameList() {
    if (!selected) return;
    const title = titleDraft.trim();
    if (!title || title === selected.title) return setEditingTitle(false);
    const updated = await withPending('rename-list', () =>
      requestJson<List>(apiPath(`/lists/${selected.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }),
    );
    if (!updated) return;
    setSelected((current) => (current ? { ...current, title: updated.title } : current));
    setLists((current) => current.map((list) => (list.id === updated.id ? { ...list, title: updated.title } : list)));
    setEditingTitle(false);
  }

  async function changeKind(kind: ListKind) {
    if (!selected) return;
    const updated = await withPending('change-kind', () =>
      requestJson<List>(apiPath(`/lists/${selected.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) }),
    );
    if (!updated) return;
    setSelected((current) => (current ? { ...current, kind: updated.kind } : current));
    setLists((current) => current.map((list) => (list.id === updated.id ? { ...list, kind: updated.kind } : list)));
  }

  async function toggleListFlag(flag: 'pinned' | 'favorite') {
    if (!selected) return;
    const updated = await withPending(`toggle-${flag}`, () =>
      requestJson<List>(apiPath(`/lists/${selected.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [flag]: !selected[flag] }),
      }),
    );
    if (!updated) return;
    setSelected((current) => (current ? { ...current, [flag]: updated[flag] } : current));
    setLists((current) => current.map((list) => (list.id === updated.id ? { ...list, [flag]: updated[flag] } : list)));
  }

  async function deleteList() {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.title}" and all its items? This cannot be undone.`)) return;
    const listId = selected.id;
    const ok = await withPending('delete-list', async () => {
      await requestJson(apiPath(`/lists/${listId}`), { method: 'DELETE' });
      return true;
    });
    if (!ok) return;
    setLists((current) => current.filter((list) => list.id !== listId));
    setSelected(null);
  }

  async function createItem(event: FormEvent) {
    event.preventDefault();
    if (!selected || !newItemText.trim()) return;
    const item = await withPending('create-item', () =>
      requestJson<Item>(apiPath(`/lists/${selected.id}/items`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newItemText,
          priority: newItemPriority,
          dueDate: newItemDueDate || undefined,
          reminderAt: selected.kind === 'agenda' ? toReminderIso(newItemReminderAt) : undefined,
          note: newItemNote || undefined,
        }),
      }),
    );
    if (!item) return;
    setSelected((current) => (current ? { ...current, items: [...current.items, item] } : current));
    setNewItemText('');
    setNewItemPriority('normal');
    setNewItemDueDate('');
    setNewItemReminderAt('');
    setNewItemNote('');
  }

  async function toggleItem(item: Item) {
    const updated = await withPending(`item:${item.id}`, () =>
      requestJson<Item>(apiPath(`/items/${item.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !item.completed }),
      }),
    );
    if (!updated) return;
    setSelected((current) =>
      current ? { ...current, items: current.items.map((candidate) => (candidate.id === updated.id ? updated : candidate)) } : current,
    );
  }

  function startEditItem(item: Item) {
    setEditingItemId(item.id);
    setItemDraft({
      text: item.text,
      note: item.note ?? '',
      priority: item.priority ?? 'normal',
      dueDate: item.dueDate ?? '',
      reminderAt: item.reminderAt ? item.reminderAt.slice(0, 16) : '',
    });
  }

  async function saveItemEdit(itemId: string) {
    const updated = await withPending(`item:${itemId}`, () =>
      requestJson<Item>(apiPath(`/items/${itemId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: itemDraft.text,
          note: itemDraft.note || null,
          priority: itemDraft.priority,
          dueDate: itemDraft.dueDate || null,
          reminderAt: selected?.kind === 'agenda' ? (toReminderIso(itemDraft.reminderAt) ?? null) : null,
        }),
      }),
    );
    if (!updated) return;
    setSelected((current) =>
      current ? { ...current, items: current.items.map((candidate) => (candidate.id === updated.id ? updated : candidate)) } : current,
    );
    setEditingItemId(null);
  }

  async function deleteItem(item: Item) {
    if (!selected) return;
    const ok = await withPending(`item:${item.id}`, async () => {
      await requestJson(apiPath(`/items/${item.id}`), { method: 'DELETE' });
      return true;
    });
    if (!ok) return;
    setSelected((current) => (current ? { ...current, items: current.items.filter((candidate) => candidate.id !== item.id) } : current));
  }

  async function moveItem(item: Item, direction: 'up' | 'down') {
    const move = neighborForMove(manualOrder, item.id, direction);
    if (!move) return;
    const ok = await withPending(`item:${item.id}`, async () => {
      await requestJson(apiPath(`/items/${item.id}/move`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(move) });
      return true;
    });
    if (!ok || !selected) return;
    await reloadSelected(selected.id);
  }

  return (
    <main className="app-shell">
      <header className="app-top">
        <p className="eyebrow">Lists</p>
        <h1>Your lists</h1>
      </header>
      {error && (
        <p role="alert" className="error" onClick={() => setError('')}>
          {error}
        </p>
      )}

      <div className="layout">
        <div className="sidebar">
          <form className="quickadd new-list-form" onSubmit={createList}>
            <PlusIcon />
            <label htmlFor="new-list" className="sr-only">
              New list name
            </label>
            <input id="new-list" value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="New list…" />
            <select aria-label="New list kind" className="kind-select" value={newListKind} onChange={(event) => setNewListKind(event.target.value as ListKind)}>
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            <button type="submit" disabled={pending.has('create-list')}>
              {pending.has('create-list') ? 'Creating…' : 'Create list'}
            </button>
          </form>

          <nav aria-label="Lists" className="shelf">
            {orderedLists.map((list) => (
              <button className={`tile kind-${list.kind}` + (selected?.id === list.id ? ' active' : '')} key={list.id} onClick={() => openList(list)}>
                <span className="tile-dot" aria-hidden="true" />
                <span className="tile-name">{list.title}</span>
                <span className="tile-foot">
                  {list.pinned && (
                    <span className="tile-flag" title="Pinned">
                      📌
                    </span>
                  )}
                  {list.favorite && (
                    <span className="tile-flag" title="Favorite">
                      ★
                    </span>
                  )}
                  <span className="tile-kind">{KIND_LABELS[list.kind]}</span>
                </span>
              </button>
            ))}
          </nav>
        </div>

        <div className="main">
          {!selected && (
            <div className="empty-state">
              <p>Select a list, or create a new one, to see its items.</p>
            </div>
          )}
          {selected && (
            <section className="sheet" aria-labelledby="list-title">
              <div className="sheet-head">
                <div className="title-row">
                  <span className={`kind-dot kind-${selected.kind}`} aria-hidden="true" />
                  {editingTitle ? (
                    <input
                      aria-label="List title"
                      autoFocus
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onBlur={renameList}
                      onKeyDown={(event) => event.key === 'Enter' && renameList()}
                    />
                  ) : (
                    <h2
                      id="list-title"
                      onClick={() => {
                        setTitleDraft(selected.title);
                        setEditingTitle(true);
                      }}
                    >
                      {selected.title}
                    </h2>
                  )}
                </div>
                <span className="progress" aria-label={`${completedCount} of ${selected.items.length} done`}>
                  {completedCount}/{selected.items.length}
                </span>
                <div className="menu-wrap" ref={menuRef}>
                  <button type="button" className="kebab" aria-label="List actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
                    ⋯
                  </button>
                  {menuOpen && (
                    <div className="menu" role="menu">
                      <span className="menu-label">Kind</span>
                      <div className="kind-swatches">
                        {KINDS.map((kind) => (
                          <button
                            type="button"
                            key={kind}
                            className={`kind-${kind}` + (selected.kind === kind ? ' active' : '')}
                            onClick={() => changeKind(kind)}
                          >
                            {KIND_LABELS[kind]}
                          </button>
                        ))}
                      </div>
                      <hr />
                      <button type="button" onClick={() => toggleListFlag('pinned')}>
                        {selected.pinned ? '📌 Pinned' : 'Pin list'}
                      </button>
                      <button type="button" onClick={() => toggleListFlag('favorite')}>
                        {selected.favorite ? '★ Favorited' : 'Favorite'}
                      </button>
                      <hr />
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          setMenuOpen(false);
                          deleteList();
                        }}
                      >
                        Delete list
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="segmented" role="group" aria-label="Sort items">
                <button type="button" className={sortMode === 'manual' ? 'active' : ''} onClick={() => setSortMode('manual')}>
                  Manual
                </button>
                <button type="button" className={sortMode === 'priority' ? 'active' : ''} onClick={() => setSortMode('priority')}>
                  Priority
                </button>
                <button type="button" className={sortMode === 'dueDate' ? 'active' : ''} onClick={() => setSortMode('dueDate')}>
                  Due date
                </button>
              </div>

              <ul className="items">
                {visibleItems.map((item) => (
                  <li key={item.id} className={'item' + (item.completed ? ' done' : '')}>
                    {editingItemId === item.id ? (
                      <div className="item-edit">
                        <input
                          aria-label="Item text"
                          value={itemDraft.text}
                          onChange={(event) => setItemDraft((draft) => ({ ...draft, text: event.target.value }))}
                        />
                        <select
                          aria-label="Item priority"
                          value={itemDraft.priority}
                          onChange={(event) => setItemDraft((draft) => ({ ...draft, priority: event.target.value as Priority }))}
                        >
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                        </select>
                        <input
                          aria-label="Item due date"
                          type="date"
                          value={itemDraft.dueDate}
                          onChange={(event) => setItemDraft((draft) => ({ ...draft, dueDate: event.target.value }))}
                        />
                        <input
                          aria-label="Item note"
                          value={itemDraft.note}
                          onChange={(event) => setItemDraft((draft) => ({ ...draft, note: event.target.value }))}
                          placeholder="Note"
                        />
                        <button type="button" onClick={() => saveItemEdit(item.id)}>
                          Save
                        </button>
                        <button type="button" className="link" onClick={() => setEditingItemId(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          type="checkbox"
                          className="check"
                          checked={item.completed}
                          onChange={() => toggleItem(item)}
                          disabled={pending.has(`item:${item.id}`)}
                          aria-label={item.completed ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
                        />
                        <div className="item-body">
                          <div className="item-main">
                            <span className="item-text" onClick={() => toggleItem(item)}>
                              {item.text}
                            </span>
                            {item.priority && item.priority !== 'normal' && (
                              <span
                                className={`pdot priority-${item.priority}`}
                                title={PRIORITY_LABELS[item.priority]}
                                aria-label={PRIORITY_LABELS[item.priority]}
                              />
                            )}
                          </div>
                          {(item.dueDate || item.reminderAt || item.note) && (
                            <div className="meta">
                              {item.dueDate && (
                                <span className={'due' + (isOverdue(item.dueDate, item.completed) ? ' overdue' : '')}>
                                  {isOverdue(item.dueDate, item.completed) ? 'Overdue · ' : 'Due '}
                                  {formatDueDate(item.dueDate)}
                                </span>
                              )}
                              {item.reminderAt && <span className="due">Reminder {formatReminderTime(item.reminderAt)}</span>}
                              {item.note && <span className="note">{item.note}</span>}
                            </div>
                          )}
                        </div>
                        <div className="item-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label="Move up"
                            disabled={sortMode !== 'manual' || pending.has(`item:${item.id}`)}
                            onClick={() => moveItem(item, 'up')}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label="Move down"
                            disabled={sortMode !== 'manual' || pending.has(`item:${item.id}`)}
                            onClick={() => moveItem(item, 'down')}
                          >
                            ↓
                          </button>
                          <button type="button" className="icon-btn" aria-label="Edit" onClick={() => startEditItem(item)}>
                            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                              <path
                                d="M11.3 1.7a1.5 1.5 0 0 1 2.1 0l.9.9a1.5 1.5 0 0 1 0 2.1l-7.8 7.8-3.4.9.9-3.4Z"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.3"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <button type="button" className="icon-btn danger" aria-label="Delete" onClick={() => deleteItem(item)}>
                            ✕
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              <form className="quickadd item-quickadd" onSubmit={createItem}>
                <PlusIcon />
                <label htmlFor="new-item" className="sr-only">
                  Add an item
                </label>
                <input id="new-item" value={newItemText} onChange={(event) => setNewItemText(event.target.value)} placeholder="Add an item…" />
                <button type="button" className="link" onClick={() => setShowItemDetails((current) => !current)}>
                  {showItemDetails ? 'Fewer details' : 'More details'}
                </button>
                <button type="submit" disabled={pending.has('create-item')}>
                  {pending.has('create-item') ? 'Adding…' : 'Add item'}
                </button>
                {showItemDetails && (
                  <div className="item-details">
                    <label>
                      Priority
                      <select value={newItemPriority} onChange={(event) => setNewItemPriority(event.target.value as Priority)}>
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <label>
                      Due date
                      <input type="date" value={newItemDueDate} onChange={(event) => setNewItemDueDate(event.target.value)} />
                    </label>
                    {selected.kind === 'agenda' && (
                      <label>
                        Reminder time
                        <input type="datetime-local" value={newItemReminderAt} onChange={(event) => setNewItemReminderAt(event.target.value)} />
                      </label>
                    )}
                    <label>
                      Note
                      <input value={newItemNote} onChange={(event) => setNewItemNote(event.target.value)} placeholder="Optional note" />
                    </label>
                  </div>
                )}
              </form>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
