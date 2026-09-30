export const sites = [
  {
    id: 'alhambra',
    name: 'Alhambra',
    locality: 'San Gabriel Valley',
    address: '1839 W Valley Blvd, Alhambra, CA 91803',
    lat: 34.077743494,
    lng: -118.144029238,
    model: '/models/seen-alhambra-planning.json',
    color: '#3a7b66',
    summary: 'The original Seen center',
    detail: 'Day center, clinic, rehabilitation and upstairs team spaces.',
  },
  {
    id: 'olympic',
    name: '1630 Olympic',
    locality: 'Pico-Union · Los Angeles',
    address: '1630 W Olympic Blvd, Los Angeles, CA 90015',
    lat: 34.04945105,
    lng: -118.27526587,
    model: '/models/seen-olympic.json',
    color: '#b38143',
    summary: 'Two floors of coordinated care',
    detail:
      'Day center on Level 1; clinic, rehabilitation and team spaces on Level 2.',
  },
  {
    id: 'alveare',
    name: 'Alveare Terrace',
    locality: 'South Park · Los Angeles',
    address: '145 W 15th St, Los Angeles, CA 90015',
    lat: 34.035150141,
    lng: -118.263314533,
    model: '/models/seen-alveare.json',
    color: '#637ca5',
    summary: 'Care within a residential community',
    detail:
      'Ground-floor Seen space, outdoor garden and shared building access.',
  },
] as const;
export type SiteId = (typeof sites)[number]['id'];
export function miles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const r = Math.PI / 180,
    dlat = (b.lat - a.lat) * r,
    dlng = (b.lng - a.lng) * r;
  return (
    3958.7613 *
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin(dlat / 2) ** 2 +
          Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlng / 2) ** 2,
      ),
    )
  );
}
