import type { Dispatch } from 'react';
import { favoriteLook, type Action, type Session } from '../state/session';

export function Lookbook({ session, dispatch }: { session: Session; dispatch: Dispatch<Action> }) {
  const favorite = favoriteLook(session);

  return (
    <main className="screen lookbook">
      {session.looks.length === 0 ? (
        <section className="panel">
          <p className="notice">No looks yet. Pick a style to get started.</p>
        </section>
      ) : (
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
      )}
      <button
        type="button"
        className="btn btn-gold show-barber"
        disabled={!favorite}
        onClick={() => dispatch({ type: 'GO', view: 'barber' })}
      >
        Show my barber{favorite ? ` ★ ${favorite.label}` : ''}
      </button>
    </main>
  );
}
