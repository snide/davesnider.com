import type { SelectActivityFlight } from '$db/schema';

// One leg of a challenge trip: the flight detail row plus the activity fields
// the flight card needs, so the post renders without a second fetch.
export type TripLeg = {
  activityId: number;
  timestamp: number;
  details: SelectActivityFlight;
};

export type TripResponse = {
  trip: string;
  legs: TripLeg[];
};

// Optional decoration a post can pass in: the challenge's goals. A target
// counts as reached when one of a leg's stops matches its name
// (case-insensitive; a leg's `tripStop` may list several, separated by " / ").
// `icon` (and `iconDark` for the dark theme) show in the leg list next to the
// legs that reached the target; `lat`/`lon` let the map draw it when the
// component's `targetsOnMap` is on.
export type TripTarget = {
  name: string;
  aliases?: string[]; // other spellings a stop may use ("Orioles", "A's")
  lat?: number;
  lon?: number;
  icon?: string;
  iconDark?: string;
};
