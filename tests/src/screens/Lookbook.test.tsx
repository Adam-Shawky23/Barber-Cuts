import { describe, it, expect, vi } from 'vitest';
import { useReducer, type Dispatch } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '../../../src/components/Header';
import { Lookbook } from '../../../src/screens/Lookbook';
import { ShowBarber } from '../../../src/screens/ShowBarber';
import {
  favoriteLook,
  initialSession,
  sessionReducer,
  type Action,
  type Session,
} from '../../../src/state/session';

const SELFIE = 'data:image/jpeg;base64,SELFIE';
const looks = [
  { id: 'a', label: 'Skin fade', image: 'data:image/jpeg;base64,A', favorite: false },
  { id: 'b', label: 'Afro', image: 'data:image/jpeg;base64,B', favorite: false },
];
const start: Session = { ...initialSession, selfie: SELFIE, looks, view: 'lookbook' };

function Harness({ spy, init = start }: { spy: (a: Action) => void; init?: Session }) {
  const [session, dispatch] = useReducer(sessionReducer, init);
  const wrapped: Dispatch<Action> = (a) => {
    spy(a);
    dispatch(a);
  };
  const fav = favoriteLook(session);
  return (
    <>
      <Header
        lookCount={session.looks.length}
        busy={session.pending !== null}
        onLookbook={() => wrapped({ type: 'GO', view: 'lookbook' })}
        onNewCustomer={() => wrapped({ type: 'NEW_CUSTOMER' })}
      />
      {session.view === 'selfie' ? (
        <p>selfie screen</p>
      ) : session.view === 'studio' ? (
        <p>studio screen</p>
      ) : session.view === 'barber' && fav ? (
        <ShowBarber look={fav} onClose={() => wrapped({ type: 'GO', view: 'lookbook' })} />
      ) : (
        <Lookbook session={session} dispatch={wrapped} />
      )}
    </>
  );
}

function setup(init?: Session) {
  const spy = vi.fn<(a: Action) => void>();
  const user = userEvent.setup();
  render(<Harness spy={spy} init={init} />);
  return { spy, user };
}

describe('Lookbook', () => {
  it('renders one card per look with its label and never the selfie', () => {
    setup();
    expect(screen.getByAltText('Skin fade')).toHaveAttribute('src', looks[0].image);
    expect(screen.getByAltText('Afro')).toHaveAttribute('src', looks[1].image);
    expect(document.querySelectorAll('img')).toHaveLength(2);
    expect(document.querySelector(`img[src="${SELFIE}"]`)).toBeNull();
  });

  it('starring a look dispatches TOGGLE_FAVORITE and shows a filled star', async () => {
    const { spy, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Favourite Skin fade' }));
    expect(spy).toHaveBeenCalledWith({ type: 'TOGGLE_FAVORITE', id: 'a' });
    expect(screen.getByRole('button', { name: 'Unfavourite Skin fade' })).toHaveTextContent('★');
    expect(screen.getByRole('button', { name: 'Favourite Afro' })).toHaveTextContent('☆');
  });

  it('Show my barber is disabled with no favourite', () => {
    setup();
    expect(screen.getByRole('button', { name: /Show my barber/ })).toBeDisabled();
  });

  it('Show my barber opens a full-screen view of the favourite and Close returns', async () => {
    const { spy, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Favourite Skin fade' }));
    await user.click(screen.getByRole('button', { name: 'Show my barber ★ Skin fade' }));
    expect(spy).toHaveBeenCalledWith({ type: 'GO', view: 'barber' });
    expect(screen.getByAltText('Skin fade')).toHaveAttribute('src', looks[0].image);
    expect(screen.getByText('Skin fade')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(spy).toHaveBeenLastCalledWith({ type: 'GO', view: 'lookbook' });
    expect(screen.getByRole('button', { name: /Show my barber/ })).toBeInTheDocument();
  });

  it('tapping a card selects the look and goes to the studio', async () => {
    const { spy, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Open Afro' }));
    expect(spy).toHaveBeenCalledWith({ type: 'SELECT_LOOK', id: 'b' });
    expect(spy).toHaveBeenCalledWith({ type: 'GO', view: 'studio' });
    expect(screen.getByText('studio screen')).toBeInTheDocument();
  });

  it('shows the empty state with no looks', () => {
    setup({ ...start, looks: [] });
    expect(screen.getByText('No looks yet. Pick a style to get started.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show my barber/ })).toBeNull();
  });

  it('Back returns to the studio when there is a selfie', async () => {
    const { spy, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(spy).toHaveBeenCalledWith({ type: 'GO', view: 'studio' });
    expect(screen.getByText('studio screen')).toBeInTheDocument();
  });

  it('an empty lookbook opened before a selfie leads back to the selfie screen', async () => {
    const { spy, user } = setup({ ...initialSession, view: 'lookbook' });
    await user.click(screen.getByRole('button', { name: 'Pick a style' }));
    expect(spy).toHaveBeenCalledWith({ type: 'GO', view: 'selfie' });
    expect(screen.getByText('selfie screen')).toBeInTheDocument();
  });

  it('New customer resets to the selfie screen with zero looks', async () => {
    const { spy, user } = setup();
    await user.click(screen.getByRole('button', { name: /New customer/ }));
    expect(spy).toHaveBeenCalledWith({ type: 'NEW_CUSTOMER' });
    expect(screen.getByText('selfie screen')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: /Lookbook/ })).toHaveTextContent('0');
  });
});

describe('Header', () => {
  it('disables the Lookbook button while a look is being made', () => {
    setup({ ...start, view: 'studio', pending: { label: 'Afro' } });
    expect(screen.getByRole('button', { name: /Lookbook/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /New customer/ })).toBeEnabled();
  });
});
