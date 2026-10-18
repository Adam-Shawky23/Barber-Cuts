import { describe, it, expect } from 'vitest';
import { fitSize, resizeImage } from '../../../src/lib/resizeImage';

describe('fitSize', () => {
  it('downscales landscape to longest side 1024', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 1024, height: 768 });
  });
  it('leaves small images unchanged', () => {
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('downscales portrait to longest side 1024', () => {
    expect(fitSize(3000, 4000)).toEqual({ width: 768, height: 1024 });
  });
});

describe('resizeImage', () => {
  it('rejects non-image blobs with NOT_IMAGE', async () => {
    await expect(resizeImage(new Blob(['x'], { type: 'text/plain' }))).rejects.toThrow('NOT_IMAGE');
  });
});
