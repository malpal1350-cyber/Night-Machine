import { useEffect, useMemo, useRef, useState, type ComponentType, type ChangeEvent, type CSSProperties } from 'react';
import { useUpdateCheck } from '@/hooks/useUpdateCheck';
import {
  AlarmClock,
  Anchor,
  Archive,
  Bell,
  BellOff,
  Bike,
  Bird,
  Bug,
  Bus,
  Car,
  Cat,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  CircleHelp,
  Clover,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Dog,
  Droplets,
  Feather,
  Fish,
  Flame,
  Flower2,
  FolderPlus,
  Ghost,
  Headphones,
  Heart,
  Home as HomeIcon,
  Leaf,
  Library,
  ListMusic,
  LockKeyhole,
  Maximize2,
  Menu,
  Mic2,
  Minimize2,
  Moon,
  MoonStar,
  MoreHorizontal,
  Mountain,
  Music,
  Music2,
  Pause,
  PanelLeftClose,
  PanelLeftOpen,
  PawPrint,
  Pencil,
  Plane,
  Play,
  Plus,
  Rabbit,
  Radio,
  Repeat,
  Repeat1,
  Settings,
  Shell,
  Ship,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Snail,
  Snowflake,
  Sparkles,
  Squirrel,
  Square,
  Star,
  Stars,
  Sun,
  Sunrise,
  Sunset,
  Tent,
  TentTree,
  Timer,
  Train,
  Trash2,
  TreeDeciduous,
  TreePalm,
  TreePine,
  Trees,
  Truck,
  Turtle,
  Upload,
  Volume2,
  Waves,
  Wind,
  Worm,
  X,
  Zap,
  ExternalLink,
} from 'lucide-react';

type GroupKind = 'main' | 'effect';
type LimitKind = 'count' | 'time';
type TimeLimitMode = 'fixed' | 'random';
type MusicTrack = { id: string; name: string; size: number; url?: string; };
type Playlist = { id: string; name: string; tracks: MusicTrack[]; };
type MusicStatus = 'idle' | 'playing' | 'paused';
type MusicRepeat = 'none' | 'one' | 'all';
type Page = 'home' | 'music' | 'library' | 'settings';
type SessionStatus = 'idle' | 'running' | 'paused' | 'alarming';
type EndMode = 'none' | 'timer' | 'alarm';
type ScheduleMode = 'off' | 'countdown' | 'time';
type IconType = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
type TimerParts = { hours: number; minutes: number; seconds: number; milliseconds: number };

type SoundFile = {
  id: string;
  name: string;
  size: number;
  role: GroupKind;
  url?: string;
  demo?: boolean;
};

type SoundGroup = {
  id: string;
  name: string;
  kind: GroupKind;
  color: string;
  icon?: string;
  enabled: boolean;
  volume: number;
  minInterval: number;
  maxInterval: number;
  limitEnabled: boolean;
  limitKind: LimitKind;
  limit: number;
  timeLimit: number;       // min (or the only value in fixed mode)
  timeLimitMode?: TimeLimitMode;
  timeLimitMax?: number;   // max value, only used in random mode
  plays: number;
  sessionChanceEnabled?: boolean;
  sessionChance?: number;
  autoStopEnabled?: boolean;
  minDuration?: number;
  maxDuration?: number;
  files: SoundFile[];
};

const STORAGE_KEY = 'night-sound-machine-library-v2';
const LEGACY_STORAGE_KEY = 'night-sound-machine-library-v1';
const FILE_DB_NAME = 'night-sound-machine-files';
const FILE_DB_VERSION = 1;
const FILE_STORE = 'audio-files';

