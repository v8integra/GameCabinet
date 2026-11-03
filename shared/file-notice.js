// Browsers block JavaScript modules on pages opened straight from disk (file://).
// This classic script still runs there and explains how to start the cabinet instead.
(function () {
  if (location.protocol !== 'file:') return;
  document.addEventListener('DOMContentLoaded', function () {
    var box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText =
      'position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:16px;' +
      'background:rgba(7,6,15,0.92);font:16px/1.5 system-ui,sans-serif;color:#ece9ff;';
    box.innerHTML =
      '<div style="max-width:520px;padding:28px;border:1px solid #2b2652;border-radius:14px;background:#15122c;text-align:center">' +
      '<h2 style="margin:0 0 10px;color:#ff3d9a;font-size:1.5rem">Start the cabinet first</h2>' +
      '<p style="margin:0 0 14px;color:#9d97c9">This page was opened straight from the folder, and browsers block games loaded that way.</p>' +
      '<p style="margin:0 0 8px">Double-click <b style="color:#2de2e6">start-cabinet.bat</b> in the GameCabinet folder.</p>' +
      '<p style="margin:0;color:#9d97c9;font-size:0.9rem">It opens <b>http://localhost:8090</b> for you. (Or run <code>node serve.js</code>.)</p>' +
      '</div>';
    document.body.appendChild(box);
  });
})();
