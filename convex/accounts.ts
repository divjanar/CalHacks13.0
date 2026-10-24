import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  hasPassedAgeCheck,
  requireVerifiedSetup,
} from "./verification";

const allowedDiets = new Set([
  "No preference",
  "Vegetarian",
  "Vegan",
  "Pescatarian",
  "Hindu non-veg",
  "Hindu veg",
  "Jain",
  "Halal",
  "Kosher",
  "Buddhist",
  "Other",
]);

const allowedAllergens = new Set([
  "Peanuts",
  "Tree nuts",
  "Milk",
  "Eggs",
  "Wheat",
  "Soy",
  "Fish",
  "Shellfish",
  "Sesame",
]);

const CONSENT_VERSION = "table8-prototype-v1";

function normalizeName(value: string) {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function cleanName(value: string, label: string) {
  const cleaned = value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");

  if (!cleaned || cleaned.length > 80) {
    throw new ConvexError(
      `${label} must contain between 1 and 80 characters.`
    );
  }

  return cleaned;
}

function namesMatch(
  firstName: string,
  lastName: string,
  legalFirstName: string,
  legalLastName: string
) {
  return (
    normalizeName(firstName) ===
      normalizeName(legalFirstName) &&
    normalizeName(lastName) ===
      normalizeName(legalLastName)
  );
}

// Return only the authenticated user's account and setup progress.
export const getMine = query({
  args: {},
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) return null;

    const email =
      identity.email?.trim().toLowerCase() || "";

    const universityEmailVerified =
      /^[^\s@]+@[^\s@]+\.edu$/.test(email) &&
      identity.emailVerified === true;

    // This helper now requires a saved name match and DOB check.
    const ageCheckPassed = universityEmailVerified
      ? await hasPassedAgeCheck(
          ctx,
          identity.tokenIdentifier,
          email
        )
      : false;

    const checkedIdentity = ageCheckPassed
      ? await requireVerifiedSetup(ctx)
      : null;

    const legalName = checkedIdentity
      ? {
          firstName: checkedIdentity.legalFirstName,
          lastName: checkedIdentity.legalLastName,
        }
      : null;

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", q =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    const preferences = profile
      ? await ctx.db
          .query("diningPreferences")
          .withIndex("by_profileId", q =>
            q.eq("profileId", profile._id)
          )
          .unique()
      : null;

    const profileComplete = Boolean(
      profile?.firstName?.trim() &&
      profile.lastName?.trim() &&
      profile.localArea?.trim() &&
      legalName &&
      namesMatch(
        profile.firstName,
        profile.lastName,
        legalName.firstName,
        legalName.lastName
      )
    );

    const preferencesComplete = Boolean(
      preferences &&
      allowedDiets.has(preferences.diet) &&
      preferences.allergiesAnswered === true &&
      preferences.allergies.length <= allowedAllergens.size &&
      preferences.allergies.every(allergen =>
        allowedAllergens.has(allergen)
      ) &&
      preferences.religiousDetails.trim().length <= 500 &&
      (
        preferences.diet !== "Other" ||
        preferences.religiousDetails.trim()
      )
    );

    const consentComplete = Boolean(
      profile?.communityAcceptedAt &&
      profile.termsAcceptedAt &&
      profile.privacyAcceptedAt &&
      profile.consentVersion === CONSENT_VERSION
    );

    const nextStep = !ageCheckPassed
      ? "verify"
      : !profileComplete
        ? "profile"
        : !preferencesComplete
          ? "preferences"
          : !consentComplete
            ? "consent"
            : "done";

    return {
      profile,
      preferences,
      universityEmailVerified,
      ageCheckPassed,
      legalName,
      nextStep,
      questionnaireComplete: nextStep === "done",
    };
  },
});

// Save personal information using the checked legal name.
export const saveProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    preferredFirstName: v.string(),
    localArea: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireVerifiedSetup(ctx);

    if (
      !namesMatch(
        args.firstName,
        args.lastName,
        identity.legalFirstName,
        identity.legalLastName
      )
    ) {
      throw new ConvexError(
        "Your legal name must match the name accepted during the document check."
      );
    }

    // Use the checked values rather than browser-supplied spelling.
    const firstName = identity.legalFirstName;
    const lastName = identity.legalLastName;

    const preferredFirstName = args.preferredFirstName.trim()
      ? cleanName(
          args.preferredFirstName,
          "Preferred first name"
        )
      : "";

    const localArea = args.localArea.trim();

    if (!localArea || localArea.length > 200) {
      throw new ConvexError(
        "Enter a local area containing no more than 200 characters."
      );
    }

    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", q =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    const now = Date.now();

    const fields = {
      displayName: preferredFirstName || firstName,
      universityEmail: identity.email,
      firstName,
      lastName,
      preferredFirstName,
      localArea,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(
        "profiles",
        existing._id,
        fields
      );

      return existing._id;
    }

    return await ctx.db.insert("profiles", {
      tokenIdentifier: identity.tokenIdentifier,
      ...fields,
      createdAt: now,
    });
  },
});

