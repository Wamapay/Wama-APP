"use strict";

// Full HTTP-level purchase flow, matching the mandatory Backend Stage 3
// test scenarios (docs items 62-65):
//   1. create a PUBLISHED course priced at GH₵500
//   2. create an order and confirm the server uses the DB price, never a
//      client-supplied one (price manipulation is not even possible here
//      since the request body only accepts courseId/referralCode)
//   3. a user without a paid order gets 403 on a protected lesson
//   4. simulate a successful payment (dev-only, mirrors what Paystack
//      webhook verification will do in a later stage)
//   5. the same user now gets 200 on the same protected lesson, and an
//      Agent profile was ensured for them
"use strict";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.ENABLE_DEV_ROUTES = "true";
process.env.NODE_ENV = "test";

const request = require("supertest");
const jwt = require("jsonwebtoken");

jest.mock("../../src/database/client", () => {
  // eslint-disable-next-line global-require
  const { createPrismaMock, withDefaultTransaction } = require("../helpers/mockPrisma");
  const prisma = withDefaultTransaction(createPrismaMock());
  return { prisma, connectDatabase: jest.fn(), disconnectDatabase: jest.fn() };
});

const { prisma } = require("../../src/database/client");
const app = require("../../src/app");

const USER = { id: "user_1", role: "USER", status: "ACTIVE", email: "buyer@example.com" };
const COURSE = {
  id: "course_1",
  title: "Ghostwriting Masterclass",
  status: "PUBLISHED",
  price: 500,
  currency: "GHS",
};
const LESSON = { id: "lesson_1", isPreview: false, module: { courseId: COURSE.id, id: "mod_1" } };

function tokenFor(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

describe("Backend Stage 3: end-to-end purchase flow", () => {
  const authHeader = `Bearer ${tokenFor(USER)}`;

  beforeEach(() => {
    jest.clearAllMocks();
    require("../helpers/mockPrisma").withDefaultTransaction(prisma);
    prisma.user.findUnique.mockResolvedValue(USER);
  });

  it("uses the database course price, not a manipulated client value, when creating an order", async () => {
    prisma.course.findUnique.mockResolvedValue(COURSE);
    prisma.order.count.mockResolvedValue(0);
    prisma.order.create.mockImplementation(({ data }) => Promise.resolve({ id: "order_1", ...data }));

    const res = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", authHeader)
      // Even if a client tries to sneak an amount through, createOrderSchema
      // strips unknown fields — only courseId/referralCode are read.
      .send({ courseId: COURSE.id, amount: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data.order.amount).toBe(500);
    expect(res.body.data.order.currency).toBe("GHS");
  });

  it("denies protected lesson access (403) before any successful purchase", async () => {
    prisma.lesson.findUnique.mockResolvedValue(LESSON);
    prisma.enrollment.findUnique.mockResolvedValue(null); // never purchased

    const res = await request(app)
      .get(`/api/v1/courses/${COURSE.id}/lessons/${LESSON.id}`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(403);
  });

  it("grants protected lesson access (200) after a simulated successful payment, and ensures an Agent account", async () => {
    // --- Simulate payment (dev route) ---
    prisma.order.findUnique
      .mockResolvedValueOnce({ id: "order_1", userId: USER.id, courseId: COURSE.id, status: "PENDING" }) // getOrderById (ownership check)
      .mockResolvedValueOnce({ id: "order_1", userId: USER.id, courseId: COURSE.id, status: "PENDING" }) // handleSuccessfulPurchase lookup
      .mockResolvedValueOnce({ id: "order_1", status: "PAID", enrollment: { id: "enr_1" } }); // final re-fetch
    prisma.order.update.mockResolvedValue({
      id: "order_1",
      userId: USER.id,
      courseId: COURSE.id,
      status: "PAID",
      paymentStatus: "SUCCESSFUL",
    });
    prisma.enrollment.findUnique.mockResolvedValueOnce(null); // ensureEnrollment: not yet enrolled
    prisma.enrollment.create.mockResolvedValue({ id: "enr_1", status: "ACTIVE" });
    prisma.agent.findUnique.mockResolvedValue(null); // no Agent yet (idempotent create path)
    prisma.agent.count.mockResolvedValue(0);
    prisma.agent.create.mockResolvedValue({
      id: "agent_1",
      userId: USER.id,
      agentId: "AGT-10001",
      referralCode: "AGT10001",
      status: "ACTIVE",
      successfulReferrals: 0,
      verificationStatus: "NOT_VERIFIED",
      verifiedAt: null,
    });
    prisma.user.update.mockResolvedValue({});

    // --- Backend Stage 4: financial pipeline (no referral on this order) ---
    prisma.transaction.findFirst.mockResolvedValue(null); // nothing processed yet — not a duplicate
    prisma.transaction.count.mockResolvedValue(0);
    prisma.transaction.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: `txn_${Math.random().toString(36).slice(2)}`, ...data })
    );
    prisma.referral.findUnique.mockResolvedValue(null); // buyer was never referred

    const payRes = await request(app)
      .post(`/api/v1/dev/orders/order_1/simulate-payment`)
      .set("Authorization", authHeader);

    expect(payRes.status).toBe(200);
    expect(payRes.body.data.order.status).toBe("PAID");
    expect(prisma.agent.create).toHaveBeenCalled(); // Agent creation trigger fired

    // --- Now access the previously-protected lesson ---
    prisma.lesson.findUnique.mockResolvedValue(LESSON);
    prisma.enrollment.findUnique.mockResolvedValue({ status: "ACTIVE" }); // now enrolled
    prisma.lessonProgress.upsert.mockResolvedValue({});
    prisma.enrollment.updateMany.mockResolvedValue({ count: 1 });

    const lessonRes = await request(app)
      .get(`/api/v1/courses/${COURSE.id}/lessons/${LESSON.id}`)
      .set("Authorization", authHeader);

    expect(lessonRes.status).toBe(200);
  });

  it("a preview lesson is accessible without authentication at all", async () => {
    const previewLesson = { ...LESSON, id: "lesson_preview", isPreview: true };
    prisma.lesson.findUnique.mockResolvedValue(previewLesson);

    const res = await request(app).get(`/api/v1/courses/${COURSE.id}/lessons/lesson_preview`);

    expect(res.status).toBe(200);
  });
});
