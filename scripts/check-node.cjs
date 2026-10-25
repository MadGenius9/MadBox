// Keep this preflight compatible with older Node releases so it can explain
// an unsupported runtime before Vite or any project dependency is loaded.
var parts = process.versions.node.split('.');
var major = Number(parts[0]);
var minor = Number(parts[1]);
if (!(major > 22 || (major === 22 && minor >= 12))) {
  var message = 'MadBox needs Node.js 22.12 or newer. Found Node.js ' + process.versions.node + '.';
  console.error(message);
  process.exit(1);
}
console.log('MadBox Node.js check passed: ' + process.versions.node);
