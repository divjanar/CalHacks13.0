import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { requireVerifiedSetup } from "./verification";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

type DatabaseContext = QueryCtx | MutationCtx;

async function countOccupied(
  ctx: DatabaseContext,
  dinnerId: Id<"dinners">
) {
  // Tables have a maximum of eight active seats.
  // Reading nine per status also detects excess occupancy.
  const pending = await ctx.db
    .query("reservations")
    .withIndex("by_dinnerId_and_status", q =>
      q.eq("dinnerId", dinnerId).eq("status", "pending")
    )
    .take(9);

  const confirmed = await ctx.db
    .query("reservations")
    .withIndex("by_dinnerId_and_status", q =>
      q.eq("dinnerId", dinnerId).eq("status", "confirmed")
    )
    .take(9);

  return pending.length + confirmed.length;
}

export const getDinner = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const dinner = await ctx.db
      .query("dinners")
      .withIndex("by_slug", q =>
        q.eq("slug", args.slug)
      )
      .unique();

    if (!dinner) return null;

    const restaurant = await ctx.db.get(
      "restaurants",
      dinner.restaurantId
    );

    if (!restaurant) return null;

    const occupied = await countOccupied(ctx, dinner._id);

    let myReservation = null;

    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_tokenIdentifier", q =>
          q.eq("tokenIdentifier", identity.tokenIdentifier)
        )
        .unique();

      if (profile) {
        const reservation = await ctx.db
          .query("reservations")
          .withIndex("by_profileId_and_dinnerId", q =>
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
  args: { slug: v.string() },
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

    const dinner = await ctx.db
      .query("dinners")
      .withIndex("by_slug", q =>
        q.eq("slug", args.slug)
      )
      .unique();

    if (!dinner) {
      throw new ConvexError(
        "This dinner has not been configured."
      );
    }

    // Current identity checks support prototype testing only.
    if (!dinner.isSample) {
      throw new ConvexError(
        "Real dinner reservations are not enabled yet."
      );
    }

    const existing = await ctx.db
      .query("reservations")
      .withIndex("by_profileId_and_dinnerId", q =>
        q
          .eq("profileId", account.profile!._id)
          .eq("dinnerId", dinner._id)
      )
      .unique();

    // Repeated clicks return the existing request.
    if (existing && existing.status !== "cancelled") {
      return existing._id;
    }

    if (dinner.status !== "open") {
      throw new ConvexError(
        "This table is not accepting seat requests."
      );
    }

    if (dinner.capacity !== 8) {
      throw new ConvexError(
        "This table's capacity needs administrator review."
      );
    }

    const occupied = await countOccupied(ctx, dinner._id);

    if (occupied >= dinner.capacity) {
      throw new ConvexError("This table is full.");
    }

    const now = Date.now();

    let reservationId;

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
          profileId: account.profile._id,
          dinnerId: dinner._id,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        }
      );
    }

    if (occupied + 1 >= dinner.capacity) {
      await ctx.db.patch(
        "dinners",
        dinner._id,
        { status: "full" }
      );
    }

    return reservationId;
  },
});

export const listMine = query({
  args: {},
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return { reservations: [], hasMore: false };
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", q =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!profile) {
      return { reservations: [], hasMore: false };
    }

    const pending = await ctx.db
      .query("reservations")
      .withIndex("by_profileId_and_status", q =>
        q.eq("profileId", profile._id).eq("status", "pending")
      )
      .order("desc")
      .take(21);

    const confirmed = await ctx.db
      .query("reservations")
      .withIndex("by_profileId_and_status", q =>
        q.eq("profileId", profile._id).eq("status", "confirmed")
      )
      .order("desc")
      .take(21);

    const selected = [
      ...pending.slice(0, 20),
      ...confirmed.slice(0, 20),
    ].sort((a, b) => b.updatedAt - a.updatedAt);

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
        occupied: await countOccupied(ctx, dinner._id),
      });
    }

    return {
      reservations,
      hasMore: pending.length > 20 || confirmed.length > 20,
    };
  },
});

export const cancel = mutation({
  args: {
    reservationId: v.id("reservations"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new ConvexError("Please sign in first.");
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", q =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
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
      throw new ConvexError("Reservation not found.");
    }

    if (reservation.status === "cancelled") return null;

    await ctx.db.patch(
      "reservations",
      reservation._id,
      {
        status: "cancelled",
        updatedAt: Date.now(),
      }
    );

    const dinner = await ctx.db.get(
      "dinners",
      reservation.dinnerId
    );

    if (dinner?.status === "full") {
      const occupied = await countOccupied(ctx, dinner._id);

      if (occupied < dinner.capacity) {
        await ctx.db.patch(
          "dinners",
          dinner._id,
          { status: "open" }
        );
      }
    }

    return null;
  },
});