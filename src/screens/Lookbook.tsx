import type { Dispatch } from 'react';
import { favoriteLook, type Action, type Session } from '../state/session';

export function Lookbook({ session, dispatch }: { session: Session; dispatch: Dispatch<Action> }) {
  const favorite = favoriteLook(session);
  // Opened from the selfie screen before any photo: there is no studio to go back to yet.
  const back = () => dispatch({ type: 'GO', view: session.selfie ? 'studio' : 'selfie' });

  return (
    <main className="screen lookbook">
      <div className="lookbook-head">
        <h1 className="display">Your lookbook</h1>
        <button type="button" className="btn btn-ghost btn-small" onClick={back}>
          Back
        </button>
      </div>

      {session.looks.length === 0 ? (
        <section className="panel empty">
          <p className="notice">No looks yet. Pick a style to get started.</p>
          <button type="button" className="btn btn-gold" onClick={back}>
            Pick a style
          </button>
        </section>
      ) : (
        <>
          <ul className="grid">
            {session.looks.map((look) => (
              <li key={look.id} className={`card${look.favorite ? ' fav' : ''}`}>
                <button
                  type="button"
                  className="card-open"
                  aria-label={`Open ${look.label}`}
                  onClick={() => {
                    dispatch({ type: 'SELECT_LOOK', id: look.id });
                    dispatch({ type: 'GO', view: 'studio' });
                  }}
                >
                  <img src={look.image} alt={look.label} />
                  <span>{look.label}</span>
                </button>
                <button
                  type="button"
                  className="card-star"
                  aria-label={`${look.favorite ? 'Unfavourite' : 'Favourite'} ${look.label}`}
                  onClick={() => dispatch({ type: 'TOGGLE_FAVORITE', id: look.id })}
                >
                  {look.favorite ? '★' : '☆'}
                </button>
              </li>
            ))}
          </ul>
          <div className="show-barber">
            {!favorite && <p className="hint">Tap ☆ on your favourite to show your barber.</p>}
            <button
              type="button"
              className="btn btn-gold"
              disabled={!favorite}
              onClick={() => dispatch({ type: 'GO', view: 'barber' })}
            >
              Show my barber{favorite ? ` ★ ${favorite.label}` : ''}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
