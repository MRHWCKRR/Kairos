// Both build entrypoints package the same explicit source without editing it.
import {buildCloudflare} from './cloudflare/build.js';
await buildCloudflare();
