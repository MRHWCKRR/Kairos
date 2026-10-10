import { createFirebaseAuth, createFirebaseAppCheck } from './firebase-auth.js';
import { createFirestore } from './firebase-firestore.js';

const servicesByEnvironment = new WeakMap();

export function createFirebaseServices(env) {
  const credentials = [env.FIREBASE_PROJECT_ID, env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY, env.FIREBASE_PROJECT_NUMBER, env.FIREBASE_WEB_APP_ID];
  const cached = servicesByEnvironment.get(env);
  if (cached && credentials.every((value, i) => value === cached.credentials[i])) return cached.services;
  const services = { db: createFirestore({ env }), adminAuth: createFirebaseAuth({ projectId: env.FIREBASE_PROJECT_ID }), appCheck: createFirebaseAppCheck({ projectNumber: env.FIREBASE_PROJECT_NUMBER, appId: env.FIREBASE_WEB_APP_ID }) };
  servicesByEnvironment.set(env, { credentials, services });
  return services;
}
