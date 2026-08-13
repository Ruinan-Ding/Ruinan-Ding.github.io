// Where headless Chrome lives.
//
// CHROME overrides it, which is how a machine that isn't this one — CI, a
// Mac, a Linux box with chromium under another name — points the suites at
// its own binary without editing eighteen files.
export const CHROME = process.env.CHROME ?? (
  process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome'
);
