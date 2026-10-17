"use strict";

/**
 * End-to-end account-creation check through the REAL Express app, real
 * validators, real controllers/services, real bcrypt + JWT. Only the
 * database is replaced by a small in-memory fake so this can run anywhere.
 */
process.env.JWT_ACCESS_SECRET = "test-access-secret-test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-test-refresh-secret";
process.env.NODE_ENV = "test";

const request = require("supertest");

const users = [];
const refreshTokens = [];
const referrals = [];
let idSeq = 0;

const mockFakePrisma = {
  user: {
    findUnique: jest.fn(async ({ where }) =>
      users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) || null),
    create: jest.fn(async ({ data }) => {
      const u = { id: "u" + ++idSeq, status: "ACTIVE", role: "USER", emailVerified: false, accountType: "NORMAL",
        earningsBalance: 0, createdAt: new Date(), updatedAt: new Date(), ...data };
      users.push(u);
      return u;
    }),
    update: jest.fn(async ({ where, data }) => Object.assign(users.find((u) => u.id === where.id), data)),
  },
  refreshToken: {
    create: jest.fn(async ({ data }) => { refreshTokens.push(data); return data; }),
    findUnique: jest.fn(async () => null),
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
  referral: { create: jest.fn(async ({ data }) => { referrals.push(data); return data; }) },
  agent: { findUnique: jest.fn(async () => null) },
  // Mirrors the SQL in auth.service.findLoginUser: match on the last digits of the phone.
  $queryRaw: jest.fn(async (strings, ...vals) => {
    const pattern = String(vals[0]).replace(/^%/, "");
    return users.filter((u) => u.phone && u.phone.replace(/\D/g, "").endsWith(pattern)).map((u) => ({ id: u.id }));
  }),
  $transaction: jest.fn(async (cb) => cb(mockFakePrisma)),
};

jest.mock("../../src/database/client", () => ({
  get prisma() { return mockFakePrisma; },
  connectDatabase: jest.fn(),
  disconnectDatabase: jest.fn(),
}));
jest.mock("../../src/services/platformSettings.service", () => ({
  getSettings: jest.fn(async () => ({ maintenanceMode: false, featuresEnabled: {} })),
}));

const app = require("../../src/app");

const post = (path, body) => request(app).post("/api/v1" + path).send(body);
const base = { fullName: "Ama Mensah", email: "ama@example.com", phone: "+233241234567", password: "Passw0rdOk1" };

describe("account creation and login (real app, in-memory DB)", () => {
  it("creates a personal account without any verification email, and returns a usable user", async () => {
    const res = await post("/auth/register", { ...base, accountType: "NORMAL" });
    expect(res.status).toBe(201);
    expect(res.body.data.verificationRequired).toBe(false);
    expect(res.body.data.user.email).toBe("ama@example.com");
    expect(res.body.data.user.accountType).toBe("NORMAL");
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(users[0].phone).toBe("+233241234567");
  });

  it("rejects a duplicate email", async () => {
    const res = await post("/auth/register", base);
    expect(res.status).toBe(409);
  });

  it("logs in right after signup by email, and returns tokens", async () => {
    const res = await post("/auth/login", { email: "ama@example.com", password: base.password });
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.user.accountType).toBe("NORMAL");
  });

  it.each(["+233241234567", "0241234567", "241234567", "024 123 4567"])("logs in with phone %s", async (phone) => {
    const res = await post("/auth/login", { email: phone, password: base.password });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("ama@example.com");
  });

  it("rejects a wrong password and an unknown phone with the same generic 401", async () => {
    const a = await post("/auth/login", { email: "ama@example.com", password: "wrong-pass-1" });
    const b = await post("/auth/login", { email: "0200000000", password: base.password });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it("creates a creator account, and only that account can use /creator routes", async () => {
    const reg = await post("/auth/register", { fullName: "Kojo Creator", email: "kojo@example.com", phone: "+2348012345678", password: "Passw0rdOk1", accountType: "CREATOR" });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.accountType).toBe("CREATOR");

    const creatorLogin = await post("/auth/login", { email: "kojo@example.com", password: "Passw0rdOk1" });
    expect(creatorLogin.body.data.user.accountType).toBe("CREATOR");

    const personalLogin = await post("/auth/login", { email: "ama@example.com", password: base.password });
    const denied = await request(app).get("/api/v1/creator/courses").set("Authorization", "Bearer " + personalLogin.body.data.tokens.accessToken);
    expect(denied.status).toBe(403);
  });

  it("cannot self-assign a privileged role or account state at signup", async () => {
    const res = await post("/auth/register", { fullName: "Evil User", email: "evil@example.com", phone: "+233200000001", password: "Passw0rdOk1", role: "SUPER_ADMIN", status: "ACTIVE", earningsBalance: 99999 });
    expect(res.status).toBe(201);
    const stored = users.find((u) => u.email === "evil@example.com");
    expect(stored.role).toBe("USER");
    expect(stored.earningsBalance).toBe(0);
  });

  it("rejects bad input: invalid email, short password, weak phone", async () => {
    expect((await post("/auth/register", { ...base, email: "nope" })).status).toBe(422);
    expect((await post("/auth/register", { ...base, email: "b@example.com", password: "short" })).status).toBe(422);
    expect((await post("/auth/register", { ...base, email: "c@example.com", phone: "12" })).status).toBe(422);
  });
});
