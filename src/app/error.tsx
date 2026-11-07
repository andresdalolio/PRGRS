'use client';
import { useEffect } from 'react';
import { reportError } from '@/lib/observability';
export default function ApplicationError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => reportError('render', error), [error]);
  return (
    <main className="splash">
      <h1>Unable to open your training.</h1>
      <p>
        Your saved local edits have not been cleared. Keep this browser’s data while recovering.
      </p>
      <p>Check that browser storage is available, then try again.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
