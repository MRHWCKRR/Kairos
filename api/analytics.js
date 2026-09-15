import { adminAuth, db } from "./_firebaseAdmin.js";

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

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).setHeader("Allow", "GET").end(); return; }
  if (!(await requireAdmin(req))) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
    const since = new Date(Date.now() - days * 86400000);
    const snapshot = await db.collection("kairosAnalytics").where("timestamp", ">=", since).orderBy("timestamp", "desc").limit(10000).get();
    const events = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id, visitorId: d.visitorId || "unknown",
        timestamp: d.timestamp?.toDate?.()?.toISOString() || null,
        day: d.day || "", page: d.page || "/", referrer: d.referrer || "",
        country: d.country || "Unknown", device: d.device || "Other",
        os: d.os || "Other", browser: d.browser || "Other"
      };
    });

    const today = new Date().toISOString().slice(0, 10);
    const todayEvents = events.filter(e => e.day === today);
    const activeCutoff = Date.now() - 5 * 60000;
    const active = new Set(events.filter(e => e.timestamp && new Date(e.timestamp).getTime() >= activeCutoff).map(e => e.visitorId)).size;
    const countBy = key => Object.entries(events.reduce((a, e) => { const v = e[key] || "Unknown"; a[v] = (a[v] || 0) + 1; return a; }, {})).sort((a,b) => b[1] - a[1]);

    const daily = {};
    for (const e of events) daily[e.day] = (daily[e.day] || 0) + 1;

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      rangeDays: days,
      totals: {
        pageViews: events.length,
        uniqueVisitors: new Set(events.map(e => e.visitorId)).size,
        todayVisitors: new Set(todayEvents.map(e => e.visitorId)).size,
        activeNow: active
      },
      breakdowns: { device: countBy("device"), os: countBy("os"), browser: countBy("browser"), country: countBy("country"), page: countBy("page") },
      daily, recent: events.slice(0, 100)
    });
  } catch (error) {
    console.error("Analytics dashboard failed:", error);
    res.status(500).json({ error: "Unable to load analytics." });
  }
}
