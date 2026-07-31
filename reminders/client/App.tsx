import { FormEvent, useEffect, useState } from 'react';
import './styles.css';

type Reminder = { id: string; name: string; schedule: string; enabled: boolean; deliver: string };

function api(path: string) {
  return `${import.meta.env.BASE_URL}api${path}`;
}

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error('Reminder request failed');
  return response.status === 204 ? undefined : response.json();
}

export function App() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('');
  const [deliver, setDeliver] = useState('origin');
  const [error, setError] = useState('');

  const reload = () =>
    request(api('/reminders'))
      .then((jobs) => setReminders(jobs as Reminder[]))
      .catch((cause) => setError(String(cause)));
  useEffect(() => void reload(), []);

  async function createReminder(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !schedule.trim()) return;
    try {
      await request(api('/reminders'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), schedule: schedule.trim(), prompt: name.trim(), deliver: deliver.trim() }),
      });
      setName('');
      setSchedule('');
      await reload();
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function control(job: Reminder, action: 'pause' | 'resume' | 'delete') {
    try {
      await request(api(`/reminders/${job.id}${action === 'delete' ? '' : `/${action}`}`), { method: action === 'delete' ? 'DELETE' : 'POST' });
      await reload();
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function edit(job: Reminder) {
    const nextSchedule = window.prompt('Schedule', job.schedule);
    if (!nextSchedule?.trim()) return;
    try {
      await request(api(`/reminders/${job.id}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: job.name, schedule: nextSchedule.trim(), prompt: job.name, deliver: job.deliver }),
      });
      await reload();
    } catch (cause) {
      setError(String(cause));
    }
  }

  return (
    <main className="reminders-shell">
      <header>
        <p className="eyebrow">Hermes cron</p>
        <h1>Reminders</h1>
        <p>Upcoming and paused deliveries, under your control.</p>
      </header>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={createReminder} className="capture">
        <label>
          Reminder name
          <input aria-label="Reminder name" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Schedule
          <input
            aria-label="Schedule"
            placeholder="2026-08-01T09:00:00 or every monday 9am"
            value={schedule}
            onChange={(event) => setSchedule(event.target.value)}
          />
        </label>
        <label>
          Delivery target
          <input aria-label="Delivery target" value={deliver} onChange={(event) => setDeliver(event.target.value)} />
        </label>
        <button type="submit">Create reminder</button>
      </form>
      <section aria-label="Scheduled reminders">
        <h2>Scheduled reminders</h2>
        {reminders.length === 0 ? (
          <p>No reminders yet.</p>
        ) : (
          <ul>
            {reminders.map((job) => (
              <li key={job.id}>
                <div>
                  <strong>{job.name}</strong>
                  <span>{job.schedule}</span>
                  <code>{job.deliver}</code>
                </div>
                <div>
                  <button onClick={() => void edit(job)}>Edit</button>
                  {job.enabled ? (
                    <button onClick={() => void control(job, 'pause')}>Pause</button>
                  ) : (
                    <button onClick={() => void control(job, 'resume')}>Resume</button>
                  )}
                  <button onClick={() => void control(job, 'delete')}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
