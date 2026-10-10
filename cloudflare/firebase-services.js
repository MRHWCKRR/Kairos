import { createFirebaseAuth } from './firebase-auth.js';
import { createFirestore } from './firebase-firestore.js';

const servicesByEnvironment = new WeakMap();

export function createFirebaseServices(env) {
  const credentials = [env.FIREBASE_PROJECT_ID, env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY];
  const cached = servicesByEnvironment.get(env);
  if (cached && credentials.every((value, i) => value === cached.credentials[i])) return cached.services;
  const services = { db: createFirestore({ env }), adminAuth: createFirebaseAuth({ projectId: env.FIREBASE_PROJECT_ID }) };
  servicesByEnvironment.set(env, { credentials, services });
  return services;
}
