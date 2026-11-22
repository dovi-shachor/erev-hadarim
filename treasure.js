/* treasure.js - festive treasure-chest opening animation + confetti overlay.
 * Self-contained: injects its own <style>, builds its own markup, no assets.
 * Public API:
 *   window.Treasure.play(containerEl) -> Promise<void>
 *   window.Treasure.confetti(containerEl, { duration = 2500 } = {}) -> void
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- config
  var COLORS = ['#FFD23F', '#4CD37B', '#A66BFF', '#FF6FB5', '#5CC8FF', '#FFC83D', '#FFFFFF'];
  var SPARK_COLORS = ['#FFFFFF', '#FFF3B0', '#FFD23F'];
  var LOW_END = (navigator.hardwareConcurrency || 8) <= 4;
  var MAX_PARTICLES = LOW_END ? 80 : 140;
  var DPR_CAP = 2;

  // play() timeline (ms)
  var T_LOCK_SPARK = 820;   // sparkle when the padlock pops
  var T_BURST_1 = 2000;     // main confetti burst
  var T_BURST_2 = 2320;
  var T_BURST_3 = 2650;
  var T_RESOLVE = 3750;     // promise resolves
  var T_REDUCED = 1500;     // reduced-motion version
  var T_SAFETY = 4600;      // resolve no matter what

  var raf = window.requestAnimationFrame || function (cb) { return setTimeout(function () { cb(Date.now()); }, 16); };
  var caf = window.cancelAnimationFrame || clearTimeout;

  function reducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function isConnected(el) {
    return el.isConnected !== undefined ? el.isConnected : document.documentElement.contains(el);
  }

  // ---------------------------------------------------------------- styles
  var CSS = [
    '.trs-scene{position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden;direction:ltr;',
    'background:#230B4D;background:radial-gradient(circle at 50% 50%,#8144DB 0%,#5524A6 32%,#2A0E5C 70%,#14062E 100%);',
    '-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;animation:trs-fade .25s ease-out both}',
    '.trs-reduced{animation:trs-fade .6s ease-out both}',
    '.trs-halo{position:absolute;left:50%;top:50%;width:150vmin;height:150vmin;margin:-75vmin 0 0 -75vmin;pointer-events:none;',
    'background:radial-gradient(circle,rgba(255,214,102,.5) 0%,rgba(255,170,80,.18) 35%,rgba(255,170,80,0) 65%)}',
    '.trs-stage{position:absolute;left:50%;top:52%;width:70vw;max-width:320px;transform:translate(-50%,-50%)}',
    '@media (max-height:480px){.trs-stage{max-width:58vh}}',
    '.trs-chest{position:relative;display:block;width:100%;height:auto;overflow:visible}',
    '.trs-rays{position:absolute;left:50%;top:50%;width:190%;margin:-95% 0 0 -95%;pointer-events:none}',
    '.trs-rays svg{display:block;width:100%;height:auto;overflow:visible}',
    '.trs-canvas{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5}',
    '.trs-layer{position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;overflow:hidden;direction:ltr}',
    '.trs-tw{position:absolute;pointer-events:none;opacity:.85;',
    '-webkit-clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);',
    'clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)}',
    '.trs-flash{opacity:0}',
    '.trs-reduced .trs-lid-out,.trs-reduced .trs-lock-drop,.trs-reduced .trs-flash{display:none}',

    /* --- animated version: everything is transform/opacity only --- */
    '.trs-anim .trs-tw{animation:trs-tw 1.3s ease-in-out infinite alternate both}',
    '.trs-anim .trs-halo{animation:trs-halo .9s ease-out 1.45s both}',
    '.trs-anim .trs-rays{animation:trs-rays-in .8s cubic-bezier(.2,1.3,.4,1) 1.5s both}',
    '.trs-anim .trs-rays svg{will-change:transform;animation:trs-spin 16s linear infinite}',
    '.trs-anim .trs-shadow{transform-origin:160px 298px;animation:trs-shadow .45s ease-out both}',
    '.trs-anim .trs-pop{transform-origin:160px 292px;animation:trs-pop .46s ease-out both}',
    '.trs-anim .trs-wob{transform-origin:160px 292px;animation:trs-wob .46s ease-in-out .4s both}',
    '.trs-anim .trs-lock-jig{transform-origin:160px 190px;animation:trs-jig .4s ease-in-out .6s both}',
    '.trs-anim .trs-shackle{transform-origin:170px 190px;animation:trs-shk .2s cubic-bezier(.3,1.7,.6,1) .68s both}',
    '.trs-anim .trs-lock-drop{transform-origin:160px 204px;animation:trs-drop .34s cubic-bezier(.5,0,.9,.6) 1s both}',
    '.trs-anim .trs-flash{transform-origin:160px 198px;animation:trs-flash .45s ease-out .78s both}',
    '.trs-anim .trs-lid-out{transform-origin:160px 172px;animation:trs-lid-out 1s 1.3s both}',
    '.trs-anim .trs-lid-in{transform-origin:160px 168px;animation:trs-lid-in 1s 1.3s both}',
    '.trs-anim .trs-beam{animation:trs-beam .9s ease-out 1.5s both}',
    '.trs-anim .trs-loot{transform-origin:160px 172px;animation:trs-loot .6s cubic-bezier(.3,1.6,.5,1) 1.5s both}',
    '.trs-anim .trs-glint{animation:trs-glint .7s ease-in-out infinite alternate both}',

    '@keyframes trs-fade{from{opacity:0}to{opacity:1}}',
    '@keyframes trs-tw{from{transform:scale(.25);opacity:.15}to{transform:scale(1);opacity:.95}}',
    '@keyframes trs-halo{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}',
    '@keyframes trs-rays-in{from{transform:scale(.15);opacity:0}to{transform:scale(1);opacity:1}}',
    '@keyframes trs-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
    '@keyframes trs-shadow{from{transform:scale(.2);opacity:0}to{transform:scale(1);opacity:1}}',
    '@keyframes trs-pop{0%{transform:scale(0);opacity:0}25%{opacity:1}55%{transform:scale(1.14,1.08)}78%{transform:scale(.95,1.04)}100%{transform:scale(1);opacity:1}}',
    '@keyframes trs-wob{0%,100%{transform:rotate(0deg)}18%{transform:rotate(-4deg)}38%{transform:rotate(3.5deg)}58%{transform:rotate(-2.5deg)}78%{transform:rotate(1.5deg)}}',
    '@keyframes trs-jig{0%,100%{transform:rotate(0deg)}15%{transform:rotate(-11deg)}35%{transform:rotate(10deg)}55%{transform:rotate(-8deg)}75%{transform:rotate(5deg)}}',
    '@keyframes trs-shk{from{transform:translateY(0) rotate(0deg)}to{transform:translateY(-6px) rotate(32deg)}}',
    '@keyframes trs-drop{from{transform:translate(0,0) rotate(0deg);opacity:1}to{transform:translate(14px,100px) rotate(40deg);opacity:0}}',
    '@keyframes trs-flash{0%{transform:scale(0) rotate(0deg);opacity:0}30%{opacity:1}100%{transform:scale(1.5) rotate(40deg);opacity:0}}',
    /* lid: outer face lifts + flattens while the inside panel grows from the hinge (fake rotateX), then overshoot */
    '@keyframes trs-lid-out{0%{transform:translateY(0) scaleY(1);animation-timing-function:cubic-bezier(.5,0,.35,1)}70%,100%{transform:translateY(-105px) scaleY(0)}}',
    '@keyframes trs-lid-in{0%{transform:scaleY(0);animation-timing-function:cubic-bezier(.5,0,.35,1)}70%{transform:scaleY(1.09);animation-timing-function:ease-in-out}86%{transform:scaleY(.96);animation-timing-function:ease-in-out}100%{transform:scaleY(1)}}',
    '@keyframes trs-beam{0%{opacity:0}55%{opacity:1}100%{opacity:.8}}',
    '@keyframes trs-loot{from{transform:translateY(18px) scale(.88)}to{transform:translateY(0) scale(1)}}',
    '@keyframes trs-glint{from{transform:scale(0) rotate(0deg);opacity:0}to{transform:scale(1) rotate(45deg);opacity:1}}'
  ].join('\n');

  function injectStyle() {
    if (document.getElementById('trs-style')) return;
    var st = document.createElement('style');
    st.id = 'trs-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  // ---------------------------------------------------------------- SVG pieces
  function rivet(x, y) {
    return '<circle cx="' + x + '" cy="' + y + '" r="2.8" fill="#FFF4B8" stroke="#A86E08" stroke-width="1"/>';
  }
  function coin(x, y) {
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="12" ry="8" fill="url(#trs-g-coin)" stroke="#B8790A" stroke-width="1.4"/>' +
      '<ellipse cx="' + x + '" cy="' + (y - 0.5) + '" rx="7.5" ry="4.6" fill="none" stroke="#FFF6C2" stroke-width="1.2" opacity=".8"/>';
  }
  function gem(x, y, s, base, light) {
    var p = function (dx, dy) { return (x + dx * s) + ',' + (y + dy * s); };
    return '<polygon points="' + p(0, -10) + ' ' + p(9, -3) + ' ' + p(0, 11) + ' ' + p(-9, -3) + '" fill="' + base +
      '" stroke="rgba(0,0,0,.25)" stroke-width="1" stroke-linejoin="round"/>' +
      '<polygon points="' + p(0, -10) + ' ' + p(9, -3) + ' ' + p(-9, -3) + '" fill="' + light + '"/>' +
      '<polygon points="' + p(-9, -3) + ' ' + p(-3, -3) + ' ' + p(0, 11) + '" fill="#FFFFFF" opacity=".28"/>';
  }
  function star4(x, y, r, cls, delay) {
    var k = r * 0.28;
    var pts = [x, y - r, x + k, y - k, x + r, y, x + k, y + k, x, y + r, x - k, y + k, x - r, y, x - k, y - k].join(' ');
    var style = 'transform-origin:' + x + 'px ' + y + 'px;' + (delay != null ? 'animation-delay:' + delay + 's;' : '');
    return '<polygon class="' + cls + '" style="' + style + '" points="' + pts + '" fill="#FFFFFF"/>';
  }

  var DEFS =
    '<defs>' +
    '<linearGradient id="trs-g-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9803A"/><stop offset="1" stop-color="#8E4A1A"/></linearGradient>' +
    '<linearGradient id="trs-g-wood2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DE9A4C"/><stop offset="1" stop-color="#A65E24"/></linearGradient>' +
    '<linearGradient id="trs-g-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFEE99"/><stop offset=".45" stop-color="#FFC83D"/><stop offset="1" stop-color="#D98F0E"/></linearGradient>' +
    '<linearGradient id="trs-g-goldh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#D98F0E"/><stop offset=".45" stop-color="#FFE680"/><stop offset="1" stop-color="#E09A12"/></linearGradient>' +
    '<linearGradient id="trs-g-lining" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9A2F78"/><stop offset="1" stop-color="#4A1240"/></linearGradient>' +
    '<linearGradient id="trs-g-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8E98A8"/><stop offset=".5" stop-color="#F4F6FA"/><stop offset="1" stop-color="#9AA3B2"/></linearGradient>' +
    '<linearGradient id="trs-g-beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFE27A" stop-opacity=".8"/><stop offset=".5" stop-color="#FFD866" stop-opacity=".3"/><stop offset="1" stop-color="#FFD866" stop-opacity="0"/></linearGradient>' +
    '<radialGradient id="trs-g-coin" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#FFF6B0"/><stop offset=".55" stop-color="#FFC83D"/><stop offset="1" stop-color="#DB8F0C"/></radialGradient>' +
    '<radialGradient id="trs-g-shadow"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="trs-g-flash"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".35" stop-color="#FFF1A8" stop-opacity=".85"/><stop offset="1" stop-color="#FFC83D" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="trs-g-inglow" cx=".5" cy="1" r=".9"><stop offset="0" stop-color="#FFD866" stop-opacity=".75"/><stop offset="1" stop-color="#FFD866" stop-opacity="0"/></radialGradient>' +
    '</defs>';

  // Light rays: separate <svg> so it is composited as one layer while spinning.
  function raysSVG() {
    var s = '<svg viewBox="-100 -100 200 200" aria-hidden="true"><defs>' +
      '<radialGradient id="trs-g-glow"><stop offset="0" stop-color="#FFF3B0" stop-opacity=".95"/><stop offset=".35" stop-color="#FFD23F" stop-opacity=".45"/><stop offset="1" stop-color="#FFC83D" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="trs-g-ray" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="100"><stop offset="0" stop-color="#FFF6C2" stop-opacity=".9"/><stop offset=".55" stop-color="#FFD23F" stop-opacity=".4"/><stop offset="1" stop-color="#FFC83D" stop-opacity="0"/></radialGradient>' +
      '</defs><circle r="78" fill="url(#trs-g-glow)"/>';
    var n = 12;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var half = (i % 2 ? 4.5 : 7.5) * Math.PI / 180;
      var R = i % 2 ? 78 : 100;
      s += '<polygon fill="url(#trs-g-ray)" points="0,0 ' +
        (Math.cos(a - half) * R).toFixed(1) + ',' + (Math.sin(a - half) * R).toFixed(1) + ' ' +
        (Math.cos(a + half) * R).toFixed(1) + ',' + (Math.sin(a + half) * R).toFixed(1) + '"/>';
    }
    return s + '</svg>';
  }

  function chestSVG() {
    var LID = 'M34 172 V132 Q34 100 80 96 H240 Q286 100 286 132 V172 Z';
    var s = '<svg class="trs-chest" viewBox="0 0 320 330" aria-hidden="true">' + DEFS;

    // ground shadow
    s += '<ellipse class="trs-shadow" cx="160" cy="298" rx="128" ry="15" fill="url(#trs-g-shadow)"/>';
    s += '<g class="trs-pop"><g class="trs-wob">';

    // inside of the open lid (grows from the back hinge)
    s += '<g class="trs-lid-in">' +
      '<path d="M48 168 V112 Q48 76 94 72 H226 Q272 76 272 112 V168 Z" fill="url(#trs-g-lining)" stroke="url(#trs-g-gold)" stroke-width="8" stroke-linejoin="round"/>' +
      '<path d="M62 160 V114 Q62 88 98 85 H222 Q258 88 258 114 V160" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="3"/>' +
      '<rect x="85" y="74" width="16" height="92" fill="url(#trs-g-goldh)" opacity=".9"/>' +
      '<rect x="219" y="74" width="16" height="92" fill="url(#trs-g-goldh)" opacity=".9"/>' +
      '<rect x="56" y="80" width="208" height="88" fill="url(#trs-g-inglow)"/>' +
      '</g>';

    // light pouring out
    s += '<polygon class="trs-beam" points="58,168 262,168 318,-70 2,-70" fill="url(#trs-g-beam)"/>';

    // dark mouth + loot
    s += '<ellipse cx="160" cy="166" rx="110" ry="13" fill="#2A1206"/>';
    s += '<g class="trs-loot">';
    var rows = [
      [132, [150, 173]],
      [141, [112, 136, 160, 184, 208]],
      [151, [84, 107, 130, 153, 176, 199, 222, 242]],
      [162, [68, 91, 114, 137, 160, 183, 206, 229, 252]]
    ];
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < rows[r][1].length; c++) s += coin(rows[r][1][c], rows[r][0]);
    }
    s += gem(160, 121, 1.15, '#4CD37B', '#9AF0B9') +
      gem(118, 133, 1, '#FF6FB5', '#FFB3D8') +
      gem(202, 134, 1, '#5CC8FF', '#B5E6FF') +
      gem(236, 146, 0.85, '#A66BFF', '#D2B5FF') +
      gem(86, 147, 0.75, '#FFD23F', '#FFF0A8');
    s += star4(140, 138, 9, 'trs-glint', 1.9) + star4(214, 150, 7, 'trs-glint', 2.15) +
      star4(98, 156, 6, 'trs-glint', 2.4) + star4(176, 118, 6, 'trs-glint', 2.05);
    s += '</g>';

    // body
    s += '<rect x="40" y="168" width="240" height="120" rx="10" fill="url(#trs-g-wood)" stroke="#5E2D0C" stroke-width="2"/>' +
      '<path d="M42 208 H278 M42 247 H278" stroke="#6A340F" stroke-width="2.5" opacity=".75"/>' +
      '<path d="M42 211 H278 M42 250 H278" stroke="#E2A05A" stroke-width="1.5" opacity=".45"/>' +
      '<rect x="46" y="182" width="228" height="10" fill="#000" opacity=".12"/>' +
      '<rect x="84" y="176" width="18" height="104" fill="url(#trs-g-goldh)" stroke="#A86E08" stroke-width="1"/>' +
      '<rect x="218" y="176" width="18" height="104" fill="url(#trs-g-goldh)" stroke="#A86E08" stroke-width="1"/>' +
      '<rect x="35" y="164" width="250" height="16" rx="5" fill="url(#trs-g-gold)" stroke="#A86E08" stroke-width="1.2"/>' +
      '<rect x="35" y="275" width="250" height="15" rx="5" fill="url(#trs-g-gold)" stroke="#A86E08" stroke-width="1.2"/>' +
      // corner fittings
      '<path d="M35 169 a5 5 0 0 1 5 -5 H64 V180 H51 V194 H35 Z" fill="url(#trs-g-gold)" stroke="#A86E08" stroke-width="1.2"/>' +
      '<path d="M285 169 a5 5 0 0 0 -5 -5 H256 V180 H269 V194 H285 Z" fill="url(#trs-g-gold)" stroke="#A86E08" stroke-width="1.2"/>' +
      '<path d="M35 285 a5 5 0 0 0 5 5 H64 V275 H51 V261 H35 Z" fill="url(#trs-g-gold)" stroke="#A86E08" stroke-width="1.2"/>' +
      '<path d="M285 285 a5 5 0 0 1 -5 5 H256 V275 H269 V261 H285 Z" fill="url(#trs-g-gold)" stroke="#A86E08" stroke-width="1.2"/>' +
      rivet(43, 172) + rivet(277, 172) + rivet(43, 282) + rivet(277, 282) +
      rivet(93, 172) + rivet(227, 172) + rivet(93, 282) + rivet(227, 282) +
      rivet(93, 228) + rivet(227, 228) + rivet(126, 172) + rivet(194, 172) + rivet(126, 282) + rivet(194, 282) +
      // keyhole plate
      '<path d="M138 178 H182 V204 Q182 222 160 228 Q138 222 138 204 Z" fill="url(#trs-g-gold)" stroke="#A86E08" stroke-width="1.5"/>' +
      '<circle cx="160" cy="198" r="5.5" fill="#3A1A08"/><path d="M157 199 L154.5 214 H165.5 L163 199 Z" fill="#3A1A08"/>' +
      rivet(144, 184) + rivet(176, 184);

    // closed lid (front face) - lifts and flattens when opening
    s += '<g class="trs-lid-out">' +
      '<path d="' + LID + '" fill="url(#trs-g-wood2)"/>' +
      '<path d="M37 124 H283 M35 147 H285" stroke="#7A3E12" stroke-width="2.5" opacity=".7"/>' +
      '<path d="M37 127 H283 M35 150 H285" stroke="#F0B56E" stroke-width="1.5" opacity=".45"/>' +
      '<path d="M52 128 Q54 108 84 104 H150 Q120 110 100 128 Z" fill="#FFF" opacity=".16"/>' +
      '<rect x="84" y="97" width="18" height="66" fill="url(#trs-g-goldh)" stroke="#A86E08" stroke-width="1"/>' +
      '<rect x="218" y="97" width="18" height="66" fill="url(#trs-g-goldh)" stroke="#A86E08" stroke-width="1"/>' +
      '<path d="' + LID + '" fill="none" stroke="url(#trs-g-gold)" stroke-width="7" stroke-linejoin="round"/>' +
      '<path d="' + LID + '" fill="none" stroke="#A86E08" stroke-width="1" stroke-linejoin="round" opacity=".6" transform="translate(0 0)"/>' +
      '<rect x="31" y="158" width="258" height="16" rx="5" fill="url(#trs-g-gold)" stroke="#A86E08" stroke-width="1.2"/>' +
      rivet(41, 166) + rivet(279, 166) + rivet(93, 166) + rivet(227, 166) + rivet(93, 112) + rivet(227, 112) +
      rivet(93, 138) + rivet(227, 138) + rivet(126, 166) + rivet(194, 166) +
      // hasp
      '<path d="M150 160 H170 V182 Q170 187 160 187 Q150 187 150 182 Z" fill="url(#trs-g-gold)" stroke="#A86E08" stroke-width="1.2"/>' +
      '</g>';

    // padlock (shackle + body are separate parts)
    s += '<g class="trs-lock-drop"><g class="trs-lock-jig">' +
      '<g class="trs-shackle"><path d="M150 193 V183 a10 10 0 0 1 20 0 V193" fill="none" stroke="#6C7686" stroke-width="7.5" stroke-linecap="round"/>' +
      '<path d="M150 193 V183 a10 10 0 0 1 20 0 V193" fill="none" stroke="url(#trs-g-steel)" stroke-width="5" stroke-linecap="round"/></g>' +
      '<rect x="142" y="190" width="36" height="30" rx="7" fill="url(#trs-g-gold)" stroke="#9A6206" stroke-width="1.8"/>' +
      '<rect x="146" y="193" width="28" height="5" rx="2.5" fill="#FFF" opacity=".45"/>' +
      '<circle cx="160" cy="203" r="4" fill="#4A2408"/><path d="M158 204 L156.5 213 H163.5 L162 204 Z" fill="#4A2408"/>' +
      '</g></g>';

    // unlock flash
    s += '<g class="trs-flash"><circle cx="160" cy="198" r="34" fill="url(#trs-g-flash)"/>' +
      star4(160, 198, 30, '', null) + '</g>';

    s += '</g></g></svg>';
    return s;
  }

  // Static/twinkling little stars (cheap DOM sparkles).
  function addTwinkles(parent, spots) {
    for (var i = 0; i < spots.length; i++) {
      var d = document.createElement('div');
      d.className = 'trs-tw';
      var sz = spots[i][2];
      d.style.cssText = 'left:' + spots[i][0] + '%;top:' + spots[i][1] + '%;width:' + sz + 'px;height:' + sz +
        'px;margin:' + (-sz / 2) + 'px 0 0 ' + (-sz / 2) + 'px;background:' + spots[i][3] +
        ';animation-delay:' + spots[i][4] + 's';
      parent.appendChild(d);
    }
  }
  var BACKDROP_SPOTS = [
    [12, 14, 16, '#FFFFFF', 0.1], [84, 11, 20, '#FFD23F', 0.5], [27, 27, 11, '#FF6FB5', 0.9],
    [72, 24, 12, '#5CC8FF', 0.3], [8, 52, 12, '#FFC83D', 0.7], [92, 47, 15, '#FFFFFF', 1.1],
    [16, 80, 18, '#A66BFF', 0.4], [85, 78, 13, '#4CD37B', 0.8], [50, 9, 10, '#FFFFFF', 0.6],
    [38, 90, 11, '#FFD23F', 1.0], [66, 91, 16, '#FFFFFF', 0.2]
  ];

  // ---------------------------------------------------------------- particle engine (one canvas + rAF)
  var STAR4 = unitStar(4, 0.34);
  var STAR5 = unitStar(5, 0.46);
  function unitStar(n, inner) {
    var pts = [];
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + (i * Math.PI) / n;
      var r = i % 2 ? inner : 1;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return pts;
  }

  function createEngine(host) {
    var canvas = document.createElement('canvas');
    canvas.className = 'trs-canvas';
    var fixed = false;
    try { fixed = window.getComputedStyle(host).position === 'static'; } catch (e) { /* ignore */ }
    if (fixed) canvas.style.position = 'fixed';
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    if (!ctx) { host.removeChild(canvas); return null; }

    var parts = [];
    var W = 0, H = 0, dpr = 1;
    var rafId = 0, running = false, dead = false, last = 0;
    var eng = {
      canvas: canvas,
      onFrame: null,   // optional emitter: fn(dt) -> true while it still wants frames
      onIdle: null,    // called once the loop stops by itself
      width: function () { return W; },
      height: function () { return H; },
      count: function () { return parts.length; },
      add: add,
      start: start,
      destroy: destroy
    };

    function resize() {
      W = fixed ? window.innerWidth : (host.clientWidth || window.innerWidth);
      H = fixed ? window.innerHeight : (host.clientHeight || window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
    }
    function onResize() { if (!dead) resize(); }
    window.addEventListener('resize', onResize);
    resize();

    function add(p) {
      if (dead || parts.length >= MAX_PARTICLES) return;
      p.age = 0;
      parts.push(p);
      start();
    }
    function start() {
      if (running || dead) return;
      running = true;
      last = 0;
      rafId = raf(frame);
    }
    function destroy(removeCanvas) {
      if (dead) return;
      dead = true;
      running = false;
      caf(rafId);
      window.removeEventListener('resize', onResize);
      parts.length = 0;
      if (removeCanvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    function frame(now) {
      if (dead) return;
      if (!isConnected(canvas)) { destroy(false); return; }
      var dt = last ? Math.min((now - last) / 1000, 0.034) : 0.016;
      last = now;
      var wants = false;
      try {
        if (eng.onFrame) wants = eng.onFrame(dt) === true;
        step(dt);
        draw();
      } catch (e) { destroy(true); return; }
      if (parts.length || wants) {
        rafId = raf(frame);
      } else {
        running = false;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (eng.onIdle) eng.onIdle();
      }
    }

    function step(dt) {
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.age += dt;
        if (p.age >= p.life || p.y > H + 40) {
          parts[i] = parts[parts.length - 1];
          parts.pop();
          continue;
        }
        var k = Math.max(0, 1 - p.drag * dt);
        p.vy += p.g * dt;
        p.vx *= k;
        p.vy *= k;
        p.flip += p.vf * dt;
        p.x += (p.vx + Math.sin(p.flip) * p.sway) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
    }

    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var t = p.age / p.life;
        var s, alpha, fy = 1;
        if (p.spark) {               // sparkle: grow then shrink
          s = Math.sin(Math.PI * t) * dpr;
          alpha = 1;
        } else {                     // confetti: fade out at the end, flutter
          s = dpr;
          alpha = t > 0.75 ? (1 - t) / 0.25 : 1;
          if (p.shape < 2) fy = 0.3 + 0.7 * Math.abs(Math.cos(p.flip));
        }
        if (s <= 0 || alpha <= 0) continue;
        var c = Math.cos(p.rot) * s, sn = Math.sin(p.rot) * s;
        ctx.setTransform(c, sn, -sn * fy, c * fy, p.x * dpr, p.y * dpr);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        var z = p.size;
        if (p.shape === 0) {
          ctx.fillRect(-z / 2, -z * 0.3, z, z * 0.6);
        } else if (p.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, z * 0.42, 0, 6.2832);
          ctx.fill();
        } else {
          var pts = p.shape === 2 ? STAR5 : STAR4;
          var R = z * 0.62;
          ctx.beginPath();
          ctx.moveTo(pts[0] * R, pts[1] * R);
          for (var j = 2; j < pts.length; j += 2) ctx.lineTo(pts[j] * R, pts[j + 1] * R);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    return eng;
  }

  // particle factories (shape: 0 rect, 1 circle, 2 five-point star, 3 four-point star)
  function confettiPiece(x, y, vx, vy, sc, life) {
    var r = Math.random();
    var shape = r < 0.45 ? 0 : (r < 0.63 ? 1 : (r < 0.85 ? 2 : 3));
    return {
      x: x, y: y, vx: vx, vy: vy,
      g: 900 * sc, drag: rand(2.2, 3),
      rot: rand(0, 6.28), vr: rand(-7, 7),
      flip: rand(0, 6.28), vf: rand(5, 11), sway: rand(20, 70) * sc,
      size: (shape >= 2 ? rand(11, 17) : rand(8, 13)) * Math.min(sc, 1.25),
      color: pick(COLORS), shape: shape, spark: false,
      life: life || rand(1.5, 2.3)
    };
  }
  function sparkPiece(x, y, vx, vy, sc) {
    return {
      x: x, y: y, vx: vx, vy: vy,
      g: 250 * sc, drag: 2.4,
      rot: rand(0, 1.5), vr: rand(-2, 2),
      flip: 0, vf: 0, sway: 0,
      size: rand(12, 24) * Math.min(sc, 1.25),
      color: pick(SPARK_COLORS), shape: 3, spark: true,
      life: rand(0.5, 0.95)
    };
  }
  function scaleFor(eng) { return clamp(eng.height() / 640, 0.8, 1.5); }

  // upward fan of confetti from (x, y)
  function burstUp(eng, x, y, n, spreadDeg, power) {
    var sc = scaleFor(eng);
    var spread = spreadDeg * Math.PI / 180;
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + rand(-spread, spread) * (0.4 + 0.6 * Math.random());
      var v = rand(520, 1300) * sc * power;
      eng.add(confettiPiece(x + rand(-40, 40) * sc, y + rand(-6, 6), Math.cos(a) * v, Math.sin(a) * v, sc));
    }
  }
  function sparkBurst(eng, x, y, n, speed) {
    var sc = scaleFor(eng);
    for (var i = 0; i < n; i++) {
      var a = rand(0, Math.PI * 2);
      var v = rand(0.35, 1) * speed * sc;
      eng.add(sparkPiece(x, y, Math.cos(a) * v, Math.sin(a) * v - 60 * sc, sc));
    }
  }

  // ---------------------------------------------------------------- play()
  var active = null; // state of the scene currently playing

  function play(container) {
    // finish a previous run (if any) so its promise never hangs
    if (active) { try { active.finish(); } catch (e) { /* ignore */ } }

    return new Promise(function (resolve) {
      var timers = [];
      var engine = null;
      var done = false;
      var state = {
        finish: function () {
          if (done) return;
          done = true;
          for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
          if (active === state) active = null;
          resolve();
        }
      };
      active = state;
      function at(ms, fn) {
        timers.push(setTimeout(function () {
          if (done) return;
          try { fn(); } catch (e) { /* never break the timeline */ }
        }, ms));
      }
      // safety net first: resolve even if building the scene throws
      var safety = setTimeout(state.finish, T_SAFETY);
      timers.push(safety);

      try {
        if (!container) { state.finish(); return; }
        injectStyle();
        while (container.firstChild) container.removeChild(container.firstChild);

        var reduced = reducedMotion();
        var scene = document.createElement('div');
        scene.className = 'trs-scene ' + (reduced ? 'trs-reduced' : 'trs-anim');

        var halo = document.createElement('div');
        halo.className = 'trs-halo';
        scene.appendChild(halo);

        addTwinkles(scene, reduced ? BACKDROP_SPOTS.slice(0, 7) : BACKDROP_SPOTS);

        var stage = document.createElement('div');
        stage.className = 'trs-stage';
        stage.innerHTML = '<div class="trs-rays">' + raysSVG() + '</div>' + chestSVG();
        scene.appendChild(stage);
        container.appendChild(scene);

        if (reduced) {
          // open chest, gentle fade (CSS), a few static sparkles - no particles
          at(T_REDUCED, state.finish);
          return;
        }

        engine = createEngine(scene);
        if (engine) {
          // point inside the chest mouth, in scene coordinates
          var mouth = function (fy) {
            var s = scene.getBoundingClientRect();
            var r = stage.getBoundingClientRect();
            return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height * fy };
          };
          var cap = MAX_PARTICLES;
          at(T_LOCK_SPARK, function () {
            var m = mouth(200 / 330);
            sparkBurst(engine, m.x, m.y, 8, 260);
          });
          at(T_BURST_1, function () {
            var m = mouth(150 / 330);
            sparkBurst(engine, m.x, m.y - 10, Math.round(cap * 0.1), 420);
            burstUp(engine, m.x, m.y, Math.round(cap * 0.45), 62, 1);
          });
          at(T_BURST_2, function () {
            var m = mouth(150 / 330);
            burstUp(engine, m.x, m.y, Math.round(cap * 0.25), 75, 0.85);
            sparkBurst(engine, m.x, m.y - 30, Math.round(cap * 0.06), 520);
          });
          at(T_BURST_3, function () {
            var m = mouth(150 / 330);
            burstUp(engine, m.x, m.y, Math.round(cap * 0.2), 50, 1.05);
            sparkBurst(engine, m.x, m.y - 50, Math.round(cap * 0.06), 600);
          });
        }
        // the scene stays in place; the particle loop stops by itself when empty
        at(T_RESOLVE, state.finish);
      } catch (e) {
        // something went wrong: still let the host continue shortly
        setTimeout(state.finish, 300);
      }
    });
  }

  // ---------------------------------------------------------------- confetti()
  function confetti(container, opts) {
    try {
      if (!container) return;
      injectStyle();
      var duration = opts && typeof opts.duration === 'number' && opts.duration > 0 ? opts.duration : 2500;

      if (reducedMotion()) {
        // very light version: a few static stars that fade in, then disappear
        var layer = document.createElement('div');
        layer.className = 'trs-layer';
        var isStatic = false;
        try { isStatic = window.getComputedStyle(container).position === 'static'; } catch (e) { /* ignore */ }
        if (isStatic) layer.style.position = 'fixed';
        layer.style.animation = 'trs-fade .5s ease-out both';
        var spots = [];
        for (var i = 0; i < 12; i++) spots.push([rand(5, 95), rand(5, 70), rand(10, 20), pick(COLORS), 0]);
        addTwinkles(layer, spots);
        container.appendChild(layer);
        setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, duration);
        return;
      }

      var eng = createEngine(container);
      if (!eng) return;
      var sc = scaleFor(eng);
      var W = eng.width(), H = eng.height();
      var cap = MAX_PARTICLES;

      // 1) two side cannons shooting up and inwards + a few sparkles
      var perSide = Math.round(cap * 0.22);
      for (var s = 0; s < 2; s++) {
        var left = s === 0;
        for (var k = 0; k < perSide; k++) {
          var ang = (left ? -1 : 1) * rand(12, 48) * Math.PI / 180; // from vertical
          var v = rand(650, 1500) * sc;
          eng.add(confettiPiece(left ? -10 : W + 10, H * rand(0.72, 0.9),
            -Math.sin(ang) * v, -Math.cos(ang) * v, sc,
            Math.min(rand(1.5, 2.3), duration / 1000 + 0.2)));
        }
      }
      sparkBurst(eng, W * 0.5, H * 0.3, Math.round(cap * 0.06), 500);

      // 2) rain from the top for most of the duration
      var rainMs = Math.max(300, duration - 900);
      var elapsed = 0;
      var toSpawn = 0;
      var rate = (cap * 0.9) / (rainMs / 1000); // pieces per second
      eng.onFrame = function (dt) {
        elapsed += dt * 1000;
        if (elapsed >= rainMs) return false;
        toSpawn += rate * dt;
        var fall = eng.height() / (320 * sc) + 0.4;
        while (toSpawn >= 1) {
          toSpawn -= 1;
          var remaining = (duration - elapsed) / 1000 + 0.3;
          var life = clamp(Math.min(fall, remaining), 0.6, 3.2);
          if (Math.random() < 0.1) {
            eng.add(sparkPiece(rand(0, eng.width()), rand(0, eng.height() * 0.6), 0, 0, sc));
          } else {
            eng.add(confettiPiece(rand(-10, eng.width() + 10), -15, rand(-60, 60) * sc, rand(120, 380) * sc, sc, life));
          }
        }
        return true;
      };
      eng.onIdle = function () { eng.destroy(true); };
      eng.start();
      // hard stop, whatever happens
      setTimeout(function () { eng.destroy(true); }, duration + 1500);
    } catch (e) { /* decorative only - never throw into the host */ }
  }

  window.Treasure = { play: play, confetti: confetti };
})();
