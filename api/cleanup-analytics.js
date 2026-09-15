import { db } from "./_firebaseAdmin.js";

const DELETE_BATCH_SIZE = 400;

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

async function clearExpiredAnalytics() {
  let deleted = 0;
  const now = new Date();

  while (true) {
    const snapshot = await db.collection("kairosAnalytics")
      .where("expiresAt", "<=", now)
      .limit(DELETE_BATCH_SIZE)
      .get();

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
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }

  try {
    const deleted = await clearExpiredAnalytics();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ deleted });
  } catch (error) {
    console.error("Analytics cleanup failed:", error);
    res.status(500).json({ error: "Unable to clean up analytics." });
  }
}
