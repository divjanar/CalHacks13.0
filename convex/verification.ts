import { ConvexError, v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
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
    !((check.method === "prototype_dob" && check.nameCheckVersion === "name-match-v1") ||
      (process.env.ENABLE_DEMO_VERIFICATION === "true" && check.method === "demo_self_attested" && check.nameCheckVersion === "demo-self-attested-v1")) ||
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
    verificationMethod: check.method,
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

async function savePassedCheck(
  ctx: MutationCtx,
  args: { tokenIdentifier: string; email: string; legalFirstName: string; legalLastName: string },
  method: "prototype_dob" | "demo_self_attested"
) {
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
      method,
      checkedAt: Date.now(),
      legalFirstName,
      legalLastName,
      nameCheckVersion: method === "prototype_dob" ? "name-match-v1" as const : "demo-self-attested-v1" as const,
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
}

// Existing Gemini callback remains internal and keeps its original semantics.
export const recordPassed = internalMutation({
  args: { tokenIdentifier: v.string(), email: v.string(), legalFirstName: v.string(), legalLastName: v.string() },
  returns: v.null(),
  handler: (ctx, args) => savePassedCheck(ctx, args, "prototype_dob"),
});

export const getOptions = query({
  args: {},
  returns: v.object({ demoEnabled: v.boolean() }),
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    return { demoEnabled: Boolean(identity && process.env.ENABLE_DEMO_VERIFICATION === "true") };
  },
});

// Temporary prototype path: self-entered data, not OCR or document verification.
// Identity always comes from Clerk; no user/account ID can be supplied.
export const recordDemo = mutation({
  args: { firstName: v.string(), lastName: v.string(), dateOfBirth: v.string(), acknowledged: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (process.env.ENABLE_DEMO_VERIFICATION !== "true") throw new ConvexError("Temporary demo setup is disabled.");
    const identity = await requireUniversityIdentity(ctx);
    if (!args.acknowledged) throw new ConvexError("Acknowledge that this is demo data, not a document check.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.dateOfBirth)) throw new ConvexError("Enter a valid date of birth.");
    const date = new Date(args.dateOfBirth + "T00:00:00Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== args.dateOfBirth || date.getUTCFullYear() < 1900) throw new ConvexError("Enter a valid date of birth.");
    const today = new Date(Date.now());
    let age = today.getUTCFullYear() - date.getUTCFullYear();
    if (today.getUTCMonth() < date.getUTCMonth() || (today.getUTCMonth() === date.getUTCMonth() && today.getUTCDate() < date.getUTCDate())) age--;
    if (age < 18) throw new ConvexError("The entered date of birth must indicate an age of at least 18.");
    // DOB and images are never stored. A passing Gemini result is never downgraded.
    const existing = await getPassedCheck(ctx, identity.tokenIdentifier, identity.email);
    if (existing?.method === "prototype_dob") return null;
    return await savePassedCheck(ctx, { ...identity, legalFirstName: args.firstName, legalLastName: args.lastName }, "demo_self_attested");
  },
});
