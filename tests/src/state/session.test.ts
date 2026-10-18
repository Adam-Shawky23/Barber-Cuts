import { describe, it, expect } from 'vitest';
import { sessionReducer, initialSession, favoriteLook, type Session, type Look } from '../../../src/state/session';

describe('sessionReducer', () => {
  it('START while pending is ignored', () => {
    const session: Session = {
      ...initialSession,
      pending: { label: 'Fade' },
    };
    const result = sessionReducer(session, { type: 'START', label: 'Buzz' });
    expect(result).toBe(session); // unchanged by reference
  });

  it('SUCCESS appends look, sets currentLookId, clears pending/error', () => {
    const session: Session = {
      ...initialSession,
      pending: { label: 'Fade' },
      error: 'TIMEOUT',
    };
    const look = { id: 'id1', label: 'Fade', image: 'data:image/png;base64,ABC' };
    const result = sessionReducer(session, { type: 'SUCCESS', look });

    expect(result.looks).toEqual([{ ...look, favorite: false }]);
    expect(result.currentLookId).toBe('id1');
    expect(result.pending).toBeNull();
    expect(result.error).toBeNull();
  });

  it('FAIL clears pending, sets error', () => {
    const session: Session = {
      ...initialSession,
      pending: { label: 'Fade' },
    };
    const result = sessionReducer(session, { type: 'FAIL', error: 'TIMEOUT' });

    expect(result.pending).toBeNull();
    expect(result.error).toBe('TIMEOUT');
  });

  it('START clears previous error', () => {
    const session: Session = {
      ...initialSession,
      error: 'NETWORK',
    };
    const result = sessionReducer(session, { type: 'START', label: 'Buzz' });

    expect(result.error).toBeNull();
    expect(result.pending).toEqual({ label: 'Buzz' });
  });

  it('TOGGLE_FAVORITE: at most one favourite', () => {
    const look1: Look = { id: 'id1', label: 'Fade', image: 'img1', favorite: false };
    const look2: Look = { id: 'id2', label: 'Buzz', image: 'img2', favorite: false };
    const look3: Look = { id: 'id3', label: 'High', image: 'img3', favorite: false };

    let session: Session = {
      ...initialSession,
      looks: [look1, look2, look3],
    };

    // Star look1
    session = sessionReducer(session, { type: 'TOGGLE_FAVORITE', id: 'id1' });
    expect(session.looks[0].favorite).toBe(true);
    expect(session.looks[1].favorite).toBe(false);
    expect(session.looks[2].favorite).toBe(false);

    // Star look2 (should unstar look1)
    session = sessionReducer(session, { type: 'TOGGLE_FAVORITE', id: 'id2' });
    expect(session.looks[0].favorite).toBe(false);
    expect(session.looks[1].favorite).toBe(true);
    expect(session.looks[2].favorite).toBe(false);

    // Unstar look2 (toggle off)
    session = sessionReducer(session, { type: 'TOGGLE_FAVORITE', id: 'id2' });
    expect(session.looks[0].favorite).toBe(false);
    expect(session.looks[1].favorite).toBe(false);
    expect(session.looks[2].favorite).toBe(false);
  });

  it('NEW_CUSTOMER resets everything', () => {
    const session: Session = {
      selfie: 'data:image/png;base64,ABC',
      looks: [{ id: 'id1', label: 'Fade', image: 'img1', favorite: true }],
      currentLookId: 'id1',
      pending: { label: 'Buzz' },
      error: 'TIMEOUT',
      view: 'lookbook',
    };

    const result = sessionReducer(session, { type: 'NEW_CUSTOMER' });
    expect(result).toEqual(initialSession);
  });

  it('RETAKE keeps looks', () => {
    const looks: Look[] = [
      { id: 'id1', label: 'Fade', image: 'img1', favorite: false },
      { id: 'id2', label: 'Buzz', image: 'img2', favorite: true },
    ];
    const session: Session = {
      selfie: 'data:image/png;base64,ABC',
      looks,
      currentLookId: 'id1',
      pending: null,
      error: null,
      view: 'studio',
    };

    const result = sessionReducer(session, { type: 'RETAKE' });
    expect(result.looks).toEqual(looks);
    expect(result.view).toBe('selfie');
    expect(result.selfie).toBe('data:image/png;base64,ABC');
  });

  it('SET_SELFIE sets selfie, goes to studio, keeps looks', () => {
    const looks: Look[] = [
      { id: 'id1', label: 'Fade', image: 'img1', favorite: false },
    ];
    const session: Session = {
      selfie: null,
      looks,
      currentLookId: 'id1',
      pending: null,
      error: null,
      view: 'selfie',
    };

    const newSelfie = 'data:image/png;base64,XYZ';
    const result = sessionReducer(session, { type: 'SET_SELFIE', image: newSelfie });

    expect(result.selfie).toBe(newSelfie);
    expect(result.view).toBe('studio');
    expect(result.looks).toEqual(looks);
  });

  it('SELECT_LOOK sets currentLookId', () => {
    const looks: Look[] = [
      { id: 'id1', label: 'Fade', image: 'img1', favorite: false },
      { id: 'id2', label: 'Buzz', image: 'img2', favorite: false },
    ];
    const session: Session = {
      ...initialSession,
      looks,
      currentLookId: 'id1',
    };

    const result = sessionReducer(session, { type: 'SELECT_LOOK', id: 'id2' });
    expect(result.currentLookId).toBe('id2');
  });

  it('GO changes view', () => {
    const session: Session = {
      ...initialSession,
      view: 'selfie',
    };

    const result = sessionReducer(session, { type: 'GO', view: 'lookbook' });
    expect(result.view).toBe('lookbook');
  });

  it('GO clears a stale error', () => {
    const session: Session = { ...initialSession, view: 'studio', error: 'BUSY' };

    const result = sessionReducer(session, { type: 'GO', view: 'lookbook' });
    expect(result.error).toBeNull();
  });
});

describe('favoriteLook', () => {
  it('returns the favorite look if one exists', () => {
    const looks: Look[] = [
      { id: 'id1', label: 'Fade', image: 'img1', favorite: false },
      { id: 'id2', label: 'Buzz', image: 'img2', favorite: true },
      { id: 'id3', label: 'High', image: 'img3', favorite: false },
    ];
    const session: Session = {
      ...initialSession,
      looks,
    };

    const fav = favoriteLook(session);
    expect(fav).toEqual(looks[1]);
  });

  it('returns undefined if no favorite exists', () => {
    const session = initialSession;
    const fav = favoriteLook(session);
    expect(fav).toBeUndefined();
  });
});
