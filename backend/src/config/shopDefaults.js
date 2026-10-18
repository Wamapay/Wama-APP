/**
 * Ready-made shop categories, each with the details a seller must fill in
 * for products in that category. Admin can edit, remove or add to these.
 * Field: { key, label, type: "text" | "number" | "select", options?, required?, unit? }
 */
"use strict";

const f = (key, label, type = "text", extra = {}) => ({ key, label, type, ...extra });
const COLORS = ["Black", "White", "Blue", "Red", "Green", "Gold", "Silver", "Grey", "Pink", "Purple", "Brown", "Other"];
const CONDITION = ["Brand new", "Used - like new", "Used - good", "Refurbished"];

const DEFAULT_SHOP_CATEGORIES = [
  { name: "Mobile Phones", description: "Smartphones and feature phones.", fields: [
    f("brand", "Brand", "text", { required: true }), f("model", "Model", "text", { required: true }),
    f("storage", "Storage", "select", { required: true, options: ["16GB", "32GB", "64GB", "128GB", "256GB", "512GB", "1TB"] }),
    f("ram", "RAM", "select", { options: ["2GB", "3GB", "4GB", "6GB", "8GB", "12GB", "16GB"] }),
    f("color", "Color", "select", { options: COLORS }), f("screen", "Screen size", "text", { unit: "inches" }),
    f("battery", "Battery", "text", { unit: "mAh" }), f("condition", "Condition", "select", { required: true, options: CONDITION }),
    f("warranty", "Warranty", "text") ] },
  { name: "Laptops & Computers", description: "Laptops, desktops and accessories.", fields: [
    f("brand", "Brand", "text", { required: true }), f("model", "Model", "text", { required: true }),
    f("processor", "Processor", "text", { required: true }), f("ram", "RAM", "select", { required: true, options: ["4GB", "8GB", "16GB", "32GB", "64GB"] }),
    f("storage", "Storage", "text", { required: true }), f("screen", "Screen size", "text", { unit: "inches" }),
    f("condition", "Condition", "select", { required: true, options: CONDITION }), f("warranty", "Warranty", "text") ] },
  { name: "TVs & Audio", description: "Televisions, speakers and sound.", fields: [
    f("brand", "Brand", "text", { required: true }), f("model", "Model", "text"), f("size", "Screen / speaker size", "text"),
    f("resolution", "Resolution", "select", { options: ["HD", "Full HD", "4K", "8K"] }), f("power", "Power / output", "text"),
    f("condition", "Condition", "select", { required: true, options: CONDITION }), f("warranty", "Warranty", "text") ] },
  { name: "Fashion & Clothing", description: "Clothes for men, women and kids.", fields: [
    f("brand", "Brand", "text"), f("gender", "For", "select", { required: true, options: ["Men", "Women", "Unisex", "Boys", "Girls"] }),
    f("size", "Size", "text", { required: true }), f("color", "Color", "select", { required: true, options: COLORS }),
    f("material", "Material", "text"), f("condition", "Condition", "select", { options: CONDITION }) ] },
  { name: "Shoes", description: "Sneakers, sandals, formal shoes and more.", fields: [
    f("brand", "Brand", "text"), f("gender", "For", "select", { required: true, options: ["Men", "Women", "Unisex", "Boys", "Girls"] }),
    f("size", "Shoe size", "text", { required: true }), f("color", "Color", "select", { required: true, options: COLORS }),
    f("material", "Material", "text"), f("condition", "Condition", "select", { options: CONDITION }) ] },
  { name: "Groceries & Food", description: "Everyday food and drinks.", fields: [
    f("brand", "Brand", "text"), f("weight", "Weight / volume", "text", { required: true }),
    f("expiry", "Best before", "text"), f("storage", "Storage", "select", { options: ["Room temperature", "Refrigerated", "Frozen"] }) ] },
  { name: "Beauty & Personal Care", description: "Skincare, makeup, hair and grooming.", fields: [
    f("brand", "Brand", "text", { required: true }), f("type", "Type", "text"), f("size", "Size / volume", "text", { required: true }),
    f("skin", "Suitable for", "text"), f("expiry", "Expiry date", "text") ] },
  { name: "Home & Kitchen", description: "Appliances, cookware and home items.", fields: [
    f("brand", "Brand", "text"), f("material", "Material", "text"), f("size", "Size / capacity", "text"),
    f("color", "Color", "select", { options: COLORS }), f("power", "Power", "text", { unit: "watts" }),
    f("condition", "Condition", "select", { options: CONDITION }), f("warranty", "Warranty", "text") ] },
  { name: "Furniture", description: "Beds, sofas, tables and storage.", fields: [
    f("material", "Material", "text", { required: true }), f("dimensions", "Dimensions (L x W x H)", "text", { required: true }),
    f("color", "Color", "select", { options: COLORS }), f("condition", "Condition", "select", { options: CONDITION }) ] },
  { name: "Baby & Kids", description: "Baby gear, toys and kids' items.", fields: [
    f("brand", "Brand", "text"), f("age", "Suitable age", "text", { required: true }), f("material", "Material", "text"),
    f("color", "Color", "select", { options: COLORS }) ] },
];

module.exports = { DEFAULT_SHOP_CATEGORIES };
