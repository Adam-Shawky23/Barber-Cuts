import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReducer, type Dispatch } from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudioScreen } from '../../../src/screens/StudioScreen';
import { tryOn, TryOnFailure } from '../../../src/lib/api';
import { initialSession, sessionReducer, type Action, type Session } from '../../../src/state/session';

vi.mock('../../../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/api')>();
  return { ...actual, tryOn: vi.fn() };
});

const mockedTryOn = vi.mocked(tryOn);
const SELFIE = 'data:image/jpeg;base64,SELFIE';
const RESULT = 'data:image/jpeg;base64,RESULT';
const BUSY = 'The AI is busy right now. Try again in a minute.';
const FAILED = 'Something went wrong making your look.';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const studio: Session = { ...initialSession, selfie: SELFIE, view: 'studio' };

function Harness({ spy, start = studio }: { spy: (a: Action) => void; start?: Session }) {
  const [session, dispatch] = useReducer(sessionReducer, start);
  const wrapped: Dispatch<Action> = (a) => {
    spy(a);
    dispatch(a);
  };
  return session.view === 'studio' ? (
    <StudioScreen session={session} dispatch={wrapped} />
  ) : (
    <p>left studio</p>
  );
}

function setup(start?: Session) {
  const spy = vi.fn<(a: Action) => void>();
  const user = userEvent.setup();
  const utils = render(<Harness spy={spy} start={start} />);
  return { spy, user, ...utils };
}

beforeEach(() => {
  mockedTryOn.mockReset();
});

describe('StudioScreen', () => {
  it('shows the selfie before any look', () => {
    setup();
    expect(screen.getByAltText('Your selfie')).toHaveAttribute('src', SELFIE);
  });

  it('lists the ready-made styles in order', () => {
    setup();
    const names = ['Bald', 'Rasta / Dreads', 'Skin fade', 'Buzz cut', 'Afro', 'Mohawk', 'Braids', 'Pompadour'];
    for (const n of names) expect(screen.getByRole('button', { name: new RegExp(n) })).toBeInTheDocument();
  });

  it('tapping a style shows the waiting state, then only the new photo', async () => {
    const d = deferred<{ image: string; label: string }>();
    mockedTryOn.mockReturnValue(d.promise);
    const { spy, user } = setup();

    await user.click(screen.getByRole('button', { name: /Skin fade/ }));

    expect(spy).toHaveBeenCalledWith({ type: 'START', label: 'Skin fade' });
    expect(mockedTryOn).toHaveBeenCalledWith({ image: SELFIE, styleId: 'skin-fade' });
    expect(screen.getByText('Cutting your skin fade…')).toBeInTheDocument();
    expect(screen.getByText('Free AI · usually 10–60 seconds.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await act(async () => d.resolve({ image: RESULT, label: 'Skin fade' }));

    const img = screen.getByAltText('You with Skin fade');
    expect(img).toHaveAttribute('src', RESULT);
    expect(screen.queryByAltText('Your selfie')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByText('SKIN FADE')).toBeInTheDocument();
    expect(screen.queryByText('Cutting your skin fade…')).not.toBeInTheDocument();
    const success = spy.mock.calls.find(([a]) => a.type === 'SUCCESS')?.[0];
    expect(success).toMatchObject({ type: 'SUCCESS', look: { label: 'Skin fade', image: RESULT } });
    expect(success?.type === 'SUCCESS' && typeof success.look.id).toBe('string');
  });

  it('does not start a second request while one is pending', async () => {
    mockedTryOn.mockReturnValue(new Promise(() => {}));
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Skin fade/ }));
    await user.click(screen.getByRole('button', { name: /Afro/ }));
    await user.type(screen.getByRole('textbox'), 'low taper');
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(mockedTryOn).toHaveBeenCalledTimes(1);
  });

  it('description box: max 200, Go disabled when blank, sends the trimmed description', async () => {
    mockedTryOn.mockReturnValue(new Promise(() => {}));
    const { spy, user } = setup();
    const input = screen.getByRole('textbox');
    const go = screen.getByRole('button', { name: 'Go' });
    expect(input).toHaveAttribute('maxLength', '200');
    expect(go).toBeDisabled();
    await user.type(input, '   ');
    expect(go).toBeDisabled();
    await user.clear(input);
    await user.type(input, '  Low Taper, curls  ');
    expect(go).toBeEnabled();
    await user.click(go);
    expect(mockedTryOn).toHaveBeenCalledWith({ image: SELFIE, description: 'Low Taper, curls' });
    expect(spy).toHaveBeenCalledWith({ type: 'START', label: 'Low Taper, curls' });
    expect(screen.getByText('Cutting your low taper, curls…')).toBeInTheDocument();
  });

  it('pressing Enter in the description box submits it', async () => {
    mockedTryOn.mockReturnValue(new Promise(() => {}));
    const { user } = setup();
    await user.type(screen.getByRole('textbox'), 'mullet{Enter}');
    expect(mockedTryOn).toHaveBeenCalledWith({ image: SELFIE, description: 'mullet' });
  });

  it('BUSY shows the busy copy and Try again re-sends the same request', async () => {
    mockedTryOn.mockRejectedValueOnce(new TryOnFailure('BUSY'));
    const { spy, user } = setup();
    await user.click(screen.getByRole('button', { name: /Mohawk/ }));
    expect(await screen.findByText(BUSY)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith({ type: 'FAIL', error: 'BUSY' });

    mockedTryOn.mockResolvedValueOnce({ image: RESULT, label: 'Mohawk' });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockedTryOn).toHaveBeenCalledTimes(2);
    expect(mockedTryOn).toHaveBeenLastCalledWith({ image: SELFIE, styleId: 'mohawk' });
    expect(await screen.findByAltText('You with Mohawk')).toBeInTheDocument();
    expect(screen.queryByText(BUSY)).not.toBeInTheDocument();
  });

  it.each(['TIMEOUT', 'FAILED', 'NETWORK'] as const)('%s shows the friendly failure copy', async (code) => {
    mockedTryOn.mockRejectedValueOnce(new TryOnFailure(code));
    const { user } = setup();
    await user.type(screen.getByRole('textbox'), 'curly top');
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(await screen.findByText(FAILED)).toBeInTheDocument();
    mockedTryOn.mockReturnValue(new Promise(() => {}));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockedTryOn).toHaveBeenLastCalledWith({ image: SELFIE, description: 'curly top' });
  });

  it('Retake selfie dispatches RETAKE', async () => {
    const { spy, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Retake selfie' }));
    expect(spy).toHaveBeenCalledWith({ type: 'RETAKE' });
  });

  it('shows the current look when one is selected', () => {
    setup({
      ...studio,
      looks: [
        { id: 'a', label: 'Afro', image: 'data:a', favorite: false },
        { id: 'b', label: 'Bald', image: 'data:b', favorite: false },
      ],
      currentLookId: 'a',
    });
    expect(screen.getByAltText('You with Afro')).toHaveAttribute('src', 'data:a');
    expect(screen.queryByAltText('Your selfie')).not.toBeInTheDocument();
  });

  it('ignores a result that arrives after unmount', async () => {
    const d = deferred<{ image: string; label: string }>();
    mockedTryOn.mockReturnValue(d.promise);
    const { spy, user, unmount } = setup();
    await user.click(screen.getByRole('button', { name: /Afro/ }));
    unmount();
    await act(async () => d.resolve({ image: RESULT, label: 'Afro' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls.map(([a]) => a.type)).toEqual(['START']);
  });
});
