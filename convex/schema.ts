import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Saved prototype document checks.
  // No image, date of birth, or document number is stored.
  // This does not establish verified identity.
  ageChecks: defineTable({
    tokenIdentifier: v.string(),
    universityEmail: v.string(),
    method: v.literal("prototype_dob"),
    checkedAt: v.number(),

    // Entered legal name accepted by the backend comparison.
    // Optional to preserve existing DOB-only records.
    legalFirstName: v.optional(v.string()),
    legalLastName: v.optional(v.string()),

    // Written after both name and DOB checks pass.
    nameCheckVersion: v.optional(
      v.literal("name-match-v1")
    ),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),

  // Account details owned by an authenticated user.
  profiles: defineTable({
    tokenIdentifier: v.string(),
    displayName: v.string(),
    universityEmail: v.optional(v.string()),

    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    preferredFirstName: v.optional(v.string()),
    localArea: v.optional(v.string()),

    // Required acknowledgments and optional marketing.
    communityAcceptedAt: v.optional(v.number()),
    termsAcceptedAt: v.optional(v.number()),
    privacyAcceptedAt: v.optional(v.number()),
    consentVersion: v.optional(v.string()),
    marketing: v.optional(v.boolean()),

    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),

  // Private dietary answers.
  diningPreferences: defineTable({
    profileId: v.id("profiles"),
    diet: v.string(),
    allergies: v.array(v.string()),
    allergiesAnswered: v.boolean(),
    religiousDetails: v.string(),
    updatedAt: v.number(),
  }).index("by_profileId", ["profileId"]),

  // Restaurant information shared by dinner events.
  restaurants: defineTable({
    venueId: v.string(),
    name: v.string(),
    address: v.string(),
    area: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    googleMapsUri: v.optional(v.string()),
    menuUrl: v.optional(v.string()),
  }).index("by_venueId", ["venueId"]),

  // A scheduled Table 8 dinner.
  dinners: defineTable({
    slug: v.string(),
    restaurantId: v.id("restaurants"),
    title: v.string(),
    cuisine: v.string(),

    // Unix timestamps in milliseconds.
    startsAt: v.number(),
    endsAt: v.number(),
    timeZone: v.string(),

    // Reservation mutations must enforce capacity.
    capacity: v.number(),

    // Store money as integer cents.
    minPriceCents: v.optional(v.number()),
    maxPriceCents: v.optional(v.number()),
    currency: v.string(),

    status: v.union(
      v.literal("open"),
      v.literal("full"),
      v.literal("cancelled"),
      v.literal("completed")
    ),

    isSample: v.boolean(),
  })
    .index("by_slug", ["slug"])
    .index("by_status_and_startsAt", [
      "status",
      "startsAt",
    ])
    .index("by_restaurantId_and_startsAt", [
      "restaurantId",
      "startsAt",
    ]),

  // Reservation mutations must enforce eligibility,
  // ownership, capacity, and duplicate prevention.
  reservations: defineTable({
    profileId: v.id("profiles"),
    dinnerId: v.id("dinners"),

    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("cancelled")
    ),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_profileId_and_dinnerId", [
      "profileId",
      "dinnerId",
    ])
    .index("by_dinnerId_and_status", [
      "dinnerId",
      "status",
    ])
    .index("by_profileId_and_status", [
      "profileId",
      "status",
    ]),
});