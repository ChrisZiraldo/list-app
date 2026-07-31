// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

afterEach(() => vi.unstubAllGlobals());

describe('Reminders App', () => {
  it('shows delivery targets and creates a reminder from the dashboard form', async () => {
    vi.stubEnv('BASE_URL', '/reminders/');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'job-1', name: 'Take bins out', schedule: 'once at 2026-08-01 09:00', enabled: true, deliver: 'discord:123' }]), {
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ created: true }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);

    render(<App />);
    expect(await screen.findByText('Take bins out')).not.toBeNull();
    expect(screen.getByText('discord:123')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Reminder name'), { target: { value: 'Water plants' } });
    fireEvent.change(screen.getByLabelText('Schedule'), { target: { value: 'every saturday 9am' } });
    fireEvent.change(screen.getByLabelText('Delivery target'), { target: { value: 'discord:123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create reminder' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/reminders/api/reminders',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Water plants', schedule: 'every saturday 9am', prompt: 'Water plants', deliver: 'discord:123' }),
        }),
      ),
    );
  });

  it('edits an existing reminder schedule', async () => {
    vi.stubEnv('BASE_URL', '/reminders/');
    vi.spyOn(window, 'prompt').mockReturnValue('every saturday 9am');
    const job = { id: 'job-1', name: 'Water plants', schedule: 'every sunday 9am', enabled: true, deliver: 'discord:123' };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([job]), { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([job]), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/reminders/api/reminders/job-1', expect.objectContaining({ method: 'PATCH' })));
  });
});
