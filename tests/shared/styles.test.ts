import { STYLES, findStyle } from '../../shared/styles';

test('catalog order and names', () => {
  expect(STYLES.map(s => s.name)).toEqual(
    ['Bald','Rasta / Dreads','Skin fade','Buzz cut','Afro','Mohawk','Braids','Pompadour']);
  expect(new Set(STYLES.map(s => s.id)).size).toBe(8);
  expect(findStyle('bald')?.name).toBe('Bald');
  expect(findStyle('nope')).toBeUndefined();
});
