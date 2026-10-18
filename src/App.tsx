import { useReducer } from 'react';
import { Header } from './components/Header';
import { SelfieScreen } from './screens/SelfieScreen';
import { StudioScreen } from './screens/StudioScreen';
import { initialSession, sessionReducer } from './state/session';

export function App() {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);

  return (
    <div className="app">
      <Header
        lookCount={session.looks.length}
        onLookbook={() => dispatch({ type: 'GO', view: 'lookbook' })}
        onNewCustomer={() => dispatch({ type: 'NEW_CUSTOMER' })}
      />
      {session.view === 'selfie' ? (
        <SelfieScreen onSelfie={(image) => dispatch({ type: 'SET_SELFIE', image })} />
      ) : session.view === 'studio' ? (
        <StudioScreen session={session} dispatch={dispatch} />
      ) : (
        // Placeholder: Lookbook and ShowBarber (Task 9) replace this.
        <main className="screen">
          <section className="panel">{session.view}</section>
        </main>
      )}
    </div>
  );
}
