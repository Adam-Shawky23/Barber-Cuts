import { useEffect, useRef, useState, type Dispatch, type FormEvent } from 'react';
import { MAX_DESCRIPTION, STYLES } from '../../shared/styles';
import { tryOn, TryOnFailure } from '../lib/api';
import type { Action, Session } from '../state/session';

const BUSY = 'The AI is busy right now. Try again in a minute.';
const FAILED = 'Something went wrong making your look.';
const WAIT_HINT = 'Free AI · usually 10–60 seconds.';

type Request = { label: string; styleId?: string; description?: string };

// Unique within the page. crypto.randomUUID() needs a secure context, so it breaks over plain http.
let lookCounter = 0;
function newLookId(): string {
  lookCounter += 1;
  return `look-${Date.now()}-${lookCounter}`;
}

export function StudioScreen({
  session,
  dispatch,
}: {
  session: Session;
  dispatch: Dispatch<Action>;
}) {
  const [description, setDescription] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const lastRequest = useRef<Request | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Leaving the studio abandons the generation: abort it so the server can stop too.
  useEffect(() => () => abortRef.current?.abort(), []);

  const pending = session.pending;
  const busy = pending !== null;
  const look = session.looks.find((l) => l.id === session.currentLookId);
  const trimmed = description.trim();

  async function run(req: Request) {
    const image = session.selfie;
    if (!image || inFlight.current || session.pending) return;
    inFlight.current = true;
    lastRequest.current = req;
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'START', label: req.label });
    try {
      const result = await tryOn(
        req.styleId ? { image, styleId: req.styleId } : { image, description: req.description },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      dispatch({
        type: 'SUCCESS',
        look: { id: newLookId(), label: result.label, image: result.image },
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      dispatch({ type: 'FAIL', error: err instanceof TryOnFailure ? err.code : 'FAILED' });
    } finally {
      inFlight.current = false;
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function onDescribe(e: FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    setSelectedId(null);
    void run({ label: trimmed, description: trimmed });
  }

  return (
    <main className="screen split studio">
      <div className="stage">
        {busy || !look ? (
          session.selfie && (
            <img src={session.selfie} alt="Your selfie" className={busy ? 'dimmed' : undefined} />
          )
        ) : (
          <>
            <img key={look.id} src={look.image} alt={`You with ${look.label}`} className="reveal" />
            <div className="stylename">
              <b className="display">{look.label}</b>
              <small>Tap another style to compare</small>
            </div>
          </>
        )}
        {pending && (
          <div className="waiting" role="status">
            <div className="scan" aria-hidden="true" />
            <div className="clip">
              <span className="snip" aria-hidden="true">
                ✂️
              </span>
              <p>Cutting your {pending.label.toLowerCase()}…</p>
            </div>
          </div>
        )}
      </div>

      <section className="panel controls studio-controls">
        {pending && (
          <div>
            <div className="bar" role="progressbar" aria-label="Making your look">
              <i />
            </div>
            <p className="hint">{WAIT_HINT}</p>
          </div>
        )}

        {!busy && session.error && (
          <div className="try-error" role="alert">
            <p className="error">{session.error === 'BUSY' ? BUSY : FAILED}</p>
            <button
              type="button"
              className="btn btn-gold btn-small"
              onClick={() => lastRequest.current && void run(lastRequest.current)}
            >
              Try again
            </button>
          </div>
        )}

        <h2 className="section-title desktop-only">Pick a cut</h2>
        <div className="strip">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`thumb${selectedId === s.id ? ' on' : ''}`}
              disabled={busy}
              onClick={() => {
                setSelectedId(s.id);
                void run({ label: s.name, styleId: s.id });
              }}
            >
              <span className="t" aria-hidden="true">
                {s.icon}
              </span>
              {s.name}
            </button>
          ))}
        </div>

        <h2 className="section-title desktop-only">Or describe your own</h2>
        <form className="ask" onSubmit={onDescribe}>
          <input
            type="text"
            aria-label="Or describe it…"
            placeholder="Or describe it… 'low taper, curls'"
            maxLength={MAX_DESCRIPTION}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button type="submit" className="btn btn-gold" disabled={busy || !trimmed}>
            Go
          </button>
        </form>

        <button
          type="button"
          className="link"
          disabled={busy}
          onClick={() => dispatch({ type: 'RETAKE' })}
        >
          Retake selfie
        </button>
      </section>
    </main>
  );
}
