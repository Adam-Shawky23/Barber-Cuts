import { useReducer } from 'react';
import { Header } from './components/Header';
import { Lookbook } from './screens/Lookbook';
import { SelfieScreen } from './screens/SelfieScreen';
import { ShowBarber } from './screens/ShowBarber';
import { StudioScreen } from './screens/StudioScreen';
import { favoriteLook, initialSession, sessionReducer } from './state/session';

export function App() {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);

  const favorite = favoriteLook(session);

  return (
    <div className="app">
      <Header
        lookCount={session.looks.length}
        busy={session.pending !== null}
        onLookbook={() => dispatch({ type: 'GO', view: 'lookbook' })}
        onNewCustomer={() => dispatch({ type: 'NEW_CUSTOMER' })}
      />
      {session.view === 'selfie' ? (
        <SelfieScreen onSelfie={(image) => dispatch({ type: 'SET_SELFIE', image })} />
      ) : session.view === 'studio' ? (
        <StudioScreen session={session} dispatch={dispatch} />
      ) : session.view === 'barber' && favorite ? (
        <ShowBarber look={favorite} onClose={() => dispatch({ type: 'GO', view: 'lookbook' })} />
      ) : (
        <Lookbook session={session} dispatch={dispatch} />
      )}
    </div>
  );
}
