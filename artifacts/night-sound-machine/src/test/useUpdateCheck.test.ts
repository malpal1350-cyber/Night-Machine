import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUpdateCheck } from '../hooks/useUpdateCheck';

// __APP_VERSION__ is defined as '1.0.0' in vitest.config.ts

const RELEASES_URL =
  'https://api.github.com/repos/malpal1350-cyber/Night-Machine/releases/latest';

function makeFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Returns a fetch mock whose promise rejects when the provided AbortSignal fires.
 * Stores the signal passed in by the hook so tests can inspect it.
 */
function makeSignalAwarePendingFetch(): {
  mock: ReturnType<typeof vi.fn>;
  capturedSignal: () => AbortSignal;
} {
  let _signal!: AbortSignal;
  const mock = vi.fn((_url: string, opts: RequestInit) => {
    _signal = opts.signal as AbortSignal;
    return new Promise<Response>((_, reject) => {
      _signal.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
  });
  return { mock, capturedSignal: () => _signal };
}

beforeEach(() => {
  // Default: online
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    writable: true,
    value: true,
  });
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  // Always restore real timers first so leaking fake timers can't break later tests
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useUpdateCheck', () => {
  it('skips the fetch and stays idle when offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      writable: true,
      value: false,
    });

    const { result } = renderHook(() => useUpdateCheck());

    // Give a tick for the effect to run
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current.status).toBe('idle');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('transitions to error on HTTP 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      RELEASES_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('transitions to error on HTTP 500', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 500 }),
    );

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('transitions to error when JSON is malformed (missing tag_name)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse({ no_tag_here: 'oops' }),
    );

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('transitions to error when the response body is not valid JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('not json at all', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('transitions to error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('aborts the fetch after 8 seconds and transitions to error (timeout)', async () => {
    // Use fake timers so we can control the 8-second abort deadline without
    // waiting in real time.
    vi.useFakeTimers();

    const { mock, capturedSignal } = makeSignalAwarePendingFetch();
    vi.stubGlobal('fetch', mock);

    const { result } = renderHook(() => useUpdateCheck());

    // Flush the effect microtask queue so fetch has been called
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('checking');
    expect(mock).toHaveBeenCalledOnce();

    // advanceTimersByTimeAsync fires the 8 s setTimeout and drains promises
    // in between, so the AbortError rejection fully propagates to the catch block.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8001);
    });

    // The controller abort must have fired
    expect(capturedSignal().aborted).toBe(true);

    // The catch block must have set the error state silently (no throws)
    expect(result.current.status).toBe('error');
  });

  it('reports update-available when GitHub returns a newer version', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse({ tag_name: 'v2.0.0' }),
    );

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() =>
      expect(result.current.status).toBe('update-available'),
    );

    if (result.current.status === 'update-available') {
      expect(result.current.latestVersion).toBe('2.0.0');
      expect(result.current.releasesUrl).toMatch(/github\.com/);
    }
  });

  it('reports update-available for a patch increment', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse({ tag_name: 'v1.0.1' }),
    );

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() =>
      expect(result.current.status).toBe('update-available'),
    );
  });

  it('reports up-to-date when GitHub returns the same version', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse({ tag_name: 'v1.0.0' }),
    );

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => expect(result.current.status).toBe('up-to-date'));
  });

  it('reports up-to-date when GitHub returns an older version', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse({ tag_name: 'v0.9.9' }),
    );

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => expect(result.current.status).toBe('up-to-date'));
  });

  it('aborts the in-flight request on unmount and does not update state', async () => {
    const { mock, capturedSignal } = makeSignalAwarePendingFetch();
    vi.stubGlobal('fetch', mock);

    const { result, unmount } = renderHook(() => useUpdateCheck());

    // Flush the effect so fetch has been called and we can inspect the signal
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('checking');
    expect(mock).toHaveBeenCalledOnce();

    // Capture the signal before unmount
    const signal = capturedSignal();
    expect(signal).toBeDefined();
    expect(signal.aborted).toBe(false);

    // Unmount — cleanup should call controller.abort()
    unmount();

    // The signal tied to the in-flight fetch must now be aborted
    expect(signal.aborted).toBe(true);

    // Flush microtasks: the abort event fires, the promise rejects, and the
    // catch block runs — but `cancelled = true` prevents setState from firing.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // State must remain 'checking' — no transition occurred after unmount
    expect(result.current.status).toBe('checking');
  });
});
