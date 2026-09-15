import crypto from "node:crypto";
import { db } from "./_firebaseAdmin.js";

const RETENTION_DAYS = 90;

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  return req.headers["x-real-ip"] || "unknown";
}

function classifyUserAgent(ua = "") {
  const mobile = /Mobile|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua);
  const tablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua);
  let device = tablet ? "Tablet" : mobile ? "Mobile" : "Desktop";
  if (/bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headless/i.test(ua)) device = "Bot";

  let os = "Other";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) os = "macOS";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Other";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua)) browser = "Opera";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/CriOS\//i.test(ua)) browser = "Chrome";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome|CriOS/i.test(ua)) browser = "Safari";
  return { device, os, browser };
}

function hashVisitor(ip, ua) {
  const secret = process.env.ANALYTICS_HASH_SECRET;
  if (!secret) throw new Error("ANALYTICS_HASH_SECRET is not configured.");
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHmac("sha256", secret).update(day + "\0" + ip + "\0" + ua).digest("hex").slice(0, 32);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).setHeader("Allow", "POST").end();
    return;
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const page = typeof body.page === "string" ? body.page.slice(0, 160) : "/";
    const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 500) : "";
    const ua = String(req.headers["user-agent"] || "").slice(0, 1000);
    const ip = getClientIp(req);
    const { device, os, browser } = classifyUserAgent(ua);
    if (device === "Bot") { res.status(204).end(); return; }

    const country = String(req.headers["x-vercel-ip-country"] || "").slice(0, 2).toUpperCase();
    const visitorId = hashVisitor(ip, ua);
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 86400000);

    await db.collection("kairosAnalytics").add({
      visitorId, day, timestamp: now, expiresAt, page, referrer,
      country: country || "Unknown", device, os, browser
    });
    res.status(204).end();
  } catch (error) {
    console.error("Analytics tracking failed:", error);
    res.status(204).end();
  }
}

export const config = { api: { bodyParser: { sizeLimit: "2kb" } } };
