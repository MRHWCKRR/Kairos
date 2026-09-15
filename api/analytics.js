import { adminAuth, db } from "./_firebaseAdmin.js";

const RETENTION_DAYS = 90;
const MAX_EVENTS = 10000;
const DELETE_BATCH_SIZE = 400;

async function requireAdmin(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    const token = await adminAuth.verifyIdToken(header.slice(7));
    return process.env.ANALYTICS_ADMIN_UID && token.uid === process.env.ANALYTICS_ADMIN_UID ? token : null;
  } catch {
    return null;
  }
}

function countBy(events, key) {
  return Object.entries(events.reduce((a, e) => {
    const value = e[key] || "Unknown";
    a[value] = (a[value] || 0) + 1;
    return a;
  }, {})).sort((a, b) => b[1] - a[1]);
}

function makeDaily(events) {
  const days = {};
  for (const event of events) {
    if (!days[event.day]) days[event.day] = { pageViews: 0, visitors: new Set() };
    days[event.day].pageViews += 1;
    days[event.day].visitors.add(event.visitorId);
  }
  return Object.fromEntries(Object.entries(days).map(([day, value]) => [day, {
    pageViews: value.pageViews,
    uniqueVisitors: value.visitors.size
  }]));
}

async function clearAnalytics() {
  let deleted = 0;
  while (true) {
    const snapshot = await db.collection("kairosAnalytics").limit(DELETE_BATCH_SIZE).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;
    if (snapshot.size < DELETE_BATCH_SIZE) break;
  }
  return deleted;
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    if (req.method === "DELETE") {
      const deleted = await clearAnalytics();
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ deleted });
      return;
    }

    if (req.method !== "GET") { res.status(405).setHeader("Allow", "GET, DELETE").end(); return; }

    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), RETENTION_DAYS);
    const since = new Date(Date.now() - days * 86400000);
    const snapshot = await db.collection("kairosAnalytics")
      .where("timestamp", ">=", since)
      .orderBy("timestamp", "desc")
      .limit(MAX_EVENTS)
      .get();

    const events = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        visitorId: d.visitorId || "unknown",
        timestamp: d.timestamp?.toDate?.()?.toISOString() || null,
        day: d.day || "",
        page: d.page || "/",
        referrer: d.referrer || "Direct",
        country: d.country || "Unknown",
        device: d.device || "Other",
        os: d.os || "Other",
        browser: d.browser || "Other"
      };
    });

    const today = new Date().toISOString().slice(0, 10);
    const todayEvents = events.filter(e => e.day === today);
    const activeCutoff = Date.now() - 5 * 60000;
    const active = new Set(events.filter(e => e.timestamp && new Date(e.timestamp).getTime() >= activeCutoff).map(e => e.visitorId)).size;
    const daily = makeDaily(events);
    const uniqueVisitors = new Set(events.map(e => e.visitorId)).size;
    const truncated = snapshot.size >= MAX_EVENTS;

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      rangeDays: days,
      retentionDays: RETENTION_DAYS,
      maxEventsPerLoad: MAX_EVENTS,
      truncated,
      totals: {
        pageViews: events.length,
        uniqueVisitors,
        todayVisitors: new Set(todayEvents.map(e => e.visitorId)).size,
        activeNow: active
      },
      breakdowns: {
        device: countBy(events, "device"),
        os: countBy(events, "os"),
        browser: countBy(events, "browser"),
        country: countBy(events, "country"),
        page: countBy(events, "page"),
        referrer: countBy(events, "referrer")
      },
      daily,
      recent: events.slice(0, 50)
    });
  } catch (error) {
    console.error("Analytics dashboard failed:", error);
    res.status(500).json({ error: "Unable to load analytics." });
  }
}
