/* ===== ערב חדרים שמיניתשפז - לוגיקת צד לקוח =====
   הקוד הנכון והודעת ההצלחה נמצאים בשרת בלבד. */
(function () {
  "use strict";

  // ---------- קבועים ----------
  var API_URL = (window.APP_CONFIG && typeof window.APP_CONFIG.API_URL === "string")
    ? window.APP_CONFIG.API_URL.trim() : "";
  var TIMEOUT_MS = 30000;
  var ANIM_MAX_MS = 9000; // רשת ביטחון אם האנימציה לא מסתיימת
  var KEY_TOKEN = "er_token", KEY_MESSAGE = "er_message", KEY_SENT = "er_sent";

  var TXT = {
    notConnected: "האפליקציה עדיין לא מחוברת לשרת ⚙️",
    wrong: "אופסס, זה לא הקוד הנכון... נסו שוב!💪🏼",
    fillAll: "צריך למלא את כל חמש התיבות 🙂",
    checking: "בודק... ✨",
    sending: "שולח... ✨",
    network: "אין תשובה מהשרת 😕 בדקו את החיבור לאינטרנט ונסו שוב",
    serverError: "משהו השתבש בשרת 😕 נסו שוב בעוד רגע",
    roomEmpty: "כתבו את מספר החדר 🙂",
    sendFailed: "השליחה לא הצליחה 😕 בדקו את החיבור ונסו שוב",
    tokenExpired: "פג התוקף 🙈 רעננו את הדף והזינו שוב את הקוד",
    refresh: "רענון הדף 🔄"
  };

  // ---------- אלמנטים ----------
  function $(id) { return document.getElementById(id); }
  var screenCode = $("screen-code"), screenAnim = $("screen-anim"), screenSuccess = $("screen-success");
  var fxLayer = $("fx-layer");
  var codeForm = $("code-form"), codeRow = $("code-row"), btnOpen = $("btn-open"), codeMsg = $("code-msg");
  var configNotice = $("config-notice");
  var codeInputs = Array.prototype.slice.call(document.querySelectorAll(".code-input"));
  var successTitle = $("success-title"), successBody = $("success-body");
  var roomForm = $("room-form"), roomFormWrap = $("room-form-wrap"), roomInput = $("room-input");
  var btnSend = $("btn-send"), roomMsg = $("room-msg"), roomSent = $("room-sent");

  var btnOpenText = btnOpen.textContent, btnSendText = btnSend.textContent;
  var busy = false;

  // ---------- sessionStorage (עטוף, למקרה שחסום) ----------
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* מתעלמים */ } },
    clear: function () {
      try { [KEY_TOKEN, KEY_MESSAGE, KEY_SENT].forEach(function (k) { sessionStorage.removeItem(k); }); }
      catch (e) { /* מתעלמים */ }
    }
  };
  var token = null; // נשמר גם בזיכרון, למקרה ש-sessionStorage לא זמין

  // ---------- עזרים ----------
  function showScreen(el) {
    [screenCode, screenAnim, screenSuccess].forEach(function (s) { s.hidden = (s !== el); });
    window.scrollTo(0, 0);
  }

  function setMsg(el, text, kind) {
    el.className = "msg" + (kind ? " msg--" + kind : "");
    el.textContent = "";
    // ריקון ומילוי מחדש - כדי שקורא מסך יכריז גם על הודעה חוזרת
    // setTimeout ולא requestAnimationFrame: כך ההודעה מופיעה גם כשהלשונית ברקע
    setTimeout(function () { el.textContent = text || ""; }, 30);
  }

  function setBusy(btn, isBusy, text) {
    busy = isBusy;
    btn.disabled = isBusy;
    btn.setAttribute("aria-busy", isBusy ? "true" : "false");
    btn.textContent = text;
  }

  function digitsOnly(input, max) {
    var clean = input.value.replace(/\D+/g, "").slice(0, max);
    if (clean !== input.value) input.value = clean;
  }

  function confetti(ms) {
    if (window.Treasure && typeof window.Treasure.confetti === "function") {
      try { window.Treasure.confetti(fxLayer, { duration: ms }); } catch (e) { /* קישוט בלבד */ }
    }
  }

  // קריאה לשרת: text/plain כדי להימנע מ-preflight של CORS
  function api(payload) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: ctrl.signal
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      clearTimeout(timer);
      if (!data || typeof data !== "object") throw new Error("bad response");
      return data;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  // ---------- מסך הקוד ----------
  function focusBox(i) {
    var el = codeInputs[i];
    if (!el) return;
    el.focus();
    try { el.select(); } catch (e) { /* לא קריטי */ }
  }

  function shakeBoxes() {
    codeRow.classList.remove("shake");
    void codeRow.offsetWidth; // מאפס את האנימציה
    codeRow.classList.add("shake");
  }
  codeRow.addEventListener("animationend", function (e) {
    if (e.target === codeRow) codeRow.classList.remove("shake");
  });

  codeInputs.forEach(function (input, i) {
    var last = i === codeInputs.length - 1;

    input.addEventListener("input", function () {
      digitsOnly(input, 2);
      input.classList.remove("is-empty-hint");
      // מעבר אוטומטי רק אחרי שתי ספרות (מספר יכול להיות חד או דו-ספרתי)
      if (input.value.length === 2 && !last) focusBox(i + 1);
    });

    // בחירת כל התוכן במיקוד ובהקשה, כדי שהקלדה תחליף את המספר הקיים
    // setTimeout: ב-iOS בחירה מיידית בתוך האירוע לא תמיד נתפסת
    function selectAll() {
      setTimeout(function () {
        try { input.setSelectionRange(0, input.value.length); } catch (e) { /* לא קריטי */ }
      }, 0);
    }
    input.addEventListener("focus", selectAll);
    input.addEventListener("click", selectAll);

    // תיבה מלאה (שתי ספרות) בלי בחירה: ספרה חדשה מחליפה את התוכן במקום להיחסם
    input.addEventListener("beforeinput", function (e) {
      if (e.isComposing || e.inputType !== "insertText") return;
      if (!/^[0-9]$/.test(e.data || "")) return;
      if (input.value.length >= 2 && input.selectionStart === input.selectionEnd) {
        e.preventDefault();
        input.value = e.data;
        input.classList.remove("is-empty-hint");
      }
    });

    input.addEventListener("keydown", function (e) {
      if (e.isComposing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (last) submitCode(); else focusBox(i + 1);
      } else if (e.key === "Backspace" && input.value === "") {
        if (i > 0) { e.preventDefault(); focusBox(i - 1); }
      } else if (e.key === "ArrowLeft") {       // RTL: שמאלה = הבא
        if (!last) { e.preventDefault(); focusBox(i + 1); }
      } else if (e.key === "ArrowRight") {      // RTL: ימינה = הקודם
        if (i > 0) { e.preventDefault(); focusBox(i - 1); }
      }
    });
  });

  codeForm.addEventListener("submit", function (e) {
    e.preventDefault();
    submitCode();
  });

  function submitCode() {
    if (busy) return;

    if (!API_URL) {
      setMsg(codeMsg, TXT.notConnected, "error");
      return;
    }

    // כל התיבות מלאות?
    var firstEmpty = -1;
    codeInputs.forEach(function (input, i) {
      digitsOnly(input, 2);
      var empty = input.value === "";
      input.classList.toggle("is-empty-hint", empty);
      if (empty && firstEmpty < 0) firstEmpty = i;
    });
    if (firstEmpty >= 0) {
      setMsg(codeMsg, TXT.fillAll, "hint");
      focusBox(firstEmpty);
      return;
    }

    var code = codeInputs.map(function (input) { return parseInt(input.value, 10); });

    setBusy(btnOpen, true, TXT.checking);
    setMsg(codeMsg, "", "");

    api({ action: "check", code: code }).then(function (data) {
      if (data.ok === true && typeof data.token === "string" && data.token &&
          typeof data.message === "string") {
        token = data.token;
        store.set(KEY_TOKEN, data.token);
        store.set(KEY_MESSAGE, data.message);
        setBusy(btnOpen, false, btnOpenText);
        return openTreasure(data.message);
      }
      setBusy(btnOpen, false, btnOpenText);
      if (data.ok === false && data.error === "wrong") {
        setMsg(codeMsg, TXT.wrong, "error");
        shakeBoxes();
        focusBox(0);
      } else {
        setMsg(codeMsg, TXT.serverError, "error");
      }
    }).catch(function () {
      setBusy(btnOpen, false, btnOpenText);
      setMsg(codeMsg, TXT.network, "error");
    });
  }

  // ---------- אנימציית התיבה ----------
  function openTreasure(message) {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

    var done = Promise.resolve();
    if (window.Treasure && typeof window.Treasure.play === "function") {
      showScreen(screenAnim);
      try {
        done = Promise.race([
          Promise.resolve(window.Treasure.play(screenAnim)),
          new Promise(function (resolve) { setTimeout(resolve, ANIM_MAX_MS); })
        ]).catch(function () { /* ממשיכים להצלחה גם אם האנימציה נכשלה */ });
      } catch (e) {
        done = Promise.resolve();
      }
    }
    return done.then(function () {
      showSuccess(message, false);
      confetti(2500);
    });
  }

  // ---------- מסך ההצלחה ----------
  function showSuccess(message, alreadySent) {
    // השורה הראשונה - הגדולה ביותר; השאר עם שבירות שורה כפי שהגיעו מהשרת
    var text = String(message).replace(/\r\n?/g, "\n");
    var nl = text.indexOf("\n");
    successTitle.textContent = nl < 0 ? text : text.slice(0, nl);
    successBody.textContent = nl < 0 ? "" : text.slice(nl + 1).replace(/^\n+/, "");

    roomFormWrap.hidden = !!alreadySent;
    roomSent.hidden = !alreadySent;
    showScreen(screenSuccess);
  }

  roomInput.addEventListener("input", function () { digitsOnly(roomInput, 3); });

  roomForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;

    digitsOnly(roomInput, 3);
    var room = roomInput.value;
    if (!room) {
      setMsg(roomMsg, TXT.roomEmpty, "hint");
      roomInput.focus();
      return;
    }
    if (!API_URL) {
      setMsg(roomMsg, TXT.notConnected, "error");
      return;
    }

    setBusy(btnSend, true, TXT.sending);
    setMsg(roomMsg, "", "");

    api({ action: "submit", token: token || store.get(KEY_TOKEN) || "", room: room }).then(function (data) {
      setBusy(btnSend, false, btnSendText);
      if (data.ok === true) {
        store.set(KEY_SENT, "1");
        roomFormWrap.hidden = true;
        roomSent.hidden = false;
        confetti(1500);
      } else if (data.error === "token") {
        tokenExpired();
      } else {
        setMsg(roomMsg, TXT.sendFailed, "error");
      }
    }).catch(function () {
      setBusy(btnSend, false, btnSendText);
      setMsg(roomMsg, TXT.sendFailed, "error");
    });
  });

  // טוקן לא תקף: מנקים את השמור ומציעים רענון (חוזר למסך הקוד)
  function tokenExpired() {
    token = null;
    store.clear();
    roomMsg.className = "msg msg--error";
    roomMsg.textContent = TXT.tokenExpired;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "link-btn";
    b.textContent = TXT.refresh;
    b.addEventListener("click", function () { window.location.reload(); });
    roomMsg.appendChild(document.createElement("br"));
    roomMsg.appendChild(b);
    btnSend.disabled = true;
  }

  // ---------- תמונות חסרות: מסתירים בעדינות ----------
  function hideIfBroken(img, holder) {
    if (!img || !holder) return;
    function hide() { holder.classList.add("is-missing"); }
    img.addEventListener("error", hide);
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) hide();
  }
  hideIfBroken($("class-photo"), $("photo-frame"));
  hideIfBroken($("class-logo"), $("logo-badge"));
  var smallLogo = document.querySelector(".logo-badge--small .logo-img");
  if (smallLogo) hideIfBroken(smallLogo, smallLogo.parentNode);

  // ---------- אתחול ----------
  function init() {
    if (!API_URL) configNotice.hidden = false;

    var savedToken = store.get(KEY_TOKEN), savedMessage = store.get(KEY_MESSAGE);
    if (savedToken && savedMessage) {
      // כבר פיצחו את הקוד בלשונית הזו - ישר למסך ההצלחה, בלי אנימציה
      token = savedToken;
      showSuccess(savedMessage, store.get(KEY_SENT) === "1");
    } else {
      showScreen(screenCode);
    }
  }
  init();
})();
