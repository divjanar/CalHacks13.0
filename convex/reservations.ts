import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { requireVerifiedSetup } from "./verification";

import type {
  MutationCtx,
  QueryCtx,
} from "./_generated/server";

import type { Id } from "./_generated/dataModel";

type DatabaseContext = QueryCtx | MutationCtx;

const CONFIRMATION_THRESHOLD = 6;
const TABLE_CAPACITY = 8;

async function getActiveReservations(
  ctx: DatabaseContext,
  dinnerId: Id<"dinners">
) {
  const pending = await ctx.db
    .query("reservations")
    .withIndex("by_dinnerId_and_status", (q) =>
      q
        .eq("dinnerId", dinnerId)
        .eq("status", "pending")
    )
    .take(TABLE_CAPACITY + 1);

  const confirmed = await ctx.db
    .query("reservations")
    .withIndex("by_dinnerId_and_status", (q) =>
      q
        .eq("dinnerId", dinnerId)
        .eq("status", "confirmed")
    )
    .take(TABLE_CAPACITY + 1);

  return [...pending, ...confirmed];
}

async function countOccupied(
  ctx: DatabaseContext,
  dinnerId: Id<"dinners">
) {
  const reservations = await getActiveReservations(
    ctx,
    dinnerId
  );

  return reservations.length;
}

// Call after a join or cancellation, inside the same mutation.
async function synchronizeTable(
  ctx: MutationCtx,
  dinnerId: Id<"dinners">
) {
  const dinner = await ctx.db.get(
    "dinners",
    dinnerId
  );

  if (!dinner) return;

  // Do not change reservations for a closed event.
  if (
    dinner.status === "cancelled" ||
    dinner.status === "completed"
  ) {
    return;
  }

  const active = await getActiveReservations(
    ctx,
    dinnerId
  );

  if (
    dinner.capacity !== TABLE_CAPACITY ||
    active.length > TABLE_CAPACITY
  ) {
    throw new ConvexError(
      "This table's capacity needs administrator review."
    );
  }

  const reservationStatus =
    active.length >= CONFIRMATION_THRESHOLD
      ? "confirmed"
      : "pending";

  const now = Date.now();

  for (const reservation of active) {
    if (reservation.status === reservationStatus) {
      continue;
    }

    await ctx.db.patch(
      "reservations",
      reservation._id,
      {
        status: reservationStatus,
        updatedAt: now,
      }
    );
  }

  // A confirmed group can still accept seats seven and eight.
  const dinnerStatus =
    active.length >= dinner.capacity
      ? "full"
      : "open";

  if (dinner.status !== dinnerStatus) {
    await ctx.db.patch(
      "dinners",
      dinnerId,
      {
        status: dinnerStatus,
      }
    );
  }
}

export const getDinner = query({
  args: {
    slug: v.string(),
  },

  handler: async (ctx, args) => {
    const dinner = await ctx.db
      .query("dinners")
      .withIndex("by_slug", (q) =>
        q.eq("slug", args.slug)
      )
      .unique();

    if (!dinner) return null;

    const restaurant = await ctx.db.get(
      "restaurants",
      dinner.restaurantId
    );

    if (!restaurant) return null;

    const occupied = await countOccupied(
      ctx,
      dinner._id
    );

    let myReservation = null;

    const identity =
      await ctx.auth.getUserIdentity();

    if (identity) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_tokenIdentifier", (q) =>
          q.eq(
            "tokenIdentifier",
            identity.tokenIdentifier
          )
        )
        .unique();

      if (profile) {
        const reservation = await ctx.db
          .query("reservations")
          .withIndex(
            "by_profileId_and_dinnerId",
            (q) =>
              q
                .eq("profileId", profile._id)
                .eq("dinnerId", dinner._id)
          )
          .unique();

        if (
          reservation &&
          reservation.status !== "cancelled"
        ) {
          myReservation = {
            id: reservation._id,
            status: reservation.status,
          };
        }
      }
    }

    return {
      ...dinner,
      restaurant,
      occupied,
      availableSeats: Math.max(
        0,
        dinner.capacity - occupied
      ),
      myReservation,
    };
  },
});