// Save dietary answers after verification and personal information.
export const savePreferences = mutation({
  args: {
    diet: v.string(),
    allergies: v.array(v.string()),
    allergiesAnswered: v.boolean(),
    religiousDetails: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireVerifiedSetup(ctx);

    if (!allowedDiets.has(args.diet)) {
      throw new ConvexError(
        "Select a valid dietary preset."
      );
    }

    if (!args.allergiesAnswered) {
      throw new ConvexError(
        "Select your allergies or explicitly choose None."
      );
    }

    if (
      args.allergies.length > allowedAllergens.size ||
      args.allergies.some(
        allergen => !allowedAllergens.has(allergen)
      )
    ) {
      throw new ConvexError(
        "Select valid allergy options."
      );
    }

    const religiousDetails =
      args.religiousDetails.trim();

    if (religiousDetails.length > 500) {
      throw new ConvexError(
        "Additional dietary details must be 500 characters or fewer."
      );
    }

    if (args.diet === "Other" && !religiousDetails) {
      throw new ConvexError(
        "Describe your dietary needs."
      );
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", q =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (
      !profile?.firstName?.trim() ||
      !profile.lastName?.trim() ||
      !profile.localArea?.trim()
    ) {
      throw new ConvexError(
        "Complete your personal information first."
      );
    }

    if (
      !namesMatch(
        profile.firstName,
        profile.lastName,
        identity.legalFirstName,
        identity.legalLastName
      )
    ) {
      throw new ConvexError(
        "Save your personal information using the checked legal name first."
      );
    }

    const existing = await ctx.db
      .query("diningPreferences")
      .withIndex("by_profileId", q =>
        q.eq("profileId", profile._id)
      )
      .unique();

    const fields = {
      diet: args.diet,
      allergies: [...new Set(args.allergies)],
      allergiesAnswered: true,
      religiousDetails,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(
        "diningPreferences",
        existing._id,
        fields
      );

      return existing._id;
    }

    return await ctx.db.insert("diningPreferences", {
      profileId: profile._id,
      ...fields,
    });
  },
});

// Record agreements after the preceding setup steps.
export const acceptAgreements = mutation({
  args: {
    community: v.boolean(),
    terms: v.boolean(),
    privacy: v.boolean(),
    marketing: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireVerifiedSetup(ctx);

    if (
      !args.community ||
      !args.terms ||
      !args.privacy
    ) {
      throw new ConvexError(
        "Complete all three required acknowledgments."
      );
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", q =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (
      !profile?.firstName?.trim() ||
      !profile.lastName?.trim() ||
      !profile.localArea?.trim()
    ) {
      throw new ConvexError(
        "Complete your personal information first."
      );
    }

    if (
      !namesMatch(
        profile.firstName,
        profile.lastName,
        identity.legalFirstName,
        identity.legalLastName
      )
    ) {
      throw new ConvexError(
        "Save your personal information using the checked legal name first."
      );
    }

    const preferences = await ctx.db
      .query("diningPreferences")
      .withIndex("by_profileId", q =>
        q.eq("profileId", profile._id)
      )
      .unique();

    if (
      !preferences ||
      !preferences.allergiesAnswered ||
      !allowedDiets.has(preferences.diet) ||
      preferences.allergies.length > allowedAllergens.size ||
      preferences.allergies.some(
        allergen => !allowedAllergens.has(allergen)
      ) ||
      preferences.religiousDetails.trim().length > 500 ||
      (
        preferences.diet === "Other" &&
        !preferences.religiousDetails.trim()
      )
    ) {
      throw new ConvexError(
        "Complete your dining preferences first."
      );
    }

    const now = Date.now();

    await ctx.db.patch("profiles", profile._id, {
      communityAcceptedAt: now,
      termsAcceptedAt: now,
      privacyAcceptedAt: now,
      consentVersion: CONSENT_VERSION,
      marketing: args.marketing,
      updatedAt: now,
    });

    return {
      questionnaireComplete: true,
    };
  },
});