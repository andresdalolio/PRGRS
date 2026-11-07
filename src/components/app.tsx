'use client';
import { compareSessionOrder } from '@/lib/domain';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  History,
  Home,
  Layers,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  User,
  WifiOff,
  X,
} from 'lucide-react';
import { configured, supabase, unwrap, signOutDevice } from '@/lib/supabase';
import {
  clearAccount,
  discardAccount,
  db,
  mergeRemote,
  resolveConflict,
  type Identity,
} from '@/lib/db';
import { fetchSessions, sendMutation } from '@/lib/remote';
import { synchronized } from '@/lib/sync';
import { configuration } from '@/lib/config';
import { reportError } from '@/lib/observability';
import {
  adherence,
  completion,
  formatDate,
  shiftDate,
  todayInZone,
  weekStart,
  statusLabel,
  type WorkoutSession,
} from '@/lib/domain';
import { Brand, Empty, Meter, Modal, Notice, SessionCard } from './ui';
import Workout from './workout';
import Coach from './coach';
type Tab = 'home' | 'workouts' | 'history' | 'profile' | 'coach';
const nav = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'workouts', label: 'Workouts', icon: CalendarDays },
  { id: 'history', label: 'History', icon: History },
  { id: 'profile', label: 'Profile', icon: User },
] as const;
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Application />
    </QueryClientProvider>
  );
}
function Application() {
  const [identity, setIdentity] = useState<Identity | null>(null),
    [loading, setLoading] = useState(true),
    [error, setErrorValue] = useState(''),
    [online, setOnline] = useState(true),
    [syncing, setSyncing] = useState(false),
    [syncError, setSyncError] = useState(''),
    [tab, setTab] = useState<Tab>('home'),
    [workout, setWorkout] = useState<string | null>(null),
    [menu, setMenu] = useState(false),
    [boot, setBoot] = useState(0);
  const setError = useCallback((message: string) => {
    if (message) reportError('application', message);
    setErrorValue(
      /quota/i.test(message)
        ? 'Device storage is full. Your latest edit could not be saved. Keep this screen open, free space without clearing this app’s data, and retry.'
        : message,
    );
  }, []);
  const sessions = useLiveQuery(
      () =>
        db()
          .sessions.toArray()
          .then((items) => items.sort(compareSessionOrder)),
      [],
      [],
    ),
    outbox = useLiveQuery(() => db().outbox.toArray(), [], []);
  const today = todayInZone(identity?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const own = sessions.filter((s) => s.athleteId === identity?.id),
    pending = outbox.filter((m) => m.ownerId === identity?.id);
  const sync = useCallback(async () => {
    if (!identity || !navigator.onLine || !configured()) return;
    setSyncing(true);
    try {
      const active = (await supabase().auth.getSession()).data.session;
      if (!active || active.user.id !== identity.id)
        throw new Error('Sign in again to synchronize. Your local edits are preserved.');
      await synchronized(db(), identity.id, sendMutation);
      const remote = await fetchSessions();
      await mergeRemote(db(), identity.id, remote, true);
      setSyncError('');
    } catch (e) {
      reportError('sync', e);
      setSyncError(
        e instanceof Error ? e.message : 'Unable to synchronize. Local edits are saved.',
      );
    } finally {
      setSyncing(false);
    }
  }, [identity]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      if ((localStorage.getItem('prgrs-theme') || 'system') === 'system')
        document.documentElement.setAttribute('data-theme', media.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production')
      navigator.serviceWorker
        .register(`/sw.js?build=${process.env.NEXT_PUBLIC_RELEASE_ID}`, { updateViaCache: 'none' })
        .catch(() => setError('Offline shell could not be installed. Reload while connected.'));
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [setError]);
  useEffect(() => {
    let active = true;
    async function initialize() {
      setLoading(true);
      try {
        const cached = (await db().identities.toArray())[0];
        if (cached && active) setIdentity(cached);
        if (!configured()) return;
        const {
          data: { session },
          error: authError,
        } = await supabase().auth.getSession();
        if (authError) {
          if (!cached) throw authError;
          return;
        }
        if (!session) return;
        if (cached && cached.id !== session.user.id) {
          if (await db().outbox.count()) {
            await signOutDevice();
            throw new Error(
              'Unsynced work belongs to a different account. Sign in with that account first.',
            );
          }
          await clearAccount(db(), true);
          queryClient.clear();
        }
        let next: Identity = {
          id: session.user.id,
          email: session.user.email || '',
          name: cached?.id === session.user.id ? cached.name : 'Athlete',
          timezone:
            cached?.id === session.user.id
              ? cached.timezone
              : Intl.DateTimeFormat().resolvedOptions().timeZone,
          roles: cached?.id === session.user.id ? cached.roles : ['athlete'],
        };
        if (navigator.onLine) {
          const [profileResult, rolesResult] = await Promise.all([
            supabase().from('profiles').select('name,timezone').eq('id', next.id).single(),
            supabase().from('user_roles').select('role').eq('user_id', next.id),
          ]);
          const profile = unwrap(profileResult);
          const roles = unwrap(rolesResult);
          next = {
            ...next,
            name: profile.name || 'Athlete',
            timezone: profile.timezone,
            roles: roles
              .map((r) => r.role)
              .filter((role) => role === 'athlete' || role === 'coach'),
          };
        }
        await db().identities.put(next);
        if (active) setIdentity(next);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to open account');
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [boot, setError]);
  useEffect(() => {
    void sync();
    const timer = setInterval(() => void sync(), 30_000);
    const focus = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('online', sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener('online', sync);
    };
  }, [sync]);
  useEffect(() => {
    if (!pending.length || !online) return;
    const timer = setTimeout(() => void sync(), 600);
    return () => clearTimeout(timer);
  }, [pending.length, online, sync]);
  useEffect(() => {
    const hash = () => {
      const params = new URLSearchParams(location.hash.slice(1));
      const next = params.get('tab') as Tab;
      setTab(['home', 'workouts', 'history', 'profile', 'coach'].includes(next) ? next : 'home');
      setWorkout(params.get('workout'));
      window.scrollTo(0, 0);
    };
    hash();
    window.addEventListener('hashchange', hash);
    return () => window.removeEventListener('hashchange', hash);
  }, []);
  const navigate = (next: Tab, id?: string) => {
    location.hash = new URLSearchParams({ tab: next, ...(id ? { workout: id } : {}) }).toString();
    setMenu(false);
  };
  const open = (id: string) => navigate('workouts', id);
  async function logout() {
    try {
      if (await db().outbox.count()) {
        setError(
          'Sync or export and explicitly discard pending edits in Profile before signing out.',
        );
        navigate('profile');
        return;
      }
      if (configured()) {
        await signOutDevice();
      }
      await clearAccount(db(), true);
      queryClient.clear();
      setIdentity(null);
      navigate('home');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Unable to sign out. Local work is preserved.',
      );
    }
  }
  if (loading && !identity)
    return (
      <div className="splash">
        <Brand />
        <p>Opening your training…</p>
      </div>
    );
  if (!identity) return <Auth onAuthenticated={() => setBoot((v) => v + 1)} error={error} />;
  const selected = sessions.find((s) => s.id === workout && s.athleteId === identity.id);
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      {menu && (
        <button
          className="nav-backdrop"
          aria-label="Dismiss navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
        <button
          className="icon-button sidebar-close"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <a className="brand-link" href="#tab=home" aria-label="PRGRS home">
          <Brand />
        </a>
        <div className="sidebar-caption">YOUR TRAINING SPACE</div>
        <nav aria-label="Main navigation">
          {nav.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#tab=${id}`}
              className={tab === id ? 'active' : ''}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setMenu(false)}
            >
              <Icon size={21} />
              {label}
              {tab === id && <span className="nav-dot" />}
            </a>
          ))}
          {identity.roles.includes('coach') && (
            <a
              className={`coach-nav ${tab === 'coach' ? 'active' : ''}`}
              href="#tab=coach"
              onClick={() => setMenu(false)}
            >
              <Layers size={21} />
              Coach studio
            </a>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="small-note">
            Built for the work.
            <br />
            And everything it adds up to.
          </div>
          <button className="account-button" onClick={() => navigate('profile')}>
            <span className="avatar">{identity.name.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{identity.name}</strong>
              <small>{identity.roles.join(' + ')}</small>
            </span>
            <Settings size={18} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <a className="mobile-brand" href="#tab=home" aria-label="PRGRS home">
            <Brand />
          </a>
          <span className="breadcrumb">
            Your space <span>/</span>{' '}
            <strong>
              {tab === 'coach' ? 'Coach studio' : nav.find((n) => n.id === tab)?.label}
            </strong>
          </span>
          <div className="row">
            <span
              className={`sync-indicator ${!online ? 'offline' : syncError || pending.some((m) => m.error) ? 'error' : pending.length || syncing ? 'pending' : 'saved'}`}
              role="status"
            >
              {!online ? (
                <WifiOff size={15} />
              ) : syncing ? (
                <RefreshCw size={15} className="spin" />
              ) : (
                <span className="status-dot" />
              )}
              {!online
                ? 'Offline · saved on device'
                : syncError || pending.some((m) => m.error)
                  ? 'Sync needs attention'
                  : pending.length
                    ? `${pending.length} pending`
                    : syncing
                      ? 'Synchronizing'
                      : 'All changes saved'}
            </span>
            <button
              className="avatar small"
              aria-label="Open profile"
              onClick={() => navigate('profile')}
            >
              {identity.name.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {syncError && <Notice error>{syncError}</Notice>}
          {error && (
            <Notice error>
              <span>{error}</span>
              <button className="text-button" onClick={() => setError('')}>
                Dismiss
              </button>
            </Notice>
          )}
          {pending.some((m) => m.conflict) && (
            <Notice error>
              Changes from another device need review. Both versions are preserved.{' '}
              <button className="text-button" onClick={() => navigate('profile')}>
                Review conflicts
              </button>
            </Notice>
          )}
          {workout ? (
            selected ? (
              <Workout
                key={selected.id}
                session={selected}
                sessions={own}
                ownerId={identity.id}
                onBack={() => navigate('workouts')}
                onError={setError}
              />
            ) : (
              <Empty title="Workout unavailable">
                Open a synchronized workout from your calendar.
              </Empty>
            )
          ) : tab === 'home' ? (
            <Dashboard
              identity={identity}
              sessions={own}
              today={today}
              onOpen={open}
              onCalendar={() => navigate('workouts')}
            />
          ) : tab === 'workouts' ? (
            <Calendar sessions={own} today={today} onOpen={open} />
          ) : tab === 'history' ? (
            <HistoryView sessions={own} today={today} onOpen={open} />
          ) : tab === 'coach' ? (
            identity.roles.includes('coach') ? (
              <Coach identity={identity} sessions={sessions} today={today} onRefresh={sync} />
            ) : (
              <Empty title="Coach capability required">
                Ask your administrator to grant the coach capability.
              </Empty>
            )
          ) : (
            <Profile
              identity={identity}
              onUpdate={(next) => {
                setIdentity(next);
                void db().identities.put(next);
              }}
              onLogout={logout}
              onSync={sync}
              pending={pending}
              onError={setError}
              onReauth={() => {
                setIdentity(null);
              }}
            />
          )}
        </main>
        <footer className="desktop-footer">
          <span>PRGRS</span>
          <span>Progress over perfection.</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#tab=${id}`}
            className={tab === id ? 'active' : ''}
            aria-current={tab === id ? 'page' : undefined}
          >
            <Icon size={22} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
function Auth({
  onAuthenticated,
  error: outerError,
}: {
  onAuthenticated: () => void;
  error: string;
}) {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const f = new FormData(event.currentTarget);
    try {
      const email = String(f.get('email')),
        password = String(f.get('password'));
      const result = signup
        ? await supabase().auth.signUp({
            email,
            password,
            options: {
              data: {
                name: String(f.get('name')),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
              emailRedirectTo: location.origin,
            },
          })
        : await supabase().auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (result.data.session) onAuthenticated();
      else setMessage('Check your email to confirm your account, then sign in.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <Link href="/" className="brand-link" aria-label="PRGRS home">
          <Brand />
        </Link>
        <div>
          <p className="eyebrow">YOUR TRAINING. YOUR JOURNEY.</p>
          <h1>
            Show up.
            <br />
            Put in the work.
            <br />
            <span>See the growth.</span>
          </h1>
          <p>
            One session at a time. A training space that keeps up with you, even when your
            connection doesn’t.
          </p>
        </div>
        <p className="brand-rationale">
          The name is incomplete by design. Because progress never ends.
        </p>
      </section>
      <section className="auth-form">
        <div className="auth-form-inner">
          <span className="section-kicker">LET’S GET TO WORK</span>
          <h2>{signup ? 'Start your journey.' : 'Welcome back.'}</h2>
          <p className="muted">Track the work. See the growth.</p>
          {!configured() ? (
            <Notice>
              <strong>Your training space is ready to connect.</strong>
              <p>
                Add the Supabase project URL and public publishable key to <code>.env.local</code>,
                then restart the app.
              </p>
              <p>{configuration().error}</p>
              <p>
                Follow <code>docs/SETUP_AND_CONFIGURATION.md</code> to create your account and
                import your first program.
              </p>
            </Notice>
          ) : (
            <form onSubmit={submit} className="stack">
              {signup && (
                <label>
                  Your name
                  <input
                    name="name"
                    autoComplete="name"
                    maxLength={160}
                    required
                    placeholder="Your name"
                  />
                </label>
              )}
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  required
                  placeholder="At least 8 characters"
                />
              </label>
              <button className="button primary full" disabled={busy}>
                {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
                <ArrowRight size={18} />
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setSignup(!signup);
                  setError('');
                  setMessage('');
                }}
              >
                {signup ? 'Already have an account? Sign in' : 'New to PRGRS? Create an account'}
              </button>
            </form>
          )}
          {(error || outerError) && <Notice error>{error || outerError}</Notice>}
          {message && <Notice>{message}</Notice>}
          <div className="auth-trust">
            <Check size={16} />
            Your work, saved. Online or offline.
          </div>
        </div>
      </section>
    </div>
  );
}
function Dashboard({
  identity,
  sessions,
  today,
  onOpen,
  onCalendar,
}: {
  identity: Identity;
  sessions: WorkoutSession[];
  today: string;
  onOpen: (id: string) => void;
  onCalendar: () => void;
}) {
  const start = weekStart(today),
    end = shiftDate(start, 6),
    week = sessions.filter((s) => s.date >= start && s.date <= end),
    month = sessions.filter((s) => s.date.slice(0, 7) === today.slice(0, 7)),
    day = sessions.filter((s) => s.date === today),
    active = day.find((s) => s.status !== 'finished' && s.status !== 'skipped') || day[0],
    c = completion(week),
    a = adherence(week, today),
    monthly = completion(month),
    ma = adherence(month, today),
    overall = completion(sessions.filter((s) => s.date <= today)),
    recent = sessions
      .filter((s) => s.status === 'finished')
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="section-kicker">
            {formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1>
            Let’s get to work, {identity.name.split(' ')[0]}
            <span className="accent">.</span>
          </h1>
          <p className="muted">A little work today. A stronger you tomorrow.</p>
        </div>
        <button className="button secondary" onClick={onCalendar}>
          <CalendarDays size={18} />
          View schedule
        </button>
      </div>
      <div className="dashboard-grid">
        <section className="today-card">
          <div className="row between">
            <span className="eyebrow">TODAY’S TRAINING</span>
            <span className="pill">{active ? active.status.replace('_', ' ') : 'Recovery'}</span>
          </div>
          <div className="today-body">
            <span className="workout-number">
              {active
                ? String(sessions.filter((s) => s.date <= today).length).padStart(2, '0')
                : '↗'}
            </span>
            <div>
              <h2>{active ? active.title : 'Room to recover.'}</h2>
              <p>
                {active
                  ? 'Your next step is right here.'
                  : 'No workout scheduled today. Your calendar has what’s next.'}
              </p>
            </div>
          </div>
          {active ? (
            <>
              <div className="row between">
                <span>
                  {completion([active]).completed} of {completion([active]).total} exercises
                </span>
                <strong>
                  {completion([active]).percent ?? '—'}
                  {completion([active]).percent !== null ? '%' : ''}
                </strong>
              </div>
              <Meter
                value={completion([active]).percent}
                label="Featured workout exercise completion"
              />
              <button className="button dark full" onClick={() => onOpen(active.id)}>
                {active.status === 'finished'
                  ? 'Review workout'
                  : active.status === 'in_progress'
                    ? 'Continue workout'
                    : 'Open workout'}
                <ArrowRight size={19} />
              </button>
            </>
          ) : (
            <button className="button dark" onClick={onCalendar}>
              Explore your week
              <ArrowRight size={18} />
            </button>
          )}
        </section>
        <section className="panel week-panel">
          <div className="row between">
            <h2>This week</h2>
            <span className="muted text-sm">
              {formatDate(start)}–{formatDate(end)}
            </span>
          </div>
          <div className="week-strip">
            {Array.from({ length: 7 }, (_, i) => {
              const d = shiftDate(start, i),
                s = week.filter((s) => s.date === d),
                finished = s.length > 0 && s.every((x) => x.status === 'finished');
              return (
                <button
                  key={d}
                  className={`week-day ${d === today ? 'today' : ''}`}
                  onClick={onCalendar}
                  aria-label={`View ${formatDate(d)} · ${s.length ? `${s.length} sessions${finished ? ', all finished' : ', scheduled'}` : 'No sessions'}`}
                >
                  <span>{formatDate(d, { weekday: 'narrow' })}</span>
                  <strong>{Number(d.slice(-2))}</strong>
                  <span
                    className={`day-mark ${s.length ? 'scheduled' : ''} ${finished ? 'finished' : ''}`}
                  >
                    {finished ? <Check size={11} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="stat-pair">
            <div>
              <span className="stat-value">
                {a.finished}
                <span className="muted"> / {a.due}</span>
              </span>
              <p>Due sessions finished</p>
            </div>
            <div>
              <span className="stat-value">{c.percent === null ? 'N/A' : `${c.percent}%`}</span>
              <p>Exercise completion</p>
            </div>
          </div>
          <Meter value={c.percent} label="Week exercise completion" />
          <p className="small-note">
            {c.completed} of {c.total} exercises · {week.length} sessions scheduled
          </p>
        </section>
        <section className="panel recent-panel">
          <div className="row between">
            <div>
              <span className="section-kicker">THE WORK ADDS UP</span>
              <h2>Recent sessions</h2>
            </div>
            <Activity size={20} className="muted" />
          </div>
          {recent.length ? (
            recent.map((s) => <SessionCard key={s.id} session={s} today={today} onOpen={onOpen} />)
          ) : (
            <Empty title="Your story starts here">
              Finished sessions will appear here. Every bit of work counts.
            </Empty>
          )}
        </section>
        <section className="panel month-panel">
          <span className="section-kicker">{formatDate(today, { month: 'long' })} IN FOCUS</span>
          <h2>Consistency, in context.</h2>
          <div className="month-stat">
            <strong>{ma.percent === null ? 'N/A' : `${ma.percent}%`}</strong>
            <span>
              Workout adherence
              <br />
              <small>
                {ma.finished} finished / {ma.due} due
              </small>
            </span>
          </div>
          <div className="metric-row">
            <span>Monthly exercise completion</span>
            <strong>{monthly.percent === null ? 'N/A' : `${monthly.percent}%`}</strong>
          </div>
          <Meter value={monthly.percent} label="Month exercise completion" />
          <div className="metric-row">
            <span>Overall exercise completion</span>
            <strong>{overall.percent === null ? 'N/A' : `${overall.percent}%`}</strong>
          </div>
          <p className="small-note">
            Finished sessions and completed exercises tell different parts of your journey.
          </p>
        </section>
      </div>
      {day.length > 1 && (
        <section className="panel">
          <h2>Also on your schedule today</h2>
          {day
            .filter((s) => s.id !== active?.id)
            .map((s) => (
              <SessionCard key={s.id} session={s} today={today} onOpen={onOpen} />
            ))}
        </section>
      )}
    </>
  );
}
function Calendar({
  sessions,
  today,
  onOpen,
}: {
  sessions: WorkoutSession[];
  today: string;
  onOpen: (id: string) => void;
}) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('week'),
    [date, setDate] = useState(today);
  const start =
    view === 'day' ? date : view === 'week' ? weekStart(date) : date.slice(0, 7) + '-01';
  const count =
    view === 'day'
      ? 1
      : view === 'week'
        ? 7
        : new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();
  const range = sessions.filter((s) => s.date >= start && s.date <= shiftDate(start, count - 1)),
    c = completion(range),
    a = adherence(range, today);
  function move(direction: number) {
    if (view === 'month') {
      const d = new Date(date + 'T12:00:00Z');
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + direction);
      setDate(d.toISOString().slice(0, 10));
    } else setDate(shiftDate(date, direction * (view === 'week' ? 7 : 1)));
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">MAKE SPACE FOR THE WORK</span>
          <h1>Your training.</h1>
          <p className="muted">A plan for what’s next. A record of what you did.</p>
        </div>
        <div className="segmented" aria-label="Calendar view">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button
              aria-pressed={v === view}
              className={v === view ? 'selected' : ''}
              key={v}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <section className="panel">
        <div className="calendar-toolbar">
          <h2>
            {view === 'day'
              ? formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })
              : formatDate(date, { month: 'long', year: 'numeric' })}
          </h2>
          <div className="row">
            <button className="button secondary compact" onClick={() => setDate(today)}>
              Today
            </button>
            <button
              className="icon-button"
              aria-label={`Previous ${view}`}
              onClick={() => move(-1)}
            >
              <ChevronLeft />
            </button>
            <button className="icon-button" aria-label={`Next ${view}`} onClick={() => move(1)}>
              <ChevronRight />
            </button>
          </div>
        </div>
        <p className="small-note" aria-live="polite">
          {view[0].toUpperCase() + view.slice(1)} exercise completion:{' '}
          {c.percent === null ? 'N/A' : `${c.percent}%`} · {c.completed}/{c.total} exercises.{' '}
          Workout adherence: {a.percent === null ? 'N/A' : `${a.percent}%`} · {a.finished}/{a.due}{' '}
          due sessions finished.
        </p>
        <div className={view === 'month' ? 'month-grid' : 'calendar-list'}>
          {view === 'month' &&
            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span className="month-weekday" key={d}>
                {d}
              </span>
            ))}
          {view === 'month' &&
            Array.from({ length: (new Date(start + 'T12:00:00Z').getUTCDay() + 6) % 7 }, (_, i) => (
              <div className="month-blank" key={`blank-${i}`} />
            ))}
          {Array.from({ length: count }, (_, i) => {
            const d = shiftDate(start, i),
              items = sessions.filter((s) => s.date === d);
            return (
              <div key={d} className={`calendar-day ${d === today ? 'is-today' : ''}`}>
                <button
                  className="calendar-date"
                  onClick={() => {
                    setDate(d);
                    setView('day');
                  }}
                >
                  <span>{view !== 'month' ? formatDate(d, { weekday: 'short' }) : ''}</span>
                  <strong>{Number(d.slice(-2))}</strong>
                  {d === today && <span className="today-label">TODAY</span>}
                </button>
                <div className="calendar-items">
                  {items.length ? (
                    items.map((s) =>
                      view === 'month' ? (
                        <button
                          key={s.id}
                          className={`month-session ${s.status === 'finished' ? 'complete' : ''}`}
                          onClick={() => onOpen(s.id)}
                        >
                          <span className="status-dot" />
                          <span>
                            {s.title}
                            <br />
                            {statusLabel(s, today)}
                          </span>
                        </button>
                      ) : (
                        <SessionCard key={s.id} session={s} today={today} onOpen={onOpen} />
                      ),
                    )
                  ) : (
                    <span className="rest-label">No sessions</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
function HistoryView({
  sessions,
  today,
  onOpen,
}: {
  sessions: WorkoutSession[];
  today: string;
  onOpen: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const history = sessions
    .filter(
      (s) =>
        (s.date < today || s.status !== 'scheduled') &&
        s.title.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const c = completion(history),
    a = adherence(history, today);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">EVIDENCE OF YOUR EFFORT</span>
          <h1>The work you’ve put in.</h1>
          <p className="muted">Your sessions, your results, your journey.</p>
        </div>
      </div>
      <div className="summary-cards">
        <div className="panel">
          <strong className="stat-value">{a.finished}</strong>
          <p>Finished sessions</p>
        </div>
        <div className="panel">
          <strong className="stat-value">{c.percent === null ? 'N/A' : `${c.percent}%`}</strong>
          <p>
            Exercise completion · {c.completed}/{c.total}
          </p>
        </div>
        <div className="panel">
          <strong className="stat-value">{a.percent === null ? 'N/A' : `${a.percent}%`}</strong>
          <p>
            Workout adherence · {a.finished}/{a.due} due
          </p>
        </div>
      </div>
      <section className="panel">
        <label className="search-field">
          Search sessions
          <input
            type="search"
            placeholder="Find a workout…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {history.length ? (
          history.map((s) => <SessionCard key={s.id} session={s} today={today} onOpen={onOpen} />)
        ) : (
          <Empty title="No sessions yet">
            Your training history appears as you put in the work.
          </Empty>
        )}
      </section>
    </>
  );
}
function Profile({
  identity,
  onUpdate,
  onLogout,
  onSync,
  pending,
  onError,
  onReauth,
}: {
  identity: Identity;
  onUpdate: (i: Identity) => void;
  onLogout: () => void;
  onSync: () => Promise<void>;
  pending: import('@/lib/db').Mutation[];
  onError: (s: string) => void;
  onReauth: () => void;
}) {
  const [theme, setTheme] = useState('system'),
    [saved, setSaved] = useState(''),
    [conflict, setConflict] = useState<{ remote: WorkoutSession; local: WorkoutSession } | null>(
      null,
    ),
    [invitations, setInvitations] = useState<
      { coach_id: string; accepted: boolean; profiles: { name: string } | null }[]
    >([]);
  useEffect(() => {
    setTheme(localStorage.getItem('prgrs-theme') || 'system');
    if (navigator.onLine && configured())
      void supabase()
        .from('coach_athletes')
        .select('coach_id,accepted,profiles!coach_athletes_coach_id_fkey(name)')
        .eq('athlete_id', identity.id)
        .then((r) => {
          if (r.error) onError(r.error.message);
          else setInvitations(r.data as unknown as typeof invitations);
        });
  }, [identity.id, onError]);
  function changeTheme(value: string) {
    setTheme(value);
    localStorage.setItem('prgrs-theme', value);
    document.documentElement.setAttribute(
      'data-theme',
      value === 'system'
        ? matchMedia('(prefers-color-scheme:dark)').matches
          ? 'dark'
          : 'light'
        : value,
    );
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget),
        next = { ...identity, name: String(f.get('name')), timezone: String(f.get('timezone')) };
      unwrap(
        await supabase()
          .from('profiles')
          .update({ name: next.name, timezone: next.timezone })
          .eq('id', identity.id),
      );
      onUpdate(next);
      setSaved('Profile saved');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unable to save profile');
    }
  }
  function exportData() {
    const blob = new Blob(
      [
        JSON.stringify(
          { identityId: identity.id, exportedAt: new Date().toISOString(), mutations: pending },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'prgrs-pending-edits.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function review(id: string) {
    try {
      const remote = (await fetchSessions()).find((s) => s.id === id),
        local = await db().sessions.get(id);
      if (!remote || !local)
        throw new Error('Workout not available. Export your local edits before changing accounts.');
      setConflict({ remote, local });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Cannot load conflict');
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">YOUR SPACE, YOUR WAY</span>
          <h1>Profile & preferences.</h1>
          <p className="muted">Make yourself at home.</p>
        </div>
      </div>
      <div className="profile-grid">
        <section className="panel stack">
          <div className="row">
            <span className="avatar large">{identity.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <h2>{identity.name}</h2>
              <p className="muted">{identity.email}</p>
              <span className="badge">{identity.roles.join(' + ')}</span>
            </div>
          </div>
          <form onSubmit={save} className="stack">
            <label>
              Name
              <input name="name" defaultValue={identity.name} maxLength={160} required />
            </label>
            <label>
              Training timezone
              <select name="timezone" defaultValue={identity.timezone}>
                {Array.from(
                  new Set([identity.timezone, ...Intl.supportedValuesOf('timeZone'), 'UTC']),
                ).map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
            <button className="button primary">Save profile</button>
            {saved && <p role="status">{saved}</p>}
          </form>
          <label>
            Your athlete ID
            <input value={identity.id} readOnly onFocus={(e) => e.target.select()} />
            <small className="muted">Share with your coach to receive a coaching request.</small>
          </label>
          <h3>Appearance</h3>
          <div className="segmented">
            {['light', 'dark', 'system'].map((v) => (
              <button
                aria-pressed={theme === v}
                className={theme === v ? 'selected' : ''}
                key={v}
                onClick={() => changeTheme(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <button className="button secondary" onClick={onLogout}>
            <LogOut size={18} />
            Sign out
          </button>
          <button className="text-button" onClick={onReauth}>
            Sign in again to refresh authentication
          </button>
        </section>
        <div className="stack">
          <section className="panel stack">
            <div className="row between">
              <h2>Saved with care.</h2>
              <CloudOff size={22} />
            </div>
            <p className="muted">
              {pending.length
                ? `${pending.length} changes waiting to sync. They stay on this device until acknowledged.`
                : 'All your local changes have been synchronized.'}
            </p>
            <button className="button secondary" onClick={() => void onSync()}>
              <RefreshCw size={18} />
              Sync now
            </button>
            {pending.length > 0 && (
              <>
                {Array.from(new Set(pending.map((m) => m.error).filter(Boolean))).map((message) => (
                  <Notice error key={message}>
                    {message}
                  </Notice>
                ))}
                <button className="button secondary" onClick={exportData}>
                  Export pending edits
                </button>
                {Array.from(new Set(pending.filter((m) => m.conflict).map((m) => m.sessionId))).map(
                  (id) => (
                    <button className="button secondary" key={id} onClick={() => void review(id)}>
                      Review workout conflict
                    </button>
                  ),
                )}
                <details>
                  <summary>Discard local data</summary>
                  <p>This permanently removes unsynced edits on this device. Export them first.</p>
                  <button
                    className="button danger"
                    onClick={async () => {
                      if (
                        window.confirm(
                          'Permanently discard unsynced workout edits and sign out on this device?',
                        )
                      ) {
                        try {
                          await discardAccount(
                            db(),
                            identity.id,
                            pending.map((m) => m.id),
                          );
                          queryClient.clear();
                          if (configured()) {
                            await signOutDevice();
                          }
                          location.reload();
                        } catch (e) {
                          onError(
                            e instanceof Error ? e.message : 'Unable to discard and sign out.',
                          );
                        }
                      }
                    }}
                  >
                    Discard and sign out
                  </button>
                </details>
              </>
            )}
            <p className="small-note">
              For offline use, open the app once while connected. External reference videos need a
              connection. Cached training stays on this device until you sign out.
            </p>
          </section>
          <section className="panel stack">
            <h2>Coaching connections</h2>
            {invitations.length ? (
              invitations.map((i) => (
                <div className="stack" key={i.coach_id}>
                  <strong>{i.profiles?.name || i.coach_id}</strong>
                  <span>
                    {i.accepted
                      ? 'Active coach'
                      : 'Requests access to your training history and schedule.'}
                  </span>
                  <div className="row">
                    {!i.accepted && (
                      <button
                        className="button primary"
                        onClick={async () => {
                          try {
                            unwrap(
                              await supabase().rpc('respond_coaching', {
                                p_coach: i.coach_id,
                                p_accept: true,
                              }),
                            );
                            setInvitations(
                              invitations.map((v) =>
                                v.coach_id === i.coach_id ? { ...v, accepted: true } : v,
                              ),
                            );
                          } catch (e) {
                            onError(String(e));
                          }
                        }}
                      >
                        Accept
                      </button>
                    )}
                    <button
                      className="button secondary"
                      onClick={async () => {
                        try {
                          unwrap(
                            await supabase().rpc('respond_coaching', {
                              p_coach: i.coach_id,
                              p_accept: false,
                            }),
                          );
                          setInvitations(invitations.filter((v) => v.coach_id !== i.coach_id));
                        } catch (e) {
                          onError(String(e));
                        }
                      }}
                    >
                      {i.accepted ? 'Revoke access' : 'Decline'}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No coaching requests. You can train independently.</p>
            )}
          </section>
          <section className="panel">
            <div className="small-brand">
              <Brand />
            </div>
            <p>The name is incomplete by design. Because progress never ends.</p>
            <p className="small-note">
              To install: use Add to Home Screen in Safari, or Install app in Chrome’s menu. Offline
              data is stored in this browser’s device storage.
            </p>
          </section>
        </div>
      </div>
      {conflict && (
        <Modal title="Two versions of your workout" onClose={() => setConflict(null)}>
          <p>
            Compare both versions. Nothing is discarded until you choose. Export pending edits for a
            backup.
          </p>
          <div className="conflict-grid">
            {[
              { label: 'This device', data: conflict.local },
              { label: 'Server', data: conflict.remote },
            ].map((v) => (
              <div key={v.label}>
                <h3>
                  {v.label} · {v.data.status}
                </h3>
                <p>
                  {completion([v.data]).completed}/{completion([v.data]).total} completed
                </p>
                {v.data.blocks
                  .flatMap((b) => b.entries)
                  .map((e) => (
                    <p key={e.id}>
                      <strong>{e.name}</strong>
                      <br />
                      {e.completed ? 'Complete' : 'Unchecked'} · {e.load || 'No load'}
                      <br />
                      {e.notes}
                    </p>
                  ))}
              </div>
            ))}
          </div>
          <div className="stack">
            <button
              className="button primary"
              onClick={async () => {
                try {
                  await resolveConflict(
                    db(),
                    identity.id,
                    conflict.remote,
                    'local',
                    conflict.local.version,
                  );
                  setConflict(null);
                  void onSync();
                } catch (e) {
                  setConflict(null);
                  onError(e instanceof Error ? e.message : 'Unable to resolve conflict.');
                }
              }}
            >
              Keep this device’s edits and sync
            </button>
            <button
              className="button secondary"
              onClick={async () => {
                if (
                  window.confirm('Replace this device’s pending edits with the server version?')
                ) {
                  try {
                    await resolveConflict(
                      db(),
                      identity.id,
                      conflict.remote,
                      'remote',
                      conflict.local.version,
                    );
                    setConflict(null);
                  } catch (e) {
                    setConflict(null);
                    onError(e instanceof Error ? e.message : 'Unable to resolve conflict.');
                  }
                }
              }}
            >
              Use server version
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