export const join = mutation({
  args: {
    slug: v.string(),
  },

  handler: async (ctx, args) => {
    await requireVerifiedSetup(ctx);

    const account = await ctx.runQuery(
      api.accounts.getMine,
      {}
    );

    if (
      !account?.questionnaireComplete ||
      !account.profile
    ) {
      throw new ConvexError(
        "Complete your account setup before joining a table."
      );
    }

    const profileId = account.profile._id;

    const dinner = await ctx.db
      .query("dinners")
      .withIndex("by_slug", (q) =>
        q.eq("slug", args.slug)
      )
      .unique();

    if (!dinner) {
      throw new ConvexError(
        "This dinner has not been configured."
      );
    }

    // Preserve the existing prototype restriction.
    if (!dinner.isSample) {
      throw new ConvexError(
        "Real dinner reservations are not enabled yet."
      );
    }

    const existing = await ctx.db
      .query("reservations")
      .withIndex(
        "by_profileId_and_dinnerId",
        (q) =>
          q
            .eq("profileId", profileId)
            .eq("dinnerId", dinner._id)
      )
      .unique();

    // Repeated clicks do not create another seat.
    if (
      existing &&
      existing.status !== "cancelled"
    ) {
      await synchronizeTable(ctx, dinner._id);
      return existing._id;
    }

    if (dinner.status !== "open") {
      throw new ConvexError(
        "This table is not accepting seat requests."
      );
    }

    if (dinner.capacity !== TABLE_CAPACITY) {
      throw new ConvexError(
        "This table's capacity needs administrator review."
      );
    }

    const occupied = await countOccupied(
      ctx,
      dinner._id
    );

    if (occupied >= dinner.capacity) {
      throw new ConvexError(
        "This table is full."
      );
    }

    const now = Date.now();

    let reservationId: Id<"reservations">;

    if (existing) {
      reservationId = existing._id;

      await ctx.db.patch(
        "reservations",
        reservationId,
        {
          status: "pending",
          updatedAt: now,
        }
      );
    } else {
      reservationId = await ctx.db.insert(
        "reservations",
        {
          profileId,
          dinnerId: dinner._id,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        }
      );
    }

    // Includes the seat just saved.
    // At six seats, every active reservation is confirmed.
    await synchronizeTable(ctx, dinner._id);

    return reservationId;
  },
});

export const listMine = query({
  args: {},

  handler: async (ctx) => {
    const identity =
      await ctx.auth.getUserIdentity();

    if (!identity) {
      return {
        reservations: [],
        hasMore: false,
      };
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq(
          "tokenIdentifier",
          identity.tokenIdentifier
        )
      )
      .unique();

    if (!profile) {
      return {
        reservations: [],
        hasMore: false,
      };
    }

    const pending = await ctx.db
      .query("reservations")
      .withIndex("by_profileId_and_status", (q) =>
        q
          .eq("profileId", profile._id)
          .eq("status", "pending")
      )
      .order("desc")
      .take(21);

    const confirmed = await ctx.db
      .query("reservations")
      .withIndex("by_profileId_and_status", (q) =>
        q
          .eq("profileId", profile._id)
          .eq("status", "confirmed")
      )
      .order("desc")
      .take(21);

    const selected = [
      ...pending.slice(0, 20),
      ...confirmed.slice(0, 20),
    ].sort(
      (a, b) => b.updatedAt - a.updatedAt
    );

    const reservations = [];

    for (const reservation of selected) {
      const dinner = await ctx.db.get(
        "dinners",
        reservation.dinnerId
      );

      if (!dinner) continue;

      const restaurant = await ctx.db.get(
        "restaurants",
        dinner.restaurantId
      );

      if (!restaurant) continue;

      reservations.push({
        ...reservation,
        dinner,
        restaurant,
        occupied: await countOccupied(
          ctx,
          dinner._id
        ),
      });
    }

    return {
      reservations,
      hasMore:
        pending.length > 20 ||
        confirmed.length > 20,
    };
  },
});

export const cancel = mutation({
  args: {
    reservationId: v.id("reservations"),
  },

  handler: async (ctx, args) => {
    const identity =
      await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new ConvexError(
        "Please sign in first."
      );
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq(
          "tokenIdentifier",
          identity.tokenIdentifier
        )
      )
      .unique();

    const reservation = await ctx.db.get(
      "reservations",
      args.reservationId
    );

    if (
      !profile ||
      !reservation ||
      reservation.profileId !== profile._id
    ) {
      throw new ConvexError(
        "Reservation not found."
      );
    }

    if (reservation.status === "cancelled") {
      return null;
    }

    await ctx.db.patch(
      "reservations",
      reservation._id,
      {
        status: "cancelled",
        updatedAt: Date.now(),
      }
    );

    // Recalculate occupancy and confirmation after cancellation.
    await synchronizeTable(
      ctx,
      reservation.dinnerId
    );

    return null;
  },
});