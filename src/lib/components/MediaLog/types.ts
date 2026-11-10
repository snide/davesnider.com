// A media log is a reviewed-things page (movies today, books later): stats,
// charts and a browsable grid over one activity type. The server normalizes
// each type's detail rows into MediaLogItem so the UI never knows the source.

export const MEDIA_LOG_KINDS = ['movies'] as const;
export type MediaLogKind = (typeof MEDIA_LOG_KINDS)[number];

export function isMediaLogKind(value: unknown): value is MediaLogKind {
  return MEDIA_LOG_KINDS.includes(value as MediaLogKind);
}

export type MediaLogItem = {
  id: number; // activity id; also the ?m= deep-link key
  title: string;
  creators: string[]; // directors / authors, one entry per person
  year: number | null; // release / first-publish year
  timestamp: number; // when it was watched / read, unix seconds
  rating: number | null; // 1-5
  review: string | null;
  imageUrl: string | null;
  link: string | null;
};

export type MediaLogResponse = {
  kind: MediaLogKind;
  items: MediaLogItem[];
};

// Wording that differs per kind. Adding a kind means one entry here, one
// mapper in src/lib/server/mediaLog.ts and the name in MEDIA_LOG_KINDS.
export type MediaLogLabels = {
  noun: string;
  nounPlural: string;
  consumed: string; // "watched" / "read"
  creatorPlural: string; // "directors" / "authors"
  dateSort: string; // sort option for the consumed date
  yearSort: string; // sort option for the release year
  linkLabel: string;
};

export const MEDIA_LOG_LABELS: Record<MediaLogKind, MediaLogLabels> = {
  movies: {
    noun: 'movie',
    nounPlural: 'movies',
    consumed: 'watched',
    creatorPlural: 'directors',
    dateSort: 'Watch date',
    yearSort: 'Release date',
    linkLabel: 'IMDB'
  }
};