// ── IndexedDB helpers for persisting actual audio file data across page reloads ──
// Blob URLs are session-only; storing the ArrayBuffer in IDB lets us recreate them.
function openFileDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FILE_DB_NAME, FILE_DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(FILE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeAudioFile(id: string, file: File): Promise<void> {
  try {
    const [db, buffer] = await Promise.all([openFileDB(), file.arrayBuffer()]);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readwrite');
      tx.objectStore(FILE_STORE).put({ buffer, type: file.type || 'audio/mpeg' }, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* private browsing or quota exceeded — fail silently */ }
}

async function loadAudioFile(id: string): Promise<{ buffer: ArrayBuffer; type: string } | null> {
  try {
    const db = await openFileDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(FILE_STORE, 'readonly');
      const req = tx.objectStore(FILE_STORE).get(id);
      req.onsuccess = () => { db.close(); resolve((req.result as { buffer: ArrayBuffer; type: string } | undefined) ?? null); };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch { return null; }
}

async function deleteAudioFile(id: string): Promise<void> {
  try {
    const db = await openFileDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(FILE_STORE, 'readwrite');
      tx.objectStore(FILE_STORE).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch { /* ignore */ }
}
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const SECOND_MS = 1000;
const COLORS = ['#f5b873', '#d9839a', '#8db3b8', '#a597d5', '#d3a486', '#92aa73'];
const NIGHT_TEXT_COLORS = ['#ef5b5b', '#f5b873', '#d9839a', '#a597d5', '#8db3b8', '#f2edf5'];
const CLOCK_DISPLAY_COLORS = ['#ffffff', '#ef5b5b', '#f5b873', '#d9839a', '#a597d5', '#8db3b8'];
const DEFAULT_MAIN_MIN_DURATION = 30 * MINUTE_MS;
const DEFAULT_MAIN_MAX_DURATION = 90 * MINUTE_MS;
const DEFAULT_TIME_LIMIT = 30 * MINUTE_MS;
const DEFAULT_TIME_LIMIT_MAX = 60 * MINUTE_MS;
const MUSIC_STORAGE_KEY = 'night-sound-machine-music-v1';
const PREFS_STORAGE_KEY = 'night-sound-machine-prefs-v1';
const DISMISSED_UPDATE_KEY = 'nsm-dismissed-update-v1';
const DEFAULT_MUSIC_VOLUME = 80;


const DEFAULT_PREFS = {
  nightTextColor: NIGHT_TEXT_COLORS[0],
  nightShowDate: true,
  nightShowSeconds: false,
  nightHour12: true,
  nightShowAmPm: true,
  nightClockFont: 'Nunito Sans',
  nightDimEnabled: true,
  nightDimDelaySecs: 20,
  nightDimColor: NIGHT_TEXT_COLORS[0],
  nightDimShowClock: true,
  nightDimShowDate: false,
  nightDimShowSeconds: false,
  nightDimShowAmPm: false,
  nightDimBrightness: 15,
  clockDisplayEnabled: true,
  clockDisplayDelaySecs: 1800,
  clockDisplayColor: '#ffffff',
  clockDisplayFont: 'Nunito Sans',
  clockDisplayShowDate: true,
  clockDisplayShowSeconds: false,
  clockDisplayHour12: true,
  clockDisplayShowAmPm: true,
  volume: 62,
  alarmSoundId: null as string | null,
  alarmSoundName: '',
  alarmOnTimer: true,
  alarmOnAlarm: true,
  alarmSnoozeMins: 9,
  alarmVolume: 100,
  alarmSnoozeResumeAudio: true,
  alarmPulseOnTimer: true,
  alarmPulseOnAlarm: true,
};

function readStoredPrefs() {
  try {
    const saved = localStorage.getItem(PREFS_STORAGE_KEY);
    if (saved) {
      const p = JSON.parse(saved);
      return {
        nightTextColor: typeof p.nightTextColor === 'string' ? p.nightTextColor : DEFAULT_PREFS.nightTextColor,
        nightShowDate: typeof p.nightShowDate === 'boolean' ? p.nightShowDate : DEFAULT_PREFS.nightShowDate,
        nightShowSeconds: typeof p.nightShowSeconds === 'boolean' ? p.nightShowSeconds : DEFAULT_PREFS.nightShowSeconds,
        nightHour12: typeof p.nightHour12 === 'boolean' ? p.nightHour12 : DEFAULT_PREFS.nightHour12,
        nightShowAmPm: typeof p.nightShowAmPm === 'boolean' ? p.nightShowAmPm : DEFAULT_PREFS.nightShowAmPm,
        nightClockFont: typeof p.nightClockFont === 'string' ? p.nightClockFont : DEFAULT_PREFS.nightClockFont,
        nightDimEnabled: typeof p.nightDimEnabled === 'boolean' ? p.nightDimEnabled : DEFAULT_PREFS.nightDimEnabled,
        nightDimDelaySecs: typeof p.nightDimDelaySecs === 'number' ? Math.max(5, Math.min(3600, p.nightDimDelaySecs)) : DEFAULT_PREFS.nightDimDelaySecs,
        nightDimColor: (typeof p.nightDimColor === 'string' && NIGHT_TEXT_COLORS.includes(p.nightDimColor)) ? p.nightDimColor : DEFAULT_PREFS.nightDimColor,
        nightDimShowClock: typeof p.nightDimShowClock === 'boolean' ? p.nightDimShowClock : DEFAULT_PREFS.nightDimShowClock,
        nightDimShowDate: typeof p.nightDimShowDate === 'boolean' ? p.nightDimShowDate : DEFAULT_PREFS.nightDimShowDate,
        nightDimShowSeconds: typeof p.nightDimShowSeconds === 'boolean' ? p.nightDimShowSeconds : DEFAULT_PREFS.nightDimShowSeconds,
        nightDimShowAmPm: typeof p.nightDimShowAmPm === 'boolean' ? p.nightDimShowAmPm : DEFAULT_PREFS.nightDimShowAmPm,
        nightDimBrightness: typeof p.nightDimBrightness === 'number' ? Math.max(0, Math.min(100, p.nightDimBrightness)) : DEFAULT_PREFS.nightDimBrightness,
        clockDisplayEnabled: typeof p.clockDisplayEnabled === 'boolean' ? p.clockDisplayEnabled : DEFAULT_PREFS.clockDisplayEnabled,
        clockDisplayDelaySecs: typeof p.clockDisplayDelaySecs === 'number' ? Math.max(30, Math.min(86400, p.clockDisplayDelaySecs)) : DEFAULT_PREFS.clockDisplayDelaySecs,
        clockDisplayColor: (typeof p.clockDisplayColor === 'string' && CLOCK_DISPLAY_COLORS.includes(p.clockDisplayColor)) ? p.clockDisplayColor : DEFAULT_PREFS.clockDisplayColor,
        clockDisplayFont: (typeof p.clockDisplayFont === 'string' && CLOCK_FONTS.some((f) => f.value === p.clockDisplayFont)) ? p.clockDisplayFont : DEFAULT_PREFS.clockDisplayFont,
        clockDisplayShowDate: typeof p.clockDisplayShowDate === 'boolean' ? p.clockDisplayShowDate : DEFAULT_PREFS.clockDisplayShowDate,
        clockDisplayShowSeconds: typeof p.clockDisplayShowSeconds === 'boolean' ? p.clockDisplayShowSeconds : DEFAULT_PREFS.clockDisplayShowSeconds,
        clockDisplayHour12: typeof p.clockDisplayHour12 === 'boolean' ? p.clockDisplayHour12 : DEFAULT_PREFS.clockDisplayHour12,
        clockDisplayShowAmPm: typeof p.clockDisplayShowAmPm === 'boolean' ? p.clockDisplayShowAmPm : DEFAULT_PREFS.clockDisplayShowAmPm,
        volume: typeof p.volume === 'number' ? Math.min(100, Math.max(0, p.volume)) : DEFAULT_PREFS.volume,
        alarmSoundId: typeof p.alarmSoundId === 'string' ? p.alarmSoundId : DEFAULT_PREFS.alarmSoundId,
        alarmSoundName: typeof p.alarmSoundName === 'string' ? p.alarmSoundName : DEFAULT_PREFS.alarmSoundName,
        alarmOnTimer: typeof p.alarmOnTimer === 'boolean' ? p.alarmOnTimer : DEFAULT_PREFS.alarmOnTimer,
        alarmOnAlarm: typeof p.alarmOnAlarm === 'boolean' ? p.alarmOnAlarm : DEFAULT_PREFS.alarmOnAlarm,
        alarmSnoozeMins: typeof p.alarmSnoozeMins === 'number' ? Math.max(1, Math.min(999, p.alarmSnoozeMins)) : DEFAULT_PREFS.alarmSnoozeMins,
        alarmVolume: typeof p.alarmVolume === 'number' ? Math.min(100, Math.max(0, p.alarmVolume)) : DEFAULT_PREFS.alarmVolume,
        alarmSnoozeResumeAudio: typeof p.alarmSnoozeResumeAudio === 'boolean' ? p.alarmSnoozeResumeAudio : DEFAULT_PREFS.alarmSnoozeResumeAudio,
        alarmPulseOnTimer: typeof p.alarmPulseOnTimer === 'boolean' ? p.alarmPulseOnTimer : DEFAULT_PREFS.alarmPulseOnTimer,
        alarmPulseOnAlarm: typeof p.alarmPulseOnAlarm === 'boolean' ? p.alarmPulseOnAlarm : DEFAULT_PREFS.alarmPulseOnAlarm,
      };
    }
  } catch { /* private browsing or corrupted */ }
  return { ...DEFAULT_PREFS };
}

type ClockFont = { value: string; label: string; google: string; weight: string };
const CLOCK_FONTS: ClockFont[] = [
  { value: 'Nunito Sans', label: 'Nunito Sans', google: 'Nunito+Sans:wght@800', weight: '800' },
  { value: 'Bebas Neue', label: 'Bebas Neue', google: 'Bebas+Neue', weight: '400' },
  { value: 'Oswald', label: 'Oswald', google: 'Oswald:wght@600', weight: '600' },
  { value: 'Raleway', label: 'Raleway', google: 'Raleway:wght@800', weight: '800' },
  { value: 'Montserrat', label: 'Montserrat', google: 'Montserrat:wght@800', weight: '800' },
];

// Ordered list of all user-selectable icons with their display key.
const GROUP_ICONS: { key: string; Component: IconType }[] = [
  // Night sky
  { key: 'Moon', Component: Moon },
  { key: 'MoonStar', Component: MoonStar },
  { key: 'Stars', Component: Stars },
  { key: 'CloudMoon', Component: CloudMoon },
  { key: 'Sunset', Component: Sunset },
  { key: 'Sunrise', Component: Sunrise },
  // Weather
  { key: 'CloudRain', Component: CloudRain },
  { key: 'CloudLightning', Component: CloudLightning },
  { key: 'CloudDrizzle', Component: CloudDrizzle },
  { key: 'CloudSnow', Component: CloudSnow },
  { key: 'CloudFog', Component: CloudFog },
  { key: 'CloudSun', Component: CloudSun },
  { key: 'Waves', Component: Waves },
  { key: 'Wind', Component: Wind },
  { key: 'Snowflake', Component: Snowflake },
  { key: 'Sun', Component: Sun },
  { key: 'Droplets', Component: Droplets },
  { key: 'Flame', Component: Flame },
  // Night creatures & critters
  { key: 'Bug', Component: Bug },
  { key: 'Turtle', Component: Turtle },
  { key: 'Snail', Component: Snail },
  { key: 'Worm', Component: Worm },
  { key: 'Shell', Component: Shell },
  { key: 'PawPrint', Component: PawPrint },
  { key: 'Ghost', Component: Ghost },
  // Animals
  { key: 'Bird', Component: Bird },
  { key: 'Cat', Component: Cat },
  { key: 'Dog', Component: Dog },
  { key: 'Fish', Component: Fish },
  { key: 'Rabbit', Component: Rabbit },
  { key: 'Squirrel', Component: Squirrel },
  // Nature & outdoors
  { key: 'Leaf', Component: Leaf },
  { key: 'TreePine', Component: TreePine },
  { key: 'TreeDeciduous', Component: TreeDeciduous },
  { key: 'TreePalm', Component: TreePalm },
  { key: 'Trees', Component: Trees },
  { key: 'Mountain', Component: Mountain },
  { key: 'Flower2', Component: Flower2 },
  { key: 'Clover', Component: Clover },
  { key: 'Tent', Component: Tent },
  { key: 'TentTree', Component: TentTree },
  // Vehicles
  { key: 'Bike', Component: Bike },
  { key: 'Car', Component: Car },
  { key: 'Truck', Component: Truck },
  { key: 'Bus', Component: Bus },
  { key: 'Train', Component: Train },
  { key: 'Plane', Component: Plane },
  { key: 'Ship', Component: Ship },
  { key: 'Anchor', Component: Anchor },
  // Music & sound
  { key: 'Music2', Component: Music2 },
  { key: 'Music', Component: Music },
  { key: 'Headphones', Component: Headphones },
  { key: 'Radio', Component: Radio },
  { key: 'Mic2', Component: Mic2 },
  { key: 'Volume2', Component: Volume2 },
  // Symbols
  { key: 'Heart', Component: Heart },
  { key: 'Star', Component: Star },
  { key: 'Zap', Component: Zap },
  { key: 'Feather', Component: Feather },
  { key: 'Sparkles', Component: Sparkles },
  { key: 'Bell', Component: Bell },
];
const GROUP_ICON_MAP: Record<string, IconType> = Object.fromEntries(
  GROUP_ICONS.map(({ key, Component }) => [key, Component]),
);

// Used wherever a group's icon needs to be resolved.
const iconForGroup = (name: string, icon?: string): IconType => {
  if (icon && GROUP_ICON_MAP[icon]) return GROUP_ICON_MAP[icon];
  const lower = name.toLowerCase();
  if (lower.includes('rain')) return CloudRain;
  if (lower.includes('thunder') || lower.includes('storm')) return CloudLightning;
  if (lower.includes('ocean') || lower.includes('wave')) return Waves;
  if (lower.includes('cricket') || lower.includes('bird')) return Bird;
  return Music2;
};

// Returns the icon key that iconForGroup would resolve to — used to pre-populate
// the icon picker when editing a group that has no explicitly stored icon.
const iconKeyForGroup = (name: string, icon?: string): string => {
  if (icon && GROUP_ICON_MAP[icon]) return icon;
  const lower = name.toLowerCase();
  if (lower.includes('rain')) return 'CloudRain';
  if (lower.includes('thunder') || lower.includes('storm')) return 'CloudLightning';
  if (lower.includes('ocean') || lower.includes('wave')) return 'Waves';
  if (lower.includes('cricket') || lower.includes('bird')) return 'Bird';
  return 'Music2';
};

const seededGroups: SoundGroup[] = [
  {
    id: 'crickets', name: 'Crickets', kind: 'main', color: '#f5b873', enabled: true, volume: 100,
    minInterval: 8 * MINUTE_MS, maxInterval: 14 * MINUTE_MS, limitEnabled: true, limitKind: 'count', limit: 6, timeLimit: DEFAULT_TIME_LIMIT, plays: 0,
    files: [
      { id: 'crickets-meadow', name: 'Meadow at 11pm.wav', size: 18400000, role: 'main', demo: true },
      { id: 'crickets-close', name: 'Close to the porch.wav', size: 12600000, role: 'main', demo: true },
    ],
  },
  {
    id: 'rain', name: 'Rain', kind: 'effect', color: '#8db3b8', enabled: true, volume: 100,
    minInterval: 5 * MINUTE_MS, maxInterval: 11 * MINUTE_MS, limitEnabled: true, limitKind: 'count', limit: 5, timeLimit: DEFAULT_TIME_LIMIT, plays: 0,
    files: [
      { id: 'rain-window', name: 'Against the window.wav', size: 9600000, role: 'effect', demo: true },
      { id: 'rain-gutter', name: 'Soft gutter rain.wav', size: 14800000, role: 'effect', demo: true },
      { id: 'rain-roof', name: 'Rain on a tin roof.wav', size: 22300000, role: 'effect', demo: true },
    ],
  },
  {
    id: 'thunder', name: 'Thunder', kind: 'effect', color: '#a597d5', enabled: false, volume: 100,
    minInterval: 12 * MINUTE_MS, maxInterval: 22 * MINUTE_MS, limitEnabled: true, limitKind: 'count', limit: 3, timeLimit: DEFAULT_TIME_LIMIT, plays: 0,
    files: [
      { id: 'thunder-far', name: 'Far off, barely there.wav', size: 11900000, role: 'effect', demo: true },
      { id: 'thunder-low', name: 'Low rolling room.wav', size: 17100000, role: 'effect', demo: true },
    ],
  },
  {
    id: 'ocean', name: 'Ocean', kind: 'main', color: '#d9839a', enabled: false, volume: 100,
    minInterval: 8 * MINUTE_MS, maxInterval: 16 * MINUTE_MS, limitEnabled: true, limitKind: 'count', limit: 4, timeLimit: DEFAULT_TIME_LIMIT, plays: 0,
    files: [{ id: 'ocean-tide', name: 'Tide coming in.wav', size: 20100000, role: 'main', demo: true }],
  },
];

function readStoredPlaylists(): Playlist[] {
  try {
    const saved = localStorage.getItem(MUSIC_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Playlist[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* private browsing */ }
  return [];
}

function formatAudioTime(totalSeconds: number) {
  const s = Math.floor(Math.max(0, totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function readStoredGroups(): SoundGroup[] {
  const normalizeGroup = (group: SoundGroup): SoundGroup => ({
    ...group,
    volume: Math.min(100, Math.max(0, group.volume ?? 100)),
    limitEnabled: group.limitEnabled !== false,
    limitKind: group.limitKind ?? 'count',
    timeLimit: Math.max(1, group.timeLimit ?? DEFAULT_TIME_LIMIT),
    timeLimitMode: group.timeLimitMode ?? 'fixed',
    timeLimitMax: Math.max(1, group.timeLimitMax ?? DEFAULT_TIME_LIMIT_MAX),
    sessionChanceEnabled: group.sessionChanceEnabled === true,
    sessionChance: Math.min(100, Math.max(0, group.sessionChance ?? 100)),
    autoStopEnabled: group.autoStopEnabled === true,
    minDuration: Math.max(1, group.minDuration ?? DEFAULT_MAIN_MIN_DURATION),
    maxDuration: Math.max(1, group.maxDuration ?? DEFAULT_MAIN_MAX_DURATION),
  });
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as SoundGroup[];
      if (Array.isArray(parsed)) return parsed.map(normalizeGroup);
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as SoundGroup[];
      if (Array.isArray(parsed)) {
        return parsed.map((group) => normalizeGroup({
          ...group,
          minInterval: group.minInterval * MINUTE_MS,
          maxInterval: group.maxInterval * MINUTE_MS,
          limitEnabled: group.limitEnabled !== false,
        }));
      }
    }
  } catch { /* private browsing or corrupted data */ }
  return seededGroups;
}

function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatSize(bytes: number) {
  if (!bytes) return 'Audio file';
  return `${(bytes / 1000000).toFixed(1)} MB`;
}

type DurationUnit = 'hours' | 'minutes' | 'seconds' | 'milliseconds';
type IntervalKey = 'minInterval' | 'maxInterval';

function getDurationParts(totalMilliseconds: number) {
  return {
    hours: Math.floor(totalMilliseconds / HOUR_MS),
    minutes: Math.floor((totalMilliseconds % HOUR_MS) / MINUTE_MS),
    seconds: Math.floor((totalMilliseconds % MINUTE_MS) / SECOND_MS),
    milliseconds: Math.floor(totalMilliseconds % SECOND_MS),
  };
}

function formatDuration(totalMilliseconds: number) {
  const parts = getDurationParts(totalMilliseconds);
  return `${parts.hours}h ${String(parts.minutes).padStart(2, '0')}m ${String(parts.seconds).padStart(2, '0')}s ${String(parts.milliseconds).padStart(3, '0')}ms`;
}

function formatDurationNoMs(totalMilliseconds: number) {
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const segments: string[] = [];
  if (hours > 0) segments.push(`${hours}h`);
  segments.push(`${String(minutes).padStart(2, '0')}m`);
  segments.push(`${String(seconds).padStart(2, '0')}s`);
  return segments.join(' ');
}

function timerPartsToMilliseconds(parts: TimerParts) {
  return parts.hours * HOUR_MS + parts.minutes * MINUTE_MS + parts.seconds * SECOND_MS + parts.milliseconds;
}

function getAlarmDeadline(alarmTime: string) {
  if (!alarmTime) return null;
  const [hoursValue, minutesValue, secondsValue] = alarmTime.split(':');
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);
  const seconds = secondsValue ? Number(secondsValue) : 0;
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  const now = new Date();
  const alarm = new Date(now);
  alarm.setHours(hours, minutes, seconds || 0, 0);
  if (alarm.getTime() <= now.getTime()) alarm.setDate(alarm.getDate() + 1);
  return alarm.getTime();
}

function formatClockTime(date: Date, showSeconds = true, hour12 = true, showAmPm = true) {
  const str = date.toLocaleTimeString([], {
    hour: 'numeric', minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' } : {}),
    hour12,
  });
  if (hour12 && !showAmPm) return str.replace(/\s*(AM|PM)$/i, '').trim();
  return str;
}

function formatClockDate(date: Date) {
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// resolvedLimit is pre-computed at session start (handles random range); falls back to group.timeLimit.
function hasReachedPlayLimit(group: SoundGroup, sessionElapsedMs: number, resolvedLimit?: number) {
  if (!group.limitEnabled) return false;
  if (group.limitKind === 'time') return sessionElapsedMs >= (resolvedLimit ?? group.timeLimit ?? DEFAULT_TIME_LIMIT);
  return group.plays >= group.limit;
}

function isSupportedAudioFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith('.mp3') || name.endsWith('.wav') || ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave'].includes(file.type);
}

function combinedVolume(masterVol: number, groupVol: number) {
  // Group slider uses a quadratic taper so low percentages feel genuinely quiet.
  // 10 % group → 1 % of master's amplitude rather than 10 %, matching perceived loudness.
  return (masterVol / 100) * Math.pow(groupVol / 100, 2);
}

function App() {
  const updateCheck = useUpdateCheck();
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(() => {
    try { return localStorage.getItem(DISMISSED_UPDATE_KEY); } catch { return null; }
  });
  const [groups, setGroups] = useState<SoundGroup[]>(readStoredGroups);

  // Restore audio blob URLs from IndexedDB on startup.
  // Group metadata survives reload (localStorage) but blob: URLs don't — we rebuild them here.
  useEffect(() => {
    const stored = readStoredGroups();
    const fileIds = stored.flatMap((g) => g.files.filter((f) => !f.demo).map((f) => f.id));
    if (!fileIds.length) return;
    Promise.all(fileIds.map(async (id) => ({ id, data: await loadAudioFile(id) }))).then((results) => {
      const urlMap: Record<string, string> = {};
      for (const { id, data } of results) {
        if (data) urlMap[id] = URL.createObjectURL(new Blob([data.buffer], { type: data.type }));
      }
      if (!Object.keys(urlMap).length) return;
      setGroups((current) =>
        current.map((g) => ({
          ...g,
          files: g.files.map((f) => (urlMap[f.id] ? { ...f, url: urlMap[f.id] } : f)),
        })),
      );
    }).catch(() => { /* IDB unavailable — user will need to re-add files */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore music track blob URLs from IndexedDB on startup.
  useEffect(() => {
    const stored = readStoredPlaylists();
    const trackIds = stored.flatMap((p) => p.tracks.map((t) => t.id));
    if (!trackIds.length) return;
    Promise.all(trackIds.map(async (id) => ({ id, data: await loadAudioFile(`music:${id}`) }))).then((results) => {
      const urlMap: Record<string, string> = {};
      for (const { id, data } of results) {
        if (data) urlMap[id] = URL.createObjectURL(new Blob([data.buffer], { type: data.type }));
      }
      if (!Object.keys(urlMap).length) return;
      setPlaylists((current) =>
        current.map((p) => ({
          ...p,
          tracks: p.tracks.map((t) => (urlMap[t.id] ? { ...t, url: urlMap[t.id] } : t)),
        })),
      );
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore alarm sound blob URL from IndexedDB on startup.
  useEffect(() => {
    const prefs = readStoredPrefs();
    if (!prefs.alarmSoundId) return;
    loadAudioFile(`alarm:${prefs.alarmSoundId}`).then((data) => {
      if (!data) return;
      setAlarmSoundUrl(URL.createObjectURL(new Blob([data.buffer], { type: data.type })));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [page, setPage] = useState<Page>('home');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [mainTrackId, setMainTrackId] = useState<string | null>(null);
  const [volume, setVolume] = useState(() => readStoredPrefs().volume);
  const [lastEffect, setLastEffect] = useState('Waiting for a little weather');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [endMode, setEndMode] = useState<EndMode>('none');
  const [timerParts, setTimerParts] = useState<TimerParts>({ hours: 8, minutes: 0, seconds: 0, milliseconds: 0 });
  const [alarmTime, setAlarmTime] = useState('07:00');
  const [endAt, setEndAt] = useState<number | null>(null);
  const [endRemaining, setEndRemaining] = useState(0);
  const [nightTextColor, setNightTextColor] = useState(() => readStoredPrefs().nightTextColor);
  const [nightShowDate, setNightShowDate] = useState(() => readStoredPrefs().nightShowDate);
  const [nightShowSeconds, setNightShowSeconds] = useState(() => readStoredPrefs().nightShowSeconds);
  const [nightHour12, setNightHour12] = useState(() => readStoredPrefs().nightHour12);
  const [nightShowAmPm, setNightShowAmPm] = useState(() => readStoredPrefs().nightShowAmPm);
  const [nightClockFont, setNightClockFont] = useState(() => readStoredPrefs().nightClockFont);
  const [nightDimEnabled, setNightDimEnabled] = useState(() => readStoredPrefs().nightDimEnabled);
  const [nightDimDelaySecs, setNightDimDelaySecs] = useState(() => readStoredPrefs().nightDimDelaySecs);
  const [nightDimColor, setNightDimColor] = useState(() => readStoredPrefs().nightDimColor);
  const [nightDimShowClock, setNightDimShowClock] = useState(() => readStoredPrefs().nightDimShowClock);
  const [nightDimShowDate, setNightDimShowDate] = useState(() => readStoredPrefs().nightDimShowDate);
  const [nightDimShowSeconds, setNightDimShowSeconds] = useState(() => readStoredPrefs().nightDimShowSeconds);
  const [nightDimShowAmPm, setNightDimShowAmPm] = useState(() => readStoredPrefs().nightDimShowAmPm);
  const [nightDimBrightness, setNightDimBrightness] = useState(() => readStoredPrefs().nightDimBrightness);
  const [clockDisplayEnabled, setClockDisplayEnabled] = useState(() => readStoredPrefs().clockDisplayEnabled);
  const [clockDisplayDelaySecs, setClockDisplayDelaySecs] = useState(() => readStoredPrefs().clockDisplayDelaySecs);
  const [clockDisplayColor, setClockDisplayColor] = useState(() => readStoredPrefs().clockDisplayColor);
  const [clockDisplayFont, setClockDisplayFont] = useState(() => readStoredPrefs().clockDisplayFont);
  const [clockDisplayShowDate, setClockDisplayShowDate] = useState(() => readStoredPrefs().clockDisplayShowDate);
  const [clockDisplayShowSeconds, setClockDisplayShowSeconds] = useState(() => readStoredPrefs().clockDisplayShowSeconds);
  const [clockDisplayHour12, setClockDisplayHour12] = useState(() => readStoredPrefs().clockDisplayHour12);
  const [clockDisplayShowAmPm, setClockDisplayShowAmPm] = useState(() => readStoredPrefs().clockDisplayShowAmPm);
  const [clockDisplayActive, setClockDisplayActive] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  const [alarmSoundId, setAlarmSoundId] = useState<string | null>(() => readStoredPrefs().alarmSoundId);
  const [alarmSoundName, setAlarmSoundName] = useState<string>(() => readStoredPrefs().alarmSoundName);
  const [alarmSoundUrl, setAlarmSoundUrl] = useState<string | null>(null);
  const [alarmOnTimer, setAlarmOnTimer] = useState<boolean>(() => readStoredPrefs().alarmOnTimer);
  const [alarmOnAlarm, setAlarmOnAlarm] = useState<boolean>(() => readStoredPrefs().alarmOnAlarm);
  const [alarmSnoozeMins, setAlarmSnoozeMins] = useState<number>(() => readStoredPrefs().alarmSnoozeMins);
  const [alarmVolume, setAlarmVolume] = useState<number>(() => readStoredPrefs().alarmVolume);
  const [alarmSnoozeResumeAudio, setAlarmSnoozeResumeAudio] = useState<boolean>(() => readStoredPrefs().alarmSnoozeResumeAudio);
  const [alarmPulseOnTimer, setAlarmPulseOnTimer] = useState<boolean>(() => readStoredPrefs().alarmPulseOnTimer);
  const [alarmPulseOnAlarm, setAlarmPulseOnAlarm] = useState<boolean>(() => readStoredPrefs().alarmPulseOnAlarm);
  const [alarmPulseActive, setAlarmPulseActive] = useState(false);
  const [alarmTesting, setAlarmTesting] = useState(false);
  // ── Schedule start ────────────────────────────────────────────────────────
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('off');
  const [scheduleParts, setScheduleParts] = useState<TimerParts>({ hours: 0, minutes: 30, seconds: 0, milliseconds: 0 });
  const [scheduleTime, setScheduleTime] = useState('22:00');
  const [scheduleRepeat, setScheduleRepeat] = useState(false);
  const [scheduleActive, setScheduleActive] = useState(false);
  const [scheduleEndAt, setScheduleEndAt] = useState<number | null>(null);
  const [scheduleRemaining, setScheduleRemaining] = useState(0);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [mainStopAt, setMainStopAt] = useState<number | null>(null);
  const [mainStopRemaining, setMainStopRemaining] = useState(0);
  const [mainStopTrackId, setMainStopTrackId] = useState<string | null>(null);
  const [modal, setModal] = useState<'new' | string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupKind, setGroupKind] = useState<GroupKind>('effect');
  const [groupColor, setGroupColor] = useState(COLORS[0]);
  const [groupIcon, setGroupIcon] = useState<string | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  // ── Music player ──────────────────────────────────────────────────────────
  const [playlists, setPlaylists] = useState<Playlist[]>(readStoredPlaylists);
  const [musicViewPlaylistId, setMusicViewPlaylistId] = useState<string | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [musicStatus, setMusicStatus] = useState<MusicStatus>('idle');
  const [musicVolume, setMusicVolume] = useState(DEFAULT_MUSIC_VOLUME);
  const [musicElapsed, setMusicElapsed] = useState(0);
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicShuffle, setMusicShuffle] = useState(false);
  const [musicRepeat, setMusicRepeat] = useState<MusicRepeat>('none');
  const [musicTimerParts, setMusicTimerParts] = useState<TimerParts>({ hours: 0, minutes: 30, seconds: 0, milliseconds: 0 });
  const [musicTimerEndAt, setMusicTimerEndAt] = useState<number | null>(null);
  const [musicTimerRemaining, setMusicTimerRemaining] = useState(0);
  const [sidebarMusicVisible, setSidebarMusicVisible] = useState(false);

  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const effectAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const groupsRef = useRef(groups);
  const volumeRef = useRef(volume);
  const elapsedMsRef = useRef(0);
  const mainGroupVolumeRef = useRef(100);
  const currentEffectGroupVolumeRef = useRef(100);
  const currentEffectGroupIdRef = useRef<string | null>(null);
  // Per-group independent effect timers (one setTimeout per effect group).
  const groupTimerRefs = useRef<Record<string, number>>({});
  // Time limits resolved once per session so random ranges stay stable while running.
  const resolvedTimeLimitsRef = useRef<Record<string, number>>({});
  // Always-fresh session status ref for stable access inside event handlers / closures.
  const sessionStatusRef = useRef<SessionStatus>('idle');
  // Stable ref to scheduleGroup — filled by the effect scheduler so visibilitychange can re-kick groups.
  const scheduleGroupRef = useRef<(groupId: string) => void>(() => {});
  const alarmSoundUrlRef = useRef<string | null>(null);
  const alarmOnTimerRef = useRef(true);
  const alarmOnAlarmRef = useRef(true);
  const alarmSnoozeMinsRef = useRef(9);
  const alarmVolumeRef = useRef(100);
  const alarmSnoozeResumeAudioRef = useRef(true);
  const alarmPulseOnTimerRef = useRef(true);
  const alarmPulseOnAlarmRef = useRef(true);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const preAlarmMainTrackIdRef = useRef<string | null>(null);
  const alarmingAudioRef = useRef<HTMLAudioElement | null>(null);
  const alarmAutoStopTimerRef = useRef<number | null>(null);
  const alarmTestAudioRef = useRef<HTMLAudioElement | null>(null);
  const alarmTestTimerRef = useRef<number | null>(null);
  const isSnoozeRef = useRef(false);

  // ── Music player refs (always-fresh values for async audio callbacks) ──────
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicFileInputRef = useRef<HTMLInputElement | null>(null);
  const alarmFileInputRef = useRef<HTMLInputElement | null>(null);
  const addingToPlaylistRef = useRef<string | null>(null);
  const musicNextTrackRef = useRef<() => void>(() => {});
  const musicPlayTrackRef = useRef<(playlist: Playlist, index: number) => void>(() => {});
  const musicVolumeRef = useRef(DEFAULT_MUSIC_VOLUME);
  const playlistsRef = useRef<Playlist[]>([]);
  const activePlaylistIdRef = useRef<string | null>(null);
  const activeTrackIndexRef = useRef(0);
  const musicRepeatRef = useRef<MusicRepeat>('none');
  const musicShuffleRef = useRef(false);
  // When the auto-stop timer expires we let the current song finish rather than killing it mid-track.
  const musicTimerExpiredRef = useRef(false);
  // Always-fresh ref to startSession so schedule effects can call it without stale closure.
  const startSessionRef = useRef<() => void>(() => {});

  groupsRef.current = groups;
  volumeRef.current = volume;
  alarmSoundUrlRef.current = alarmSoundUrl;
  alarmOnTimerRef.current = alarmOnTimer;
  alarmOnAlarmRef.current = alarmOnAlarm;
  alarmSnoozeMinsRef.current = alarmSnoozeMins;
  alarmVolumeRef.current = alarmVolume;
  alarmSnoozeResumeAudioRef.current = alarmSnoozeResumeAudio;
  alarmPulseOnTimerRef.current = alarmPulseOnTimer;
  alarmPulseOnAlarmRef.current = alarmPulseOnAlarm;
  elapsedMsRef.current = elapsed * 1000;
  sessionStatusRef.current = sessionStatus;
  playlistsRef.current = playlists;
  activePlaylistIdRef.current = activePlaylistId;
  activeTrackIndexRef.current = activeTrackIndex;
  musicRepeatRef.current = musicRepeat;
  musicShuffleRef.current = musicShuffle;
  musicVolumeRef.current = musicVolume;

  // Keep mainGroupVolumeRef in sync with the group owning the active track.
  useEffect(() => {
    const g = groups.find((group) => group.files.some((f) => f.id === mainTrackId));
    mainGroupVolumeRef.current = g?.volume ?? 100;
    if (mainAudioRef.current) {
      mainAudioRef.current.volume = combinedVolume(volumeRef.current, mainGroupVolumeRef.current);
    }
  }, [groups, mainTrackId]);

  useEffect(() => {
    const tick = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  // Screen Wake Lock — prevents Chromium from throttling the tab while a session runs.
  // The browser can silently release the lock on screen-dim, battery events, etc., so we
  // re-request it every time the tab regains visibility or the lock fires its own release event.
  useEffect(() => {
    if (sessionStatus !== 'running') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!nav.wakeLock) return;

    let lock: { release: () => Promise<void>; addEventListener: (e: string, cb: () => void) => void } | null = null;
    let cancelled = false;

    const acquire = () => {
      if (cancelled) return;
      nav.wakeLock.request('screen')
        .then((l: typeof lock) => {
          if (cancelled) { void l?.release(); return; }
          lock = l;
          // Re-acquire automatically whenever the browser releases early.
          l?.addEventListener('release', () => { if (!cancelled) acquire(); });
        })
        .catch(() => { /* unsupported or permission denied */ });
    };

    // Also re-acquire when the tab comes back into view (lock is auto-released on hide).
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    acquire();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [sessionStatus]);

  const finishSession = (message?: string) => {
    isSnoozeRef.current = false;
    setAlarmPulseActive(false);
    setSessionStatus('idle');
    setElapsed(0);
    setMainTrackId(null);
    setEndAt(null);
    setEndRemaining(0);
    setMainStopAt(null);
    setMainStopRemaining(0);
    setMainStopTrackId(null);
    setGroups((current) => current.map((group) => ({ ...group, plays: 0 })));
    if (message) setToast(message);
  };

  // ── Alarming state ────────────────────────────────────────────────────────
  // When a timer or alarm session ends and an alarm file is configured, we
  // enter 'alarming' instead of finishing immediately.  The alarm loops until
  // the user presses Stop or Snooze, or 10 minutes elapse.

  const stopAlarmAudio = () => {
    if (alarmingAudioRef.current) {
      alarmingAudioRef.current.onended = null;
      alarmingAudioRef.current.pause();
      alarmingAudioRef.current = null;
    }
    if (alarmAutoStopTimerRef.current !== null) {
      window.clearTimeout(alarmAutoStopTimerRef.current);
      alarmAutoStopTimerRef.current = null;
    }
  };

  const startAlarming = (shouldPulse: boolean) => {
    if (shouldPulse) setAlarmPulseActive(true);
    // Stop the main audio and all pending effect timers immediately.
    if (mainAudioRef.current) { mainAudioRef.current.pause(); mainAudioRef.current = null; }
    Object.keys(groupTimerRefs.current).forEach((id) => {
      window.clearTimeout(groupTimerRefs.current[id]);
      delete groupTimerRefs.current[id];
    });
    // Save the active main track so snooze can restore it if "resume audio" is on.
    preAlarmMainTrackIdRef.current = mainTrackId;
    setMainTrackId(null);
    // Update the ref immediately so the playLoop guard sees 'alarming' before React flushes.
    sessionStatusRef.current = 'alarming';
    setSessionStatus('alarming');
    setEndAt(null);

    const url = alarmSoundUrlRef.current;
    if (url) {
      const playLoop = () => {
        if (sessionStatusRef.current !== 'alarming') return;
        const a = new Audio(url);
        a.volume = alarmVolumeRef.current / 100;
        a.onended = playLoop;
        alarmingAudioRef.current = a;
        void a.play().catch(() => {});
      };
      playLoop();
    }

    // Auto-stop after 10 minutes of no action.
    alarmAutoStopTimerRef.current = window.setTimeout(() => {
      stopAlarmAudio();
      finishSession();
    }, 10 * 60 * 1000);
  };

  const snoozeAlarm = () => {
    stopAlarmAudio();
    setAlarmPulseActive(false);
    const snoozeDuration = alarmSnoozeMinsRef.current * 60 * 1000;
    // Mark as snoozing so the next expiry always re-alarms — but do NOT
    // touch endMode or timerParts so the user's home-screen settings are preserved.
    isSnoozeRef.current = true;
    // If "resume audio during snooze" is on, restore the main track that was
    // playing before the alarm — the existing useEffect re-starts playback automatically.
    if (alarmSnoozeResumeAudioRef.current && preAlarmMainTrackIdRef.current) {
      setMainTrackId(preAlarmMainTrackIdRef.current);
    } else {
      setMainTrackId(null);
    }
    setMainStopAt(null);
    setMainStopRemaining(0);
    setMainStopTrackId(null);
    setEndAt(Date.now() + snoozeDuration);
    setEndRemaining(snoozeDuration);
    setGroups((current) => current.map((group) => ({ ...group, plays: 0 })));
    setSessionStatus('running');
  };

  const activeTrack = useMemo(
    () => groups.flatMap((group) => group.files).find((file) => file.id === mainTrackId),
    [groups, mainTrackId],
  );
  const mainGroups = useMemo(
    () => groups.filter((group) => group.kind === 'main'),
    [groups],
  );
  const effectGroups = useMemo(
    () => groups.filter((group) => group.kind === 'effect'),
    [groups],
  );
  const allFileCount = groups.reduce((count, group) => count + group.files.length, 0);

  useEffect(() => {
    try {
      const metadata = groups.map((group) => ({
        ...group,
        files: group.files.map(({ url: _url, ...file }) => file),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
    } catch { /* private browsing context */ }
  }, [groups]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
        nightTextColor, nightShowDate, nightShowSeconds, nightHour12, nightShowAmPm, nightClockFont,
        nightDimEnabled, nightDimDelaySecs, nightDimColor, nightDimShowClock, nightDimShowDate, nightDimShowSeconds, nightDimShowAmPm, nightDimBrightness,
        clockDisplayEnabled, clockDisplayDelaySecs, clockDisplayColor, clockDisplayFont, clockDisplayShowDate, clockDisplayShowSeconds, clockDisplayHour12, clockDisplayShowAmPm,
        volume, alarmSoundId, alarmSoundName, alarmOnTimer, alarmOnAlarm, alarmSnoozeMins, alarmVolume, alarmSnoozeResumeAudio, alarmPulseOnTimer, alarmPulseOnAlarm,
      }));
    } catch { /* private browsing context */ }
  }, [nightTextColor, nightShowDate, nightShowSeconds, nightHour12, nightShowAmPm, nightClockFont, nightDimEnabled, nightDimDelaySecs, nightDimColor, nightDimShowClock, nightDimShowDate, nightDimShowSeconds, nightDimShowAmPm, nightDimBrightness, clockDisplayEnabled, clockDisplayDelaySecs, clockDisplayColor, clockDisplayFont, clockDisplayShowDate, clockDisplayShowSeconds, clockDisplayHour12, clockDisplayShowAmPm, volume, alarmSoundId, alarmSoundName, alarmOnTimer, alarmOnAlarm, alarmSnoozeMins, alarmVolume, alarmSnoozeResumeAudio, alarmPulseOnTimer, alarmPulseOnAlarm]);

  // ── Clock display: idle detection ───────────────────────────────────────────
  useEffect(() => {
    // Only engage on home page with no active session
    if (!clockDisplayEnabled || page !== 'home' || sessionStatus !== 'idle') {
      setClockDisplayActive(false);
      return;
    }
    // Overlay is already up — clicks handled by the overlay itself
    if (clockDisplayActive) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const activate = () => setClockDisplayActive(true);
    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(activate, clockDisplayDelaySecs * 1000);
    };
    resetTimer();
    document.addEventListener('mousemove', resetTimer, { passive: true });
    document.addEventListener('mousedown', resetTimer, { passive: true });
    document.addEventListener('keydown', resetTimer as EventListener, { passive: true });
    document.addEventListener('touchstart', resetTimer, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('mousemove', resetTimer);
      document.removeEventListener('mousedown', resetTimer);
      document.removeEventListener('keydown', resetTimer as EventListener);
      document.removeEventListener('touchstart', resetTimer);
    };
  }, [clockDisplayEnabled, clockDisplayDelaySecs, page, sessionStatus, clockDisplayActive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sessionStatus !== 'running') return;
    const tick = window.setInterval(() => setElapsed((current) => current + 1), 1000);
    return () => window.clearInterval(tick);
  }, [sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== 'running' || !endAt) return;
    const checkEnd = () => {
      const remaining = Math.max(0, endAt - Date.now());
      setEndRemaining(remaining);
      if (remaining <= 0) {
        const isAlarmEnd = endMode === 'alarm';
        const hasAlarmFile = Boolean(alarmSoundUrlRef.current);
        // Snooze expiry always re-alarms (user explicitly asked to be woken again).
        const shouldAlarm = hasAlarmFile && (isSnoozeRef.current || (isAlarmEnd ? alarmOnAlarmRef.current : alarmOnTimerRef.current));
        if (shouldAlarm) {
          startAlarming(isSnoozeRef.current ? false : (isAlarmEnd ? alarmPulseOnAlarmRef.current : alarmPulseOnTimerRef.current));
        } else {
          finishSession(isAlarmEnd ? 'Your alarm went off. The session has ended.' : 'Your timer is finished. The session has ended.');
        }
      }
    };
    checkEnd();
    const tick = window.setInterval(checkEnd, 250);
    return () => window.clearInterval(tick);
  }, [endAt, endMode, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== 'running' || !mainStopAt || !mainStopTrackId) return;
    const stopMainSound = () => {
      setMainTrackId((current) => current === mainStopTrackId ? null : current);
      setMainStopAt(null);
      setMainStopRemaining(0);
      setMainStopTrackId(null);
      setToast('The main sound faded out for this session.');
    };
    const remaining = Math.max(0, mainStopAt - Date.now());
    setMainStopRemaining(remaining);
    const timer = window.setTimeout(stopMainSound, remaining);
    return () => window.clearTimeout(timer);
  }, [mainStopAt, mainStopTrackId, sessionStatus]);

  // Main looping audio — dedicated element, never interrupted by effects.
  useEffect(() => {
    if (mainAudioRef.current) {
      mainAudioRef.current.pause();
      mainAudioRef.current = null;
    }
    if (activeTrack?.url) {
      const trackUrl = activeTrack.url;
      const audio = new Audio(trackUrl);
      audio.loop = true;
      audio.volume = combinedVolume(volumeRef.current, mainGroupVolumeRef.current);
      // Recovery: if the browser kills the element (e.g. background-tab audio eviction),
      // wait 2 s and recreate it so the room doesn't go silent.
      audio.onerror = () => {
        if (mainAudioRef.current !== audio) return; // already replaced
        mainAudioRef.current = null;
        if (sessionStatusRef.current !== 'running') return;
        window.setTimeout(() => {
          if (mainAudioRef.current !== null || sessionStatusRef.current !== 'running') return;
          const recovery = new Audio(trackUrl);
          recovery.loop = true;
          recovery.volume = audio.volume;
          recovery.onerror = () => { if (mainAudioRef.current === recovery) mainAudioRef.current = null; };
          mainAudioRef.current = recovery;
          void recovery.play().catch(() => {});
        }, 2000);
      };
      mainAudioRef.current = audio;
      if (sessionStatus === 'running') void audio.play().catch(() => setToast('Your browser needs a click before it can play audio.'));
    }
    return () => { mainAudioRef.current?.pause(); };
  }, [activeTrack?.id, sessionStatus]);

  // Update volumes when master slider changes.
  useEffect(() => {
    if (mainAudioRef.current) mainAudioRef.current.volume = combinedVolume(volume, mainGroupVolumeRef.current);
    if (effectAudioRef.current) effectAudioRef.current.volume = combinedVolume(volume, currentEffectGroupVolumeRef.current);
  }, [volume]);

  // Live-sync effect group volume when user changes it mid-session (e.g. via the night panel).
  useEffect(() => {
    if (!currentEffectGroupIdRef.current || !effectAudioRef.current) return;
    const g = groups.find((group) => group.id === currentEffectGroupIdRef.current);
    if (g) {
      currentEffectGroupVolumeRef.current = g.volume ?? 100;
      effectAudioRef.current.volume = combinedVolume(volumeRef.current, currentEffectGroupVolumeRef.current);
    }
  }, [groups]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect audio helpers ────────────────────────────────────────────────
  // Play a specific group's effect on the shared effect audio channel.
  // onFinished is called exactly once regardless of how the audio completes.
  const playGroupEffect = (group: SoundGroup, onFinished: () => void) => {
    const files = group.files.filter((f) => f.role === 'effect');
    if (!files.length) { onFinished(); return; }
    const file = files[Math.floor(Math.random() * files.length)];

    setLastEffect(`${group.name} · ${file.name.replace(/\.[^.]+$/, '')}`);

    // Clear the previous audio element fully (including onerror) so no stale
    // handlers fire after replacement and the busy-check sees a clean state.
    if (effectAudioRef.current) {
      effectAudioRef.current.onended = null;
      effectAudioRef.current.onerror = null;
      effectAudioRef.current.pause();
      effectAudioRef.current = null;
    }
    currentEffectGroupVolumeRef.current = group.volume ?? 100;
    currentEffectGroupIdRef.current = group.id;

    if (!file.url) { onFinished(); return; }

    let called = false;

    // success = true  → audio played all the way through; count it towards the play budget.
    // success = false → audio errored or was rejected; reschedule without burning the budget.
    const done = (success: boolean) => {
      if (called) return;
      called = true;
      // Clear the refs so subsequent busy-checks don't see a stale ended/failed element.
      if (effectAudioRef.current === audio) effectAudioRef.current = null;
      if (currentEffectGroupIdRef.current === group.id) currentEffectGroupIdRef.current = null;
      if (success) {
        setGroups((current) => current.map((item) => item.id === group.id ? { ...item, plays: item.plays + 1 } : item));
      }
      onFinished();
    };

    const audio = new Audio(file.url);
    audio.volume = combinedVolume(volumeRef.current, currentEffectGroupVolumeRef.current);
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    effectAudioRef.current = audio;
    void audio.play().catch(() => done(false));
  };

  // Manual trigger — picks a random available group.
  const triggerEffect = (onFinished: () => void) => {
    const available = groupsRef.current.filter(
      (group) => group.enabled && group.kind === 'effect' && !hasReachedPlayLimit(group, elapsedMsRef.current, resolvedTimeLimitsRef.current[group.id]) && group.files.some((f) => f.role === 'effect'),
    );
    if (!available.length) { onFinished(); return; }
    const group = available[Math.floor(Math.random() * available.length)];
    playGroupEffect(group, onFinished);
  };

  // Per-group independent effect scheduler.
  // Each group has its own countdown, so a 10-20s group always fires in 10-20s
  // regardless of other groups with longer intervals.
  useEffect(() => {
    if (sessionStatus !== 'running') {
      Object.values(groupTimerRefs.current).forEach((id) => window.clearTimeout(id));
      groupTimerRefs.current = {};
      if (effectAudioRef.current) {
        effectAudioRef.current.onended = null;
        effectAudioRef.current.pause();
        effectAudioRef.current = null;
      }
      return;
    }

    const scheduleGroup = (groupId: string) => {
      // Guard: if this group already has a pending timer, don't double-schedule.
      if (groupId in groupTimerRefs.current) return;
      const g = groupsRef.current.find((group) => group.id === groupId);
      if (!g || !g.enabled || !g.files.some((f) => f.role === 'effect')) return;
      if (hasReachedPlayLimit(g, elapsedMsRef.current, resolvedTimeLimitsRef.current[g.id])) return;

      const delay = g.minInterval + Math.random() * Math.max(0, g.maxInterval - g.minInterval);
      groupTimerRefs.current[groupId] = window.setTimeout(() => {
        delete groupTimerRefs.current[groupId];
        const current = groupsRef.current.find((group) => group.id === groupId);
        if (!current || !current.enabled || hasReachedPlayLimit(current, elapsedMsRef.current, resolvedTimeLimitsRef.current[current.id])) return;

        // If another effect is actively playing, wait briefly and retry rather than interrupting.
        const busy = effectAudioRef.current && !effectAudioRef.current.ended && !effectAudioRef.current.paused;
        if (busy) {
          groupTimerRefs.current[groupId] = window.setTimeout(() => {
            delete groupTimerRefs.current[groupId];
            scheduleGroup(groupId); // Re-enter with a fresh interval for this group.
          }, 1000 + Math.random() * 2000);
          return;
        }

        playGroupEffect(current, () => scheduleGroup(groupId));
      }, delay);
    };

    // Expose a stable ref so the visibility-change recovery handler can re-kick groups.
    scheduleGroupRef.current = scheduleGroup;

    // Kick off a timer for every currently-eligible effect group.
    groupsRef.current
      .filter((g) => g.enabled && g.kind === 'effect' && !hasReachedPlayLimit(g, elapsedMsRef.current, resolvedTimeLimitsRef.current[g.id]) && g.files.some((f) => f.role === 'effect'))
      .forEach((g) => scheduleGroup(g.id));

    return () => {
      Object.values(groupTimerRefs.current).forEach((id) => window.clearTimeout(id));
      groupTimerRefs.current = {};
    };
  }, [sessionStatus]);

  // ── Audio recovery: resume audio suspended by browser background-tab policy ─
  // Browsers (Chrome especially) can silently pause HTMLAudioElement objects when
  // a tab is backgrounded for ~1 hour. This handler fires when the tab comes back
  // into focus and restores everything that should still be playing.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (sessionStatusRef.current !== 'running') return;

      // Restore main looping audio if the browser suspended it.
      if (mainAudioRef.current?.paused) {
        void mainAudioRef.current.play().catch(() => {});
      }

      // Restore an effect that was mid-play when the browser suspended it.
      if (effectAudioRef.current && effectAudioRef.current.paused && !effectAudioRef.current.ended) {
        void effectAudioRef.current.play().catch(() => {});
      }

      // Re-kick any eligible effect groups that lost their scheduled timer while the
      // tab was backgrounded (e.g. Chrome timer throttle cleared the setTimeout).
      groupsRef.current
        .filter((g) =>
          g.enabled && g.kind === 'effect' &&
          g.files.some((f) => f.role === 'effect') &&
          !hasReachedPlayLimit(g, elapsedMsRef.current, resolvedTimeLimitsRef.current[g.id]) &&
          !(g.id in groupTimerRefs.current),
        )
        .forEach((g) => scheduleGroupRef.current(g.id));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ── Periodic health heartbeat (every 60 s while running) ─────────────────
  // Belt-and-suspenders: catches any group whose timer silently died (e.g. due
  // to timer throttling) even in tabs that never fully go background.
  useEffect(() => {
    if (sessionStatus !== 'running') return;
    const tick = window.setInterval(() => {
      // Revive main audio if it is unexpectedly paused (e.g. audio context eviction).
      if (mainAudioRef.current?.paused) {
        void mainAudioRef.current.play().catch(() => {});
      }
      // Re-kick any orphaned effect groups.
      groupsRef.current
        .filter((g) =>
          g.enabled && g.kind === 'effect' &&
          g.files.some((f) => f.role === 'effect') &&
          !hasReachedPlayLimit(g, elapsedMsRef.current, resolvedTimeLimitsRef.current[g.id]) &&
          !(g.id in groupTimerRefs.current),
        )
        .forEach((g) => scheduleGroupRef.current(g.id));
    }, 60_000);
    return () => window.clearInterval(tick);
  }, [sessionStatus]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  // ── Music player effects ──────────────────────────────────────────────────
  // Persist playlists (metadata only — URLs are transient blob: references).
  useEffect(() => {
    try {
      const metadata = playlists.map((pl) => ({ ...pl, tracks: pl.tracks.map(({ url: _url, ...t }) => t) }));
      localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(metadata));
    } catch { /* private browsing */ }
  }, [playlists]);

  // Keep audio volume in sync when slider changes.
  useEffect(() => {
    if (musicAudioRef.current) musicAudioRef.current.volume = musicVolume / 100;
  }, [musicVolume]);

  // Keep audio.loop in sync with repeat mode.
  useEffect(() => {
    if (musicAudioRef.current) musicAudioRef.current.loop = musicRepeat === 'one';
  }, [musicRepeat]);

  // Tick musicElapsed while playing.
  useEffect(() => {
    if (musicStatus !== 'playing') return;
    const tick = window.setInterval(() => {
      if (musicAudioRef.current) setMusicElapsed(musicAudioRef.current.currentTime);
    }, 250);
    return () => window.clearInterval(tick);
  }, [musicStatus]);

  // Music auto-stop timer countdown — when time is up, flag it and let the current track finish naturally.
  useEffect(() => {
    if (!musicTimerEndAt || musicStatus !== 'playing') return;
    const check = () => {
      const remaining = Math.max(0, musicTimerEndAt - Date.now());
      setMusicTimerRemaining(remaining);
      if (remaining <= 0) {
        musicTimerExpiredRef.current = true;
        setMusicTimerEndAt(null);
        setMusicTimerRemaining(0);
        setToast('Music will stop after this track.');
      }
    };
    check();
    const tick = window.setInterval(check, 250);
    return () => window.clearInterval(tick);
  }, [musicTimerEndAt, musicStatus]);

  // Set musicNextTrackRef once — reads all mutable state through refs so it never goes stale.
  useEffect(() => {
    musicNextTrackRef.current = () => {
      // If the auto-stop timer expired, finish this track cleanly and stop.
      if (musicTimerExpiredRef.current) {
        musicTimerExpiredRef.current = false;
        if (musicAudioRef.current) { musicAudioRef.current.onended = null; musicAudioRef.current = null; }
        setMusicStatus('idle'); setMusicElapsed(0); setMusicDuration(0);
        return;
      }
      const playlist = playlistsRef.current.find((p) => p.id === activePlaylistIdRef.current);
      if (!playlist || !playlist.tracks.length) return;
      const total = playlist.tracks.length;
      if (musicRepeatRef.current === 'one') return; // audio.loop handles this
      let nextIndex: number;
      const cur = activeTrackIndexRef.current;
      if (musicShuffleRef.current) {
        nextIndex = total === 1 ? 0 : (() => { let n; do { n = Math.floor(Math.random() * total); } while (n === cur); return n; })();
      } else {
        nextIndex = cur + 1;
        if (nextIndex >= total) {
          if (musicRepeatRef.current === 'all') { nextIndex = 0; }
          else {
            if (musicAudioRef.current) { musicAudioRef.current.onended = null; musicAudioRef.current = null; }
            setMusicStatus('idle'); setMusicElapsed(0); return;
          }
        }
      }
      musicPlayTrackRef.current(playlist, nextIndex);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show sidebar music mini-player while playing; hide 5 min after pausing or going idle.
  useEffect(() => {
    if (musicStatus === 'playing') { setSidebarMusicVisible(true); return; }
    const timer = window.setTimeout(() => setSidebarMusicVisible(false), 5 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [musicStatus]);

  // Preload all clock fonts from Google Fonts so switching is instant.
  useEffect(() => {
    CLOCK_FONTS.forEach((f) => {
      const id = `gf-${f.value.replace(/\s/g, '-')}`;
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id; link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
        document.head.appendChild(link);
      }
    });
  }, []);

  // Schedule countdown.
  useEffect(() => {
    if (!scheduleActive || scheduleMode !== 'countdown' || !scheduleEndAt) return;
    const tick = window.setInterval(() => {
      const remaining = Math.max(0, scheduleEndAt - Date.now());
      setScheduleRemaining(remaining);
      if (remaining <= 0) {
        setScheduleActive(false); setScheduleEndAt(null); setScheduleRemaining(0);
        startSessionRef.current();
      }
    }, 250);
    return () => window.clearInterval(tick);
  }, [scheduleActive, scheduleMode, scheduleEndAt]);

  // Schedule time-watch.
  useEffect(() => {
    if (!scheduleActive || scheduleMode !== 'time') return;
    const check = () => {
      const now = new Date();
      const [h, m] = scheduleTime.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return;
      if (now.getHours() === h && now.getMinutes() === m && now.getSeconds() < 10) {
        if (!scheduleRepeat) setScheduleActive(false);
        startSessionRef.current();
      }
    };
    check();
    const tick = window.setInterval(check, 5000);
    return () => window.clearInterval(tick);
  }, [scheduleActive, scheduleMode, scheduleTime, scheduleRepeat]);

  // Auto-cancel schedule when session becomes active.
  useEffect(() => {
    if (sessionStatus === 'running') {
      setScheduleActive(false); setScheduleEndAt(null); setScheduleRemaining(0);
    }
  }, [sessionStatus]);

  const chooseMainSound = () => {
    const eligibleGroups = mainGroups
      .filter((group) => group.enabled && group.files.some((file) => file.role === 'main'))
      .filter((group) => !group.sessionChanceEnabled || Math.random() * 100 < (group.sessionChance ?? 100));
    if (!eligibleGroups.length) return null;
    const group = eligibleGroups[Math.floor(Math.random() * eligibleGroups.length)];
    const files = group.files.filter((file) => file.role === 'main');
    return { group, file: files[Math.floor(Math.random() * files.length)] };
  };

  const startSession = () => {
    if (sessionStatus === 'paused') {
      if (endRemaining > 0) setEndAt(Date.now() + endRemaining);
      if (mainStopRemaining > 0) setMainStopAt(Date.now() + mainStopRemaining);
      setSessionStatus('running');
      return;
    }
    // Stop any music on a fresh session start.
    if (musicAudioRef.current) { musicAudioRef.current.onended = null; musicAudioRef.current.pause(); musicAudioRef.current = null; }
    if (musicStatus !== 'idle') setMusicStatus('idle');
    setMusicTimerEndAt(null);
    const selectedMain = chooseMainSound(); // null is fine — effects-only or clock-only sessions are allowed
    let deadline: number | null = null;
    if (endMode === 'timer') {
      const duration = timerPartsToMilliseconds(timerParts);
      if (duration < 1) { setToast('Set a timer longer than zero before starting.'); return; }
      deadline = Date.now() + duration;
    } else if (endMode === 'alarm') {
      deadline = getAlarmDeadline(alarmTime);
      if (!deadline) { setToast('Choose an alarm time before starting.'); return; }
    }
    setMainTrackId(selectedMain?.file.id ?? null);
    if (selectedMain?.group.autoStopEnabled) {
      const minimum = Math.max(1, selectedMain.group.minDuration ?? DEFAULT_MAIN_MIN_DURATION);
      const maximum = Math.max(minimum, selectedMain.group.maxDuration ?? DEFAULT_MAIN_MAX_DURATION);
      const duration = minimum + Math.random() * (maximum - minimum);
      setMainStopTrackId(selectedMain.file.id);
      setMainStopAt(Date.now() + duration);
      setMainStopRemaining(duration);
    } else {
      setMainStopTrackId(null);
      setMainStopAt(null);
      setMainStopRemaining(0);
    }
    setEndAt(deadline);
    setEndRemaining(deadline ? Math.max(0, deadline - Date.now()) : 0);

    // Resolve random time limits once at session start so the drawn value is stable.
    const resolved: Record<string, number> = {};
    groupsRef.current.forEach((g) => {
      if (g.limitEnabled && g.limitKind === 'time') {
        const minMs = g.timeLimit ?? DEFAULT_TIME_LIMIT;
        const maxMs = (g.timeLimitMode ?? 'fixed') === 'random'
          ? Math.max(minMs + 1, g.timeLimitMax ?? DEFAULT_TIME_LIMIT_MAX)
          : minMs;
        resolved[g.id] = minMs + Math.random() * (maxMs - minMs);
      }
    });
    resolvedTimeLimitsRef.current = resolved;

    setSessionStatus('running');
    setToast('The room is ready. Good night.');
  };

  const stopSession = () => {
    stopAlarmAudio();
    finishSession();
  };

  const pauseSession = () => {
    if (sessionStatus === 'running') {
      if (endAt) { setEndRemaining(Math.max(0, endAt - Date.now())); setEndAt(null); }
      if (mainStopAt) { setMainStopRemaining(Math.max(0, mainStopAt - Date.now())); setMainStopAt(null); }
      setSessionStatus('paused');
      return;
    }
    if (sessionStatus === 'paused') {
      if (endRemaining > 0) setEndAt(Date.now() + endRemaining);
      setSessionStatus('running');
    }
  };

  const updateTimerPart = (unit: keyof TimerParts, value: number) => {
    const limits: TimerParts = { hours: 999, minutes: 59, seconds: 59, milliseconds: 999 };
    setTimerParts((current) => ({ ...current, [unit]: Math.min(limits[unit], Math.max(0, Number.isFinite(value) ? value : 0)) }));
  };

  const updateMainSessionSetting = (groupId: string, key: 'sessionChanceEnabled' | 'sessionChance' | 'autoStopEnabled' | 'minDuration' | 'maxDuration', value: boolean | number) => {
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      if (key === 'sessionChanceEnabled' || key === 'autoStopEnabled') return { ...group, [key]: Boolean(value) };
      if (key === 'sessionChance') return { ...group, [key]: Math.min(100, Math.max(0, Number(value) || 0)) };
      return { ...group, [key]: Math.max(1, Number(value) || 1) };
    }));
  };

  const updateMainDuration = (groupId: string, key: 'minDuration' | 'maxDuration', unit: DurationUnit, value: number) => {
    const limits: Record<DurationUnit, number> = { hours: 999, minutes: 59, seconds: 59, milliseconds: 999 };
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      const parts = getDurationParts(group[key] ?? (key === 'minDuration' ? DEFAULT_MAIN_MIN_DURATION : DEFAULT_MAIN_MAX_DURATION));
      parts[unit] = Math.min(limits[unit], Math.max(0, Number.isFinite(value) ? value : 0));
      return { ...group, [key]: Math.max(1, timerPartsToMilliseconds(parts)) };
    }));
  };

  const openNewGroup = (kind?: GroupKind) => {
    setGroupName(''); setGroupKind(kind ?? 'effect'); setGroupColor(COLORS[groups.length % COLORS.length]); setGroupIcon(null); setIconPickerOpen(false); setModal('new');
  };

  const openEditGroup = (group: SoundGroup) => {
    setGroupName(group.name); setGroupKind(group.kind); setGroupColor(group.color); setGroupIcon(iconKeyForGroup(group.name, group.icon)); setIconPickerOpen(false); setModal(group.id);
  };

  const saveGroup = () => {
    const trimmed = groupName.trim();
    if (!trimmed) return;
    if (modal === 'new') {
      const group: SoundGroup = {
        id: `${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        name: trimmed, kind: groupKind, color: groupColor, icon: groupIcon ?? undefined, enabled: true, volume: 100,
        minInterval: 8 * MINUTE_MS, maxInterval: 15 * MINUTE_MS,
        limitEnabled: false, limitKind: 'count', limit: 5, timeLimit: DEFAULT_TIME_LIMIT, plays: 0,
        sessionChanceEnabled: false, sessionChance: 100, autoStopEnabled: false,
        minDuration: DEFAULT_MAIN_MIN_DURATION, maxDuration: DEFAULT_MAIN_MAX_DURATION, files: [],
      };
      setGroups((current) => [...current, group]);
      setSelectedGroup(group.id);
      setToast(`${trimmed} is ready for sound.`);
    } else {
      setGroups((current) => current.map((group) => group.id === modal ? { ...group, name: trimmed, kind: groupKind, color: groupColor, icon: groupIcon ?? undefined } : group));
      setToast('Group details saved.');
    }
    setModal(null);
  };

  const deleteGroup = (group: SoundGroup) => {
    if (!window.confirm(`Remove ${group.name} and all of its files?`)) return;
    setGroups((current) => current.filter((item) => item.id !== group.id));
    if (selectedGroup === group.id) setSelectedGroup(null);
    setToast(`${group.name} was removed.`);
  };

  const chooseGroup = (groupId: string) => {
    setSelectedGroup(groupId); setPage('library'); setMobileNavOpen(false);
  };

  const openFilePicker = (groupId?: string) => {
    if (groupId) setSelectedGroup(groupId);
    if (!groupId && !selectedGroup) { const fallback = groups[0]?.id; if (fallback) setSelectedGroup(fallback); }
    fileInputRef.current?.click();
  };

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const groupId = selectedGroup ?? groups[0]?.id;
    if (!groupId || !files.length) return;
    const supportedFiles = files.filter(isSupportedAudioFile);
    const skippedCount = files.length - supportedFiles.length;
    if (!supportedFiles.length) {
      setToast('Choose MP3 or WAV files to add to your library.');
      event.target.value = '';
      return;
    }
    const additions: Array<{ file: File; soundFile: SoundFile }> = supportedFiles.map((file, index) => ({
      file,
      soundFile: {
        id: `${file.name}-${file.lastModified}-${Date.now()}-${index}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
        name: file.name, size: file.size, role: groups.find((g) => g.id === groupId)?.kind ?? 'effect',
        url: URL.createObjectURL(file),
      },
    }));
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      const newFiles = additions.map(({ soundFile }) => ({ ...soundFile, role: group.kind }));
      return { ...group, files: [...group.files, ...newFiles] };
    }));
    // Persist raw audio data to IndexedDB so files survive page reloads.
    additions.forEach(({ file, soundFile }) => void storeAudioFile(soundFile.id, file));
    setToast(`${supportedFiles.length} ${supportedFiles.length === 1 ? 'sound' : 'sounds'} added locally.${skippedCount ? ` ${skippedCount} unsupported file${skippedCount === 1 ? '' : 's'} skipped.` : ''}`);
    event.target.value = '';
  };

  const removeFile = (groupId: string, fileId: string) => {
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, files: group.files.filter((file) => file.id !== fileId) } : group));
    void deleteAudioFile(fileId); // Remove from IndexedDB so it doesn't accumulate stale data.
    if (mainTrackId === fileId) setMainTrackId(null);
    setToast('Sound removed from the library.');
  };

  const setFileRole = (groupId: string, fileId: string, role: GroupKind) => {
    setGroups((current) => current.map((group) => group.id === groupId ? {
      ...group, files: group.files.map((file) => file.id === fileId ? { ...file, role } : file),
    } : group));
  };

  // ── Music player functions ────────────────────────────────────────────────
  // Stable play function — only refs + stable state setters, so safe as a ref callback.
  const playTrackAt = (playlist: Playlist, trackIndex: number) => {
    if (musicAudioRef.current) { musicAudioRef.current.onended = null; musicAudioRef.current.pause(); musicAudioRef.current = null; }
    const track = playlist.tracks[trackIndex];
    if (!track?.url) { setToast('This track must be re-added — audio files don\'t survive a page reload.'); return; }
    const audio = new Audio(track.url);
    audio.volume = musicVolumeRef.current / 100;
    audio.loop = musicRepeatRef.current === 'one';
    audio.onended = () => musicNextTrackRef.current();
    musicAudioRef.current = audio;
    setActivePlaylistId(playlist.id);
    setActiveTrackIndex(trackIndex);
    setMusicElapsed(0); setMusicDuration(0);
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setMusicDuration(audio.duration);
    });
    void audio.play().then(() => setMusicStatus('playing')).catch(() => setToast('Your browser needs a click before it can play audio.'));
  };
  musicPlayTrackRef.current = playTrackAt;

  const stopMusicFn = () => {
    musicTimerExpiredRef.current = false;
    if (musicAudioRef.current) { musicAudioRef.current.onended = null; musicAudioRef.current.pause(); musicAudioRef.current = null; }
    setMusicStatus('idle'); setMusicElapsed(0); setMusicDuration(0); setMusicTimerEndAt(null);
  };

  const playTrack = (playlistId: string, trackIndex: number) => {
    const playlist = playlists.find((p) => p.id === playlistId);
    if (playlist) playTrackAt(playlist, trackIndex);
  };

  const pauseMusic = () => { musicAudioRef.current?.pause(); setMusicStatus('paused'); };

  const resumeMusic = () => {
    // If the audio element was cleared (e.g. after a night session), re-create it from the saved track.
    if (!musicAudioRef.current && activePlaylistId) {
      const playlist = playlists.find((p) => p.id === activePlaylistId);
      if (playlist) { playTrackAt(playlist, activeTrackIndex); return; }
    }
    void musicAudioRef.current?.play().then(() => setMusicStatus('playing')).catch(() => setToast('Your browser needs a click before it can play audio.'));
  };

  const nextTrack = () => musicNextTrackRef.current();

  const prevTrack = () => {
    const playlist = playlists.find((p) => p.id === activePlaylistId);
    if (!playlist) return;
    if (musicAudioRef.current && musicElapsed > 3) { musicAudioRef.current.currentTime = 0; setMusicElapsed(0); return; }
    const total = playlist.tracks.length;
    const prevIndex = musicShuffleRef.current ? Math.floor(Math.random() * total) : (activeTrackIndex - 1 + total) % total;
    playTrackAt(playlist, prevIndex);
  };

  const seekMusic = (seconds: number) => { if (musicAudioRef.current) musicAudioRef.current.currentTime = seconds; setMusicElapsed(seconds); };
  const toggleShuffle = () => setMusicShuffle((s) => !s);
  const cycleRepeat = () => setMusicRepeat((r) => r === 'none' ? 'all' : r === 'all' ? 'one' : 'none');

  const createPlaylist = () => {
    const id = `pl-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    const name = `Playlist ${playlists.length + 1}`;
    const pl: Playlist = { id, name, tracks: [] };
    setPlaylists((current) => [...current, pl]);
    setMusicViewPlaylistId(id);
  };

  const deletePlaylist = (playlistId: string) => {
    if (activePlaylistId === playlistId) stopMusicFn();
    const pl = playlists.find((p) => p.id === playlistId);
    if (pl) pl.tracks.forEach((t) => void deleteAudioFile(`music:${t.id}`));
    setPlaylists((current) => current.filter((p) => p.id !== playlistId));
    setMusicViewPlaylistId((current) => current === playlistId ? null : current);
  };

  const renamePlaylist = (playlistId: string, name: string) => {
    setPlaylists((current) => current.map((p) => p.id === playlistId ? { ...p, name } : p));
  };

  const removeMusicTrack = (playlistId: string, trackId: string) => {
    if (activePlaylistId === playlistId) {
      const playlist = playlists.find((p) => p.id === playlistId);
      const idx = playlist?.tracks.findIndex((t) => t.id === trackId) ?? -1;
      if (idx === activeTrackIndex) stopMusicFn();
      else if (idx >= 0 && idx < activeTrackIndex) setActiveTrackIndex((i) => i - 1);
    }
    void deleteAudioFile(`music:${trackId}`);
    setPlaylists((current) => current.map((p) => p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p));
  };

  const openMusicFilePicker = (playlistId: string) => { addingToPlaylistRef.current = playlistId; musicFileInputRef.current?.click(); };

  const addMusicFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const playlistId = addingToPlaylistRef.current;
    if (!playlistId || !files.length) return;
    const supported = files.filter(isSupportedAudioFile);
    const skipped = files.length - supported.length;
    if (!supported.length) { setToast('Choose MP3 or WAV files to add to your playlist.'); event.target.value = ''; return; }
    const additions: MusicTrack[] = supported.map((file, i) => ({
      id: `track-${file.name}-${file.lastModified}-${Date.now()}-${i}`,
      name: file.name, size: file.size, url: URL.createObjectURL(file),
    }));
    setPlaylists((current) => current.map((p) => {
      if (p.id !== playlistId) return p;
      return { ...p, tracks: [...p.tracks, ...additions] };
    }));
    // Persist each music file in IndexedDB so it survives page reloads.
    supported.forEach((file, i) => void storeAudioFile(`music:${additions[i].id}`, file));
    setToast(`${supported.length} track${supported.length === 1 ? '' : 's'} added.${skipped ? ` ${skipped} unsupported skipped.` : ''}`);
    event.target.value = '';
  };

  const startMusicTimer = () => {
    const totalMs = timerPartsToMilliseconds(musicTimerParts);
    if (totalMs < 1000) { setToast('Set a timer of at least 1 second.'); return; }
    setMusicTimerEndAt(Date.now() + totalMs);
    setMusicTimerRemaining(totalMs);
    setToast('Music timer started.');
  };

  const cancelMusicTimer = () => { musicTimerExpiredRef.current = false; setMusicTimerEndAt(null); setMusicTimerRemaining(0); };

  const updateMusicTimerPart = (unit: keyof TimerParts, value: number) => {
    const maxes: Record<keyof TimerParts, number> = { hours: 23, minutes: 59, seconds: 59, milliseconds: 0 };
    setMusicTimerParts((current) => ({ ...current, [unit]: Math.min(maxes[unit], Math.max(0, value)) }));
  };

  // ── Schedule start ────────────────────────────────────────────────────────
  const startSchedule = () => {
    if (scheduleMode === 'off') return;
    if (scheduleMode === 'countdown') {
      const ms = scheduleParts.hours * HOUR_MS + scheduleParts.minutes * MINUTE_MS + scheduleParts.seconds * SECOND_MS;
      if (ms < 10000) { setToast('Set at least 10 seconds for the schedule.'); return; }
      setScheduleEndAt(Date.now() + ms);
      setScheduleRemaining(ms);
      setScheduleActive(true);
      setToast('Session scheduled — it will start automatically.');
    } else {
      if (!scheduleTime) { setToast('Choose a start time first.'); return; }
      setScheduleActive(true);
      setToast(`Session scheduled for ${scheduleTime}${scheduleRepeat ? ' · repeats daily' : ''}.`);
    }
  };
  const cancelSchedule = () => { setScheduleActive(false); setScheduleEndAt(null); setScheduleRemaining(0); };
  const updateSchedulePart = (unit: keyof TimerParts, value: number) => {
    const maxes: Record<keyof TimerParts, number> = { hours: 23, minutes: 59, seconds: 59, milliseconds: 999 };
    setScheduleParts((p) => ({ ...p, [unit]: Math.min(maxes[unit], Math.max(0, value)) }));
  };

  const updateGroupSetting = (groupId: string, key: 'minInterval' | 'maxInterval' | 'limit', value: number) => {
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, [key]: Math.max(1, value) } : group));
  };

  const updateGroupVolume = (groupId: string, vol: number) => {
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, volume: Math.min(100, Math.max(0, vol)) } : group));
  };

  const updateGroupInterval = (groupId: string, key: IntervalKey, unit: DurationUnit, value: number) => {
    const limits: Record<DurationUnit, number> = { hours: 999, minutes: 59, seconds: 59, milliseconds: 999 };
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      const parts = getDurationParts(group[key]);
      parts[unit] = Math.min(limits[unit], Math.max(0, Number.isFinite(value) ? value : 0));
      const total = parts.hours * HOUR_MS + parts.minutes * MINUTE_MS + parts.seconds * SECOND_MS + parts.milliseconds;
      return { ...group, [key]: Math.max(1, total) };
    }));
  };

  const updateGroupLimitMode = (groupId: string, enabled: boolean) => {
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, limitEnabled: enabled } : group));
  };

  const updateGroupLimitKind = (groupId: string, kind: LimitKind) => {
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, limitKind: kind } : group));
  };

  const resetPrefs = () => {
    setNightTextColor(DEFAULT_PREFS.nightTextColor);
    setNightShowDate(DEFAULT_PREFS.nightShowDate);
    setNightShowSeconds(DEFAULT_PREFS.nightShowSeconds);
    setNightHour12(DEFAULT_PREFS.nightHour12);
    setNightShowAmPm(DEFAULT_PREFS.nightShowAmPm);
    setNightClockFont(DEFAULT_PREFS.nightClockFont);
    setNightDimEnabled(DEFAULT_PREFS.nightDimEnabled);
    setNightDimDelaySecs(DEFAULT_PREFS.nightDimDelaySecs);
    setNightDimColor(DEFAULT_PREFS.nightDimColor);
    setNightDimShowClock(DEFAULT_PREFS.nightDimShowClock);
    setNightDimShowDate(DEFAULT_PREFS.nightDimShowDate);
    setNightDimShowSeconds(DEFAULT_PREFS.nightDimShowSeconds);
    setNightDimShowAmPm(DEFAULT_PREFS.nightDimShowAmPm);
    setNightDimBrightness(DEFAULT_PREFS.nightDimBrightness);
    setClockDisplayEnabled(DEFAULT_PREFS.clockDisplayEnabled);
    setClockDisplayDelaySecs(DEFAULT_PREFS.clockDisplayDelaySecs);
    setClockDisplayColor(DEFAULT_PREFS.clockDisplayColor);
    setClockDisplayFont(DEFAULT_PREFS.clockDisplayFont);
    setClockDisplayShowDate(DEFAULT_PREFS.clockDisplayShowDate);
    setClockDisplayShowSeconds(DEFAULT_PREFS.clockDisplayShowSeconds);
    setClockDisplayHour12(DEFAULT_PREFS.clockDisplayHour12);
    setClockDisplayShowAmPm(DEFAULT_PREFS.clockDisplayShowAmPm);
    setVolume(DEFAULT_PREFS.volume);
    setAlarmOnTimer(DEFAULT_PREFS.alarmOnTimer);
    setAlarmOnAlarm(DEFAULT_PREFS.alarmOnAlarm);
    setAlarmVolume(DEFAULT_PREFS.alarmVolume);
    setAlarmSnoozeResumeAudio(DEFAULT_PREFS.alarmSnoozeResumeAudio);
    setAlarmPulseOnTimer(DEFAULT_PREFS.alarmPulseOnTimer);
    setAlarmPulseOnAlarm(DEFAULT_PREFS.alarmPulseOnAlarm);
    // Note: the alarm sound file itself is kept on reset — only toggles are reset.
  };

  // Fullscreen tracking
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Close header menu on outside click
  useEffect(() => {
    if (!headerMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [headerMenuOpen]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
    setHeaderMenuOpen(false);
  };

  const stopAlarmTest = () => {
    if (alarmTestAudioRef.current) {
      alarmTestAudioRef.current.onended = null;
      alarmTestAudioRef.current.pause();
      alarmTestAudioRef.current = null;
    }
    if (alarmTestTimerRef.current !== null) {
      window.clearTimeout(alarmTestTimerRef.current);
      alarmTestTimerRef.current = null;
    }
    setAlarmTesting(false);
  };

  const startAlarmTest = () => {
    const url = alarmSoundUrlRef.current;
    if (!url) return;
    stopAlarmTest();
    setAlarmTesting(true);
    const playLoop = () => {
      if (!alarmTestAudioRef.current) return;
      const a = new Audio(url);
      a.volume = alarmVolumeRef.current / 100;
      a.onended = () => { if (alarmTestAudioRef.current) playLoop(); };
      alarmTestAudioRef.current = a;
      void a.play().catch(() => {});
    };
    const first = new Audio(url);
    first.volume = alarmVolumeRef.current / 100;
    alarmTestAudioRef.current = first;
    first.onended = () => { if (alarmTestAudioRef.current) playLoop(); };
    void first.play().catch(() => {});
    alarmTestTimerRef.current = window.setTimeout(stopAlarmTest, 60 * 1000);
  };

  // Stop the test preview whenever the user navigates away from settings.
  useEffect(() => {
    if (page !== 'settings') stopAlarmTest();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const pickAlarmSound = () => alarmFileInputRef.current?.click();

  const clearAlarmSound = () => {
    if (alarmSoundId) void deleteAudioFile(`alarm:${alarmSoundId}`);
    setAlarmSoundId(null);
    setAlarmSoundName('');
    if (alarmSoundUrl) URL.revokeObjectURL(alarmSoundUrl);
    setAlarmSoundUrl(null);
  };

  const handleAlarmFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    const id = `alarm-${Date.now()}`;
    if (alarmSoundId) void deleteAudioFile(`alarm:${alarmSoundId}`);
    if (alarmSoundUrl) URL.revokeObjectURL(alarmSoundUrl);
    await storeAudioFile(`alarm:${id}`, file);
    const url = URL.createObjectURL(file);
    setAlarmSoundId(id);
    setAlarmSoundName(file.name.replace(/\.[^.]+$/, ''));
    setAlarmSoundUrl(url);
  };

  const updateGroupTimeLimit = (groupId: string, unit: DurationUnit, value: number) => {
    const limits: Record<DurationUnit, number> = { hours: 999, minutes: 59, seconds: 59, milliseconds: 999 };
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      const parts = getDurationParts(group.timeLimit ?? DEFAULT_TIME_LIMIT);
      parts[unit] = Math.min(limits[unit], Math.max(0, Number.isFinite(value) ? value : 0));
      return { ...group, timeLimit: Math.max(1, timerPartsToMilliseconds(parts)) };
    }));
  };

  const updateGroupTimeLimitMax = (groupId: string, unit: DurationUnit, value: number) => {
    const limits: Record<DurationUnit, number> = { hours: 999, minutes: 59, seconds: 59, milliseconds: 999 };
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      const parts = getDurationParts(group.timeLimitMax ?? DEFAULT_TIME_LIMIT_MAX);
      parts[unit] = Math.min(limits[unit], Math.max(0, Number.isFinite(value) ? value : 0));
      return { ...group, timeLimitMax: Math.max(1, timerPartsToMilliseconds(parts)) };
    }));
  };

  const updateGroupTimeLimitMode = (groupId: string, mode: TimeLimitMode) => {
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, timeLimitMode: mode } : group));
  };

  // Called when a group is enabled mid-session. Starts audio immediately instead
  // of waiting for the next scheduled interval.
  const kickGroupImmediate = (groupId: string) => {
    const g = groupsRef.current.find((group) => group.id === groupId);
    if (!g || !g.enabled || sessionStatusRef.current !== 'running') return;

    if (g.kind === 'main') {
      // For main groups: pick a random main file and start it now.
      const mainFiles = g.files.filter((f) => f.role === 'main');
      if (!mainFiles.length) return;
      const file = mainFiles[Math.floor(Math.random() * mainFiles.length)];
      setMainTrackId(file.id);
    } else {
      // For effect groups: play immediately if the channel is free and the limit
      // hasn't been hit; otherwise fall back to normal scheduling.
      if (hasReachedPlayLimit(g, elapsedMsRef.current, resolvedTimeLimitsRef.current[g.id])) return;
      if (!g.files.some((f) => f.role === 'effect')) return;
      const busy = effectAudioRef.current && !effectAudioRef.current.ended && !effectAudioRef.current.paused;
      if (busy) {
        scheduleGroupRef.current(groupId);
      } else {
        playGroupEffect(g, () => scheduleGroupRef.current(groupId));
      }
    }
  };

  const toggleGroup = (groupId: string) => {
    setGroups((current) => {
      const group = current.find((g) => g.id === groupId);
      const willBeEnabled = group ? !group.enabled : false;

      if (!willBeEnabled) {
        // Disabling: cancel any pending timer for this group right now so it
        // doesn't fire an effect after the user turns it off.
        if (groupId in groupTimerRefs.current) {
          window.clearTimeout(groupTimerRefs.current[groupId]);
          delete groupTimerRefs.current[groupId];
        }
        // If this was the actively playing main group, stop the main audio now.
        if (group?.kind === 'main' && group.files.some((f) => f.id === mainTrackId)) {
          if (mainAudioRef.current) { mainAudioRef.current.pause(); mainAudioRef.current = null; }
          setMainTrackId(null);
        }
        // If this effect group is currently playing, cut it immediately.
        if (group?.kind === 'effect' && group.id === currentEffectGroupIdRef.current) {
          if (effectAudioRef.current) {
            effectAudioRef.current.onended = null;
            effectAudioRef.current.onerror = null;
            effectAudioRef.current.pause();
            effectAudioRef.current = null;
          }
          currentEffectGroupIdRef.current = null;
        }
      } else if (sessionStatusRef.current === 'running') {
        // Enabling mid-session: kick off scheduling after React re-renders and
        // groupsRef.current reflects the new enabled state (~one frame is enough).
        window.setTimeout(() => kickGroupImmediate(groupId), 80);
      }

      return current.map((g) => g.id === groupId ? { ...g, enabled: !g.enabled } : g);
    });
  };

  const triggerEffectNow = () => triggerEffect(() => { /* manual trigger; no reschedule */ });

  // Keep startSessionRef fresh every render so schedule effects always call the latest version.
  startSessionRef.current = startSession;

  // ── Music derived (used by sidebar mini-player and home music strip) ───────
  const musicActivePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;
  const musicActiveTrack = musicActivePlaylist?.tracks[activeTrackIndex] ?? null;
  const onMusicPlayPause = musicStatus === 'playing' ? pauseMusic : resumeMusic;

  return (
    <div className="night-app">
      <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {mobileNavOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} data-testid="button-close-navigation" />}
        <aside className={`sidebar ${mobileNavOpen ? 'open' : ''}`}>
          <div className="brand">
            <div className="brand-mark"><Moon size={20} strokeWidth={2.2} /></div>
            <div className="brand-copy"><div className="brand-name">Night Sound Machine</div><div className="brand-sub">your quiet room</div></div>
            <button className="sidebar-toggle" onClick={() => setSidebarCollapsed((c) => !c)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} data-testid="button-toggle-sidebar">
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
          {sidebarMusicVisible && (
            <div className="sidebar-music">
              <div className="sidebar-music-track">
                <ListMusic size={11} />
                <div className="sidebar-music-info">
                  <span className="sidebar-music-name">{musicActiveTrack ? musicActiveTrack.name.replace(/\.[^.]+$/, '') : 'Music player'}</span>
                  {musicActivePlaylist && <span className="sidebar-music-playlist">{musicActivePlaylist.name}</span>}
                </div>
              </div>
              <div className="sidebar-music-controls">
                <button className="icon-button" onClick={prevTrack} disabled={musicStatus === 'idle'} aria-label="Previous track" title="Previous"><SkipBack size={13} /></button>
                <button className="icon-button sidebar-music-playpause" onClick={onMusicPlayPause} disabled={!musicActiveTrack} aria-label={musicStatus === 'playing' ? 'Pause music' : 'Play music'}>
                  {musicStatus === 'playing' ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                </button>
                <button className="icon-button" onClick={nextTrack} disabled={musicStatus === 'idle'} aria-label="Next track" title="Next"><SkipForward size={13} /></button>
              </div>
            </div>
          )}
          <div className="nav-label">Your Space</div>
          <nav className="side-nav" aria-label="Main navigation">
            <button className={`nav-item ${page === 'home' ? 'active' : ''}`} onClick={() => { setPage('home'); setMobileNavOpen(false); }} title="Home" data-testid="nav-home"><HomeIcon size={16} /><span className="nav-item-label">Home</span></button>
            <button className={`nav-item ${page === 'music' ? 'active' : ''}`} onClick={() => { setPage('music'); setMobileNavOpen(false); }} title="Music player" data-testid="nav-music"><ListMusic size={16} /><span className="nav-item-label">Music player</span></button>
            <button className={`nav-item ${page === 'library' ? 'active' : ''}`} onClick={() => { setPage('library'); setMobileNavOpen(false); }} title="Sound library" data-testid="nav-library"><Library size={16} /><span className="nav-item-label">Sound library</span></button>
            <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => { setPage('settings'); setMobileNavOpen(false); }} title="Preferences" data-testid="nav-settings"><Settings size={16} /><span className="nav-item-label">Preferences</span></button>
          </nav>
          <div className="groups-head"><div className="group-label">Your groups</div><button className="icon-button" onClick={() => openNewGroup()} aria-label="Create a group" data-testid="button-create-group"><Plus size={16} /></button></div>
          <div className="group-list">
            {groups.map((group) => {
              const Icon = iconForGroup(group.name, group.icon);
              return <button key={group.id} className={`group-item ${selectedGroup === group.id && page === 'library' ? 'active' : ''}`} onClick={() => chooseGroup(group.id)} title={group.name} data-testid={`nav-group-${group.id}`}>
                <span className="group-dot" style={{ background: group.color }} /><Icon size={15} /><span>{group.name}</span><span className="group-count">{group.files.length}</span>
              </button>;
            })}
          </div>
          <div className="side-footer"><div className="local-note"><LockKeyhole size={13} /><span>Everything stays in the app. No accounts, no cloud.</span></div></div>
        </aside>

        <main className="main-content">
          <div className="content-wrap">
            <header className="topbar">
              <div className="crumb"><button className="icon-button menu-button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={20} /></button><span>Night Sound Machine</span><ChevronRight size={13} /><strong>{page === 'home' ? 'Home' : page === 'music' ? 'Music player' : page === 'library' ? 'Sound library' : 'Preferences'}</strong></div>
              <div className="top-actions">
                <div className="status-pill"><span className="status-dot" /> Local only</div>
                <div className="header-menu-wrap" ref={headerMenuRef}>
                  <button className="icon-button" aria-label="Menu" onClick={() => setHeaderMenuOpen((o) => !o)} aria-expanded={headerMenuOpen} data-testid="button-header-menu"><Menu size={17} /></button>
                  {headerMenuOpen && (
                    <div className="header-dropdown" role="menu">
                      <button className="header-dropdown-item" role="menuitem" onClick={toggleFullscreen} data-testid="button-toggle-fullscreen">
                        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        {isFullscreen ? 'Exit full screen' : 'Full screen'}
                      </button>
                      <button className="header-dropdown-item" role="menuitem" onClick={() => { setHelpOpen(true); setHeaderMenuOpen(false); }} data-testid="button-open-help">
                        <CircleHelp size={14} /> Help
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>
            {updateCheck.status === 'update-available' && updateCheck.latestVersion !== dismissedUpdateVersion && (
              <div className="update-banner" role="status" aria-live="polite">
                <span className="update-banner-text">
                  Version {updateCheck.latestVersion} is available
                </span>
                <a
                  className="update-banner-link"
                  href={updateCheck.releasesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Download version ${updateCheck.latestVersion} from GitHub`}
                >
                  Download <ExternalLink size={11} />
                </a>
                <button
                  className="update-banner-dismiss"
                  aria-label="Dismiss update notification"
                  onClick={() => {
                    const v = updateCheck.latestVersion;
                    setDismissedUpdateVersion(v);
                    try { localStorage.setItem(DISMISSED_UPDATE_KEY, v); } catch { /* private browsing */ }
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            )}
            {page === 'home' && <HomePage
              groups={groups} mainGroups={mainGroups} effectGroups={effectGroups}
              activeTrack={activeTrack} mainTrackId={mainTrackId} elapsed={elapsed}
              sessionStatus={sessionStatus} volume={volume} setVolume={setVolume}
              startSession={startSession} stopSession={stopSession} pauseSession={pauseSession}
              endMode={endMode} setEndMode={setEndMode} timerParts={timerParts} updateTimerPart={updateTimerPart}
              alarmTime={alarmTime} setAlarmTime={setAlarmTime} endRemaining={endRemaining}
              nightTextColor={nightTextColor} setNightTextColor={setNightTextColor}
              toggleGroup={toggleGroup} openFilePicker={openFilePicker} openNewGroup={openNewGroup} chooseGroup={chooseGroup}
              triggerEffect={triggerEffectNow} lastEffect={lastEffect}
              updateGroupSetting={updateGroupSetting} updateGroupVolume={updateGroupVolume}
              updateGroupLimitMode={updateGroupLimitMode} updateGroupLimitKind={updateGroupLimitKind}
              updateGroupTimeLimit={updateGroupTimeLimit} updateGroupTimeLimitMax={updateGroupTimeLimitMax}
              updateGroupTimeLimitMode={updateGroupTimeLimitMode} updateGroupInterval={updateGroupInterval}
              updateMainSessionSetting={updateMainSessionSetting} updateMainDuration={updateMainDuration}
              musicStatus={musicStatus} musicActiveTrack={musicActiveTrack} musicActivePlaylist={musicActivePlaylist}
              musicVolume={musicVolume} setMusicVolume={setMusicVolume}
              onMusicPlayPause={onMusicPlayPause} onMusicPrev={prevTrack} onMusicNext={nextTrack}
              musicTimerEndAt={musicTimerEndAt} musicTimerRemaining={musicTimerRemaining}
              showMusicStrip={sidebarMusicVisible}
              scheduleMode={scheduleMode} setScheduleMode={setScheduleMode}
              scheduleParts={scheduleParts} updateSchedulePart={updateSchedulePart}
              scheduleTime={scheduleTime} setScheduleTime={setScheduleTime}
              scheduleRepeat={scheduleRepeat} setScheduleRepeat={setScheduleRepeat}
              scheduleActive={scheduleActive} scheduleEndAt={scheduleEndAt} scheduleRemaining={scheduleRemaining}
              startSchedule={startSchedule} cancelSchedule={cancelSchedule}
            />}
            {page === 'library' && <LibraryPage
              groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup}
              openNewGroup={openNewGroup} openEditGroup={openEditGroup} deleteGroup={deleteGroup}
              openFilePicker={openFilePicker} removeFile={removeFile} setFileRole={setFileRole}
              updateGroupSetting={updateGroupSetting} updateGroupVolume={updateGroupVolume}
              updateGroupLimitMode={updateGroupLimitMode} updateGroupLimitKind={updateGroupLimitKind}
              updateGroupTimeLimit={updateGroupTimeLimit} updateGroupTimeLimitMax={updateGroupTimeLimitMax}
              updateGroupTimeLimitMode={updateGroupTimeLimitMode} updateGroupInterval={updateGroupInterval}
              toggleGroup={toggleGroup}
            />}
            {page === 'music' && <MusicPage
              playlists={playlists} musicViewPlaylistId={musicViewPlaylistId} setMusicViewPlaylistId={setMusicViewPlaylistId}
              activePlaylistId={activePlaylistId} activeTrackIndex={activeTrackIndex}
              musicStatus={musicStatus} musicVolume={musicVolume} setMusicVolume={setMusicVolume}
              musicElapsed={musicElapsed} musicDuration={musicDuration}
              musicShuffle={musicShuffle} musicRepeat={musicRepeat}
              musicTimerParts={musicTimerParts} musicTimerEndAt={musicTimerEndAt} musicTimerRemaining={musicTimerRemaining}
              createPlaylist={createPlaylist} deletePlaylist={deletePlaylist} renamePlaylist={renamePlaylist}
              openMusicFilePicker={openMusicFilePicker} removeTrack={removeMusicTrack}
              playTrack={playTrack} pauseMusic={pauseMusic} resumeMusic={resumeMusic}
              nextTrack={nextTrack} prevTrack={prevTrack} seekMusic={seekMusic}
              toggleShuffle={toggleShuffle} cycleRepeat={cycleRepeat}
              startMusicTimer={startMusicTimer} cancelMusicTimer={cancelMusicTimer} updateMusicTimerPart={updateMusicTimerPart}
            />}
            {page === 'settings' && <SettingsPage volume={volume} setVolume={setVolume} fileCount={allFileCount} groupCount={groups.length} nightShowDate={nightShowDate} setNightShowDate={setNightShowDate} nightShowSeconds={nightShowSeconds} setNightShowSeconds={setNightShowSeconds} nightHour12={nightHour12} setNightHour12={setNightHour12} nightShowAmPm={nightShowAmPm} setNightShowAmPm={setNightShowAmPm} nightClockFont={nightClockFont} setNightClockFont={setNightClockFont} nightDimEnabled={nightDimEnabled} setNightDimEnabled={setNightDimEnabled} nightDimDelaySecs={nightDimDelaySecs} setNightDimDelaySecs={setNightDimDelaySecs} nightDimColor={nightDimColor} setNightDimColor={setNightDimColor} nightDimShowClock={nightDimShowClock} setNightDimShowClock={setNightDimShowClock} nightDimShowDate={nightDimShowDate} setNightDimShowDate={setNightDimShowDate} nightDimShowSeconds={nightDimShowSeconds} setNightDimShowSeconds={setNightDimShowSeconds} nightDimShowAmPm={nightDimShowAmPm} setNightDimShowAmPm={setNightDimShowAmPm} nightDimBrightness={nightDimBrightness} setNightDimBrightness={setNightDimBrightness} clockDisplayEnabled={clockDisplayEnabled} setClockDisplayEnabled={setClockDisplayEnabled} clockDisplayDelaySecs={clockDisplayDelaySecs} setClockDisplayDelaySecs={setClockDisplayDelaySecs} clockDisplayColor={clockDisplayColor} setClockDisplayColor={setClockDisplayColor} clockDisplayFont={clockDisplayFont} setClockDisplayFont={setClockDisplayFont} clockDisplayShowDate={clockDisplayShowDate} setClockDisplayShowDate={setClockDisplayShowDate} clockDisplayShowSeconds={clockDisplayShowSeconds} setClockDisplayShowSeconds={setClockDisplayShowSeconds} clockDisplayHour12={clockDisplayHour12} setClockDisplayHour12={setClockDisplayHour12} clockDisplayShowAmPm={clockDisplayShowAmPm} setClockDisplayShowAmPm={setClockDisplayShowAmPm} onResetPrefs={resetPrefs} alarmSoundName={alarmSoundName} alarmOnTimer={alarmOnTimer} setAlarmOnTimer={setAlarmOnTimer} alarmOnAlarm={alarmOnAlarm} setAlarmOnAlarm={setAlarmOnAlarm} alarmPulseOnTimer={alarmPulseOnTimer} setAlarmPulseOnTimer={setAlarmPulseOnTimer} alarmPulseOnAlarm={alarmPulseOnAlarm} setAlarmPulseOnAlarm={setAlarmPulseOnAlarm} alarmSnoozeMins={alarmSnoozeMins} setAlarmSnoozeMins={setAlarmSnoozeMins} alarmVolume={alarmVolume} setAlarmVolume={setAlarmVolume} alarmSnoozeResumeAudio={alarmSnoozeResumeAudio} setAlarmSnoozeResumeAudio={setAlarmSnoozeResumeAudio} alarmTesting={alarmTesting} onTestAlarm={startAlarmTest} onStopTestAlarm={stopAlarmTest} onPickAlarmSound={pickAlarmSound} onClearAlarmSound={clearAlarmSound} />}
          </div>
        </main>
      </div>

      <NightModeOverlay
        active={sessionStatus === 'running' || sessionStatus === 'alarming'}
        isAlarming={sessionStatus === 'alarming'}
        alarmPulseActive={alarmPulseActive}
        endMode={endMode} endRemaining={endRemaining} alarmTime={alarmTime}
        textColor={nightTextColor} setTextColor={setNightTextColor}
        now={clockNow} stopSession={stopSession}
        onSnooze={snoozeAlarm} snoozeMins={alarmSnoozeMins}
        showDate={nightShowDate} showSeconds={nightShowSeconds} hour12={nightHour12} showAmPm={nightShowAmPm}
        clockFont={nightClockFont} setClockFont={setNightClockFont}
        groups={groups} updateGroupVolume={updateGroupVolume} toggleGroup={toggleGroup}
        dimEnabled={nightDimEnabled} dimDelaySecs={nightDimDelaySecs} dimColor={nightDimColor}
        dimShowClock={nightDimShowClock} dimShowDate={nightDimShowDate}
        dimShowSeconds={nightDimShowSeconds} dimShowAmPm={nightDimShowAmPm} dimBrightness={nightDimBrightness}
      />

      <ClockDisplayOverlay
        active={clockDisplayActive}
        onDismiss={() => setClockDisplayActive(false)}
        now={clockNow}
        color={clockDisplayColor}
        clockFont={clockDisplayFont}
        showDate={clockDisplayShowDate}
        showSeconds={clockDisplayShowSeconds}
        hour12={clockDisplayHour12}
        showAmPm={clockDisplayShowAmPm}
        musicStatus={musicStatus}
        musicActiveTrack={musicActiveTrack}
        musicActivePlaylist={musicActivePlaylist}
        onMusicPlayPause={onMusicPlayPause}
        onMusicPrev={prevTrack}
        onMusicNext={nextTrack}
      />

      <input ref={fileInputRef} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav,audio/wave" multiple hidden onChange={addFiles} data-testid="input-audio-files" />
      <input ref={musicFileInputRef} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav,audio/wave" multiple hidden onChange={addMusicFiles} data-testid="input-music-files" />
      <input ref={alarmFileInputRef} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav,audio/wave" hidden onChange={handleAlarmFileChange} data-testid="input-alarm-sound" />
      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="group-dialog-title">
          <div className="modal-head"><div><h2 id="group-dialog-title">{modal === 'new' ? 'New sound group' : 'Edit group'}</h2><p>Give this part of the night a name and choose how it sounds.</p></div><button className="icon-button" onClick={() => setModal(null)} aria-label="Close dialog" data-testid="button-close-dialog"><X size={17} /></button></div>
          <div className="form-field"><label htmlFor="group-name">Group name</label><input id="group-name" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="e.g. Cabin wind" autoFocus data-testid="input-group-name" /></div>
          <div className="form-field"><label htmlFor="group-kind">Sound behavior</label><select id="group-kind" value={groupKind} onChange={(event) => setGroupKind(event.target.value as GroupKind)} data-testid="select-group-kind"><option value="main">Main sound · loops continuously</option><option value="effect">Effect group · arrives occasionally</option></select></div>
          <div className="form-field"><label>Color marker</label><div className="color-options">{COLORS.map((color) => <button key={color} className={`color-option ${groupColor === color ? 'selected' : ''}`} style={{ background: color }} onClick={() => setGroupColor(color)} aria-label={`Choose ${color} marker`} data-testid={`button-color-${color.replace('#', '')}`}><span>{groupColor === color ? <Check size={13} color="#1b1823" /> : null}</span></button>)}</div></div>
          <div className="form-field icon-picker-field">
            <div className="icon-picker-row">
              <label className="icon-picker-label">
                Icon
                {groupIcon && GROUP_ICON_MAP[groupIcon] ? (() => { const Sel = GROUP_ICON_MAP[groupIcon]!; return <span className="icon-selected-preview" style={{ color: groupColor, borderColor: groupColor }}><Sel size={13} /></span>; })() : <span className="form-label-hint"> optional</span>}
              </label>
              <button type="button" className="icon-picker-toggle" onClick={() => setIconPickerOpen((o) => !o)} aria-expanded={iconPickerOpen}>
                {iconPickerOpen ? 'Hide' : groupIcon ? 'Change' : 'Choose'}
                <ChevronDown size={11} style={{ transform: iconPickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </button>
            </div>
            {iconPickerOpen && <div className="icon-options">{GROUP_ICONS.map(({ key, Component }) => <button key={key} className={`icon-option ${groupIcon === key ? 'selected' : ''}`} style={groupIcon === key ? { color: groupColor, borderColor: groupColor } : {}} onClick={() => setGroupIcon(groupIcon === key ? null : key)} aria-label={`Choose ${key} icon`} aria-pressed={groupIcon === key} data-testid={`button-icon-${key}`}><Component size={15} /></button>)}</div>}
          </div>
          <div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)} data-testid="button-cancel-group">Cancel</button><button className="primary-button" onClick={saveGroup} disabled={!groupName.trim()} data-testid="button-save-group">{modal === 'new' ? 'Create group' : 'Save changes'}</button></div>
        </div>
      </div>}
      {toast && <div className="toast" role="status" data-testid="status-toast">{toast}</div>}

      {helpOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setHelpOpen(false); }}>
          <div className="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-dialog-title">
            <div className="modal-head">
              <div><h2 id="help-dialog-title">How it works</h2><p>Night Sound Machine at a glance.</p></div>
              <button className="icon-button" onClick={() => setHelpOpen(false)} aria-label="Close help" data-testid="button-close-help"><X size={17} /></button>
            </div>
            <div className="help-body">
              <div className="help-section">
                <div className="help-step"><span className="help-num">1</span><div><strong>Build your library</strong><p>Go to Sound Library, create a group, and upload audio files from your device.</p></div></div>
                <div className="help-step"><span className="help-num">2</span><div><strong>Choose a main sound</strong><p>On the Home screen, pick a main group — this plays continuously in the background.</p></div></div>
                <div className="help-step"><span className="help-num">3</span><div><strong>Enable effects</strong><p>Turn on effect groups to add sounds that arrive naturally throughout the night.</p></div></div>
                <div className="help-step"><span className="help-num">4</span><div><strong>Start the session</strong><p>Press play. The night display takes over with the clock and a quiet set of controls.</p></div></div>
              </div>
              <div className="help-divider" />
              <div className="help-section">
                <p className="help-label">During a session</p>
                <ul className="help-list">
                  <li>Tap the <strong>slider icon</strong> on the left edge to adjust volumes and toggle groups.</li>
                  <li>Move the mouse, click, or tap to <strong>wake the display</strong> if it has dimmed.</li>
                  <li>Set timers, alarms, and dim settings in <strong>Preferences</strong>.</li>
                </ul>
              </div>
              <div className="help-divider" />
              <p className="help-footer"><Moon size={12} /> Everything stays in the app — no accounts, no servers, no cloud.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HomePage
