'use client';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { type Feedback, saveFeedback, fetchFeedback, resolveFeedback } from '@/lib/feedback';
import { Modal, Empty } from './ui';
export default function FeedbackSection({
  ownerId,
  onError,
}: {
  ownerId: string;
  onError: (s: string) => void;
}) {
  const items = useLiveQuery(
    () => db().feedback.where('ownerId').equals(ownerId).toArray(),
    [ownerId],
    [],
  );
  const pending = useLiveQuery(
    () => db().feedbackOutbox.where('ownerId').equals(ownerId).toArray(),
    [ownerId],
    [],
  );
  const [editing, setEditing] = useState<Feedback | 'new' | null>(null);
  const [review, setReview] = useState<{ local: Feedback; remote?: Feedback } | null>(null);
  const [busy, setBusy] = useState(false);
  async function act(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to save feedback');
    }
  }
  const visible = items
    .filter((i) => !i.deleted)
    .sort(
      (a, b) =>
        Number(a.implemented) - Number(b.implemented) || b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <section className="panel stack" id="feedback">
      <div className="row between">
        <h2>Feedback & ideas</h2>
        <button className="button secondary" onClick={() => setEditing('new')}>
          Add idea
        </button>
      </div>
      <p className="muted">
        A personal place for bugs, ideas and improvements. Saved on this device, then synchronized.
      </p>
      {pending.length > 0 && (
        <p role="status">{pending.length} feedback changes waiting to sync.</p>
      )}
      {Array.from(new Set(pending.filter((m) => m.error).map((m) => m.itemId))).map((id) => (
        <div className="stack" key={id}>
          <p role="alert">{pending.find((m) => m.itemId === id && m.error)?.error}</p>
          <button
            className="button secondary"
            onClick={() =>
              void act(async () => {
                const local = await db().feedback.get(id);
                const remote = (await fetchFeedback()).find((i) => i.id === id);
                if (local) setReview({ local, remote });
              })
            }
          >
            Review feedback sync issue
          </button>
        </div>
      ))}
      {visible.length ? (
        visible.map((item) => (
          <article className="history-result stack" key={item.id}>
            <label className="row feedback-check">
              <FeedbackToggle key={item.version} item={item} ownerId={ownerId} onError={onError} />
              <strong>{item.title}</strong>
            </label>
            <span className="badge">{item.implemented ? 'Implemented' : 'Open'}</span>
            {item.description && <p style={{ whiteSpace: 'pre-wrap' }}>{item.description}</p>}
            <p className="small-note">Created {new Date(item.createdAt).toLocaleDateString()}</p>
            <div className="row wrap">
              <button className="text-button" onClick={() => setEditing(item)}>
                Edit idea
              </button>
              <button
                className="text-button"
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete “${item.title}”? This permanently removes this feedback item.`,
                    )
                  )
                    void act(() => saveFeedback(db(), ownerId, item.id, { deleted: true }));
                }}
              >
                Delete idea
              </button>
            </div>
          </article>
        ))
      ) : (
        <Empty title="Room for your next idea">Capture improvements as you train.</Empty>
      )}
      {editing && (
        <Modal
          title={editing === 'new' ? 'Add idea' : 'Edit idea'}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setBusy(true);
              try {
                await saveFeedback(db(), ownerId, editing === 'new' ? null : editing.id, {
                  title: String(data.get('title')),
                  description: String(data.get('description')),
                });
                setEditing(null);
              } catch (error) {
                onError(error instanceof Error ? error.message : 'Unable to save idea');
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Idea title
              <input
                name="title"
                maxLength={160}
                required
                defaultValue={editing === 'new' ? '' : editing.title}
              />
            </label>
            <label>
              Description (optional)
              <textarea
                name="description"
                maxLength={4000}
                rows={4}
                defaultValue={editing === 'new' ? '' : editing.description}
              />
            </label>
            <button className="button primary" disabled={busy}>
              Save idea
            </button>
          </form>
        </Modal>
      )}
      {review && (
        <Modal title="Review feedback versions" onClose={() => setReview(null)}>
          <div className="stack">
            {[
              { label: 'This device', item: review.local },
              { label: 'Server', item: review.remote },
            ].map((v) => (
              <div key={v.label}>
                <h3>{v.label}</h3>
                <p>{v.item?.title || 'No saved item'}</p>
                <p>{v.item?.description}</p>
                <p>{v.item?.deleted ? 'Deleted' : v.item?.implemented ? 'Implemented' : 'Open'}</p>
              </div>
            ))}
            {!review.remote?.deleted && (
              <button
                className="button primary"
                onClick={() =>
                  void act(async () => {
                    await resolveFeedback(db(), ownerId, review.local, review.remote, 'local');
                    setReview(null);
                  })
                }
              >
                Keep this device’s feedback
              </button>
            )}
            <button
              className="button secondary"
              onClick={() => {
                if (
                  window.confirm(
                    'Replace this device’s pending feedback with the reviewed server version?',
                  )
                )
                  void act(async () => {
                    await resolveFeedback(db(), ownerId, review.local, review.remote, 'remote');
                    setReview(null);
                  });
              }}
            >
              Use server feedback
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function FeedbackToggle({
  item,
  ownerId,
  onError,
}: {
  item: Feedback;
  ownerId: string;
  onError: (s: string) => void;
}) {
  const [checked, setChecked] = useState(item.implemented),
    [saving, setSaving] = useState(false);
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={saving}
      aria-label={`Implemented: ${item.title}`}
      onChange={async (e) => {
        const next = e.currentTarget.checked;
        setChecked(next);
        setSaving(true);
        try {
          await saveFeedback(db(), ownerId, item.id, { implemented: next });
        } catch (error) {
          setChecked(item.implemented);
          onError(error instanceof Error ? error.message : 'Unable to save feedback');
        } finally {
          setSaving(false);
        }
      }}
    />
  );
}
