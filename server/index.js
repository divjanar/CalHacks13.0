require("dotenv").config({
  path: require("node:path").join(__dirname, ".env"),
});

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { ConvexHttpClient } = require("convex/browser");
const { makeFunctionReference } = require("convex/server");

const { readIdentity } = require("./idReader");
const { checkAge } = require("./ageCheck");
const { registerMenu } = require("./menu");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://table8.vip",
      "https://cal-hacks13-0-8miz.vercel.app",
    ],
  })
);

app.use(express.json({ limit: "256kb" }));

app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Accept one image and two legal-name fields.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 2,
    fieldSize: 1024,
    parts: 3,
  },
});

function detectImageType(buffer) {
  const pngSignature = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(pngSignature)
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  return null;
}

function clearUpload(req) {
  if (req.file?.buffer) {
    req.file.buffer.fill(0);
    delete req.file.buffer;
  }
}

function cleanName(value) {
  if (typeof value !== "string") return null;

  const cleaned = value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");

  if (!cleaned || cleaned.length > 80) {
    return null;
  }

  return cleaned;
}

function getToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());

  const value = (type) =>
    Number(
      parts.find((part) => part.type === type).value
    );

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  };
}

// Authenticate before accepting an uploaded document.
async function authenticateAgeCheck(req, res, next) {
  const authorization =
    req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      error:
        "Please sign in before checking your document.",
    });
  }

  if (
    !process.env.CONVEX_URL ||
    !process.env.CONVEX_SITE_URL ||
    !process.env.AGE_CHECK_CALLBACK_SECRET
  ) {
    return res.status(503).json({
      error:
        "The document-check service is not configured.",
    });
  }

  try {
    // Use a separate authenticated client for each request.
    const client = new ConvexHttpClient(
      process.env.CONVEX_URL
    );

    client.setAuth(
      authorization.slice(7).trim()
    );

    req.ageCheckIdentity = await client.query(
      makeFunctionReference("verification:getContext"),
      {}
    );

    return next();
  } catch (error) {
    console.error(
      "Document authentication failed. Code:",
      error.status || "unknown"
    );

    return res.status(401).json({
      error:
        "Please sign in with a verified university .edu email and try again.",
    });
  }
}

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Table 8 backend is running!",
  });
});

app.post(
  "/api/age-check",
  authenticateAgeCheck,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error:
            "Upload an image using the field name image.",
        });
      }

      const allowedFields = new Set([
        "firstName",
        "lastName",
      ]);

      if (
        Object.keys(req.body || {}).some(
          (field) => !allowedFields.has(field)
        )
      ) {
        return res.status(400).json({
          error:
            "Send only firstName, lastName, and one image.",
        });
      }

      const firstName = cleanName(
        req.body?.firstName
      );

      const lastName = cleanName(
        req.body?.lastName
      );

      if (!firstName || !lastName) {
        return res.status(400).json({
          error:
            "Enter your legal first and last name, each no longer than 80 characters.",
        });
      }

      const mimeType = detectImageType(
        req.file.buffer
      );

      if (!mimeType) {
        return res.status(415).json({
          error:
            "Please upload a JPEG or PNG image.",
        });
      }

      const extraction = await readIdentity(
        req.file.buffer,
        mimeType,
        {
          firstName,
          lastName,
        }
      );

      const ageResult =
        extraction.dobStatus === "readable"
          ? checkAge(
              extraction.dob,
              getToday()
            )
          : {
              status: "needs_review",
              eligible: null,
            };

      // A clearly underage DOB cannot pass.
      if (
        ageResult.status === "under_18" &&
        ageResult.eligible === false
      ) {
        return res.json({
          status: "under_18",
          eligible: false,
          nameMatch: extraction.nameMatch,
          saved: false,
        });
      }

      if (
        extraction.nameMatch === "mismatch"
      ) {
        return res.json({
          status: "name_mismatch",
          eligible: null,
          nameMatch: "mismatch",
          saved: false,
        });
      }

      if (
        extraction.nameMatch !== "matched" ||
        extraction.nameStatus !== "readable" ||
        ageResult.status !==
          "meets_age_requirement" ||
        ageResult.eligible !== true
      ) {
        return res.json({
          status: "needs_review",
          eligible: null,
          nameMatch: extraction.nameMatch,
          saved: false,
        });
      }

      // Only save after both name and age checks pass.
      // The account identity comes from Convex authentication.
      const callback = await fetch(
        new URL(
          "/age-check-result",
          process.env.CONVEX_SITE_URL
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:
              `Bearer ${process.env.AGE_CHECK_CALLBACK_SECRET}`,
          },
          body: JSON.stringify({
            tokenIdentifier:
              req.ageCheckIdentity.tokenIdentifier,
            email:
              req.ageCheckIdentity.email,
            legalFirstName: firstName,
            legalLastName: lastName,
            nameMatched: true,
            ageEligible: true,
          }),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!callback.ok) {
        console.error(
          "Saving document result failed. HTTP:",
          callback.status
        );

        return res
          .status(
            callback.status === 409
              ? 409
              : 502
          )
          .json({
            error:
              callback.status === 409
                ? "The result could not be saved. If your existing account has a different legal name, account review is required."
                : "The checks passed, but the result could not be saved. Please try again.",
          });
      }

      // Do not return the extracted DOB or document text.
      return res.json({
        status: "meets_age_requirement",
        eligible: true,
        nameMatch: "matched",
        saved: true,
      });
    } catch (error) {
      // Do not log uploaded documents or account secrets.
      console.error(
        "Document check failed. Code:",
        error.status || "unknown"
      );

      return res.status(502).json({
        error:
          "Unable to complete the document check right now. Please try again.",
      });
    } finally {
      clearUpload(req);
    }
  }
);

// Preserve existing menu routes.
registerMenu(app);

app.use((error, req, res, next) => {
  clearUpload(req);

  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error:
        error.code === "LIMIT_FILE_SIZE"
          ? "Image must be 5 MB or smaller."
          : "Upload one image with firstName and lastName only.",
    });
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      error:
        "The request contains invalid JSON.",
    });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      error:
        "The request is too large.",
    });
  }

  console.error(
    "Request failed. Code:",
    error.status || "unknown"
  );

  return res.status(500).json({
    error: "Something went wrong.",
  });
});

// Render supplies PORT and needs a publicly reachable interface.
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Table 8 backend listening on port ${PORT}`
  );
});