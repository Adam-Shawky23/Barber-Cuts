import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SelfieScreen } from '../../../src/screens/SelfieScreen';
import { resizeImage } from '../../../src/lib/resizeImage';

vi.mock('../../../src/lib/resizeImage', () => ({
  resizeImage: vi.fn(),
}));

const mockedResize = vi.mocked(resizeImage);
const PRIVACY =
  "Your photo is sent to an outside AI service to create your look. The shop doesn't save it.";
const NO_CAMERA = "Camera isn't available. Upload a photo instead.";

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', { value, configurable: true });
}

function fakeStream() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

function uploadInput(): HTMLInputElement {
  return screen.getByLabelText(/upload photo/i) as HTMLInputElement;
}

let play: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // jsdom doesn't implement media playback.
  play = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { value: play, configurable: true, writable: true });
  mockedResize.mockReset();
  mockedResize.mockImplementation(async (src) => {
    if (src instanceof Blob && !src.type.startsWith('image/')) throw new Error('NOT_IMAGE');
    return 'data:image/jpeg;base64,AAA';
  });
});

afterEach(() => {
  setMediaDevices(undefined);
});

describe('SelfieScreen', () => {
  it('shows the privacy line verbatim and the hint', () => {
    setMediaDevices(undefined);
    render(<SelfieScreen onSelfie={vi.fn()} />);
    expect(screen.getByText(PRIVACY)).toBeInTheDocument();
    expect(screen.getByText('Face the camera, hair visible.')).toBeInTheDocument();
  });

  it('uploading an image calls onSelfie with a data URL', async () => {
    setMediaDevices(undefined);
    const onSelfie = vi.fn();
    render(<SelfieScreen onSelfie={onSelfie} />);
    const input = uploadInput();
    expect(input).toHaveAttribute('accept', 'image/*');
    const file = new File(['img'], 'me.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onSelfie).toHaveBeenCalledWith('data:image/jpeg;base64,AAA'));
    expect(mockedResize).toHaveBeenCalledWith(file);
  });

  it('shows the camera fallback when mediaDevices is undefined, and upload still works', async () => {
    setMediaDevices(undefined);
    const onSelfie = vi.fn();
    render(<SelfieScreen onSelfie={onSelfie} />);
    expect(await screen.findByText(NO_CAMERA)).toBeInTheDocument();
    fireEvent.change(uploadInput(), {
      target: { files: [new File(['img'], 'me.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(onSelfie).toHaveBeenCalledTimes(1));
  });

  it('shows the camera fallback when getUserMedia rejects, and upload still works', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    setMediaDevices({ getUserMedia });
    const onSelfie = vi.fn();
    render(<SelfieScreen onSelfie={onSelfie} />);
    expect(await screen.findByText(NO_CAMERA)).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: expect.objectContaining({ facingMode: 'user' }) }),
    );
    fireEvent.change(uploadInput(), {
      target: { files: [new File(['img'], 'me.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(onSelfie).toHaveBeenCalledTimes(1));
  });

  it('a non-image upload shows "Please choose a photo." and does not call onSelfie', async () => {
    setMediaDevices(undefined);
    const onSelfie = vi.fn();
    render(<SelfieScreen onSelfie={onSelfie} />);
    fireEvent.change(uploadInput(), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(await screen.findByText('Please choose a photo.')).toBeInTheDocument();
    expect(onSelfie).not.toHaveBeenCalled();
  });

  it('keeps "Take selfie" disabled until the video has dimensions, then captures and stops tracks', async () => {
    const { stream, track } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn().mockResolvedValue(stream) });
    const onSelfie = vi.fn();
    const { container } = render(<SelfieScreen onSelfie={onSelfie} />);
    const button = await screen.findByRole('button', { name: /take selfie/i });
    expect(button).toBeDisabled();

    const video = container.querySelector('video')!;
    await waitFor(() => expect(video.srcObject).toBe(stream));
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });
    act(() => {
      fireEvent(video, new Event('loadedmetadata'));
    });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    await waitFor(() => expect(onSelfie).toHaveBeenCalledWith('data:image/jpeg;base64,AAA'));
    expect(mockedResize).toHaveBeenCalledWith(video);
    expect(track.stop).toHaveBeenCalled();
  });

  it('stops camera tracks on unmount', async () => {
    const { stream, track } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn().mockResolvedValue(stream) });
    const { container, unmount } = render(<SelfieScreen onSelfie={vi.fn()} />);
    const video = container.querySelector('video')!;
    await waitFor(() => expect(video.srcObject).toBe(stream));
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });
  it('starts playback explicitly once the stream is attached (iOS)', async () => {
    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn().mockResolvedValue(stream) });
    const { container } = render(<SelfieScreen onSelfie={vi.fn()} />);
    const video = container.querySelector('video')!;
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(play.mock.contexts[0]).toBe(video);
    expect(video.srcObject).toBe(stream);
  });

  it('a rejected play() is ignored and the camera stays live', async () => {
    play.mockRejectedValue(new Error('NotAllowedError'));
    const { stream } = fakeStream();
    setMediaDevices({ getUserMedia: vi.fn().mockResolvedValue(stream) });
    render(<SelfieScreen onSelfie={vi.fn()} />);
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /take selfie/i })).toBeInTheDocument();
    expect(screen.queryByText(NO_CAMERA)).not.toBeInTheDocument();
  });
});
