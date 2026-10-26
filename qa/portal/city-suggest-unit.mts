// Which cities the LOCATION box suggests, in what order (src/lib/portal/cities.ts, 2026-10-26). Pure functions, no network.
// node --experimental-strip-types qa/portal/city-suggest-unit.mts
import assert from 'node:assert/strict';
import { cityLabel, fromGeocoder, parseTyped, rankSuggestions, type CityRow, type CitySuggestion } from '../../src/lib/portal/cities.ts';

// what Open-Meteo returns (fields as documented: name, admin1, country, country_code, latitude, longitude)
const geo = (name: string, admin1: string, country: string, country_code: string, latitude: number, longitude: number) => fromGeocoder({ name, admin1, country, country_code, latitude, longitude })!;
const SF_CA = geo('San Francisco', 'California', 'United States', 'US', 37.77493, -122.41942);
const SF_PH = geo('San Francisco', 'Caraga', 'Philippines', 'PH', 8.53556, 125.95);
const PDX = geo('Portland', 'Oregon', 'United States', 'US', 45.52345, -122.67621);
const PWM = geo('Portland', 'Maine', 'United States', 'US', 43.66147, -70.25533);
const TOR = geo('Toronto', 'Ontario', 'Canada', 'CA', 43.70011, -79.4163);
const LON = geo('London', 'England', 'United Kingdom', 'GB', 51.50853, -0.12574);
const LON_ON = geo('London', 'Ontario', 'Canada', 'CA', 42.98339, -81.23304);
const listed = (id: number, name: string, region: string, country: string, lat: number, lng: number): CityRow => ({ id, name, region, country, lat, lng });
const LISTED_SF = listed(2, 'San Francisco', 'CA', 'US', 37.7749, -122.4194), LISTED_PDX = listed(25, 'Portland', 'OR', 'US', 45.5152, -122.6784);
const names = (l: CitySuggestion[]) => l.map((s) => `${cityLabel(s)}${s.listed ? ' *' : ''}`);

// parseTyped
assert.deepEqual(parseTyped('Portland, ME'), { name: 'Portland', region: 'ME', isState: true });
assert.deepEqual(parseTyped('portland, maine'), { name: 'portland', region: 'ME', isState: true });
assert.deepEqual(parseTyped('  Toronto , Canada '), { name: 'Toronto', region: 'CANADA', isState: false });
assert.deepEqual(parseTyped('Boise'), { name: 'Boise', region: '', isState: false });
assert.deepEqual(parseTyped(''), { name: '', region: '', isState: false });
console.log('PASS: what they typed: city, then a state (name or code) or a country after the comma');

// fromGeocoder
assert.deepEqual([SF_CA.region, SF_CA.country, SF_CA.detail, SF_CA.listed], ['CA', 'US', 'California, United States', false]);
assert.deepEqual([TOR.region, TOR.country, TOR.detail], ['', 'CA', 'Ontario, Canada'], 'outside the US: no state code, the country code');
assert.equal(fromGeocoder({ name: 'Nowhere' }), null, 'no coordinates: not placeable');
assert.equal(fromGeocoder({ latitude: 1, longitude: 1 }), null, 'no name');
assert.equal(cityLabel(SF_CA), 'San Francisco, CA'); assert.equal(cityLabel(TOR), 'Toronto CA'); assert.equal(cityLabel(LON), 'London GB');
console.log('PASS: a geocoder result becomes a placeable city (US state as its code, plain detail line); incomplete ones are dropped');

// rankSuggestions
assert.deepEqual(names(rankSuggestions([LISTED_SF], [SF_CA, SF_PH], 'San Fr')), ['San Francisco, CA *', 'San Francisco PH'], 'the city already on the map comes first and the geocoder\'s copy of it is dropped');
assert.equal(rankSuggestions([LISTED_SF], [SF_CA], 'San Fr')[0].id, 2, 'picking it reuses the listed row');
assert.deepEqual(names(rankSuggestions([LISTED_PDX], [PDX, PWM], 'Portland, ME')), ['Portland, ME'], 'a typed US state leaves out other states (Portland, OR is not offered)');
assert.deepEqual(names(rankSuggestions([LISTED_PDX], [PDX, PWM], 'Portland, maine')), ['Portland, ME'], 'state written out');
assert.deepEqual(names(rankSuggestions([LISTED_PDX], [PDX, PWM], 'Portland')), ['Portland, OR *', 'Portland, ME'], 'no state: everything, listed first');
assert.deepEqual(names(rankSuggestions([], [LON, LON_ON], 'London, Canada')), ['London CA', 'London GB'], 'a country name puts its city first, keeps the rest');
assert.deepEqual(names(rankSuggestions([], [LON, LON_ON], 'London, Ontario')), ['London CA', 'London GB'], 'a province name too');
assert.deepEqual(names(rankSuggestions([], [LON, LON_ON], 'London, GB')), ['London GB', 'London CA'], 'a country code');
assert.deepEqual(names(rankSuggestions([], [TOR], 'Toronto, CA')), ['Toronto CA'], '"CA" is also Canada\'s code: Toronto, Canada is offered (there is no Toronto in California)');
assert.deepEqual(names(rankSuggestions([], [PDX, PWM], 'Portland, CA')), [], 'but no Portland in California or Canada: nothing rather than a wrong state');
assert.deepEqual(names(rankSuggestions([], [], 'Atlantis')), [], 'nothing found: an empty list (the page says so)');
const many = Array.from({ length: 12 }, (_, i) => geo(`Springfield${i}`, 'Illinois', 'United States', 'US', 39 + i / 10, -89));
assert.equal(rankSuggestions([], many, 'Springfield').length, 6, 'at most 6');
assert.equal(rankSuggestions([], many, 'Springfield', 3).length, 3);
const dupes = [SF_CA, { ...SF_CA, name: 'san francisco ' }];
assert.equal(rankSuggestions([], dupes, 'san f').length, 1, 'the same place spelled with different case or spaces appears once');
console.log('PASS: listed cities first, each place once, a typed state narrows to it, a country or province puts its city first, at most 6');
