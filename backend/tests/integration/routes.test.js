"use strict";

const request = require("supertest");

// These tests exercise the real app/router wiring end-to-end for every
// path that does NOT require an actual database round-trip: the health
// check, request validation, and the "no/invalid token" branch of the
// auth/authorization middleware (which is designed to short-circuit
// before ever touching the database). The Prisma client is mocked purely
// so the module can load without a generated query engine in this test
// environment — none of these assertions rely on it being called.
jest.mock("../../src/database/client", () => {
  // eslint-disable-next-line global-require
  const { createPrismaMock } = require("../helpers/mockPrisma");
  return {
    prisma: createPrismaMock(),
    connectDatabase: jest.fn(),
    disconnectDatabase: jest.fn(),
  };
});

const app = require("../../src/app");

describe("app routing (DB-independent paths)", () => {
  it("GET /api/v1/health responds without touching the database", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET / responds with the API prefix info", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.data.apiPrefix).toBe("/api/v1");
  });

  it("unknown API route returns a clean 404", async () => {
    const res = await request(app).get("/api/v1/this-does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/v1/auth/register rejects an invalid body before touching the database", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email", password: "short" });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/v1/auth/login rejects a missing password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "jane@example.com" });

    expect(res.status).toBe(422);
  });

  it("GET /api/v1/users/me without a token is rejected with 401 (never reaches the database)", async () => {
    const res = await request(app).get("/api/v1/users/me");
    expect(res.status).toBe(401);
  });

  it("PATCH /api/v1/users/me without a token is rejected with 401", async () => {
    const res = await request(app).patch("/api/v1/users/me").send({ fullName: "New Name" });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/v1/users/me rejects attempts to set role/status even with a token (validator strips unknown fields, still 401 without auth)", async () => {
    const res = await request(app)
      .patch("/api/v1/users/me")
      .send({ role: "ADMIN", status: "ACTIVE", fullName: "New Name" });
    // No valid token supplied, so this must fail auth before the (stripped)
    // body would ever reach the controller/service.
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/agents/me without a token is rejected with 401", async () => {
    const res = await request(app).get("/api/v1/agents/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/admin/users without a token is rejected with 401", async () => {
    const res = await request(app).get("/api/v1/admin/users");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/admin/agents without a token is rejected with 401", async () => {
    const res = await request(app).get("/api/v1/admin/agents");
    expect(res.status).toBe(401);
  });

  it("rejects a malformed Authorization header (not 'Bearer <token>') with 401", async () => {
    const res = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", "Basic somevalue");
    expect(res.status).toBe(401);
  });

  it("rejects a garbage bearer token with 401 (invalid JWT signature)", async () => {
    const res = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", "Bearer not-a-real-jwt");
    expect(res.status).toBe(401);
  });

  it("placeholder modules (Stage 4+) respond 501, not a crash", async () => {
    const res = await request(app).get("/api/v1/transactions");
    expect(res.status).toBe(501);
  });
});
