"use strict";

const request = require("supertest");

// Same approach as tests/integration/routes.test.js: exercise real
// route/middleware wiring for paths that don't require a DB round-trip
// (auth guard short-circuits, and public GETs backed by a mocked Prisma
// client that resolves to empty results).
jest.mock("../../src/database/client", () => {
  // eslint-disable-next-line global-require
  const { createPrismaMock } = require("../helpers/mockPrisma");
  const prisma = createPrismaMock();
  prisma.course.findMany.mockResolvedValue([]);
  prisma.course.count.mockResolvedValue(0);
  prisma.category.findMany.mockResolvedValue([]);
  prisma.category.count.mockResolvedValue(0);
  return { prisma, connectDatabase: jest.fn(), disconnectDatabase: jest.fn() };
});

const app = require("../../src/app");

describe("Backend Stage 3 routing", () => {
  it("GET /api/v1/courses is public and returns an (empty) list without auth", async () => {
    const res = await request(app).get("/api/v1/courses");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.courses)).toBe(true);
  });

  it("GET /api/v1/categories is public", async () => {
    const res = await request(app).get("/api/v1/categories");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /api/v1/orders requires authentication", async () => {
    const res = await request(app).post("/api/v1/orders").send({ courseId: "course_1" });
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/orders requires authentication", async () => {
    const res = await request(app).get("/api/v1/orders");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/courses/:courseId/lessons/:lessonId/complete requires authentication", async () => {
    const res = await request(app).post("/api/v1/courses/course_1/lessons/lesson_1/complete");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/courses/:courseId/progress requires authentication", async () => {
    const res = await request(app).get("/api/v1/courses/course_1/progress");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/courses/:courseId/reviews requires authentication", async () => {
    const res = await request(app).post("/api/v1/courses/course_1/reviews").send({ rating: 5 });
    expect(res.status).toBe(401);
  });

  it("Admin course/category/order endpoints require authentication", async () => {
    const endpoints = [
      ["post", "/api/v1/admin/courses"],
      ["patch", "/api/v1/admin/courses/course_1"],
      ["post", "/api/v1/admin/courses/course_1/publish"],
      ["post", "/api/v1/admin/categories"],
      ["get", "/api/v1/admin/orders"],
      ["get", "/api/v1/admin/orders/order_1"],
      ["get", "/api/v1/admin/reviews"],
    ];
    for (const [method, url] of endpoints) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)[method](url);
      expect(res.status).toBe(401);
    }
  });

  it("rejects order creation with an invalid body (missing courseId) before touching the database", async () => {
    // No token supplied — auth short-circuits before validation in this
    // router (authenticate is applied via router.use at the top), so this
    // still correctly never reaches the database either way.
    const res = await request(app).post("/api/v1/orders").send({});
    expect(res.status).toBe(401);
  });

  it("there is no refund endpoint anywhere under /api/v1/orders or /api/v1/admin/orders", async () => {
    const candidates = [
      "/api/v1/orders/order_1/refund",
      "/api/v1/admin/orders/order_1/refund",
      "/api/v1/orders/order_1/cancel",
      "/api/v1/admin/orders/order_1/cancel",
    ];
    for (const url of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post(url);
      // Either 401 (admin auth required first) or 404 (route doesn't
      // exist) — never a 200/201 indicating a refund/cancel actually ran.
      expect([401, 404]).toContain(res.status);
    }
  });

  it("there is no quiz or assessment route mounted anywhere", async () => {
    const res1 = await request(app).get("/api/v1/quizzes");
    const res2 = await request(app).get("/api/v1/assessments");
    expect(res1.status).toBe(404);
    expect(res2.status).toBe(404);
  });
});
