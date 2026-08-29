import React, { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, Users, UserCheck, BookOpen, ShoppingCart, ArrowLeftRight,
  Wallet, Gift, Percent, Award, Share2, Megaphone, ShieldCheck, MessagesSquare,
  FileBadge2, Bell, FileText, BarChart3, Settings, User, LogOut, Search,
  ChevronDown, Menu, X, Moon, Sun, TrendingUp, TrendingDown,
  CheckCircle2, Clock, XCircle, Eye, RefreshCw, Inbox, AlertTriangle,
  BadgeCheck, ChevronRight, Lock, Mail, ShieldAlert, Sparkles,
  Video, Music, Image as ImageIcon, Star, Plus, Trash2, Pencil,
  ArrowUp, ArrowDown, Pin, PinOff, Upload, Save, Archive,
  Layers, MessageCircle, EyeOff
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";

/* ============================================================
   DESIGN TOKENS
   ============================================================ */
const TOKENS = `
  :root{
    --bg:#F5F6F8; --surface:#FFFFFF; --surface-alt:#FAFBFC;
    --border:#E5E8EC; --border-soft:#EEF0F3;
    --text:#101828; --text-soft:#475467; --text-mute:#98A2B3;
    --sidebar:#0E1526; --sidebar-alt:#161F35; --sidebar-text:#AEB6C9; --sidebar-text-active:#FFFFFF;
    --accent-gold:#C99A2E; --accent-gold-soft:#FBF2DD;
    --blue:#2952CC; --blue-soft:#EAF0FE;
    --green:#187A4C; --green-soft:#E6F6ED;
    --amber:#B4740E; --amber-soft:#FCF1DC;
    --red:#C13A3A; --red-soft:#FBEAEA;
    --mono: 'IBM Plex Mono', ui-monospace, monospace;
    --display: 'Manrope', system-ui, sans-serif;
    --body: 'Inter', system-ui, sans-serif;
    --shadow: 0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06);
    --shadow-md: 0 4px 10px rgba(16,24,40,0.06), 0 2px 4px rgba(16,24,40,0.05);
  }
  .dark-mode{
    --bg:#0A0E17; --surface:#111726; --surface-alt:#0D1220;
    --border:#232B3D; --border-soft:#1B2233;
    --text:#F2F4F7; --text-soft:#98A2B3; --text-mute:#667085;
    --sidebar:#080B14; --sidebar-alt:#111726; --sidebar-text:#8892A6; --sidebar-text-active:#FFFFFF;
    --accent-gold-soft:#241D0E;
    --blue-soft:#141E38;
    --green-soft:#0E2318;
    --amber-soft:#241C0D;
    --red-soft:#2A1414;
  }
  .admin-root{ font-family:var(--body); background:var(--bg); color:var(--text); }
  .font-display{ font-family:var(--display); }
  .font-mono{ font-family:var(--mono); }
  .admin-scroll::-webkit-scrollbar{ width:8px; height:8px; }
  .admin-scroll::-webkit-scrollbar-thumb{ background:var(--border); border-radius:8px; }
  .card{ background:var(--surface); border:1px solid var(--border); border-radius:14px; box-shadow:var(--shadow); }
  .skeleton{ background:linear-gradient(90deg, var(--border-soft) 25%, var(--border) 37%, var(--border-soft) 63%); background-size:400% 100%; animation: shimmer 1.4s ease infinite; border-radius:8px; }
  @keyframes shimmer{ 0%{background-position:100% 50%;} 100%{background-position:0 50%;} }
  .fade-in{ animation: fadeIn .35s ease both; }
  @keyframes fadeIn{ from{opacity:0; transform:translateY(4px);} to{opacity:1; transform:translateY(0);} }
  .nav-item{ position:relative; transition: background .15s ease, color .15s ease; }
  .nav-item.active{ background:var(--sidebar-alt); color:var(--sidebar-text-active); }
  .nav-item.active::before{ content:""; position:absolute; left:0; top:8px; bottom:8px; width:3px; border-radius:0 3px 3px 0; background:var(--accent-gold); }
  .btn-primary{ background:var(--blue); color:#fff; }
  .btn-primary:hover{ filter:brightness(1.08); }
  input:focus, button:focus-visible, a:focus-visible{ outline: 2px solid var(--blue); outline-offset:2px; }
`;

/* ============================================================
   REAL BACKEND API LAYER
   Same conventions as the main site's apiFetch (Phase 1-7): base URL
   configurable via window.ADMIN_API_BASE, token/refresh stored under the
   same localStorage keys so an admin who is already logged in on the
   main site doesn't have to log in twice, silent-refresh-on-401, real
   /api/v1 response envelope { success, message, data }.
   ============================================================ */
const API_BASE = window.ADMIN_API_BASE || "/api/v1";
const ADMIN_TOKEN_KEY = "learnAndEarnAccessToken";
const ADMIN_REFRESH_KEY = "learnAndEarnRefreshToken";
function getAdminToken() { return localStorage.getItem(ADMIN_TOKEN_KEY); }
function setAdminToken(t) { t ? localStorage.setItem(ADMIN_TOKEN_KEY, t) : localStorage.removeItem(ADMIN_TOKEN_KEY); }
function getAdminRefresh() { return localStorage.getItem(ADMIN_REFRESH_KEY); }
function setAdminRefresh(t) { t ? localStorage.setItem(ADMIN_REFRESH_KEY, t) : localStorage.removeItem(ADMIN_REFRESH_KEY); }
function clearAdminTokens() { setAdminToken(null); setAdminRefresh(null); }

async function rawApiFetch(path, options = {}) {
  const token = getAdminToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(API_BASE + path, { ...options, headers });
  let body = null;
  try { body = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const err = new Error((body && body.message) || ("Request failed with status " + res.status));
    err.status = res.status;
    err.details = body && body.error;
    throw err;
  }
  return body ? body.data : body;
}
let refreshInFlight = null;
async function refreshAdminTokenPair() {
  const raw = getAdminRefresh();
  if (!raw) throw new Error("No refresh token");
  if (!refreshInFlight) {
    refreshInFlight = rawApiFetch("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: raw }) })
      .finally(() => { refreshInFlight = null; });
  }
  const { tokens } = await refreshInFlight;
  setAdminToken(tokens.accessToken);
  setAdminRefresh(tokens.refreshToken);
  return tokens;
}
const NO_REFRESH_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout"];
async function apiFetch(path, options = {}) {
  try {
    return await rawApiFetch(path, options);
  } catch (err) {
    const canRetry = err.status === 401 && !NO_REFRESH_PATHS.includes(path) && getAdminRefresh();
    if (!canRetry) throw err;
    try { await refreshAdminTokenPair(); } catch (e) { clearAdminTokens(); throw err; }
    return rawApiFetch(path, options);
  }
}
// Small helper: GET a list endpoint and return { items, total } — every
// admin list endpoint in the real backend returns { <name>: [...], total,
// page, pageSize } (see src/controllers/admin*.controller.js).
async function apiList(path, dataKey) {
  const data = await apiFetch(path);
  return { items: data[dataKey] || [], total: data.total || 0 };
}

/* ============================================================
   DEMO DATA (centralized — all KPIs derive from these arrays)
   These mock arrays are kept ONLY as fallback shapes/defaults for
   components that declare `= ACCOUNTS` etc. as a default prop value;
   the app itself always passes real, fetched data once logged in (see
   AdminDashboardApp below) — none of these arrays are ever rendered.
   ============================================================ */
const fmtGHS = (n) => "GH\u20B5" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
const initials = (name) => name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

const ACCOUNTS = [
  { id: "USR-1001", name: "John Mensah", email: "john.mensah@mail.com", phone: "+233 24 111 0001", type: "Agent", status: "Active", joined: "2026-08-21", lastActivityAt: "2026-08-22", qualifyingPurchase: "Successful", agentId: "AGT-10082", referrals: 8, commission: 1240 },
  { id: "USR-1002", name: "Ama Boateng", email: "ama.boateng@mail.com", phone: "+233 24 111 0002", type: "Verified Agent", status: "Active", joined: "2026-08-18", lastActivityAt: "2026-08-22", qualifyingPurchase: "Successful", agentId: "AGT-10021", referrals: 24, commission: 5860 },
  { id: "USR-1003", name: "Kwame Owusu", email: "kwame.owusu@mail.com", phone: "+233 24 111 0003", type: "User", status: "Active", joined: "2026-08-20", lastActivityAt: "2026-08-21", qualifyingPurchase: "Pending", agentId: null, referrals: 0, commission: 0 },
  { id: "USR-1004", name: "Efua Asante", email: "efua.asante@mail.com", phone: "+233 24 111 0004", type: "Agent", status: "Suspended", joined: "2026-07-30", lastActivityAt: "2026-08-10", qualifyingPurchase: "Successful", agentId: "AGT-10077", referrals: 3, commission: 410 },
  { id: "USR-1005", name: "Kofi Adjei", email: "kofi.adjei@mail.com", phone: "+233 24 111 0005", type: "Verified Agent", status: "Active", joined: "2026-06-12", lastActivityAt: "2026-08-21", qualifyingPurchase: "Successful", agentId: "AGT-10004", referrals: 32, commission: 8920 },
  { id: "USR-1006", name: "Abena Darko", email: "abena.darko@mail.com", phone: "+233 24 111 0006", type: "User", status: "Active", joined: "2026-08-19", lastActivityAt: "2026-08-20", qualifyingPurchase: "Successful", agentId: null, referrals: 0, commission: 0 },
  { id: "USR-1007", name: "Yaw Frimpong", email: "yaw.frimpong@mail.com", phone: "+233 24 111 0007", type: "Agent", status: "Active", joined: "2026-08-05", lastActivityAt: "2026-08-19", qualifyingPurchase: "Successful", agentId: "AGT-10061", referrals: 12, commission: 1980 },
  { id: "USR-1008", name: "Akosua Nyarko", email: "akosua.nyarko@mail.com", phone: "+233 24 111 0008", type: "Verified Agent", status: "Active", joined: "2026-05-22", lastActivityAt: "2026-08-22", qualifyingPurchase: "Successful", agentId: "AGT-10002", referrals: 41, commission: 11240 },
  { id: "USR-1009", name: "Kwabena Sarpong", email: "kwabena.sarpong@mail.com", phone: "+233 24 111 0009", type: "User", status: "Suspended", joined: "2026-08-01", lastActivityAt: "2026-08-05", qualifyingPurchase: "Failed", agentId: null, referrals: 0, commission: 0 },
  { id: "USR-1010", name: "Adwoa Kusi", email: "adwoa.kusi@mail.com", phone: "+233 24 111 0010", type: "Agent", status: "Active", joined: "2026-08-14", lastActivityAt: "2026-08-21", qualifyingPurchase: "Successful", agentId: "AGT-10059", referrals: 6, commission: 860 },
  { id: "USR-1011", name: "Kojo Antwi", email: "kojo.antwi@mail.com", phone: "+233 24 111 0011", type: "User", status: "Pending", joined: "2026-08-21", lastActivityAt: "2026-08-21", qualifyingPurchase: "Pending", agentId: null, referrals: 0, commission: 0 },
  { id: "USR-1012", name: "Esi Amankwah", email: "esi.amankwah@mail.com", phone: "+233 24 111 0012", type: "Agent", status: "Active", joined: "2026-07-19", lastActivityAt: "2026-08-18", qualifyingPurchase: "Successful", agentId: "AGT-10045", referrals: 17, commission: 2640 },
  { id: "USR-1013", name: "Kwesi Boadu", email: "kwesi.boadu@mail.com", phone: "+233 24 111 0013", type: "Verified Agent", status: "Active", joined: "2026-04-08", lastActivityAt: "2026-08-19", qualifyingPurchase: "Successful", agentId: "AGT-10009", referrals: 28, commission: 7010 },
  { id: "USR-1014", name: "Adjoa Mensimah", email: "adjoa.mensimah@mail.com", phone: "+233 24 111 0014", type: "User", status: "Active", joined: "2026-08-16", lastActivityAt: "2026-08-17", qualifyingPurchase: "Successful", agentId: null, referrals: 0, commission: 0 },
  { id: "USR-1015", name: "Nana Yeboah", email: "nana.yeboah@mail.com", phone: "+233 24 111 0015", type: "Agent", status: "Active", joined: "2026-08-10", lastActivityAt: "2026-08-16", qualifyingPurchase: "Successful", agentId: "AGT-10068", referrals: 19, commission: 2310 },
];

const COURSES = [
  { id: "CRS-01", title: "Digital Marketing", price: 500 },
  { id: "CRS-02", title: "Forex Fundamentals", price: 750 },
  { id: "CRS-03", title: "Graphic Design Mastery", price: 450 },
  { id: "CRS-04", title: "Affiliate Growth Blueprint", price: 600 },
  { id: "CRS-05", title: "E-commerce Launchpad", price: 850 },
  { id: "CRS-06", title: "Content Creation Pro", price: 400 },
  { id: "CRS-07", title: "Personal Finance 101", price: 350 },
  { id: "CRS-08", title: "Public Speaking Confidence", price: 300 },
];

const ORDERS = [
  { id: "ORD-10082", customer: "John Mensah", course: "Digital Marketing", amount: 500, status: "Successful", date: "2026-08-21" },
  { id: "ORD-10081", customer: "Efua Asante", course: "Forex Fundamentals", amount: 750, status: "Successful", date: "2026-08-21" },
  { id: "ORD-10080", customer: "Kwame Owusu", course: "Graphic Design Mastery", amount: 450, status: "Pending", date: "2026-08-20" },
  { id: "ORD-10079", customer: "Abena Darko", course: "E-commerce Launchpad", amount: 850, status: "Successful", date: "2026-08-20" },
  { id: "ORD-10078", customer: "Kwabena Sarpong", course: "Content Creation Pro", amount: 400, status: "Failed", date: "2026-08-19" },
  { id: "ORD-10077", customer: "Adwoa Kusi", course: "Affiliate Growth Blueprint", amount: 600, status: "Successful", date: "2026-08-19" },
  { id: "ORD-10076", customer: "Kojo Antwi", course: "Personal Finance 101", amount: 350, status: "Successful", date: "2026-08-18" },
  { id: "ORD-10075", customer: "Esi Amankwah", course: "Public Speaking Confidence", amount: 300, status: "Pending", date: "2026-08-18" },
];

const TRANSACTIONS = [
  { id: "TXN-5541", type: "Commission", who: "Ama Boateng", amount: 200, status: "Completed", date: "2026-08-21" },
  { id: "TXN-5540", type: "Cashback", who: "John Mensah", amount: 100, status: "Completed", date: "2026-08-21" },
  { id: "TXN-5539", type: "Withdrawal", who: "Kofi Adjei", amount: 1500, status: "Processing", date: "2026-08-20" },
  { id: "TXN-5538", type: "Reward", who: "Akosua Nyarko", amount: 250, status: "Completed", date: "2026-08-20" },
  { id: "TXN-5537", type: "Payment", who: "Abena Darko", amount: 850, status: "Completed", date: "2026-08-20" },
  { id: "TXN-5536", type: "Commission", who: "Kwesi Boadu", amount: 340, status: "Completed", date: "2026-08-19" },
  { id: "TXN-5535", type: "Cashback", who: "Yaw Frimpong", amount: 120, status: "Completed", date: "2026-08-19" },
];

const REFERRALS = [
  { id: "REF-8821", agent: "Ama Boateng", customer: "Kwame Owusu", course: "Graphic Design Mastery", status: "Pending", commission: 0, date: "2026-08-20" },
  { id: "REF-8820", agent: "Kofi Adjei", customer: "Abena Darko", course: "E-commerce Launchpad", status: "Successful", commission: 340, date: "2026-08-20" },
  { id: "REF-8819", agent: "Akosua Nyarko", customer: "Kwabena Sarpong", course: "Content Creation Pro", status: "Failed", commission: 0, date: "2026-08-19" },
  { id: "REF-8818", agent: "Yaw Frimpong", customer: "Kojo Antwi", course: "Personal Finance 101", status: "Successful", commission: 140, date: "2026-08-18" },
  { id: "REF-8817", agent: "Kwesi Boadu", customer: "Adjoa Mensimah", course: "Digital Marketing", status: "Registered", commission: 0, date: "2026-08-17" },
  { id: "REF-8816", agent: "Esi Amankwah", customer: "Nana Yeboah", course: "Forex Fundamentals", status: "Successful", commission: 300, date: "2026-08-16" },
];

const WITHDRAWALS = [
  { id: "WD-3301", agent: "Kofi Adjei", amount: 1500, status: "Pending", date: "2026-08-21" },
  { id: "WD-3300", agent: "Akosua Nyarko", amount: 2200, status: "Pending", date: "2026-08-21" },
  { id: "WD-3299", agent: "Ama Boateng", amount: 900, status: "Paid", date: "2026-08-20" },
  { id: "WD-3298", agent: "Kwesi Boadu", amount: 640, status: "Pending", date: "2026-08-19" },
  { id: "WD-3297", agent: "Esi Amankwah", amount: 1100, status: "Paid", date: "2026-08-18" },
  { id: "WD-3296", agent: "Nana Yeboah", amount: 780, status: "Pending", date: "2026-08-17" },
];

const NOTIFICATIONS = [
  { id: 1, text: "12 new users registered today.", time: "10m ago", read: false },
  { id: 2, text: "8 withdrawals require attention.", time: "42m ago", read: false },
  { id: 3, text: "New course submitted for review.", time: "1h ago", read: false },
  { id: 4, text: "Agent AGT-10021 reached 20 successful referrals.", time: "3h ago", read: false },
  { id: 5, text: "New successful order received: ORD-10082.", time: "5h ago", read: true },
];

const ACTIVITIES = [
  { id: 1, text: "Kojo Antwi registered a new account.", time: "8m ago", kind: "user" },
  { id: 2, text: "John Mensah purchased Digital Marketing.", time: "25m ago", kind: "order" },
  { id: 3, text: "Ama Boateng earned commission on REF-8820.", time: "1h ago", kind: "commission" },
  { id: 4, text: "Akosua Nyarko became a Verified Agent.", time: "2h ago", kind: "verified" },
  { id: 5, text: "Kofi Adjei requested a withdrawal of GH\u20B51,500.", time: "4h ago", kind: "withdrawal" },
  { id: 6, text: "Graphic Design Mastery was published.", time: "6h ago", kind: "course" },
  { id: 7, text: "Esi Amankwah earned a platform reward.", time: "9h ago", kind: "reward" },
];

const SALES_SERIES = {
  "7D": [
    { label: "Mon", sales: 2200, orders: 5, revenue: 2200 }, { label: "Tue", sales: 3100, orders: 7, revenue: 3100 },
    { label: "Wed", sales: 1800, orders: 4, revenue: 1800 }, { label: "Thu", sales: 4200, orders: 9, revenue: 4200 },
    { label: "Fri", sales: 3600, orders: 8, revenue: 3600 }, { label: "Sat", sales: 5100, orders: 11, revenue: 5100 },
    { label: "Sun", sales: 4700, orders: 10, revenue: 4700 },
  ],
  "30D": Array.from({ length: 10 }, (_, i) => ({ label: `D${i * 3 + 1}`, sales: 2000 + Math.round(Math.sin(i) * 900 + i * 220), orders: 4 + (i % 6), revenue: 2000 + Math.round(Math.sin(i) * 900 + i * 220) })),
  "3M": [
    { label: "Jun", sales: 68000, orders: 142, revenue: 68000 }, { label: "Jul", sales: 81500, orders: 168, revenue: 81500 },
    { label: "Aug", sales: 92300, orders: 189, revenue: 92300 },
  ],
  "12M": ["Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug"].map((m, i) => ({ label: m, sales: 40000 + i * 5200 + (i % 3) * 3000, orders: 90 + i * 8, revenue: 40000 + i * 5200 + (i % 3) * 3000 })),
};

/* ---- derived, centrally-computed KPIs (Section 32/44/46: single source of truth) ----
   computeAccountStats() is called with the live `accounts` state everywhere it's needed
   (Dashboard, Users, Agents, Verification) so numbers never drift out of sync. */
function computeAccountStats(accounts) {
  const totalUsers = accounts.length;
  const totalAgents = accounts.filter((a) => a.type === "Agent" || a.type === "Verified Agent").length;
  const verifiedAgents = accounts.filter((a) => a.type === "Verified Agent").length;
  const pendingVerification = accounts.filter((a) => a.type === "Agent" && a.referrals < 20).length;
  const nearVerification = accounts.filter((a) => a.type === "Agent" && a.referrals >= 15 && a.referrals < 20).length;
  const newUsersCount = accounts.filter((a) => a.joined >= "2026-08-15").length;
  const activeUsersCount = accounts.filter((a) => a.status === "Active").length;
  const suspendedUsersCount = accounts.filter((a) => a.status === "Suspended").length;
  const pendingUsersCount = accounts.filter((a) => a.status === "Pending").length;
  return { totalUsers, totalAgents, verifiedAgents, pendingVerification, nearVerification, newUsersCount, activeUsersCount, suspendedUsersCount, pendingUsersCount };
}
const BASE_STATS = computeAccountStats(ACCOUNTS);
const totalCourses = COURSES.length;
const totalOrders = ORDERS.length;
const totalSales = ORDERS.filter((o) => o.status === "Successful").reduce((s, o) => s + o.amount, 0);
const pendingWithdrawalsList = WITHDRAWALS.filter((w) => w.status === "Pending");
const pendingWithdrawalsCount = pendingWithdrawalsList.length;
const pendingWithdrawalsAmount = pendingWithdrawalsList.reduce((s, w) => s + w.amount, 0);
const totalCommission = TRANSACTIONS.filter((t) => t.type === "Commission").reduce((s, t) => s + t.amount, 0);
const totalCashback = TRANSACTIONS.filter((t) => t.type === "Cashback").reduce((s, t) => s + t.amount, 0);
const totalRewards = TRANSACTIONS.filter((t) => t.type === "Reward").reduce((s, t) => s + t.amount, 0);
const totalWithdrawn = WITHDRAWALS.filter((w) => w.status === "Paid").reduce((s, w) => s + w.amount, 0);

/* ---- Stage B helpers: purchases/referrals looked up per person from centralized data ---- */
const purchasesFor = (name) => ORDERS.filter((o) => o.customer === name);
const referralsAsAgentFor = (name) => REFERRALS.filter((r) => r.agent === name);
const cashbackFor = (name) => TRANSACTIONS.filter((t) => t.who === name && t.type === "Cashback").reduce((s, t) => s + t.amount, 0);
const rewardFor = (name) => TRANSACTIONS.filter((t) => t.who === name && t.type === "Reward").reduce((s, t) => s + t.amount, 0);
const withdrawalsFor = (name) => WITHDRAWALS.filter((w) => w.agent === name);
const activityFor = (name) => ACTIVITIES.filter((a) => a.text.startsWith(name));
const verificationProgress = (referrals) => Math.min(100, Math.round((referrals / 20) * 100));

/* ============================================================
   STAGE C — COURSE & CONTENT MANAGEMENT (centralized demo data)
   COURSES (Stage A/B, simple {id,title,price}) is left untouched so
   existing agent/order lookups never break. COURSE_CATALOG below is
   the richer Stage C dataset — one course record is the single
   source of truth for every course-related tab in the dashboard.
   ============================================================ */
const DEFAULT_CATEGORIES = ["Business", "Technology", "Marketing", "Finance", "Personal Development", "Design", "Other"];

const COURSE_META = [
  { category: "Marketing", level: "Beginner", duration: "8 hours", instructor: "Naa Adjeley Quaye", status: "Published" },
  { category: "Finance", level: "Intermediate", duration: "12 hours", instructor: "Kwabena Osei-Tutu", status: "Published" },
  { category: "Design", level: "Beginner", duration: "10 hours", instructor: "Efe Larbi", status: "Published" },
  { category: "Business", level: "All Levels", duration: "6 hours", instructor: "Selorm Dade", status: "Draft" },
  { category: "Business", level: "Intermediate", duration: "4 weeks", instructor: "Naa Adjeley Quaye", status: "Published" },
  { category: "Marketing", level: "Beginner", duration: "8 hours", instructor: "Efe Larbi", status: "Archived" },
  { category: "Personal Development", level: "Beginner", duration: "5 hours", instructor: "Kwabena Osei-Tutu", status: "Published" },
  { category: "Personal Development", level: "All Levels", duration: "Self-paced", instructor: "Selorm Dade", status: "Draft" },
];

const LESSON_TYPES = ["VIDEO", "PDF", "AUDIO", "TEXT", "IMAGE"];
let __lessonSeq = 1;
let __moduleSeq = 1;
function makeLesson(moduleId, order, type, title) {
  const id = `LSN-${String(__lessonSeq++).padStart(4, "0")}`;
  const base = { id, moduleId, title, description: `Overview of "${title}".`, type, duration: type === "TEXT" ? "" : `${5 + order * 3} min`, order, resources: [] };
  if (type === "VIDEO") return { ...base, content: "https://videos.example.com/sample-lesson.mp4" };
  if (type === "PDF") return { ...base, content: "course-notes.pdf" };
  if (type === "AUDIO") return { ...base, content: "https://audio.example.com/sample-lesson.mp3" };
  if (type === "IMAGE") return { ...base, content: "diagram-overview.png" };
  return { ...base, content: `Key points covered in "${title}". Add headings, lists and links to build this lesson out.` };
}
function makeModules(courseId, titles) {
  return titles.map((mt, mi) => {
    const modId = `MOD-${String(__moduleSeq++).padStart(4, "0")}`;
    const lessonTitles = [`${mt} — Introduction`, `${mt} — Deep Dive`, `${mt} — Practical Walkthrough`].slice(0, 2 + (mi % 2));
    return {
      id: modId, courseId, title: mt, description: `What you'll cover in ${mt.toLowerCase()}.`, order: mi,
      lessons: lessonTitles.map((lt, li) => makeLesson(modId, li, LESSON_TYPES[(mi + li) % LESSON_TYPES.length], lt)),
    };
  });
}
const MODULE_TITLES_BY_COURSE = [
  ["Getting Started", "Campaign Strategy", "Measuring Results"],
  ["Market Basics", "Reading Charts", "Risk Management"],
  ["Design Foundations", "Typography & Color", "Building a Portfolio"],
  ["Affiliate Basics", "Growing Your Network"],
  ["Store Setup", "Product Sourcing", "Launch & Marketing"],
  ["Content Planning", "Production", "Distribution"],
  ["Budgeting Basics", "Saving & Investing"],
  ["Finding Your Voice", "Structuring a Talk", "Handling Nerves"],
];
const REVIEW_POOL = [
  { name: "Yaw Frimpong", rating: 5, text: "Clear, practical and easy to follow. I applied what I learned the same week." },
  { name: "Akosua Nyarko", rating: 4, text: "Solid course overall — a couple of sections could use more examples." },
  { name: "Kwame Owusu", rating: 5, text: "Exactly what I needed to get started. The instructor explains things well." },
  { name: "Adwoa Kusi", rating: 3, text: "Good content but some lessons felt a bit rushed toward the end." },
  { name: "Kojo Antwi", rating: 5, text: "Would recommend to anyone starting out. Great pacing and structure." },
  { name: "Esi Amankwah", rating: 4, text: "Practical and well organized. Helped me understand the fundamentals." },
];
function buildStudents(courseTitle, price) {
  const buyers = ORDERS.filter((o) => o.course === courseTitle);
  return buyers.map((o, i) => {
    const account = ACCOUNTS.find((a) => a.name === o.customer);
    const progress = o.status !== "Successful" ? 0 : [100, 100, 65, 40, 20, 0][i % 6];
    const completion = progress >= 100 ? "Completed" : progress > 0 ? "In Progress" : "Not Started";
    return {
      id: `STU-${o.id.split("-")[1]}`, name: o.customer, email: account?.email || `${o.customer.toLowerCase().replace(/\s+/g, ".")}@mail.com`,
      enrolledAt: o.date, progress, completion, lastActivityAt: account?.lastActivityAt || o.date,
      certificateStatus: completion === "Completed" ? "Issued" : "Not Eligible",
    };
  });
}
function buildReviews(courseId, n) {
  return Array.from({ length: n }, (_, i) => {
    const r = REVIEW_POOL[(courseId.charCodeAt(courseId.length - 1) + i) % REVIEW_POOL.length];
    return { id: `REV-${courseId.slice(-2)}${i}`, reviewer: r.name, rating: r.rating, review: r.text, verified: i % 3 !== 2, date: `2026-08-${10 + i}`, status: "Visible" };
  });
}
function buildCommunity(courseId, courseTitle, students) {
  const posts = [
    { id: `PST-${courseId.slice(-2)}1`, author: students[0]?.name || "A student", content: `Excited to be starting ${courseTitle}! Any tips for week one?`, pinned: false, hidden: false, date: "2026-08-19",
      comments: [{ id: `CMT-${courseId.slice(-2)}1`, author: "Community Team", text: "Welcome! Start with Module 1 and introduce yourself in the thread below.", hidden: false }] },
    { id: `PST-${courseId.slice(-2)}2`, author: "Admin", content: `Pinned: Weekly office hours are every Thursday — drop your questions here.`, pinned: true, hidden: false, date: "2026-08-15", comments: [] },
  ];
  return { members: Math.max(students.length, 3) + 4, posts };
}
function buildPromoMaterials(courseId, courseTitle, price) {
  return [
    { id: `PROMO-${courseId.slice(-2)}1`, type: "Course Flyer", title: `${courseTitle} — Launch Flyer`, description: "Square flyer for social sharing.", caption: `Start learning ${courseTitle} today. Explore the full course and learn practical strategies you can apply.`, status: "Active" },
    { id: `PROMO-${courseId.slice(-2)}2`, type: "Referral Message", title: `${courseTitle} — Referral Template`, description: "Message template for agents to share.", caption: `Check out ${courseTitle}. Learn practical skills and start your learning journey today — ${fmtGHS(price)}. [AGENT_REFERRAL_LINK]`, status: "Active" },
  ];
}
function buildCertificateSettings(courseId, enabled) {
  return {
    enabled, title: "Certificate of Completion", completionStatement: "has successfully completed the course",
    authorizedDesignation: "Summit Learning Academy", template: "Classic Gold", idPrefix: `CERT-${courseId.slice(-4)}`, requiredCompletionPct: 100,
  };
}
function buildActivity(title, status) {
  const events = [
    { text: "Course created", date: "2026-06-01" },
    { text: "Modules added", date: "2026-06-03" },
  ];
  if (status !== "Draft") events.push({ text: "Course published", date: "2026-06-10" });
  if (status === "Archived") events.push({ text: "Course archived", date: "2026-08-12" });
  return events.map((e, i) => ({ id: `ACT-${title.slice(0, 3).toUpperCase()}${i}`, ...e }));
}

const COURSE_CATALOG = COURSES.map((c, i) => {
  const meta = COURSE_META[i];
  const id = `COURSE-${10001 + i}`;
  const modules = makeModules(id, MODULE_TITLES_BY_COURSE[i]);
  const students = buildStudents(c.title, c.price);
  const successfulOrders = ORDERS.filter((o) => o.course === c.title && o.status === "Successful");
  const reviews = buildReviews(id, 2 + (i % 3));
  const avgRating = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : 0;
  return {
    id, title: c.title,
    shortDescription: `Practical, beginner-friendly training in ${c.title.toLowerCase()}.`,
    description: `This course walks you through everything you need to know about ${c.title.toLowerCase()}, from the fundamentals to real-world application. Delivered in short, focused lessons you can complete at your own pace.`,
    category: meta.category, price: c.price, thumbnail: null,
    instructor: { name: meta.instructor, bio: `${meta.instructor} is an experienced practitioner and instructor on the platform.` },
    level: meta.level, duration: meta.duration,
    tags: [meta.category, "Skills", c.title.split(" ")[0]],
    objectives: [`Understand the core concepts behind ${c.title.toLowerCase()}`, "Apply what you learn to real scenarios", "Build confidence to keep learning independently"],
    requirements: ["Basic computer knowledge", "Internet access", "No previous experience required"],
    targetAudience: ["Beginners", "Professionals", "Entrepreneurs"],
    status: meta.status,
    modules, students, reviews, avgRating,
    community: buildCommunity(id, c.title, students),
    promotionalMaterials: buildPromoMaterials(id, c.title, c.price),
    certificateSettings: buildCertificateSettings(id, meta.status !== "Draft"),
    activity: buildActivity(c.title, meta.status),
    sales: { totalSales: successfulOrders.reduce((s, o) => s + o.amount, 0), totalStudents: students.length, successfulOrders: successfulOrders.length },
    createdAt: "2026-06-01", updatedAt: "2026-08-15",
  };
});

function computeCourseStats(courses) {
  const totalCourses = courses.length;
  const published = courses.filter((c) => c.status === "Published").length;
  const draft = courses.filter((c) => c.status === "Draft").length;
  const archived = courses.filter((c) => c.status === "Archived").length;
  const totalStudents = courses.reduce((s, c) => s + c.students.length, 0);
  const totalCourseSales = courses.reduce((s, c) => s + c.sales.totalSales, 0);
  const ratedCourses = courses.filter((c) => c.reviews.length);
  const avgRating = ratedCourses.length ? Math.round((ratedCourses.reduce((s, c) => s + c.avgRating, 0) / ratedCourses.length) * 10) / 10 : 0;
  return { totalCourses, published, draft, archived, totalStudents, totalCourseSales, avgRating };
}
let __courseIdSeq = COURSE_CATALOG.length + 1;
function nextCourseId() { return `COURSE-${10000 + __courseIdSeq++}`; }

/* ============================================================
   STAGE D — FINANCIAL & PLATFORM OPERATIONS
   (centralized frontend demo data — everything below is derived
   from the same Stage A/B/C source arrays so numbers never drift)
   ============================================================ */

/* ---- Immutable platform business rules (Section 37/52 — do not change) ---- */
const CASHBACK_RATE = 0.20;              // 20% cashback on qualifying course purchases
const COMMISSION_RATE = 0.40;            // 40% referral commission
const VERIFIED_AGENT_REFERRALS = 20;     // 20 successful referrals = Verified Agent
const MIN_WITHDRAWAL = null;             // No minimum withdrawal
const MAX_WITHDRAWAL = null;             // No maximum withdrawal
const REWARD_MILESTONES = [
  { referrals: 10, window: "week", amount: 50 },
  { referrals: 15, window: "week", amount: 75 },
  { referrals: 20, window: "week", amount: 100 },
];

const PAYMENT_METHODS = ["Mobile Money", "Bank Transfer", "Card"];
function hashSeed(seed) { let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) % 97; return h; }
function paymentMethodFor(seed) { return PAYMENT_METHODS[hashSeed(seed) % PAYMENT_METHODS.length]; }
function refFor(prefix, seed) { return `${prefix}-${100000 + (hashSeed(seed) * 9973) % 900000}`; }

/* ---- Orders (Section 9/10/11): richer records derived from Stage A ORDERS.
   ORDERS itself is left untouched so Stage C course-sales lookups never break. ---- */
const ORDER_RECORDS = ORDERS.map((o) => {
  const account = ACCOUNTS.find((a) => a.name === o.customer);
  const course = COURSE_CATALOG.find((c) => c.title === o.course) || COURSES.find((c) => c.title === o.course);
  const referral = REFERRALS.find((r) => r.customer === o.customer && r.course === o.course);
  const agentAccount = referral ? ACCOUNTS.find((a) => a.name === referral.agent) : null;
  const qualifies = o.status === "Successful";
  const cashbackAmount = qualifies ? Math.round(o.amount * CASHBACK_RATE) : 0;
  const commissionAmount = qualifies && agentAccount ? Math.round(o.amount * COMMISSION_RATE) : 0;
  return {
    id: o.id, customer: o.customer, customerEmail: account?.email || "—", customerPhone: account?.phone || "—",
    courseId: course?.id || null, course: o.course, amount: o.amount,
    paymentStatus: o.status, paymentMethod: paymentMethodFor(o.id), paymentReference: refFor("PSK", o.id),
    date: o.date,
    agentId: agentAccount?.agentId || null, agentName: agentAccount?.name || null,
    cashbackAmount, commissionAmount,
    courseAccess: qualifies ? "Granted" : "Not granted",
    certificateStatus: qualifies ? "Not yet issued" : "Not applicable",
  };
});
const totalOrdersD = ORDER_RECORDS.length;

/* ---- Rewards (Section 16/17): demo reward payouts against the milestone structure ---- */
const REWARD_RECORDS = [
  { id: "RWD-9001", userId: "USR-1008", user: "Akosua Nyarko", type: "Weekly Referral Reward", milestone: "20 successful referrals in a week", amount: 100, status: "Completed", date: "2026-08-20" },
  { id: "RWD-9002", userId: "USR-1005", user: "Kofi Adjei", type: "Weekly Referral Reward", milestone: "15 successful referrals in a week", amount: 75, status: "Completed", date: "2026-08-18" },
  { id: "RWD-9003", userId: "USR-1013", user: "Kwesi Boadu", type: "Weekly Referral Reward", milestone: "10 successful referrals in a week", amount: 50, status: "Pending", date: "2026-08-21" },
  { id: "RWD-9004", userId: "USR-1002", user: "Ama Boateng", type: "Weekly Referral Reward", milestone: "20 successful referrals in a week", amount: 100, status: "Completed", date: "2026-08-14" },
];

/* ---- Withdrawals (Section 18–27): mutable demo queue (approve/reject lives in App state) ---- */
const BASE_WITHDRAWAL_RECORDS = [
  { id: "WD-3301", userId: "USR-1005", user: "Kofi Adjei", accountType: "Verified Agent", amount: 1500, balanceSource: "Commission Balance", status: "Pending", paymentMethod: "Mobile Money", requestedAt: "2026-08-21", processedAt: null, reference: refFor("WDR", "WD-3301"), rejectionReason: null },
  { id: "WD-3300", userId: "USR-1008", user: "Akosua Nyarko", accountType: "Verified Agent", amount: 2200, balanceSource: "Commission Balance", status: "Pending", paymentMethod: "Bank Transfer", requestedAt: "2026-08-21", processedAt: null, reference: refFor("WDR", "WD-3300"), rejectionReason: null },
  { id: "WD-3299", userId: "USR-1002", user: "Ama Boateng", accountType: "Verified Agent", amount: 900, balanceSource: "Cashback Balance", status: "Completed", paymentMethod: "Mobile Money", requestedAt: "2026-08-19", processedAt: "2026-08-20", reference: refFor("WDR", "WD-3299"), rejectionReason: null },
  { id: "WD-3298", userId: "USR-1013", user: "Kwesi Boadu", accountType: "Verified Agent", amount: 640, balanceSource: "Reward Balance", status: "Processing", paymentMethod: "Mobile Money", requestedAt: "2026-08-19", processedAt: "2026-08-19", reference: refFor("WDR", "WD-3298"), rejectionReason: null },
  { id: "WD-3297", userId: "USR-1012", user: "Esi Amankwah", accountType: "Agent", amount: 1100, balanceSource: "Commission Balance", status: "Completed", paymentMethod: "Bank Transfer", requestedAt: "2026-08-17", processedAt: "2026-08-18", reference: refFor("WDR", "WD-3297"), rejectionReason: null },
  { id: "WD-3296", userId: "USR-1015", user: "Nana Yeboah", accountType: "Agent", amount: 780, balanceSource: "Commission Balance", status: "Failed", paymentMethod: "Mobile Money", requestedAt: "2026-08-16", processedAt: "2026-08-16", reference: refFor("WDR", "WD-3296"), rejectionReason: "Invalid payment details" },
  { id: "WD-3295", userId: "USR-1007", user: "Yaw Frimpong", accountType: "Agent", amount: 520, balanceSource: "Commission Balance", status: "Pending", paymentMethod: "Mobile Money", requestedAt: "2026-08-15", processedAt: null, reference: refFor("WDR", "WD-3295"), rejectionReason: null },
];

const REJECTION_REASONS = ["Invalid payment details", "Insufficient verified balance", "Account verification issue", "Other"];

/* ---- Transactions (Section 3–8/45): the single centralized ledger.
   Built from orders + rewards + withdrawals so Transactions, Cashback,
   Commissions, Rewards, Withdrawals and the Dashboard never contradict
   each other (Section 46). ---- */
function buildTransactionRecords(orderRecords, rewardRecords, withdrawalRecords) {
  const txns = [];
  orderRecords.forEach((o) => {
    const buyer = ACCOUNTS.find((a) => a.name === o.customer);
    txns.push({
      id: `TXN-P${o.id.slice(-4)}`, userId: buyer?.id || null, user: o.customer, email: o.customerEmail,
      type: "Course Purchase", amount: o.amount, status: o.paymentStatus, paymentMethod: o.paymentMethod,
      reference: o.paymentReference, courseId: o.courseId, course: o.course, orderId: o.id, date: o.date,
    });
    if (o.cashbackAmount > 0) {
      txns.push({
        id: `TXN-C${o.id.slice(-4)}`, userId: buyer?.id || null, user: o.customer, email: o.customerEmail,
        type: "Cashback", amount: o.cashbackAmount, status: "Successful", paymentMethod: "Wallet Credit",
        reference: refFor("CB", o.id), courseId: o.courseId, course: o.course, orderId: o.id, date: o.date,
      });
    }
    if (o.commissionAmount > 0) {
      const agent = ACCOUNTS.find((a) => a.name === o.agentName);
      txns.push({
        id: `TXN-M${o.id.slice(-4)}`, userId: agent?.id || null, user: o.agentName, email: agent?.email || "—",
        type: "Commission", amount: o.commissionAmount, status: "Successful", paymentMethod: "Wallet Credit",
        reference: refFor("CM", o.id), courseId: o.courseId, course: o.course, orderId: o.id, date: o.date,
      });
    }
  });
  rewardRecords.forEach((r) => {
    txns.push({
      id: `TXN-R${r.id.slice(-4)}`, userId: r.userId, user: r.user, email: ACCOUNTS.find((a) => a.id === r.userId)?.email || "—",
      type: "Reward", amount: r.amount, status: r.status === "Completed" ? "Successful" : "Pending", paymentMethod: "Wallet Credit",
      reference: refFor("RW", r.id), courseId: null, course: null, orderId: null, date: r.date,
    });
  });
  withdrawalRecords.forEach((w) => {
    const status = w.status === "Completed" ? "Successful" : w.status === "Failed" ? "Failed" : w.status === "Processing" ? "Processing" : "Pending";
    txns.push({
      id: `TXN-W${w.id.slice(-4)}`, userId: w.userId, user: w.user, email: ACCOUNTS.find((a) => a.id === w.userId)?.email || "—",
      type: "Withdrawal", amount: w.amount, status, paymentMethod: w.paymentMethod,
      reference: w.reference, courseId: null, course: null, orderId: null, date: w.requestedAt,
    });
  });
  return txns.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
const TRANSACTION_TYPES = ["Course Purchase", "Cashback", "Commission", "Reward", "Withdrawal"];
const TRANSACTION_STATUSES = ["Successful", "Pending", "Failed", "Processing"];

/* ---- Section 1/44/46: single source of truth for every financial KPI on the platform ---- */
function computeFinanceStats(transactions, orderRecords, withdrawalRecords) {
  const totalRevenue = orderRecords.filter((o) => o.paymentStatus === "Successful").reduce((s, o) => s + o.amount, 0);
  const totalCourseSales = totalRevenue;
  const totalCashbackIssued = transactions.filter((t) => t.type === "Cashback").reduce((s, t) => s + t.amount, 0);
  const totalCommission = transactions.filter((t) => t.type === "Commission").reduce((s, t) => s + t.amount, 0);
  const successfulCommission = transactions.filter((t) => t.type === "Commission" && t.status === "Successful").reduce((s, t) => s + t.amount, 0);
  const pendingCommission = totalCommission - successfulCommission;
  const totalRewards = transactions.filter((t) => t.type === "Reward").reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = withdrawalRecords.filter((w) => w.status === "Completed").reduce((s, w) => s + w.amount, 0);
  const pendingWithdrawalsList = withdrawalRecords.filter((w) => w.status === "Pending");
  const pendingWithdrawals = pendingWithdrawalsList.reduce((s, w) => s + w.amount, 0);
  const cashbackRecipients = new Set(transactions.filter((t) => t.type === "Cashback").map((t) => t.user)).size;
  const pendingCashback = transactions.filter((t) => t.type === "Cashback" && t.status !== "Successful").reduce((s, t) => s + t.amount, 0);
  const availableCashback = totalCashbackIssued - pendingCashback;
  const commissionAgents = new Set(transactions.filter((t) => t.type === "Commission").map((t) => t.user)).size;
  const rewardRecipients = new Set(transactions.filter((t) => t.type === "Reward").map((t) => t.user)).size;
  const availableBalance = totalRevenue - totalCashbackIssued - totalCommission - totalRewards - totalWithdrawals;
  const cashbackBalance = totalCashbackIssued - transactions.filter((t) => t.type === "Withdrawal" && t.status === "Successful").length ? Math.max(0, availableCashback) : availableCashback;
  return {
    totalRevenue, totalCourseSales, totalCashbackIssued, pendingCashback, availableCashback, cashbackRecipients,
    totalCommission, successfulCommission, pendingCommission, commissionAgents,
    totalRewards, rewardRecipients,
    totalWithdrawals, pendingWithdrawals, pendingWithdrawalsCount: pendingWithdrawalsList.length,
    availableBalance,
    cashbackBalance: Math.max(0, availableCashback),
    commissionBalance: Math.max(0, successfulCommission - totalWithdrawals * 0), // balances tracked independently in demo
    rewardBalance: Math.max(0, totalRewards),
  };
}

const REVENUE_SERIES = {
  "7D": SALES_SERIES["7D"], "30D": SALES_SERIES["30D"], "90D": SALES_SERIES["3M"], "12M": SALES_SERIES["12M"],
};

/* ---- Section 35–40: frontend-only settings (Section 38 — not wired to real
   backend calculations; a future Node.js/Express backend enforces these). ---- */
const DEFAULT_SETTINGS = {
  platform: {
    platformName: "Summit Learning Academy",
    supportEmail: "support@summitlearning.com",
    supportPhone: "+233 24 000 0000",
    currency: "GHS — Ghanaian Cedi",
    timezone: "GMT (Accra)",
  },
  businessRules: {
    cashbackPercentage: CASHBACK_RATE * 100,
    commissionPercentage: COMMISSION_RATE * 100,
    verifiedAgentReferrals: VERIFIED_AGENT_REFERRALS,
    minWithdrawal: "No minimum",
    maxWithdrawal: "No maximum",
    rewardMilestones: REWARD_MILESTONES,
  },
  payment: { provider: "Paystack", status: "DEMO / NOT CONNECTED" },
  notifications: {
    "New User": true, "New Agent": true, "New Course Purchase": true, "New Withdrawal": true,
    "New Review": true, "New Community Activity": false, "Low Balance Alert": true,
  },
};

/* ============================================================
   NAVIGATION
   ============================================================ */
const NAV = [
  { section: "OVERVIEW", items: [{ key: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  { section: "MANAGEMENT", items: [
    { key: "users", label: "Users", icon: Users },
    { key: "agents", label: "Agents", icon: UserCheck },
    { key: "courses", label: "Courses", icon: BookOpen },
    { key: "orders", label: "Orders", icon: ShoppingCart },
  ]},
  { section: "FINANCE", items: [
    { key: "transactions", label: "Transactions", icon: ArrowLeftRight },
    { key: "withdrawals", label: "Withdrawals", icon: Wallet },
    { key: "cashback", label: "Cashback", icon: Gift },
    { key: "commissions", label: "Commissions", icon: Percent },
    { key: "rewards", label: "Rewards", icon: Award },
  ]},
  { section: "REFERRAL & GROWTH", items: [
    { key: "referrals", label: "Referrals", icon: Share2 },
    { key: "promotions", label: "Promotions", icon: Megaphone },
    { key: "verification", label: "Verification", icon: ShieldCheck },
  ]},
  { section: "CONTENT", items: [
    { key: "communities", label: "Communities", icon: MessagesSquare },
    { key: "certificates", label: "Certificates", icon: FileBadge2 },
    { key: "notifications", label: "Notifications", icon: Bell },
  ]},
  { section: "ANALYTICS", items: [
    { key: "reports", label: "Reports", icon: FileText },
    { key: "analytics", label: "Analytics", icon: BarChart3 },
  ]},
  { section: "SYSTEM", items: [
    { key: "settings", label: "Settings", icon: Settings },
    { key: "profile", label: "Admin Profile", icon: User },
  ]},
];
const NAV_LABELS = Object.fromEntries(NAV.flatMap((s) => s.items).map((i) => [i.key, i.label]));

/* ============================================================
   SHARED UI COMPONENTS
   ============================================================ */
function StatusBadge({ status }) {
  const map = {
    Successful: ["green", CheckCircle2], Completed: ["green", CheckCircle2], Active: ["green", CheckCircle2], Paid: ["green", CheckCircle2],
    Pending: ["amber", Clock], Processing: ["amber", Clock], Registered: ["amber", Clock],
    Failed: ["red", XCircle], Inactive: ["red", XCircle], Rejected: ["red", XCircle], Suspended: ["red", XCircle],
  };
  const [tone, Icon] = map[status] || ["blue", Clock];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: `var(--${tone}-soft)`, color: `var(--${tone})` }}
    >
      <Icon size={12} strokeWidth={2.5} />
      {status}
    </span>
  );
}

function TypeBadge({ type }) {
  const isVerified = type === "Verified Agent";
  const isAgent = type === "Agent";
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
      style={{
        background: isVerified ? "var(--accent-gold-soft)" : isAgent ? "var(--blue-soft)" : "var(--border-soft)",
        color: isVerified ? "var(--accent-gold)" : isAgent ? "var(--blue)" : "var(--text-soft)",
      }}>
      {isVerified && <BadgeCheck size={12} strokeWidth={2.5} />}
      {type}
    </span>
  );
}

function TxTypeBadge({ type }) {
  const map = {
    "Course Purchase": ["blue", ShoppingCart], Cashback: ["green", Gift], Commission: ["amber", Percent],
    Reward: ["gold", Award], Withdrawal: ["red", Wallet],
  };
  const [tone, Icon] = map[type] || ["blue", ArrowLeftRight];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: tone === "gold" ? "var(--accent-gold-soft)" : `var(--${tone}-soft)`, color: tone === "gold" ? "var(--accent-gold)" : `var(--${tone})` }}>
      <Icon size={12} strokeWidth={2.5} />
      {type}
    </span>
  );
}

