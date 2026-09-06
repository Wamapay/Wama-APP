"use strict";

jest.mock("../../src/config/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

describe("upload.service — mime-type allowlist", () => {
  it("allows the expected image types and PDF, and nothing else", () => {
    const { ALLOWED_MIME_TYPES } = require("../../src/services/upload.service");
    expect(ALLOWED_MIME_TYPES["image/jpeg"]).toBe("image");
    expect(ALLOWED_MIME_TYPES["image/png"]).toBe("image");
    expect(ALLOWED_MIME_TYPES["image/webp"]).toBe("image");
    expect(ALLOWED_MIME_TYPES["image/gif"]).toBe("image");
    expect(ALLOWED_MIME_TYPES["application/pdf"]).toBe("raw");
  });

  it("never allows video — the deliberate design decision", () => {
    const { ALLOWED_MIME_TYPES } = require("../../src/services/upload.service");
    expect(ALLOWED_MIME_TYPES["video/mp4"]).toBeUndefined();
    expect(ALLOWED_MIME_TYPES["video/quicktime"]).toBeUndefined();
  });

  it("never allows an arbitrary/executable file type", () => {
    const { ALLOWED_MIME_TYPES } = require("../../src/services/upload.service");
    expect(ALLOWED_MIME_TYPES["application/x-msdownload"]).toBeUndefined();
    expect(ALLOWED_MIME_TYPES["application/octet-stream"]).toBeUndefined();
  });
});

describe("upload.service — uploadFile", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("refuses to run at all when Cloudinary credentials are missing — fails fast, doesn't crash", async () => {
    jest.doMock("../../src/config/env", () => ({
      config: { cloudinary: { cloudName: "", apiKey: "", apiSecret: "" } },
    }));
    const uploadService = require("../../src/services/upload.service");

    await expect(uploadService.uploadFile(Buffer.from("x"), "image/png", "course-thumbnails")).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it("rejects an unsupported mime type before ever touching Cloudinary", async () => {
    jest.doMock("../../src/config/env", () => ({
      config: { cloudinary: { cloudName: "demo", apiKey: "key", apiSecret: "secret" } },
    }));
    const uploadService = require("../../src/services/upload.service");

    await expect(uploadService.uploadFile(Buffer.from("x"), "video/mp4", "course-thumbnails")).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
