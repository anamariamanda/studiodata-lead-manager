const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

exports.default = async function fixMacosPlists(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = context.appOutDir;
  const plistPaths = [];
  collectPlists(appPath, plistPaths);

  for (const plistPath of plistPaths) {
    setPlistValue(plistPath, 'LSMinimumSystemVersion', '10.15');
    setPlistValue(plistPath, 'MinimumOSVersion', '10.15');
  }
};

function collectPlists(dir, result) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectPlists(fullPath, result);
    } else if (entry.name === 'Info.plist') {
      result.push(fullPath);
    }
  }
}

function setPlistValue(plistPath, key, value) {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plistPath]);
  } catch (_) {
    try {
      execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plistPath]);
    } catch (_) {}
  }
}
