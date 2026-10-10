import { createHandler } from "../server/cleanup-analytics.js";
import { db } from "./_firebaseAdmin.js";

export default createHandler({ env: process.env, db });