// ─────────────────────────────────────────────────────────────────────────────

type HomePageProps = {
  groups: SoundGroup[];
  mainGroups: SoundGroup[];
  effectGroups: SoundGroup[];
  activeTrack?: SoundFile;
  mainTrackId: string | null;
  elapsed: number;
  sessionStatus: SessionStatus;
  volume: number;
  setVolume: (value: number) => void;
  startSession: () => void;
  stopSession: () => void;
  pauseSession: () => void;
  toggleGroup: (id: string) => void;
  openFilePicker: (groupId?: string) => void;
  openNewGroup: (kind?: GroupKind) => void;
  chooseGroup: (id: string) => void;
  triggerEffect: () => void;
  lastEffect: string;
  updateGroupSetting: (groupId: string, key: 'minInterval' | 'maxInterval' | 'limit', value: number) => void;
  updateGroupVolume: (groupId: string, volume: number) => void;
  updateGroupLimitMode: (groupId: string, enabled: boolean) => void;
  updateGroupLimitKind: (groupId: string, kind: LimitKind) => void;
  updateGroupTimeLimit: (groupId: string, unit: DurationUnit, value: number) => void;
  updateGroupTimeLimitMax: (groupId: string, unit: DurationUnit, value: number) => void;
  updateGroupTimeLimitMode: (groupId: string, mode: TimeLimitMode) => void;
  updateGroupInterval: (groupId: string, key: IntervalKey, unit: DurationUnit, value: number) => void;
  endMode: EndMode;
  setEndMode: (mode: EndMode) => void;
  timerParts: TimerParts;
  updateTimerPart: (unit: keyof TimerParts, value: number) => void;
  alarmTime: string;
  setAlarmTime: (value: string) => void;
  endRemaining: number;
  nightTextColor: string;
  setNightTextColor: (value: string) => void;
  updateMainSessionSetting: (groupId: string, key: 'sessionChanceEnabled' | 'sessionChance' | 'autoStopEnabled' | 'minDuration' | 'maxDuration', value: boolean | number) => void;
  updateMainDuration: (groupId: string, key: 'minDuration' | 'maxDuration', unit: DurationUnit, value: number) => void;
  // Music mini-strip
  musicStatus: MusicStatus;
  musicActiveTrack: MusicTrack | null;
  musicActivePlaylist: Playlist | null;
  musicVolume: number;
  setMusicVolume: (v: number) => void;
  onMusicPlayPause: () => void;
  onMusicPrev: () => void;
  onMusicNext: () => void;
  musicTimerEndAt: number | null;
  musicTimerRemaining: number;
  showMusicStrip: boolean;
  // Schedule start
  scheduleMode: ScheduleMode;
  setScheduleMode: (m: ScheduleMode) => void;
  scheduleParts: TimerParts;
  updateSchedulePart: (unit: keyof TimerParts, value: number) => void;
  scheduleTime: string;
  setScheduleTime: (t: string) => void;
  scheduleRepeat: boolean;
  setScheduleRepeat: (r: boolean) => void;
  scheduleActive: boolean;
  scheduleEndAt: number | null;
  scheduleRemaining: number;
  startSchedule: () => void;
  cancelSchedule: () => void;
};

