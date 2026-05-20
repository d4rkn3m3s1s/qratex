const fs = require('fs');
const path = require('path');

function findAndDelete(dir, targetName) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file === targetName) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`Deleted: ${fullPath}`);
      } else {
        findAndDelete(fullPath, targetName);
      }
    }
  }
}

findAndDelete(path.join(__dirname, 'app'), 'journey-timeline');
findAndDelete(path.join(__dirname, 'app'), 'hall-of-fame');
console.log("Cleanup complete");
