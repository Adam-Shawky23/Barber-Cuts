import type { TryOnError } from '../lib/api';

export type Look = {
  id: string;
  label: string;
  image: string;
  favorite: boolean;
};

export type Session = {
  selfie: string | null;
  looks: Look[];
  currentLookId: string | null;
  pending: { label: string } | null;
  error: TryOnError | null;
  view: 'selfie' | 'studio' | 'lookbook' | 'barber';
};

export type Action =
  | { type: 'SET_SELFIE'; image: string }
  | { type: 'RETAKE' }
  | { type: 'START'; label: string }
  | { type: 'SUCCESS'; look: Omit<Look, 'favorite'> }
  | { type: 'FAIL'; error: TryOnError }
  | { type: 'SELECT_LOOK'; id: string }
  | { type: 'TOGGLE_FAVORITE'; id: string }
  | { type: 'GO'; view: Session['view'] }
  | { type: 'NEW_CUSTOMER' };

export const initialSession: Session = {
  selfie: null,
  looks: [],
  currentLookId: null,
  pending: null,
  error: null,
  view: 'selfie',
};

export function sessionReducer(s: Session, a: Action): Session {
  switch (a.type) {
    case 'SET_SELFIE':
      return {
        ...s,
        selfie: a.image,
        view: 'studio',
      };

    case 'RETAKE':
      return {
        ...s,
        view: 'selfie',
      };

    case 'START':
      // Ignored if pending
      if (s.pending !== null) {
        return s;
      }
      return {
        ...s,
        pending: { label: a.label },
        error: null,
      };

    case 'SUCCESS':
      return {
        ...s,
        looks: [...s.looks, { ...a.look, favorite: false }],
        currentLookId: a.look.id,
        pending: null,
        error: null,
      };

    case 'FAIL':
      return {
        ...s,
        pending: null,
        error: a.error,
      };

    case 'SELECT_LOOK':
      return {
        ...s,
        currentLookId: a.id,
      };

    case 'TOGGLE_FAVORITE': {
      const newLooks = s.looks.map((look) => {
        if (look.id === a.id) {
          // Toggle the selected look
          return { ...look, favorite: !look.favorite };
        } else if (look.favorite) {
          // Unstar all others
          return { ...look, favorite: false };
        }
        return look;
      });
      return {
        ...s,
        looks: newLooks,
      };
    }

    case 'GO':
      return {
        ...s,
        view: a.view,
      };

    case 'NEW_CUSTOMER':
      return initialSession;

    default:
      const _exhaustive: never = a;
      return _exhaustive;
  }
}

export function favoriteLook(s: Session): Look | undefined {
  return s.looks.find((look) => look.favorite);
}
