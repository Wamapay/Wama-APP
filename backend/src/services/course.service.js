/**
 * Course business logic: CRUD, publishing, discovery/search.
 *
 * IMPORTANT: price/currency stored here are the single server-side source
 * of truth. order.service.js re-reads Course.price at purchase time and
 * never trusts a client-supplied amount.
 *
 * Financial calculations (cashback/commission/rewards) are NOT implemented
 * here — see Backend Stage 4.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const { slugify, isValidSlug } = require("../utils/slugify");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

async function generateUniqueSlug(base, excludeId = null) {
  const root = isValidSlug(base) ? base : slugify(base);
  if (!root) {
    throw ApiError.badRequest("Could not derive a valid slug from the provided title.");
  }

  let candidate = root;
  let suffix = 2;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const existing = await prisma.course.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) {
      return candidate;
    }
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
  throw ApiError.conflict("Could not generate a unique course slug.");
}

function paginationArgs(query) {
  const take = Math.min(parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { take, skip: (page - 1) * take, page };
}

function sortToOrderBy(sort) {
  switch (sort) {
    case "oldest":
      return { createdAt: "asc" };
    case "price_asc":
      return { price: "asc" };
    case "price_desc":
      return { price: "desc" };
    case "title":
      return { title: "asc" };
    case "newest":
    default:
      return { createdAt: "desc" };
  }
}

/**
 * List courses for the public marketplace (or Admin catalog view).
 * Public callers only ever see PUBLISHED courses regardless of what
 * `status` they ask for — isAdmin is the only thing that unlocks other
 * statuses.
 */
async function listCourses(query = {}, { isAdmin = false } = {}) {
  const { take, skip, page } = paginationArgs(query);

  const where = {};

  if (isAdmin && query.status) {
    where.status = query.status;
  } else if (!isAdmin) {
    where.status = "PUBLISHED";
  }

  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
      { shortDescription: { contains: query.search, mode: "insensitive" } },
    ];
  }

  if (query.category) {
    const category = await prisma.category.findUnique({ where: { slug: query.category } });
    where.categoryId = category ? category.id : "__no_match__";
  }

  if (query.featured !== undefined) {
    where.featured = Boolean(query.featured);
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.price = {};
    if (query.minPrice !== undefined) where.price.gte = query.minPrice;
    if (query.maxPrice !== undefined) where.price.lte = query.maxPrice;
  }

  const [items, total] = await Promise.all([
    prisma.course.findMany({
      where,
      take,
      skip,
      orderBy: sortToOrderBy(query.sort),
      include: {
        category: true,
        _count: { select: { modules: true, reviews: true, enrollments: true } },
      },
    }),
    prisma.course.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

async function getRatingSummary(courseId) {
  const agg = await prisma.review.aggregate({
    where: { courseId, status: "PUBLISHED" },
    _avg: { rating: true },
    _count: { rating: true },
  });
  return {
    averageRating: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : 0,
    reviewCount: agg._count.rating,
  };
}

/**
 * Full course detail, shaped for the public course page. Never returns
 * protected lesson `content` — only enough to render a syllabus (titles,
 * position, type, duration, isPreview).
 */
async function getCourseBySlug(slug, { isAdmin = false } = {}) {
  const course = await prisma.course.findUnique({
    where: { slug },
    include: {
      category: true,
      instructor: true,
      modules: {
        orderBy: { position: "asc" },
        include: { lessons: { orderBy: { position: "asc" } } },
      },
    },
  });

  if (!course) {
    throw ApiError.notFound("Course not found.");
  }
  if (course.status !== "PUBLISHED" && !isAdmin) {
    throw ApiError.notFound("Course not found.");
  }

  const [studentCount, ratingSummary] = await Promise.all([
    prisma.enrollment.count({ where: { courseId: course.id, status: { in: ["ACTIVE", "COMPLETED"] } } }),
    getRatingSummary(course.id),
  ]);

  const modulesSummary = course.modules.map((mod) => ({
    id: mod.id,
    title: mod.title,
    description: mod.description,
    position: mod.position,
    lessonCount: mod.lessons.length,
    lessons: mod.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      position: lesson.position,
      duration: lesson.duration,
      isPreview: lesson.isPreview,
    })),
  }));

  const lessonCount = modulesSummary.reduce((sum, mod) => sum + mod.lessonCount, 0);

  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    description: course.description,
    shortDescription: course.shortDescription,
    thumbnail: course.thumbnail,
    coverImage: course.coverImage,
    price: course.price,
    currency: course.currency,
    category: course.category,
    instructor: course.instructor
      ? { id: course.instructor.id, fullName: course.instructor.fullName }
      : null,
    status: course.status,
    featured: course.featured,
    publishedAt: course.publishedAt,
    moduleCount: modulesSummary.length,
    lessonCount,
    modules: modulesSummary,
    studentCount,
    ratingSummary,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

