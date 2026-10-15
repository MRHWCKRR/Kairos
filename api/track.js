import { createHandler } from "../server/track.js";
import { db } from "./_firebaseAdmin.js";

function getClientMetadata(req) {
 const forwarded = req.headers['x-forwarded-for'];
 return { ip: typeof forwarded === 'string' && forwarded ? forwarded.split(',')[0].trim() : req.headers['x-real-ip'] || 'unknown', country: req.headers['x-vercel-ip-country'] || '' };
}

export default createHandler({ env: process.env, db, getClientMetadata });

export const config = { api: { bodyParser: { sizeLimit: "2kb" } } };
