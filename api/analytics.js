import { createHandler } from "../server/analytics.js";
import { db, adminAuth } from "./_firebaseAdmin.js";

export default createHandler({ env: process.env, db, adminAuth });
