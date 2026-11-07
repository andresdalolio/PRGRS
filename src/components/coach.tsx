'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  FileJson,
  Plus,
  Save,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { supabase, unwrap } from '@/lib/supabase';
import { blankProgram, parseProgram, programSchema, type ProgramInput } from '@/lib/import';
import { adherence, completion, formatDate, safeUrl, type WorkoutSession } from '@/lib/domain';
import type { Identity } from '@/lib/db';
import { Empty, Modal, Notice } from './ui';
type Exercise = {
  id: string;
  exercise_key: string;
  name: string;
  aliases: string[];
  reference_url: string | null;
};
type Program = {
  id: string;
  name: string;
  description: string;
  version: number;
  created_at: string;
};
type Relationship = { athlete_id: string; accepted: boolean; profiles: { name: string } | null };
export default function Coach({
  identity,
  sessions,
  today,
  onRefresh,
}: {
  identity: Identity;
  sessions: WorkoutSession[];
  today: string;
  onRefresh: () => Promise<void>;
}) {
  const queryClient = useQueryClient(),
    [section, setSection] = useState<'programs' | 'exercises' | 'athletes'>('programs'),
    [editor, setEditor] = useState(false),
    [mode, setMode] = useState<'builder' | 'json'>('builder'),
    [draft, setDraft] = useState<ProgramInput>(blankProgram()),
    [raw, setRaw] = useState(''),
    [replace, setReplace] = useState<string | null>(null),
    [preview, setPreview] = useState<ProgramInput | null>(null),
    [assign, setAssign] = useState<Program | null>(null),
    [exercise, setExercise] = useState<Partial<Exercise> | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const programsQuery = useQuery({
    queryKey: ['programs', identity.id],
    queryFn: async () =>
      unwrap(
        await supabase()
          .from('programs')
          .select('id,name,description,version,created_at')
          .order('created_at', { ascending: false }),
      ) as Program[],
  });
  const exercisesQuery = useQuery({
    queryKey: ['exercises', identity.id],
    queryFn: async () =>
      unwrap(
        await supabase()
          .from('exercises')
          .select('id,exercise_key,name,aliases,reference_url')
          .eq('owner_id', identity.id)
          .order('name'),
      ) as Exercise[],
  });
  const athletesQuery = useQuery({
    queryKey: ['athletes', identity.id],
    queryFn: async () =>
      unwrap(
        await supabase()
          .from('coach_athletes')
          .select('athlete_id,accepted,profiles!coach_athletes_athlete_id_fkey(name)')
          .eq('coach_id', identity.id),
      ) as unknown as Relationship[],
  });
  const programs = programsQuery.data || [],
    exercises = exercisesQuery.data || [],
    athletes = athletesQuery.data || [];
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete this action');
    } finally {
      setBusy(false);
    }
  }
  function newProgram() {
    setDraft(blankProgram());
    setRaw('');
    setReplace(null);
    setPreview(null);
    setMode('builder');
    setEditor(true);
    setError('');
  }
  async function editProgram(p: Program) {
    await action(async () => {
      const data = unwrap(await supabase().rpc('get_program', { p_id: p.id }));
      const parsed = programSchema.parse(data);
      setDraft(parsed);
      setRaw(JSON.stringify(parsed, null, 2));
      setReplace(p.id);
      setMode('builder');
      setEditor(true);
      setPreview(null);
    });
  }
  function validate() {
    try {
      const parsed = mode === 'json' ? parseProgram(raw) : programSchema.parse(draft);
      setPreview(parsed);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid program');
    }
  }
  async function persist() {
    if (!preview) return;
    await action(async () => {
      unwrap(await supabase().rpc('save_program', { p_program: preview, p_replace: replace }));
      await queryClient.invalidateQueries({ queryKey: ['programs'] });
      await queryClient.invalidateQueries({ queryKey: ['exercises'] });
      setEditor(false);
      setPreview(null);
      setMessage(
        replace
          ? 'Program updated. Assigned session snapshots are preserved.'
          : 'Program saved. Ready to assign.',
      );
    });
  }
  const queryError = programsQuery.error || exercisesQuery.error || athletesQuery.error;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">THE PLAN BEHIND THE PROGRESS</span>
          <h1>
            Coach studio<span className="accent">.</span>
          </h1>
          <p className="muted">Build with intention. Give your athletes room to grow.</p>
        </div>
        <button className="button primary" onClick={newProgram}>
          <Plus size={18} />
          Create program
        </button>
      </div>
      <div className="coach-tabs" role="tablist" aria-label="Coach sections">
        {[
          { id: 'programs', label: 'Programs', icon: BookOpen },
          { id: 'exercises', label: 'Exercise library', icon: Check },
          { id: 'athletes', label: 'Athletes', icon: Users },
        ].map(({ id, label, icon: Icon }) => (
          <button
            role="tab"
            aria-selected={section === id}
            className={section === id ? 'active' : ''}
            key={id}
            onClick={() => setSection(id as typeof section)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
      {(error || queryError) && (
        <Notice error>
          <pre>{error || queryError?.message}</pre>
        </Notice>
      )}
      {message && <Notice>{message}</Notice>}
      {section === 'programs' ? (
        <>
          {!editor && (
            <div className="import-banner">
              <span className="empty-icon">
                <FileJson />
              </span>
              <div>
                <h3>Your program, ready to import.</h3>
                <p>Paste a plan created elsewhere. Preview every detail before saving.</p>
              </div>
              <button
                className="button secondary"
                onClick={() => {
                  newProgram();
                  setMode('json');
                }}
              >
                <Upload size={17} />
                Import JSON
              </button>
            </div>
          )}
          {editor ? (
            <section className="panel stack">
              <div className="row between wrap">
                <h2>{replace ? 'Edit reusable program' : 'Create a program'}</h2>
                <div className="row">
                  <div className="segmented">
                    <button
                      className={mode === 'builder' ? 'selected' : ''}
                      aria-pressed={mode === 'builder'}
                      onClick={() => {
                        if (mode === 'json' && raw) {
                          try {
                            setDraft(parseProgram(raw));
                            setMode('builder');
                            setPreview(null);
                          } catch (e) {
                            setError(String(e));
                          }
                        } else setMode('builder');
                      }}
                    >
                      Builder
                    </button>
                    <button
                      className={mode === 'json' ? 'selected' : ''}
                      aria-pressed={mode === 'json'}
                      onClick={() => {
                        setRaw(JSON.stringify(draft, null, 2));
                        setMode('json');
                        setPreview(null);
                      }}
                    >
                      JSON
                    </button>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      setEditor(false);
                      setPreview(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {replace && (
                <Notice>
                  Updates apply to this reusable program. Existing assigned workouts keep their
                  original prescriptions.
                </Notice>
              )}
              {mode === 'json' ? (
                <>
                  <label>
                    Program JSON
                    <textarea
                      className="json-editor"
                      rows={17}
                      value={raw}
                      onChange={(e) => {
                        setRaw(e.target.value);
                        setPreview(null);
                      }}
                      spellCheck={false}
                      placeholder='{"schemaVersion": 1, "name": "Your program", "weeks": [...]}'
                    />
                  </label>
                  <div className="row wrap">
                    <label className="button secondary file-button">
                      <Upload size={17} />
                      Upload JSON
                      <input
                        type="file"
                        accept="application/json,.json"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 2_000_000) {
                              setError('Keep JSON files below 2 MB.');
                              return;
                            }
                            setRaw(await file.text());
                            setPreview(null);
                          }
                        }}
                      />
                    </label>
                    <button
                      className="button secondary"
                      onClick={async () => {
                        try {
                          const response = await fetch('/examples/foundation.json');
                          if (!response.ok) throw new Error('Example unavailable');
                          setRaw(JSON.stringify(await response.json(), null, 2));
                          setPreview(null);
                        } catch (e) {
                          setError(String(e));
                        }
                      }}
                    >
                      Load example
                    </button>
                    <a href="/examples/program.schema.json" download className="text-button">
                      Download schema
                    </a>
                  </div>
                </>
              ) : (
                <Builder
                  value={draft}
                  exercises={exercises}
                  onChange={(v) => {
                    setDraft(v);
                    setPreview(null);
                  }}
                />
              )}
              <button className="button primary" disabled={busy} onClick={validate}>
                Validate & preview
                <ArrowUp size={17} />
              </button>
              {preview && (
                <div className="import-preview">
                  <div className="row between">
                    <h2>{preview.name}</h2>
                    <span className="badge success">Valid schema v1</span>
                  </div>
                  <p>{preview.description}</p>
                  {preview.weeks.map((w) => (
                    <div key={w.week}>
                      <h3>Week {w.week}</h3>
                      {w.workouts.map((d, i) => (
                        <div className="preview-workout" key={i}>
                          <strong>
                            Day {d.day} · {d.title}
                          </strong>
                          {d.blocks.map((b, j) => (
                            <div key={j}>
                              <span className="badge">
                                {b.label} · {b.kind.replaceAll('_', ' ')}
                              </span>
                              <p>{b.instructions}</p>
                              {b.entries.map((e, k) => (
                                <p key={k}>
                                  {e.label} {e.name} ·{' '}
                                  {e.prescription.text ||
                                    [
                                      e.prescription.sets && `${e.prescription.sets} sets`,
                                      e.prescription.reps && `${e.prescription.reps} reps`,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  {!e.eligible ? ' · reference only' : ''}
                                </p>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                  <button className="button primary" disabled={busy} onClick={() => void persist()}>
                    <Save size={18} />
                    {busy
                      ? 'Saving…'
                      : replace
                        ? 'Confirm program update'
                        : 'Confirm import & save'}
                  </button>
                </div>
              )}
            </section>
          ) : programsQuery.isPending ? (
            <p role="status">Loading programs…</p>
          ) : programs.length ? (
            <div className="program-grid">
              {programs.map((p) => (
                <article className="panel program-card" key={p.id}>
                  <div className="row between">
                    <span className="program-icon">
                      <BookOpen size={25} />
                    </span>
                    <span className="badge">Version {p.version}</span>
                  </div>
                  <h2>{p.name}</h2>
                  <p className="muted">{p.description || 'Ready for your next training block.'}</p>
                  <small className="muted">Created {formatDate(p.created_at.slice(0, 10))}</small>
                  <div className="row wrap">
                    <button className="button primary" onClick={() => setAssign(p)}>
                      Assign program
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => void editProgram(p)}
                    >
                      Edit
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Duplicate ${p.name}`}
                      onClick={() =>
                        void action(async () => {
                          const value = programSchema.parse(
                            unwrap(await supabase().rpc('get_program', { p_id: p.id })),
                          );
                          setDraft({ ...value, name: `${value.name} copy` });
                          setReplace(null);
                          setMode('builder');
                          setEditor(true);
                        })
                      }
                    >
                      <Copy size={18} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty title="Build your first training block">
              Create a program with the builder or import a validated JSON plan.
            </Empty>
          )}
        </>
      ) : section === 'exercises' ? (
        <section className="panel stack">
          <div className="row between">
            <h2>Movement, organized.</h2>
            <button className="button secondary" onClick={() => setExercise({})}>
              <Plus size={18} />
              Add exercise
            </button>
          </div>
          <p className="muted">
            Stable exercise keys connect results across programs. Editing a reference preserves past
            session snapshots.
          </p>
          {exercises.length ? (
            exercises.map((e) => (
              <div className="library-row" key={e.id}>
                <div>
                  <h3>{e.name}</h3>
                  <p className="small-note">
                    {e.exercise_key}
                    {e.aliases.length ? ` · ${e.aliases.join(', ')}` : ''}
                  </p>
                </div>
                <div className="row">
                  {safeUrl(e.reference_url) && (
                    <a
                      className="text-button"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={safeUrl(e.reference_url)!}
                    >
                      Reference ↗
                    </a>
                  )}
                  <button className="button secondary compact" onClick={() => setExercise(e)}>
                    Edit
                  </button>
                </div>
              </div>
            ))
          ) : (
            <Empty title="Your exercise library starts here">
              Add a movement, or import a program to resolve exercises by stable key.
            </Empty>
          )}
        </section>
      ) : (
        <section className="panel stack">
          <h2>Your athletes</h2>
          <form
            className="row align-end wrap"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(async () => {
                unwrap(
                  await supabase().rpc('request_coaching', { p_athlete: String(f.get('athlete')) }),
                );
                await queryClient.invalidateQueries({ queryKey: ['athletes'] });
                setMessage('Request sent. The athlete can accept it in Profile.');
              });
            }}
          >
            <label className="grow">
              Athlete ID
              <input
                name="athlete"
                placeholder="Paste the UUID shared by your athlete"
                required
                pattern="[0-9a-fA-F-]{36}"
              />
            </label>
            <button className="button primary" disabled={busy}>
              Request coaching access
            </button>
          </form>
          {[
            {
              athlete_id: identity.id,
              accepted: true,
              profiles: { name: `${identity.name} (you)` },
            },
            ...athletes,
          ].map((a) => {
            const training = sessions.filter((s) => s.athleteId === a.athlete_id),
              c = completion(training.filter((s) => s.date <= today)),
              ad = adherence(training, today);
            return (
              <div className="athlete-row" key={a.athlete_id}>
                <div className="row between wrap">
                  <h3>{a.profiles?.name || a.athlete_id}</h3>
                  <span className="badge">
                    {a.accepted ? 'Connected' : 'Pending athlete acceptance'}
                  </span>
                </div>
                {a.accepted && (
                  <>
                    <div className="metric-row">
                      <span>Finished / due</span>
                      <strong>
                        {ad.finished}/{ad.due} · {ad.percent === null ? 'N/A' : `${ad.percent}%`}{' '}
                        adherence
                      </strong>
                    </div>
                    <div className="metric-row">
                      <span>Exercise completion</span>
                      <strong>
                        {c.completed}/{c.total} · {c.percent === null ? 'N/A' : `${c.percent}%`}
                      </strong>
                    </div>
                    <details>
                      <summary>Review sessions and results</summary>
                      {training.length ? (
                        training
                          .slice()
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((s) => (
                            <div className="history-result" key={s.id}>
                              <h3>{s.title}</h3>
                              <p>
                                {formatDate(s.date)} · {s.status.replace('_', ' ')} ·{' '}
                                {completion([s]).percent ?? 'N/A'}%
                              </p>
                              {s.blocks
                                .flatMap((b) => b.entries)
                                .filter((e) => e.eligible)
                                .map((e) => (
                                  <p key={e.id}>
                                    {e.completed ? '✓' : '○'} {e.label} {e.name} ·{' '}
                                    {e.load || 'No load'} {e.notes && `· ${e.notes}`}
                                  </p>
                                ))}
                            </div>
                          ))
                      ) : (
                        <p>No workouts assigned yet.</p>
                      )}
                    </details>
                  </>
                )}
              </div>
            );
          })}
        </section>
      )}
      {assign && (
        <Modal title={`Assign ${assign.name}`} onClose={() => setAssign(null)}>
          <p>
            Day 1 starts on your chosen date. New sessions keep a snapshot of this program version.
          </p>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(async () => {
                unwrap(
                  await supabase().rpc('assign_program', {
                    p_program: assign.id,
                    p_athlete: String(f.get('athlete')),
                    p_start: String(f.get('start')),
                  }),
                );
                await onRefresh();
                setAssign(null);
                setMessage('Program assigned. Training is ready in the athlete’s calendar.');
              });
            }}
          >
            <label>
              Athlete
              <select name="athlete">
                <option value={identity.id}>{identity.name} (you)</option>
                {athletes
                  .filter((a) => a.accepted)
                  .map((a) => (
                    <option key={a.athlete_id} value={a.athlete_id}>
                      {a.profiles?.name || a.athlete_id}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Day 1 date
              <input type="date" name="start" required defaultValue={today} />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? 'Assigning…' : 'Confirm assignment'}
            </button>
          </form>
          {error && <Notice error>{error}</Notice>}
        </Modal>
      )}
      {exercise && (
        <Modal
          title={exercise.id ? 'Edit exercise' : 'Add exercise'}
          onClose={() => setExercise(null)}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(async () => {
                const reference = String(f.get('reference')).trim();
                if (reference && !safeUrl(reference))
                  throw new Error('Use a valid http or https reference URL.');
                const record = {
                  owner_id: identity.id,
                  name: String(f.get('name')).trim(),
                  exercise_key: String(f.get('key')).trim(),
                  aliases: String(f.get('aliases'))
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                  reference_url: reference || null,
                };
                if (record.aliases.length > 20 || record.aliases.some((a) => a.length > 100))
                  throw new Error('Use up to 20 aliases, each at most 100 characters.');
                unwrap(
                  exercise.id
                    ? await supabase().from('exercises').update(record).eq('id', exercise.id)
                    : await supabase().from('exercises').insert(record),
                );
                await queryClient.invalidateQueries({ queryKey: ['exercises'] });
                setExercise(null);
                setMessage('Exercise saved. Historical prescriptions are preserved.');
              });
            }}
          >
            <label>
              Name
              <input name="name" defaultValue={exercise.name} required maxLength={160} />
            </label>
            <label>
              Stable exercise key
              <input
                name="key"
                defaultValue={exercise.exercise_key}
                readOnly={Boolean(exercise.id)}
                required
                pattern="[a-z0-9][a-z0-9-]{0,79}"
                placeholder="romanian-deadlift"
              />
            </label>
            <label>
              Aliases, comma separated
              <input name="aliases" defaultValue={exercise.aliases?.join(', ')} />
            </label>
            <label>
              Reference video URL
              <input
                name="reference"
                type="url"
                maxLength={2000}
                defaultValue={exercise.reference_url || ''}
                placeholder="https://www.youtube.com/…"
              />
            </label>
            <button className="button primary" disabled={busy}>
              Save exercise
            </button>
          </form>
          {error && <Notice error>{error}</Notice>}
        </Modal>
      )}
    </>
  );
}
function Builder({
  value,
  onChange,
  exercises,
}: {
  value: ProgramInput;
  onChange: (v: ProgramInput) => void;
  exercises: Exercise[];
}) {
  function change(mutator: (v: ProgramInput) => void) {
    const next = structuredClone(value);
    mutator(next);
    onChange(next);
  }
  function reorder<T>(items: T[], index: number, direction: number) {
    const next = index + direction;
    if (next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]];
  }
  return (
    <div className="program-builder stack">
      <div className="form-grid">
        <label>
          Program name
          <input
            value={value.name}
            maxLength={160}
            onChange={(e) =>
              change((v) => {
                v.name = e.target.value;
              })
            }
          />
        </label>
        <label>
          Description
          <input
            value={value.description}
            maxLength={2000}
            onChange={(e) =>
              change((v) => {
                v.description = e.target.value;
              })
            }
          />
        </label>
      </div>
      {value.weeks.map((week, wi) => (
        <section className="builder-week stack" key={wi}>
          <div className="row between">
            <h3>Week {week.week}</h3>
            <button
              className="text-button danger-text"
              onClick={() =>
                change((v) => {
                  v.weeks.splice(wi, 1);
                })
              }
            >
              Remove week
            </button>
          </div>
          {week.workouts.map((workout, di) => (
            <div className="builder-workout stack" key={di}>
              <div className="row align-end wrap">
                <label className="grow">
                  Workout title
                  <input
                    value={workout.title}
                    maxLength={160}
                    onChange={(e) =>
                      change((v) => {
                        v.weeks[wi].workouts[di].title = e.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  Day
                  <select
                    value={workout.day}
                    onChange={(e) =>
                      change((v) => {
                        v.weeks[wi].workouts[di].day = Number(e.target.value);
                      })
                    }
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="icon-button"
                  aria-label="Move workout up"
                  onClick={() => change((v) => reorder(v.weeks[wi].workouts, di, -1))}
                >
                  <ArrowUp size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Move workout down"
                  onClick={() => change((v) => reorder(v.weeks[wi].workouts, di, 1))}
                >
                  <ArrowDown size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Remove workout"
                  onClick={() =>
                    change((v) => {
                      v.weeks[wi].workouts.splice(di, 1);
                    })
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
              {workout.blocks.map((block, bi) => (
                <div className="builder-block stack" key={bi}>
                  <div className="row align-end wrap">
                    <label>
                      Block label
                      <input
                        className="short-input"
                        value={block.label}
                        maxLength={12}
                        onChange={(e) =>
                          change((v) => {
                            v.weeks[wi].workouts[di].blocks[bi].label = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label className="grow">
                      Structure
                      <select
                        value={block.kind}
                        onChange={(e) =>
                          change((v) => {
                            const b = v.weeks[wi].workouts[di].blocks[bi];
                            b.kind = e.target.value as typeof b.kind;
                            if (b.kind === 'instruction')
                              b.entries.forEach((e) => (e.eligible = false));
                          })
                        }
                      >
                        {[
                          'single',
                          'superset',
                          'circuit',
                          'emom',
                          'amrap',
                          'for_time',
                          'warmup',
                          'cooldown',
                          'instruction',
                        ].map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="icon-button"
                      aria-label="Move block up"
                      onClick={() =>
                        change((v) => reorder(v.weeks[wi].workouts[di].blocks, bi, -1))
                      }
                    >
                      <ArrowUp size={18} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Move block down"
                      onClick={() => change((v) => reorder(v.weeks[wi].workouts[di].blocks, bi, 1))}
                    >
                      <ArrowDown size={18} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Remove block"
                      onClick={() =>
                        change((v) => {
                          v.weeks[wi].workouts[di].blocks.splice(bi, 1);
                        })
                      }
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <label>
                    Block instructions
                    <input
                      value={block.instructions}
                      maxLength={2000}
                      onChange={(e) =>
                        change((v) => {
                          v.weeks[wi].workouts[di].blocks[bi].instructions = e.target.value;
                        })
                      }
                    />
                  </label>
                  {block.entries.map((entry, ei) => {
                    const update = (
                      mutate: (
                        item: ProgramInput['weeks'][number]['workouts'][number]['blocks'][number]['entries'][number],
                      ) => void,
                    ) => change((v) => mutate(v.weeks[wi].workouts[di].blocks[bi].entries[ei]));
                    return (
                      <div className="builder-entry stack" key={ei}>
                        <div className="row between">
                          <strong>Exercise {ei + 1}</strong>
                          <div className="row">
                            <button
                              className="icon-button"
                              aria-label="Move exercise up"
                              onClick={() =>
                                change((v) =>
                                  reorder(v.weeks[wi].workouts[di].blocks[bi].entries, ei, -1),
                                )
                              }
                            >
                              <ArrowUp size={17} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label="Move exercise down"
                              onClick={() =>
                                change((v) =>
                                  reorder(v.weeks[wi].workouts[di].blocks[bi].entries, ei, 1),
                                )
                              }
                            >
                              <ArrowDown size={17} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label="Remove exercise"
                              onClick={() =>
                                change((v) => {
                                  v.weeks[wi].workouts[di].blocks[bi].entries.splice(ei, 1);
                                })
                              }
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </div>
                        <label>
                          Reuse from library
                          <select
                            value=""
                            onChange={(e) => {
                              const x = exercises.find((x) => x.id === e.target.value);
                              if (x)
                                update((v) => {
                                  v.name = x.name;
                                  v.exerciseKey = x.exercise_key;
                                  v.aliases = x.aliases;
                                  v.referenceUrl = x.reference_url || undefined;
                                });
                            }}
                          >
                            <option value="">Choose an existing movement…</option>
                            {exercises.map((e) => (
                              <option value={e.id} key={e.id}>
                                {e.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="form-grid">
                          <label>
                            Name
                            <input
                              value={entry.name}
                              maxLength={160}
                              onChange={(e) =>
                                update((v) => {
                                  v.name = e.target.value;
                                })
                              }
                            />
                          </label>
                          <label>
                            Stable key
                            <input
                              value={entry.exerciseKey}
                              onChange={(e) =>
                                update((v) => {
                                  v.exerciseKey = e.target.value;
                                })
                              }
                              placeholder="exercise-key"
                            />
                          </label>
                          <label>
                            Group label
                            <input
                              value={entry.label}
                              maxLength={12}
                              onChange={(e) =>
                                update((v) => {
                                  v.label = e.target.value;
                                })
                              }
                            />
                          </label>
                          <label>
                            Reference URL
                            <input
                              type="url"
                              value={entry.referenceUrl || ''}
                              onChange={(e) =>
                                update((v) => {
                                  v.referenceUrl = e.target.value || undefined;
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="prescription-grid">
                          {(
                            [
                              'sets',
                              'reps',
                              'load',
                              'duration',
                              'distance',
                              'calories',
                              'rounds',
                              'tempo',
                              'rest',
                              'text',
                            ] as const
                          ).map((key) => (
                            <label key={key}>
                              {key === 'text' ? 'Prescription notes' : key}
                              <input
                                type={
                                  ['sets', 'calories', 'rounds'].includes(key) ? 'number' : 'text'
                                }
                                min={1}
                                value={entry.prescription[key] ?? ''}
                                maxLength={2000}
                                onChange={(e) =>
                                  update((v) => {
                                    const p = v.prescription as Record<string, string | number>;
                                    if (!e.target.value) delete p[key];
                                    else
                                      p[key] = ['sets', 'calories', 'rounds'].includes(key)
                                        ? Number(e.target.value)
                                        : e.target.value;
                                  })
                                }
                              />
                            </label>
                          ))}
                        </div>
                        <label>
                          Exercise instructions
                          <input
                            value={entry.instructions}
                            maxLength={2000}
                            onChange={(e) =>
                              update((v) => {
                                v.instructions = e.target.value;
                              })
                            }
                          />
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={entry.eligible}
                            disabled={block.kind === 'instruction'}
                            onChange={(e) =>
                              update((v) => {
                                v.eligible = e.target.checked;
                              })
                            }
                          />
                          Counts toward exercise completion
                        </label>
                      </div>
                    );
                  })}
                  <button
                    className="button secondary"
                    onClick={() =>
                      change((v) => {
                        v.weeks[wi].workouts[di].blocks[bi].entries.push({
                          exerciseKey: '',
                          name: '',
                          label: `${block.label}${block.entries.length + 1}`,
                          eligible: block.kind !== 'instruction',
                          aliases: [],
                          prescription: {},
                          instructions: '',
                        });
                      })
                    }
                  >
                    <Plus size={17} />
                    Add exercise
                  </button>
                </div>
              ))}
              <button
                className="button secondary"
                onClick={() =>
                  change((v) => {
                    v.weeks[wi].workouts[di].blocks.push({
                      label: String.fromCharCode(65 + workout.blocks.length),
                      kind: 'single',
                      instructions: '',
                      entries: [],
                    });
                  })
                }
              >
                <Plus size={17} />
                Add block
              </button>
            </div>
          ))}
          <div className="row wrap">
            <button
              className="button secondary"
              onClick={() =>
                change((v) => {
                  v.weeks[wi].workouts.push({
                    day: Math.min(7, week.workouts.length + 1),
                    title: 'New workout',
                    blocks: [{ label: 'A', kind: 'single', instructions: '', entries: [] }],
                  });
                })
              }
            >
              <Plus size={17} />
              Add workout
            </button>
            {value.weeks.flatMap((w) => w.workouts).length > 0 && (
              <label>
                Reuse a workout
                <select
                  value=""
                  onChange={(e) => {
                    const [w, d] = e.target.value.split(':').map(Number);
                    if (Number.isInteger(w) && Number.isInteger(d))
                      change((v) => {
                        v.weeks[wi].workouts.push(structuredClone(v.weeks[w].workouts[d]));
                      });
                  }}
                >
                  <option value="">Copy a template…</option>
                  {value.weeks.flatMap((w, i) =>
                    w.workouts.map((d, j) => (
                      <option key={`${i}:${j}`} value={`${i}:${j}`}>
                        Week {w.week}: {d.title}
                      </option>
                    )),
                  )}
                </select>
              </label>
            )}
          </div>
        </section>
      ))}
      <button
        className="button secondary"
        onClick={() =>
          change((v) => {
            v.weeks.push({ week: Math.max(0, ...v.weeks.map((w) => w.week)) + 1, workouts: [] });
          })
        }
      >
        <Plus size={17} />
        Add week
      </button>
    </div>
  );
}