function Avatar({ name, size = 34 }) {
  const hue = useMemo(() => {
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h;
  }, [name]);
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold font-display shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${hue} 55% 92%)`, color: `hsl(${hue} 45% 32%)` }}
    >
      {initials(name)}
    </div>
  );
}

function Skeleton({ className = "", style = {} }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

function EmptyState({ title = "Nothing to show yet", subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="w-11 h-11 rounded-full flex items-center justify-center mb-3" style={{ background: "var(--border-soft)" }}>
        <Inbox size={20} color="var(--text-mute)" />
      </div>
      <p className="text-sm font-medium" style={{ color: "var(--text-soft)" }}>{title}</p>
      {subtitle && <p className="text-xs mt-1" style={{ color: "var(--text-mute)" }}>{subtitle}</p>}
    </div>
  );
}

function ErrorState({ message = "Unable to load this data.", onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="w-11 h-11 rounded-full flex items-center justify-center mb-3" style={{ background: "var(--red-soft)" }}>
        <AlertTriangle size={20} color="var(--red)" />
      </div>
      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{message}</p>
      <button onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>
        <RefreshCw size={13} /> TRY AGAIN
      </button>
    </div>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h3 className="font-display font-semibold text-[15px]" style={{ color: "var(--text)" }}>{title}</h3>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: "var(--text-mute)" }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, delta, deltaLabel = "vs last month", tone = "blue", loading, featured }) {
  if (loading) {
    return (
      <div className="card p-4">
        <Skeleton className="w-8 h-8 mb-3" />
        <Skeleton className="w-20 h-3 mb-2" />
        <Skeleton className="w-24 h-6" />
      </div>
    );
  }
  const positive = delta >= 0;
  return (
    <div className="card p-4 relative overflow-hidden fade-in" style={featured ? { borderLeft: "3px solid var(--accent-gold)" } : {}}>
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `var(--${tone}-soft)` }}>
          <Icon size={17} color={`var(--${tone})`} strokeWidth={2.2} />
        </div>
        {delta !== undefined && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: positive ? "var(--green)" : "var(--red)" }}>
            {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {positive ? "+" : ""}{delta}%
          </span>
        )}
      </div>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>{label}</p>
      <p className="font-mono font-semibold text-[21px] mt-1" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>{value}</p>
      {delta !== undefined && <p className="text-[11px] mt-1" style={{ color: "var(--text-mute)" }}>{deltaLabel}</p>}
    </div>
  );
}

function DataTable({ columns, rows, loading, emptyTitle = "No records yet.", renderActions }) {
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }
  if (!rows || rows.length === 0) return <EmptyState title={emptyTitle} />;
  return (
    <div className="overflow-x-auto admin-scroll">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {columns.map((c) => (
              <th key={c.key} className="text-left font-medium py-2.5 px-3 whitespace-nowrap text-[11px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>{c.label}</th>
            ))}
            {renderActions && <th className="text-right py-2.5 px-3 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="fade-in" style={{ borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--border-soft)" }}>
              {columns.map((c) => (
                <td key={c.key} className="py-2.5 px-3 align-middle whitespace-nowrap" style={{ color: "var(--text)" }}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
              {renderActions && <td className="py-2.5 px-3 text-right">{renderActions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ViewButton({ onClick }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>
      <Eye size={13} /> VIEW
    </button>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(10,14,23,0.55)" }} onClick={onClose}>
      <div className="card w-full max-w-md max-h-[80vh] overflow-y-auto admin-scroll fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="font-display font-semibold text-[15px]">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:opacity-70"><X size={17} /></button>
        </div>
        <div className="p-5 text-sm" style={{ color: "var(--text-soft)" }}>{children}</div>
      </div>
    </div>
  );
}

/* ============================================================
   LOGIN PAGE
   ============================================================ */
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Real POST /auth/login (same endpoint the main site uses). The backend
  // is the sole authority on role — requireRole("ADMIN","SUPER_ADMIN") on
  // every /admin/* route (src/middleware/authorize.js) re-checks this on
  // every request regardless of what this page decides, so there is no
  // way for a non-admin to reach protected data even if this check were
  // bypassed client-side. This check just avoids showing the admin shell
  // to someone who will immediately get 403s from every request.
  const submit = (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase(), password }) })
      .then(({ user, tokens }) => {
        if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
          clearAdminTokens();
          setError("This account does not have admin access.");
          setBusy(false);
          return;
        }
        setAdminToken(tokens.accessToken);
        setAdminRefresh(tokens.refreshToken);
        setBusy(false);
        onLogin(user);
      })
      .catch(err => {
        setBusy(false);
        setError(err.message || "Login failed.");
      });
  };

  return (
    <div className="admin-root min-h-screen w-full flex items-center justify-center p-4" style={{ background: "var(--sidebar)" }}>
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center mb-7">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: "var(--accent-gold-soft)" }}>
            <ShieldAlert size={22} color="var(--accent-gold)" />
          </div>
          <p className="font-display font-bold text-lg text-white tracking-tight">Summit Learning</p>
          <p className="text-[11px] font-semibold tracking-[0.2em] mt-1" style={{ color: "var(--accent-gold)" }}>ADMIN PORTAL</p>
        </div>

        <form onSubmit={submit} className="card p-6" style={{ background: "var(--sidebar-alt)", borderColor: "#232B45" }}>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--sidebar-text)" }}>Email address</label>
          <div className="flex items-center gap-2 rounded-lg px-3 mb-4" style={{ background: "#0B1120", border: "1px solid #232B45" }}>
            <Mail size={15} color="#5B6478" />
            <input
              value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
              className="w-full bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-[#5B6478]"
              placeholder="you@platform.com"
            />
          </div>

          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--sidebar-text)" }}>Password</label>
          <div className="flex items-center gap-2 rounded-lg px-3 mb-4" style={{ background: "#0B1120", border: "1px solid #232B45" }}>
            <Lock size={15} color="#5B6478" />
            <input
              value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
              className="w-full bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-[#5B6478]"
            />
          </div>

          {error && (
            <div className="rounded-lg px-3 py-2.5 mb-4 text-xs font-medium" style={{ background: "rgba(193,58,58,0.15)", color: "#F0A0A0" }}>
              {error}
            </div>
          )}

          <div className="flex items-center justify-between mb-5">
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--sidebar-text)" }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-[color:var(--accent-gold)]" />
              Remember me
            </label>
          </div>

          <button type="submit" disabled={busy} className="w-full py-2.5 rounded-lg text-sm font-semibold font-display" style={{ background: "var(--accent-gold)", color: "#1A1305" }}>
            {busy ? "Signing in…" : "LOGIN"}
          </button>
          <p className="text-center text-[11px] mt-4" style={{ color: "#5B6478" }}>Real admin login — the backend verifies your role on every request.</p>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   SIDEBAR
   ============================================================ */
function AdminSidebar({ current, onNavigate, collapsed, mobileOpen, setMobileOpen }) {
  const width = collapsed ? "w-[74px]" : "w-[248px]";
  const content = (
    <div className={`h-full flex flex-col ${width} transition-all duration-200`} style={{ background: "var(--sidebar)" }}>
      <div className="flex items-center gap-2.5 px-5 h-16 shrink-0" style={{ borderBottom: "1px solid #1B2233" }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--accent-gold-soft)" }}>
          <ShieldAlert size={16} color="var(--accent-gold)" />
        </div>
        {!collapsed && <span className="font-display font-bold text-[15px] text-white truncate">Summit Admin</span>}
        <button className="ml-auto lg:hidden text-white/70" onClick={() => setMobileOpen(false)}><X size={18} /></button>
      </div>
      <nav className="flex-1 overflow-y-auto admin-scroll py-3 px-2.5">
        {NAV.map((sec) => (
          <div key={sec.section} className="mb-4">
            {!collapsed && <p className="px-2.5 mb-1.5 text-[10px] font-semibold tracking-[0.14em]" style={{ color: "#4C566E" }}>{sec.section}</p>}
            <div className="space-y-0.5">
              {sec.items.map((item) => {
                const Icon = item.icon;
                const active = current === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => { onNavigate(item.key); setMobileOpen(false); }}
                    className={`nav-item w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium ${active ? "active" : ""}`}
                    style={{ color: active ? "var(--sidebar-text-active)" : "var(--sidebar-text)" }}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={16} strokeWidth={2} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-2.5 shrink-0" style={{ borderTop: "1px solid #1B2233" }}>
        <button
          onClick={() => onNavigate("__logout__")}
          className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium"
          style={{ color: "var(--sidebar-text)" }}
        >
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block h-screen sticky top-0 shrink-0">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <div className="absolute inset-0" style={{ background: "rgba(10,14,23,0.55)" }} onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full">{content}</div>
        </div>
      )}
    </>
  );
}

/* ============================================================
   HEADER
   ============================================================ */
function AdminHeader({ title, onMenuClick, theme, setTheme, notifications, setNotifications, onNavigate, accounts = ACCOUNTS, courses = COURSE_CATALOG, orders = ORDER_RECORDS, transactions = [], withdrawals = BASE_WITHDRAWAL_RECORDS }) {
  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    accounts.filter((a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
      .slice(0, 3).forEach((a) => out.push({ kind: a.type === "User" ? "User" : "Agent", label: a.name, sub: a.id, nav: a.type === "User" ? "users" : "agents" }));
    courses.filter((c) => c.title.toLowerCase().includes(q)).slice(0, 3)
      .forEach((c) => out.push({ kind: "Course", label: c.title, sub: c.id, nav: "courses" }));
    orders.filter((o) => o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q)).slice(0, 3)
      .forEach((o) => out.push({ kind: "Order", label: o.id, sub: o.customer, nav: "orders" }));
    transactions.filter((t) => t.id.toLowerCase().includes(q) || (t.user || "").toLowerCase().includes(q) || (t.reference || "").toLowerCase().includes(q)).slice(0, 3)
      .forEach((t) => out.push({ kind: "Transaction", label: t.id, sub: t.user, nav: "transactions" }));
    withdrawals.filter((w) => w.id.toLowerCase().includes(q) || w.user.toLowerCase().includes(q)).slice(0, 3)
      .forEach((w) => out.push({ kind: "Withdrawal", label: w.id, sub: w.user, nav: "withdrawals" }));
    if ("reports".includes(q) || "report".includes(q)) out.push({ kind: "Report", label: "Reports", sub: "Platform reporting", nav: "reports" });
    return out.slice(0, 10);
  }, [query, accounts, courses, orders, transactions, withdrawals]);

  return (
    <header className="sticky top-0 z-[60] h-16 flex items-center gap-3 px-4 lg:px-6" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      <button className="lg:hidden p-1.5 -ml-1.5" onClick={onMenuClick}><Menu size={20} /></button>
      <h1 className="font-display font-semibold text-[16px] shrink-0 hidden sm:block">{title}</h1>

      <div className="relative flex-1 max-w-md ml-2 hidden md:block">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
          <Search size={15} color="var(--text-mute)" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
            placeholder="Search users, agents, courses, orders, transactions…"
            className="bg-transparent text-sm w-full outline-none" style={{ color: "var(--text)" }}
          />
          {query && <button onClick={() => setQuery("")}><X size={13} color="var(--text-mute)" /></button>}
        </div>
        {showResults && query && (
          <div className="absolute left-0 right-0 top-full mt-1.5 card overflow-hidden fade-in z-[80]" onMouseLeave={() => setShowResults(false)}>
            {results.length === 0 ? (
              <div className="px-4 py-4"><EmptyState title="No results found." subtitle="Try a different search term." /></div>
            ) : (
              <div className="max-h-80 overflow-y-auto admin-scroll">
                {results.map((r, i) => (
                  <button key={i} onClick={() => { onNavigate && onNavigate(r.nav); setQuery(""); setShowResults(false); }}
                    className="w-full flex items-center justify-between gap-2 text-left px-4 py-2.5" style={{ borderBottom: "1px solid var(--border-soft)" }}>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>{r.label}</p>
                      {r.sub && <p className="text-[11px] truncate" style={{ color: "var(--text-mute)" }}>{r.sub}</p>}
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full shrink-0" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>{r.kind}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="p-2 rounded-lg" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }} aria-label="Toggle theme">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="relative">
          <button onClick={() => { setShowNotif((v) => !v); setShowProfile(false); }} className="relative p-2 rounded-lg" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }} aria-label="Notifications">
            <Bell size={16} />
            {unread > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white" style={{ background: "var(--red)" }}>{unread}</span>}
          </button>
          {showNotif && (
            <div className="absolute right-0 mt-2 w-80 card overflow-hidden fade-in" style={{ zIndex: 70 }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-sm font-semibold">Notifications</span>
                <button onClick={() => setNotifications((ns) => ns.map((n) => ({ ...n, read: true })))} className="text-xs font-medium" style={{ color: "var(--blue)" }}>Mark all as read</button>
              </div>
              <div className="max-h-80 overflow-y-auto admin-scroll">
                {notifications.length === 0 ? <EmptyState title="No new notifications." /> : notifications.map((n) => (
                  <button key={n.id} onClick={() => setNotifications((ns) => ns.map((x) => x.id === n.id ? { ...x, read: true } : x))}
                    className="w-full text-left px-4 py-3 flex gap-2.5" style={{ borderBottom: "1px solid var(--border-soft)", background: n.read ? "transparent" : "var(--blue-soft)" }}>
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: n.read ? "transparent" : "var(--blue)" }} />
                    <div>
                      <p className="text-[13px]" style={{ color: "var(--text)" }}>{n.text}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-mute)" }}>{n.time}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button onClick={() => { setShowProfile((v) => !v); setShowNotif(false); }} className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg" style={{ border: "1px solid var(--border)" }}>
            <Avatar name="Grace Owusu-Ansah" size={28} />
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold leading-tight">Grace Owusu-Ansah</p>
              <p className="text-[10px] leading-tight" style={{ color: "var(--accent-gold)" }}>SUPER ADMIN</p>
            </div>
            <ChevronDown size={14} color="var(--text-mute)" />
          </button>
          {showProfile && (
            <div className="absolute right-0 mt-2 w-52 card overflow-hidden fade-in" style={{ zIndex: 70 }}>
              {[["Admin Profile", User], ["Account Settings", Settings], ["Notifications", Bell]].map(([label, Icon]) => (
                <button key={label} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm" style={{ color: "var(--text)" }}>
                  <Icon size={15} color="var(--text-mute)" /> {label}
                </button>
              ))}
              <div style={{ borderTop: "1px solid var(--border)" }}>
                <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium" style={{ color: "var(--red)" }}>
                  <LogOut size={15} /> Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   DASHBOARD SUB-SECTIONS
   ============================================================ */
function DateFilter({ value, onChange }) {
  const options = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "This Month", "Last Month", "This Year"];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="text-xs font-medium rounded-lg px-3 py-2 outline-none" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

function SalesOverview({ loading }) {
  const [period, setPeriod] = useState("30D");
  const data = SALES_SERIES[period];
  return (
    <div className="card p-4 sm:p-5 fade-in">
      <SectionHeader title="Sales Overview" subtitle="Sales, orders and revenue trend"
        action={
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
            {["7D", "30D", "3M", "12M"].map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className="px-2.5 py-1 rounded-md text-[11px] font-semibold"
                style={{ background: period === p ? "var(--blue)" : "transparent", color: period === p ? "#fff" : "var(--text-soft)" }}>{p}</button>
            ))}
          </div>
        }
      />
      {loading ? <Skeleton className="h-56 w-full" /> : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--blue)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-mute)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-mute)" }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                formatter={(v, n) => [n === "sales" ? fmtGHS(v) : v, n === "sales" ? "Sales" : n === "orders" ? "Orders" : "Revenue"]}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
              />
              <Area type="monotone" dataKey="sales" stroke="var(--blue)" strokeWidth={2} fill="url(#salesFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function RevenueSummary({ loading, financeStats }) {
  const fs = financeStats || computeFinanceStats(buildTransactionRecords(ORDER_RECORDS, REWARD_RECORDS, BASE_WITHDRAWAL_RECORDS), ORDER_RECORDS, BASE_WITHDRAWAL_RECORDS);
  const rows = [
    { label: "Total Revenue", value: fs.totalRevenue, tone: "blue" },
    { label: "Course Sales", value: fs.totalCourseSales, tone: "blue" },
    { label: "Commission Paid", value: fs.totalCommission, tone: "amber" },
    { label: "Cashback Paid", value: fs.totalCashbackIssued, tone: "green" },
    { label: "Rewards Paid", value: fs.totalRewards, tone: "gold" },
    { label: "Withdrawals", value: fs.totalWithdrawals, tone: "red" },
  ];
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="card p-4 sm:p-5 fade-in">
      <SectionHeader title="Revenue Summary" subtitle="Administrative reporting values" />
      {loading ? <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div> : (
        <div className="space-y-3.5">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: "var(--text-soft)" }}>{r.label}</span>
                <span className="font-mono text-xs font-semibold">{fmtGHS(r.value)}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-soft)" }}>
                <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.tone === "gold" ? "var(--accent-gold)" : `var(--${r.tone})` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserOverview({ loading, accounts = ACCOUNTS }) {
  const s = useMemo(() => computeAccountStats(accounts), [accounts]);
  const pieData = [
    { name: "Users", value: s.totalUsers - s.totalAgents, color: "var(--blue)" },
    { name: "Agents", value: s.totalAgents - s.verifiedAgents, color: "var(--amber)" },
    { name: "Verified Agents", value: s.verifiedAgents, color: "var(--accent-gold)" },
  ];
  const stats = [
    ["Total Users", s.totalUsers], ["New Users", s.newUsersCount], ["Active Users", s.activeUsersCount],
    ["Suspended Users", s.suspendedUsersCount], ["Agents", s.totalAgents], ["Verified Agents", s.verifiedAgents],
  ];
  return (
    <div className="card p-4 sm:p-5 fade-in">
      <SectionHeader title="User Overview" />
      {loading ? <Skeleton className="h-40 w-full" /> : (
        <div className="flex items-center gap-5">
          <div className="w-28 h-28 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={32} outerRadius={52} paddingAngle={2} stroke="none">
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 flex-1">
            {stats.map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>{label}</p>
                <p className="font-mono text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VerificationOverview({ loading, accounts = ACCOUNTS }) {
  const s = useMemo(() => computeAccountStats(accounts), [accounts]);
  const items = [
    { label: "Verified", value: s.verifiedAgents, tone: "gold" },
    { label: "Pending", value: s.pendingVerification, tone: "amber" },
    { label: "Near Verification", value: s.nearVerification, tone: "blue" },
  ];
  return (
    <div className="card p-4 sm:p-5 fade-in">
      <SectionHeader title="Verification Overview" subtitle="20 successful referrals = Verified Agent" />
      {loading ? <Skeleton className="h-20 w-full" /> : (
        <div className="grid grid-cols-3 gap-3">
          {items.map((it) => (
            <div key={it.label} className="rounded-xl p-3 text-center" style={{ background: it.tone === "gold" ? "var(--accent-gold-soft)" : `var(--${it.tone}-soft)` }}>
              <p className="font-mono text-lg font-bold" style={{ color: it.tone === "gold" ? "var(--accent-gold)" : `var(--${it.tone})` }}>{it.value}</p>
              <p className="text-[10px] mt-1 uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>{it.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PendingWithdrawalsCard({ loading, onNavigate, financeStats }) {
  const fs = financeStats || { pendingWithdrawalsCount, pendingWithdrawals: pendingWithdrawalsAmount };
  return (
    <div className="card p-4 sm:p-5 fade-in" style={{ borderLeft: "3px solid var(--red)" }}>
      <SectionHeader title="Pending Withdrawals" subtitle="Requires admin attention" />
      {loading ? <Skeleton className="h-16 w-full" /> : (
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div className="flex gap-6">
            <div>
              <p className="font-mono text-2xl font-bold">{fs.pendingWithdrawalsCount}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-mute)" }}>Requests</p>
            </div>
            <div>
              <p className="font-mono text-2xl font-bold">{fmtGHS(fs.pendingWithdrawals)}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-mute)" }}>Total pending</p>
            </div>
          </div>
          <button onClick={() => onNavigate("withdrawals")} className="btn-primary px-3.5 py-2 rounded-lg text-xs font-semibold">VIEW WITHDRAWALS</button>
        </div>
      )}
    </div>
  );
}

function ActivityTimeline({ loading }) {
  const iconFor = (kind) => ({ user: Users, order: ShoppingCart, commission: Percent, verified: BadgeCheck, withdrawal: Wallet, course: BookOpen, reward: Award }[kind] || Sparkles);
  return (
    <div className="card p-4 sm:p-5 fade-in">
      <SectionHeader title="Recent Platform Activity" />
      {loading ? <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div> : (
        <div className="space-y-4">
          {ACTIVITIES.map((a, i) => {
            const Icon = iconFor(a.kind);
            return (
              <div key={a.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--blue-soft)" }}>
                    <Icon size={13} color="var(--blue)" />
                  </div>
                  {i < ACTIVITIES.length - 1 && <div className="w-px flex-1 mt-1" style={{ background: "var(--border)" }} />}
                </div>
                <div className="pb-4">
                  <p className="text-[13px]" style={{ color: "var(--text)" }}>{a.text}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-mute)" }}>{a.time}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuickActions({ onNavigate }) {
  const items = [
    { label: "Add Course", icon: BookOpen, key: "courses" }, { label: "View Users", icon: Users, key: "users" },
    { label: "View Orders", icon: ShoppingCart, key: "orders" }, { label: "View Withdrawals", icon: Wallet, key: "withdrawals" },
    { label: "View Agents", icon: UserCheck, key: "agents" }, { label: "View Reports", icon: FileText, key: "reports" },
  ];
  return (
    <div className="card p-4 sm:p-5 fade-in">
      <SectionHeader title="Quick Actions" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <button key={it.label} onClick={() => onNavigate(it.key)} className="flex flex-col items-center gap-2 rounded-xl py-4 px-2 text-center" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--blue-soft)" }}>
                <Icon size={16} color="var(--blue)" />
              </div>
              <span className="text-xs font-medium">{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   DASHBOARD PAGE
   ============================================================ */
function DashboardPage({ loading, onNavigate, accounts = ACCOUNTS, courses = COURSE_CATALOG, orders = ORDER_RECORDS, transactions, withdrawals = BASE_WITHDRAWAL_RECORDS, financeStats }) {
  const [dateFilter, setDateFilter] = useState("Last 30 Days");
  const [orderModal, setOrderModal] = useState(null);
  const stats = useMemo(() => computeAccountStats(accounts), [accounts]);
  const courseStats = useMemo(() => computeCourseStats(courses), [courses]);
  const fs = financeStats || computeFinanceStats(transactions || buildTransactionRecords(orders, REWARD_RECORDS, withdrawals), orders, withdrawals);
  const txns = transactions || buildTransactionRecords(orders, REWARD_RECORDS, withdrawals);

  const kpis = [
    { label: "Total Users", value: stats.totalUsers, delta: 8.4, icon: Users, tone: "blue" },
    { label: "Total Agents", value: stats.totalAgents, delta: 5.1, icon: UserCheck, tone: "blue" },
    { label: "Verified Agents", value: stats.verifiedAgents, delta: 12.0, icon: BadgeCheck, tone: "green" },
    { label: "Total Courses", value: courseStats.totalCourses, delta: 2.0, icon: BookOpen, tone: "amber" },
    { label: "Published Courses", value: courseStats.published, delta: 3.4, icon: CheckCircle2, tone: "green" },
    { label: "Total Orders", value: orders.length, delta: 6.3, icon: ShoppingCart, tone: "blue" },
    { label: "Total Revenue", value: fmtGHS(fs.totalRevenue), delta: 9.7, icon: TrendingUp, tone: "green", featured: true },
    { label: "Pending Withdrawals", value: fs.pendingWithdrawalsCount, delta: -3.2, icon: Wallet, tone: "red" },
    { label: "Total Commission", value: fmtGHS(fs.totalCommission), delta: 4.5, icon: Percent, tone: "amber" },
    { label: "Total Cashback", value: fmtGHS(fs.totalCashbackIssued), delta: 3.1, icon: Gift, tone: "green" },
    { label: "Total Rewards", value: fmtGHS(fs.totalRewards), delta: 7.8, icon: Award, tone: "gold" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">Dashboard</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>Overview of your platform</p>
        </div>
        <DateFilter value={dateFilter} onChange={setDateFilter} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {kpis.map((k) => <MetricCard key={k.label} {...k} loading={loading} />)}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SalesOverview loading={loading} />
        <RevenueSummary loading={loading} financeStats={fs} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <UserOverview loading={loading} accounts={accounts} />
        <VerificationOverview loading={loading} accounts={accounts} />
      </div>

      <PendingWithdrawalsCard loading={loading} onNavigate={onNavigate} financeStats={fs} />

      <div className="card p-4 sm:p-5 fade-in">
        <SectionHeader title="Recent Orders" action={<button onClick={() => onNavigate("orders")} className="text-xs font-semibold flex items-center gap-0.5" style={{ color: "var(--blue)" }}>View all <ChevronRight size={13} /></button>} />
        <DataTable
          loading={loading}
          columns={[
            { key: "id", label: "Order ID", render: (r) => <span className="font-mono text-xs font-medium">{r.id}</span> },
            { key: "customer", label: "Customer" }, { key: "course", label: "Course" },
            { key: "amount", label: "Amount", render: (r) => fmtGHS(r.amount) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.paymentStatus} /> },
            { key: "date", label: "Date" },
          ]}
          rows={orders.slice(0, 5)}
          renderActions={(r) => <ViewButton onClick={() => setOrderModal(r)} />}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card p-4 sm:p-5 fade-in">
          <SectionHeader title="Recent Users" action={<button onClick={() => onNavigate("users")} className="text-xs font-semibold flex items-center gap-0.5" style={{ color: "var(--blue)" }}>View all <ChevronRight size={13} /></button>} />
          <DataTable
            loading={loading}
            columns={[
              { key: "name", label: "Name", render: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.name} size={26} /><div><p className="text-[13px] font-medium leading-tight">{r.name}</p><p className="text-[11px] leading-tight" style={{ color: "var(--text-mute)" }}>{r.email}</p></div></div> },
              { key: "type", label: "Account Type", render: (r) => <TypeBadge type={r.type} /> },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { key: "joined", label: "Registered" },
            ]}
            rows={accounts.slice(0, 5)}
          />
        </div>

        <div className="card p-4 sm:p-5 fade-in">
          <SectionHeader title="Recent Agents" action={<button onClick={() => onNavigate("agents")} className="text-xs font-semibold flex items-center gap-0.5" style={{ color: "var(--blue)" }}>View all <ChevronRight size={13} /></button>} />
          <DataTable
            loading={loading}
            columns={[
              { key: "name", label: "Agent", render: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.name} size={26} /><span className="text-[13px] font-medium">{r.name}</span>{r.type === "Verified Agent" && <BadgeCheck size={14} color="var(--blue)" />}</div> },
              { key: "agentId", label: "Agent ID", render: (r) => <span className="font-mono text-xs">{r.agentId}</span> },
              { key: "referrals", label: "Referrals" },
              { key: "commission", label: "Commission", render: (r) => fmtGHS(r.commission) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
            ]}
            rows={accounts.filter((a) => a.agentId).slice(0, 5)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card p-4 sm:p-5 fade-in">
          <SectionHeader title="Recent Referrals" action={<button onClick={() => onNavigate("referrals")} className="text-xs font-semibold flex items-center gap-0.5" style={{ color: "var(--blue)" }}>View all <ChevronRight size={13} /></button>} />
          <DataTable
            loading={loading}
            columns={[
              { key: "id", label: "Referral ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
              { key: "agent", label: "Agent" }, { key: "customer", label: "Customer" },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { key: "commission", label: "Commission", render: (r) => r.commission ? fmtGHS(r.commission) : "—" },
            ]}
            rows={REFERRALS.slice(0, 5)}
          />
        </div>

        <div className="card p-4 sm:p-5 fade-in">
          <SectionHeader title="Recent Transactions" action={<button onClick={() => onNavigate("transactions")} className="text-xs font-semibold flex items-center gap-0.5" style={{ color: "var(--blue)" }}>View all <ChevronRight size={13} /></button>} />
          <DataTable
            loading={loading}
            columns={[
              { key: "id", label: "Txn ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
              { key: "type", label: "Type", render: (r) => <TxTypeBadge type={r.type} /> }, { key: "user", label: "User/Agent" },
              { key: "amount", label: "Amount", render: (r) => fmtGHS(r.amount) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
            ]}
            rows={txns.slice(0, 5)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ActivityTimeline loading={loading} />
        <QuickActions onNavigate={onNavigate} />
      </div>

      <Modal open={!!orderModal} onClose={() => setOrderModal(null)} title={orderModal?.id}>
        {orderModal && (
          <div className="space-y-2.5">
            <div className="flex justify-between"><span>Customer</span><span className="font-medium" style={{ color: "var(--text)" }}>{orderModal.customer}</span></div>
            <div className="flex justify-between"><span>Course</span><span className="font-medium" style={{ color: "var(--text)" }}>{orderModal.course}</span></div>
            <div className="flex justify-between"><span>Amount</span><span className="font-mono font-medium" style={{ color: "var(--text)" }}>{fmtGHS(orderModal.amount)}</span></div>
            <div className="flex justify-between"><span>Status</span><StatusBadge status={orderModal.paymentStatus} /></div>
            <div className="flex justify-between"><span>Date</span><span className="font-medium" style={{ color: "var(--text)" }}>{orderModal.date}</span></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ============================================================
   STAGE B — SHARED BUILDING BLOCKS
   ============================================================ */
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[200] fade-in">
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium" style={{ background: "var(--sidebar)", color: "#fff" }}>
        <CheckCircle2 size={15} color="var(--accent-gold)" />
        {toast}
      </div>
    </div>
  );
}

function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = "CONFIRM", tone = "red" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: "rgba(10,14,23,0.55)" }} onClick={onClose}>
      <div className="card w-full max-w-sm fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: `var(--${tone}-soft)` }}>
            <AlertTriangle size={18} color={`var(--${tone})`} />
          </div>
          <h3 className="font-display font-semibold text-[15px] mb-1.5">{title}</h3>
          <p className="text-sm" style={{ color: "var(--text-soft)" }}>{message}</p>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>CANCEL</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-white" style={{ background: `var(--${tone})` }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 w-full sm:max-w-xs" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
      <Search size={15} color="var(--text-mute)" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-transparent text-sm w-full outline-none" style={{ color: "var(--text)" }} />
      {value && <button onClick={() => onChange("")}><X size={13} color="var(--text-mute)" /></button>}
    </div>
  );
}

function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
          style={{ background: value === o.key ? "var(--blue)" : "var(--surface-alt)", color: value === o.key ? "#fff" : "var(--text-soft)", border: "1px solid " + (value === o.key ? "var(--blue)" : "var(--border)") }}>
          {o.label}{o.count !== undefined ? ` (${o.count})` : ""}
        </button>
      ))}
    </div>
  );
}

function SortSelect({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="text-xs font-medium rounded-lg px-3 py-2.5 outline-none" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );
}

function Pagination({ page, pageSize, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 pt-3 mt-1" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <p className="text-xs" style={{ color: "var(--text-mute)" }}>Showing {start}–{end} of {total}</p>
      <div className="flex items-center gap-2">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-40" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>Previous</button>
        <span className="text-xs font-medium" style={{ color: "var(--text-soft)" }}>Page {page} of {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-40" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>Next</button>
      </div>
    </div>
  );
}

function ProgressBar({ value, max = 20, verified }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: "var(--text-soft)" }}>{value} / {max} Successful Referrals</span>
        <span className="font-mono text-xs font-semibold" style={{ color: verified ? "var(--green)" : "var(--blue)" }}>{pct}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border-soft)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: verified ? "var(--green)" : "var(--blue)" }} />
      </div>
      {verified ? (
        <p className="text-xs font-semibold mt-1.5 flex items-center gap-1" style={{ color: "var(--green)" }}><CheckCircle2 size={13} /> VERIFIED AGENT</p>
      ) : (
        <p className="text-xs mt-1.5" style={{ color: "var(--text-mute)" }}>{Math.max(0, max - value)} referrals remaining</p>
      )}
    </div>
  );
}

function VerifiedBadge({ size = 13 }) {
  return (
    <span title="Verified Agent" className="inline-flex items-center justify-center rounded-full shrink-0" style={{ width: size + 4, height: size + 4, background: "var(--blue)" }}>
      <BadgeCheck size={size} color="#fff" strokeWidth={2.5} />
    </span>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto admin-scroll -mx-1 px-1 pb-0.5" style={{ borderBottom: "1px solid var(--border)" }}>
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t)} className="px-3 py-2 text-xs font-semibold whitespace-nowrap"
          style={{ color: active === t ? "var(--blue)" : "var(--text-mute)", borderBottom: active === t ? "2px solid var(--blue)" : "2px solid transparent" }}>
          {t}
        </button>
      ))}
    </div>
  );
}

function ExportMenu({ onExport }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>
        <FileText size={13} /> EXPORT <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-36 card overflow-hidden fade-in z-50">
          {["CSV", "Excel", "PDF"].map((f) => (
            <button key={f} onClick={() => { setOpen(false); onExport(f); }} className="w-full text-left px-3.5 py-2.5 text-xs font-medium" style={{ color: "var(--text)" }}>
              Export as {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityLogModal({ open, onClose, log }) {
  return (
    <Modal open={open} onClose={onClose} title="Admin Activity Log">
      {log.length === 0 ? <EmptyState title="No activity found." subtitle="Admin actions will appear here." /> : (
        <div className="space-y-3">
          {log.map((l, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "var(--blue-soft)" }}>
                <ShieldCheck size={12} color="var(--blue)" />
              </div>
              <div>
                <p className="text-[13px]" style={{ color: "var(--text)" }}>{l.text}</p>
                <p className="text-[11px] mt-0.5 font-mono" style={{ color: "var(--text-mute)" }}>{l.date} · {l.time}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function BulkBar({ count, onSelectAll, onDeselectAll, onSuspend, onActivate }) {
  if (!count) return null;
  return (
    <div className="card p-3 flex items-center justify-between flex-wrap gap-2 fade-in" style={{ borderLeft: "3px solid var(--blue)" }}>
      <p className="text-xs font-semibold pl-1" style={{ color: "var(--text)" }}>{count} selected</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={onSelectAll} className="px-3 py-1.5 rounded-md text-[11px] font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>Select All</button>
        <button onClick={onDeselectAll} className="px-3 py-1.5 rounded-md text-[11px] font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>Deselect All</button>
        <button onClick={onActivate} className="px-3 py-1.5 rounded-md text-[11px] font-semibold" style={{ background: "var(--green-soft)", color: "var(--green)" }}>Bulk Activate</button>
        <button onClick={onSuspend} className="px-3 py-1.5 rounded-md text-[11px] font-semibold" style={{ background: "var(--red-soft)", color: "var(--red)" }}>Bulk Suspend</button>
      </div>
    </div>
  );
}

/* ============================================================
   USERS PAGE (Stage B)
   ============================================================ */
function UsersPage({ accounts, setAccounts, loading, logAdmin, showToast, adminLog, onNavigate }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type: 'suspend'|'activate'|'bulk-suspend'|'bulk-activate', target }
  const [logOpen, setLogOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const pageSize = 8;

  const filtered = useMemo(() => {
    let rows = accounts;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.phone.includes(q) || a.id.toLowerCase().includes(q));
    if (filter === "active") rows = rows.filter((a) => a.status === "Active");
    else if (filter === "suspended") rows = rows.filter((a) => a.status === "Suspended");
    else if (filter === "pending") rows = rows.filter((a) => a.status === "Pending");
    else if (filter === "users") rows = rows.filter((a) => a.type === "User");
    else if (filter === "agents") rows = rows.filter((a) => a.type === "Agent");
    else if (filter === "verified") rows = rows.filter((a) => a.type === "Verified Agent");

    const sorted = [...rows].sort((a, b) => {
      switch (sort) {
        case "oldest": return a.joined.localeCompare(b.joined);
        case "name_asc": return a.name.localeCompare(b.name);
        case "name_desc": return b.name.localeCompare(a.name);
        case "recent_activity": return b.lastActivityAt.localeCompare(a.lastActivityAt);
        case "highest_purchase": return purchasesFor(b.name).reduce((s, o) => s + o.amount, 0) - purchasesFor(a.name).reduce((s, o) => s + o.amount, 0);
        case "most_referrals": return b.referrals - a.referrals;
        default: return b.joined.localeCompare(a.joined); // newest
      }
    });
    return sorted;
  }, [accounts, search, filter, sort]);

  useEffect(() => setPage(1), [search, filter, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const stats = computeAccountStats(accounts);
  const filters = [
    { key: "all", label: "All Users", count: accounts.length },
    { key: "active", label: "Active", count: stats.activeUsersCount },
    { key: "suspended", label: "Suspended", count: stats.suspendedUsersCount },
    { key: "pending", label: "Pending", count: stats.pendingUsersCount },
    { key: "users", label: "Users" }, { key: "agents", label: "Agents" }, { key: "verified", label: "Verified Agents" },
  ];
  const sortOptions = [
    { key: "newest", label: "Newest" }, { key: "oldest", label: "Oldest" },
    { key: "name_asc", label: "Name A–Z" }, { key: "name_desc", label: "Name Z–A" },
    { key: "recent_activity", label: "Most Recent Activity" }, { key: "highest_purchase", label: "Highest Purchase Amount" },
    { key: "most_referrals", label: "Most Successful Referrals" },
  ];

  const toggleSelect = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const setStatus = (id, status) => setAccounts((accs) => accs.map((a) => a.id === id ? { ...a, status } : a));

  const runConfirm = () => {
    if (!confirm) return;
    if (confirm.type === "suspend") { setStatus(confirm.target.id, "Suspended"); logAdmin(`Admin suspended user ${confirm.target.id}.`); showToast("User account suspended."); if (detail?.id === confirm.target.id) setDetail((d) => ({ ...d, status: "Suspended" })); }
    if (confirm.type === "activate") { setStatus(confirm.target.id, "Active"); logAdmin(`Admin activated user ${confirm.target.id}.`); showToast("User account activated."); if (detail?.id === confirm.target.id) setDetail((d) => ({ ...d, status: "Active" })); }
    if (confirm.type === "bulk-suspend") { setAccounts((accs) => accs.map((a) => selected.includes(a.id) ? { ...a, status: "Suspended" } : a)); logAdmin(`Admin performed bulk action: suspended ${selected.length} accounts.`); showToast(`${selected.length} accounts suspended.`); setSelected([]); }
    if (confirm.type === "bulk-activate") { setAccounts((accs) => accs.map((a) => selected.includes(a.id) ? { ...a, status: "Active" } : a)); logAdmin(`Admin performed bulk action: activated ${selected.length} accounts.`); showToast(`${selected.length} accounts activated.`); setSelected([]); }
    setConfirm(null);
  };

  const openDetail = (row) => { setDetail(row); logAdmin(`Admin viewed user ${row.id}.`); };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">Users</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>Manage registered users and their account activity.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLogOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>
            <Clock size={13} /> ACTIVITY LOG
          </button>
          <ExportMenu onExport={(f) => showToast(`Preparing ${f} export…`)} />
        </div>
      </div>

      <div className="card p-4 sm:p-5 space-y-4 fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email, phone or user ID..." />
          <div className="flex items-center gap-2">
            <button onClick={() => setMobileFiltersOpen((v) => !v)} className="sm:hidden flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>Filters <ChevronDown size={13} /></button>
            <SortSelect value={sort} onChange={setSort} options={sortOptions} />
          </div>
        </div>
        <div className={`${mobileFiltersOpen ? "block" : "hidden"} sm:block`}>
          <FilterPills options={filters} value={filter} onChange={setFilter} />
        </div>
      </div>

      <BulkBar count={selected.length}
        onSelectAll={() => setSelected(pageRows.map((r) => r.id))}
        onDeselectAll={() => setSelected([])}
        onSuspend={() => setConfirm({ type: "bulk-suspend" })}
        onActivate={() => setConfirm({ type: "bulk-activate" })}
      />

      <div className="card fade-in">
        {loading ? (
          <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : pageRows.length === 0 ? (
          <EmptyState title="No users found." subtitle="Try a different search term or filter." />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto admin-scroll">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="w-10 py-2.5 px-3"><input type="checkbox" checked={selected.length === pageRows.length} onChange={(e) => setSelected(e.target.checked ? pageRows.map((r) => r.id) : [])} /></th>
                    {["Profile", "Email", "Phone", "Account Type", "Status", "Joined", "Last Activity"].map((h) => (
                      <th key={h} className="text-left font-medium py-2.5 px-3 whitespace-nowrap text-[11px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>{h}</th>
                    ))}
                    <th className="text-right py-2.5 px-3 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id} className="fade-in" style={{ borderBottom: "1px solid var(--border-soft)" }}>
                      <td className="px-3 py-2.5"><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-2.5"><Avatar name={r.name} size={30} /><div><p className="text-[13px] font-medium leading-tight flex items-center gap-1">{r.name}{r.type === "Verified Agent" && <VerifiedBadge size={11} />}</p><p className="text-[11px] leading-tight font-mono" style={{ color: "var(--text-mute)" }}>{r.id}</p></div></div></td>
                      <td className="px-3 py-2.5" style={{ color: "var(--text-soft)" }}>{r.email}</td>
                      <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--text-soft)" }}>{r.phone}</td>
                      <td className="px-3 py-2.5"><TypeBadge type={r.type} /></td>
                      <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-soft)" }}>{r.joined}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-soft)" }}>{r.lastActivityAt}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <ViewButton onClick={() => openDetail(r)} />
                          {r.status === "Suspended" ? (
                            <button onClick={() => setConfirm({ type: "activate", target: r })} className="px-2.5 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--green-soft)", color: "var(--green)" }}>ACTIVATE</button>
                          ) : (
                            <button onClick={() => setConfirm({ type: "suspend", target: r })} className="px-2.5 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--red-soft)", color: "var(--red)" }}>SUSPEND</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden divide-y" style={{ borderColor: "var(--border-soft)" }}>
              {pageRows.map((r) => (
                <div key={r.id} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} />
                      <Avatar name={r.name} size={32} />
                      <div>
                        <p className="text-[13px] font-medium flex items-center gap-1">{r.name}{r.type === "Verified Agent" && <VerifiedBadge size={11} />}</p>
                        <p className="text-[11px] font-mono" style={{ color: "var(--text-mute)" }}>{r.id}</p>
                      </div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-xs space-y-1" style={{ color: "var(--text-soft)" }}>
                    <p>{r.email}</p><p className="font-mono">{r.phone}</p>
                    <div className="flex items-center gap-2 pt-0.5"><TypeBadge type={r.type} /><span>Joined {r.joined}</span></div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => openDetail(r)} className="flex-1 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>VIEW</button>
                    {r.status === "Suspended" ? (
                      <button onClick={() => setConfirm({ type: "activate", target: r })} className="flex-1 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--green-soft)", color: "var(--green)" }}>ACTIVATE</button>
                    ) : (
                      <button onClick={() => setConfirm({ type: "suspend", target: r })} className="flex-1 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--red-soft)", color: "var(--red)" }}>SUSPEND</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} /></div>
          </>
        )}
      </div>

      <UserDetailModal user={detail} onClose={() => setDetail(null)} onSuspend={(u) => setConfirm({ type: "suspend", target: u })} onActivate={(u) => setConfirm({ type: "activate", target: u })} />
      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        tone={confirm?.type?.includes("activate") ? "green" : "red"}
        confirmLabel={confirm?.type === "bulk-suspend" ? "CONFIRM" : confirm?.type === "bulk-activate" ? "CONFIRM" : confirm?.type === "suspend" ? "CONFIRM SUSPENSION" : "CONFIRM"}
        title={
          confirm?.type === "suspend" ? "Suspend this account?" :
          confirm?.type === "activate" ? "Activate this account?" :
          confirm?.type === "bulk-suspend" ? `Suspend ${selected.length} selected accounts?` :
          confirm?.type === "bulk-activate" ? `Activate ${selected.length} selected accounts?` : ""
        }
        message={
          confirm?.type === "suspend" ? "This user will no longer be able to access their account." :
          confirm?.type === "activate" ? "This user will regain access to their account." :
          confirm?.type === "bulk-suspend" ? "These users will no longer be able to access their accounts." :
          confirm?.type === "bulk-activate" ? "These users will regain access to their accounts." : ""
        }
      />
      <ActivityLogModal open={logOpen} onClose={() => setLogOpen(false)} log={adminLog} />
    </div>
  );
}

function UserDetailModal({ user, onClose, onSuspend, onActivate }) {
  const [tab, setTab] = useState("Overview");
  useEffect(() => { if (user) setTab("Overview"); }, [user?.id]);
  if (!user) return null;
  const purchases = purchasesFor(user.name);
  const totalSpent = purchases.filter((p) => p.status === "Successful").reduce((s, p) => s + p.amount, 0);
  const cashback = cashbackFor(user.name);
  const reward = rewardFor(user.name);
  const available = cashback + reward + user.commission;
  const activity = activityFor(user.name);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(10,14,23,0.55)" }} onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[86vh] overflow-y-auto admin-scroll fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size={44} />
            <div>
              <h3 className="font-display font-semibold text-[16px] flex items-center gap-1.5">{user.name}{user.type === "Verified Agent" && <VerifiedBadge />}</h3>
              <p className="text-xs font-mono" style={{ color: "var(--text-mute)" }}>{user.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:opacity-70"><X size={18} /></button>
        </div>

        <div className="px-5 pt-3">
          <Tabs tabs={["Overview", "Purchases", "Activity", "Actions"]} active={tab} onChange={setTab} />
        </div>

        <div className="p-5 text-sm">
          {tab === "Overview" && (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-mute)" }}>Account Information</p>
                <div className="grid grid-cols-2 gap-3">
                  {[["Email", user.email], ["Phone", user.phone], ["Account Type", <TypeBadge type={user.type} />], ["Status", <StatusBadge status={user.status} />],
                    ["Registration Date", user.joined], ["Last Activity", user.lastActivityAt],
                    ["Qualifying Purchase", user.qualifyingPurchase], ["Agent Status", user.agentId ? `Agent ID ${user.agentId}` : "Not an agent"]].map(([l, v]) => (
                    <div key={l}><p className="text-[11px]" style={{ color: "var(--text-mute)" }}>{l}</p><p className="text-[13px] font-medium mt-0.5" style={{ color: "var(--text)" }}>{v}</p></div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-mute)" }}>Financial Summary (demo data)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[["Total Purchases", purchases.length], ["Total Amount Spent", fmtGHS(totalSpent)], ["Courses Purchased", purchases.length],
                    ["Successful Referrals", user.referrals], ["Commission Earned", fmtGHS(user.commission)], ["Cashback Earned", fmtGHS(cashback)],
                    ["Rewards Earned", fmtGHS(reward)], ["Available Balance", fmtGHS(available)]].map(([l, v]) => (
                    <div key={l} className="rounded-lg p-2.5" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-soft)" }}>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>{l}</p>
                      <p className="font-mono text-sm font-semibold mt-0.5">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "Purchases" && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-mute)" }}>Purchase History</p>
              <DataTable
                emptyTitle="No purchases found."
                columns={[
                  { key: "id", label: "Order ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
                  { key: "course", label: "Course" }, { key: "amount", label: "Amount", render: (r) => fmtGHS(r.amount) },
                  { key: "status", label: "Payment Status", render: (r) => <StatusBadge status={r.status} /> },
                  { key: "date", label: "Date" },
                  { key: "access", label: "Course Access", render: (r) => r.status === "Successful" ? "Granted" : "—" },
                ]}
                rows={purchases}
              />
            </div>
          )}

          {tab === "Activity" && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-mute)" }}>Recent Activity</p>
              {activity.length === 0 ? <EmptyState title="No activity found." /> : (
                <div className="space-y-3">
                  {activity.map((a) => (
                    <div key={a.id} className="flex justify-between text-[13px]" style={{ color: "var(--text)" }}>
                      <span>{a.text}</span><span className="text-[11px]" style={{ color: "var(--text-mute)" }}>{a.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "Actions" && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-mute)" }}>Account Actions</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={onClose} className="px-3.5 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>VIEW PROFILE</button>
                {user.status === "Suspended" ? (
                  <button onClick={() => onActivate(user)} className="px-3.5 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--green-soft)", color: "var(--green)" }}>ACTIVATE ACCOUNT</button>
                ) : (
                  <button onClick={() => onSuspend(user)} className="px-3.5 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--red-soft)", color: "var(--red)" }}>SUSPEND ACCOUNT</button>
                )}
              </div>
              <p className="text-xs" style={{ color: "var(--text-mute)" }}>Suspending preserves all purchase, referral and financial records. Accounts are never deleted from this dashboard.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   AGENTS PAGE (Stage B)
   ============================================================ */
function AgentsPage({ accounts, setAccounts, loading, logAdmin, showToast, adminLog, onNavigate }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const pageSize = 8;

  const agents = useMemo(() => accounts.filter((a) => a.agentId), [accounts]);

  const filtered = useMemo(() => {
    let rows = agents;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((a) => a.name.toLowerCase().includes(q) || a.agentId.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.phone.includes(q));
    if (filter === "active") rows = rows.filter((a) => a.status === "Active");
    else if (filter === "suspended") rows = rows.filter((a) => a.status === "Suspended");
    else if (filter === "verified") rows = rows.filter((a) => a.type === "Verified Agent");
    else if (filter === "not_verified") rows = rows.filter((a) => a.type !== "Verified Agent");
    else if (filter === "near") rows = rows.filter((a) => a.referrals >= 15 && a.referrals < 20);
    else if (filter === "0_9") rows = rows.filter((a) => a.referrals < 10);
    else if (filter === "10_14") rows = rows.filter((a) => a.referrals >= 10 && a.referrals < 15);
    else if (filter === "15_19") rows = rows.filter((a) => a.referrals >= 15 && a.referrals < 20);
    else if (filter === "20_plus") rows = rows.filter((a) => a.referrals >= 20);
    return [...rows].sort((a, b) => b.referrals - a.referrals);
  }, [agents, search, filter]);

  useEffect(() => setPage(1), [search, filter]);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const filters = [
    { key: "all", label: "All Agents", count: agents.length },
    { key: "active", label: "Active" }, { key: "suspended", label: "Suspended" },
    { key: "verified", label: "Verified" }, { key: "not_verified", label: "Not Verified" }, { key: "near", label: "Near Verification" },
  ];
  const referralFilters = [
    { key: "0_9", label: "0–9 Referrals" }, { key: "10_14", label: "10–14 Referrals" },
    { key: "15_19", label: "15–19 Referrals" }, { key: "20_plus", label: "20+ Referrals" },
  ];

  const toggleSelect = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const setStatus = (id, status) => setAccounts((accs) => accs.map((a) => a.id === id ? { ...a, status } : a));

  const runConfirm = () => {
    if (!confirm) return;
    if (confirm.type === "suspend") { setStatus(confirm.target.id, "Suspended"); logAdmin(`Admin suspended Agent ${confirm.target.agentId}.`); showToast("Agent account suspended."); if (detail?.id === confirm.target.id) setDetail((d) => ({ ...d, status: "Suspended" })); }
    if (confirm.type === "activate") { setStatus(confirm.target.id, "Active"); logAdmin(`Admin activated Agent ${confirm.target.agentId}.`); showToast("Agent account activated."); if (detail?.id === confirm.target.id) setDetail((d) => ({ ...d, status: "Active" })); }
    if (confirm.type === "bulk-suspend") { setAccounts((accs) => accs.map((a) => selected.includes(a.id) ? { ...a, status: "Suspended" } : a)); logAdmin(`Admin performed bulk action: suspended ${selected.length} agents.`); showToast(`${selected.length} agents suspended.`); setSelected([]); }
    if (confirm.type === "bulk-activate") { setAccounts((accs) => accs.map((a) => selected.includes(a.id) ? { ...a, status: "Active" } : a)); logAdmin(`Admin performed bulk action: activated ${selected.length} agents.`); showToast(`${selected.length} agents activated.`); setSelected([]); }
    setConfirm(null);
  };

  const openDetail = (row) => { setDetail(row); logAdmin(`Admin viewed Agent ${row.agentId}.`); };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">Agents</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>Manage platform agents and referral performance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLogOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>
            <Clock size={13} /> ACTIVITY LOG
          </button>
          <ExportMenu onExport={(f) => showToast(`Preparing ${f} export…`)} />
        </div>
      </div>

      <div className="card p-4 sm:p-5 space-y-3 fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by agent name, ID, email or phone..." />
          <button onClick={() => setMobileFiltersOpen((v) => !v)} className="sm:hidden flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold self-start" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>Filters <ChevronDown size={13} /></button>
        </div>
        <div className={`${mobileFiltersOpen ? "block" : "hidden"} sm:block space-y-2`}>
          <FilterPills options={filters} value={filter} onChange={setFilter} />
          <FilterPills options={referralFilters} value={filter} onChange={setFilter} />
        </div>
      </div>

      <BulkBar count={selected.length}
        onSelectAll={() => setSelected(pageRows.map((r) => r.id))}
        onDeselectAll={() => setSelected([])}
        onSuspend={() => setConfirm({ type: "bulk-suspend" })}
        onActivate={() => setConfirm({ type: "bulk-activate" })}
      />

      <div className="card fade-in">
        {loading ? (
          <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : pageRows.length === 0 ? (
          <EmptyState title="No agents found." subtitle="Try a different search term or filter." />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto admin-scroll">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="w-10 py-2.5 px-3"><input type="checkbox" checked={selected.length === pageRows.length} onChange={(e) => setSelected(e.target.checked ? pageRows.map((r) => r.id) : [])} /></th>
                    {["Agent", "Agent ID", "Email", "Successful Referrals", "Verification", "Commission Earned", "Status", "Joined"].map((h) => (
                      <th key={h} className="text-left font-medium py-2.5 px-3 whitespace-nowrap text-[11px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>{h}</th>
                    ))}
                    <th className="text-right py-2.5 px-3 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id} className="fade-in" style={{ borderBottom: "1px solid var(--border-soft)" }}>
                      <td className="px-3 py-2.5"><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-2.5"><Avatar name={r.name} size={30} /><span className="text-[13px] font-medium flex items-center gap-1">{r.name}{r.type === "Verified Agent" && <VerifiedBadge size={11} />}</span></div></td>
                      <td className="px-3 py-2.5 font-mono text-xs">{r.agentId}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-soft)" }}>{r.email}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{r.referrals}</td>
                      <td className="px-3 py-2.5">{r.type === "Verified Agent" ? <span className="text-xs font-semibold" style={{ color: "var(--green)" }}>Verified</span> : r.referrals >= 15 ? <span className="text-xs font-semibold" style={{ color: "var(--amber)" }}>Near Verification</span> : <span className="text-xs" style={{ color: "var(--text-mute)" }}>Not Verified</span>}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{fmtGHS(r.commission)}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-soft)" }}>{r.joined}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <ViewButton onClick={() => openDetail(r)} />
                          {r.status === "Suspended" ? (
                            <button onClick={() => setConfirm({ type: "activate", target: r })} className="px-2.5 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--green-soft)", color: "var(--green)" }}>ACTIVATE</button>
                          ) : (
                            <button onClick={() => setConfirm({ type: "suspend", target: r })} className="px-2.5 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--red-soft)", color: "var(--red)" }}>SUSPEND</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y" style={{ borderColor: "var(--border-soft)" }}>
              {pageRows.map((r) => (
                <div key={r.id} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} />
                      <Avatar name={r.name} size={32} />
                      <div><p className="text-[13px] font-medium flex items-center gap-1">{r.name}{r.type === "Verified Agent" && <VerifiedBadge size={11} />}</p><p className="text-[11px] font-mono" style={{ color: "var(--text-mute)" }}>{r.agentId}</p></div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-soft)" }}>
                    <p>{r.email}</p>
                    <p className="mt-1">{r.referrals} referrals · {fmtGHS(r.commission)} commission</p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => openDetail(r)} className="flex-1 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>VIEW</button>
                    {r.status === "Suspended" ? (
                      <button onClick={() => setConfirm({ type: "activate", target: r })} className="flex-1 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--green-soft)", color: "var(--green)" }}>ACTIVATE</button>
                    ) : (
                      <button onClick={() => setConfirm({ type: "suspend", target: r })} className="flex-1 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--red-soft)", color: "var(--red)" }}>SUSPEND</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} /></div>
          </>
        )}
      </div>

      <AgentDetailModal agent={detail} onClose={() => setDetail(null)} onSuspend={(a) => setConfirm({ type: "suspend", target: a })} onActivate={(a) => setConfirm({ type: "activate", target: a })} showToast={showToast} />
      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        tone={confirm?.type?.includes("activate") ? "green" : "red"}
        confirmLabel={confirm?.type === "suspend" ? "SUSPEND AGENT" : confirm?.type === "activate" ? "ACTIVATE AGENT" : "CONFIRM"}
        title={
          confirm?.type === "suspend" ? "Suspend this Agent?" :
          confirm?.type === "activate" ? "Activate this Agent?" :
          confirm?.type === "bulk-suspend" ? `Suspend ${selected.length} selected agents?` :
          confirm?.type === "bulk-activate" ? `Activate ${selected.length} selected agents?` : ""
        }
        message={
          confirm?.type === "suspend" ? "Suspending this account will restrict the Agent's platform access." :
          confirm?.type === "activate" ? "This Agent will regain full platform access." :
          confirm?.type === "bulk-suspend" ? "Selected agents will lose platform access." :
          confirm?.type === "bulk-activate" ? "Selected agents will regain platform access." : ""
        }
      />
      <ActivityLogModal open={logOpen} onClose={() => setLogOpen(false)} log={adminLog} />
    </div>
  );
}

function AgentDetailModal({ agent, onClose, onSuspend, onActivate, showToast }) {
  const [tab, setTab] = useState("Overview");
  useEffect(() => { if (agent) setTab("Overview"); }, [agent?.id]);
  if (!agent) return null;
  const verified = agent.type === "Verified Agent";
  const referrals = referralsAsAgentFor(agent.name);
  const successful = referrals.filter((r) => r.status === "Successful");
  const salesGenerated = successful.reduce((s, r) => s + (COURSES.find((c) => c.title === r.course)?.price || 0), 0);
  const conversion = referrals.length ? Math.round((successful.length / referrals.length) * 100) : 0;
  const purchases = purchasesFor(agent.name);
  const cashback = cashbackFor(agent.name);
  const reward = rewardFor(agent.name);
  const referralLink = `https://summitlearning.app/r/${agent.agentId}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(10,14,23,0.55)" }} onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[86vh] overflow-y-auto admin-scroll fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <Avatar name={agent.name} size={44} />
            <div>
              <h3 className="font-display font-semibold text-[16px] flex items-center gap-1.5">{agent.name}{verified && <VerifiedBadge />}</h3>
              <p className="text-xs font-mono" style={{ color: "var(--text-mute)" }}>{agent.agentId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:opacity-70"><X size={18} /></button>
        </div>

        <div className="px-5 pt-3">
          <Tabs tabs={["Overview", "Verification", "Referrals", "Purchases", "Activity", "Actions"]} active={tab} onChange={setTab} />
        </div>

        <div className="p-5 text-sm">
          {tab === "Overview" && (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-mute)" }}>Agent Information</p>
                <div className="grid grid-cols-2 gap-3">
                  {[["Email", agent.email], ["Phone", agent.phone], ["Joined", agent.joined], ["Status", <StatusBadge status={agent.status} />],
                    ["Verification", verified ? "Verified Agent" : "Not Verified"], ["Successful Referrals", agent.referrals]].map(([l, v]) => (
                    <div key={l}><p className="text-[11px]" style={{ color: "var(--text-mute)" }}>{l}</p><p className="text-[13px] font-medium mt-0.5" style={{ color: "var(--text)" }}>{v}</p></div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-mute)" }}>Commission Summary</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[["Commission Earned", fmtGHS(agent.commission)], ["Cashback Earned", fmtGHS(cashback)], ["Reward Earned", fmtGHS(reward)], ["Sales Generated", fmtGHS(salesGenerated)]].map(([l, v]) => (
                    <div key={l} className="rounded-lg p-2.5" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-soft)" }}>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>{l}</p>
                      <p className="font-mono text-sm font-semibold mt-0.5">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-mute)" }}>Referral Link</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs px-2.5 py-1.5 rounded-md" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>{referralLink}</span>
                  <button onClick={() => showToast("Referral link copied.")} className="px-2.5 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>COPY REFERRAL LINK</button>
                  <button onClick={() => showToast("QR code ready.")} className="px-2.5 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>VIEW QR CODE</button>
                </div>
              </div>
            </div>
          )}

          {tab === "Verification" && (
            <div className="space-y-4">
              <ProgressBar value={agent.referrals} max={20} verified={verified} />
              {verified && <p className="text-xs" style={{ color: "var(--text-mute)" }}>Verification is calculated automatically once an Agent reaches 20 successful referrals — it cannot be granted manually.</p>}
            </div>
          )}

          {tab === "Referrals" && (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-mute)" }}>Referral Statistics</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[["Registered Referrals", referrals.length], ["Successful Referrals", successful.length], ["Conversion Rate", `${conversion}%`], ["Sales Generated", fmtGHS(salesGenerated)]].map(([l, v]) => (
                    <div key={l} className="rounded-lg p-2.5" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-soft)" }}>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>{l}</p>
                      <p className="font-mono text-sm font-semibold mt-0.5">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-mute)" }}>Referral History</p>
                <DataTable
                  emptyTitle="No referrals found."
                  columns={[
                    { key: "id", label: "Referral ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
                    { key: "customer", label: "Customer" }, { key: "course", label: "Course" },
                    { key: "commission", label: "Purchase Amount", render: (r) => fmtGHS(COURSES.find((c) => c.title === r.course)?.price || 0) },
                    { key: "status", label: "Referral Status", render: (r) => <StatusBadge status={r.status} /> },
                    { key: "date", label: "Date" },
                  ]}
                  rows={referrals}
                />
              </div>
            </div>
          )}

          {tab === "Purchases" && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-mute)" }}>Agent Purchase History</p>
              <DataTable
                emptyTitle="No purchases found."
                columns={[
                  { key: "id", label: "Order ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
                  { key: "course", label: "Course" }, { key: "amount", label: "Amount", render: (r) => fmtGHS(r.amount) },
                  { key: "date", label: "Date" }, { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
                ]}
                rows={purchases}
              />
            </div>
          )}

          {tab === "Activity" && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-mute)" }}>Recent Activity</p>
              {activityFor(agent.name).length === 0 ? <EmptyState title="No activity found." /> : (
                <div className="space-y-3">
                  {activityFor(agent.name).map((a) => (
                    <div key={a.id} className="flex justify-between text-[13px]" style={{ color: "var(--text)" }}>
                      <span>{a.text}</span><span className="text-[11px]" style={{ color: "var(--text-mute)" }}>{a.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "Actions" && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-mute)" }}>Agent Actions</p>
              <div className="flex flex-wrap gap-2">
                {agent.status === "Suspended" ? (
                  <button onClick={() => onActivate(agent)} className="px-3.5 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--green-soft)", color: "var(--green)" }}>ACTIVATE AGENT</button>
                ) : (
                  <button onClick={() => onSuspend(agent)} className="px-3.5 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--red-soft)", color: "var(--red)" }}>SUSPEND AGENT</button>
                )}
              </div>
              <p className="text-xs" style={{ color: "var(--text-mute)" }}>Suspending preserves commission, cashback, reward and referral history. Records are never deleted.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   VERIFICATION PAGE (Stage B)
   ============================================================ */
function VerificationPage({ accounts, loading, onNavigate }) {
  const [search, setSearch] = useState("");
  const agents = useMemo(() => accounts.filter((a) => a.agentId), [accounts]);
  const q = search.trim().toLowerCase();
  const matches = (a) => !q || a.name.toLowerCase().includes(q) || a.agentId.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);

  const verified = agents.filter((a) => a.type === "Verified Agent" && matches(a)).sort((a, b) => b.referrals - a.referrals);
  const near = agents.filter((a) => a.type !== "Verified Agent" && a.referrals >= 15 && a.referrals < 20 && matches(a)).sort((a, b) => b.referrals - a.referrals);
  const notVerified = agents.filter((a) => a.type !== "Verified Agent" && a.referrals < 15 && matches(a)).sort((a, b) => b.referrals - a.referrals);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-xl">Verification</h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>Verification is calculated automatically — 20 successful referrals = Verified Agent.</p>
      </div>

      <div className="card p-4 sm:p-5 fade-in">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by agent name, ID or email..." />
      </div>

      <div className="card p-4 sm:p-5 fade-in">
        <SectionHeader title="Verified" subtitle={`${verified.length} agent(s) with the blue verification badge`} />
        {loading ? <Skeleton className="h-24 w-full" /> : verified.length === 0 ? <EmptyState title="No verified agents yet." /> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {verified.map((a) => (
              <div key={a.id} className="rounded-xl p-3.5 flex items-center gap-3" style={{ background: "var(--accent-gold-soft)" }}>
                <Avatar name={a.name} size={38} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold flex items-center gap-1.5">{a.name} <VerifiedBadge size={12} /></p>
                  <p className="text-[11px] font-mono" style={{ color: "var(--text-mute)" }}>{a.agentId} · {a.referrals} successful referrals</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4 sm:p-5 fade-in">
        <SectionHeader title="Near Verification" subtitle="Agents with 15–19 successful referrals" />
        {loading ? <Skeleton className="h-24 w-full" /> : near.length === 0 ? <EmptyState title="No agents near verification." /> : (
          <div className="space-y-3">
            {near.map((a) => (
              <div key={a.id} className="flex items-center gap-3.5">
                <Avatar name={a.name} size={34} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium">{a.name} <span className="font-mono text-[11px]" style={{ color: "var(--text-mute)" }}>{a.agentId}</span></p>
                  <ProgressBar value={a.referrals} max={20} verified={false} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4 sm:p-5 fade-in">
        <SectionHeader title="Not Verified" subtitle="Agents with fewer than 15 successful referrals" />
        <DataTable
          loading={loading}
          emptyTitle="No agents found."
          columns={[
            { key: "name", label: "Agent", render: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.name} size={26} /><span className="text-[13px] font-medium">{r.name}</span></div> },
            { key: "agentId", label: "Agent ID", render: (r) => <span className="font-mono text-xs">{r.agentId}</span> },
            { key: "referrals", label: "Referrals" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          rows={notVerified}
        />
      </div>
    </div>
  );
}

/* ============================================================
   STAGE C — SHARED COURSE COMPONENTS
   ============================================================ */
function CourseStatusBadge({ status }) {
  const map = {
    Published: ["green", CheckCircle2],
    Draft: ["amber", Clock],
    Archived: ["blue", Archive],
    Active: ["green", CheckCircle2],
    Inactive: ["red", XCircle],
    Visible: ["green", Eye],
    Hidden: ["red", EyeOff],
  };
  const [tone, Icon] = map[status] || ["blue", Clock];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap" style={{ background: `var(--${tone}-soft)`, color: `var(--${tone})` }}>
      <Icon size={12} strokeWidth={2.5} />
      {status}
    </span>
  );
}

function CourseThumb({ course, size = 44 }) {
  const hue = useMemo(() => {
    let h = 0; for (const c of course.title) h = (h * 31 + c.charCodeAt(0)) % 360; return h;
  }, [course.title]);
  if (course.thumbnail) {
    return <img src={course.thumbnail} alt={course.title} className="rounded-lg object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-lg flex items-center justify-center shrink-0" style={{ width: size, height: size, background: `hsl(${hue} 60% 94%)` }}>
      <BookOpen size={size * 0.42} color={`hsl(${hue} 45% 38%)`} strokeWidth={2} />
    </div>
  );
}

function RatingStars({ value, size = 13 }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} strokeWidth={0} fill={n <= Math.round(value) ? "var(--accent-gold)" : "var(--border)"} />
      ))}
    </span>
  );
}

function ListEditor({ label, items, onChange, placeholder }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-soft)" }}>{label}</label>
      <div className="flex gap-2 mb-2">
        <input
          value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder} className="flex-1 text-sm rounded-lg px-3 py-2 outline-none"
          style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <button type="button" onClick={add} className="px-3 rounded-lg text-xs font-semibold flex items-center gap-1" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>
          <Plus size={13} /> ADD
        </button>
      </div>
      <div className="space-y-1.5">
        {items.length === 0 && <p className="text-xs" style={{ color: "var(--text-mute)" }}>None added yet.</p>}
        {items.map((it, i) => (
          <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md text-xs" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-soft)", color: "var(--text)" }}>
            <span>{it}</span>
            <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))}><X size={13} color="var(--text-mute)" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-soft)" }}>{label}</label>
      {children}
      {hint && <p className="text-[11px] mt-1" style={{ color: "var(--text-mute)" }}>{hint}</p>}
    </div>
  );
}
const inputStyle = { background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" };
const inputClass = "w-full text-sm rounded-lg px-3 py-2.5 outline-none";

/* ============================================================
   STAGE C — COURSE FORM (create / edit)
   ============================================================ */
function CourseForm({ mode, initial, categories, setCategories, onCancel, onSave, showToast }) {
  const blank = {
    title: "", shortDescription: "", description: "", category: categories[0] || "Other", price: "",
    thumbnail: null, instructorName: "", instructorBio: "", level: "Beginner", duration: "",
    tags: [], objectives: [], requirements: [], targetAudience: [],
  };
  const seed = initial ? {
    title: initial.title, shortDescription: initial.shortDescription, description: initial.description,
    category: initial.category, price: String(initial.price), thumbnail: initial.thumbnail,
    instructorName: initial.instructor?.name || "", instructorBio: initial.instructor?.bio || "",
    level: initial.level, duration: initial.duration, tags: initial.tags || [],
    objectives: initial.objectives || [], requirements: initial.requirements || [], targetAudience: initial.targetAudience || [],
  } : blank;
  const [form, setForm] = useState(seed);
  const [newCategory, setNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [errors, setErrors] = useState([]);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    const errs = [];
    if (!form.title.trim()) errs.push("Course name is required.");
    if (!form.shortDescription.trim()) errs.push("Short description is required.");
    if (!form.price || Number(form.price) <= 0) errs.push("Course price must be greater than 0.");
    if (!form.category) errs.push("Category is required.");
    if (form.objectives.length === 0) errs.push("Add at least one learning objective.");
    return errs;
  };

  const buildCourse = (status) => ({
    title: form.title.trim(), shortDescription: form.shortDescription.trim(), description: form.description.trim(),
    category: form.category, price: Number(form.price) || 0, thumbnail: form.thumbnail,
    instructor: { name: form.instructorName.trim() || "Unassigned", bio: form.instructorBio.trim() },
    level: form.level, duration: form.duration.trim(), tags: form.tags,
    objectives: form.objectives, requirements: form.requirements, targetAudience: form.targetAudience,
    status,
  });

  const saveDraft = () => {
    if (!form.title.trim()) { setErrors(["Course name is required."]); return; }
    onSave(buildCourse("Draft"), false);
  };
  const requestPublish = () => {
    const errs = validate();
    setErrors(errs);
    if (errs.length) return;
    setConfirmPublish(true);
  };
  const confirmPublishNow = () => {
    setConfirmPublish(false);
    onSave(buildCourse("Published"), true);
  };

  return (
    <div className="space-y-5 fade-in">
      <div>
        <h2 className="font-display font-bold text-xl">{mode === "edit" ? "EDIT COURSE" : "CREATE COURSE"}</h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>{mode === "edit" ? `Editing ${initial?.id}` : "Set up a new course for the platform."}</p>
      </div>

      {errors.length > 0 && (
        <div className="card p-4" style={{ background: "var(--red-soft)", borderColor: "var(--red)" }}>
          {errors.map((e, i) => <p key={i} className="text-xs font-medium" style={{ color: "var(--red)" }}>• {e}</p>)}
        </div>
      )}

      <div className="card p-4 sm:p-5 space-y-4">
        <SectionHeader title="Course Information" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Course Name"><input value={form.title} onChange={set("title")} className={inputClass} style={inputStyle} placeholder="e.g. Digital Marketing" /></Field>
          <Field label="Course Price (GH₵)"><input type="number" min="0" value={form.price} onChange={set("price")} className={inputClass} style={inputStyle} placeholder="500" /></Field>
        </div>
        <Field label="Short Description" hint="Shown on course cards."><textarea value={form.shortDescription} onChange={set("shortDescription")} rows={2} className={inputClass} style={inputStyle} /></Field>
        <Field label="Full Description" hint="Shown on the course details page."><textarea value={form.description} onChange={set("description")} rows={4} className={inputClass} style={inputStyle} /></Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Category">
            <div className="flex gap-2">
              <select value={form.category} onChange={set("category")} className={inputClass} style={inputStyle}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="button" onClick={() => setAddingCategory((v) => !v)} className="px-3 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>+ CATEGORY</button>
            </div>
            {addingCategory && (
              <div className="flex gap-2 mt-2">
                <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category name" className={inputClass} style={inputStyle} />
                <button type="button" onClick={() => {
                  const v = newCategory.trim();
                  if (!v) return;
                  if (!categories.includes(v)) setCategories((c) => [...c, v]);
                  setForm((f) => ({ ...f, category: v })); setNewCategory(""); setAddingCategory(false);
                  showToast?.("Category added.");
                }} className="px-3 rounded-lg text-xs font-semibold text-white" style={{ background: "var(--blue)" }}>ADD</button>
              </div>
            )}
          </Field>
          <Field label="Course Level" hint="Not currently stored by the backend (no such field on Course) — display-only in this form.">
            <select value={form.level} onChange={set("level")} className={inputClass} style={inputStyle}>
              {["Beginner", "Intermediate", "Advanced", "All Levels"].map((l) => <option key={l}>{l}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Instructor Name" hint="Not currently saved — the backend links an instructor by account, not free text."><input value={form.instructorName} onChange={set("instructorName")} className={inputClass} style={inputStyle} placeholder="Instructor's full name" /></Field>
          <Field label="Duration" hint="Not currently stored by the backend."><input value={form.duration} onChange={set("duration")} className={inputClass} style={inputStyle} placeholder="e.g. 8 hours, 4 weeks, Self-paced" /></Field>
        </div>
        <Field label="Instructor Bio" hint="Not currently saved by the backend."><textarea value={form.instructorBio} onChange={set("instructorBio")} rows={2} className={inputClass} style={inputStyle} /></Field>

        <Field label="Course Thumbnail" hint="No file-upload endpoint exists on the backend — paste a real image URL to set a thumbnail, or leave blank.">
          <div className="flex items-center gap-3">
            <CourseThumb course={{ title: form.title || "Course", thumbnail: form.thumbnail }} size={56} />
            <input
              value={typeof form.thumbnail === "string" && /^https?:\/\//i.test(form.thumbnail) ? form.thumbnail : ""}
              onChange={set("thumbnail")}
              placeholder="https://example.com/image.jpg"
              className={inputClass} style={inputStyle}
            />
          </div>
        </Field>
      </div>

      <div className="card p-4 sm:p-5 space-y-4">
        <SectionHeader title="Learning Details" />
        <ListEditor label="Learning Objectives" items={form.objectives} onChange={(v) => setForm((f) => ({ ...f, objectives: v }))} placeholder="By the end of this course, students can..." />
        <ListEditor label="Course Requirements" items={form.requirements} onChange={(v) => setForm((f) => ({ ...f, requirements: v }))} placeholder="e.g. Basic computer knowledge" />
        <ListEditor label="Target Audience" items={form.targetAudience} onChange={(v) => setForm((f) => ({ ...f, targetAudience: v }))} placeholder="e.g. Beginners, Business owners" />
        <ListEditor label="Tags" items={form.tags} onChange={(v) => setForm((f) => ({ ...f, tags: v }))} placeholder="e.g. Marketing, Digital Skills" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
        <button onClick={onCancel} className="px-4 py-2.5 rounded-lg text-xs font-semibold order-3 sm:order-1" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>CANCEL</button>
        <button onClick={saveDraft} className="px-4 py-2.5 rounded-lg text-xs font-semibold order-2 flex items-center justify-center gap-1.5" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}><Save size={13} /> SAVE DRAFT</button>
        <button onClick={requestPublish} className="px-4 py-2.5 rounded-lg text-xs font-semibold text-white order-1 sm:order-3 flex items-center justify-center gap-1.5" style={{ background: "var(--blue)" }}><CheckCircle2 size={13} /> PUBLISH COURSE</button>
      </div>

      <ConfirmModal
        open={confirmPublish} onClose={() => setConfirmPublish(false)} onConfirm={confirmPublishNow}
        tone="blue" confirmLabel="PUBLISH"
        title="Publish this course?"
        message="Once published, the course will become available to eligible users on the platform."
      />
    </div>
  );
}

/* ============================================================
   STAGE C — CONTENT MANAGER (modules & lessons)
   ============================================================ */
function LessonEditor({ onSave, onCancel, initial }) {
  const [type, setType] = useState(initial?.type || "VIDEO");
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [duration, setDuration] = useState(initial?.duration || "");
  const [content, setContent] = useState(initial?.content || "");

  const contentLabel = { VIDEO: "Video URL", PDF: "PDF File Name", AUDIO: "Audio URL", TEXT: "Lesson Content", IMAGE: "Image File Name" }[type];

  return (
    <div className="space-y-3 p-3 rounded-lg fade-in" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {LESSON_TYPES.map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className="px-2 py-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1"
            style={{ background: type === t ? "var(--blue)" : "var(--surface)", color: type === t ? "#fff" : "var(--text-soft)", border: "1px solid " + (type === t ? "var(--blue)" : "var(--border)") }}>
            {t === "VIDEO" && <Video size={12} />}{t === "PDF" && <FileText size={12} />}{t === "AUDIO" && <Music size={12} />}{t === "TEXT" && <Pencil size={12} />}{t === "IMAGE" && <ImageIcon size={12} />}
            {t}
          </button>
        ))}
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title" className={inputClass} style={inputStyle} />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" className={inputClass} style={inputStyle} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Duration (e.g. 8 min)" className={inputClass} style={inputStyle} />
        <input value={content} onChange={(e) => setContent(e.target.value)} placeholder={contentLabel} className={inputClass} style={inputStyle} />
      </div>
      {type === "TEXT" && (
        <div className="flex gap-1.5">
          {["Heading", "Bold", "Italic", "List", "Link"].map((tkn) => (
            <button key={tkn} type="button" onClick={() => setContent((c) => c + ` [${tkn}]`)} className="px-2 py-1 rounded text-[10px] font-semibold" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-soft)" }}>{tkn}</button>
          ))}
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>CANCEL</button>
        <button type="button" onClick={() => title.trim() && onSave({ type, title: title.trim(), description, duration, content, resources: initial?.resources || [] })} className="px-3 py-1.5 rounded-md text-xs font-semibold text-white" style={{ background: "var(--blue)" }}>SAVE LESSON</button>
      </div>
    </div>
  );
}

function LessonRow({ lesson, onEdit, onDelete, onMove, isFirst, isLast }) {
  const Icon = { VIDEO: Video, PDF: FileText, AUDIO: Music, TEXT: Pencil, IMAGE: ImageIcon }[lesson.type] || FileText;
  return (
    <div className="flex items-center gap-2.5 py-2 px-2.5 rounded-md" style={{ background: "var(--surface)" }}>
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: "var(--blue-soft)" }}><Icon size={13} color="var(--blue)" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{lesson.title}</p>
        <p className="text-[11px] font-mono" style={{ color: "var(--text-mute)" }}>{lesson.type}{lesson.duration ? ` · ${lesson.duration}` : ""}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button disabled={isFirst} onClick={() => onMove(-1)} className="p-1 rounded disabled:opacity-30"><ArrowUp size={13} color="var(--text-mute)" /></button>
        <button disabled={isLast} onClick={() => onMove(1)} className="p-1 rounded disabled:opacity-30"><ArrowDown size={13} color="var(--text-mute)" /></button>
        <button onClick={onEdit} className="p-1 rounded"><Pencil size={13} color="var(--text-mute)" /></button>
        <button onClick={onDelete} className="p-1 rounded"><Trash2 size={13} color="var(--red)" /></button>
      </div>
    </div>
  );
}