async function getCourseById(id) {
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) {
    throw ApiError.notFound("Course not found.");
  }
  return course;
}

async function assertCategoryExists(categoryId) {
  if (!categoryId) return;
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw ApiError.badRequest("categoryId does not reference an existing category.");
  }
}

async function createCourse(data) {
  await assertCategoryExists(data.categoryId);

  const slug = await generateUniqueSlug(data.slug || data.title);

  return prisma.course.create({
    data: {
      title: data.title,
      slug,
      description: data.description,
      shortDescription: data.shortDescription,
      thumbnail: data.thumbnail,
      coverImage: data.coverImage,
      price: data.price,
      currency: data.currency || "GHS",
      categoryId: data.categoryId || null,
      instructorId: data.instructorId || null,
      status: data.status || "DRAFT",
      featured: Boolean(data.featured),
    },
  });
}

/**
 * Admin update. Deliberately never touches orders/enrollments/cashback/
 * commission/balances — those are owned by other services entirely.
 */
async function updateCourse(id, updates) {
  const course = await getCourseById(id);

  if (updates.categoryId !== undefined) {
    await assertCategoryExists(updates.categoryId);
  }

  const data = {};
  if (updates.title !== undefined) data.title = updates.title;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.shortDescription !== undefined) data.shortDescription = updates.shortDescription;
  if (updates.thumbnail !== undefined) data.thumbnail = updates.thumbnail;
  if (updates.coverImage !== undefined) data.coverImage = updates.coverImage;
  if (updates.price !== undefined) data.price = updates.price;
  if (updates.currency !== undefined) data.currency = updates.currency;
  if (updates.categoryId !== undefined) data.categoryId = updates.categoryId;
  if (updates.instructorId !== undefined) data.instructorId = updates.instructorId;
  if (updates.featured !== undefined) data.featured = updates.featured;
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.slug !== undefined) {
    data.slug = await generateUniqueSlug(updates.slug, id);
  }

  if (data.status === "PUBLISHED" || (course.status === "PUBLISHED" && data.status === undefined)) {
    // Only stamp publishedAt the first time a course goes live.
    if (!course.publishedAt && (data.status === "PUBLISHED" || course.status === "PUBLISHED")) {
      data.publishedAt = new Date();
    }
  }

  return prisma.course.update({ where: { id }, data });
}

/**
 * Controlled publish/unpublish/archive. A course only ever becomes
 * publicly purchasable when status = PUBLISHED and it has a valid price.
 */
async function setCourseStatus(id, status) {
  const course = await getCourseById(id);

  if (status === "PUBLISHED") {
    if (course.price === null || course.price === undefined || Number(course.price) < 0) {
      throw ApiError.badRequest("Course must have a valid price before it can be published.");
    }
  }

  const data = { status };
  if (status === "PUBLISHED" && !course.publishedAt) {
    data.publishedAt = new Date();
  }

  return prisma.course.update({ where: { id }, data });
}

module.exports = {
  generateUniqueSlug,
  listCourses,
  getCourseBySlug,
  getCourseById,
  getRatingSummary,
  createCourse,
  updateCourse,
  setCourseStatus,
};