function HomePage(props: HomePageProps) {
  const { groups, mainGroups, effectGroups, activeTrack, mainTrackId, elapsed, sessionStatus, volume, setVolume, startSession, stopSession, pauseSession, toggleGroup, openFilePicker, openNewGroup, chooseGroup, triggerEffect, lastEffect, updateGroupSetting, updateGroupVolume, updateGroupLimitMode, updateGroupLimitKind, updateGroupTimeLimit, updateGroupTimeLimitMax, updateGroupTimeLimitMode, updateGroupInterval, updateMainSessionSetting, updateMainDuration, endMode, setEndMode, timerParts, updateTimerPart, alarmTime, setAlarmTime, endRemaining, nightTextColor, setNightTextColor, musicStatus, musicActiveTrack, musicActivePlaylist, musicVolume, setMusicVolume, onMusicPlayPause, onMusicPrev, onMusicNext, musicTimerEndAt, musicTimerRemaining, showMusicStrip, scheduleMode, setScheduleMode, scheduleParts, updateSchedulePart, scheduleTime, setScheduleTime, scheduleRepeat, setScheduleRepeat, scheduleActive, scheduleEndAt, scheduleRemaining, startSchedule, cancelSchedule } = props;
  const enabledEffects = effectGroups.filter((group) => group.enabled).length;
  const enabledEffectGroups = effectGroups.filter((group) => group.enabled);
  const effectWindow = enabledEffectGroups.length
    ? `${formatDuration(Math.min(...enabledEffectGroups.map((g) => g.minInterval)))}–${formatDuration(Math.max(...enabledEffectGroups.map((g) => g.maxInterval)))}`
    : 'No effect groups enabled';
  const [mainSoundsOpen, setMainSoundsOpen] = useState(true);
  const [effectsOpen, setEffectsOpen] = useState(true);
  const [recipeOpen, setRecipeOpen] = useState(true);
  return <div>
    <section className="page-intro"><div className="eyebrow">A softer way to end the day</div><h1>Make room for <em>quiet.</em></h1><p>Your sounds, arranged with a little intention. Set the room, press play, and let the edges of the day dissolve.</p></section>
    <div className="dashboard-grid">
      <section className="session-card" aria-label="Current night session">
        <div className="session-top"><div className={`session-status ${sessionStatus === 'paused' || sessionStatus === 'idle' ? 'paused' : ''}`}>{sessionStatus === 'running' ? 'Listening now' : sessionStatus === 'paused' ? 'Session paused' : 'Ready when you are'}</div><span className="tag">{formatTime(elapsed)}</span></div>
        <h2>{activeTrack ? activeTrack.name.replace(/\.[^.]+$/, '') : 'The room is waiting'}</h2>
        <div className="session-sub">{activeTrack?.demo ? 'A preview from your night library' : activeTrack ? 'Playing from your library' : 'Press play to begin — sounds are optional'}</div>
        <div className={`wave ${sessionStatus !== 'running' ? 'paused' : ''}`} aria-label={sessionStatus === 'running' ? 'Sound is playing' : 'Sound is paused'} data-testid="status-waveform">{Array.from({ length: 15 }, (_, index) => <i key={index} />)}</div>
        <div className="session-controls">
          {sessionStatus === 'running' ? <button className="round-button" onClick={pauseSession} aria-label="Pause session" data-testid="button-pause-session"><Pause size={18} fill="currentColor" /></button> : <button className="round-button" onClick={startSession} aria-label={sessionStatus === 'paused' ? 'Resume session' : 'Start session'} data-testid="button-start-session"><Play size={18} fill="currentColor" /></button>}
          <button className="round-button stop" onClick={stopSession} aria-label="Stop session" data-testid="button-stop-session"><Square size={15} fill="currentColor" /></button>
          <div className="volume-wrap"><Volume2 size={15} /><input type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Session volume" data-testid="input-session-volume" /><span>{volume}%</span></div>
        </div>
        {showMusicStrip && (
          <div className="home-music-strip">
            <div className="home-music-info">
              <ListMusic size={12} color="hsl(var(--primary))" />
              <div className="home-music-text">
                <span className="home-music-name">{musicActiveTrack ? musicActiveTrack.name.replace(/\.[^.]+$/, '') : 'Music player'}</span>
                {musicActivePlaylist && <span className="home-music-playlist">{musicActivePlaylist.name}</span>}
              </div>
            </div>
            <div className="home-music-right">
              <button className="icon-button home-music-btn" onClick={onMusicPrev} disabled={musicStatus === 'idle'} aria-label="Previous track" title="Previous"><SkipBack size={13} /></button>
              <button className="icon-button home-music-btn" onClick={onMusicPlayPause} disabled={!musicActiveTrack} aria-label={musicStatus === 'playing' ? 'Pause music' : 'Play music'}>
                {musicStatus === 'playing' ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
              </button>
              <button className="icon-button home-music-btn" onClick={onMusicNext} disabled={musicStatus === 'idle'} aria-label="Next track" title="Next"><SkipForward size={13} /></button>
              {musicTimerEndAt && (
                <span className="home-music-timer"><Timer size={11} />{formatAudioTime(musicTimerRemaining / 1000)}</span>
              )}
              <input type="range" className="home-music-vol" min="0" max="100" value={musicVolume} onChange={(e) => setMusicVolume(Number(e.target.value))} aria-label="Music volume" />
              <span className="home-music-vol-label">{musicVolume}%</span>
            </div>
          </div>
        )}
        <SessionSchedulePanel scheduleMode={scheduleMode} setScheduleMode={setScheduleMode} scheduleParts={scheduleParts} updateSchedulePart={updateSchedulePart} scheduleTime={scheduleTime} setScheduleTime={setScheduleTime} scheduleRepeat={scheduleRepeat} setScheduleRepeat={setScheduleRepeat} scheduleActive={scheduleActive} scheduleEndAt={scheduleEndAt} scheduleRemaining={scheduleRemaining} startSchedule={startSchedule} cancelSchedule={cancelSchedule} sessionStatus={sessionStatus} />
        <SessionEndPanel sessionStatus={sessionStatus} endMode={endMode} setEndMode={setEndMode} timerParts={timerParts} updateTimerPart={updateTimerPart} alarmTime={alarmTime} setAlarmTime={setAlarmTime} endRemaining={endRemaining} nightTextColor={nightTextColor} setNightTextColor={setNightTextColor} />
      </section>
      <aside className="recipe-card">
        <button className="card-heading recipe-heading-toggle" onClick={() => setRecipeOpen((o) => !o)} aria-expanded={recipeOpen} aria-label={recipeOpen ? 'Collapse tonight\'s sounds' : 'Expand tonight\'s sounds'}>
          <div><div className="eyebrow">Active now</div><h3>Tonight&rsquo;s sounds</h3></div>
          <div className="recipe-heading-right"><Sparkles size={17} color="hsl(var(--primary))" /><ChevronDown size={15} className={`collapse-chevron${recipeOpen ? ' rotated' : ''}`} /></div>
        </button>
        {recipeOpen && <>
          <div className="recipe-list">
            {mainGroups.filter((g) => g.enabled).slice(0, 3).map((group) => <div key={group.id} className="recipe-row"><div className="recipe-icon" style={{ color: group.color }}><Headphones size={15} /></div><div className="recipe-copy"><strong>{group.name}</strong><span>{group.files.length} looping {group.files.length === 1 ? 'sound' : 'sounds'}</span></div><Check size={14} color="hsl(var(--primary))" /></div>)}
            {!mainGroups.some((g) => g.enabled) && <div className="recipe-row recipe-row-empty"><div className="recipe-copy"><span>No main sounds active yet</span></div></div>}
            <div className="recipe-line" />
            <div className="recipe-row"><div className="recipe-icon" style={{ color: 'hsl(var(--accent))' }}><Radio size={15} /></div><div className="recipe-copy"><strong>{enabledEffects} effect {enabledEffects === 1 ? 'group' : 'groups'}</strong><span>{effectWindow}</span></div><button className="quiet-button" onClick={triggerEffect} aria-label="Play an effect now" data-testid="button-trigger-effect"><MoreHorizontal size={17} /></button></div>
          </div>
          <div className="recipe-foot"><SlidersHorizontal size={14} /><span>{lastEffect === 'Waiting for a little weather' ? 'Effects will choose their own moment.' : `Last arrival \u00b7 ${lastEffect}`}</span></div>
        </>}
      </aside>
    </div>
    <section>
      <div className="section-head">
        <div className="section-title">
          <div className="eyebrow">The steady layer</div>
          <h2>Main sounds</h2>
          {mainSoundsOpen && <p>These hold the room open and loop until you say stop.</p>}
        </div>
        <div className="section-head-right">
          {!mainSoundsOpen && (
            <div className="sound-chips">
              {mainGroups.filter((g) => g.enabled).map((g) => (
                <span key={g.id} className="sound-chip"><span className="sound-chip-dot" style={{ background: g.color }} />{g.name}</span>
              ))}
            </div>
          )}
          <button className="quiet-button" onClick={() => openNewGroup('main')} data-testid="button-add-main-sound">Add</button>
          <button className="icon-button section-toggle" onClick={() => setMainSoundsOpen((o) => !o)} aria-label={mainSoundsOpen ? 'Collapse main sounds' : 'Expand main sounds'} aria-expanded={mainSoundsOpen}><ChevronDown size={16} className={`collapse-chevron${mainSoundsOpen ? ' rotated' : ''}`} /></button>
        </div>
      </div>
      {mainSoundsOpen && (
        <div className="group-cards">
          {mainGroups.map((group) => <SoundGroupCard key={group.id} group={group} selected={mainTrackId === group.files.find((file) => file.role === 'main')?.id} toggleGroup={toggleGroup} chooseGroup={chooseGroup} updateGroupVolume={updateGroupVolume} updateMainSessionSetting={updateMainSessionSetting} updateMainDuration={updateMainDuration} />)}
          <button className="sound-card add-card" onClick={() => openNewGroup('main')} data-testid="button-add-main-card"><Plus size={18} /><span>Add a new sound group</span></button>
        </div>
      )}
    </section>
    <section>
      <div className="section-head">
        <div className="section-title">
          <div className="eyebrow">The little surprises</div>
          <h2>Effects</h2>
          {effectsOpen && <p>Randomized moments, bounded by your settings.</p>}
        </div>
        <div className="section-head-right">
          {!effectsOpen && enabledEffectGroups.length > 0 && (
            <div className="sound-chips">
              {enabledEffectGroups.map((g) => (
                <span key={g.id} className="sound-chip"><span className="sound-chip-dot" style={{ background: g.color ?? 'hsl(var(--accent))' }} />{g.name}</span>
              ))}
            </div>
          )}
          <button className="quiet-button" onClick={() => openNewGroup('effect')} data-testid="button-add-effect-sound">Add</button>
          <button className="icon-button section-toggle" onClick={() => setEffectsOpen((o) => !o)} aria-label={effectsOpen ? 'Collapse effects' : 'Expand effects'} aria-expanded={effectsOpen}><ChevronDown size={16} className={`collapse-chevron${effectsOpen ? ' rotated' : ''}`} /></button>
        </div>
      </div>
      {effectsOpen && (
        <div className="effects-grid">
          {effectGroups.map((group) => <EffectGroupCard key={group.id} group={group} toggleGroup={toggleGroup} chooseGroup={chooseGroup} updateGroupSetting={updateGroupSetting} updateGroupVolume={updateGroupVolume} updateGroupLimitMode={updateGroupLimitMode} updateGroupLimitKind={updateGroupLimitKind} updateGroupTimeLimit={updateGroupTimeLimit} updateGroupTimeLimitMax={updateGroupTimeLimitMax} updateGroupTimeLimitMode={updateGroupTimeLimitMode} updateGroupInterval={updateGroupInterval} />)}
          {!effectGroups.length && <div className="empty-panel"><Music2 size={20} /><h3>No effects yet</h3><p>Build a group for the sounds that should visit only once in a while.</p><button className="primary-button" onClick={() => openFilePicker()} data-testid="button-add-first-effect">Add MP3 / WAV</button></div>}
        </div>
      )}
    </section>
    <div style={{ display: 'none' }}>{groups.length}</div>
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionEndPanel
// ─────────────────────────────────────────────────────────────────────────────

function SessionEndPanel({ sessionStatus, endMode, setEndMode, timerParts, updateTimerPart, alarmTime, setAlarmTime, endRemaining, nightTextColor, setNightTextColor }: { sessionStatus: SessionStatus; endMode: EndMode; setEndMode: (mode: EndMode) => void; timerParts: TimerParts; updateTimerPart: (unit: keyof TimerParts, value: number) => void; alarmTime: string; setAlarmTime: (value: string) => void; endRemaining: number; nightTextColor: string; setNightTextColor: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const timerFields: Array<{ unit: keyof TimerParts; label: string; max: number }> = [
    { unit: 'hours', label: 'hr', max: 999 }, { unit: 'minutes', label: 'min', max: 59 },
    { unit: 'seconds', label: 'sec', max: 59 }, { unit: 'milliseconds', label: 'ms', max: 999 },
  ];
  const activeSchedule = sessionStatus !== 'idle' && endRemaining > 0;
  const summary = endMode === 'timer'
    ? (activeSchedule ? `Ends in ${formatDurationNoMs(endRemaining)}` : formatDurationNoMs(timerPartsToMilliseconds(timerParts)))
    : endMode === 'alarm' ? (alarmTime ? (activeSchedule ? `Ends at ${alarmTime}` : `At ${alarmTime}`) : '') : '';
  return (
    <div className={`session-end-card${open ? ' sec-open' : ''}`} aria-label="Automatic session ending">
      <button className="session-end-heading collapse-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div><div className="eyebrow">Close the room gently</div><h3>Automatic ending</h3></div>
        <div className="collapse-right">
          {!open && summary && <span className={`collapse-summary${activeSchedule ? ' active' : ''}`}>{summary}</span>}
          <ChevronDown size={15} className={`collapse-chevron${open ? ' rotated' : ''}`} />
          <AlarmClock size={18} color="hsl(var(--accent))" />
        </div>
      </button>
      {/* Night text color always visible regardless of collapse state */}
      <div className="night-color-setting"><label>Night text</label><div className="text-color-options">{NIGHT_TEXT_COLORS.map((color) => <button key={color} className={`text-color-option ${nightTextColor === color ? 'selected' : ''}`} style={{ background: color }} onClick={() => setNightTextColor(color)} aria-label={`Use ${color} for night text`} aria-pressed={nightTextColor === color} data-testid={`button-night-text-${color.replace('#', '')}`}>{nightTextColor === color && <Check size={12} color="#1b1823" />}</button>)}</div></div>
      {open && (
        <div className="collapse-body">
          <div className="end-mode-buttons" role="group" aria-label="Session ending mode">
            <button className={`end-mode-button ${endMode === 'none' ? 'selected' : ''}`} onClick={() => setEndMode('none')} aria-pressed={endMode === 'none'} data-testid="button-end-mode-none"><span>Manual</span><small>Stop it yourself</small></button>
            <button className={`end-mode-button ${endMode === 'timer' ? 'selected' : ''}`} onClick={() => setEndMode('timer')} aria-pressed={endMode === 'timer'} data-testid="button-end-mode-timer"><Timer size={15} /><span>Timer</span><small>Run for a duration</small></button>
            <button className={`end-mode-button ${endMode === 'alarm' ? 'selected' : ''}`} onClick={() => setEndMode('alarm')} aria-pressed={endMode === 'alarm'} data-testid="button-end-mode-alarm"><AlarmClock size={15} /><span>Alarm</span><small>End at a clock time</small></button>
          </div>
          {endMode === 'timer' && <div className="end-option"><div className="timer-fields">{timerFields.map(({ unit, label, max }) => <label key={unit} className="duration-field"><input type="number" min="0" max={max} value={timerParts[unit]} onChange={(event) => updateTimerPart(unit, Number(event.target.value))} aria-label={`Timer ${label}`} data-testid={`input-session-timer-${unit}`} /><span>{label}</span></label>)}</div><p>Session length: <strong>{formatDuration(timerPartsToMilliseconds(timerParts))}</strong></p></div>}
          {endMode === 'alarm' && <div className="end-option alarm-option"><label htmlFor="session-alarm-time">End at</label><input id="session-alarm-time" type="time" step="1" value={alarmTime} onChange={(event) => setAlarmTime(event.target.value)} aria-label="Session alarm time" data-testid="input-session-alarm" /><p>The next occurrence of this time will end the session.</p></div>}
          <div className={`end-status ${activeSchedule ? 'active' : ''}`} role="status"><span className="end-status-dot" />{activeSchedule ? `${sessionStatus === 'paused' ? 'Paused' : 'Active'} \u00b7 ends in ${formatDuration(endRemaining)}` : endMode === 'none' ? 'No automatic ending set.' : 'This ending rule will apply when you start the session.'}</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionSchedulePanel
// ─────────────────────────────────────────────────────────────────────────────

type SessionSchedulePanelProps = {
  scheduleMode: ScheduleMode; setScheduleMode: (m: ScheduleMode) => void;
  scheduleParts: TimerParts; updateSchedulePart: (unit: keyof TimerParts, value: number) => void;
  scheduleTime: string; setScheduleTime: (t: string) => void;
  scheduleRepeat: boolean; setScheduleRepeat: (r: boolean) => void;
  scheduleActive: boolean; scheduleEndAt: number | null; scheduleRemaining: number;
  startSchedule: () => void; cancelSchedule: () => void;
  sessionStatus: SessionStatus;
};

function SessionSchedulePanel({ scheduleMode, setScheduleMode, scheduleParts, updateSchedulePart, scheduleTime, setScheduleTime, scheduleRepeat, setScheduleRepeat, scheduleActive, scheduleEndAt, scheduleRemaining, startSchedule, cancelSchedule, sessionStatus }: SessionSchedulePanelProps) {
  const [open, setOpen] = useState(false);
  const isRunning = scheduleActive && sessionStatus === 'idle';
  const cdFields: Array<{ unit: keyof TimerParts; label: string; max: number }> = [
    { unit: 'hours', label: 'hr', max: 23 }, { unit: 'minutes', label: 'min', max: 59 }, { unit: 'seconds', label: 'sec', max: 59 },
  ];
  const scheduleDuration = scheduleParts.hours * HOUR_MS + scheduleParts.minutes * MINUTE_MS + scheduleParts.seconds * SECOND_MS;
  const summary = scheduleMode === 'countdown'
    ? (isRunning ? `Starting in ${formatDurationNoMs(scheduleRemaining)}` : (scheduleDuration > 0 ? formatDurationNoMs(scheduleDuration) : ''))
    : scheduleMode === 'time' ? (scheduleTime ? (isRunning ? `Starting at ${scheduleTime}` : `${scheduleTime}${scheduleRepeat ? ' · daily' : ''}`) : '') : '';
  return (
    <div className={`session-end-card${open ? ' sec-open' : ''}`} aria-label="Scheduled session start">
      <button className="session-end-heading collapse-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div><div className="eyebrow">Begin automatically</div><h3>Schedule start</h3></div>
        <div className="collapse-right">
          {!open && summary && <span className={`collapse-summary${isRunning ? ' active' : ''}`}>{summary}</span>}
          <ChevronDown size={15} className={`collapse-chevron${open ? ' rotated' : ''}`} />
          <Clock size={18} color="hsl(var(--primary))" />
        </div>
      </button>
      {open && (
        <div className="collapse-body">
          <div className="end-mode-buttons" role="group" aria-label="Schedule mode">
            <button className={`end-mode-button ${scheduleMode === 'off' ? 'selected' : ''}`} onClick={() => { setScheduleMode('off'); cancelSchedule(); }} aria-pressed={scheduleMode === 'off'} data-testid="button-schedule-off"><span>Off</span><small>Start manually</small></button>
            <button className={`end-mode-button ${scheduleMode === 'countdown' ? 'selected' : ''}`} onClick={() => setScheduleMode('countdown')} aria-pressed={scheduleMode === 'countdown'} data-testid="button-schedule-countdown"><Timer size={15} /><span>Countdown</span><small>Start after a delay</small></button>
            <button className={`end-mode-button ${scheduleMode === 'time' ? 'selected' : ''}`} onClick={() => setScheduleMode('time')} aria-pressed={scheduleMode === 'time'} data-testid="button-schedule-time"><Clock size={15} /><span>At time</span><small>Start at a specific time</small></button>
          </div>
          {scheduleMode === 'countdown' && (
            <div className="end-option">
              <div className="timer-fields">
                {cdFields.map(({ unit, label, max }) => (
                  <label key={unit} className="duration-field">
                    <input type="number" min="0" max={max} value={scheduleParts[unit]} onChange={(e) => updateSchedulePart(unit, Number(e.target.value))} disabled={isRunning} aria-label={`Schedule ${label}`} data-testid={`input-schedule-${unit}`} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              {isRunning
                ? <><span className="schedule-remaining">{formatDurationNoMs(scheduleRemaining)}</span><button className="quiet-button" onClick={cancelSchedule} data-testid="button-cancel-schedule">Cancel</button></>
                : <button className="quiet-button" onClick={startSchedule} disabled={sessionStatus !== 'idle'} data-testid="button-start-schedule">Schedule</button>
              }
            </div>
          )}
          {scheduleMode === 'time' && (
            <div className="end-option alarm-option">
              <label htmlFor="schedule-at-time">Start at</label>
              <input id="schedule-at-time" type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} disabled={isRunning} aria-label="Schedule start time" data-testid="input-schedule-time" />
              <label className="settings-toggle" style={{ marginLeft: 'auto' }}>
                <input type="checkbox" checked={scheduleRepeat} onChange={(e) => setScheduleRepeat(e.target.checked)} disabled={isRunning} data-testid="toggle-schedule-repeat" />
                <span>Daily</span>
              </label>
              {isRunning
                ? <button className="quiet-button" onClick={cancelSchedule} data-testid="button-cancel-schedule-time">Cancel</button>
                : <button className="quiet-button" onClick={startSchedule} disabled={sessionStatus !== 'idle'} data-testid="button-start-schedule-time">Schedule</button>
              }
            </div>
          )}
          <div className={`end-status ${isRunning ? 'active' : ''}`} role="status">
            <span className="end-status-dot" />
            {isRunning
              ? scheduleMode === 'countdown'
                ? `Starting in ${formatDurationNoMs(scheduleRemaining)}`
                : `Waiting for ${scheduleTime}${scheduleRepeat ? ' · repeats daily' : ''}`
              : scheduleMode === 'off'
                ? 'No scheduled start — you\'ll press play yourself.'
                : 'This schedule will activate when you configure it and click Schedule.'
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NightModeOverlay — full-screen dim with collapsible left control panel
// ─────────────────────────────────────────────────────────────────────────────

type NightModeOverlayProps = {
  active: boolean;
  isAlarming: boolean;
  alarmPulseActive: boolean;
  endMode: EndMode;
  endRemaining: number;
  alarmTime: string;
  textColor: string;
  setTextColor: (color: string) => void;
  now: Date;
  stopSession: () => void;
  onSnooze: () => void;
  snoozeMins: number;
  showDate: boolean;
  showSeconds: boolean;
  hour12: boolean;
  showAmPm: boolean;
  groups: SoundGroup[];
  updateGroupVolume: (id: string, vol: number) => void;
  toggleGroup: (id: string) => void;
  clockFont: string;
  setClockFont: (f: string) => void;
  dimEnabled: boolean;
  dimDelaySecs: number;
  dimColor: string;
  dimShowClock: boolean;
  dimShowDate: boolean;
  dimShowSeconds: boolean;
  dimShowAmPm: boolean;
  dimBrightness: number;
};

function NightModeOverlay({ active, isAlarming, alarmPulseActive, endMode, endRemaining, alarmTime, textColor, setTextColor, now, stopSession, onSnooze, snoozeMins, showDate, showSeconds, hour12, showAmPm, groups, updateGroupVolume, toggleGroup, clockFont, setClockFont, dimEnabled, dimDelaySecs, dimColor, dimShowClock, dimShowDate, dimShowSeconds, dimShowAmPm, dimBrightness }: NightModeOverlayProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [isDimmed, setIsDimmed] = useState(false);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDimmedRef = useRef(false);

  // Restart the 5-minute panel inactivity countdown.
  const resetPanelAutoClose = () => {
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = setTimeout(() => setPanelOpen(false), 5 * 60 * 1000);
  };

  // Auto-close panel when session ends.
  useEffect(() => {
    if (!active) setPanelOpen(false);
  }, [active]);

  // Hide the page scrollbar while the night overlay is active so OS-level
  // scrollbars (Windows / Ubuntu always-visible style) don't bleed through.
  useEffect(() => {
    document.body.style.overflow = active ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [active]);

  // Start/clear the panel inactivity timer as the panel opens and closes.
  useEffect(() => {
    if (panelOpen) {
      resetPanelAutoClose();
    } else {
      if (autoCloseTimerRef.current) { clearTimeout(autoCloseTimerRef.current); autoCloseTimerRef.current = null; }
    }
    return () => { if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current); };
  }, [panelOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start/reset dim timer when session starts, stops, or dim settings change.
  useEffect(() => {
    if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
    isDimmedRef.current = false;
    setIsDimmed(false);
    if (active && dimEnabled) {
      dimTimerRef.current = setTimeout(() => {
        isDimmedRef.current = true;
        setIsDimmed(true);
        setPanelOpen(false);
      }, dimDelaySecs * 1000);
    }
    return () => { if (dimTimerRef.current) clearTimeout(dimTimerRef.current); };
  }, [active, dimEnabled, dimDelaySecs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wake from dim when alarm fires.
  useEffect(() => {
    if (isAlarming) {
      isDimmedRef.current = false;
      setIsDimmed(false);
      if (dimTimerRef.current) { clearTimeout(dimTimerRef.current); dimTimerRef.current = null; }
    }
  }, [isAlarming]);

  // Any user activity (move, click, tap) wakes the display and restarts the dim timer.
  const handleActivity = () => {
    if (isDimmedRef.current) {
      isDimmedRef.current = false;
      setIsDimmed(false);
    }
    if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
    if (dimEnabled && active) {
      dimTimerRef.current = setTimeout(() => {
        isDimmedRef.current = true;
        setIsDimmed(true);
        setPanelOpen(false);
      }, dimDelaySecs * 1000);
    }
  };

  const endingLabel = isAlarming
    ? 'Alarm ringing'
    : endMode === 'timer'
    ? `Timer \u00b7 ${formatDurationNoMs(endRemaining)} remaining`
    : endMode === 'alarm' ? `Alarm \u00b7 ${alarmTime || 'not set'}` : 'Manual stop';

  const controllableGroups = groups.filter((g) => g.files.length > 0);

  return <div
    className={`night-mode-overlay ${active ? 'active' : ''} ${isDimmed ? 'dimmed' : ''}`}
    aria-hidden={!active}
    style={{ '--night-text-color': isDimmed ? dimColor : textColor } as CSSProperties}
    onMouseMove={handleActivity}
    onClick={handleActivity}
    onTouchStart={handleActivity}
  >

    {/* ── Background pulse when alarming ─────────────────────────── */}
    {alarmPulseActive && !isDimmed && (
      <div className="alarm-pulse-overlay" style={{ backgroundColor: textColor }} aria-hidden="true" />
    )}

    {/* ── Left control panel — hidden while dimmed ─────────────────── */}
    {!isDimmed && (
      <div className={`night-panel ${panelOpen ? 'open' : ''}`} aria-label="Night controls" role="region">
        <button
          className="night-panel-toggle"
          onClick={() => setPanelOpen((o) => !o)}
          tabIndex={active ? 0 : -1}
          aria-label={panelOpen ? 'Close night controls' : 'Open night controls'}
          aria-expanded={panelOpen}
          data-testid="button-night-panel-toggle"
        >
          {panelOpen ? <X size={15} /> : <SlidersHorizontal size={15} />}
        </button>

        {panelOpen && (
          <div className="night-panel-body" onPointerMove={() => { resetPanelAutoClose(); handleActivity(); }} onClick={() => { resetPanelAutoClose(); handleActivity(); }}>
            <div className="night-panel-section">
              <div className="night-panel-label">Clock font</div>
              <select className="night-font-select" value={clockFont} onChange={(e) => setClockFont(e.target.value)} tabIndex={active ? 0 : -1} aria-label="Clock font" data-testid="select-clock-font">
                {CLOCK_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="night-panel-section">
              <div className="night-panel-label">Text color</div>
              <div className="night-panel-colors">
                {NIGHT_TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`night-panel-swatch ${textColor === color ? 'selected' : ''}`}
                    style={{ background: color }}
                    onClick={() => setTextColor(color)}
                    tabIndex={active ? 0 : -1}
                    aria-label={`Night text color ${color}`}
                    aria-pressed={textColor === color}
                    data-testid={`button-night-panel-color-${color.replace('#', '')}`}
                  >
                    {textColor === color && <Check size={11} color="#1b1823" />}
                  </button>
                ))}
              </div>
            </div>

            {controllableGroups.length > 0 && (
              <div className="night-panel-section">
                <div className="night-panel-label">Groups</div>
                {controllableGroups.map((group) => {
                  const Icon = iconForGroup(group.name, group.icon);
                  return (
                    <div key={group.id} className="night-panel-volume">
                      <div className="night-panel-vol-name">
                        <Icon size={12} />
                        <span>{group.name}</span>
                        <button
                          className={`night-panel-group-toggle ${group.enabled ? 'on' : ''}`}
                          onClick={() => toggleGroup(group.id)}
                          tabIndex={active ? 0 : -1}
                          aria-label={`${group.enabled ? 'Disable' : 'Enable'} ${group.name}`}
                          aria-pressed={group.enabled}
                          data-testid={`button-night-toggle-${group.id}`}
                        >
                          <span />
                        </button>
                      </div>
                      <div className="night-panel-vol-row">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={group.volume ?? 100}
                          onChange={(e) => updateGroupVolume(group.id, Number(e.target.value))}
                          tabIndex={active ? 0 : -1}
                          aria-label={`${group.name} volume`}
                          data-testid={`input-night-vol-${group.id}`}
                        />
                        <span>{group.volume ?? 100}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    )}

    {/* ── Clock / stop button — dims in place ─────────────────────── */}
    <div className={`night-mode-content${isDimmed ? ' content-dimmed' : ''}`} style={isDimmed ? { opacity: 0.05 + (dimBrightness / 100) * 0.75 } : undefined}>
      <div className={`night-mode-time${isDimmed && !dimShowClock ? ' night-aux-out' : ''}`} style={{ fontFamily: `'${clockFont}', sans-serif`, fontWeight: CLOCK_FONTS.find((f) => f.value === clockFont)?.weight ?? '800' }}>{formatClockTime(now, isDimmed ? dimShowSeconds : showSeconds, hour12, isDimmed ? dimShowAmPm : showAmPm)}</div>
      {showDate && (
        <div className={`night-mode-date${isDimmed && !dimShowDate ? ' night-aux-out' : ''}`}>{formatClockDate(now)}</div>
      )}
      <div className={`night-mode-aux${isDimmed ? ' night-aux-out' : ''}`}>
        <div className="night-mode-ending">{endingLabel}</div>
        {isAlarming && (
          <button className="night-mode-snooze" onClick={onSnooze} tabIndex={active ? 0 : -1} aria-label={`Snooze for ${snoozeMins} minutes`} data-testid="button-night-mode-snooze">
            <BellOff size={14} /> Snooze {snoozeMins} min
          </button>
        )}
        <button className={`night-mode-stop ${isAlarming ? 'alarming' : ''}`} onClick={stopSession} tabIndex={active ? 0 : -1} aria-label="Stop session" data-testid="button-night-mode-stop"><Square size={15} fill="currentColor" /> {isAlarming ? 'Silence & end' : 'Stop session'}</button>
      </div>
    </div>
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clock Display Overlay
// ─────────────────────────────────────────────────────────────────────────────

type ClockDisplayOverlayProps = {
  active: boolean;
  onDismiss: () => void;
  now: Date;
  color: string;
  showDate: boolean;
  showSeconds: boolean;
  hour12: boolean;
  showAmPm: boolean;
  clockFont: string;
  musicStatus: MusicStatus;
  musicActiveTrack: MusicTrack | null;
  musicActivePlaylist: { id: string; name: string; tracks: MusicTrack[] } | null;
  onMusicPlayPause: () => void;
  onMusicPrev: () => void;
  onMusicNext: () => void;
};

function ClockDisplayOverlay({ active, onDismiss, now, color, showDate, showSeconds, hour12, showAmPm, clockFont, musicStatus, musicActiveTrack, musicActivePlaylist, onMusicPlayPause, onMusicPrev, onMusicNext }: ClockDisplayOverlayProps) {
  const musicActive = musicStatus !== 'idle';
  const trackName = musicActiveTrack ? musicActiveTrack.name.replace(/\.[^.]+$/, '') : null;

  useEffect(() => {
    document.body.style.overflow = active ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [active]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    if (e.clientY - rect.top < rect.height / 2) onDismiss();
  };

  return (
    <div
      className={`clock-display-overlay${active ? ' active' : ''}`}
      style={{ '--clock-color': color } as CSSProperties}
      onClick={handleOverlayClick}
      aria-hidden={!active}
    >
      <div className="clock-display-content">
        <div className="clock-display-time" style={{ fontFamily: `'${clockFont}', sans-serif`, fontWeight: CLOCK_FONTS.find((f) => f.value === clockFont)?.weight ?? '800' }}>{formatClockTime(now, showSeconds, hour12, showAmPm)}</div>
        {showDate && <div className="clock-display-date">{formatClockDate(now)}</div>}
        {musicActive && (
          <div className="clock-display-music">
            <div className="clock-display-track">
              {trackName && <span className="clock-display-track-name">{trackName}</span>}
              {musicActivePlaylist && <span className="clock-display-playlist-name">{musicActivePlaylist.name}</span>}
            </div>
            <div className="clock-display-controls" onClick={(e) => e.stopPropagation()}>
              <button className="clock-display-btn" onClick={onMusicPrev} aria-label="Previous track"><SkipBack size={18} /></button>
              <button className="clock-display-btn clock-display-btn-play" onClick={onMusicPlayPause} aria-label={musicStatus === 'playing' ? 'Pause' : 'Play'}>
                {musicStatus === 'playing' ? <Pause size={22} /> : <Play size={22} />}
              </button>
              <button className="clock-display-btn" onClick={onMusicNext} aria-label="Next track"><SkipForward size={18} /></button>
            </div>
          </div>
        )}
      </div>
      <button
        className="clock-display-home-btn"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label="Return to home"
      >
        Go to Home
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

function GroupVolumeRow({ group, updateGroupVolume }: { group: SoundGroup; updateGroupVolume: (id: string, vol: number) => void }) {
  return (
    <div className="group-volume-row">
      <Volume2 size={12} />
      <input type="range" min="0" max="100" value={group.volume ?? 100} onChange={(e) => updateGroupVolume(group.id, Number(e.target.value))} aria-label={`${group.name} volume`} data-testid={`input-group-volume-${group.id}`} />
      <span>{group.volume ?? 100}%</span>
    </div>
  );
}

function SoundGroupCard({ group, selected, toggleGroup, chooseGroup, updateGroupVolume, updateMainSessionSetting, updateMainDuration }: { group: SoundGroup; selected: boolean; toggleGroup: (id: string) => void; chooseGroup: (id: string) => void; updateGroupVolume: (id: string, vol: number) => void; updateMainSessionSetting: (groupId: string, key: 'sessionChanceEnabled' | 'sessionChance' | 'autoStopEnabled' | 'minDuration' | 'maxDuration', value: boolean | number) => void; updateMainDuration: (groupId: string, key: 'minDuration' | 'maxDuration', unit: DurationUnit, value: number) => void }) {
  const Icon = iconForGroup(group.name, group.icon);
  return <article className={`sound-card ${selected ? 'selected' : ''}`} onDoubleClick={() => chooseGroup(group.id)} data-testid={`card-main-group-${group.id}`}>
    <div className="sound-card-top"><div className="sound-symbol" style={{ '--symbol-color': group.color } as CSSProperties}><Icon size={17} /></div><button className={`toggle ${group.enabled ? 'on' : ''}`} onClick={() => toggleGroup(group.id)} aria-label={`${group.enabled ? 'Disable' : 'Enable'} ${group.name}`} aria-pressed={group.enabled} data-testid={`toggle-group-${group.id}`}><span /></button></div>
    <h3>{group.name}</h3><div className="sound-meta"><Music2 size={12} /> {group.files.length} {group.files.length === 1 ? 'sound' : 'sounds'} \u00b7 loops</div>
    <GroupVolumeRow group={group} updateGroupVolume={updateGroupVolume} />
    <div className="sound-card-foot"><span>{group.enabled ? 'In tonight\u2019s room' : 'Tucked away'}</span><button className="quiet-button" onClick={() => chooseGroup(group.id)} aria-label={`Manage ${group.name}`} data-testid={`button-manage-${group.id}`}><ChevronRight size={14} /></button></div>
  </article>;
}

function MainSessionSettings({ group, updateMainSessionSetting, updateMainDuration }: { group: SoundGroup; updateMainSessionSetting: (groupId: string, key: 'sessionChanceEnabled' | 'sessionChance' | 'autoStopEnabled' | 'minDuration' | 'maxDuration', value: boolean | number) => void; updateMainDuration: (groupId: string, key: 'minDuration' | 'maxDuration', unit: DurationUnit, value: number) => void }) {
  const chanceEnabled = group.sessionChanceEnabled === true;
  const autoStopEnabled = group.autoStopEnabled === true;
  return <div className="main-session-settings">
    <div className="main-setting-row">
      <label className="main-setting-toggle"><input type="checkbox" checked={chanceEnabled} onChange={(event) => updateMainSessionSetting(group.id, 'sessionChanceEnabled', event.target.checked)} data-testid={`toggle-main-chance-${group.id}`} /><span>Chance this session</span></label>
      {chanceEnabled && <label className="main-percent"><input type="number" min="0" max="100" value={group.sessionChance ?? 100} onChange={(event) => updateMainSessionSetting(group.id, 'sessionChance', Number(event.target.value))} aria-label={`${group.name} session chance`} data-testid={`input-main-chance-${group.id}`} /><span>%</span></label>}
    </div>
    <div className="main-setting-row">
      <label className="main-setting-toggle"><input type="checkbox" checked={autoStopEnabled} onChange={(event) => updateMainSessionSetting(group.id, 'autoStopEnabled', event.target.checked)} data-testid={`toggle-main-auto-stop-${group.id}`} /><span>Randomly turn off</span></label>
    </div>
    {autoStopEnabled && <div className="main-duration-settings"><div><label>After at least</label><MainDurationFields group={group} settingKey="minDuration" updateMainDuration={updateMainDuration} /></div><div><label>Before at most</label><MainDurationFields group={group} settingKey="maxDuration" updateMainDuration={updateMainDuration} /></div></div>}
  </div>;
}

function MainDurationFields({ group, settingKey, updateMainDuration }: { group: SoundGroup; settingKey: 'minDuration' | 'maxDuration'; updateMainDuration: (groupId: string, key: 'minDuration' | 'maxDuration', unit: DurationUnit, value: number) => void }) {
  const fields: Array<{ unit: DurationUnit; label: string; max: number }> = [
    { unit: 'hours', label: 'hr', max: 999 }, { unit: 'minutes', label: 'min', max: 59 },
    { unit: 'seconds', label: 'sec', max: 59 }, { unit: 'milliseconds', label: 'ms', max: 999 },
  ];
  const duration = group[settingKey] ?? (settingKey === 'minDuration' ? DEFAULT_MAIN_MIN_DURATION : DEFAULT_MAIN_MAX_DURATION);
  return <div className="duration-fields">{fields.map(({ unit, label, max }) => <label key={unit} className="duration-field"><input type="number" min="0" max={max} value={getDurationParts(duration)[unit]} onChange={(event) => updateMainDuration(group.id, settingKey, unit, Number(event.target.value))} aria-label={`${group.name} ${settingKey} ${label}`} data-testid={`input-${settingKey}-${unit}-${group.id}`} /><span>{label}</span></label>)}</div>;
}

function DurationFields({ group, prefix, updateGroupInterval }: { group: SoundGroup; prefix: string; updateGroupInterval: (groupId: string, key: IntervalKey, unit: DurationUnit, value: number) => void }) {
  const fields: Array<{ unit: DurationUnit; label: string; max: number }> = [
    { unit: 'hours', label: 'hr', max: 999 }, { unit: 'minutes', label: 'min', max: 59 },
    { unit: 'seconds', label: 'sec', max: 59 }, { unit: 'milliseconds', label: 'ms', max: 999 },
  ];
  return <div className="duration-fields">{fields.map(({ unit, label, max }) => <label key={unit} className="duration-field"><input id={`${prefix}-${unit}`} type="number" min="0" max={max} value={getDurationParts(group[prefix.startsWith('min') ? 'minInterval' : 'maxInterval'])[unit]} onChange={(event) => updateGroupInterval(group.id, prefix.startsWith('min') ? 'minInterval' : 'maxInterval', unit, Number(event.target.value))} aria-label={`${prefix} ${label}`} data-testid={`input-${prefix}-${unit}-${group.id}`} /><span>{label}</span></label>)}</div>;
}

function TimeLimitFields({ group, updateGroupTimeLimit }: { group: SoundGroup; updateGroupTimeLimit: (groupId: string, unit: DurationUnit, value: number) => void }) {
  const fields: Array<{ unit: DurationUnit; label: string; max: number }> = [
    { unit: 'hours', label: 'hr', max: 999 }, { unit: 'minutes', label: 'min', max: 59 },
    { unit: 'seconds', label: 'sec', max: 59 }, { unit: 'milliseconds', label: 'ms', max: 999 },
  ];
  const timeLimit = group.timeLimit ?? DEFAULT_TIME_LIMIT;
  return <div className="duration-fields">{fields.map(({ unit, label, max }) => <label key={unit} className="duration-field"><input type="number" min="0" max={max} value={getDurationParts(timeLimit)[unit]} onChange={(e) => updateGroupTimeLimit(group.id, unit, Number(e.target.value))} aria-label={`${group.name} time limit ${label}`} data-testid={`input-timelimit-${unit}-${group.id}`} /><span>{label}</span></label>)}</div>;
}

// Renders duration fields for timeLimitMax (the "latest" bound in random mode).
function TimeLimitFieldsMax({ group, updateGroupTimeLimitMax }: { group: SoundGroup; updateGroupTimeLimitMax: (groupId: string, unit: DurationUnit, value: number) => void }) {
  const fields: Array<{ unit: DurationUnit; label: string; max: number }> = [
    { unit: 'hours', label: 'hr', max: 999 }, { unit: 'minutes', label: 'min', max: 59 },
    { unit: 'seconds', label: 'sec', max: 59 }, { unit: 'milliseconds', label: 'ms', max: 999 },
  ];
  const timeLimit = group.timeLimitMax ?? DEFAULT_TIME_LIMIT_MAX;
  return <div className="duration-fields">{fields.map(({ unit, label, max }) => <label key={unit} className="duration-field"><input type="number" min="0" max={max} value={getDurationParts(timeLimit)[unit]} onChange={(e) => updateGroupTimeLimitMax(group.id, unit, Number(e.target.value))} aria-label={`${group.name} time limit max ${label}`} data-testid={`input-timelimitmax-${unit}-${group.id}`} /><span>{label}</span></label>)}</div>;
}

// Composites the Fixed/Random toggle + the appropriate duration field(s).
function TimeLimitSection({ group, updateGroupTimeLimit, updateGroupTimeLimitMax, updateGroupTimeLimitMode }: {
  group: SoundGroup;
  updateGroupTimeLimit: (groupId: string, unit: DurationUnit, value: number) => void;
  updateGroupTimeLimitMax: (groupId: string, unit: DurationUnit, value: number) => void;
  updateGroupTimeLimitMode: (groupId: string, mode: TimeLimitMode) => void;
}) {
  const mode = group.timeLimitMode ?? 'fixed';
  return (
    <div className="time-limit-section">
      <div className="limit-kind-group time-limit-mode-group" role="group" aria-label="Time limit mode">
        <label className={`limit-kind-opt ${mode === 'fixed' ? 'selected' : ''}`}>
          <input type="radio" name={`timelimit-mode-${group.id}`} checked={mode === 'fixed'} onChange={() => updateGroupTimeLimitMode(group.id, 'fixed')} data-testid={`radio-timelimit-fixed-${group.id}`} /><span>Fixed</span>
        </label>
        <label className={`limit-kind-opt ${mode === 'random' ? 'selected' : ''}`}>
          <input type="radio" name={`timelimit-mode-${group.id}`} checked={mode === 'random'} onChange={() => updateGroupTimeLimitMode(group.id, 'random')} data-testid={`radio-timelimit-random-${group.id}`} /><span>Random</span>
        </label>
      </div>
      {mode === 'fixed' ? (
        <div className="time-limit-fields">
          <span className="time-limit-label">Stop after</span>
          <TimeLimitFields group={group} updateGroupTimeLimit={updateGroupTimeLimit} />
        </div>
      ) : (
        <div className="time-limit-fields">
          <span className="time-limit-label">Earliest</span>
          <TimeLimitFields group={group} updateGroupTimeLimit={updateGroupTimeLimit} />
          <span className="time-limit-label">Latest</span>
          <TimeLimitFieldsMax group={group} updateGroupTimeLimitMax={updateGroupTimeLimitMax} />
        </div>
      )}
    </div>
  );
}

function LimitKindToggle({ group, updateGroupLimitKind }: { group: SoundGroup; updateGroupLimitKind: (id: string, kind: LimitKind) => void }) {
  return (
    <div className="limit-kind-group" role="group" aria-label="Limit type">
      <label className={`limit-kind-opt ${(group.limitKind ?? 'count') === 'count' ? 'selected' : ''}`}>
        <input type="radio" name={`limit-kind-${group.id}`} checked={(group.limitKind ?? 'count') === 'count'} onChange={() => updateGroupLimitKind(group.id, 'count')} data-testid={`radio-limit-count-${group.id}`} /><span>Plays</span>
      </label>
      <label className={`limit-kind-opt ${group.limitKind === 'time' ? 'selected' : ''}`}>
        <input type="radio" name={`limit-kind-${group.id}`} checked={group.limitKind === 'time'} onChange={() => updateGroupLimitKind(group.id, 'time')} data-testid={`radio-limit-time-${group.id}`} /><span>Time</span>
      </label>
    </div>
  );
}

type EffectGroupCardProps = {
  group: SoundGroup;
  toggleGroup: (id: string) => void;
  chooseGroup: (id: string) => void;
  updateGroupSetting: (groupId: string, key: 'minInterval' | 'maxInterval' | 'limit', value: number) => void;
  updateGroupVolume: (groupId: string, volume: number) => void;
  updateGroupLimitMode: (groupId: string, enabled: boolean) => void;
  updateGroupLimitKind: (groupId: string, kind: LimitKind) => void;
  updateGroupTimeLimit: (groupId: string, unit: DurationUnit, value: number) => void;
  updateGroupTimeLimitMax: (groupId: string, unit: DurationUnit, value: number) => void;
  updateGroupTimeLimitMode: (groupId: string, mode: TimeLimitMode) => void;
  updateGroupInterval: (groupId: string, key: IntervalKey, unit: DurationUnit, value: number) => void;
};

function EffectGroupCard({ group, toggleGroup, chooseGroup, updateGroupSetting, updateGroupVolume, updateGroupLimitMode, updateGroupLimitKind, updateGroupTimeLimit, updateGroupTimeLimitMax, updateGroupTimeLimitMode, updateGroupInterval }: EffectGroupCardProps) {
  const Icon = iconForGroup(group.name, group.icon);
  const limitKind = group.limitKind ?? 'count';
  const tlMode = group.timeLimitMode ?? 'fixed';
  const limitSummary = group.limitEnabled
    ? limitKind === 'time'
      ? tlMode === 'random'
        ? `stops ${formatDurationNoMs(group.timeLimit ?? DEFAULT_TIME_LIMIT)}\u2013${formatDurationNoMs(group.timeLimitMax ?? DEFAULT_TIME_LIMIT_MAX)} in`
        : `stops after ${formatDurationNoMs(group.timeLimit ?? DEFAULT_TIME_LIMIT)}`
      : `${group.limit} play limit`
    : 'unlimited';
  return <article className="effect-card" data-testid={`card-effect-group-${group.id}`}>
    <div className="sound-symbol" style={{ '--symbol-color': group.color } as CSSProperties}><Icon size={17} /></div>
    <div>
      <h3>{group.name}</h3>
      <p>{group.files.length} sounds \u00b7 {formatDuration(group.minInterval)}\u2013{formatDuration(group.maxInterval)} \u00b7 {limitSummary}</p>
    </div>
    <button className={`toggle ${group.enabled ? 'on' : ''}`} onClick={() => toggleGroup(group.id)} aria-label={`${group.enabled ? 'Disable' : 'Enable'} ${group.name}`} aria-pressed={group.enabled} data-testid={`toggle-effect-${group.id}`}><span /></button>
    <div className="effect-settings">
      <div className="duration-setting"><label>Minimum interval</label><DurationFields group={group} prefix="minInterval" updateGroupInterval={updateGroupInterval} /></div>
      <div className="duration-setting"><label>Maximum interval</label><DurationFields group={group} prefix="maxInterval" updateGroupInterval={updateGroupInterval} /></div>
      <div className="setting limit-setting">
        <label htmlFor={`limit-${group.id}`}>Play limit</label>
        <label className="limit-toggle"><input id={`limit-${group.id}`} type="checkbox" checked={group.limitEnabled} onChange={(event) => updateGroupLimitMode(group.id, event.target.checked)} data-testid={`toggle-limit-${group.id}`} /><span>{group.limitEnabled ? 'Limited' : 'Unlimited'}</span></label>
        {group.limitEnabled && <>
          <LimitKindToggle group={group} updateGroupLimitKind={updateGroupLimitKind} />
          {limitKind === 'count'
            ? <input type="number" min="1" value={group.limit} onChange={(event) => updateGroupSetting(group.id, 'limit', Number(event.target.value))} aria-label={`${group.name} play limit`} data-testid={`input-limit-${group.id}`} />
            : <TimeLimitSection group={group} updateGroupTimeLimit={updateGroupTimeLimit} updateGroupTimeLimitMax={updateGroupTimeLimitMax} updateGroupTimeLimitMode={updateGroupTimeLimitMode} />
          }
        </>}
      </div>
      <div className="effect-volume-wrap"><GroupVolumeRow group={group} updateGroupVolume={updateGroupVolume} /></div>
      <button className="quiet-button" onClick={() => chooseGroup(group.id)} data-testid={`button-edit-effect-${group.id}`}><SlidersHorizontal size={14} /> Tune</button>
    </div>
  </article>;
}

// ─────────────────────────────────────────────────────────────────────────────
// LibraryPage
// ─────────────────────────────────────────────────────────────────────────────

type LibraryPageProps = {
  groups: SoundGroup[];
  selectedGroup: string | null;
  setSelectedGroup: (id: string) => void;
  openNewGroup: () => void;
  openEditGroup: (group: SoundGroup) => void;
  deleteGroup: (group: SoundGroup) => void;
  openFilePicker: (groupId?: string) => void;
  removeFile: (groupId: string, fileId: string) => void;
  setFileRole: (groupId: string, fileId: string, role: GroupKind) => void;
  updateGroupSetting: (groupId: string, key: 'minInterval' | 'maxInterval' | 'limit', value: number) => void;
  updateGroupVolume: (groupId: string, volume: number) => void;
  updateGroupLimitMode: (groupId: string, enabled: boolean) => void;
  updateGroupLimitKind: (groupId: string, kind: LimitKind) => void;
  updateGroupTimeLimit: (groupId: string, unit: DurationUnit, value: number) => void;
  updateGroupTimeLimitMax: (groupId: string, unit: DurationUnit, value: number) => void;
  updateGroupTimeLimitMode: (groupId: string, mode: TimeLimitMode) => void;
  updateGroupInterval: (groupId: string, key: IntervalKey, unit: DurationUnit, value: number) => void;
  toggleGroup: (id: string) => void;
};

function LibraryPage(props: LibraryPageProps) {
  const { groups, selectedGroup, setSelectedGroup, openNewGroup, openEditGroup, deleteGroup, openFilePicker, removeFile, setFileRole, updateGroupSetting, updateGroupVolume, updateGroupLimitMode, updateGroupLimitKind, updateGroupTimeLimit, updateGroupTimeLimitMax, updateGroupTimeLimitMode, updateGroupInterval, toggleGroup } = props;
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; key: 'minInterval' | 'maxInterval' | 'limit'; value: number }>).detail;
      updateGroupSetting(detail.id, detail.key, detail.value);
    };
    window.addEventListener('night-setting', handler);
    return () => window.removeEventListener('night-setting', handler);
  }, [updateGroupSetting]);
  const visibleGroups = selectedGroup ? groups.filter((group) => group.id === selectedGroup) : groups;
  return <div>
    <div className="library-heading"><div><div className="eyebrow">Your local collection</div><h1>Sound library</h1></div><div><p>{groups.length} groups \u00b7 {groups.reduce((sum, group) => sum + group.files.length, 0)} sounds, kept on this device. Add your own MP3 or WAV files.</p><button className="primary-button" onClick={openNewGroup} style={{ marginTop: 15 }} data-testid="button-new-library-group"><FolderPlus size={14} /> New group</button></div></div>
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 19 }}>{selectedGroup && <button className="tag" onClick={() => setSelectedGroup('')} data-testid="button-show-all-groups">Showing one group <X size={12} /></button>}{groups.map((group) => <button key={group.id} className={`tag ${selectedGroup === group.id ? 'selected' : ''}`} style={selectedGroup === group.id ? { borderColor: group.color, color: group.color } : undefined} onClick={() => setSelectedGroup(group.id)} data-testid={`filter-group-${group.id}`}><span className="group-dot" style={{ background: group.color }} />{group.name}</button>)}</div>
    <div className="library-grid">
      {visibleGroups.map((group) => <LibraryGroupRow key={group.id} group={group} openEditGroup={openEditGroup} deleteGroup={deleteGroup} openFilePicker={openFilePicker} removeFile={removeFile} setFileRole={setFileRole} updateGroupSetting={updateGroupSetting} updateGroupVolume={updateGroupVolume} updateGroupLimitMode={updateGroupLimitMode} updateGroupLimitKind={updateGroupLimitKind} updateGroupTimeLimit={updateGroupTimeLimit} updateGroupTimeLimitMax={updateGroupTimeLimitMax} updateGroupTimeLimitMode={updateGroupTimeLimitMode} updateGroupInterval={updateGroupInterval} toggleGroup={toggleGroup} />)}
      {!visibleGroups.length && <div className="empty-panel"><Archive size={22} /><h3>Your library is quiet</h3><p>Add a group, then choose local audio files from your device. Nothing leaves the app.</p><button className="primary-button" onClick={openNewGroup} data-testid="button-empty-create-group"><Plus size={14} /> Create your first group</button></div>}
    </div>
  </div>;
}

function LibraryGroupRow({ group, openEditGroup, deleteGroup, openFilePicker, removeFile, setFileRole, updateGroupSetting, updateGroupVolume, updateGroupLimitMode, updateGroupLimitKind, updateGroupTimeLimit, updateGroupTimeLimitMax, updateGroupTimeLimitMode, updateGroupInterval, toggleGroup }: Omit<LibraryPageProps, 'groups' | 'selectedGroup' | 'setSelectedGroup' | 'openNewGroup'> & { group: SoundGroup }) {
  const Icon = iconForGroup(group.name, group.icon);
  const limitKind = group.limitKind ?? 'count';
  return <section className="library-row" data-testid={`row-library-group-${group.id}`}>
    <div className="library-row-head"><span className="group-dot" style={{ background: group.color }} /><Icon size={17} color={group.color} /><div><h3>{group.name}</h3><p>{group.kind === 'main' ? 'Main sound \u00b7 continuous loop' : `Effect group \u00b7 ${formatDuration(group.minInterval)}\u2013${formatDuration(group.maxInterval)}`}</p></div><button className={`toggle ${group.enabled ? 'on' : ''}`} onClick={() => toggleGroup(group.id)} aria-label={`${group.enabled ? 'Disable' : 'Enable'} ${group.name}`} aria-pressed={group.enabled} data-testid={`toggle-library-group-${group.id}`}><span /></button><div className="actions"><button className="icon-button" onClick={() => openEditGroup(group)} aria-label={`Edit ${group.name}`} data-testid={`button-rename-group-${group.id}`}><Pencil size={14} /></button><button className="icon-button" onClick={() => deleteGroup(group)} aria-label={`Delete ${group.name}`} data-testid={`button-delete-group-${group.id}`}><Trash2 size={14} /></button><button className="icon-button" onClick={() => openFilePicker(group.id)} aria-label={`Add files to ${group.name}`} data-testid={`button-add-files-${group.id}`}><Upload size={14} /></button></div></div>
    <div className="library-volume-row"><GroupVolumeRow group={group} updateGroupVolume={updateGroupVolume} /></div>
    {group.kind === 'effect' && <div className="effect-settings library-effect-settings" style={{ margin: '0 19px', paddingBottom: 13 }}>
      <div className="duration-setting"><label>Minimum interval</label><DurationFields group={group} prefix="minInterval-library" updateGroupInterval={updateGroupInterval} /></div>
      <div className="duration-setting"><label>Maximum interval</label><DurationFields group={group} prefix="maxInterval-library" updateGroupInterval={updateGroupInterval} /></div>
      <div className="setting limit-setting">
        <label htmlFor={`library-limit-${group.id}`}>Play limit</label>
        <label className="limit-toggle"><input id={`library-limit-${group.id}`} type="checkbox" checked={group.limitEnabled} onChange={(event) => updateGroupLimitMode(group.id, event.target.checked)} data-testid={`toggle-library-limit-${group.id}`} /><span>{group.limitEnabled ? 'Limited' : 'Unlimited'}</span></label>
        {group.limitEnabled && <>
          <LimitKindToggle group={group} updateGroupLimitKind={updateGroupLimitKind} />
          {limitKind === 'count'
            ? <input type="number" min="1" value={group.limit} onChange={(event) => updateGroupSetting(group.id, 'limit', Number(event.target.value))} aria-label={`${group.name} play limit`} data-testid={`input-library-limit-${group.id}`} />
            : <TimeLimitSection group={group} updateGroupTimeLimit={updateGroupTimeLimit} updateGroupTimeLimitMax={updateGroupTimeLimitMax} updateGroupTimeLimitMode={updateGroupTimeLimitMode} />
          }
        </>}
      </div>
    </div>}
    <div className="file-list">{group.files.map((file) => <div className="file-row" key={file.id} data-testid={`row-file-${file.id}`}><Music2 size={14} color={group.color} /><span className="file-name">{file.name}</span><span className="file-type">{file.demo ? 'Preview' : formatSize(file.size)}</span><button className="quiet-button" onClick={() => setFileRole(group.id, file.id, file.role === 'main' ? 'effect' : 'main')} aria-label={`Assign ${file.name} as ${file.role === 'main' ? 'effect' : 'main'} sound`} data-testid={`button-role-${file.id}`}>{file.role === 'main' ? 'Main' : 'Effect'}</button><button className="icon-button" onClick={() => removeFile(group.id, file.id)} aria-label={`Remove ${file.name}`} data-testid={`button-remove-file-${file.id}`}><Trash2 size={14} /></button></div>)}{!group.files.length && <div className="empty-panel" style={{ border: 0, padding: '24px 10px' }}><Upload size={18} /><h3>No files in this group</h3><p>Choose MP3 or WAV audio from your device to make this group yours.</p><button className="secondary-button" onClick={() => openFilePicker(group.id)} data-testid={`button-empty-add-files-${group.id}`}><Upload size={14} /> Choose MP3 / WAV</button></div>}</div>
  </section>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MusicPage
// ─────────────────────────────────────────────────────────────────────────────

type MusicPageProps = {
  playlists: Playlist[];
  musicViewPlaylistId: string | null;
  setMusicViewPlaylistId: (id: string | null) => void;
  activePlaylistId: string | null;
  activeTrackIndex: number;
  musicStatus: MusicStatus;
  musicVolume: number;
  setMusicVolume: (v: number) => void;
  musicElapsed: number;
  musicDuration: number;
  musicShuffle: boolean;
  musicRepeat: MusicRepeat;
  musicTimerParts: TimerParts;
  musicTimerEndAt: number | null;
  musicTimerRemaining: number;
  createPlaylist: () => void;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  openMusicFilePicker: (playlistId: string) => void;
  removeTrack: (playlistId: string, trackId: string) => void;
  playTrack: (playlistId: string, index: number) => void;
  pauseMusic: () => void;
  resumeMusic: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seekMusic: (seconds: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  startMusicTimer: () => void;
  cancelMusicTimer: () => void;
  updateMusicTimerPart: (unit: keyof TimerParts, value: number) => void;
};

function PlaylistCard({ playlist, active, nowPlaying, onSelect, onDelete, onRename }: {
  playlist: Playlist; active: boolean; nowPlaying: boolean;
  onSelect: () => void; onDelete: () => void; onRename: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(playlist.name);
  const commit = () => {
    if (draft.trim()) onRename(playlist.id, draft.trim()); else setDraft(playlist.name);
    setEditing(false);
  };
  return (
    <div className={`playlist-card ${active ? 'selected' : ''}`} onClick={onSelect} data-testid={`card-playlist-${playlist.id}`}>
      <ListMusic size={14} color={nowPlaying ? 'hsl(var(--primary))' : undefined} />
      {editing
        ? <input className="playlist-name-input" value={draft} onChange={(e) => setDraft(e.target.value)}
            onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(playlist.name); setEditing(false); } }}
            autoFocus onClick={(e) => e.stopPropagation()} data-testid={`input-rename-playlist-${playlist.id}`} />
        : <span className="playlist-name">{playlist.name}</span>}
      <span className="playlist-count">{playlist.tracks.length}</span>
      <button className="icon-button" onClick={(e) => { e.stopPropagation(); setDraft(playlist.name); setEditing(true); }} aria-label={`Rename ${playlist.name}`} data-testid={`button-rename-playlist-${playlist.id}`}><Pencil size={12} /></button>
      <button className="icon-button" onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label={`Delete ${playlist.name}`} data-testid={`button-delete-playlist-${playlist.id}`}><Trash2 size={12} /></button>
    </div>
  );
}

const MUSIC_TIMER_FIELDS: Array<{ unit: keyof TimerParts; label: string; max: number }> = [
  { unit: 'hours', label: 'hr', max: 23 },
  { unit: 'minutes', label: 'min', max: 59 },
];

function MusicPage(props: MusicPageProps) {
  const {
    playlists, musicViewPlaylistId, setMusicViewPlaylistId,
    activePlaylistId, activeTrackIndex, musicStatus, musicVolume, setMusicVolume,
    musicElapsed, musicDuration, musicShuffle, musicRepeat,
    musicTimerParts, musicTimerEndAt, musicTimerRemaining,
    createPlaylist, deletePlaylist, renamePlaylist, openMusicFilePicker, removeTrack,
    playTrack, pauseMusic, resumeMusic, nextTrack, prevTrack, seekMusic,
    toggleShuffle, cycleRepeat, startMusicTimer, cancelMusicTimer, updateMusicTimerPart,
  } = props;

  const viewPlaylist = playlists.find((p) => p.id === musicViewPlaylistId) ?? playlists[0] ?? null;
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;
  const activeTrack = activePlaylist?.tracks[activeTrackIndex] ?? null;
  const isActive = musicStatus === 'playing' || musicStatus === 'paused';
  const timerRunning = !!musicTimerEndAt;

  return (
    <div className="music-page">
      <section className="page-intro">
        <div className="eyebrow">Your music, any time of day</div>
        <h1>Music player</h1>
        <p>Add playlists, drop in MP3 or WAV files, and listen. Music pauses automatically when a night session begins.</p>
      </section>

      <div className="music-layout">
        {/* ── Playlists sidebar ──────────────────────────────────────────── */}
        <aside className="playlists-panel">
          <div className="playlists-panel-head">
            <span className="eyebrow">Playlists</span>
            <button className="icon-button" onClick={createPlaylist} aria-label="New playlist" data-testid="button-new-playlist"><Plus size={15} /></button>
          </div>
          {playlists.length === 0
            ? <div className="music-empty" style={{ padding: '28px 0' }}><ListMusic size={20} /><p>No playlists yet.<br />Create one to get started.</p></div>
            : playlists.map((pl) => (
              <PlaylistCard key={pl.id} playlist={pl}
                active={pl.id === (viewPlaylist?.id ?? null)}
                nowPlaying={pl.id === activePlaylistId && isActive}
                onSelect={() => setMusicViewPlaylistId(pl.id)}
                onDelete={() => deletePlaylist(pl.id)}
                onRename={renamePlaylist}
              />
            ))
          }
        </aside>

        {/* ── Track list ─────────────────────────────────────────────────── */}
        <div className="tracks-panel">
          {!viewPlaylist
            ? <div className="music-empty"><ListMusic size={24} /><h3>Select a playlist</h3><p>Choose from the list on the left, or create a new one.</p></div>
            : <>
                <div className="tracks-panel-head">
                  <div>
                    <h2>{viewPlaylist.name}</h2>
                    <p className="tracks-count">{viewPlaylist.tracks.length} {viewPlaylist.tracks.length === 1 ? 'track' : 'tracks'}</p>
                  </div>
                  <button className="secondary-button" onClick={() => openMusicFilePicker(viewPlaylist.id)} data-testid={`button-add-tracks-${viewPlaylist.id}`}><Upload size={13} /> Add tracks</button>
                </div>
                {viewPlaylist.tracks.length === 0
                  ? <div className="music-empty" style={{ padding: '40px 0' }}>
                      <Upload size={20} /><h3>No tracks yet</h3>
                      <p>Add MP3 or WAV files to start listening.</p>
                      <button className="primary-button" onClick={() => openMusicFilePicker(viewPlaylist.id)}><Upload size={13} /> Add tracks</button>
                    </div>
                  : <div className="track-list">
                      {viewPlaylist.tracks.map((track, index) => {
                        const isPlayingThis = activePlaylistId === viewPlaylist.id && activeTrackIndex === index;
                        return (
                          <div key={track.id} className={`track-row ${isPlayingThis ? 'playing' : ''}`} data-testid={`row-track-${track.id}`}>
                            <span className="track-index">
                              {isPlayingThis && musicStatus === 'playing'
                                ? <span className="track-eq"><i /><i /><i /></span>
                                : index + 1}
                            </span>
                            <button className="track-play-btn" onClick={() => {
                              if (isPlayingThis && musicStatus === 'playing') pauseMusic();
                              else if (isPlayingThis && musicStatus === 'paused') resumeMusic();
                              else playTrack(viewPlaylist.id, index);
                            }} disabled={!track.url && !isPlayingThis} aria-label={isPlayingThis && musicStatus === 'playing' ? `Pause ${track.name}` : `Play ${track.name}`} data-testid={`button-play-track-${track.id}`}>
                              {isPlayingThis && musicStatus === 'playing' ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
                            </button>
                            <span className="track-name" title={track.name}>{track.name.replace(/\.[^.]+$/, '')}</span>
                            <span className="track-size">{track.url ? formatSize(track.size) : <em>Re-add file</em>}</span>
                            <button className="icon-button" onClick={() => removeTrack(viewPlaylist.id, track.id)} aria-label={`Remove ${track.name}`} data-testid={`button-remove-track-${track.id}`}><Trash2 size={13} /></button>
                          </div>
                        );
                      })}
                    </div>
                }
              </>
          }
        </div>
      </div>

      {/* ── Player bar ──────────────────────────────────────────────────── */}
      <div className="music-player-bar">
        <div className="music-player-info">
          {activeTrack
            ? <>
                <span className="music-now-name">{activeTrack.name.replace(/\.[^.]+$/, '')}</span>
                <span className="music-now-playlist">{activePlaylist?.name}</span>
              </>
            : <span className="music-now-name music-idle">Nothing playing</span>
          }
        </div>

        <div className="music-player-center">
          <div className="music-controls">
            <button className="icon-button" onClick={prevTrack} disabled={!isActive} aria-label="Previous / restart"><SkipBack size={16} /></button>
            {musicStatus === 'playing'
              ? <button className="round-button" onClick={pauseMusic} aria-label="Pause" data-testid="button-pause-music"><Pause size={15} fill="currentColor" /></button>
              : <button className="round-button" onClick={resumeMusic} disabled={!activeTrack} aria-label="Play" data-testid="button-play-music"><Play size={15} fill="currentColor" /></button>
            }
            <button className="icon-button" onClick={nextTrack} disabled={!isActive} aria-label="Next track"><SkipForward size={16} /></button>
            <button className={`icon-button music-mode-btn ${musicShuffle ? 'music-mode-on' : ''}`} onClick={toggleShuffle} aria-label="Toggle shuffle" title="Shuffle" data-testid="button-shuffle"><Shuffle size={14} /></button>
            <button className={`icon-button music-mode-btn ${musicRepeat !== 'none' ? 'music-mode-on' : ''}`} onClick={cycleRepeat} aria-label={`Repeat: ${musicRepeat}`} title={`Repeat: ${musicRepeat}`} data-testid="button-repeat">
              {musicRepeat === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}
            </button>
          </div>
          <div className="music-progress">
            <span className="music-time">{formatAudioTime(musicElapsed)}</span>
            <input type="range" className="music-seek" min="0" max={musicDuration || 1} step="0.5"
              value={isActive ? musicElapsed : 0}
              onChange={(e) => seekMusic(Number(e.target.value))}
              disabled={!isActive} aria-label="Seek" />
            <span className="music-time">{formatAudioTime(musicDuration)}</span>
          </div>
        </div>

        <div className="music-player-right">
          <div className="music-volume-row">
            <Volume2 size={13} />
            <input type="range" className="music-vol-slider" min="0" max="100" value={musicVolume}
              onChange={(e) => setMusicVolume(Number(e.target.value))} aria-label="Music volume" />
            <span className="music-vol-label">{musicVolume}%</span>
          </div>
          <div className="music-timer-row">
            <Timer size={13} />
            <span className="music-timer-label">Stop after</span>
            {MUSIC_TIMER_FIELDS.map(({ unit, label, max }) => (
              <label key={unit} className="music-timer-field">
                <input type="number" min="0" max={max} value={musicTimerParts[unit]}
                  onChange={(e) => updateMusicTimerPart(unit, Number(e.target.value))}
                  disabled={timerRunning} aria-label={`Timer ${label}`} />
                <span>{label}</span>
              </label>
            ))}
            {timerRunning
              ? <>
                  <span className="music-timer-remaining">{formatAudioTime(musicTimerRemaining / 1000)}</span>
                  <button className="quiet-button" onClick={cancelMusicTimer} data-testid="button-cancel-music-timer">Cancel</button>
                </>
              : <button className="quiet-button" onClick={startMusicTimer} data-testid="button-start-music-timer">Start</button>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SettingsPage
// ─────────────────────────────────────────────────────────────────────────────

function SettingsPage({ volume, setVolume, fileCount, groupCount, nightShowDate, setNightShowDate, nightShowSeconds, setNightShowSeconds, nightHour12, setNightHour12, nightShowAmPm, setNightShowAmPm, nightClockFont, setNightClockFont, nightDimEnabled, setNightDimEnabled, nightDimDelaySecs, setNightDimDelaySecs, nightDimColor, setNightDimColor, nightDimShowClock, setNightDimShowClock, nightDimShowDate: nightDimShowDatePref, setNightDimShowDate, nightDimShowSeconds, setNightDimShowSeconds, nightDimShowAmPm: nightDimShowAmPmPref, setNightDimShowAmPm, nightDimBrightness, setNightDimBrightness, clockDisplayEnabled, setClockDisplayEnabled, clockDisplayDelaySecs, setClockDisplayDelaySecs, clockDisplayColor, setClockDisplayColor, clockDisplayFont, setClockDisplayFont, clockDisplayShowDate, setClockDisplayShowDate, clockDisplayShowSeconds, setClockDisplayShowSeconds, clockDisplayHour12, setClockDisplayHour12, clockDisplayShowAmPm: clockDisplayShowAmPmPref, setClockDisplayShowAmPm, onResetPrefs, alarmSoundName, alarmOnTimer, setAlarmOnTimer, alarmOnAlarm, setAlarmOnAlarm, alarmPulseOnTimer, setAlarmPulseOnTimer, alarmPulseOnAlarm, setAlarmPulseOnAlarm, alarmSnoozeMins, setAlarmSnoozeMins, alarmVolume, setAlarmVolume, alarmSnoozeResumeAudio, setAlarmSnoozeResumeAudio, alarmTesting, onTestAlarm, onStopTestAlarm, onPickAlarmSound, onClearAlarmSound }: { volume: number; setVolume: (value: number) => void; fileCount: number; groupCount: number; nightShowDate: boolean; setNightShowDate: (v: boolean) => void; nightShowSeconds: boolean; setNightShowSeconds: (v: boolean) => void; nightHour12: boolean; setNightHour12: (v: boolean) => void; nightShowAmPm: boolean; setNightShowAmPm: (v: boolean) => void; nightClockFont: string; setNightClockFont: (v: string) => void; nightDimEnabled: boolean; setNightDimEnabled: (v: boolean) => void; nightDimDelaySecs: number; setNightDimDelaySecs: (v: number) => void; nightDimColor: string; setNightDimColor: (v: string) => void; nightDimShowClock: boolean; setNightDimShowClock: (v: boolean) => void; nightDimShowDate: boolean; setNightDimShowDate: (v: boolean) => void; nightDimShowSeconds: boolean; setNightDimShowSeconds: (v: boolean) => void; nightDimShowAmPm: boolean; setNightDimShowAmPm: (v: boolean) => void; nightDimBrightness: number; setNightDimBrightness: (v: number) => void; clockDisplayEnabled: boolean; setClockDisplayEnabled: (v: boolean) => void; clockDisplayDelaySecs: number; setClockDisplayDelaySecs: (v: number) => void; clockDisplayColor: string; setClockDisplayColor: (v: string) => void; clockDisplayFont: string; setClockDisplayFont: (v: string) => void; clockDisplayShowDate: boolean; setClockDisplayShowDate: (v: boolean) => void; clockDisplayShowSeconds: boolean; setClockDisplayShowSeconds: (v: boolean) => void; clockDisplayHour12: boolean; setClockDisplayHour12: (v: boolean) => void; clockDisplayShowAmPm: boolean; setClockDisplayShowAmPm: (v: boolean) => void; onResetPrefs: () => void; alarmSoundName: string; alarmOnTimer: boolean; setAlarmOnTimer: (v: boolean) => void; alarmOnAlarm: boolean; setAlarmOnAlarm: (v: boolean) => void; alarmPulseOnTimer: boolean; setAlarmPulseOnTimer: (v: boolean) => void; alarmPulseOnAlarm: boolean; setAlarmPulseOnAlarm: (v: boolean) => void; alarmSnoozeMins: number; setAlarmSnoozeMins: (v: number) => void; alarmVolume: number; setAlarmVolume: (v: number) => void; alarmSnoozeResumeAudio: boolean; setAlarmSnoozeResumeAudio: (v: boolean) => void; alarmTesting: boolean; onTestAlarm: () => void; onStopTestAlarm: () => void; onPickAlarmSound: () => void; onClearAlarmSound: () => void }) {
  const dimDelayMins = Math.floor(nightDimDelaySecs / 60);
  const dimDelaySecs = nightDimDelaySecs % 60;
  const clockDisplayDelayHours = Math.floor(clockDisplayDelaySecs / 3600);
  const clockDisplayDelayMins = Math.floor((clockDisplayDelaySecs % 3600) / 60);
  const clockDisplayDelaySecsPart = clockDisplayDelaySecs % 60;
  const [confirmReset, setConfirmReset] = useState(false);

  const handleConfirmReset = () => {
    onResetPrefs();
    setConfirmReset(false);
  };

  return (
    <div className="settings-layout">
      {confirmReset && (
        <div className="prefs-reset-overlay" role="dialog" aria-modal="true" aria-label="Confirm reset preferences">
          <div className="prefs-reset-dialog">
            <p>Are you sure you would like to reset your preferences?</p>
            <div className="prefs-reset-actions">
              <button className="prefs-reset-yes" onClick={handleConfirmReset} data-testid="button-confirm-reset-prefs">Yes</button>
              <button className="prefs-reset-no" onClick={() => setConfirmReset(false)} data-testid="button-cancel-reset-prefs">No</button>
            </div>
          </div>
        </div>
      )}
      <div className="settings-heading">
        <div className="eyebrow">The quiet details</div>
        <h1>Preferences</h1>
        <p>A few gentle defaults for the way your room behaves. These settings live locally with your library.</p>
      </div>
      <div>
        <div className="settings-section"><div><h3>Default session volume</h3><p>Applied to the next sound you play.</p></div><div className="settings-value">{volume}% <input type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Default session volume" data-testid="input-default-volume" /></div></div>
        <div className="settings-section settings-section-block"><div><h3>Night display</h3><p>Choose what the clock shows during a session.</p></div><div className="settings-toggles"><label className="settings-toggle"><input type="checkbox" checked={nightShowDate} onChange={(e) => setNightShowDate(e.target.checked)} data-testid="toggle-night-show-date" /><span>Show date</span></label><label className="settings-toggle"><input type="checkbox" checked={nightShowSeconds} onChange={(e) => setNightShowSeconds(e.target.checked)} data-testid="toggle-night-show-seconds" /><span>Show seconds</span></label><div className="clock-format-row"><span className="settings-toggle-label">Clock format</span><div className="clock-format-group" role="group" aria-label="Clock format"><label className={`clock-format-opt ${nightHour12 ? 'selected' : ''}`}><input type="radio" name="night-clock-format" checked={nightHour12} onChange={() => setNightHour12(true)} data-testid="radio-night-12h" /><span>12h</span></label><label className={`clock-format-opt ${!nightHour12 ? 'selected' : ''}`}><input type="radio" name="night-clock-format" checked={!nightHour12} onChange={() => setNightHour12(false)} data-testid="radio-night-24h" /><span>24h</span></label></div></div>{nightHour12 && <label className="settings-toggle settings-toggle-sub"><input type="checkbox" checked={nightShowAmPm} onChange={(e) => setNightShowAmPm(e.target.checked)} data-testid="toggle-night-show-ampm" /><span>Show AM / PM</span></label>}</div><div className="clock-format-row" style={{marginTop:8}}><span className="settings-toggle-label">Clock font</span><select className="night-font-select settings-font-select" value={nightClockFont} onChange={(e) => setNightClockFont(e.target.value)} aria-label="Clock font" data-testid="select-clock-font-settings">{CLOCK_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
          <div className="dim-settings">
            <div className="dim-settings-head">
              <label className="settings-toggle"><input type="checkbox" checked={nightDimEnabled} onChange={(e) => setNightDimEnabled(e.target.checked)} data-testid="toggle-dim-enabled" /><span>Dim display after idle</span></label>
            </div>
            {nightDimEnabled && (<>
              <div className="dim-delay-row">
                <span className="settings-toggle-label">Dim after</span>
                <label className="alarm-snooze-field">
                  <input className="alarm-snooze-input" type="number" min={0} max={59} value={dimDelayMins} onChange={(e) => setNightDimDelaySecs(Math.max(5, Number(e.target.value) * 60 + dimDelaySecs))} aria-label="Dim delay minutes" data-testid="input-dim-mins" />
                  <span className="alarm-snooze-unit">min</span>
                </label>
                <label className="alarm-snooze-field">
                  <input className="alarm-snooze-input" type="number" min={0} max={59} value={dimDelaySecs} onChange={(e) => { const s = Number(e.target.value); setNightDimDelaySecs(Math.max(5, dimDelayMins * 60 + s)); }} aria-label="Dim delay seconds" data-testid="input-dim-secs" />
                  <span className="alarm-snooze-unit">sec</span>
                </label>
              </div>
              <div className="dim-color-row">
                <span className="settings-toggle-label">Dim text color</span>
                <div className="night-panel-colors">
                  {NIGHT_TEXT_COLORS.map((color) => (
                    <button key={color} className={`night-panel-swatch ${nightDimColor === color ? 'selected' : ''}`} style={{ background: color, border: `2px solid ${nightDimColor === color ? 'var(--primary)' : 'rgba(255,255,255,0.12)'}` }} onClick={() => setNightDimColor(color)} aria-label={`Dim text color ${color}`} aria-pressed={nightDimColor === color} data-testid={`button-dim-color-${color.replace('#', '')}`}>
                      {nightDimColor === color && <Check size={11} color="#1b1823" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dim-display-row">
                <span className="settings-toggle-label">When dimmed</span>
                <div className="dim-color-row" style={{marginTop:2}}>
                <span className="settings-toggle-label">Dim brightness</span>
                <input type="range" min="0" max="100" value={nightDimBrightness} onChange={(e) => setNightDimBrightness(Number(e.target.value))} className="alarm-volume-slider" aria-label="Dim brightness" data-testid="input-dim-brightness" />
                <span className="alarm-snooze-unit">{nightDimBrightness}%</span>
              </div>
              <div className="dim-display-toggles">
                  <label className="settings-toggle"><input type="checkbox" checked={nightDimShowClock} onChange={(e) => setNightDimShowClock(e.target.checked)} data-testid="toggle-dim-show-clock" /><span>Show clock</span></label>
                  <label className="settings-toggle"><input type="checkbox" checked={nightDimShowDatePref} onChange={(e) => setNightDimShowDate(e.target.checked)} data-testid="toggle-dim-show-date" /><span>Show date</span></label>
                  <label className="settings-toggle"><input type="checkbox" checked={nightDimShowSeconds} onChange={(e) => setNightDimShowSeconds(e.target.checked)} data-testid="toggle-dim-show-seconds" /><span>Show seconds</span></label>
                  {nightHour12 && <label className="settings-toggle"><input type="checkbox" checked={nightDimShowAmPmPref} onChange={(e) => setNightDimShowAmPm(e.target.checked)} data-testid="toggle-dim-show-ampm" /><span>Show AM/PM</span></label>}
                </div>
              </div>
              <p className="dim-hint">Move the mouse, tap, or click to wake the display. An active alarm also wakes it.</p>
            </>)}
          </div>
        </div>
        <div className="settings-section settings-section-block">
          <div><h3>Clock display</h3><p>Shows a full-screen clock when idle on the home page. Tap the top half of the screen or press "Go to Home" to return. Music controls appear automatically when music is playing.</p></div>
          <div>
            <label className="settings-toggle"><input type="checkbox" checked={clockDisplayEnabled} onChange={(e) => setClockDisplayEnabled(e.target.checked)} data-testid="toggle-clock-display-enabled" /><span>Enable clock display</span></label>
            {clockDisplayEnabled && (<>
              <div className="dim-delay-row" style={{marginTop:10}}>
                <span className="settings-toggle-label">Show after</span>
                <label className="alarm-snooze-field">
                  <input className="alarm-snooze-input" type="number" min={0} max={23} value={clockDisplayDelayHours} onChange={(e) => setClockDisplayDelaySecs(Math.max(30, Number(e.target.value) * 3600 + clockDisplayDelayMins * 60 + clockDisplayDelaySecsPart))} aria-label="Hours" data-testid="input-clock-display-hrs" />
                  <span className="alarm-snooze-unit">hr</span>
                </label>
                <label className="alarm-snooze-field">
                  <input className="alarm-snooze-input" type="number" min={0} max={59} value={clockDisplayDelayMins} onChange={(e) => setClockDisplayDelaySecs(Math.max(30, clockDisplayDelayHours * 3600 + Number(e.target.value) * 60 + clockDisplayDelaySecsPart))} aria-label="Minutes" data-testid="input-clock-display-mins" />
                  <span className="alarm-snooze-unit">min</span>
                </label>
                <label className="alarm-snooze-field">
                  <input className="alarm-snooze-input" type="number" min={0} max={59} value={clockDisplayDelaySecsPart} onChange={(e) => setClockDisplayDelaySecs(Math.max(30, clockDisplayDelayHours * 3600 + clockDisplayDelayMins * 60 + Number(e.target.value)))} aria-label="Seconds" data-testid="input-clock-display-secs" />
                  <span className="alarm-snooze-unit">sec</span>
                </label>
              </div>
              <div className="dim-color-row">
                <span className="settings-toggle-label">Clock color</span>
                <div className="night-panel-colors">
                  {CLOCK_DISPLAY_COLORS.map((color) => (
                    <button key={color} className={`night-panel-swatch ${clockDisplayColor === color ? 'selected' : ''}`} style={{ background: color, border: `2px solid ${clockDisplayColor === color ? 'var(--primary)' : 'rgba(255,255,255,0.12)'}` }} onClick={() => setClockDisplayColor(color)} aria-label={`Clock color ${color}`} aria-pressed={clockDisplayColor === color} data-testid={`button-clock-color-${color.replace('#', '')}`}>
                      {clockDisplayColor === color && <Check size={11} color="#1b1823" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dim-display-toggles" style={{marginTop:6}}>
                <label className="settings-toggle"><input type="checkbox" checked={clockDisplayShowDate} onChange={(e) => setClockDisplayShowDate(e.target.checked)} data-testid="toggle-clock-display-date" /><span>Show date</span></label>
                <label className="settings-toggle"><input type="checkbox" checked={clockDisplayShowSeconds} onChange={(e) => setClockDisplayShowSeconds(e.target.checked)} data-testid="toggle-clock-display-seconds" /><span>Show seconds</span></label>
                <div className="clock-format-row"><span className="settings-toggle-label">Clock format</span><div className="clock-format-group" role="group" aria-label="Clock format"><label className={`clock-format-opt ${clockDisplayHour12 ? 'selected' : ''}`}><input type="radio" name="clock-display-format" checked={clockDisplayHour12} onChange={() => setClockDisplayHour12(true)} data-testid="radio-clock-display-12h" /><span>12h</span></label><label className={`clock-format-opt ${!clockDisplayHour12 ? 'selected' : ''}`}><input type="radio" name="clock-display-format" checked={!clockDisplayHour12} onChange={() => setClockDisplayHour12(false)} data-testid="radio-clock-display-24h" /><span>24h</span></label></div></div>
                {clockDisplayHour12 && <label className="settings-toggle settings-toggle-sub"><input type="checkbox" checked={clockDisplayShowAmPmPref} onChange={(e) => setClockDisplayShowAmPm(e.target.checked)} data-testid="toggle-clock-display-ampm" /><span>Show AM / PM</span></label>}
                <div className="clock-format-row" style={{marginTop:4}}><span className="settings-toggle-label">Clock font</span><select className="night-font-select settings-font-select" value={clockDisplayFont} onChange={(e) => setClockDisplayFont(e.target.value)} aria-label="Clock display font" data-testid="select-clock-display-font">{CLOCK_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
              </div>
            </>)}
          </div>
        </div>
        <div className="settings-section settings-section-block">
          <div><h3>Session end alarm</h3><p>Play a sound when the session ends automatically. Upload any audio file — a gentle chime, tone, or any sound you like.</p></div>
          <div className="alarm-sound-config">
            <div className="alarm-sound-file-row">
              {alarmSoundName
                ? <><span className="alarm-sound-name" title={alarmSoundName}>{alarmSoundName}</span><button className="alarm-sound-remove" onClick={onClearAlarmSound} aria-label="Remove alarm sound" data-testid="button-clear-alarm-sound">Remove</button></>
                : <span className="alarm-sound-none">No file chosen</span>}
              <button className="alarm-sound-pick" onClick={onPickAlarmSound} data-testid="button-pick-alarm-sound">{alarmSoundName ? 'Change' : 'Choose file'}</button>
            </div>
            {alarmSoundName && (
              <div className="alarm-volume-row">
                <span className="alarm-snooze-label">Alarm volume</span>
                <input type="range" min="0" max="100" value={alarmVolume} onChange={(e) => setAlarmVolume(Number(e.target.value))} className="alarm-volume-slider" aria-label="Alarm volume" data-testid="input-alarm-volume" />
                <span className="alarm-snooze-unit">{alarmVolume}%</span>
                <button
                  className={`alarm-test-btn ${alarmTesting ? 'testing' : ''}`}
                  onClick={alarmTesting ? onStopTestAlarm : onTestAlarm}
                  aria-label={alarmTesting ? 'Stop alarm test' : 'Test alarm sound'}
                  data-testid="button-test-alarm"
                >{alarmTesting ? 'Stop test' : 'Test'}</button>
              </div>
            )}
            <label className="settings-toggle alarm-toggle">
              <input type="checkbox" checked={alarmOnTimer} onChange={(e) => setAlarmOnTimer(e.target.checked)} data-testid="toggle-alarm-on-timer" />
              <span>Play when timer ends</span>
            </label>
            <label className="settings-toggle alarm-toggle alarm-toggle-sub">
              <input type="checkbox" checked={alarmPulseOnTimer} onChange={(e) => setAlarmPulseOnTimer(e.target.checked)} data-testid="toggle-alarm-pulse-on-timer" />
              <span>Pulse background when timer ends</span>
            </label>
            <label className="settings-toggle alarm-toggle">
              <input type="checkbox" checked={alarmOnAlarm} onChange={(e) => setAlarmOnAlarm(e.target.checked)} data-testid="toggle-alarm-on-alarm" />
              <span>Play when alarm clock fires</span>
            </label>
            <label className="settings-toggle alarm-toggle alarm-toggle-sub">
              <input type="checkbox" checked={alarmPulseOnAlarm} onChange={(e) => setAlarmPulseOnAlarm(e.target.checked)} data-testid="toggle-alarm-pulse-on-alarm" />
              <span>Pulse background when alarm fires</span>
            </label>
            <label className="settings-toggle alarm-toggle">
              <input type="checkbox" checked={alarmSnoozeResumeAudio} onChange={(e) => setAlarmSnoozeResumeAudio(e.target.checked)} data-testid="toggle-alarm-snooze-resume" />
              <span>Resume sounds during snooze</span>
            </label>
            <div className="alarm-snooze-row">
              <span className="alarm-snooze-label">Snooze duration</span>
              <input
                className="alarm-snooze-input"
                type="number"
                min={1}
                max={999}
                value={alarmSnoozeMins}
                onChange={(e) => setAlarmSnoozeMins(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
                aria-label="Snooze duration in minutes"
                data-testid="input-snooze-mins"
              />
              <span className="alarm-snooze-unit">min</span>
            </div>
          </div>
        </div>
        <div className="settings-section"><div><h3>Local library</h3><p>Audio metadata currently held in the app.</p></div><div className="settings-value">{fileCount} sounds · {groupCount} groups</div></div>
        <div className="settings-section"><div><h3>Storage &amp; privacy</h3><p>No account, server, or cloud sync. Audio files stay on your device.</p></div><LockKeyhole size={18} color="hsl(var(--primary))" /></div>
        <div className="settings-section"><div><h3>About this space</h3><p>Night Sound Machine is a small local-first room for the sounds that help you soften into sleep.</p></div><Moon size={19} color="hsl(var(--accent))" /></div>
        <div className="settings-section"><div><h3>Version</h3><p>What's currently running in the app.</p></div><div className="settings-value settings-version">{__APP_VERSION__}<a href="https://github.com/malpal1350-cyber/Night-Machine/releases" target="_blank" rel="noopener noreferrer" className="settings-version-link" aria-label="View releases on GitHub" title="Check for updates on GitHub"><ExternalLink size={13} /></a></div></div>
        <div className="settings-section settings-section-reset">
          <div><h3>Reset to defaults</h3><p>Restores clock, display, and volume settings. Your audio files and groups are not affected.</p></div>
          <button className="prefs-reset-btn" onClick={() => setConfirmReset(true)} data-testid="button-open-reset-prefs">Reset to defaults</button>
        </div>
      </div>
    </div>
  );
}

export default App;
