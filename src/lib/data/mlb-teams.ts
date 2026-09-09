import type { TripTarget } from '$lib/components/FlightTrip/types';

// The 30 MLB clubs as FlightTrip targets for the ballpark challenge. `name`
// must match what is typed into a flight's "stop reached" field
// (case-insensitive; several on one leg are "/"-delimited). Coordinates are
// the ballparks themselves (decoration for the map, not the airports flown
// to). Logos are MLB's own cap marks, one drawn for each site theme, served
// from static/mlb/. Aliases let the stop be typed as just the nickname.
type MlbTeam = TripTarget & { slug: string };

function team(name: string, slug: string, lat: number, lon: number, aliases: string[]): MlbTeam {
  return { name, aliases, slug, lat, lon, icon: `/mlb/${slug}-light.svg`, iconDark: `/mlb/${slug}-dark.svg` };
}

export const mlbTeams: MlbTeam[] = [
  team('Arizona Diamondbacks', 'arizona-diamondbacks', 33.4453, -112.0667, ['Diamondbacks', 'D-backs', 'Dbacks']),
  team('Athletics', 'athletics', 38.5803, -121.5137, [
    "A's",
    'As',
    'Oakland Athletics',
    'Sacramento Athletics',
    'Las Vegas Athletics'
  ]),
  team('Atlanta Braves', 'atlanta-braves', 33.8907, -84.4677, ['Braves']),
  team('Baltimore Orioles', 'baltimore-orioles', 39.2839, -76.6217, ['Orioles', "O's"]),
  team('Boston Red Sox', 'boston-red-sox', 42.3467, -71.0972, ['Red Sox']),
  team('Chicago Cubs', 'chicago-cubs', 41.9484, -87.6553, ['Cubs']),
  team('Chicago White Sox', 'chicago-white-sox', 41.83, -87.6339, ['White Sox']),
  team('Cincinnati Reds', 'cincinnati-reds', 39.0974, -84.5082, ['Reds']),
  team('Cleveland Guardians', 'cleveland-guardians', 41.4962, -81.6852, ['Guardians']),
  team('Colorado Rockies', 'colorado-rockies', 39.7559, -104.9942, ['Rockies']),
  team('Detroit Tigers', 'detroit-tigers', 42.339, -83.0485, ['Tigers']),
  team('Houston Astros', 'houston-astros', 29.7573, -95.3555, ['Astros']),
  team('Kansas City Royals', 'kansas-city-royals', 39.0517, -94.4803, ['Royals']),
  team('Los Angeles Angels', 'los-angeles-angels', 33.8003, -117.8827, ['Angels', 'Anaheim Angels']),
  team('Los Angeles Dodgers', 'los-angeles-dodgers', 34.0739, -118.24, ['Dodgers']),
  team('Miami Marlins', 'miami-marlins', 25.7781, -80.2196, ['Marlins']),
  team('Milwaukee Brewers', 'milwaukee-brewers', 43.028, -87.9712, ['Brewers']),
  team('Minnesota Twins', 'minnesota-twins', 44.9817, -93.2776, ['Twins']),
  team('New York Mets', 'new-york-mets', 40.7571, -73.8458, ['Mets']),
  team('New York Yankees', 'new-york-yankees', 40.8296, -73.9262, ['Yankees']),
  team('Philadelphia Phillies', 'philadelphia-phillies', 39.9061, -75.1665, ['Phillies']),
  team('Pittsburgh Pirates', 'pittsburgh-pirates', 40.4469, -80.0057, ['Pirates']),
  team('San Diego Padres', 'san-diego-padres', 32.7076, -117.157, ['Padres']),
  team('San Francisco Giants', 'san-francisco-giants', 37.7786, -122.3893, ['Giants']),
  team('Seattle Mariners', 'seattle-mariners', 47.5914, -122.3325, ['Mariners']),
  team('St. Louis Cardinals', 'st-louis-cardinals', 38.6226, -90.1928, [
    'Cardinals',
    'St Louis Cardinals',
    'Saint Louis Cardinals'
  ]),
  team('Tampa Bay Rays', 'tampa-bay-rays', 27.7683, -82.6534, ['Rays']),
  team('Texas Rangers', 'texas-rangers', 32.7473, -97.0842, ['Rangers']),
  team('Toronto Blue Jays', 'toronto-blue-jays', 43.6414, -79.3894, ['Blue Jays']),
  team('Washington Nationals', 'washington-nationals', 38.873, -77.0074, ['Nationals', 'Nats'])
];
