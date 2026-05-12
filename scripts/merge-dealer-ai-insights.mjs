import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function merge(localeFile, patchFile) {
  const p = path.join(root, 'messages', localeFile);
  const messages = JSON.parse(fs.readFileSync(p, 'utf8'));
  const patch = JSON.parse(fs.readFileSync(path.join(root, 'messages', patchFile), 'utf8'));
  messages.dealerAiInsights = patch;
  fs.writeFileSync(p, JSON.stringify(messages, null, 4) + '\n');
}

merge('en.json', 'dealerAiInsights.en.json');
merge('tr.json', 'dealerAiInsights.tr.json');
console.log('merged dealerAiInsights into en.json and tr.json');
