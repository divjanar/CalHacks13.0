import { ConvexError, v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type DatabaseContext = QueryCtx | MutationCtx;

function normalizeName(value: string) {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function cleanName(value: string) {
  const cleaned = value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");

  if (!cleaned || cleaned.length > 80) {
    throw new ConvexError(
      "Legal names must contain between 1 and 80 characters."
    );
  }

  return cleaned;
}

export async function requireUniversityIdentity(
  ctx: DatabaseContext
) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new ConvexError("Please sign in first.");
  }

  const email = identity.email?.trim().toLowerCase();

  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.edu$/.test(email) ||
    identity.emailVerified !== true
  ) {
    throw new ConvexError(
      "A verified university .edu email is required."
    );
  }

  return {
    tokenIdentifier: identity.tokenIdentifier,
    email,
  };
}

async function getPassedCheck(
  ctx: DatabaseContext,
  tokenIdentifier: string,
  email: string
) {
  const check = await ctx.db
    .query("ageChecks")
    .withIndex("by_tokenIdentifier", q =>
      q.eq("tokenIdentifier", tokenIdentifier)
    )
    .unique();

  if (
    !check ||
    check.universityEmail !== email ||
    check.method !== "prototype_dob" ||
    check.nameCheckVersion !== "name-match-v1" ||
    !check.legalFirstName?.trim() ||
    !check.legalLastName?.trim()
  ) {
    return null;
  }

  return check;
}

// Keep the existing function name for accounts.ts compatibility.
// A DOB-only record no longer qualifies.
export async function hasPassedAgeCheck(
  ctx: DatabaseContext,
  tokenIdentifier: string,
  email: string
) {
  return Boolean(
    await getPassedCheck(ctx, tokenIdentifier, email)
  );
}

export async function requireVerifiedSetup(
  ctx: DatabaseContext
) {
  const identity = await requireUniversityIdentity(ctx);

  const check = await getPassedCheck(
    ctx,
    identity.tokenIdentifier,
    identity.email
  );

  if (!check) {
    throw new ConvexError(
      "Complete the name and DOB checks before continuing."
    );
  }

  return {
    ...identity,
    legalFirstName: check.legalFirstName!,
    legalLastName: check.legalLastName!,
  };
}

// Express uses this query with the user's authentication token.
// Users do not supply their identity in an upload field.
export const getContext = query({
  args: {},
  handler: async ctx => {
    return await requireUniversityIdentity(ctx);
  },
});

// Only callable by trusted Convex backend functions.
// Express must call the protected HTTP callback.
export const recordPassed = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    email: v.string(),
    legalFirstName: v.string(),
    legalLastName: v.string(),
  },
  handler: async (ctx, args) => {
    const legalFirstName = cleanName(args.legalFirstName);
    const legalLastName = cleanName(args.legalLastName);
    const email = args.email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.edu$/.test(email)) {
      throw new ConvexError(
        "A university email is required."
      );
    }

    // Prevent a new check from silently changing the legal name
    // of an existing profile.
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", q =>
        q.eq("tokenIdentifier", args.tokenIdentifier)
      )
      .unique();

    if (
      (
        profile?.firstName?.trim() &&
        normalizeName(profile.firstName) !==
          normalizeName(legalFirstName)
      ) ||
      (
        profile?.lastName?.trim() &&
        normalizeName(profile.lastName) !==
          normalizeName(legalLastName)
      )
    ) {
      throw new ConvexError(
        "The checked legal name differs from the saved account name. Account review is required."
      );
    }

    const existing = await ctx.db
      .query("ageChecks")
      .withIndex("by_tokenIdentifier", q =>
        q.eq("tokenIdentifier", args.tokenIdentifier)
      )
      .unique();

    const fields = {
      universityEmail: email,
      method: "prototype_dob" as const,
      checkedAt: Date.now(),
      legalFirstName,
      legalLastName,
      nameCheckVersion: "name-match-v1" as const,
    };

    if (existing) {
      await ctx.db.patch(
        "ageChecks",
        existing._id,
        fields
      );
    } else {
      await ctx.db.insert("ageChecks", {
        tokenIdentifier: args.tokenIdentifier,
        ...fields,
      });
    }

    return null;
  },
});