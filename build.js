const fs = require('fs');
const path = require('path');

const secret = process.env.KAIROS_RELAY_SECRET;
if (!secret) {
    console.error('Missing KAIROS_RELAY_SECRET environment variable — set it in Vercel project settings.');
    process.exit(1);
}

const filePath = path.join(__dirname, 'app.js');
let content = fs.readFileSync(filePath, 'utf8');
content = content.replaceAll('__KAIROS_RELAY_SECRET__', secret);
fs.writeFileSync(filePath, content);

console.log('Build complete: injected KAIROS_RELAY_SECRET into app.js');