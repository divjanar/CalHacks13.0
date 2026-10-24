require("dotenv").config({ path: require("node:path").join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const multer = require("multer");

const { readDateOfBirth } = require("./idReader");
const { checkAge } = require("./ageCheck");
const { registerMenu } = require("./menu");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
  ],
}));

app.use(express.json({ limit: "256kb" }));

app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 0,
  },
});

function detectImageType(buffer) {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(png)) {
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

function getToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());

  const value = type =>
    Number(parts.find(part => part.type === type).value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Table 8 backend is running!",
  });
});

app.post("/api/age-check", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "Upload an image using the field name image.",
    });
  }

  try {
    const mimeType = detectImageType(req.file.buffer);

    if (!mimeType) {
      return res.status(415).json({
        error: "Please upload a JPEG or PNG image.",
      });
    }

    const extraction = await readDateOfBirth(req.file.buffer, mimeType);

    if (extraction.status !== "readable") {
      return res.json({
        status: "needs_review",
        eligible: null,
      });
    }

    return res.json(checkAge(extraction.dob, getToday()));
  } catch (error) {
    console.error("Age check failed. Code:", error.status || "unknown");

    return res.status(502).json({
      error: "Unable to read the image right now. Please try again.",
    });
  } finally {
    clearUpload(req);
  }
});

registerMenu(app);
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  clearUpload(req);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error: error.code === "LIMIT_FILE_SIZE"
        ? "Image must be 5 MB or smaller."
        : "Upload exactly one image using the field name image.",
    });
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "The request contains invalid JSON.",
    });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      error: "The request is too large.",
    });
  }

  console.error("Request failed. Code:", error.status || "unknown");

  return res.status(500).json({
    error: "Something went wrong.",
  });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Table 8 backend: http://localhost:${PORT}`);
});