function ContentManager({ course, updateCourse, logCourseActivity }) {
  const [addingModule, setAddingModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [lessonEditor, setLessonEditor] = useState(null); // { moduleId, lessonId | null }
  const [confirm, setConfirm] = useState(null);

  const setModules = (fn) => updateCourse((c) => ({ ...c, modules: fn(c.modules) }));

  const addModule = () => {
    const v = newModuleTitle.trim();
    if (!v) return;
    const mod = { id: `MOD-${Date.now()}`, courseId: course.id, title: v, description: "", order: course.modules.length, lessons: [] };
    setModules((mods) => [...mods, mod]);
    logCourseActivity(`Module "${v}" added`);
    setNewModuleTitle(""); setAddingModule(false);
  };
  const deleteModule = (modId) => {
    const mod = course.modules.find((m) => m.id === modId);
    setModules((mods) => mods.filter((m) => m.id !== modId));
    logCourseActivity(`Module "${mod?.title}" deleted`);
  };
  const moveModule = (modId, dir) => {
    setModules((mods) => {
      const idx = mods.findIndex((m) => m.id === modId);
      const swap = idx + dir;
      if (swap < 0 || swap >= mods.length) return mods;
      const next = [...mods];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };
  const saveLesson = (modId, lessonId, data) => {
    setModules((mods) => mods.map((m) => {
      if (m.id !== modId) return m;
      if (lessonId) return { ...m, lessons: m.lessons.map((l) => (l.id === lessonId ? { ...l, ...data } : l)) };
      const lesson = { id: `LSN-${Date.now()}`, moduleId: modId, order: m.lessons.length, ...data };
      return { ...m, lessons: [...m.lessons, lesson] };
    }));
    logCourseActivity(`Lesson "${data.title}" ${lessonId ? "edited" : "added"}`);
    setLessonEditor(null);
  };
  const deleteLesson = (modId, lessonId, title) => {
    setModules((mods) => mods.map((m) => (m.id === modId ? { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) } : m)));
    logCourseActivity(`Lesson "${title}" deleted`);
  };
  const moveLesson = (modId, lessonId, dir) => {
    setModules((mods) => mods.map((m) => {
      if (m.id !== modId) return m;
      const idx = m.lessons.findIndex((l) => l.id === lessonId);
      const swap = idx + dir;
      if (swap < 0 || swap >= m.lessons.length) return m;
      const next = [...m.lessons];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return { ...m, lessons: next };
    }));
  };

  return (
    <div className="space-y-3">
      {course.modules.length === 0 && <EmptyState title="This course has no modules yet." />}
      {course.modules.map((mod, mi) => (
        <div key={mod.id} className="card p-3.5">
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Layers size={15} color="var(--text-mute)" />
              <div className="min-w-0"><p className="text-sm font-semibold truncate">{mod.title}</p><p className="text-[11px]" style={{ color: "var(--text-mute)" }}>{mod.lessons.length} lesson{mod.lessons.length !== 1 ? "s" : ""}</p></div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button disabled={mi === 0} onClick={() => moveModule(mod.id, -1)} className="p-1 rounded disabled:opacity-30"><ArrowUp size={14} color="var(--text-mute)" /></button>
              <button disabled={mi === course.modules.length - 1} onClick={() => moveModule(mod.id, 1)} className="p-1 rounded disabled:opacity-30"><ArrowDown size={14} color="var(--text-mute)" /></button>
              <button onClick={() => setConfirm({ modId: mod.id })} className="p-1 rounded"><Trash2 size={14} color="var(--red)" /></button>
            </div>
          </div>
          <div className="space-y-1.5">
            {mod.lessons.map((lsn, li) => lessonEditor?.moduleId === mod.id && lessonEditor?.lessonId === lsn.id ? (
              <LessonEditor key={lsn.id} initial={lsn} onCancel={() => setLessonEditor(null)} onSave={(data) => saveLesson(mod.id, lsn.id, data)} />
            ) : (
              <LessonRow key={lsn.id} lesson={lsn} isFirst={li === 0} isLast={li === mod.lessons.length - 1}
                onMove={(dir) => moveLesson(mod.id, lsn.id, dir)} onEdit={() => setLessonEditor({ moduleId: mod.id, lessonId: lsn.id })}
                onDelete={() => deleteLesson(mod.id, lsn.id, lsn.title)} />
            ))}
          </div>
          {lessonEditor?.moduleId === mod.id && lessonEditor?.lessonId === null ? (
            <div className="mt-2"><LessonEditor onCancel={() => setLessonEditor(null)} onSave={(data) => saveLesson(mod.id, null, data)} /></div>
          ) : (
            <button onClick={() => setLessonEditor({ moduleId: mod.id, lessonId: null })} className="mt-2.5 w-full py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>
              <Plus size={13} /> ADD LESSON
            </button>
          )}
        </div>
      ))}

      {addingModule ? (
        <div className="card p-3.5 flex gap-2">
          <input value={newModuleTitle} onChange={(e) => setNewModuleTitle(e.target.value)} placeholder="Module title" className={inputClass} style={inputStyle} onKeyDown={(e) => e.key === "Enter" && addModule()} />
          <button onClick={addModule} className="px-3 rounded-lg text-xs font-semibold text-white shrink-0" style={{ background: "var(--blue)" }}>ADD</button>
          <button onClick={() => setAddingModule(false)} className="px-3 rounded-lg text-xs font-semibold shrink-0" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>CANCEL</button>
        </div>
      ) : (
        <button onClick={() => setAddingModule(true)} className="w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5" style={{ background: "var(--surface-alt)", border: "1px dashed var(--border)", color: "var(--text-soft)" }}>
          <Plus size={14} /> ADD MODULE
        </button>
      )}

      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => { deleteModule(confirm.modId); setConfirm(null); }}
        title="Delete this module?" message="Its lessons will be removed too. This cannot be undone in the demo." confirmLabel="DELETE" tone="red" />
    </div>
  );
}

/* ============================================================
   STAGE C — STUDENTS / SALES / REVIEWS / COMMUNITY / PROMO / CERT / ACTIVITY TABS
   ============================================================ */
function CourseStudentsTab({ course }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const rows = useMemo(() => course.students.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
    const matchesFilter = filter === "all" || s.completion === (filter === "progress" ? "In Progress" : filter === "completed" ? "Completed" : "Not Started");
    return matchesSearch && matchesFilter;
  }), [course.students, search, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <SearchInput value={search} onChange={setSearch} placeholder="Search students by name, email or ID..." />
        <FilterPills options={[{ key: "all", label: "All" }, { key: "progress", label: "In Progress" }, { key: "completed", label: "Completed" }, { key: "not_started", label: "Not Started" }]} value={filter} onChange={setFilter} />
      </div>
      <DataTable
        emptyTitle="No students yet."
        columns={[
          { key: "name", label: "Student", render: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.name} size={26} /><div><p className="text-[13px] font-medium leading-tight">{r.name}</p><p className="text-[11px] leading-tight" style={{ color: "var(--text-mute)" }}>{r.email}</p></div></div> },
          { key: "enrolledAt", label: "Enrolled" },
          { key: "progress", label: "Progress", render: (r) => <span className="font-mono text-xs">{r.progress}%</span> },
          { key: "completion", label: "Status", render: (r) => <StatusBadge status={r.completion === "Completed" ? "Successful" : r.completion === "In Progress" ? "Pending" : "Failed"} /> },
          { key: "lastActivityAt", label: "Last Activity" },
          { key: "certificateStatus", label: "Certificate", render: (r) => <span className="text-xs font-medium" style={{ color: r.certificateStatus === "Issued" ? "var(--green)" : "var(--text-mute)" }}>{r.certificateStatus}</span> },
        ]}
        rows={rows}
      />
    </div>
  );
}

