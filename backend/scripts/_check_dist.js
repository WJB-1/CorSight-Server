const path = require('path');
const fs = require('fs');

const distPath = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
console.log('__dirname:', __dirname);
console.log('distPath:', distPath);
console.log('distPath exists:', fs.existsSync(distPath));

const indexPath = path.join(distPath, 'index.html');
console.log('index.html exists:', fs.existsSync(indexPath));

if (fs.existsSync(indexPath)) {
  const content = fs.readFileSync(indexPath, 'utf-8');
  console.log('index.html first 100 chars:', content.substring(0, 100));
}
