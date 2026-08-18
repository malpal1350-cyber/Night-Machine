import { useEffect, useState } from 'react';

const GITHUB_REPO = 'malpal1350-cyber/Night-Machine';
const RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases`;

/**
 * Parses a semver string (with optional leading "v") into numeric parts.
 * Returns [major, minor, patch].
 */
function parseSemver(tag: string): [number, number, number] {
  const clean = tag.replace(/^v/, '');
  const parts = clean.split('.').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Returns true if `latest` is strictly newer than `current`.
 */
function isNewer(current: string, latest: string): boolean {
  const [cMaj, cMin, cPat] = parseSemver(current);
  const [lMaj, lMin, lPat] = parseSemver(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date' }
  | { status: 'update-available'; latestVersion: string; releasesUrl: string }
  | { status: 'error' };

/**
 * Checks the GitHub Releases API once on mount and reports whether a newer
 * version of Night Sound Machine is available.
 *
 * The check is skipped gracefully when offline or when the network request
 * fails for any reason.
 */
export function useUpdateCheck(): UpdateState {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    // Skip the check when the browser reports offline — avoids a pointless
    // network error and keeps the console clean.
    if (!navigator.onLine) return;

    let cancelled = false;
    setState({ status: 'checking' });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    (async () => {
      try {
        const res = await fetch(RELEASES_URL, {
          signal: controller.signal,
          headers: { Accept: 'application/vnd.github+json' },
          // Avoid CORS preflight issues with cache mode
          cache: 'no-store',
        });

        if (!res.ok) {
          if (!cancelled) setState({ status: 'error' });
          return;
        }

        const data = (await res.json()) as { tag_name?: string };
        const latestTag = data.tag_name;

        if (!latestTag) {
          if (!cancelled) setState({ status: 'error' });
          return;
        }

        const currentVersion = typeof __APP_VERSION__ !== 'undefined'
          ? __APP_VERSION__
          : '0.0.0';

        if (!cancelled) {
          if (isNewer(currentVersion, latestTag)) {
            setState({
              status: 'update-available',
              latestVersion: latestTag.startsWith('v') ? latestTag.slice(1) : latestTag,
              releasesUrl: RELEASES_PAGE,
            });
          } else {
            setState({ status: 'up-to-date' });
          }
        }
      } catch {
        // Network errors, CORS issues, aborts — all handled silently.
        if (!cancelled) setState({ status: 'error' });
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return state;
}
