/**
 * DTO / response-shaping helpers for courses, categories, orders, and
 * reviews — mirrors the pattern in user.mapper.js. Keeps Decimal price
 * fields as plain numbers in API responses and avoids leaking raw
 * relation objects the client shouldn't see.
 */
"use strict";

function toNumber(value) {
  if (value === null || value === undefined) return value;
  return Number(value);
}

function toPublicCategory(category) {
  if (!category) return null;
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    image: category.image,
    status: category.status,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function toCourseListItem(course) {
  if (!course) return null;
  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    shortDescription: course.shortDescription,
    thumbnail: course.thumbnail,
    price: toNumber(course.price),
    currency: course.currency,
    category: course.category ? toPublicCategory(course.category) : null,
    status: course.status,
    featured: course.featured,
    publishedAt: course.publishedAt,
    moduleCount: course._count ? course._count.modules : undefined,
    reviewCount: course._count ? course._count.reviews : undefined,
    studentCount: course._count ? course._count.enrollments : undefined,
    createdAt: course.createdAt,
  };
}

function toCourseDetail(course) {
  if (!course) return null;
  return {
    ...course,
    price: toNumber(course.price),
  };
}

function toPublicOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    course: order.course
      ? { id: order.course.id, title: order.course.title, slug: order.course.slug, thumbnail: order.course.thumbnail }
      : undefined,
    amount: toNumber(order.amount),
    currency: order.currency,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentReference: order.paymentReference,
    agentId: order.agentId || undefined,
    referralCode: order.referralCode || undefined,
    enrollmentStatus: order.enrollment ? order.enrollment.status : undefined,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    paidAt: order.paidAt,
  };
}

function toAdminOrder(order) {
  if (!order) return null;
  return {
    ...toPublicOrder(order),
    user: order.user ? { id: order.user.id, fullName: order.user.fullName, email: order.user.email } : undefined,
    agent: order.agent ? { id: order.agent.id, agentId: order.agent.agentId } : undefined,
  };
}

function toPublicReview(review) {
  if (!review) return null;
  return {
    id: review.id,
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    status: review.status,
    user: review.user ? { id: review.user.id, fullName: review.user.fullName, profileImage: review.user.profileImage } : undefined,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

module.exports = {
  toPublicCategory,
  toCourseListItem,
  toCourseDetail,
  toPublicOrder,
  toAdminOrder,
  toPublicReview,
};
