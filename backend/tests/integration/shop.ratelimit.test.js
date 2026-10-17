"use strict";

process.env.JWT_ACCESS_SECRET = "test-access-secret-test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-test-refresh-secret";
process.env.NODE_ENV = "test";

const request = require("supertest");

jest.mock("../../src/database/client", () => {
  const { createPrismaMock } = require("../helpers/mockPrisma");
  return { prisma: createPrismaMock(), connectDatabase: jest.fn(), disconnectDatabase: jest.fn() };
});

const app = require("../../src/app");

it("the public order endpoint is rate limited per IP (spam protection)", async () => {
  // An invalid body is rejected by validation (422) but still counts toward the limit.
  let last;
  for (let i = 0; i < 13; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    last = await request(app).post("/api/v1/shop/orders").send({});
  }
  expect(last.status).toBe(429);
});
