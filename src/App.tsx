import { FormEvent, useEffect, useMemo, useState } from 'react';
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
  position: number;
};
type ListDetail = List & { items: Item[] };

const KIND_LABELS: Record<ListKind, string> = { todo: 'Todo', shopping: 'Shopping', agenda: 'Agenda' };
const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

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
  if (mode === 'priority') return [...items].sort((a, b) => PRIORITY_RANK[a.priority ?? 'normal'] - PRIORITY_RANK[b.priority ?? 'normal'] || a.position - b.position);
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

export function App() {
  const [lists, setLists] = useState<List[]>([]);
  const [selected, setSelected] = useState<ListDetail | null>(null);
  const [newListName, setNewListName] = useState('');
  const [newListKind, setNewListKind] = useState<ListKind>('todo');
  const [newItemText, setNewItemText] = useState('');
  const [newItemPriority, setNewItemPriority] = useState<Priority>('normal');
  const [newItemDueDate, setNewItemDueDate] = useState('');
  const [newItemNote, setNewItemNote] = useState('');
  const [showItemDetails, setShowItemDetails] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('manual');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState<{ text: string; note: string; priority: Priority; dueDate: string }>({ text: '', note: '', priority: 'normal', dueDate: '' });
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());

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

  const orderedLists = useMemo(
    () => [...lists].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.favorite) - Number(a.favorite)),
    [lists],
  );
  const manualOrder = useMemo(() => (selected ? sortItems(selected.items, 'manual') : []), [selected]);
  const visibleItems = useMemo(() => (selected ? sortItems(selected.items, sortMode) : []), [selected, sortMode]);
  const completedCount = selected?.items.filter((item) => item.completed).length ?? 0;

  async function createList(event: FormEvent) {
    event.preventDefault();
    if (!newListName.trim()) return;
    const list = await withPending('create-list', () =>
      requestJson<List>(apiPath('/lists'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newListName, kind: newListKind }) }),
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
    await reloadSelected(list.id);
  }

  async function renameList() {
    if (!selected) return;
    const title = titleDraft.trim();
    if (!title || title === selected.title) return setEditingTitle(false);
    const updated = await withPending('rename-list', () =>
      requestJson<List>(apiPath(`/lists/${selected.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }),
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
      requestJson<List>(apiPath(`/lists/${selected.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [flag]: !selected[flag] }) }),
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
          note: newItemNote || undefined,
        }),
      }),
    );
    if (!item) return;
    setSelected((current) => (current ? { ...current, items: [...current.items, item] } : current));
    setNewItemText('');
    setNewItemPriority('normal');
    setNewItemDueDate('');
    setNewItemNote('');
  }

  async function toggleItem(item: Item) {
    const updated = await withPending(`item:${item.id}`, () =>
      requestJson<Item>(apiPath(`/items/${item.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: !item.completed }) }),
    );
    if (!updated) return;
    setSelected((current) => (current ? { ...current, items: current.items.map((candidate) => (candidate.id === updated.id ? updated : candidate)) } : current));
  }

  function startEditItem(item: Item) {
    setEditingItemId(item.id);
    setItemDraft({ text: item.text, note: item.note ?? '', priority: item.priority ?? 'normal', dueDate: item.dueDate ?? '' });
  }

  async function saveItemEdit(itemId: string) {
    const updated = await withPending(`item:${itemId}`, () =>
      requestJson<Item>(apiPath(`/items/${itemId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: itemDraft.text, note: itemDraft.note || null, priority: itemDraft.priority, dueDate: itemDraft.dueDate || null }),
      }),
    );
    if (!updated) return;
    setSelected((current) => (current ? { ...current, items: current.items.map((candidate) => (candidate.id === updated.id ? updated : candidate)) } : current));
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

  return <main className="app-shell">
    <header><p className="eyebrow">Lists</p><h1>Your lists</h1></header>
    {error && <p role="alert" className="error" onClick={() => setError('')}>{error}</p>}

    <form className="capture" onSubmit={createList}>
      <label htmlFor="new-list">New list name</label>
      <input id="new-list" value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="e.g. Weekend plans" />
      <select aria-label="New list kind" value={newListKind} onChange={(event) => setNewListKind(event.target.value as ListKind)}>
        {(Object.keys(KIND_LABELS) as ListKind[]).map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
      </select>
      <button type="submit" disabled={pending.has('create-list')}>{pending.has('create-list') ? 'Creating…' : 'Create list'}</button>
    </form>

    <nav aria-label="Lists" className="list-selector">
      {orderedLists.map((list) => <button className={selected?.id === list.id ? 'selected' : ''} key={list.id} onClick={() => openList(list)}>
        {list.pinned && <span className="flag" title="Pinned">📌</span>}
        {list.favorite && <span className="flag" title="Favorite">★</span>}
        {list.title}
        <span className="kind-badge">{KIND_LABELS[list.kind]}</span>
      </button>)}
    </nav>

    {selected && <section className="list-detail" aria-labelledby="list-title">
      <div className="list-heading">
        {editingTitle
          ? <input
              aria-label="List title"
              autoFocus
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={renameList}
              onKeyDown={(event) => event.key === 'Enter' && renameList()}
            />
          : <h2 id="list-title" onClick={() => { setTitleDraft(selected.title); setEditingTitle(true); }}>{selected.title}</h2>}
        <span>{completedCount}/{selected.items.length} done</span>
      </div>

      <div className="list-toolbar">
        <select aria-label="List kind" value={selected.kind} onChange={(event) => changeKind(event.target.value as ListKind)}>
          {(Object.keys(KIND_LABELS) as ListKind[]).map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
        </select>
        <button type="button" className={selected.pinned ? 'toggle active' : 'toggle'} onClick={() => toggleListFlag('pinned')}>{selected.pinned ? 'Pinned' : 'Pin'}</button>
        <button type="button" className={selected.favorite ? 'toggle active' : 'toggle'} onClick={() => toggleListFlag('favorite')}>{selected.favorite ? 'Favorited' : 'Favorite'}</button>
        <select aria-label="Sort items" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
          <option value="manual">Manual order</option>
          <option value="priority">By priority</option>
          <option value="dueDate">By due date</option>
        </select>
        <button type="button" className="danger" onClick={deleteList}>Delete list</button>
      </div>

      <form className="capture item-capture" onSubmit={createItem}>
        <label htmlFor="new-item">Add an item</label>
        <input id="new-item" value={newItemText} onChange={(event) => setNewItemText(event.target.value)} placeholder="What needs doing?" />
        <button type="submit" disabled={pending.has('create-item')}>{pending.has('create-item') ? 'Adding…' : 'Add item'}</button>
        <button type="button" className="link" onClick={() => setShowItemDetails((current) => !current)}>{showItemDetails ? 'Fewer details' : 'More details'}</button>
        {showItemDetails && <div className="item-details">
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
          <label>
            Note
            <input value={newItemNote} onChange={(event) => setNewItemNote(event.target.value)} placeholder="Optional note" />
          </label>
        </div>}
      </form>

      <ul className="items">
        {visibleItems.map((item) => <li key={item.id} className={item.priority ? `priority-${item.priority}` : ''}>
          {editingItemId === item.id
            ? <div className="item-edit">
                <input aria-label="Item text" value={itemDraft.text} onChange={(event) => setItemDraft((draft) => ({ ...draft, text: event.target.value }))} />
                <select aria-label="Item priority" value={itemDraft.priority} onChange={(event) => setItemDraft((draft) => ({ ...draft, priority: event.target.value as Priority }))}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
                <input aria-label="Item due date" type="date" value={itemDraft.dueDate} onChange={(event) => setItemDraft((draft) => ({ ...draft, dueDate: event.target.value }))} />
                <input aria-label="Item note" value={itemDraft.note} onChange={(event) => setItemDraft((draft) => ({ ...draft, note: event.target.value }))} placeholder="Note" />
                <button type="button" onClick={() => saveItemEdit(item.id)}>Save</button>
                <button type="button" className="link" onClick={() => setEditingItemId(null)}>Cancel</button>
              </div>
            : <>
                <label>
                  <input type="checkbox" checked={item.completed} onChange={() => toggleItem(item)} disabled={pending.has(`item:${item.id}`)} />
                  <span className="item-text">{item.text}</span>
                  {item.priority && item.priority !== 'normal' && <span className={`priority-badge priority-${item.priority}`}>{item.priority}</span>}
                  {item.dueDate && <span className="due-date">due {item.dueDate}</span>}
                </label>
                {item.note && <p className="item-note">{item.note}</p>}
                <div className="item-actions">
                  <button type="button" className="icon" aria-label="Move up" disabled={sortMode !== 'manual' || pending.has(`item:${item.id}`)} onClick={() => moveItem(item, 'up')}>↑</button>
                  <button type="button" className="icon" aria-label="Move down" disabled={sortMode !== 'manual' || pending.has(`item:${item.id}`)} onClick={() => moveItem(item, 'down')}>↓</button>
                  <button type="button" className="link" onClick={() => startEditItem(item)}>Edit</button>
                  <button type="button" className="link danger" onClick={() => deleteItem(item)}>Delete</button>
                </div>
              </>}
        </li>)}
      </ul>
    </section>}
  </main>;
}
