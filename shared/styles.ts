export type Style = { id: string; name: string; icon: string; phrase: string };

export const MAX_DESCRIPTION = 200;

export const STYLES: readonly Style[] = [
  { id: 'bald', name: 'Bald', icon: '🥚', phrase: 'a completely shaved, smooth bald head' },
  { id: 'rasta-dreads', name: 'Rasta / Dreads', icon: '🦁', phrase: 'shoulder-length rasta dreadlocks' },
  { id: 'skin-fade', name: 'Skin fade', icon: '✂️', phrase: 'a clean skin fade, with the sides faded down to bare skin and short neat hair on top' },
  { id: 'buzz-cut', name: 'Buzz cut', icon: '⚡', phrase: 'a short, even buzz cut all over the head' },
  { id: 'afro', name: 'Afro', icon: '🌳', phrase: 'a full, rounded natural afro with defined volume' },
  { id: 'mohawk', name: 'Mohawk', icon: '🦅', phrase: 'a tall mohawk with the sides shaved close' },
  { id: 'braids', name: 'Braids', icon: '🪢', phrase: 'neat cornrow braids running back from the forehead' },
  { id: 'pompadour', name: 'Pompadour', icon: '💈', phrase: 'a voluminous swept-back pompadour with tapered sides' },
];

export function findStyle(id: string): Style | undefined {
  return STYLES.find(s => s.id === id);
}
