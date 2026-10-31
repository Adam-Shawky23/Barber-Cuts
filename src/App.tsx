import { useEffect, useReducer } from 'react';
import { Header } from './components/Header';
import { Lookbook } from './screens/Lookbook';
import { SelfieScreen } from './screens/SelfieScreen';
import { ShowBarber } from './screens/ShowBarber';
import { StudioScreen } from './screens/StudioScreen';
import { favoriteLook, initialSession, sessionReducer, type Session } from './state/session';

export function App() {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);

  const favorite = favoriteLook(session);

  // Mirror screens into browser history so the Android back button and the iOS swipe-back
  // gesture move between screens instead of leaving the app and losing the looks.
  useEffect(() => {
    if (window.history.state?.view === session.view) return;
    if (window.history.state?.view === undefined) window.history.replaceState({ view: session.view }, '');
    else window.history.pushState({ view: session.view }, '');
  }, [session.view]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const view = (e.state as { view?: Session['view'] } | null)?.view ?? 'selfie';
      dispatch({ type: 'GO', view });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // History can point at a screen that no longer has its data (e.g. after "New customer").
  const view =
    session.view === 'studio' && !session.selfie
      ? 'selfie'
      : session.view === 'barber' && !favorite
        ? 'lookbook'
        : session.view;

  return (
    <div className="app">
      <Header
        lookCount={session.looks.length}
        busy={session.pending !== null}
        onLookbook={() => dispatch({ type: 'GO', view: 'lookbook' })}
        onNewCustomer={() => dispatch({ type: 'NEW_CUSTOMER' })}
      />
      {view === 'selfie' ? (
        <SelfieScreen onSelfie={(image) => dispatch({ type: 'SET_SELFIE', image })} />
      ) : view === 'studio' ? (
        <StudioScreen session={session} dispatch={dispatch} />
      ) : view === 'barber' && favorite ? (
        <ShowBarber look={favorite} onClose={() => dispatch({ type: 'GO', view: 'lookbook' })} />
      ) : (
        <Lookbook session={session} dispatch={dispatch} />
      )}
    </div>
  );
}
