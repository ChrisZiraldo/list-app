// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('creates a list from the phone-first capture form', async () => {
    vi.stubEnv('BASE_URL', '/lists/');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'list-1', title: 'Weekend', kind: 'todo' }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
      );
    vi.stubGlobal('fetch', fetch);

    render(<App />);
    await screen.findByText('Your lists');
    fireEvent.change(screen.getByLabelText('New list name'), { target: { value: 'Weekend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create list' }));

    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith('/lists/api/lists', expect.objectContaining({ method: 'POST' })));
  });

  it('captures optional priority, due date, and note when adding an item', async () => {
    vi.stubEnv('BASE_URL', '/lists/');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'list-1', title: 'Weekend', kind: 'todo', pinned: false, favorite: false }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'item-1', text: 'Pack bags', completed: false, note: 'check passport', priority: 'high', dueDate: '2026-08-01', position: 0 }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetch);

    render(<App />);
    await screen.findByText('Your lists');
    fireEvent.change(screen.getByLabelText('New list name'), { target: { value: 'Weekend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create list' }));
    await screen.findByRole('heading', { name: 'Weekend' });

    fireEvent.change(screen.getByLabelText('Add an item'), { target: { value: 'Pack bags' } });
    fireEvent.click(screen.getByRole('button', { name: 'More details' }));
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'high' } });
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'check passport' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        '/lists/api/lists/list-1/items',
        expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ text: 'Pack bags', priority: 'high', dueDate: '2026-08-01', note: 'check passport' }),
        }),
      ),
    );
  });

  it('captures a reminder time when adding an agenda item', async () => {
    vi.stubEnv('BASE_URL', '/lists/');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'list-1', title: 'Family calendar', kind: 'agenda', pinned: false, favorite: false }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'item-1',
            text: 'Leave for dentist',
            completed: false,
            note: null,
            priority: 'normal',
            dueDate: null,
            reminderAt: '2026-08-03T13:45:00.000Z',
            position: 0,
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetch);

    render(<App />);
    await screen.findByText('Your lists');
    fireEvent.change(screen.getByLabelText('New list name'), { target: { value: 'Family calendar' } });
    fireEvent.change(screen.getByLabelText('New list kind'), { target: { value: 'agenda' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create list' }));
    await screen.findByRole('heading', { name: 'Family calendar' });

    fireEvent.change(screen.getByLabelText('Add an item'), { target: { value: 'Leave for dentist' } });
    fireEvent.click(screen.getByRole('button', { name: 'More details' }));
    fireEvent.change(screen.getByLabelText('Reminder time'), { target: { value: '2026-08-03T13:45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        '/lists/api/lists/list-1/items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: 'Leave for dentist', priority: 'normal', reminderAt: '2026-08-03T13:45:00.000Z' }),
        }),
      ),
    );
    expect(await screen.findByText(/Reminder Aug 3/)).not.toBeNull();
  });

  it('deletes a list after confirming', async () => {
    vi.stubEnv('BASE_URL', '/lists/');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'list-1', title: 'Weekend', kind: 'todo', pinned: false, favorite: false }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'list-1', title: 'Weekend', kind: 'todo', pinned: false, favorite: false, items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Weekend/ }));
    await screen.findByRole('heading', { name: 'Weekend' });

    fireEvent.click(screen.getByRole('button', { name: 'List actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete list' }));

    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith('/lists/api/lists/list-1', expect.objectContaining({ method: 'DELETE' })));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Weekend' })).toBeNull());
  });
});
