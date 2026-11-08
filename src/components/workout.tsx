'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  History,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { db, editSession, deleteExerciseResult } from '@/lib/db';
import {
  completion,
  exerciseHistory,
  exerciseRecords,
  formatDate,
  prescriptionText,
  safeUrl,
  type Entry,
  type WorkoutSession,
} from '@/lib/domain';
import { Empty, Meter, Modal } from './ui';
export default function Workout({
  session,
  sessions,
  ownerId,
  onBack,
  onError,
}: {
  session: WorkoutSession;
  sessions: WorkoutSession[];
  ownerId: string;
  onBack: () => void;
  onError: (s: string) => void;
}) {
  const [history, setHistory] = useState<Entry | null>(null),
    [working, setWorking] = useState(false);
  const finished = session.status === 'finished',
    c = completion([session]);
  async function update(change: (s: WorkoutSession) => void) {
    try {
      await editSession(db(), ownerId, session.id, change);
    } catch (e) {
      onError(
        e instanceof Error ? e.message : 'Unable to save. Please keep this screen open and retry.',
      );
    }
  }
  async function updateEntry(
    id: string,
    patch: Partial<Entry> | ((entry: Entry) => Partial<Entry>),
  ) {
    await update((s) => {
      if (s.status === 'finished') throw new Error('Reopen the session before editing.');
      const e = s.blocks.flatMap((b) => b.entries).find((e) => e.id === id);
      if (!e) throw new Error('Exercise unavailable');
      Object.assign(e, typeof patch === 'function' ? patch(e) : patch);
      s.status = 'in_progress';
    });
  }
  const previous = (entry: Entry) => exerciseHistory(sessions, session, entry);
  const records = (entry: Entry) => exerciseRecords(sessions, ownerId, entry.exerciseId);
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={18} />
        Your workouts
      </button>
      <div className="page-heading workout-heading">
        <div>
          <span className="section-kicker">
            {formatDate(session.date, { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          <h1>
            {session.title}
            <span className="accent">.</span>
          </h1>
          <p className="muted">
            {session.blocks.length} blocks · {c.total} exercises ·{' '}
            {session.status.replace('_', ' ')}
          </p>
          {(session.category || session.estimatedMinutes) && (
            <p className="muted">
              {[
                session.category,
                session.estimatedMinutes ? `${session.estimatedMinutes} min estimated` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {session.description && <p className="workout-description">{session.description}</p>}
        </div>
        <span className={`badge ${finished ? 'success' : ''}`}>
          {finished ? <CheckCheck size={17} /> : null}
          {finished ? 'Session finished' : 'Your training session'}
        </span>
      </div>
      <div className="workout-progress panel">
        <div className="row between">
          <strong>
            {c.completed} of {c.total} exercises completed
          </strong>
          <strong>{c.percent === null ? 'N/A' : `${c.percent}%`}</strong>
        </div>
        <Meter value={c.percent} label="Workout exercise completion" />
        {finished && (
          <p className="small-note">
            Session finished ·{' '}
            {c.percent === null ? 'No eligible exercises' : `${c.percent}% of exercises completed`}.
          </p>
        )}
      </div>
      <div className="workout-blocks">
        {session.blocks.map((block) => (
          <section className="exercise-block" key={block.id}>
            <header className="block-header">
              <span className="block-letter">{block.label || '—'}</span>
              <div>
                <h2>{block.kind.replaceAll('_', ' ').toUpperCase()}</h2>
                {block.instructions && <p>{block.instructions}</p>}
              </div>
              <span className="muted text-sm">
                {block.entries.filter((e) => e.eligible).length} exercises
              </span>
            </header>
            {block.entries.map((entry) => {
              const last = previous(entry)[0],
                url = safeUrl(entry.referenceUrl);
              return (
                <article
                  className={`exercise-card ${entry.completed ? 'is-complete' : ''}`}
                  key={entry.id}
                >
                  <div className="exercise-top">
                    <div className="exercise-title">
                      <span className="exercise-label">{entry.label}</span>
                      <div>
                        <h3>{entry.name}</h3>
                        <p className="prescription">
                          {prescriptionText(entry.prescription) ||
                            'Follow your coach’s instructions'}
                        </p>
                        {entry.instructions && <p className="muted">{entry.instructions}</p>}
                      </div>
                    </div>
                    {entry.eligible ? (
                      <button
                        className="completion-button"
                        role="checkbox"
                        aria-checked={entry.completed}
                        aria-label={`Complete ${entry.label} ${entry.name}`}
                        disabled={finished || working}
                        onClick={() =>
                          void updateEntry(entry.id, (current) => ({
                            completed: !current.completed,
                          }))
                        }
                      >
                        {entry.completed ? <Check size={24} /> : <span />}
                      </button>
                    ) : (
                      <span className="badge">Reference only</span>
                    )}
                  </div>
                  {entry.eligible && (
                    <div className="result-fields">
                      <ResultField
                        label={`Actual load · ${entry.label}`}
                        value={entry.load}
                        placeholder="e.g. 24 kg / BW"
                        maxLength={160}
                        disabled={finished}
                        onChange={(value) => void updateEntry(entry.id, { load: value })}
                      />
                      <ResultField
                        label={`Notes · ${entry.label}`}
                        value={entry.notes}
                        placeholder="How did it feel?"
                        maxLength={4000}
                        disabled={finished}
                        onChange={(value) => void updateEntry(entry.id, { notes: value })}
                      />
                    </div>
                  )}
                  <div className="exercise-bottom">
                    <span className="last-result">
                      {last ? (
                        <>
                          Last: <strong>{last.entry.load || 'No load recorded'}</strong> ·{' '}
                          {formatDate(last.session.date)}
                          {last.entry.notes && (
                            <span title={last.entry.notes}> · {last.entry.notes.slice(0, 65)}</span>
                          )}
                        </>
                      ) : entry.eligible ? (
                        'Your first recorded session for this exercise.'
                      ) : (
                        'This item does not count toward completion.'
                      )}
                    </span>
                    <div className="row">
                      {url && (
                        <a
                          className="text-button"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Reference
                          <ArrowUpRight size={15} />
                        </a>
                      )}
                      <button className="text-button" onClick={() => setHistory(entry)}>
                        <History size={15} />
                        View history
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ))}
      </div>
      <section className={`finish-panel ${finished ? 'finished' : ''}`}>
        <div>
          <h2>{finished ? 'The work is recorded.' : 'Done for today?'}</h2>
          <p className="muted">
            {finished
              ? `Session finished · ${c.percent === null ? 'No eligible exercises' : `${c.percent}% of exercises completed`}.`
              : 'Finish whenever you’re ready. Unchecked exercises stay unchecked.'}
          </p>
        </div>
        <div className="row wrap">
          {finished ? (
            <button
              className="button secondary"
              disabled={working}
              onClick={async () => {
                setWorking(true);
                await update((s) => {
                  s.status = 'in_progress';
                  s.finishedAt = null;
                });
                setWorking(false);
              }}
            >
              <RotateCcw size={18} />
              Reopen session
            </button>
          ) : (
            <>
              <button
                className="button secondary"
                disabled={working}
                onClick={async () => {
                  setWorking(true);
                  await update((s) => {
                    s.status = s.status === 'skipped' ? 'in_progress' : 'skipped';
                    s.finishedAt = null;
                  });
                  setWorking(false);
                }}
              >
                {session.status === 'skipped' ? 'Resume session' : 'Skip session'}
              </button>
              <button
                className="button primary"
                disabled={working}
                onClick={async () => {
                  setWorking(true);
                  await update((s) => {
                    s.status = 'finished';
                    s.finishedAt = new Date().toISOString();
                  });
                  setWorking(false);
                }}
              >
                <CheckCheck size={20} />
                Finish workout
              </button>
            </>
          )}
        </div>
      </section>
      {history && (
        <Modal title={`${history.name} · history`} onClose={() => setHistory(null)}>
          {records(history).length ? (
            records(history).map(({ session: s, entry: e }) => (
              <div className="history-result" key={`${s.id}-${e.id}`}>
                <span className="eyebrow">
                  {formatDate(s.date, { month: 'short', day: 'numeric', year: 'numeric' })} ·{' '}
                  {s.status.replace('_', ' ')}
                </span>
                <p>
                  {s.title} · {e.label}
                </p>
                <h3>{e.load || 'No load recorded'}</h3>
                <p>{e.notes || 'No notes recorded'}</p>
                <p className="small-note">
                  Prescribed: {prescriptionText(e.prescription)} ·{' '}
                  {e.completed ? 'Completed' : 'Unchecked'}
                </p>
                <button
                  className="text-button"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Delete the recorded result for ${e.name} in ${s.title} on ${formatDate(s.date)}? This clears completion, actual load and notes. The workout and prescription stay in place.`,
                      )
                    )
                      return;
                    try {
                      await deleteExerciseResult(db(), ownerId, s.id, e.id, s.version);
                    } catch (error) {
                      onError(error instanceof Error ? error.message : 'Unable to delete result');
                    }
                  }}
                >
                  <Trash2 size={16} />
                  Delete result
                </button>
              </div>
            ))
          ) : (
            <Empty title="A fresh starting point">
              Your saved results for this exercise will appear here.
            </Empty>
          )}
        </Modal>
      )}
    </>
  );
}
function ResultField({
  label,
  value,
  placeholder,
  maxLength,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  maxLength: number;
  disabled: boolean;
  onChange: (s: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.value = value;
  }, [value]);
  return (
    <label>
      {label}
      <input
        ref={ref}
        defaultValue={value}
        placeholder={placeholder}
        maxLength={maxLength}
        readOnly={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          if (e.target.value !== value) onChange(e.target.value);
        }}
      />
    </label>
  );
}