function CourseSalesTab({ course }) {
  const aov = course.sales.successfulOrders ? Math.round(course.sales.totalSales / course.sales.successfulOrders) : 0;
  const cards = [
    { label: "Total Sales", value: fmtGHS(course.sales.totalSales), icon: TrendingUp, tone: "green" },
    { label: "Total Students", value: course.sales.totalStudents, icon: Users, tone: "blue" },
    { label: "Successful Orders", value: course.sales.successfulOrders, icon: ShoppingCart, tone: "blue" },
    { label: "Average Order Value", value: fmtGHS(aov), icon: BarChart3, tone: "amber" },
    { label: "Course Price", value: fmtGHS(course.price), icon: Percent, tone: "gold" },
  ];
  return <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">{cards.map((k) => <MetricCard key={k.label} {...k} />)}</div>;
}

function RatingSummary({ reviews }) {
  const total = reviews.length;
  const avg = total ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / total) * 10) / 10 : 0;
  const counts = [5, 4, 3, 2, 1].map((star) => reviews.filter((r) => r.rating === star).length);
  return (
    <div className="card p-4 sm:p-5 flex flex-col sm:flex-row gap-6">
      <div className="flex flex-col items-center justify-center sm:border-r sm:pr-6" style={{ borderColor: "var(--border-soft)" }}>
        <p className="font-mono font-bold text-3xl">{avg || "—"}</p>
        <RatingStars value={avg} size={16} />
        <p className="text-xs mt-1" style={{ color: "var(--text-mute)" }}>{total} review{total !== 1 ? "s" : ""}</p>
      </div>
      <div className="flex-1 space-y-1.5">
        {[5, 4, 3, 2, 1].map((star, i) => {
          const pct = total ? Math.round((counts[i] / total) * 100) : 0;
          return (
            <div key={star} className="flex items-center gap-2">
              <span className="text-xs w-10" style={{ color: "var(--text-mute)" }}>{star} star</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border-soft)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent-gold)" }} />
              </div>
              <span className="text-xs w-6 text-right font-mono" style={{ color: "var(--text-mute)" }}>{counts[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CourseReviewsTab({ course, updateCourse, logCourseActivity }) {
  const [confirm, setConfirm] = useState(null);
  const setReviews = (fn) => updateCourse((c) => ({ ...c, reviews: fn(c.reviews) }));
  const toggle = (rev) => {
    const hide = rev.status === "Visible";
    setReviews((rs) => rs.map((r) => (r.id === rev.id ? { ...r, status: hide ? "Hidden" : "Visible" } : r)));
    logCourseActivity(`Review by ${rev.reviewer} ${hide ? "hidden" : "restored"}`);
    setConfirm(null);
  };
  return (
    <div className="space-y-4">
      <RatingSummary reviews={course.reviews} />
      {course.reviews.length === 0 ? <EmptyState title="No reviews yet." /> : (
        <div className="space-y-2.5">
          {course.reviews.map((r) => (
            <div key={r.id} className="card p-3.5 flex items-start gap-3">
              <Avatar name={r.reviewer} size={32} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium">{r.reviewer}</p>
                  {r.verified && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}><BadgeCheck size={10} /> Verified Learner</span>}
                  <CourseStatusBadge status={r.status} />
                </div>
                <RatingStars value={r.rating} />
                <p className="text-xs mt-1.5" style={{ color: "var(--text-soft)" }}>{r.review}</p>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-mute)" }}>{r.date}</p>
              </div>
              <button onClick={() => setConfirm(r)} className="px-2.5 py-1.5 rounded-md text-xs font-semibold shrink-0" style={{ background: r.status === "Visible" ? "var(--red-soft)" : "var(--green-soft)", color: r.status === "Visible" ? "var(--red)" : "var(--green)" }}>
                {r.status === "Visible" ? "HIDE" : "RESTORE"}
              </button>
            </div>
          ))}
        </div>
      )}
      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => toggle(confirm)}
        tone={confirm?.status === "Visible" ? "red" : "green"} confirmLabel={confirm?.status === "Visible" ? "HIDE REVIEW" : "RESTORE REVIEW"}
        title={confirm?.status === "Visible" ? "Hide this review?" : "Restore this review?"}
        message={confirm?.status === "Visible" ? "It will no longer be visible to other learners." : "It will become visible to other learners again."} />
    </div>
  );
}

function CourseCommunityTab({ course, updateCourse, logCourseActivity, showToast }) {
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [aTitle, setATitle] = useState(""); const [aMsg, setAMsg] = useState("");
  const setCommunity = (fn) => updateCourse((c) => ({ ...c, community: fn(c.community) }));

  const togglePin = (post) => {
    setCommunity((cm) => ({ ...cm, posts: cm.posts.map((p) => (p.id === post.id ? { ...p, pinned: !p.pinned } : p)) }));
    logCourseActivity(`Community post ${post.pinned ? "unpinned" : "pinned"}`);
  };
  const toggleHide = (post) => {
    setCommunity((cm) => ({ ...cm, posts: cm.posts.map((p) => (p.id === post.id ? { ...p, hidden: !p.hidden } : p)) }));
    logCourseActivity(`Community post ${post.hidden ? "restored" : "hidden"}`);
  };
  const hideComment = (postId, commentId) => {
    setCommunity((cm) => ({ ...cm, posts: cm.posts.map((p) => (p.id !== postId ? p : { ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, hidden: !c.hidden } : c)) })) }));
  };
  const publishAnnouncement = () => {
    if (!aTitle.trim() || !aMsg.trim()) return;
    const post = { id: `PST-${Date.now()}`, author: "Admin", content: `${aTitle.trim()}: ${aMsg.trim()}`, pinned: true, hidden: false, date: new Date().toISOString().slice(0, 10), comments: [] };
    setCommunity((cm) => ({ ...cm, posts: [post, ...cm.posts] }));
    logCourseActivity(`Announcement "${aTitle.trim()}" published`);
    showToast?.("Announcement published to course community.");
    setATitle(""); setAMsg(""); setAnnounceOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5">
        <SectionHeader title="Community" subtitle={`${course.community.members} members`} action={
          <button onClick={() => setAnnounceOpen((v) => !v)} className="text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}><Megaphone size={13} /> ANNOUNCEMENT</button>
        } />
        {announceOpen && (
          <div className="space-y-2 mb-3">
            <input value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder="Announcement title" className={inputClass} style={inputStyle} />
            <textarea value={aMsg} onChange={(e) => setAMsg(e.target.value)} placeholder="Message" rows={2} className={inputClass} style={inputStyle} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAnnounceOpen(false)} className="px-3 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>CANCEL</button>
              <button onClick={publishAnnouncement} className="px-3 py-1.5 rounded-md text-xs font-semibold text-white" style={{ background: "var(--blue)" }}>PUBLISH</button>
            </div>
          </div>
        )}
        {course.community.posts.length === 0 ? <EmptyState title="No community posts yet." /> : (
          <div className="space-y-2.5">
            {course.community.posts.map((p) => (
              <div key={p.id} className="p-3 rounded-lg" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-soft)", opacity: p.hidden ? 0.55 : 1 }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-semibold">{p.author}</p>
                      {p.pinned && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "var(--accent-gold-soft)", color: "var(--accent-gold)" }}><Pin size={9} /> Pinned</span>}
                      {p.hidden && <span className="text-[10px] font-semibold" style={{ color: "var(--red)" }}>Hidden</span>}
                    </div>
                    <p className="text-xs mt-1" style={{ color: "var(--text-soft)" }}>{p.content}</p>
                    <p className="text-[11px] mt-1" style={{ color: "var(--text-mute)" }}>{p.date}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => togglePin(p)} className="p-1.5 rounded-md" style={{ background: "var(--surface)" }} title={p.pinned ? "Unpin" : "Pin"}>{p.pinned ? <PinOff size={13} color="var(--text-mute)" /> : <Pin size={13} color="var(--text-mute)" />}</button>
                    <button onClick={() => toggleHide(p)} className="p-1.5 rounded-md" style={{ background: "var(--surface)" }} title={p.hidden ? "Restore" : "Hide"}>{p.hidden ? <Eye size={13} color="var(--green)" /> : <EyeOff size={13} color="var(--red)" />}</button>
                  </div>
                </div>
                {p.comments.length > 0 && (
                  <div className="mt-2 pl-3 space-y-1.5" style={{ borderLeft: "2px solid var(--border-soft)" }}>
                    {p.comments.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2" style={{ opacity: c.hidden ? 0.5 : 1 }}>
                        <p className="text-[11px]"><span className="font-semibold">{c.author}:</span> <span style={{ color: "var(--text-soft)" }}>{c.text}</span></p>
                        <button onClick={() => hideComment(p.id, c.id)} className="shrink-0"><MessageCircle size={12} color={c.hidden ? "var(--green)" : "var(--text-mute)"} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CoursePromoTab({ course, updateCourse, logCourseActivity, showToast }) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState("Course Flyer"); const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [caption, setCaption] = useState("");
  const setMaterials = (fn) => updateCourse((c) => ({ ...c, promotionalMaterials: fn(c.promotionalMaterials) }));

  const add = () => {
    if (!title.trim()) return;
    const mat = { id: `PROMO-${Date.now()}`, type, title: title.trim(), description: desc.trim(), caption: caption.trim() || `Check out ${course.title}. Learn practical skills and start your learning journey today.`, status: "Active" };
    setMaterials((ms) => [mat, ...ms]);
    logCourseActivity(`Promotional material "${mat.title}" added`);
    showToast?.("Promotional material added.");
    setTitle(""); setDesc(""); setCaption(""); setAdding(false);
  };
  const toggleStatus = (m) => {
    setMaterials((ms) => ms.map((x) => (x.id === m.id ? { ...x, status: x.status === "Active" ? "Inactive" : "Active" } : x)));
    logCourseActivity(`Promotional material "${m.title}" set to ${m.status === "Active" ? "Inactive" : "Active"}`);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5">
        <SectionHeader title="Promotional Materials" subtitle="Flyers, captions and referral messages agents can use to promote this course." action={
          <button onClick={() => setAdding((v) => !v)} className="text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}><Plus size={13} /> ADD MATERIAL</button>
        } />
        {adding && (
          <div className="space-y-2 mb-3">
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass} style={inputStyle}>
              {["Course Flyer", "Course Image", "Video", "Promotional Caption", "Description", "Referral Message"].map((t) => <option key={t}>{t}</option>)}
            </select>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Material title" className={inputClass} style={inputStyle} />
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" rows={2} className={inputClass} style={inputStyle} />
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={`Promotional caption — e.g. "Start learning ${course.title} today..."`} rows={2} className={inputClass} style={inputStyle} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>CANCEL</button>
              <button onClick={add} className="px-3 py-1.5 rounded-md text-xs font-semibold text-white" style={{ background: "var(--blue)" }}>ADD</button>
            </div>
          </div>
        )}
        {course.promotionalMaterials.length === 0 ? <EmptyState title="No promotional materials yet." /> : (
          <div className="space-y-2.5">
            {course.promotionalMaterials.map((m) => (
              <div key={m.id} className="p-3 rounded-lg flex items-start justify-between gap-3" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-soft)" }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap"><p className="text-xs font-semibold">{m.title}</p><CourseStatusBadge status={m.status} /></div>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-mute)" }}>{m.type}</p>
                  <p className="text-xs mt-1.5 italic" style={{ color: "var(--text-soft)" }}>"{m.caption}"</p>
                </div>
                <button onClick={() => toggleStatus(m)} className="px-2.5 py-1.5 rounded-md text-xs font-semibold shrink-0" style={{ background: m.status === "Active" ? "var(--red-soft)" : "var(--green-soft)", color: m.status === "Active" ? "var(--red)" : "var(--green)" }}>
                  {m.status === "Active" ? "DEACTIVATE" : "ACTIVATE"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CourseCertificateTab({ course, updateCourse, logCourseActivity, showToast }) {
  const [form, setForm] = useState(course.certificateSettings);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const save = () => {
    updateCourse((c) => ({ ...c, certificateSettings: form }));
    logCourseActivity(`Certificate settings ${form.enabled ? "enabled and updated" : "disabled"}`);
    showToast?.("Certificate settings saved.");
  };
  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <SectionHeader title="Certificate Configuration" subtitle="A learner receives the certificate after completing the required lessons — no quiz or exam." />
      <div className="flex gap-2">
        <button onClick={() => setForm((f) => ({ ...f, enabled: true }))} className="flex-1 py-2.5 rounded-lg text-xs font-semibold" style={{ background: form.enabled ? "var(--green)" : "var(--surface-alt)", color: form.enabled ? "#fff" : "var(--text)", border: "1px solid " + (form.enabled ? "var(--green)" : "var(--border)") }}>CERTIFICATE ENABLED</button>
        <button onClick={() => setForm((f) => ({ ...f, enabled: false }))} className="flex-1 py-2.5 rounded-lg text-xs font-semibold" style={{ background: !form.enabled ? "var(--red)" : "var(--surface-alt)", color: !form.enabled ? "#fff" : "var(--text)", border: "1px solid " + (!form.enabled ? "var(--red)" : "var(--border)") }}>CERTIFICATE DISABLED</button>
      </div>
      {form.enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Certificate Title"><input value={form.title} onChange={set("title")} className={inputClass} style={inputStyle} /></Field>
          <Field label="Certificate ID Prefix"><input value={form.idPrefix} onChange={set("idPrefix")} className={inputClass} style={inputStyle} /></Field>
          <Field label="Authorized Designation"><input value={form.authorizedDesignation} onChange={set("authorizedDesignation")} className={inputClass} style={inputStyle} /></Field>
          <Field label="Certificate Template">
            <select value={form.template} onChange={set("template")} className={inputClass} style={inputStyle}>
              {["Classic Gold", "Modern Blue", "Minimal Mono"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Completion Statement" hint="e.g. “has successfully completed the course”"><input value={form.completionStatement} onChange={set("completionStatement")} className={inputClass} style={inputStyle} /></Field>
          <Field label="Required Completion %" hint="Default 100% — lesson-based, no quiz required."><input type="number" min="1" max="100" value={form.requiredCompletionPct} onChange={set("requiredCompletionPct")} className={inputClass} style={inputStyle} /></Field>
        </div>
      )}
      <div className="flex justify-end"><button onClick={save} className="px-4 py-2.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5" style={{ background: "var(--blue)" }}><Save size={13} /> SAVE CERTIFICATE SETTINGS</button></div>
    </div>
  );
}

function CourseActivityTab({ course }) {
  if (!course.activity?.length) return <EmptyState title="No activity recorded yet." />;
  return (
    <div className="card p-4 sm:p-5 space-y-3">
      {course.activity.map((a) => (
        <div key={a.id} className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "var(--blue-soft)" }}><Clock size={13} color="var(--blue)" /></div>
          <div><p className="text-sm">{a.text}</p><p className="text-[11px]" style={{ color: "var(--text-mute)" }}>{a.date}</p></div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   STAGE C — COURSE DETAIL PAGE
   ============================================================ */
function CourseDetailPage({ course, updateCourse, onEdit, onBack, logAdmin, showToast }) {
  const [tab, setTab] = useState("Overview");
  const [confirm, setConfirm] = useState(null);
  const [preview, setPreview] = useState(false);

  const logCourseActivity = (text) => {
    updateCourse((c) => ({ ...c, activity: [{ id: `ACT-${Date.now()}`, text, date: new Date().toISOString().slice(0, 10) }, ...(c.activity || [])] }));
    logAdmin?.(`${text} — ${course.title}`);
  };

  const setStatus = (status) => {
    updateCourse((c) => ({ ...c, status, updatedAt: new Date().toISOString().slice(0, 10) }));
    logCourseActivity(`Course ${status === "Published" ? "published" : status === "Draft" ? "unpublished" : "archived"}`);
    showToast?.(`Course ${status.toLowerCase()}.`);
    setConfirm(null);
  };

  const tabs = ["Overview", "Content", "Students", "Sales", "Reviews", "Community", "Promotional", "Certificate", "Activity"];

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <button onClick={onBack} className="text-xs font-semibold flex items-center gap-1" style={{ color: "var(--blue)" }}>← Back to Courses</button>
      </div>

      <div className="card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row gap-4">
          <CourseThumb course={course} size={72} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display font-bold text-lg">{course.title}</h2>
              <CourseStatusBadge status={course.status} />
            </div>
            <p className="text-xs font-mono mt-0.5" style={{ color: "var(--text-mute)" }}>{course.id} · {course.category} · {course.level}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: "var(--text-soft)" }}>
              <span className="font-mono font-semibold" style={{ color: "var(--text)" }}>{fmtGHS(course.price)}</span>
              <span className="flex items-center gap-1"><Users size={12} /> {course.sales.totalStudents} students</span>
              <span className="flex items-center gap-1"><RatingStars value={course.avgRating} /> {course.avgRating || "—"} ({course.reviews.length})</span>
              <span className="flex items-center gap-1"><TrendingUp size={12} /> {fmtGHS(course.sales.totalSales)} sales</span>
              <span>Created {course.createdAt} · Updated {course.updatedAt}</span>
            </div>
          </div>
          <div className="flex flex-row sm:flex-col gap-2 shrink-0">
            <button onClick={onEdit} className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}><Pencil size={13} /> EDIT</button>
            <button onClick={() => setPreview(true)} className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}><Eye size={13} /> PREVIEW</button>
            {course.status === "Published" ? (
              <button onClick={() => setConfirm("unpublish")} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}>UNPUBLISH</button>
            ) : (
              <button onClick={() => setConfirm("publish")} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "var(--green-soft)", color: "var(--green)" }}>PUBLISH</button>
            )}
            {course.status !== "Archived" && <button onClick={() => setConfirm("archive")} className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5" style={{ background: "var(--red-soft)", color: "var(--red)" }}><Archive size={13} /> ARCHIVE</button>}
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "Overview" && (
        <div className="card p-4 sm:p-5 space-y-3 text-sm">
          <p style={{ color: "var(--text-soft)" }}>{course.description}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div><p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-mute)" }}>LEARNING OBJECTIVES</p><ul className="space-y-1 text-xs" style={{ color: "var(--text-soft)" }}>{course.objectives.map((o, i) => <li key={i}>• {o}</li>)}</ul></div>
            <div><p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-mute)" }}>REQUIREMENTS</p><ul className="space-y-1 text-xs" style={{ color: "var(--text-soft)" }}>{course.requirements.map((o, i) => <li key={i}>• {o}</li>)}</ul></div>
            <div><p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-mute)" }}>TARGET AUDIENCE</p><p className="text-xs" style={{ color: "var(--text-soft)" }}>{course.targetAudience.join(", ")}</p></div>
            <div><p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-mute)" }}>INSTRUCTOR</p><p className="text-xs font-medium">{course.instructor.name}</p><p className="text-xs" style={{ color: "var(--text-soft)" }}>{course.instructor.bio}</p></div>
          </div>
          {course.tags?.length > 0 && <div className="flex flex-wrap gap-1.5 pt-1">{course.tags.map((t) => <span key={t} className="text-[11px] font-medium px-2 py-1 rounded-full" style={{ background: "var(--border-soft)", color: "var(--text-soft)" }}>{t}</span>)}</div>}
        </div>
      )}
      {tab === "Content" && <ContentManager course={course} updateCourse={updateCourse} logCourseActivity={logCourseActivity} />}
      {tab === "Students" && <CourseStudentsTab course={course} />}
      {tab === "Sales" && <CourseSalesTab course={course} />}
      {tab === "Reviews" && <CourseReviewsTab course={course} updateCourse={updateCourse} logCourseActivity={logCourseActivity} />}
      {tab === "Community" && <CourseCommunityTab course={course} updateCourse={updateCourse} logCourseActivity={logCourseActivity} showToast={showToast} />}
      {tab === "Promotional" && <CoursePromoTab course={course} updateCourse={updateCourse} logCourseActivity={logCourseActivity} showToast={showToast} />}
      {tab === "Certificate" && <CourseCertificateTab course={course} updateCourse={updateCourse} logCourseActivity={logCourseActivity} showToast={showToast} />}
      {tab === "Activity" && <CourseActivityTab course={course} />}

      <ConfirmModal
        open={!!confirm} onClose={() => setConfirm(null)}
        onConfirm={() => setStatus(confirm === "publish" ? "Published" : confirm === "unpublish" ? "Draft" : "Archived")}
        tone={confirm === "archive" ? "red" : confirm === "unpublish" ? "amber" : "green"}
        confirmLabel={confirm === "publish" ? "PUBLISH" : confirm === "unpublish" ? "UNPUBLISH" : "ARCHIVE"}
        title={confirm === "publish" ? "Publish this course?" : confirm === "unpublish" ? "Unpublish this course?" : "Archive this course?"}
        message={
          confirm === "publish" ? "Once published, the course will become available to eligible users on the platform." :
          confirm === "unpublish" ? "The course moves back to Draft. Existing student records and certificates are kept." :
          "The course stays in your records and is no longer actively available for new purchases."
        }
      />

      <Modal open={preview} onClose={() => setPreview(false)} title="Course Preview">
        <div className="space-y-3">
          <CourseThumb course={course} size={64} />
          <h3 className="font-display font-semibold text-base">{course.title}</h3>
          <p className="font-mono font-semibold text-sm" style={{ color: "var(--text)" }}>{fmtGHS(course.price)}</p>
          <p className="text-xs" style={{ color: "var(--text-soft)" }}>{course.shortDescription}</p>
          <p className="text-xs" style={{ color: "var(--text-soft)" }}>{course.description}</p>
          <div><p className="text-xs font-semibold mb-1" style={{ color: "var(--text-mute)" }}>WHAT YOU'LL LEARN</p><ul className="text-xs space-y-1" style={{ color: "var(--text-soft)" }}>{course.objectives.map((o, i) => <li key={i}>✓ {o}</li>)}</ul></div>
          <p className="text-xs" style={{ color: "var(--text-mute)" }}>Taught by {course.instructor.name} · {course.duration} · {course.level}</p>
        </div>
      </Modal>
    </div>
  );
}

