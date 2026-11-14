const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
const logic = fs.readFileSync(path.join(__dirname, 'logic.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

const html = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>
<title>Rummy Room</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=DM+Sans:wght@400;500;700&family=Yatra+One&display=swap">
<style>
${css}
</style>
<div id="app"></div>
<div class="rotate" role="alert">
  <div class="rotate-glow"></div>
  <div class="phone-frame">
    <div class="phone-notch"></div>
    <div class="phone-screen">
      <div class="phone-mini-cards"><span>🂡</span><span>🂮</span><span>🂫</span></div>
    </div>
  </div>
  <h2 class="rotate-title">Rotate your device</h2>
  <p class="rotate-sub">For the best Rummy experience, please turn your phone sideways.</p>
</div>
<script>
${logic}
</script>
<script>
${app}
</script>
</body></html>
`;

fs.writeFileSync(path.join(__dirname, 'Rummy.html'), html, 'utf8');
console.log('Rummy.html successfully synchronized with style.css, logic.js, and app.js!');
