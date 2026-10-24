import venues from './sampleVenues.json'

// Venue details are a Google Places snapshot.
// Events and seat counts are fictional.
const dinnerEvents = [
  {
    id: 'midweek',
    venueId: 'ChIJayGBoiRAjoARzA3Sc9KqN3g',
    title: 'A midweek kind of magic',
    date: '2026-10-21',
    time: '7:00 PM',
    endTime: '9:00 PM',
    shortDay: 'Wednesday, Oct 21',
    day: 'Wednesday, October 21',
    area: 'Santa Cruz',
    cuisine: 'American diner',
    price: '$20-30',
    minPrice: 20,
    maxPrice: 30,
    seats: 3,
  },
  {
    id: 'pasta',
    venueId: 'ChIJH8KuM5dqjoARx8-6jvYw8Is',
    title: 'Island flavors & new possibilities',
    date: '2026-10-24',
    time: '6:30 PM',
    endTime: '8:30 PM',
    shortDay: 'Saturday, Oct 24',
    day: 'Saturday, October 24',
    area: 'Santa Cruz',
    cuisine: 'Island-inspired dining',
    price: '$20-30',
    minPrice: 20,
    maxPrice: 30,
    seats: 5,
  },
  {
    id: 'sunday',
    venueId: 'ChIJrSzz8JlBjoAR4EwBj-WBV4E',
    title: 'Pretty good company',
    date: '2026-10-25',
    time: '5:00 PM',
    endTime: '6:30 PM',
    shortDay: 'Sunday, Oct 25',
    day: 'Sunday, October 25',
    area: 'Santa Cruz',
    cuisine: 'Vegetarian',
    price: '$10-20',
    minPrice: 10,
    maxPrice: 20,
    seats: 2,
  },
  {
    id: 'ghirardelli',
    venueId: 'ChIJvXl2weCAhYARjSxnhzrBfNc',
    title: 'Sweet beginnings by the bay',
    date: '2026-10-22',
    time: '6:00 PM',
    endTime: '7:30 PM',
    shortDay: 'Thursday, Oct 22',
    day: 'Thursday, October 22',
    area: 'San Francisco',
    cuisine: 'Chocolate & dessert',
    price: 'Price not provided',
    minPrice: null,
    maxPrice: null,
    seats: 4,
  },
  {
    id: 'arsicault',
    venueId: 'ChIJ90JImRKBhYARXrwUAyZIhqw',
    title: 'Croissants & good conversation',
    date: '2026-10-24',
    time: '10:00 AM',
    endTime: '11:30 AM',
    shortDay: 'Saturday, Oct 24',
    day: 'Saturday, October 24',
    area: 'San Francisco',
    cuisine: 'French bakery',
    price: '$10-20',
    minPrice: 10,
    maxPrice: 20,
    seats: 3,
  },
  {
    id: 'piccino',
    venueId: 'ChIJZy35-bl_j4ARBBvSPp-LhIE',
    title: 'A little Italy, a new connection',
    date: '2026-10-23',
    time: '6:00 PM',
    endTime: '8:00 PM',
    shortDay: 'Friday, Oct 23',
    day: 'Friday, October 23',
    area: 'San Francisco',
    cuisine: 'Italian & seasonal Californian',
    price: '$30-80',
    minPrice: 30,
    maxPrice: 80,
    seats: 5,
  },
  {
    id: 'salt-straw',
    venueId: 'ChIJj3EJW6KAhYARB-Dl9_ArzVM',
    title: 'A scoop of something new',
    date: '2026-10-25',
    time: '3:00 PM',
    endTime: '4:00 PM',
    shortDay: 'Sunday, Oct 25',
    day: 'Sunday, October 25',
    area: 'San Francisco',
    cuisine: 'Ice cream & dessert',
    price: 'Price not provided',
    minPrice: null,
    maxPrice: null,
    seats: 4,
  },
]

const venuesById = new Map(
  venues.map(venue => [venue.id, venue])
)

export const dinners = dinnerEvents.map(dinner => {
  const venue = venuesById.get(dinner.venueId)

  if (!venue) {
    throw new Error(
      `Missing venue "${dinner.venueId}" for dinner "${dinner.id}".`
    )
  }

  return {
    ...dinner,
    restaurant: venue.displayName.text,
    address: venue.formattedAddress,
    latitude: venue.location.latitude,
    longitude: venue.location.longitude,
    googleMapsUri: venue.googleMapsUri,
    websiteUri: venue.websiteUri || null,
    menuUrl: venue.menuUrl || null,
  }
})

// Return the selected dinner, or the first dinner as a fallback.
export function selectedDinner(state) {
  return (
    dinners.find(dinner => dinner.id === state?.dinnerId) ||
    dinners[0]
  )
}