/* ============================================================
   STAGE C — COURSES LIST PAGE
   ============================================================ */
function CourseBulkBar({ count, onSelectAll, onDeselectAll, onPublish, onArchive, onUnpublish }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg fade-in flex-wrap" style={{ background: "var(--blue-soft)" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--blue)" }}>{count} course{count !== 1 ? "s" : ""} selected</p>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onPublish} className="px-3 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--green)", color: "#fff" }}>PUBLISH SELECTED</button>
        <button onClick={onUnpublish} className="px-3 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--amber)", color: "#fff" }}>UNPUBLISH SELECTED</button>
        <button onClick={onArchive} className="px-3 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--red)", color: "#fff" }}>ARCHIVE SELECTED</button>
        <button onClick={onDeselectAll} className="text-xs font-semibold" style={{ color: "var(--blue)" }}>Clear</button>
      </div>
    </div>
  );
}

function CoursesPage({ courses, setCourses, categories, setCategories, loading, logAdmin, showToast }) {
  const [view, setView] = useState("list"); // list | form | detail
  const [formMode, setFormMode] = useState("create");
  const [activeCourseId, setActiveCourseId] = useState(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [bulkConfirm, setBulkConfirm] = useState(null);
  const pageSize = 8;

  const [detailOverride, setDetailOverride] = useState(null); // real modules, fetched on demand
  const activeCourseBase = courses.find((c) => c.id === activeCourseId) || null;
  const activeCourse = activeCourseBase && detailOverride && detailOverride.id === activeCourseId
    ? { ...activeCourseBase, modules: detailOverride.modules }
    : activeCourseBase;
  const updateActiveCourse = (fn) => setCourses((cs) => cs.map((c) => (c.id === activeCourseId ? fn(c) : c)));

  const filterCounts = useMemo(() => ({
    all: courses.length,
    Published: courses.filter((c) => c.status === "Published").length,
    Draft: courses.filter((c) => c.status === "Draft").length,
    Archived: courses.filter((c) => c.status === "Archived").length,
    Popular: courses.filter((c) => c.sales.totalStudents >= 3).length,
    New: courses.filter((c) => c.createdAt >= "2026-08-01").length,
  }), [courses]);

  const filtered = useMemo(() => {
    let rows = courses.filter((c) => {
      const q = search.toLowerCase();
      const matchesSearch = !q || c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
      const matchesCategory = categoryFilter === "all" || c.category === categoryFilter;
      const matchesLevel = levelFilter === "all" || c.level === levelFilter;
      let matchesFilter = true;
      if (filter === "Published" || filter === "Draft" || filter === "Archived") matchesFilter = c.status === filter;
      else if (filter === "Popular") matchesFilter = c.sales.totalStudents >= 3;
      else if (filter === "New") matchesFilter = c.createdAt >= "2026-08-01";
      return matchesSearch && matchesCategory && matchesLevel && matchesFilter;
    });
    const sorters = {
      newest: (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
      oldest: (a, b) => (a.createdAt > b.createdAt ? 1 : -1),
      name_asc: (a, b) => a.title.localeCompare(b.title),
      name_desc: (a, b) => b.title.localeCompare(a.title),
      price: (a, b) => b.price - a.price,
      students: (a, b) => b.sales.totalStudents - a.sales.totalStudents,
      rating: (a, b) => b.avgRating - a.avgRating,
      sales: (a, b) => b.sales.totalSales - a.sales.totalSales,
    };
    return [...rows].sort(sorters[sort] || sorters.newest);
  }, [courses, search, filter, categoryFilter, levelFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const openCreate = () => { setFormMode("create"); setActiveCourseId(null); setView("form"); };
  const openEdit = (c) => { setFormMode("edit"); setActiveCourseId(c.id); setView("form"); };
  const openDetail = (c) => {
    setActiveCourseId(c.id);
    setView("detail");
    setDetailOverride(null);
    // The real GET /admin/courses/:id does NOT include modules (see
    // src/services/course.service.js getCourseById — a bare findUnique,
    // no include). The only real endpoint that returns the module/lesson
    // structure is GET /courses/:courseId/content (used by the learner
    // content page); it always includes id/title/type/position/duration
    // regardless of access, only omitting the lesson body. That's a real,
    // confirmed backend limitation — see the Phase 8 report.
    apiFetch(`/courses/${c.id}/content`).then(r => setDetailOverride({
      id: c.id,
      modules: (r.modules || []).map(m => ({
        id: m.id, title: m.title, description: m.description || "",
        lessons: (m.lessons || []).map(ls => ({
          id: ls.id, title: ls.title, type: ls.type, duration: ls.duration ? `${Math.round(ls.duration / 60)} min` : "",
          description: "", content: "", resources: [],
        })),
      })),
    })).catch(() => {});
  };

  const saveCourse = (data, published) => {
    if (formMode === "edit" && activeCourseId) {
      setCourses((cs) => cs.map((c) => (c.id === activeCourseId ? {
        ...c, ...data,
        activity: [{ id: `ACT-${Date.now()}`, text: published ? "Course published" : "Course updated", date: new Date().toISOString().slice(0, 10) }, ...c.activity],
        updatedAt: new Date().toISOString().slice(0, 10),
      } : c)));
      logAdmin?.(`Admin updated course "${data.title}"`);
      showToast?.(published ? "Course published." : "Course saved as draft.");
      setView("detail");
    } else {
      const id = nextCourseId();
      const newCourse = {
        id, ...data, modules: [], students: [], reviews: [], avgRating: 0,
        community: { members: 0, posts: [] }, promotionalMaterials: [],
        certificateSettings: buildCertificateSettings(id, false),
        activity: [{ id: `ACT-${Date.now()}`, text: "Course created", date: new Date().toISOString().slice(0, 10) }],
        sales: { totalSales: 0, totalStudents: 0, successfulOrders: 0 },
        createdAt: new Date().toISOString().slice(0, 10), updatedAt: new Date().toISOString().slice(0, 10),
      };
      setCourses((cs) => [newCourse, ...cs]);
      logAdmin?.(`Admin created course "${data.title}"`);
      showToast?.(published ? "Course created and published." : "Course saved as draft.");
      setActiveCourseId(id);
      setView("detail");
    }
  };

  const runBulk = () => {
    const status = bulkConfirm === "publish" ? "Published" : bulkConfirm === "unpublish" ? "Draft" : "Archived";
    setCourses((cs) => cs.map((c) => (selected.includes(c.id) ? { ...c, status, updatedAt: new Date().toISOString().slice(0, 10) } : c)));
    logAdmin?.(`Admin ${bulkConfirm}ed ${selected.length} course(s)`);
    showToast?.(`${selected.length} course(s) updated.`);
    setSelected([]); setBulkConfirm(null);
  };

  if (view === "form") {
    return <CourseForm mode={formMode} initial={formMode === "edit" ? activeCourse : null} categories={categories} setCategories={setCategories}
      onCancel={() => setView(formMode === "edit" ? "detail" : "list")} onSave={saveCourse} showToast={showToast} />;
  }
  if (view === "detail" && activeCourse) {
    return <CourseDetailPage course={activeCourse} updateCourse={updateActiveCourse} onEdit={() => openEdit(activeCourse)} onBack={() => setView("list")} logAdmin={logAdmin} showToast={showToast} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">COURSES</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>Create, manage and organize courses available on the platform.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu onExport={(f) => showToast?.(`Preparing ${f} export…`)} />
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold text-white" style={{ background: "var(--blue)" }}><Plus size={14} /> CREATE COURSE</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Courses" value={courses.length} icon={BookOpen} tone="blue" loading={loading} />
        <MetricCard label="Published" value={filterCounts.Published} icon={CheckCircle2} tone="green" loading={loading} />
        <MetricCard label="Draft" value={filterCounts.Draft} icon={Clock} tone="amber" loading={loading} />
        <MetricCard label="Archived" value={filterCounts.Archived} icon={Archive} tone="blue" loading={loading} />
      </div>

      <div className="card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search courses by name, category or course ID..." />
          <div className="flex items-center gap-2 flex-wrap">
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="text-xs font-medium rounded-lg px-3 py-2.5 outline-none" style={inputStyle}>
              <option value="all">All Categories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="text-xs font-medium rounded-lg px-3 py-2.5 outline-none" style={inputStyle}>
              <option value="all">All Levels</option>{["Beginner", "Intermediate", "Advanced", "All Levels"].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <SortSelect value={sort} onChange={setSort} options={[
              { key: "newest", label: "Newest" }, { key: "oldest", label: "Oldest" },
              { key: "name_asc", label: "Name A-Z" }, { key: "name_desc", label: "Name Z-A" },
              { key: "price", label: "Price" }, { key: "students", label: "Most Students" },
              { key: "rating", label: "Highest Rating" }, { key: "sales", label: "Highest Sales" },
            ]} />
          </div>
        </div>
        <FilterPills value={filter} onChange={(k) => { setFilter(k); setPage(1); }} options={[
          { key: "all", label: "All Courses", count: filterCounts.all },
          { key: "Published", label: "Published", count: filterCounts.Published },
          { key: "Draft", label: "Draft", count: filterCounts.Draft },
          { key: "Archived", label: "Archived", count: filterCounts.Archived },
          { key: "Popular", label: "Popular", count: filterCounts.Popular },
          { key: "New", label: "New", count: filterCounts.New },
        ]} />
      </div>

      <CourseBulkBar count={selected.length} onSelectAll={() => setSelected(pageRows.map((r) => r.id))} onDeselectAll={() => setSelected([])}
        onPublish={() => setBulkConfirm("publish")} onUnpublish={() => setBulkConfirm("unpublish")} onArchive={() => setBulkConfirm("archive")} />

      <div className="card fade-in">
        {loading ? (
          <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : pageRows.length === 0 ? (
          <EmptyState title="No courses found." subtitle="Try a different search term or filter." />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto admin-scroll">
              <table className="w-full text-sm min-w-[920px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="w-10 py-2.5 px-3"><input type="checkbox" checked={selected.length === pageRows.length && pageRows.length > 0} onChange={(e) => setSelected(e.target.checked ? pageRows.map((r) => r.id) : [])} /></th>
                    {["Course", "Category", "Price", "Students", "Rating", "Status", "Updated"].map((h) => (
                      <th key={h} className="text-left font-medium py-2.5 px-3 whitespace-nowrap text-[11px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>{h}</th>
                    ))}
                    <th className="text-right py-2.5 px-3 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((c) => (
                    <tr key={c.id} className="fade-in" style={{ borderBottom: "1px solid var(--border-soft)" }}>
                      <td className="px-3 py-2.5"><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-2.5"><CourseThumb course={c} size={34} /><div><p className="text-[13px] font-medium leading-tight">{c.title}</p><p className="text-[11px] font-mono leading-tight" style={{ color: "var(--text-mute)" }}>{c.id}</p></div></div></td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-soft)" }}>{c.category}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{fmtGHS(c.price)}</td>
                      <td className="px-3 py-2.5 text-xs">{c.sales.totalStudents}</td>
                      <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1 text-xs"><RatingStars value={c.avgRating} size={11} /> {c.avgRating || "—"}</span></td>
                      <td className="px-3 py-2.5"><CourseStatusBadge status={c.status} /></td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-soft)" }}>{c.updatedAt}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <ViewButton onClick={() => openDetail(c)} />
                          <button onClick={() => openEdit(c)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}><Pencil size={12} /> EDIT</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y" style={{ borderColor: "var(--border-soft)" }}>
              {pageRows.map((c) => (
                <div key={c.id} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} />
                      <CourseThumb course={c} size={36} />
                      <div><p className="text-[13px] font-medium">{c.title}</p><p className="text-[11px] font-mono" style={{ color: "var(--text-mute)" }}>{c.id}</p></div>
                    </div>
                    <CourseStatusBadge status={c.status} />
                  </div>
                  <div className="text-xs flex flex-wrap gap-x-3 gap-y-1" style={{ color: "var(--text-soft)" }}>
                    <span>{c.category}</span><span className="font-mono">{fmtGHS(c.price)}</span><span>{c.sales.totalStudents} students</span>
                    <span className="inline-flex items-center gap-1"><RatingStars value={c.avgRating} size={11} />{c.avgRating || "—"}</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => openDetail(c)} className="flex-1 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>VIEW</button>
                    <button onClick={() => openEdit(c)} className="flex-1 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>EDIT</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} /></div>
          </>
        )}
      </div>

      <ConfirmModal open={!!bulkConfirm} onClose={() => setBulkConfirm(null)} onConfirm={runBulk}
        tone={bulkConfirm === "archive" ? "red" : bulkConfirm === "unpublish" ? "amber" : "green"}
        confirmLabel={bulkConfirm === "publish" ? "PUBLISH SELECTED" : bulkConfirm === "unpublish" ? "UNPUBLISH SELECTED" : "ARCHIVE SELECTED"}
        title={`${bulkConfirm === "publish" ? "Publish" : bulkConfirm === "unpublish" ? "Unpublish" : "Archive"} ${selected.length} selected course(s)?`}
        message="This will update the status of every selected course." />
    </div>
  );
}

/* ============================================================
   STAGE D — FINANCIAL & PLATFORM OPERATIONS
   ============================================================ */
const FINANCE_RANGE_MULTIPLIERS = {
  "Today": 0.06, "Yesterday": 0.05, "Last 7 Days": 0.24, "Last 30 Days": 1,
  "This Month": 0.92, "Last Month": 0.88, "Custom Range": 1,
};
function scaleForRange(value, range) { return Math.round((value || 0) * (FINANCE_RANGE_MULTIPLIERS[range] ?? 1)); }

function ThreeBalancesCard({ loading, financeStats }) {
  const items = [
    { label: "Cashback Balance", value: financeStats.cashbackBalance, tone: "green", icon: Gift },
    { label: "Commission Balance", value: financeStats.successfulCommission, tone: "amber", icon: Percent },
    { label: "Reward Balance", value: financeStats.rewardBalance, tone: "gold", icon: Award },
  ];
  const available = items.reduce((s, i) => s + i.value, 0);
  return (
    <div className="card p-4 sm:p-5 fade-in">
      <SectionHeader title="Eligible Withdrawal Balances" subtitle="Kept separate — never merged into a single figure" />
      {loading ? <Skeleton className="h-28 w-full" /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <div key={it.label} className="rounded-xl p-3.5" style={{ background: it.tone === "gold" ? "var(--accent-gold-soft)" : `var(--${it.tone}-soft)` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={14} color={it.tone === "gold" ? "var(--accent-gold)" : `var(--${it.tone})`} />
                    <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>{it.label}</span>
                  </div>
                  <p className="font-mono font-semibold text-lg" style={{ color: it.tone === "gold" ? "var(--accent-gold)" : `var(--${it.tone})` }}>{fmtGHS(it.value)}</p>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between rounded-xl px-3.5 py-3" style={{ background: "var(--blue-soft)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--blue)" }}>Available Withdrawal Balance</span>
            <span className="font-mono font-bold text-base" style={{ color: "var(--blue)" }}>{fmtGHS(available)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function FinancePage({ loading, onNavigate, financeStats, transactions, orders, withdrawals }) {
  const [range, setRange] = useState("Last 30 Days");
  const s = financeStats;
  const kpis = [
    { label: "Total Revenue", value: fmtGHS(scaleForRange(s.totalRevenue, range)), icon: TrendingUp, tone: "blue", featured: true },
    { label: "Total Course Sales", value: fmtGHS(scaleForRange(s.totalCourseSales, range)), icon: ShoppingCart, tone: "blue" },
    { label: "Total Cashback Issued", value: fmtGHS(scaleForRange(s.totalCashbackIssued, range)), icon: Gift, tone: "green" },
    { label: "Total Commission", value: fmtGHS(scaleForRange(s.totalCommission, range)), icon: Percent, tone: "amber" },
    { label: "Total Rewards", value: fmtGHS(scaleForRange(s.totalRewards, range)), icon: Award, tone: "gold" },
    { label: "Total Withdrawals", value: fmtGHS(scaleForRange(s.totalWithdrawals, range)), icon: Wallet, tone: "red" },
    { label: "Pending Withdrawals", value: fmtGHS(s.pendingWithdrawals), icon: Clock, tone: "amber" },
    { label: "Available Platform Balance", value: fmtGHS(scaleForRange(s.availableBalance, range)), icon: BarChart3, tone: "green" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">Financial Overview</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>Platform-wide financial visibility, derived from a single centralized data source.</p>
        </div>
        <DateFilter value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {kpis.map((k) => <MetricCard key={k.label} {...k} loading={loading} />)}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SalesOverview loading={loading} />
        <ThreeBalancesCard loading={loading} financeStats={s} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button onClick={() => onNavigate("transactions")} className="card p-4 text-left fade-in flex items-center justify-between">
          <div><p className="text-sm font-semibold">Transactions</p><p className="text-xs mt-0.5" style={{ color: "var(--text-mute)" }}>{transactions.length} records</p></div>
          <ChevronRight size={16} color="var(--text-mute)" />
        </button>
        <button onClick={() => onNavigate("orders")} className="card p-4 text-left fade-in flex items-center justify-between">
          <div><p className="text-sm font-semibold">Orders</p><p className="text-xs mt-0.5" style={{ color: "var(--text-mute)" }}>{orders.length} orders</p></div>
          <ChevronRight size={16} color="var(--text-mute)" />
        </button>
        <button onClick={() => onNavigate("withdrawals")} className="card p-4 text-left fade-in flex items-center justify-between">
          <div><p className="text-sm font-semibold">Withdrawals</p><p className="text-xs mt-0.5" style={{ color: "var(--text-mute)" }}>{s.pendingWithdrawalsCount} pending</p></div>
          <ChevronRight size={16} color="var(--text-mute)" />
        </button>
      </div>
    </div>
  );
}

/* ---- Transactions ---- */
function TransactionDetailModal({ txn, onClose }) {
  return (
    <Modal open={!!txn} onClose={onClose} title={txn?.id}>
      {txn && (
        <div className="space-y-2.5">
          <div className="flex justify-between"><span>User</span><span className="font-medium" style={{ color: "var(--text)" }}>{txn.user}</span></div>
          <div className="flex justify-between"><span>Email</span><span className="font-medium" style={{ color: "var(--text)" }}>{txn.email}</span></div>
          <div className="flex justify-between"><span>Type</span><TxTypeBadge type={txn.type} /></div>
          <div className="flex justify-between"><span>Amount</span><span className="font-mono font-medium" style={{ color: "var(--text)" }}>{fmtGHS(txn.amount)}</span></div>
          <div className="flex justify-between"><span>Status</span><StatusBadge status={txn.status} /></div>
          <div className="flex justify-between"><span>Payment Method</span><span className="font-medium" style={{ color: "var(--text)" }}>{txn.paymentMethod}</span></div>
          <div className="flex justify-between"><span>Reference</span><span className="font-mono text-xs" style={{ color: "var(--text)" }}>{txn.reference}</span></div>
          {txn.course && <div className="flex justify-between"><span>Course</span><span className="font-medium text-right" style={{ color: "var(--text)" }}>{txn.course}</span></div>}
          {txn.orderId && <div className="flex justify-between"><span>Related Order</span><span className="font-mono text-xs" style={{ color: "var(--text)" }}>{txn.orderId}</span></div>}
          {txn.userId && <div className="flex justify-between"><span>Related Account</span><span className="font-mono text-xs" style={{ color: "var(--text)" }}>{txn.userId}</span></div>}
          <div className="flex justify-between"><span>Date</span><span className="font-medium" style={{ color: "var(--text)" }}>{txn.date}</span></div>
          <div className="flex justify-between"><span>Time</span><span className="font-mono text-xs" style={{ color: "var(--text)" }}>{`${(hashSeed(txn.id) % 12 + 1).toString().padStart(2, "0")}:${(hashSeed(txn.id + "m") % 60).toString().padStart(2, "0")} ${hashSeed(txn.id) % 2 === 0 ? "AM" : "PM"}`}</span></div>
        </div>
      )}
    </Modal>
  );
}

function TransactionsPage({ loading, transactions, logAdmin, showToast, adminLog }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const pageSize = 8;

  const filtered = useMemo(() => {
    let rows = transactions;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((t) => t.id.toLowerCase().includes(q) || (t.user || "").toLowerCase().includes(q) || (t.email || "").toLowerCase().includes(q) || (t.reference || "").toLowerCase().includes(q) || (t.course || "").toLowerCase().includes(q));
    if (["Successful", "Pending", "Failed", "Processing"].includes(filter)) rows = rows.filter((t) => t.status === filter);
    else if (filter !== "all") rows = rows.filter((t) => t.type === filter);
    const sorted = [...rows].sort((a, b) => {
      if (sort === "oldest") return a.date.localeCompare(b.date);
      if (sort === "amount_high") return b.amount - a.amount;
      if (sort === "amount_low") return a.amount - b.amount;
      return b.date.localeCompare(a.date);
    });
    return sorted;
  }, [transactions, search, filter, sort]);

  useEffect(() => setPage(1), [search, filter, sort]);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const filters = [
    { key: "all", label: "All", count: transactions.length },
    ...TRANSACTION_STATUSES.map((s) => ({ key: s, label: s, count: transactions.filter((t) => t.status === s).length })),
    ...TRANSACTION_TYPES.map((t) => ({ key: t, label: t, count: transactions.filter((x) => x.type === t).length })),
  ];

  const openDetail = (row) => { setDetail(row); logAdmin(`Admin viewed transaction ${row.id}.`); };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">Transactions</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>Centralized ledger of every course purchase, cashback, commission, reward and withdrawal.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLogOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>
            <Clock size={13} /> ACTIVITY LOG
          </button>
          <ExportMenu onExport={(f) => { showToast(`Preparing ${f} export…`); logAdmin(`Admin exported transactions report as ${f}.`); }} />
        </div>
      </div>

      <div className="card p-4 sm:p-5 space-y-4 fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by transaction ID, user, email, reference or course..." />
          <div className="flex items-center gap-2">
            <button onClick={() => setMobileFiltersOpen((v) => !v)} className="sm:hidden flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>Filters <ChevronDown size={13} /></button>
            <SortSelect value={sort} onChange={setSort} options={[{ key: "newest", label: "Newest" }, { key: "oldest", label: "Oldest" }, { key: "amount_high", label: "Amount High–Low" }, { key: "amount_low", label: "Amount Low–High" }]} />
          </div>
        </div>
        <div className={`${mobileFiltersOpen ? "block" : "hidden"} sm:block`}>
          <FilterPills options={filters} value={filter} onChange={setFilter} />
        </div>
      </div>

      <div className="card fade-in">
        <DataTable
          loading={loading}
          emptyTitle="No transactions found."
          columns={[
            { key: "id", label: "Transaction ID", render: (r) => <span className="font-mono text-xs font-medium">{r.id}</span> },
            { key: "user", label: "User" },
            { key: "type", label: "Type", render: (r) => <TxTypeBadge type={r.type} /> },
            { key: "amount", label: "Amount", render: (r) => fmtGHS(r.amount) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
            { key: "paymentMethod", label: "Payment Method" },
            { key: "date", label: "Date" },
          ]}
          rows={pageRows}
          renderActions={(r) => <ViewButton onClick={() => openDetail(r)} />}
        />
        {filtered.length > 0 && <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} /></div>}
      </div>

      <TransactionDetailModal txn={detail} onClose={() => setDetail(null)} />
      <ActivityLogModal open={logOpen} onClose={() => setLogOpen(false)} log={adminLog} />
    </div>
  );
}

/* ---- Orders ---- */
function OrderDetailModal({ order, onClose }) {
  return (
    <Modal open={!!order} onClose={onClose} title={order?.id}>
      {order && (
        <div className="space-y-2.5">
          <div className="flex justify-between"><span>Customer</span><span className="font-medium" style={{ color: "var(--text)" }}>{order.customer}</span></div>
          <div className="flex justify-between"><span>Email</span><span className="font-medium" style={{ color: "var(--text)" }}>{order.customerEmail}</span></div>
          <div className="flex justify-between"><span>Phone</span><span className="font-mono text-xs" style={{ color: "var(--text)" }}>{order.customerPhone}</span></div>
          <div className="flex justify-between"><span>Course</span><span className="font-medium text-right" style={{ color: "var(--text)" }}>{order.course}</span></div>
          <div className="flex justify-between"><span>Amount</span><span className="font-mono font-medium" style={{ color: "var(--text)" }}>{fmtGHS(order.amount)}</span></div>
          <div className="flex justify-between"><span>Payment Status</span><StatusBadge status={order.paymentStatus} /></div>
          <div className="flex justify-between"><span>Payment Method</span><span className="font-medium" style={{ color: "var(--text)" }}>{order.paymentMethod}</span></div>
          <div className="flex justify-between"><span>Payment Reference</span><span className="font-mono text-xs" style={{ color: "var(--text)" }}>{order.paymentReference}</span></div>
          <div className="flex justify-between"><span>Purchase Date</span><span className="font-medium" style={{ color: "var(--text)" }}>{order.date}</span></div>
          <div className="flex justify-between"><span>Agent Referral</span><span className="font-medium" style={{ color: "var(--text)" }}>{order.agentName ? `${order.agentName} (${order.agentId})` : "Direct — no referral"}</span></div>
          <div className="flex justify-between"><span>Cashback Amount</span><span className="font-mono font-medium" style={{ color: "var(--green)" }}>{fmtGHS(order.cashbackAmount)}</span></div>
          <div className="flex justify-between"><span>Commission Amount</span><span className="font-mono font-medium" style={{ color: "var(--amber)" }}>{fmtGHS(order.commissionAmount)}</span></div>
          <div className="flex justify-between"><span>Course Access</span><span className="font-medium" style={{ color: "var(--text)" }}>{order.courseAccess}</span></div>
          <div className="flex justify-between"><span>Certificate Status</span><span className="font-medium" style={{ color: "var(--text)" }}>{order.certificateStatus}</span></div>
          <div className="mt-3 rounded-lg px-3 py-2.5 flex items-start gap-2" style={{ background: "var(--amber-soft)" }}>
            <Lock size={13} color="var(--amber)" className="mt-0.5 shrink-0" />
            <p className="text-xs" style={{ color: "var(--amber)" }}>Successful purchases are final. This order cannot be refunded or cancelled from the admin dashboard.</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function OrdersPage({ loading, orders, logAdmin, showToast, adminLog }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const pageSize = 8;

  const filtered = useMemo(() => {
    let rows = orders;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((o) => o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || o.course.toLowerCase().includes(q));
    if (filter !== "all") rows = rows.filter((o) => o.paymentStatus === filter);
    const sorted = [...rows].sort((a, b) => {
      if (sort === "oldest") return a.date.localeCompare(b.date);
      if (sort === "amount_high") return b.amount - a.amount;
      if (sort === "amount_low") return a.amount - b.amount;
      return b.date.localeCompare(a.date);
    });
    return sorted;
  }, [orders, search, filter, sort]);

  useEffect(() => setPage(1), [search, filter, sort]);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const filters = [
    { key: "all", label: "All Orders", count: orders.length },
    { key: "Successful", label: "Successful", count: orders.filter((o) => o.paymentStatus === "Successful").length },
    { key: "Pending", label: "Pending", count: orders.filter((o) => o.paymentStatus === "Pending").length },
    { key: "Failed", label: "Failed", count: orders.filter((o) => o.paymentStatus === "Failed").length },
  ];
  const openDetail = (row) => { setDetail(row); logAdmin(`Admin viewed order ${row.id}.`); };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">Orders</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>Course purchases. Successful orders are final — no refunds or cancellations.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLogOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>
            <Clock size={13} /> ACTIVITY LOG
          </button>
          <ExportMenu onExport={(f) => { showToast(`Preparing ${f} export…`); logAdmin(`Admin exported orders report as ${f}.`); }} />
        </div>
      </div>

      <div className="card p-4 sm:p-5 space-y-4 fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by order ID, customer or course..." />
          <SortSelect value={sort} onChange={setSort} options={[{ key: "newest", label: "Newest" }, { key: "oldest", label: "Oldest" }, { key: "amount_high", label: "Amount High–Low" }, { key: "amount_low", label: "Amount Low–High" }]} />
        </div>
        <FilterPills options={filters} value={filter} onChange={setFilter} />
      </div>

      <div className="card fade-in">
        <DataTable
          loading={loading}
          emptyTitle="No course sales found."
          columns={[
            { key: "id", label: "Order ID", render: (r) => <span className="font-mono text-xs font-medium">{r.id}</span> },
            { key: "customer", label: "Customer" }, { key: "course", label: "Course" },
            { key: "amount", label: "Price", render: (r) => fmtGHS(r.amount) },
            { key: "paymentStatus", label: "Status", render: (r) => <StatusBadge status={r.paymentStatus} /> },
            { key: "paymentMethod", label: "Payment Method" },
            { key: "date", label: "Date" },
            { key: "agentName", label: "Agent Referral", render: (r) => r.agentName || "—" },
            { key: "commissionAmount", label: "Commission", render: (r) => r.commissionAmount ? fmtGHS(r.commissionAmount) : "—" },
            { key: "cashbackAmount", label: "Cashback", render: (r) => r.cashbackAmount ? fmtGHS(r.cashbackAmount) : "—" },
          ]}
          rows={pageRows}
          renderActions={(r) => <ViewButton onClick={() => openDetail(r)} />}
        />
        {filtered.length > 0 && <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} /></div>}
      </div>

      <OrderDetailModal order={detail} onClose={() => setDetail(null)} />
      <ActivityLogModal open={logOpen} onClose={() => setLogOpen(false)} log={adminLog} />
    </div>
  );
}

/* ---- Cashback ---- */
function CashbackPage({ loading, transactions, financeStats }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const rows = useMemo(() => transactions.filter((t) => t.type === "Cashback"), [transactions]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) => t.user.toLowerCase().includes(q) || (t.course || "").toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
  }, [rows, search]);
  useEffect(() => setPage(1), [search]);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const s = financeStats;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-xl">Cashback Management</h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>20% cashback on qualifying course purchases — the rate is fixed platform-wide.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Cashback Issued" value={fmtGHS(s.totalCashbackIssued)} icon={Gift} tone="green" loading={loading} featured />
        <MetricCard label="Pending Cashback" value={fmtGHS(s.pendingCashback)} icon={Clock} tone="amber" loading={loading} />
        <MetricCard label="Available Cashback" value={fmtGHS(s.availableCashback)} icon={Wallet} tone="blue" loading={loading} />
        <MetricCard label="Users Receiving Cashback" value={s.cashbackRecipients} icon={Users} tone="gold" loading={loading} />
      </div>
      <div className="card p-4 sm:p-5 fade-in">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by user, course or transaction ID..." />
      </div>
      <div className="card fade-in">
        <DataTable
          loading={loading}
          emptyTitle="No cashback transactions found."
          columns={[
            { key: "user", label: "User" }, { key: "course", label: "Course", render: (r) => r.course || "—" },
            { key: "orderAmount", label: "Purchase Amount", render: (r) => { const order = ORDER_RECORDS.find((o) => o.id === r.orderId); return order ? fmtGHS(order.amount) : "—"; } },
            { key: "amount", label: "Cashback Amount", render: (r) => <span style={{ color: "var(--green)" }} className="font-mono font-medium">{fmtGHS(r.amount)}</span> },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
            { key: "date", label: "Date" },
            { key: "id", label: "Transaction ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
          ]}
          rows={pageRows}
        />
        {filtered.length > 0 && <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} /></div>}
      </div>
    </div>
  );
}

/* ---- Commissions ---- */
function CommissionsPage({ loading, transactions, orders, financeStats }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const rows = useMemo(() => transactions.filter((t) => t.type === "Commission"), [transactions]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) => t.user.toLowerCase().includes(q) || (t.course || "").toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
  }, [rows, search]);
  useEffect(() => setPage(1), [search]);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const s = financeStats;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-xl">Commission Management</h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>40% referral commission on successful, qualifying referrals — the rate is fixed platform-wide.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Commission" value={fmtGHS(s.totalCommission)} icon={Percent} tone="amber" loading={loading} featured />
        <MetricCard label="Successful Commission" value={fmtGHS(s.successfulCommission)} icon={CheckCircle2} tone="green" loading={loading} />
        <MetricCard label="Pending Commission" value={fmtGHS(s.pendingCommission)} icon={Clock} tone="blue" loading={loading} />
        <MetricCard label="Agents Earning Commission" value={s.commissionAgents} icon={UserCheck} tone="gold" loading={loading} />
      </div>
      <div className="card p-4 sm:p-5 fade-in">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by agent, course or transaction ID..." />
      </div>
      <div className="card fade-in">
        <DataTable
          loading={loading}
          emptyTitle="No commission transactions found."
          columns={[
            { key: "user", label: "Agent" },
            { key: "agentId", label: "Agent ID", render: (r) => <span className="font-mono text-xs">{ACCOUNTS.find((a) => a.name === r.user)?.agentId || "—"}</span> },
            { key: "customer", label: "Customer", render: (r) => { const order = orders.find((o) => o.id === r.orderId); return order?.customer || "—"; } },
            { key: "course", label: "Course", render: (r) => r.course || "—" },
            { key: "coursePrice", label: "Course Price", render: (r) => { const order = orders.find((o) => o.id === r.orderId); return order ? fmtGHS(order.amount) : "—"; } },
            { key: "amount", label: "Commission", render: (r) => <span style={{ color: "var(--amber)" }} className="font-mono font-medium">{fmtGHS(r.amount)}</span> },
            { key: "status", label: "Referral Status", render: () => <StatusBadge status="Successful" /> },
            { key: "date", label: "Date" },
            { key: "id", label: "Transaction ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
          ]}
          rows={pageRows}
        />
        {filtered.length > 0 && <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} /></div>}
      </div>
    </div>
  );
}

/* ---- Rewards ---- */
function RewardsPage({ loading, rewards, financeStats }) {
  const s = financeStats;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-xl">Reward Management</h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>Weekly referral reward payouts, based on the platform's existing milestone structure.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard label="Total Rewards Issued" value={fmtGHS(s.totalRewards)} icon={Award} tone="gold" loading={loading} featured />
        <MetricCard label="Reward Recipients" value={s.rewardRecipients} icon={Users} tone="blue" loading={loading} />
        <MetricCard label="Reward Transactions" value={rewards.length} icon={ArrowLeftRight} tone="green" loading={loading} />
      </div>

      <div className="card p-4 sm:p-5 fade-in">
        <SectionHeader title="Reward Milestones" subtitle="Referral rewards, configurable in Settings → Business Rules" />
        {loading ? <Skeleton className="h-24 w-full" /> : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {REWARD_MILESTONES.map((m) => (
              <div key={m.referrals} className="rounded-xl p-3.5 text-center" style={{ background: "var(--accent-gold-soft)" }}>
                <p className="font-mono font-bold text-lg" style={{ color: "var(--accent-gold)" }}>{fmtGHS(m.amount)}</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-soft)" }}>{m.referrals} successful referrals in a {m.window}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card fade-in">
        <DataTable
          loading={loading}
          emptyTitle="No rewards found."
          columns={[
            { key: "id", label: "Transaction ID", render: (r) => <span className="font-mono text-xs font-medium">{r.id}</span> },
            { key: "user", label: "User" }, { key: "type", label: "Reward Type" },
            { key: "milestone", label: "Milestone" },
            { key: "amount", label: "Amount", render: (r) => fmtGHS(r.amount) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
            { key: "date", label: "Date" },
          ]}
          rows={rewards}
        />
      </div>
    </div>
  );
}

/* ---- Withdrawals ---- */
function WithdrawApproveModal({ withdrawal, onClose, onConfirm }) {
  if (!withdrawal) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: "rgba(10,14,23,0.55)" }} onClick={onClose}>
      <div className="card w-full max-w-sm fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: "var(--green-soft)" }}>
            <CheckCircle2 size={18} color="var(--green)" />
          </div>
          <h3 className="font-display font-semibold text-[15px] mb-3">Approve this withdrawal?</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span style={{ color: "var(--text-soft)" }}>User</span><span className="font-medium">{withdrawal.user}</span></div>
            <div className="flex justify-between"><span style={{ color: "var(--text-soft)" }}>Amount</span><span className="font-mono font-medium">{fmtGHS(withdrawal.amount)}</span></div>
            <div className="flex justify-between"><span style={{ color: "var(--text-soft)" }}>Payment Method</span><span className="font-medium">{withdrawal.paymentMethod}</span></div>
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>CANCEL</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-white" style={{ background: "var(--green)" }}>APPROVE WITHDRAWAL</button>
        </div>
      </div>
    </div>
  );
}

function WithdrawRejectModal({ withdrawal, onClose, onConfirm }) {
  const [reason, setReason] = useState(REJECTION_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  useEffect(() => { if (withdrawal) { setReason(REJECTION_REASONS[0]); setCustomReason(""); } }, [withdrawal]);
  if (!withdrawal) return null;
  const finalReason = reason === "Other" ? (customReason.trim() || "Other") : reason;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: "rgba(10,14,23,0.55)" }} onClick={onClose}>
      <div className="card w-full max-w-sm fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: "var(--red-soft)" }}>
            <XCircle size={18} color="var(--red)" />
          </div>
          <h3 className="font-display font-semibold text-[15px] mb-1.5">Reject this withdrawal?</h3>
          <p className="text-sm mb-3" style={{ color: "var(--text-soft)" }}>{withdrawal.user} · {fmtGHS(withdrawal.amount)}</p>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-soft)" }}>Rejection reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full text-sm rounded-lg px-3 py-2.5 outline-none mb-2" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>
            {REJECTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {reason === "Other" && (
            <input value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="Describe the reason…" className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }} />
          )}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>CANCEL</button>
          <button onClick={() => onConfirm(finalReason)} className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-white" style={{ background: "var(--red)" }}>REJECT WITHDRAWAL</button>
        </div>
      </div>
    </div>
  );
}

function WithdrawalDetailModal({ withdrawal, financeStats, onClose, onApprove, onReject }) {
  if (!withdrawal) return null;
  return (
    <Modal open={!!withdrawal} onClose={onClose} title={withdrawal.id}>
      <div className="space-y-2.5">
        <div className="flex justify-between"><span>User</span><span className="font-medium" style={{ color: "var(--text)" }}>{withdrawal.user}</span></div>
        <div className="flex justify-between"><span>Email</span><span className="font-medium" style={{ color: "var(--text)" }}>{withdrawal.userEmail}</span></div>
        <div className="flex justify-between"><span>Account Type</span><TypeBadge type={withdrawal.accountType} /></div>
        <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--border-soft)" }}>
          <div className="flex justify-between mb-1"><span>Gross Amount</span><span className="font-mono font-medium" style={{ color: "var(--text)" }}>{fmtGHS(withdrawal.amount)}</span></div>
          <div className="flex justify-between mb-1"><span>− Withdrawal Fee (5%)</span><span className="font-mono" style={{ color: "var(--red)" }}>−{fmtGHS(withdrawal.fee)}</span></div>
          <div className="flex justify-between pt-1" style={{ borderTop: "1px dashed var(--border)" }}><span className="font-semibold" style={{ color: "var(--text)" }}>= Net Payout</span><span className="font-mono font-semibold" style={{ color: "var(--green)" }}>{fmtGHS(withdrawal.netAmount)}</span></div>
        </div>
        <div className="flex justify-between"><span>Balance Source</span><span className="font-medium" style={{ color: "var(--text)" }}>{withdrawal.balanceSource}</span></div>
        <div className="flex justify-between"><span>Payment Method</span><span className="font-medium" style={{ color: "var(--text)" }}>{withdrawal.paymentMethod}</span></div>
        <div className="flex justify-between"><span>Destination</span><span className="font-mono text-xs" style={{ color: "var(--text)" }}>{withdrawal.destinationLabel}</span></div>
        <div className="flex justify-between"><span>Request Date</span><span className="font-medium" style={{ color: "var(--text)" }}>{withdrawal.requestedAt}</span></div>
        {withdrawal.processedAt && <div className="flex justify-between"><span>Processed Date</span><span className="font-medium" style={{ color: "var(--text)" }}>{withdrawal.processedAt}</span></div>}
        <div className="flex justify-between"><span>Status</span><StatusBadge status={withdrawal.status} /></div>
        {withdrawal.payoutReference && <div className="flex justify-between"><span>Paystack Transfer Reference</span><span className="font-mono text-xs" style={{ color: "var(--text)" }}>{withdrawal.payoutReference}</span></div>}
        <div className="flex justify-between"><span>Reference</span><span className="font-mono text-xs" style={{ color: "var(--text)" }}>{withdrawal.reference}</span></div>
        {withdrawal.rejectionReason && <div className="flex justify-between"><span>{withdrawal.status === "Failed" ? "Failure Reason" : "Rejection Reason"}</span><span className="font-medium" style={{ color: "var(--red)" }}>{withdrawal.rejectionReason}</span></div>}
        <div className="rounded-lg px-3 py-2.5 mt-1" style={{ background: "var(--border-soft)" }}>
          <p className="text-[11px]" style={{ color: "var(--text-mute)" }}>No minimum withdrawal · No maximum withdrawal — platform rule. Approving initiates a real Paystack Transfer for the net payout; the withdrawal only becomes Completed once Paystack independently confirms the transfer succeeded.</p>
        </div>
        {withdrawal.status === "Pending" && (
          <div className="flex gap-2 pt-2">
            <button onClick={() => onReject(withdrawal)} className="flex-1 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--red-soft)", color: "var(--red)" }}>REJECT</button>
            <button onClick={() => onApprove(withdrawal)} className="flex-1 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--green-soft)", color: "var(--green)" }}>APPROVE</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function WithdrawalsPage({ loading, withdrawals, setWithdrawals, financeStats, logAdmin, showToast, adminLog }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const pageSize = 8;

  const filtered = useMemo(() => {
    let rows = withdrawals;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((w) => w.id.toLowerCase().includes(q) || w.user.toLowerCase().includes(q) || w.reference.toLowerCase().includes(q));
    if (filter !== "all") rows = rows.filter((w) => w.status === filter);
    return [...rows].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [withdrawals, search, filter]);
  useEffect(() => setPage(1), [search, filter]);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const filters = [
    { key: "all", label: "All", count: withdrawals.length },
    { key: "Pending", label: "Pending", count: withdrawals.filter((w) => w.status === "Pending").length },
    { key: "Processing", label: "Processing", count: withdrawals.filter((w) => w.status === "Processing").length },
    { key: "Completed", label: "Completed", count: withdrawals.filter((w) => w.status === "Completed").length },
    { key: "Failed", label: "Failed", count: withdrawals.filter((w) => w.status === "Failed").length },
  ];

  const openDetail = (row) => { setDetail(row); logAdmin(`Admin viewed withdrawal ${row.id}.`); };

  const approve = (w) => {
    setWithdrawals((rows) => rows.map((r) => r.id === w.id ? { ...r, status: "Processing", processedAt: new Date().toISOString().slice(0, 10) } : r));
    logAdmin(`Admin approved withdrawal ${w.id} (${w.user}, ${fmtGHS(w.amount)}).`);
    showToast("Withdrawal approved and moved to processing.");
    setApproveTarget(null); setDetail(null);
  };
  const reject = (w, reason) => {
    setWithdrawals((rows) => rows.map((r) => r.id === w.id ? { ...r, status: "Failed", processedAt: new Date().toISOString().slice(0, 10), rejectionReason: reason } : r));
    logAdmin(`Admin rejected withdrawal ${w.id} (${w.user}). Reason: ${reason}.`);
    showToast("Withdrawal rejected.");
    setRejectTarget(null); setDetail(null);
  };
  const complete = (w) => {
    setWithdrawals((rows) => rows.map((r) => r.id === w.id ? { ...r, status: "Completed", processedAt: new Date().toISOString().slice(0, 10) } : r));
    logAdmin(`Admin marked withdrawal ${w.id} (${w.user}) as completed.`);
    showToast("Withdrawal marked completed.");
    setDetail(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">Withdrawals</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>No minimum withdrawal · No maximum withdrawal — this is a fixed platform rule.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLogOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>
            <Clock size={13} /> ACTIVITY LOG
          </button>
          <ExportMenu onExport={(f) => { showToast(`Preparing ${f} export…`); logAdmin(`Admin exported withdrawals report as ${f}.`); }} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Pending Requests" value={financeStats.pendingWithdrawalsCount} icon={Clock} tone="amber" loading={loading} featured />
        <MetricCard label="Pending Amount" value={fmtGHS(financeStats.pendingWithdrawals)} icon={Wallet} tone="red" loading={loading} />
        <MetricCard label="Total Paid Out" value={fmtGHS(financeStats.totalWithdrawals)} icon={CheckCircle2} tone="green" loading={loading} />
        <MetricCard label="Available Withdrawal Balance" value={fmtGHS(financeStats.cashbackBalance + financeStats.successfulCommission + financeStats.rewardBalance)} icon={BarChart3} tone="blue" loading={loading} />
      </div>

      <div className="card p-4 sm:p-5 space-y-4 fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by withdrawal ID, user or reference..." />
        </div>
        <FilterPills options={filters} value={filter} onChange={setFilter} />
      </div>

      <div className="card fade-in">
        <DataTable
          loading={loading}
          emptyTitle="No withdrawals found."
          columns={[
            { key: "id", label: "Withdrawal ID", render: (r) => <span className="font-mono text-xs font-medium">{r.id}</span> },
            { key: "user", label: "User" }, { key: "accountType", label: "Account Type", render: (r) => <TypeBadge type={r.accountType} /> },
            { key: "amount", label: "Amount", render: (r) => fmtGHS(r.amount) },
            { key: "balanceSource", label: "Balance Type" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
            { key: "requestedAt", label: "Requested Date" },
            { key: "paymentMethod", label: "Payment Method" },
          ]}
          rows={pageRows}
          renderActions={(r) => (
            <div className="flex justify-end gap-1.5">
              <ViewButton onClick={() => openDetail(r)} />
              {r.status === "Pending" && (
                <>
                  <button onClick={() => setApproveTarget(r)} className="px-2.5 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--green-soft)", color: "var(--green)" }}>APPROVE</button>
                  <button onClick={() => setRejectTarget(r)} className="px-2.5 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--red-soft)", color: "var(--red)" }}>REJECT</button>
                </>
              )}
              {r.status === "Processing" && (
                <>
                  <button onClick={() => complete(r)} className="px-2.5 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>MARK COMPLETED</button>
                  <button onClick={() => setRejectTarget(r)} className="px-2.5 py-1.5 rounded-md text-xs font-semibold" style={{ background: "var(--red-soft)", color: "var(--red)" }}>REJECT</button>
                </>
              )}
            </div>
          )}
        />
        {filtered.length > 0 && <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} /></div>}
      </div>

      <WithdrawalDetailModal withdrawal={detail} financeStats={financeStats} onClose={() => setDetail(null)} onApprove={setApproveTarget} onReject={setRejectTarget} />
      <WithdrawApproveModal withdrawal={approveTarget} onClose={() => setApproveTarget(null)} onConfirm={() => approve(approveTarget)} />
      <WithdrawRejectModal withdrawal={rejectTarget} onClose={() => setRejectTarget(null)} onConfirm={(reason) => reject(rejectTarget, reason)} />
      <ActivityLogModal open={logOpen} onClose={() => setLogOpen(false)} log={adminLog} />
    </div>
  );
}

