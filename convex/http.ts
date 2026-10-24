import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

function validName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 80
  );
}

http.route({
  path: "/age-check-result",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.AGE_CHECK_CALLBACK_SECRET;

    if (!secret) {
      return new Response("Callback is not configured.", {
        status: 503,
      });
    }

    if (
      request.headers.get("Authorization") !==
      `Bearer ${secret}`
    ) {
      return new Response("Unauthorized.", {
        status: 401,
      });
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON.", {
        status: 400,
      });
    }

    if (
      !body ||
      typeof body !== "object" ||
      !("tokenIdentifier" in body) ||
      typeof body.tokenIdentifier !== "string" ||
      !body.tokenIdentifier.trim() ||
      body.tokenIdentifier.length > 1000 ||
      !("email" in body) ||
      typeof body.email !== "string" ||
      body.email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.edu$/.test(body.email) ||
      !("legalFirstName" in body) ||
      !validName(body.legalFirstName) ||
      !("legalLastName" in body) ||
      !validName(body.legalLastName) ||
      !("nameMatched" in body) ||
      body.nameMatched !== true ||
      !("ageEligible" in body) ||
      body.ageEligible !== true
    ) {
      return new Response(
        "A passing name and DOB result is required.",
        { status: 400 }
      );
    }

    try {
      await ctx.runMutation(
        internal.verification.recordPassed,
        {
          tokenIdentifier: body.tokenIdentifier,
          email: body.email,
          legalFirstName: body.legalFirstName,
          legalLastName: body.legalLastName,
        }
      );
    } catch {
      return Response.json(
        {
          error:
            "The check could not be saved. An existing account-name difference may require review.",
        },
        {
          status: 409,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    return Response.json(
      { saved: true },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }),
});

export default http;