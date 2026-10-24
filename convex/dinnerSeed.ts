import { internalMutation } from "./_generated/server";
import venues from "../src/data/sampleVenues.json";

const events = [
  {
    slug: "midweek",
    venueId: "ChIJayGBoiRAjoARzA3Sc9KqN3g",
    title: "A midweek kind of magic",
    cuisine: "American diner",
    area: "Santa Cruz",
    startsAt: "2026-10-21T19:00:00-07:00",
    durationMinutes: 120,
    min: 20,
    max: 30,
  },
  {
    slug: "pasta",
    venueId: "ChIJH8KuM5dqjoARx8-6jvYw8Is",
    title: "Island flavors & new possibilities",
    cuisine: "Island-inspired dining",
    area: "Santa Cruz",
    startsAt: "2026-10-24T18:30:00-07:00",
    durationMinutes: 120,
    min: 20,
    max: 30,
  },
  {
    slug: "sunday",
    venueId: "ChIJrSzz8JlBjoAR4EwBj-WBV4E",
    title: "Pretty good company",
    cuisine: "Vegetarian",
    area: "Santa Cruz",
    startsAt: "2026-10-25T17:00:00-07:00",
    durationMinutes: 90,
    min: 10,
    max: 20,
  },
  {
    slug: "ghirardelli",
    venueId: "ChIJvXl2weCAhYARjSxnhzrBfNc",
    title: "Sweet beginnings by the bay",
    cuisine: "Chocolate & dessert",
    area: "San Francisco",
    startsAt: "2026-10-22T18:00:00-07:00",
    durationMinutes: 90,
    min: null,
    max: null,
  },
  {
    slug: "arsicault",
    venueId: "ChIJ90JImRKBhYARXrwUAyZIhqw",
    title: "Croissants & good conversation",
    cuisine: "French bakery",
    area: "San Francisco",
    startsAt: "2026-10-24T10:00:00-07:00",
    durationMinutes: 90,
    min: 10,
    max: 20,
  },
  {
    slug: "piccino",
    venueId: "ChIJZy35-bl_j4ARBBvSPp-LhIE",
    title: "A little Italy, a new connection",
    cuisine: "Italian & seasonal Californian",
    area: "San Francisco",
    startsAt: "2026-10-23T18:00:00-07:00",
    durationMinutes: 120,
    min: 30,
    max: 80,
  },
  {
    slug: "salt-straw",
    venueId: "ChIJj3EJW6KAhYARB-Dl9_ArzVM",
    title: "A scoop of something new",
    cuisine: "Ice cream & dessert",
    area: "San Francisco",
    startsAt: "2026-10-25T15:00:00-07:00",
    durationMinutes: 60,
    min: null,
    max: null,
  },
];

export const run = internalMutation({
  args: {},
  handler: async ctx => {
    for (const event of events) {
      const venue = venues.find(
        item => item.id === event.venueId
      );

      if (!venue) {
        throw new Error(
          `Missing venue for ${event.slug}.`
        );
      }

      const existingRestaurant = await ctx.db
        .query("restaurants")
        .withIndex("by_venueId", q =>
          q.eq("venueId", event.venueId)
        )
        .unique();

      // Some venue snapshots do not contain a menu URL.
      const menuUrl =
        "menuUrl" in venue &&
        typeof venue.menuUrl === "string"
          ? venue.menuUrl
          : null;

      const restaurantFields = {
        name: venue.displayName.text,
        address: venue.formattedAddress,
        area: event.area,
        latitude: venue.location.latitude,
        longitude: venue.location.longitude,
        ...(venue.googleMapsUri
          ? { googleMapsUri: venue.googleMapsUri }
          : {}),
        ...(menuUrl ? { menuUrl } : {}),
      };

      let restaurantId;

      if (existingRestaurant) {
        restaurantId = existingRestaurant._id;

        await ctx.db.patch(
          "restaurants",
          restaurantId,
          restaurantFields
        );
      } else {
        restaurantId = await ctx.db.insert(
          "restaurants",
          {
            venueId: event.venueId,
            ...restaurantFields,
          }
        );
      }

      const existingDinner = await ctx.db
        .query("dinners")
        .withIndex("by_slug", q =>
          q.eq("slug", event.slug)
        )
        .unique();

      if (existingDinner && !existingDinner.isSample) {
        throw new Error(
          `Refusing to overwrite non-sample dinner ${event.slug}.`
        );
      }

      const startsAt = Date.parse(event.startsAt);

      const fields = {
        restaurantId,
        title: event.title,
        cuisine: event.cuisine,
        startsAt,
        endsAt:
          startsAt + event.durationMinutes * 60 * 1000,
        timeZone: "America/Los_Angeles",
        currency: "USD",
        isSample: true,
        ...(event.min !== null
          ? { minPriceCents: event.min * 100 }
          : {}),
        ...(event.max !== null
          ? { maxPriceCents: event.max * 100 }
          : {}),
      };

      if (existingDinner) {
        // Preserve reservation status and capacity on repeat runs.
        await ctx.db.patch(
          "dinners",
          existingDinner._id,
          fields
        );
      } else {
        await ctx.db.insert("dinners", {
          slug: event.slug,
          ...fields,
          capacity: 8,
          status: "open",
        });
      }
    }

    return { sampleDinners: events.length };
  },
});