/* ---- Reports ---- */
function RevenueChart({ loading }) {
  const [period, setPeriod] = useState("30D");
  const data = REVENUE_SERIES[period];
  return (
    <div className="card p-4 sm:p-5 fade-in">
      <SectionHeader title="Revenue Over Time" subtitle="Demo revenue trend"
        action={
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
            {["7D", "30D", "90D", "12M"].map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className="px-2.5 py-1 rounded-md text-[11px] font-semibold"
                style={{ background: period === p ? "var(--blue)" : "transparent", color: period === p ? "#fff" : "var(--text-soft)" }}>{p}</button>
            ))}
          </div>
        }
      />
      {loading ? <Skeleton className="h-56 w-full" /> : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-mute)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-mute)" }} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={(v) => fmtGHS(v)} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="revenue" fill="var(--blue)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ReportsPage({ loading, accounts, courses, orders, financeStats, logAdmin, showToast }) {
  const [tab, setTab] = useState("Overview");
  const accStats = useMemo(() => computeAccountStats(accounts), [accounts]);
  const courseStats = useMemo(() => computeCourseStats(courses), [courses]);
  const s = financeStats;

  const overviewMetrics = [
    ["Revenue", fmtGHS(s.totalRevenue)], ["Course Sales", fmtGHS(s.totalCourseSales)], ["Orders", orders.length],
    ["Users", accStats.totalUsers], ["Agents", accStats.totalAgents], ["Verified Agents", accStats.verifiedAgents],
    ["Cashback", fmtGHS(s.totalCashbackIssued)], ["Commission", fmtGHS(s.totalCommission)],
    ["Rewards", fmtGHS(s.totalRewards)], ["Withdrawals", fmtGHS(s.totalWithdrawals)],
    ["Course Performance", `${courseStats.avgRating || 0}★ avg`], ["Agent Performance", `${accStats.totalAgents} agents`],
  ];

  const coursePerf = useMemo(() => [...courses].map((c) => ({
    ...c, completionRate: 55 + (hashSeed(c.id) % 40),
  })).sort((a, b) => b.sales.totalSales - a.sales.totalSales), [courses]);

  const agentPerf = useMemo(() => accounts.filter((a) => a.agentId).map((a) => {
    const refs = REFERRALS.filter((r) => r.agent === a.name);
    const successful = refs.filter((r) => r.status === "Successful").length;
    const conversion = refs.length ? Math.round((successful / refs.length) * 100) : (a.referrals ? 100 : 0);
    return { ...a, successfulReferrals: a.referrals, salesGenerated: purchasesFor(a.name).reduce((s2, o) => s2 + o.amount, 0), conversion };
  }).sort((a, b) => b.commission - a.commission), [accounts]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">Reports</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>Platform reporting across revenue, courses and agents.</p>
        </div>
        <ExportMenu onExport={(f) => { showToast(`Preparing ${f} export…`); logAdmin(`Admin exported ${tab} report as ${f}.`); }} />
      </div>

      <Tabs tabs={["Overview", "Course Performance", "Agent Performance"]} active={tab} onChange={setTab} />

      {tab === "Overview" && (
        <div className="space-y-4">
          <RevenueChart loading={loading} />
          <div className="card p-4 sm:p-5 fade-in">
            <SectionHeader title="Platform Summary" />
            {loading ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div> : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {overviewMetrics.map(([label, value]) => (
                  <div key={label} className="rounded-xl p-3" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>{label}</p>
                    <p className="font-mono text-sm font-semibold mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "Course Performance" && (
        <div className="card fade-in">
          <DataTable
            loading={loading}
            emptyTitle="No course performance data."
            columns={[
              { key: "title", label: "Course", render: (r) => <div className="flex items-center gap-2.5"><CourseThumb course={r} size={32} /><span className="text-[13px] font-medium">{r.title}</span></div> },
              { key: "students", label: "Students", render: (r) => r.students.length },
              { key: "sales", label: "Sales", render: (r) => r.sales.successfulOrders },
              { key: "revenue", label: "Revenue", render: (r) => fmtGHS(r.sales.totalSales) },
              { key: "avgRating", label: "Rating", render: (r) => <RatingStars value={r.avgRating} /> },
              { key: "completionRate", label: "Completion Rate", render: (r) => `${r.completionRate}%` },
            ]}
            rows={coursePerf}
          />
        </div>
      )}

      {tab === "Agent Performance" && (
        <div className="card fade-in">
          <DataTable
            loading={loading}
            emptyTitle="No agent performance data."
            columns={[
              { key: "name", label: "Agent", render: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.name} size={28} /><span className="text-[13px] font-medium">{r.name}</span></div> },
              { key: "successfulReferrals", label: "Successful Referrals" },
              { key: "salesGenerated", label: "Sales Generated", render: (r) => fmtGHS(r.salesGenerated) },
              { key: "commission", label: "Commission", render: (r) => fmtGHS(r.commission) },
              { key: "conversion", label: "Conversion Rate", render: (r) => `${r.conversion}%` },
              { key: "type", label: "Verification Status", render: (r) => <TypeBadge type={r.type} /> },
            ]}
            rows={agentPerf}
          />
        </div>
      )}
    </div>
  );
}

/* ---- Settings ---- */
function ToggleSwitch({ on, onChange }) {
  return (
    <button onClick={onChange} className="w-10 h-6 rounded-full relative shrink-0 transition-colors" style={{ background: on ? "var(--blue)" : "var(--border)" }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow" style={{ left: on ? 18 : 2 }} />
    </button>
  );
}

function SettingsPage({ loading, settings, setSettings, logAdmin, showToast, adminLog }) {
  const [tab, setTab] = useState("Platform");
  const [logOpen, setLogOpen] = useState(false);
  const [platformDraft, setPlatformDraft] = useState(settings.platform);

  const savePlatform = () => {
    setSettings((s) => ({ ...s, platform: platformDraft }));
    logAdmin("Admin updated platform settings.");
    showToast("Platform settings updated.");
  };
  const toggleNotif = (key) => {
    setSettings((s) => ({ ...s, notifications: { ...s.notifications, [key]: !s.notifications[key] } }));
    logAdmin(`Admin changed notification setting: ${key}.`);
    showToast(`${key} notifications ${settings.notifications[key] ? "disabled" : "enabled"}.`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">Settings</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-mute)" }}>Frontend configuration only — a future Node.js + Express backend enforces these values securely.</p>
        </div>
        <button onClick={() => setLogOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <Clock size={13} /> ACTIVITY LOG
        </button>
      </div>

      <Tabs tabs={["Platform", "Business Rules", "Payment", "Notifications"]} active={tab} onChange={setTab} />

      {tab === "Platform" && (
        <div className="card p-4 sm:p-5 fade-in space-y-4">
          <SectionHeader title="Platform Settings" />
          {loading ? <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Platform Name"><input value={platformDraft.platformName} onChange={(e) => setPlatformDraft((p) => ({ ...p, platformName: e.target.value }))} className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }} /></Field>
                <Field label="Support Email"><input value={platformDraft.supportEmail} onChange={(e) => setPlatformDraft((p) => ({ ...p, supportEmail: e.target.value }))} className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }} /></Field>
                <Field label="Support Phone"><input value={platformDraft.supportPhone} onChange={(e) => setPlatformDraft((p) => ({ ...p, supportPhone: e.target.value }))} className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }} /></Field>
                <Field label="Currency"><input value={platformDraft.currency} onChange={(e) => setPlatformDraft((p) => ({ ...p, currency: e.target.value }))} className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }} /></Field>
                <Field label="Timezone"><input value={platformDraft.timezone} onChange={(e) => setPlatformDraft((p) => ({ ...p, timezone: e.target.value }))} className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text)" }} /></Field>
                <Field label="Platform Logo"><button className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2.5" style={{ background: "var(--surface-alt)", border: "1px dashed var(--border)", color: "var(--text-mute)" }}><Upload size={13} /> Upload logo (demo)</button></Field>
              </div>
              <button onClick={savePlatform} className="btn-primary px-4 py-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"><Save size={13} /> SAVE CHANGES</button>
            </>
          )}
        </div>
      )}

      {tab === "Business Rules" && (
        <div className="card p-4 sm:p-5 fade-in space-y-4">
          <SectionHeader title="Business Rule Settings" subtitle="Locked platform rules — preserved exactly, not editable from this dashboard" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              ["Cashback Percentage", `${settings.businessRules.cashbackPercentage}%`],
              ["Referral Commission Percentage", `${settings.businessRules.commissionPercentage}%`],
              ["Verified Agent Referral Requirement", `${settings.businessRules.verifiedAgentReferrals} successful referrals`],
              ["Minimum Withdrawal", settings.businessRules.minWithdrawal],
              ["Maximum Withdrawal", settings.businessRules.maxWithdrawal],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-lg px-3.5 py-3" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2">
                  <Lock size={13} color="var(--text-mute)" />
                  <span className="text-xs" style={{ color: "var(--text-soft)" }}>{label}</span>
                </div>
                <span className="font-mono text-sm font-semibold">{value}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--text-soft)" }}>Reward Milestones</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {settings.businessRules.rewardMilestones.map((m) => (
                <div key={m.referrals} className="rounded-lg px-3.5 py-3 text-center" style={{ background: "var(--accent-gold-soft)" }}>
                  <p className="font-mono font-semibold" style={{ color: "var(--accent-gold)" }}>{fmtGHS(m.amount)}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-mute)" }}>{m.referrals} referrals / {m.window}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "Payment" && (
        <div className="card p-4 sm:p-5 fade-in">
          <SectionHeader title="Payment Settings" />
          <div className="flex items-center justify-between rounded-xl p-4" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--blue-soft)" }}>
                <Wallet size={18} color="var(--blue)" />
              </div>
              <div>
                <p className="text-sm font-semibold">{settings.payment.provider}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-mute)" }}>Real payment processing is not part of this stage.</p>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}>{settings.payment.status}</span>
          </div>
        </div>
      )}

      {tab === "Notifications" && (
        <div className="card p-4 sm:p-5 fade-in">
          <SectionHeader title="Notification Settings" />
          {loading ? <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <div className="space-y-1">
              {Object.entries(settings.notifications).map(([key, on]) => (
                <div key={key} className="flex items-center justify-between py-2.5" style={{ borderBottom: "1px solid var(--border-soft)" }}>
                  <span className="text-sm" style={{ color: "var(--text)" }}>{key}</span>
                  <ToggleSwitch on={on} onChange={() => toggleNotif(key)} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ActivityLogModal open={logOpen} onClose={() => setLogOpen(false)} log={adminLog} />
    </div>
  );
}

/* ============================================================
   PLACEHOLDER PAGE
   ============================================================ */
function PlaceholderPage({ routeKey }) {
  return (
    <div className="card p-10 flex flex-col items-center text-center fade-in">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: "var(--accent-gold-soft)" }}>
        <Sparkles size={20} color="var(--accent-gold)" />
      </div>
      <h2 className="font-display font-semibold text-lg mb-1.5">{NAV_LABELS[routeKey] || routeKey}</h2>
      <p className="text-sm max-w-sm" style={{ color: "var(--text-mute)" }}>Coming in the next Admin Dashboard stage.</p>
      <p className="text-xs mt-4 font-mono px-3 py-1.5 rounded-md" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text-mute)" }}>
        GET /api/admin/{routeKey}
      </p>
    </div>
  );
}

/* ============================================================
   ROOT APP
   ============================================================ */
/* ============================================================
   REAL DATA ADAPTERS
   Convert the backend's actual response shapes (src/models/*.mapper.js)
   into the field names these existing presentational components already
   read. Nothing here invents a value the backend didn't send — fields
   the backend genuinely doesn't expose (e.g. per-user commission total
   without a dedicated query, "level" on a course, agent full names on a
   withdrawal) are left as "—" / 0 / null rather than guessed.
   ============================================================ */
const TITLE_STATUS = { ACTIVE: "Active", SUSPENDED: "Suspended", DRAFT: "Draft", PUBLISHED: "Published", UNPUBLISHED: "Unpublished", ARCHIVED: "Archived", PENDING: "Pending", PAID: "Paid", FAILED: "Failed", CANCELLED: "Cancelled", COMPLETED: "Completed", PROCESSING: "Processing" };
function mapAccount(u) {
  const isAgent = !!u.agent;
  const verified = u.agent && u.agent.verificationStatus === "VERIFIED";
  return {
    id: u.id, name: u.fullName, email: u.email, phone: u.phone || "—",
    type: verified ? "Verified Agent" : isAgent ? "Agent" : "User",
    status: TITLE_STATUS[u.status] || u.status,
    joined: (u.createdAt || "").slice(0, 10),
    lastActivityAt: (u.lastLoginAt || u.createdAt || "").slice(0, 10),
    qualifyingPurchase: "—",
    agentId: u.agent ? u.agent.agentId : null,
    referrals: u.agent ? (u.agent.successfulReferrals || 0) : 0,
    commission: 0, // per-user commission total needs a separate query; see Reports for real platform totals
    role: u.role,
  };
}
function mapCourse(c) {
  return {
    id: c.id, title: c.title, category: c.category ? c.category.name : "Uncategorized",
    price: c.price, status: TITLE_STATUS[c.status] || c.status,
    sales: { totalStudents: c.studentCount || 0, totalSales: (c.studentCount || 0) * (c.price || 0), successfulOrders: c.studentCount || 0 },
    avgRating: (c.ratingSummary && c.ratingSummary.averageRating) || 0,
    reviews: Array.from({ length: c.reviewCount || 0 }),
    students: Array.from({ length: c.studentCount || 0 }), // real count only — no per-course student list endpoint exists
    modules: c.modules || [],
    level: "—", createdAt: (c.createdAt || "").slice(0, 10), updatedAt: (c.updatedAt || c.createdAt || "").slice(0, 10),
    thumbnail: c.thumbnail || null, shortDescription: c.shortDescription || "", description: c.description || "",
    slug: c.slug, currency: c.currency || "GHS", featured: !!c.featured, categoryId: c.category ? c.category.id : null,
    // The backend's Course model has none of these fields (see
    // src/models/course.mapper.js) — kept as real, honest empty defaults
    // rather than invented content, purely so CourseDetailPage's Overview
    // tab (which was written against the old mock's richer shape) doesn't
    // crash reading them.
    objectives: [], requirements: [], targetAudience: [], tags: [], duration: "—",
    instructor: { name: (c.instructor && c.instructor.fullName) || "Unassigned", bio: "" },
  };
}
function mapOrder(o) {
  return {
    id: o.id, orderNumber: o.orderNumber,
    customer: o.user ? o.user.fullName : "—", customerEmail: o.user ? o.user.email : "—", customerPhone: "—",
    course: o.course ? o.course.title : "—", courseId: o.course ? o.course.id : null,
    amount: o.amount, status: TITLE_STATUS[o.status] || o.status, paymentStatus: TITLE_STATUS[o.paymentStatus] || o.paymentStatus,
    paymentMethod: "Paystack", paymentReference: o.paymentReference || "—",
    date: (o.createdAt || "").slice(0, 10),
    agentName: null, agentId: o.agent ? o.agent.agentId : null,
    cashbackAmount: null, commissionAmount: null,
    courseAccess: o.enrollmentStatus === "ACTIVE" || o.enrollmentStatus === "COMPLETED" ? "Granted" : "Not granted",
  };
}
const TXN_TYPE_LABEL = { COURSE_PURCHASE: "Payment", CASHBACK: "Cashback", COMMISSION: "Commission", REWARD: "Reward", WITHDRAWAL: "Withdrawal", WITHDRAWAL_REVERSAL: "Withdrawal Reversal" };
const TXN_STATUS_LABEL = { SUCCESSFUL: "Completed", PENDING: "Pending", FAILED: "Failed" };
function mapTransaction(t) {
  return {
    id: t.id, transactionId: t.transactionId,
    user: t.user ? t.user.fullName : "—", userEmail: t.user ? t.user.email : "—",
    type: TXN_TYPE_LABEL[t.type] || t.type, status: TXN_STATUS_LABEL[t.status] || t.status,
    amount: t.amount, paymentMethod: "—", course: null, orderId: t.referenceType === "ORDER" ? t.referenceId : null,
    date: (t.createdAt || "").slice(0, 10), description: t.description || "",
  };
}
function mapWithdrawal(w) {
  return {
    id: w.id, withdrawalId: w.withdrawalId, reference: w.reference || w.withdrawalId,
    user: w.user ? w.user.fullName : "—", userEmail: w.user ? w.user.email : "—",
    accountType: w.balanceType === "COMMISSION" ? "Agent" : "User",
    amount: w.amount, // gross
    fee: w.fee !== undefined ? w.fee : 0,
    netAmount: w.netAmount !== undefined ? w.netAmount : w.amount,
    balanceSource: w.balanceType, status: TITLE_STATUS[w.status] || w.status,
    requestedAt: (w.requestedAt || w.createdAt || "").slice(0, 10),
    processedAt: w.processedAt ? w.processedAt.slice(0, 10) : null,
    paymentMethod: w.paymentMethod === "mobile_money" ? "Mobile Money" : w.paymentMethod === "bank" ? "Bank Transfer" : w.paymentMethod,
    paymentDetails: w.paymentDetails || {},
    destinationLabel: w.paymentDetails ? Object.entries(w.paymentDetails).filter(([k]) => k !== "type").map(([, v]) => v).join(" · ") : "—",
    // The real Paystack transfer reference for this payout (see
    // finance.mapper.js#toPublicWithdrawal — recipientCode itself is
    // intentionally never exposed, only this reference).
    payoutReference: w.payoutReference || null,
    rejectionReason: w.rejectionReason || null,
  };
}
function mapCategory(c) { return c.name; } // this UI's category fields are plain name strings
function mapCategoryFull(c) { return { id: c.id, name: c.name, slug: c.slug, status: c.status }; }

// Real financial figures, from GET /admin/reports/financial-summary
// (src/services/adminFinance.service.js — every figure is a database
// aggregate, never a frontend guess) plus a few counts derived from the
// already-fetched withdrawals/transactions lists. Fields the backend
// doesn't split out (e.g. "pending" vs "available" cashback specifically)
// fall back to the closest real aggregate rather than being invented.
function computeRealFinanceStats(summary, transactions, withdrawals) {
  const s = summary || {};
  const pendingSum = (type) => transactions.filter(t => t.type === TXN_TYPE_LABEL[type] && t.status === "Pending").reduce((sum, t) => sum + t.amount, 0);
  const recipients = (type) => new Set(transactions.filter(t => t.type === TXN_TYPE_LABEL[type] && t.status === "Completed").map(t => t.user)).size;
  return {
    totalRevenue: s.totalCourseSales || 0,
    totalCashbackIssued: s.totalCashback || 0,
    totalCommission: s.totalCommission || 0,
    totalRewards: s.totalRewards || 0,
    totalWithdrawals: s.totalWithdrawals || 0,
    pendingWithdrawals: s.pendingWithdrawals || 0,
    pendingWithdrawalsCount: withdrawals.filter(w => w.status === "Pending").length,
    cashbackBalance: s.totalCashback || 0,
    availableCashback: s.totalCashback || 0,
    pendingCashback: pendingSum("CASHBACK"),
    cashbackRecipients: recipients("CASHBACK"),
    successfulCommission: s.totalCommission || 0,
    pendingCommission: pendingSum("COMMISSION"),
    commissionAgents: recipients("COMMISSION"),
    rewardBalance: s.totalRewards || 0,
    rewardRecipients: recipients("REWARD"),
  };
}

export default function AdminDashboardApp() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [route, setRoute] = useState("dashboard");
  const [theme, setTheme] = useState("light");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);
  const [adminLog, setAdminLog] = useState([]); // this session's actions only — no backend audit-log list endpoint exists

  const logAdmin = (text) => {
    const now = new Date();
    setAdminLog((log) => [{ text, date: now.toLocaleDateString(), time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...log].slice(0, 50));
  };
  const showToast = (text) => {
    setToast(text);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(null), 2600);
  };
  const showError = (err) => showToast(err && err.message ? err.message : "Something went wrong.");

  const [accounts, setAccounts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryRecords, setCategoryRecords] = useState([]);
  const [orders, setOrders] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [financeSummary, setFinanceSummary] = useState(null);
  const financeStats = useMemo(() => computeRealFinanceStats(financeSummary, transactions, withdrawals), [financeSummary, transactions, withdrawals]);

  useEffect(() => {
    const token = getAdminToken();
    const refresh = getAdminRefresh();
    if (!token && !refresh) { setCheckingSession(false); return; }
    apiFetch("/users/me")
      .then(({ user }) => {
        if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
          setCurrentAdmin(user);
          setLoggedIn(true);
        } else {
          clearAdminTokens();
        }
      })
      .catch(() => clearAdminTokens())
      .finally(() => setCheckingSession(false));
  }, []);

  const onLogin = (user) => { setCurrentAdmin(user); setLoggedIn(true); };
  const logout = () => {
    clearAdminTokens();
    setLoggedIn(false);
    setCurrentAdmin(null);
    setRoute("dashboard");
  };

  const loadAccounts = () => apiList("/admin/users?limit=100", "users").then(r => setAccounts(r.items.map(mapAccount))).catch(showError);
  const loadCourses = () => apiList("/admin/courses?limit=100", "courses").then(r => setCourses(r.items.map(mapCourse))).catch(showError);
  const loadCategories = () => apiList("/admin/categories?limit=100", "categories").then(r => {
    setCategoryRecords(r.items.map(mapCategoryFull));
    setCategories(r.items.map(mapCategory));
  }).catch(showError);
  const loadOrders = () => apiList("/admin/orders?limit=100", "orders").then(r => setOrders(r.items.map(mapOrder))).catch(showError);
  const loadWithdrawals = () => apiList("/admin/withdrawals?limit=100", "withdrawals").then(r => setWithdrawals(r.items.map(mapWithdrawal))).catch(showError);
  const loadTransactions = () => apiList("/admin/transactions?limit=100", "transactions").then(r => setTransactions(r.items.map(mapTransaction))).catch(showError);
  const loadFinanceSummary = () => apiFetch("/admin/reports/financial-summary?period=last_30_days").then(r => setFinanceSummary(r.summary)).catch(showError);

  const loadAll = () => {
    setLoading(true);
    Promise.all([loadAccounts(), loadCourses(), loadCategories(), loadOrders(), loadWithdrawals(), loadTransactions(), loadFinanceSummary()])
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (loggedIn) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  const handleNavigate = (key) => {
    if (key === "__logout__") { logout(); return; }
    setRoute(key);
  };

  const setUserStatus = (id, status) => {
    const action = status === "Suspended" ? "suspend" : "activate";
    return apiFetch(`/admin/users/${id}/${action}`, { method: "POST" })
      .then(() => loadAccounts());
  };
  const setAgentStatusByAccountId = (accountId, status) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc || !acc.agentId) return Promise.reject(new Error("This account has no linked agent record."));
    return apiList("/admin/agents?limit=100", "agents").then(r => {
      const agent = r.items.find(a => a.agentId === acc.agentId);
      if (!agent) throw new Error("Agent record not found.");
      const action = status === "Suspended" ? "suspend" : "activate";
      return apiFetch(`/admin/agents/${agent.id}/${action}`, { method: "POST" }).then(() => loadAccounts());
    });
  };

  // The backend's thumbnail field is validated as a real URL
  // (src/validators/course.validator.js: z.string().url()) — there is no
  // file-upload/storage endpoint on this backend at all, so the course
  // form's image picker used to produce a local preview-only data URI;
  // only, no file storage in this stage") produces a local base64 data
  // URI that the real backend would reject. Only a genuine http(s) URL
  // is ever sent; anything else is omitted rather than causing a
  // confusing validation error or being silently dropped only on update.
  const asRealUrl = (v) => (typeof v === "string" && /^https?:\/\//i.test(v)) ? v : undefined;
  const createCourseReal = (data) => apiFetch("/admin/courses", {
    method: "POST",
    body: JSON.stringify({
      title: data.title, shortDescription: data.shortDescription, description: data.description,
      price: Number(data.price) || 0, thumbnail: asRealUrl(data.thumbnail),
      categoryId: data.categoryId || undefined, featured: !!data.featured,
    }),
  });
  const updateCourseReal = (id, data) => apiFetch(`/admin/courses/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: data.title, shortDescription: data.shortDescription, description: data.description,
      price: Number(data.price) || undefined, thumbnail: asRealUrl(data.thumbnail),
      categoryId: data.categoryId || undefined, featured: !!data.featured,
    }),
  });
  const setCourseStatusReal = (id, action) => apiFetch(`/admin/courses/${id}/${action}`, { method: "POST" });

  const createCategoryReal = (name) => apiFetch("/admin/categories", { method: "POST", body: JSON.stringify({ name }) }).then(() => loadCategories());

  const approveWithdrawalReal = (id) => apiFetch(`/admin/withdrawals/${id}/approve`, { method: "POST" }).then(() => loadWithdrawals());
  const rejectWithdrawalReal = (id, reason) => apiFetch(`/admin/withdrawals/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }).then(() => loadWithdrawals());
  const completeWithdrawalReal = (id) => apiFetch(`/admin/withdrawals/${id}/complete`, { method: "POST" }).then(() => loadWithdrawals());

  if (checkingSession) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "var(--sidebar)" }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "var(--accent-gold)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className={theme === "dark" ? "dark-mode" : ""}>
        <style>{TOKENS}</style>
        <LoginPage onLogin={onLogin} />
      </div>
    );
  }

  return (
    <div className={theme === "dark" ? "dark-mode" : ""}>
      <style>{TOKENS}</style>
      <div className="admin-root min-h-screen flex" style={{ background: "var(--bg)" }}>
        <AdminSidebar current={route} onNavigate={handleNavigate} collapsed={collapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
        <div className="flex-1 min-w-0 flex flex-col">
          <AdminHeader
            title={NAV_LABELS[route] || "Dashboard"}
            onMenuClick={() => setMobileOpen(true)}
            theme={theme} setTheme={setTheme}
            notifications={notifications} setNotifications={setNotifications}
            onNavigate={handleNavigate}
            accounts={accounts} courses={courses} orders={orders} transactions={transactions} withdrawals={withdrawals}
          />
          <main className="flex-1 p-3 sm:p-5 lg:p-6 min-w-0">
            <button onClick={() => setCollapsed((c) => !c)} className="hidden lg:flex items-center gap-1.5 text-[11px] font-medium mb-3" style={{ color: "var(--text-mute)" }}>
              <Menu size={13} /> {collapsed ? "Expand" : "Collapse"} sidebar
            </button>
            {route === "dashboard" ? (
              <DashboardPage loading={loading} onNavigate={handleNavigate} accounts={accounts} courses={courses} orders={orders} transactions={transactions} withdrawals={withdrawals} financeStats={financeStats} />
            ) : route === "users" ? (
              <UsersPage loading={loading} onNavigate={handleNavigate} accounts={accounts}
                setAccounts={(updater) => {
                  const before = accounts;
                  const after = typeof updater === "function" ? updater(before) : updater;
                  setAccounts(after);
                  after.forEach((a, i) => {
                    if (before[i] && before[i].status !== a.status) {
                      setUserStatus(a.id, a.status).catch(err => { showError(err); loadAccounts(); });
                    }
                  });
                }}
                logAdmin={logAdmin} showToast={showToast} adminLog={adminLog} />
            ) : route === "agents" ? (
              <AgentsPage loading={loading} onNavigate={handleNavigate} accounts={accounts}
                setAccounts={(updater) => {
                  const before = accounts;
                  const after = typeof updater === "function" ? updater(before) : updater;
                  setAccounts(after);
                  after.forEach((a, i) => {
                    if (before[i] && before[i].status !== a.status) {
                      setAgentStatusByAccountId(a.id, a.status).catch(err => { showError(err); loadAccounts(); });
                    }
                  });
                }}
                logAdmin={logAdmin} showToast={showToast} adminLog={adminLog} />
            ) : route === "verification" ? (
              <VerificationPage loading={loading} onNavigate={handleNavigate} accounts={accounts} />
            ) : route === "courses" ? (
              <CoursesPage
                loading={loading} courses={courses} categories={categories}
                setCategories={(updater) => {
                  const before = categories;
                  const after = typeof updater === "function" ? updater(before) : updater;
                  const added = after.find(c => !before.includes(c));
                  setCategories(after);
                  if (added) createCategoryReal(added).catch(err => { showError(err); loadCategories(); });
                }}
                setCourses={(updater) => {
                  const before = courses;
                  const after = typeof updater === "function" ? updater(before) : updater;
                  setCourses(after);
                  if (after.length > before.length) {
                    const created = after.find(c => !before.some(b => b.id === c.id));
                    if (created) {
                      createCourseReal(created)
                        .then(({ course }) => { if (created.status === "Published") return setCourseStatusReal(course.id, "publish"); })
                        .then(() => loadCourses())
                        .catch(err => { showError(err); loadCourses(); });
                    }
                    return;
                  }
                  after.forEach(c => {
                    const prev = before.find(b => b.id === c.id);
                    if (!prev) return;
                    if (prev.status !== c.status) {
                      const action = c.status === "Published" ? "publish" : c.status === "Archived" ? "archive" : "unpublish";
                      setCourseStatusReal(c.id, action).then(loadCourses).catch(err => { showError(err); loadCourses(); });
                    } else if (prev.title !== c.title || prev.price !== c.price || prev.shortDescription !== c.shortDescription) {
                      updateCourseReal(c.id, c).then(loadCourses).catch(err => { showError(err); loadCourses(); });
                    }
                  });
                }}
                logAdmin={logAdmin} showToast={showToast}
              />
            ) : route === "finance" ? (
              <FinancePage loading={loading} onNavigate={handleNavigate} financeStats={financeStats} transactions={transactions} orders={orders} withdrawals={withdrawals} />
            ) : route === "transactions" ? (
              <TransactionsPage loading={loading} transactions={transactions} logAdmin={logAdmin} showToast={showToast} adminLog={adminLog} />
            ) : route === "orders" ? (
              <OrdersPage loading={loading} orders={orders} logAdmin={logAdmin} showToast={showToast} adminLog={adminLog} />
            ) : route === "cashback" ? (
              <CashbackPage loading={loading} transactions={transactions} financeStats={financeStats} />
            ) : route === "commissions" ? (
              <CommissionsPage loading={loading} transactions={transactions} orders={orders} financeStats={financeStats} />
            ) : route === "rewards" ? (
              <RewardsPage loading={loading} rewards={transactions.filter(t => t.type === "Reward")} financeStats={financeStats} />
            ) : route === "withdrawals" ? (
              <WithdrawalsPage
                loading={loading} withdrawals={withdrawals} financeStats={financeStats}
                setWithdrawals={(updater) => {
                  const before = withdrawals;
                  const after = typeof updater === "function" ? updater(before) : updater;
                  setWithdrawals(after);
                  after.forEach(w => {
                    const prev = before.find(b => b.id === w.id);
                    if (!prev || prev.status === w.status) return;
                    if (w.status === "Processing") approveWithdrawalReal(w.id).catch(err => { showError(err); loadWithdrawals(); });
                    else if (w.status === "Failed") rejectWithdrawalReal(w.id, w.rejectionReason || "Rejected by admin").catch(err => { showError(err); loadWithdrawals(); });
                    else if (w.status === "Completed") completeWithdrawalReal(w.id).catch(err => { showError(err); loadWithdrawals(); });
                  });
                }}
                logAdmin={logAdmin} showToast={showToast} adminLog={adminLog}
              />
            ) : route === "reports" ? (
              <ReportsPage loading={loading} accounts={accounts} courses={courses} orders={orders} financeStats={financeStats} logAdmin={logAdmin} showToast={showToast} />
            ) : route === "settings" ? (
              <div className="card p-5 max-w-lg">
                <p className="font-display font-semibold text-base mb-2">Settings</p>
                <p className="text-sm" style={{ color: "var(--text-mute)" }}>
                  The backend does not currently provide a platform-settings endpoint, so there is nothing real to connect here. This section has been intentionally left disconnected rather than saving to a fake endpoint.
                </p>
              </div>
            ) : (
              <PlaceholderPage routeKey={route} />
            )}
          </main>
        </div>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
