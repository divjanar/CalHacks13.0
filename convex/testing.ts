import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const seedTable = internalMutation({
  args: {
    slug: v.string(),
    count: v.number(),
  },

  handler: async (ctx, args) => {
    // Enable this only in your development deployment.
    if (process.env.ENABLE_TEST_USERS !== "true") {
      throw new ConvexError(
        "Test users are disabled in this deployment."
      );
    }

    if (
      !Number.isInteger(args.count) ||
      args.count < 0 ||
      args.count > 7
    ) {
      throw new ConvexError(
        "Choose between 0 and 7 simulated users."
      );
    }

    const dinner = await ctx.db
      .query("dinners")
      .withIndex("by_slug", (q) =>
        q.eq("slug", args.slug)
      )
      .unique();

    if (!dinner || !dinner.isSample) {
      throw new ConvexError(
        "Choose an existing sample table."
      );
    }

    if (
      dinner.capacity !== 8 ||
      !["open", "full"].includes(dinner.status)
    ) {
      throw new ConvexError(
        "Choose an open or full eight-person sample table."
      );
    }

    const now = Date.now();

    // Create or reuse seven clearly labeled fixture profiles.
    // They have no Clerk account or identity verification.
    const testProfiles = [];

    for (let index = 1; index <= 7; index++) {
      const tokenIdentifier =
        `table8-fixture:${dinner._id}:${index}`;

      let profile = await ctx.db
        .query("profiles")
        .withIndex("by_tokenIdentifier", (q) =>
          q.eq("tokenIdentifier", tokenIdentifier)
        )
        .unique();

      if (!profile) {
        const profileId = await ctx.db.insert(
          "profiles",
          {
            tokenIdentifier,
            displayName: `TEST USER ${index}`,
            createdAt: now,
            updatedAt: now,
          }
        );

        profile = await ctx.db.get(
          "profiles",
          profileId
        );
      }

      if (!profile) {
        throw new ConvexError(
          "Unable to create a test profile."
        );
      }

      testProfiles.push(profile);
    }

    // Set the requested number of fixture reservations.
    // Real users' reservations are never cancelled here.
    for (
      let index = 0;
      index < testProfiles.length;
      index++
    ) {
      const profile = testProfiles[index];

      const existing = await ctx.db
        .query("reservations")
        .withIndex(
          "by_profileId_and_dinnerId",
          (q) =>
            q
              .eq("profileId", profile._id)
              .eq("dinnerId", dinner._id)
        )
        .unique();

      const status =
        index < args.count
          ? "pending"
          : "cancelled";

      if (existing) {
        await ctx.db.patch(
          "reservations",
          existing._id,
          {
            status,
            updatedAt: now,
          }
        );
      } else if (index < args.count) {
        await ctx.db.insert("reservations", {
          profileId: profile._id,
          dinnerId: dinner._id,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const pending = await ctx.db
      .query("reservations")
      .withIndex("by_dinnerId_and_status", (q) =>
        q
          .eq("dinnerId", dinner._id)
          .eq("status", "pending")
      )
      .take(9);

    const confirmed = await ctx.db
      .query("reservations")
      .withIndex("by_dinnerId_and_status", (q) =>
        q
          .eq("dinnerId", dinner._id)
          .eq("status", "confirmed")
      )
      .take(9);

    const active = [...pending, ...confirmed];

    if (active.length > 8) {
      // Throwing rolls back every write in this mutation.
      throw new ConvexError(
        "Too many seats. Reduce the simulated user count."
      );
    }

    const status =
      active.length >= 6
        ? "confirmed"
        : "pending";

    for (const reservation of active) {
      if (reservation.status !== status) {
        await ctx.db.patch(
          "reservations",
          reservation._id,
          {
            status,
            updatedAt: now,
          }
        );
      }
    }

    await ctx.db.patch(
      "dinners",
      dinner._id,
      {
        status:
          active.length === 8
            ? "full"
            : "open",
      }
    );

    return {
      simulatedUsers: args.count,
      totalOccupied: active.length,
      availableSeats: 8 - active.length,
      reservationStatus: status,
    };
  },
});