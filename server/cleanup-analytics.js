import { timingSafeEqual } from "node:crypto";

const DELETE_BATCH_SIZE = 400;

function isAuthorized(req, env) {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const encoder = new TextEncoder();
  const actual = encoder.encode(req.headers.authorization || '');
  const expected = encoder.encode('Bearer ' + secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function clearExpiredAnalytics(db, { deadlineMs = Infinity } = {}) {
  let deleted = 0;
  const now = new Date();

  while (true) {
    if (Date.now() >= deadlineMs) throw new Error("Analytics cleanup incomplete: runtime deadline reached.");
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

export function createHandler({ env, db, deadlineMs = Infinity }) {
  return async function handler(req, res) {
  if (!isAuthorized(req, env)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }

  try {
    const deleted = await clearExpiredAnalytics(db, { deadlineMs });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ deleted });
  } catch (error) {
    console.error("Analytics cleanup failed.");
    res.status(500).json({ error: "Unable to clean up analytics." });
  }
}

}
