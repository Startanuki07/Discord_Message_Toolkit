// ==UserScript==
// @name         Discord Message Toolkit
// @name:zh-TW   Discord 訊息工具箱
// @name:zh-CN   Discord 消息工具箱
// @name:ja      Discord メッセージツールキット
// @name:ko      Discord 메시지 툴킷
// @name:es      Discord Message Toolkit
// @name:pt-BR   Discord Message Toolkit
// @name:fr      Discord Message Toolkit
// @name:ru      Discord Message Toolkit
// @namespace    https://greasyfork.org/en/users/1575945-star-tanuki07
// @version      2.5.2.3
// @license      MIT
// @author       Star_tanuki07
// @description      Adds a per-message toolbar for copying, media downloading, and social media URL conversion, plus an enhanced forwarding panel, sidebar channel shortcuts (Wormhole), and an expression collection manager.
// @description:zh-TW 為每則訊息新增工具列，支援文字複製、媒體下載與社群連結轉換，並提供強化轉發面板、側欄頻道捷徑（蟲洞）與表情收藏管理器。
// @description:zh-CN 为每条消息添加工具栏，支持文字复制、媒体下载与社交链接转换，并提供强化转发面板、侧栏频道快捷方式（虫洞）与表情收藏管理器。
// @description:ja    メッセージごとにツールバーを追加。テキストコピー・メディアダウンロード・SNSリンク変換に対応し、強化された転送パネル・サイドバーチャンネルショートカット（ワームホール）・スタンプ管理機能も搭載。
// @description:ko    메시지마다 툴바를 추가하여 텍스트 복사, 미디어 다운로드, SNS 링크 변환을 지원하며, 강화된 전달 패널, 사이드바 채널 단축키(웜홀), 이모지 컬렉션 관리 기능도 제공합니다。
// @description:es    Añade una barra de herramientas por mensaje para copiar, descargar medios y convertir URLs, además de un panel de reenvío mejorado, atajos de canal en la barra lateral (Agujero de gusano) y un gestor de colecciones de expresiones.
// @description:pt-BR Adiciona uma barra de ferramentas por mensagem para copiar, baixar mídias e converter URLs, além de um painel de encaminhamento aprimorado, atalhos de canal na barra lateral (Buraco de minhoca) e um gerenciador de coleções de expressões.
// @description:fr    Ajoute une barre d'outils par message pour copier, télécharger des médias et convertir des URL, ainsi qu'un panneau de transfert amélioré, des raccourcis de salon dans la barre latérale (Trou de ver) et un gestionnaire de collections d'expressions.
// @description:de    Fügt eine Symbolleiste pro Nachricht zum Kopieren, Herunterladen von Medien und Konvertieren von URLs hinzu, sowie ein verbessertes Weiterleitungspanel, Kanal-Shortcuts in der Seitenleiste (Wurmloch) und einen Ausdrucks-Sammlungsmanager.
// @description:ru    Добавляет панель инструментов для каждого сообщения для копирования, загрузки медиа и конвертации URL, а также улучшенную панель переадресации, ярлыки каналов на боковой панели (Червоточина) и менеджер коллекций выражений.
// @match       https://discord.com/*
// @match       https://ptb.discord.com/*
// @icon        https://www.google.com/s2/favicons?sz=64&domain=discord.com
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_deleteValue
// @grant       GM_listValues
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// @grant       GM_setClipboard
// @grant       GM_xmlhttpRequest
// @grant       GM_info
// @grant       unsafeWindow
// @connect     discord.com
// @connect     cdn.discordapp.com
// @connect     media.discordapp.net
// @connect     fixcdn.hyonsu.com
// ==/UserScript==


// ┌─────────────────────────────────────────────────────────────
// │  架構速覽 — Discord Message Toolkit
// │
// │  模組清單：
// │    §Core 🔧 共享核心          [State+Util]  → GMStore / ConfigManager / CleanupRegistry / i18n   L61
// │    A    📋 Forwarding Manager [UI+State]    → initForwardingManager()                            L4457
// │    B    ⠿  Message Utility    [UI+DOM]      → initMessageUtility()                               L5572
// │    C    😀 Emoji/GIF Manager  [UI+Storage]  → initEmojiSearchHelper()                            L10220
// │    D    🌀 Wormhole           [UI+Network]  → new WormholeModule().initialize()                  L14020
// │    E    📌 Header Mods        [DOM+Event]   → initHeaderMods()                                   L13607
// │    F    🔗 Webhook Manager    [UI+Network]  → initWebhookManager()  (預設關閉)                   L13074
// │    G    🔍 URL Checker        [DOM+State]   → initURLChecker()                                   L18694
// │    H    🌫️  Blacklist         [DOM+Storage] → initBlacklist()                                    L18698
// │
// │  共享核心（IIFE 頂層）：
// │    GMStore · ConfigManager · MODULE_DEFS · escHtml · CleanupRegistry ·
// │    dmtShowToast · dmtConfirm · i18n(t) · isModEnabled · setModEnabled
// │
// │  啟動順序：D(Wormhole) → initModules[]（A B C E F G H）（見 L21932）
// │    注意：Channel Scout（mod_scout）嵌套在 initURLChecker 內部，
// │          依賴 URLChecker 的 MutationObserver，關閉 G 時 Scout 亦失效。
// │
// │  取捨（Why NOT）：
// │    · Scout 未抽出為獨立模組：依賴 URLChecker 的 observer 基礎設施，拆分需共用層重構
// │    · 不用 MutationObserver 統一層：各模組生命週期差異大，各自管理更易維護
// └─────────────────────────────────────────────────────────────


(function () {
  "use strict";

  // ── 全域 Debug 旗標：false = 靜音熱路徑 log，true = 開發模式 ──
  const DEBUG = GM_getValue("debugModeEnabled", false);
  // 搜尋 debounce 計時器由各模組內部的 Map 自行管理（如 initForwardingManager 內的 searchTimers Map）
  // 此處無需頂層 WeakMap，beforeunload 清理由各模組負責

  // ── CSP 相容性檢查 ──
  if (!window.unsafeWindow) {
    console.warn(
      "[Discord Utilities] unsafeWindow unavailable - Content Security Policy may block some features"
    );
  }

  // =========================================================================================
  // 共享核心 §0 ── 腳本常數 & 預設設定 (Script Constants & Default Config)
  // =========================================================================================
  const SCRIPT_NAME = GM_info?.script?.name || "Discord Integrated Utilities";
  const SCRIPT_VERSION = "2.5.0.0";

  // =========================================================================================
  // 共享核心 §0-B ── GMStore · GM storage 集中存取層 (v1.6.7 ⑦)
  // 統一 GM_getValue / GM_setValue 的 JSON 序列化、型別 fallback 與 DEBUG 紀錄
  // =========================================================================================
  const GMStore = {
    /**
     * 讀取 GM storage。
     * @param {string}  key          GM storage key
     * @param {*}       defaultVal   找不到或解析失敗時的回傳值
     * @param {boolean} [json=false] true → JSON.parse；false → 回傳原始字串
     */
    get(key, defaultVal, json = false) {
      try {
        const raw = GM_getValue(key, undefined);
        if (raw === undefined || raw === null) return defaultVal;
        if (!json) return raw;
        const parsed = JSON.parse(raw);
        return parsed ?? defaultVal;
      } catch (e) {
        DEBUG && console.warn(`[GMStore.get] key="${key}" 解析失敗，回傳預設值`, e);
        return defaultVal;
      }
    },

    /**
     * 寫入 GM storage。
     * @param {string}  key
     * @param {*}       value
     * @param {boolean} [json=false] true → JSON.stringify
     */
    set(key, value, json = false) {
      try {
        GM_setValue(key, json ? JSON.stringify(value) : value);
      } catch (e) {
        DEBUG && console.warn(`[GMStore.set] key="${key}" 寫入失敗`, e);
      }
    },

    /**
     * 刪除 GM storage key。
     */
    del(key) {
      try {
        GM_deleteValue(key);
      } catch (e) {
        DEBUG && console.warn(`[GMStore.del] key="${key}" 刪除失敗`, e);
      }
    },
  };

  // =========================================================================================
  // 共享核心 §10 ── New Badge 機制
  // 版本-功能對應表：key = storageKey，value = 引入版本
  // =========================================================================================
  const NEW_FEATURES = {
    "mod_webhook":    "1.6.0",
    "mod_urlchecker": "1.8.0",
    "mod_scout":      "2.2.9",
    "mod_blacklist":  "2.2.9",
  };

  function isFeatureNew(featureKey) {
    if (!(featureKey in NEW_FEATURES)) return false;
    const seen = GMStore.get("newFeatureSeen_" + featureKey, null);
    return seen !== NEW_FEATURES[featureKey];
  }

  function markFeatureSeen(featureKey) {
    if (!(featureKey in NEW_FEATURES)) return;
    GMStore.set("newFeatureSeen_" + featureKey, NEW_FEATURES[featureKey]);
  }

  function renderNewBadge(featureKey) {
    if (!isFeatureNew(featureKey)) return null;
    const badge = document.createElement("span");
    badge.className = "dmt-new-badge";
    badge.textContent = "New";
    badge.style.cssText = [
      "display:inline-block",
      "margin-left:6px",
      "padding:1px 5px",
      "border-radius:3px",
      "background:#23a55a",
      "color:#fff",
      "font-size:10px",
      "font-weight:700",
      "vertical-align:middle",
      "line-height:1.5",
      "pointer-events:none",
    ].join(";");
    return badge;
  }

  // =========================================================================================
  // 共享核心 §1 ── 配置管理器 (ConfigManager / localStorage Proxy)
  // =========================================================================================

  // 基於 Proxy 的配置管理器，自動同步 localStorage
  const ConfigManager = {
    _cache: null,
    _defaults: {
      lang: null,
      triggerMode: "hover",
      symbols: ["𓈒𓂂𓏸"], // 恢復預設符號
      menuStyle: "general",
      swapLogic: false,
      appendSpace: false,
      appendNewLine: false,
      linkText: "text",
    },

    // 取得配置物件 (帶緩存)
    get config() {
      if (!this._cache) {
        this._cache = new Proxy(
          {},
          {
            get: (target, prop) => {
              if (prop === "symbols") {
                try {
                  return (
                    JSON.parse(localStorage.getItem("copySymbols")) ||
                    this._defaults.symbols
                  );
                } catch (e) {
                  DEBUG && console.warn("[ConfigManager] 解析 copySymbols 失敗，回退預設值", e);
                  return this._defaults.symbols;
                }
              }

              const storageKey = this._getStorageKey(prop);
              const stored = localStorage.getItem(storageKey);

              if (stored === "true") return true;
              if (stored === "false") return false;
              if (stored !== null) return stored;

              return this._defaults[prop];
            },

            set: (target, prop, value) => {
              const storageKey = this._getStorageKey(prop);

              if (prop === "symbols") {
                localStorage.setItem("copySymbols", JSON.stringify(value));
              } else {
                localStorage.setItem(storageKey, String(value));
              }

              // 清除緩存強制重新讀取
              this._cache = null;
              return true;
            },
          },
        );
      }
      return this._cache;
    },

    // 精準清除緩存 (用於外部修改 localStorage)
    invalidate() {
      this._cache = null;
    },

    _getStorageKey(prop) {
      const keyMap = {
        lang: "copyMenuLanguage",
        triggerMode: "copyTriggerMode",
        menuStyle: "copyMenuStyle",
        swapLogic: "copySwapLogic",
        appendSpace: "copyAppendSpace",
        appendNewLine: "copyAppendNewLine",
        linkText: "copyLinkText",
        // 模組開關（預設全開）
        modForwarding: "mod_forwarding",
        modMessage: "mod_message",
        modEmoji: "mod_emoji",
        modHeader: "mod_header",
        modWormhole: "mod_wormhole",
        modUrlChecker: "mod_urlchecker",
        modScout: "mod_scout",
        modBlacklist: "mod_blacklist",
      };
      return keyMap[prop] || prop;
    },
  };

  // ── 共享核心 §1-1 ── 模組開關讀寫（預設全部啟用）─────────────────────
  const MODULE_DEFS = [
    {
      key: "modMessage",
      storageKey: "mod_message",
      icon: "⠿",
      warn: true,
      tip: "mod_tip_message",
      label: {
        "en-US": "Message Utility (⠿)",
        "zh-TW": "訊息工具 (⠿)",
        "zh-CN": "消息工具 (⠿)",
        ja: "メッセージユーティリティ (⠿)",
        ko: "메시지 유틸리티 (⠿)",
      },
    },
    {
      key: "modForwarding",
      storageKey: "mod_forwarding",
      icon: "📋",
      tip: "mod_tip_forwarding",
      label: {
        "en-US": "Forwarding Manager",
        "zh-TW": "轉發管理員",
        "zh-CN": "转发管理员",
        ja: "転送マネージャー",
        ko: "전달 관리자",
      },
    },
    {
      key: "modEmoji",
      storageKey: "mod_emoji",
      icon: "😀",
      tip: "mod_tip_emoji",
      label: {
        "en-US": "Emoji Search Helper",
        "zh-TW": "表情搜尋輔助",
        "zh-CN": "表情搜索助手",
        ja: "絵文字検索",
        ko: "이모지 검색",
      },
    },
    {
      key: "modHeader",
      storageKey: "mod_header",
      icon: "📌",
      tip: "mod_tip_header",
      label: {
        "en-US": "Anti-Hijack & File Tools",
        "zh-TW": "右鍵解鎖",
        "zh-CN": "右键解锁",
        ja: "右クリック解除",
        ko: "우클릭 해제",
      },
    },
    {
      key: "modWormhole",
      storageKey: "mod_wormhole",
      icon: "🌀",
      tip: "mod_tip_wormhole",
      label: {
        "en-US": "Wormhole",
        "zh-TW": "蟲洞",
        "zh-CN": "虫洞",
        ja: "ワームホール",
        ko: "웜홀",
      },
    },
    {
      key: "modWebhook",
      storageKey: "mod_webhook",
      icon: "🔗",
      defaultEnabled: false,
      tip: "mod_tip_webhook",
      label: {
        "en-US": "Webhook Manager",
        "zh-TW": "Webhook 管理",
        "zh-CN": "Webhook 管理",
        ja: "Webhook 管理",
        ko: "Webhook 관리",
      },
    },
    {
      key: "modUrlChecker",
      storageKey: "mod_urlchecker",
      icon: "🔍",
      defaultEnabled: true,
      tip: "mod_tip_urlchecker",
      label: {
        "en-US": "Duplicate URL Checker",
        "zh-TW": "重複網址偵測",
        "zh-CN": "重复网址检测",
        ja: "URL重複チェッカー",
        ko: "중복 URL 검사기",
      },
    },
    {
      key: "modScout",
      storageKey: "mod_scout",
      icon: "🔎",
      defaultEnabled: true,
      tip: "mod_tip_scout",
      label: {
        "en-US": "Channel Scout (Search)",
        "zh-TW": "頻道搜尋 Channel Scout",
        "zh-CN": "频道搜索 Channel Scout",
        ja: "チャンネル検索 Channel Scout",
        ko: "채널 검색 Channel Scout",
      },
    },
    {
      key: "modBlacklist",
      storageKey: "mod_blacklist",
      icon: "🌫️",
      defaultEnabled: true,
      tip: "mod_tip_blacklist",
      label: {
        "en-US": "Mute User Messages",
        "zh-TW": "弱化使用者訊息",
        "zh-CN": "弱化用户消息",
        ja: "ユーザーメッセージを弱化",
        ko: "사용자 메시지 약화",
      },
    },
  ];
  function isModEnabled(storageKey) {
    const val = localStorage.getItem(storageKey);
    if (val !== null) return val !== "false";
    // MODULE_DEFS で defaultEnabled: false と宣言されているものはデフォルト無効
    const def = MODULE_DEFS.find((m) => m.storageKey === storageKey);
    return def?.defaultEnabled === false ? false : true;
  }
  function setModEnabled(storageKey, enabled) {
    localStorage.setItem(storageKey, String(enabled));
  }

  // 全域取得配置的唯一入口
  function getConfig() {
    return ConfigManager.config;
  }

  // =========================================================================================
  // 共享核心 §1-2 ── HTML Escape 工具（防 XSS 輔助）
  // 用途：所有將用戶資料插入 innerHTML 之前必須通過此函式
  // =========================================================================================
  const _escMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => _escMap[c]);
  }

  // =========================================================================================
  // 共享核心 §1-3 ── CleanupRegistry · 集中清理管理器 (v1.7.0)
  // 用途：各模組將自己的 beforeunload 清理函式注冊至此，
  //       頂層統一在 beforeunload 一次性執行，避免孤立監聽器散落。
  // 使用：CleanupRegistry.add(() => observer.disconnect());
  // =========================================================================================
  const CleanupRegistry = (() => {
    const _fns = [];
    const registry = {
      /**
       * 注冊一個清理函式，頁面卸載時自動執行。
       * @param {Function} fn 清理函式
       */
      add(fn) {
        if (typeof fn === "function") _fns.push(fn);
      },
      /** 手動觸發全部清理（通常由 beforeunload 自動呼叫）。 */
      runAll() {
        _fns.forEach((fn) => {
          try { fn(); } catch (e) {
            DEBUG && console.warn("[CleanupRegistry] cleanup error:", e);
          }
        });
        _fns.length = 0;
      },
    };
    window.addEventListener("beforeunload", () => registry.runAll(), { once: true });
    return registry;
  })();

  // =========================================================================================
  // 共享核心 §1-4 ── dmtShowToast · 統一 Toast 通知 (v1.7.0)
  // 整合原 showToast（模組B）、showEmojiToast（模組C）、_showToast（模組F）三套實作。
  // 各模組的原函式改為轉發呼叫此函式，保持呼叫端零修改。
  //
  // @param {string}   message           顯示文字
  // @param {object}   [opts]            選項
  // @param {number}   [opts.duration]   顯示毫秒數（預設 2200）
  // @param {Function} [opts.onClick]    點擊回呼（有值時顯示 ↗，pointer-events:auto）
  // @param {string}   [opts.icon]       圖示 URL 或 emoji 字串（顯示在文字左側）
  // =========================================================================================
  // v1.8.1：Toast 堆疊通知欄
  // 每次呼叫生成獨立 toast 項目，從右下角依序堆疊，各自計時消失。
  // 舊的單一 #dmt-toast-singleton 改為 #dmt-toast-stack 容器。
  function dmtShowToast(message, opts = {}) {
    const { duration = 2200, onClick = null, icon = null } = opts;

    // 注入 CSS（只注入一次）
    if (!document.getElementById("dmt-toast-style")) {
      const s = document.createElement("style");
      s.id = "dmt-toast-style";
      s.textContent = `
        /* ── Toast 堆疊容器：水平置中、垂直偏下，由上往下疊 ── */
        #dmt-toast-stack {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2147483647;
          display: flex;
          flex-direction: column;
          gap: 8px;
          pointer-events: none;
          width: max-content;
          max-width: min(480px, 88vw);
          align-items: center;
        }
        /* ── 單筆 Toast：高對比配色，不融入 Discord 背景 ── */
        .dmt-toast {
          background: #1a1b1e;
          color: #f2f3f5;
          padding: 10px 18px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 500;
          font-family: sans-serif;
          box-shadow: 0 6px 24px rgba(0,0,0,0.75), 0 0 0 1.5px rgba(255,255,255,0.12);
          border: none;
          display: flex;
          align-items: center;
          gap: 9px;
          pointer-events: none;
          opacity: 0;
          transform: translateY(6px) scale(0.97);
          transition: opacity 0.2s ease, transform 0.2s ease;
          white-space: nowrap;
          max-width: 100%;
        }
        .dmt-toast.dmt-toast-show {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .dmt-toast.dmt-toast-out {
          opacity: 0;
          transform: translateY(4px) scale(0.97);
        }
        .dmt-toast.dmt-toast-clickable {
          pointer-events: auto;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .dmt-toast.dmt-toast-clickable:hover {
          background: #2c2d32;
        }
        .dmt-toast-icon-img {
          width: 20px;
          height: 20px;
          object-fit: contain;
          border-radius: 3px;
          flex-shrink: 0;
        }
        .dmt-toast-icon-emoji {
          font-size: 18px;
          flex-shrink: 0;
          line-height: 1;
        }
      `;
      document.head.appendChild(s);
    }

    // 確保堆疊容器存在
    let stack = document.getElementById("dmt-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "dmt-toast-stack";
      document.body.appendChild(stack);
    }

    // 建立新的 toast 項目
    const toast = document.createElement("div");
    toast.className = "dmt-toast";

    // 圖示
    if (icon) {
      if (typeof icon === "string" && icon.startsWith("http")) {
        const img = document.createElement("img");
        img.src = icon;
        img.className = "dmt-toast-icon-img";
        img.alt = "";
        toast.appendChild(img);
      } else {
        const sp = document.createElement("span");
        sp.className = "dmt-toast-icon-emoji";
        sp.textContent = icon;
        toast.appendChild(sp);
      }
    }

    // 文字
    const textSpan = document.createElement("span");
    textSpan.textContent = message + (onClick ? " ↗" : "");
    toast.appendChild(textSpan);

    // 點擊回呼
    const isClickable = typeof onClick === "function";
    if (isClickable) {
      toast.classList.add("dmt-toast-clickable");
      toast.onclick = (e) => { e.stopPropagation(); onClick(); dismiss(); };
    }

    stack.appendChild(toast);

    // 限制最多同時顯示 5 筆，移除最舊的
    const MAX_STACK = 5;
    const items = stack.querySelectorAll(".dmt-toast");
    if (items.length > MAX_STACK) {
      items[0].remove();
    }

    // 淡入
    void toast.offsetWidth;
    toast.classList.add("dmt-toast-show");

    // 淡出並移除
    const dismiss = () => {
      toast.classList.add("dmt-toast-out");
      toast.classList.remove("dmt-toast-show");
      setTimeout(() => toast.remove(), 230);
    };
    let dismissTimer = setTimeout(dismiss, duration);

    // 滑鼠懸停時暫停消失計時
    toast.addEventListener("mouseenter", () => clearTimeout(dismissTimer));
    toast.addEventListener("mouseleave", () => { dismissTimer = setTimeout(dismiss, 800); });
  }

  // =========================================================================================
  // 共享核心 §1-5 ── dmtConfirm() · 非阻塞確認 Dialog (v1.8.0)
  // 取代所有 window.confirm()，避免凍結瀏覽器主執行緒。
  // 回傳 Promise<boolean>，呼叫端改用 async/await 或 .then()。
  //
  // @param {string} message   顯示給使用者的確認文字
  // @param {object} [opts]
  // @param {string} [opts.confirmText]  確認按鈕文字（預設 "OK"）
  // @param {string} [opts.cancelText]   取消按鈕文字（預設 "Cancel"）
  // @param {boolean} [opts.danger]      true → 確認按鈕顯示危險色
  // =========================================================================================
  function dmtConfirm(message, opts = {}) {
    return new Promise((resolve) => {
      // 注入樣式（只注入一次）
      if (!document.getElementById("dmt-confirm-style")) {
        const s = document.createElement("style");
        s.id = "dmt-confirm-style";
        s.textContent = `
          .dmt-confirm-overlay {
            position: fixed; inset: 0; z-index: 2147483647;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            animation: dmt-cfm-in 0.15s ease;
          }
          @keyframes dmt-cfm-in {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          .dmt-confirm-box {
            background: var(--dmt-bg-primary, #2b2d31);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 22px 24px 18px;
            max-width: min(420px, 90vw);
            width: 100%;
            color: var(--dmt-text-primary, #dcddde);
            font-family: sans-serif;
            font-size: 14px;
            line-height: 1.55;
            box-shadow: 0 16px 48px rgba(0,0,0,0.7);
            animation: dmt-cfm-slide 0.18s cubic-bezier(.19,1,.22,1);
          }
          @keyframes dmt-cfm-slide {
            from { opacity: 0; transform: translateY(10px) scale(.97); }
            to   { opacity: 1; transform: none; }
          }
          .dmt-confirm-msg {
            white-space: pre-wrap;
            margin-bottom: 18px;
          }
          .dmt-confirm-btns {
            display: flex; justify-content: flex-end; gap: 8px;
          }
          .dmt-confirm-btn {
            padding: 7px 18px; border-radius: 6px;
            font-size: 13px; font-weight: 500; cursor: pointer;
            border: none; transition: background 0.15s, color 0.15s;
          }
          .dmt-confirm-btn-cancel {
            background: transparent;
            border: 1px solid rgba(255,255,255,0.15);
            color: var(--dmt-text-primary, #dcddde);
          }
          .dmt-confirm-btn-cancel:hover {
            background: rgba(255,255,255,0.07);
          }
          .dmt-confirm-btn-ok {
            background: var(--dmt-accent, #5865f2);
            color: #fff;
          }
          .dmt-confirm-btn-ok:hover {
            filter: brightness(1.12);
          }
          .dmt-confirm-btn-ok.danger {
            background: var(--dmt-danger, #ed4245);
          }
        `;
        document.head.appendChild(s);
      }

      const lang = (typeof getConfig === "function" ? getConfig().lang : null)
        || navigator.language || "en";
      const defaultOK = { "zh-TW": "確認", "zh-CN": "确认", ja: "OK", ko: "확인" }[lang] || "OK";
      const defaultCancel = { "zh-TW": "取消", "zh-CN": "取消", ja: "キャンセル", ko: "취소" }[lang] || "Cancel";

      const { confirmText = defaultOK, cancelText = defaultCancel, danger = false } = opts;

      const overlay = document.createElement("div");
      overlay.className = "dmt-confirm-overlay";

      const box = document.createElement("div");
      box.className = "dmt-confirm-box";

      const msg = document.createElement("div");
      msg.className = "dmt-confirm-msg";
      msg.textContent = message;

      const btns = document.createElement("div");
      btns.className = "dmt-confirm-btns";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "dmt-confirm-btn dmt-confirm-btn-cancel";
      cancelBtn.textContent = cancelText;

      const okBtn = document.createElement("button");
      okBtn.className = "dmt-confirm-btn dmt-confirm-btn-ok" + (danger ? " danger" : "");
      okBtn.textContent = confirmText;

      const close = (result) => {
        overlay.remove();
        resolve(result);
      };

      cancelBtn.onclick = () => close(false);
      okBtn.onclick     = () => close(true);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
      // ESC 鍵關閉
      const onKey = (e) => { if (e.key === "Escape") { close(false); document.removeEventListener("keydown", onKey); } };
      document.addEventListener("keydown", onKey);

      btns.appendChild(cancelBtn);
      btns.appendChild(okBtn);
      box.appendChild(msg);
      box.appendChild(btns);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      // 焦點移至確認按鈕，方便鍵盤操作
      setTimeout(() => okBtn.focus(), 50);
    });
  }

  // =========================================================================================
  // 共享核心 §2 ── 翻譯引擎 (i18n Cache + TRANSLATIONS 字典)
  // =========================================================================================

  // 改用 LRU Cache 概念，自動清理舊項目
  class TranslationCacheManager {
    constructor(maxSize = 500) {
      // 利用 Map 天然記住插入順序實現 O(1) LRU：
      // get 時 delete 再重新 set → 該 key 移到尾端
      // evict 時取 .keys().next().value → 頭端為最舊
      this.cache = new Map();
      this.maxSize = maxSize;
    }

    get(key) {
      if (!this.cache.has(key)) return null;
      const value = this.cache.get(key);
      // 移到尾端（最近使用）
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    set(key, value) {
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.maxSize) {
        // 刪除最舊（頭端）key，O(1)
        this.cache.delete(this.cache.keys().next().value);
      }
      this.cache.set(key, value);
    }

    clear() {
      this.cache.clear();
    }

    get size() {
      return this.cache.size;
    }
  }

  // 全域實例
  // [Opt v1.6.7 ④] maxSize 從 ConfigManager 讀取，預設 500；可於 localStorage 設定 "copyTransCacheSize"
  const _transCacheSize = (() => {
    const v = parseInt(localStorage.getItem("copyTransCacheSize"), 10);
    return Number.isFinite(v) && v >= 50 && v <= 2000 ? v : 500;
  })();
  const TranslationCache = new TranslationCacheManager(_transCacheSize);

  // 翻譯函數（保持原有介面不變）
  function t(key, params = {}) {
    const config = getConfig();
    const lang = config.lang || "en";

    // Cache Key：params 為空物件時跳過序列化（99% 的呼叫路徑）
    const paramKeys = Object.keys(params);
    const cacheKey = paramKeys.length
      ? `${lang}:${key}:${JSON.stringify(params)}`
      : `${lang}:${key}`;

    const cached = TranslationCache.get(cacheKey);
    if (cached !== null) return cached;

    let text;
    if (lang === "custom") {
      text = _customLangData?.[key] ?? TRANSLATIONS["en"]?.[key];
    } else {
      const inLang = TRANSLATIONS[lang]?.[key];
      if (inLang === undefined && lang !== "en") {
        DEBUG && console.warn(`[t] key="${key}" missing in lang="${lang}", falling back to en`);
      }
      text = inLang ?? TRANSLATIONS["en"]?.[key];
    }
    if (text === undefined) {
      DEBUG && console.warn(`[t] key="${key}" not found in any language — returning key as-is`);
      text = key;
    }

    // 參數替換
    for (const [k, v] of Object.entries(params)) {
      const safeKey = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      text = text.replace(new RegExp(`\\{${safeKey}\\}`, "g"), v);
    }

    TranslationCache.set(cacheKey, text);
    return text;
  }

  // 注意：舊的 5 分鐘 setInterval 已移除。
  // TranslationCacheManager.set() 在 maxSize=500 時自動 evict 最舊項目，無需額外巡邏。

  // 共享翻譯字典 (整合 Module A 和 B)
  const TRANSLATIONS = {
    en: {
      name: "English",
      // --- Module A (Forwarding) ---
      fm_pinned_channels: "★ Pinned Channels",
      fm_toggle_flat: "Switch to: Flat View",
      fm_toggle_drop: "Switch to: Dropdown",
      fm_help: "Help",
      fm_prompt_channel: "Enter channel keyword:",
      fm_prompt_user: "Enter user ID or keyword (e.g., mighty):",
      fm_user_zone: "User Zone",
      fm_no_users: "No pinned users",
      fm_add_user: "+ Add User",
      fm_fuzzy: "Fuzzy Search",
      fm_remove_confirm: "Remove {target}?",
      fm_tooltip_channel: "Channel: {c}\nServer: {s}",
      fm_tooltip_user_add: "Add to User Zone (👤)",
      fm_tooltip_star_add: "Add to Favorites (★)",
      fm_manual_title: "📚 Forwarding Manager Manual",
      fm_sec_star: "★ Favorites & Management",
      fm_sec_star_content:
        "• Click <span class='help-key'>★</span> or <span class='help-key'>👤+</span> to pin.<br>• Right-click to remove.<br>• <span class='help-key'>Shift+Right-click</span> to quick remove (no confirm).",
      fm_sec_search: "🔍 Two-Step Search (Default)",
      fm_sec_search_content:
        "• Clicking a pin automatically executes 'Warmup -> Input -> Lock'.<br>• Fixes Discord's bug where direct input fails.<br>• Uses <span style='color:#2dc770'>Exact Match</span> to prevent wrong forwards.",
      fm_sec_fuzzy: "⏎ Fuzzy Search",
      fm_sec_fuzzy_content:
        "• Click the <span class='help-key'>⏎</span> arrow inside the button.<br>• Inputs only the first 2 chars or first word. Good for changing names.",
      fm_sec_user: "👤 User Zone",
      fm_sec_user_content:
        "• Click the <span class='help-key'>👤</span> button to expand user list.<br>• Supports manual ID addition.",
      fm_sec_misc_title: "⚙️ Tips & Display",
      fm_sec_misc:
        "• Top-left button toggles <b>Flat</b> or <b>Dropdown</b> display mode.<br>• <b>History</b> (Purple badges) auto-saves recently visited channels — click to revisit instantly.",

      // --- Module D (Wormhole) Manual ---
      fm_sec_wormhole: "🌀 Wormhole — Basics",
      fm_sec_wormhole_content:
        "• Click <span class='help-key'>＋</span> (create button) and paste a Discord channel URL to create a Wormhole shortcut.<br>" +
        "• <b>Click</b> a Wormhole → jump to that channel instantly.<br>" +
        "• <b>Right-click</b> a Wormhole → context menu: rename, delete, set icon, move to group, or toggle VIP.<br>" +
        "• <b>VIP (★)</b>: pinned Wormholes float to the top automatically.<br>" +
        "• <b>Groups</b>: organize Wormholes into named folders via right-click → Move to Group.<br>" +
        "• <b>Focus Mode</b>: icon-only compact view — toggle via the button at top-right of the Wormhole panel.",

      fm_sec_wm_send: "✉️ Wormhole — Send Message",
      fm_sec_wm_send_content:
        "• <b>Right-click</b> a Wormhole → <b>Send Message Here</b> to open the message overlay.<br>" +
        "• <b>Mode A (Navigate)</b>: switches to the target channel, injects text into Discord's editor, then returns — no API needed.<br>" +
        "• <b>Shift+Click</b> a Wormhole → opens the overlay in the current channel (no navigation).<br>" +
        "• Supports <b>Ctrl+V image paste</b> — images are attached and sent together with text.<br>" +
        "• Bottom options: <b>Auto-close</b> / <b>Go to channel</b> (mutual exclusive) / <b>Show notification</b>.<br>" +
        "• After sending, a clickable toast appears — click it to fly to the target channel.",

      fm_sec_wm_api: "⚡ Wormhole — API Mode (Secret)",
      fm_sec_wm_api_content:
        "• <b>Hold the Wormhole create button (＋) for 3 seconds</b> to unlock the API Mode panel.<br>" +
        "• <b>Mode B (Direct API)</b>: sends messages via Discord REST API — no page switch, faster, invisible.<br>" +
        "• Your Token is intercepted silently in the background (from Discord's own requests) — <b>never stored or transmitted</b>, memory only, cleared on page close.<br>" +
        "• Token detection starts automatically when Mode B is enabled — just use Discord normally and it will be captured.<br>" +
        "• Supports image upload via <b>multipart/form-data</b> in API mode.<br>" +
        "• If Token is lost after page refresh, the interceptor restarts automatically when you open the overlay.",
      welcome_title: "Welcome to {script}",
      select_lang_subtitle: "Please select your interface language",
      help_btn: "📖 Manual",
      cancel_btn: "✕ Close",
      security_notice_title: "⚠️ Security Disclaimer",
      security_notice_content:
        "URL conversion features (like vxtwitter, kkinstagram) rely on third-party services.\nDo not use them if you do not trust these services.\nUsers should have the ability to identify URL safety.",
      manual_content:
        "【Icons Guide】\n• ◫/≡ : Switch Menu Style (Flat / Group)\n• ⇄ : Click Logic Swap (Copy / Insert)\n• ␣ : Append Space at end\n• ↵ : Append Newline at end\n• ☆ : Custom Strings Panel\n• 🖱️ : Trigger Mode (Hover / Click)\n• 🌐 : Change Language\n\n【Actions】\n• **Click**: Copy (Default)\n• **Long Press (0.5s)**: Insert to Input\n• **Shift+Click**: Copy & Insert (Keep Menu Open)",
      manual_content_sections: `<div class='mm-section'><div class='mm-sec-title c-default'>⚡ Quick Start</div><div class='mm-content'>Hover over any Discord message → a copy button appears at the top-right corner.<br><b>Click</b> to copy text · <b>Long-press 0.5s</b> to insert into the input box · <b>Shift+Click</b> to copy AND insert (menu stays open).<br>Switch trigger to <span class='mm-key'>Click mode</span> via <span class='mm-key'>🖱️</span> if you prefer manual activation.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 Copy Menu — Text & Links</div><div class='mm-content'>• <b>Copy Text</b>: copies the full message text content.<br>• <b>Copy Media URL</b>: copies the direct URL of an image/video in the message.<br>• <b>Copy First Link (Clean)</b>: extracts and sanitizes the first URL (removes trackers).<br>• <b>Copy All Links</b>: copies every URL found in the message, one per line.<br>• <b>Copy as Markdown</b>: formats the link as <span class='mm-key'>[text](URL)</span> for Markdown use.<br>• <b>Insert [<span class='mm-key'>{t}</span>](URL)</b>: inserts a Markdown link directly into Discord's input box.<br>• <b>Hidden Format</b>: wraps content in <span class='mm-key'>|| spoiler ||</span> tags.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ Download</div><div class='mm-content'>• <b>Download Images/Media</b>: downloads all images or videos in the message.<br>• <b>Download as ZIP</b>: bundles multiple files into a single ZIP archive.<br>• Retries automatically on failure, falls back to alternate URL if available.</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 URL Conversion</div><div class='mm-content'><b>Twitter / X</b>: converts between twitter.com, x.com, vxtwitter, fixupx, fxtwitter, cunnyx.<br><b>Instagram</b>: converts between instagram.com ↔ kkinstagram.com for embed previews.<br><b>Bilibili</b>: converts to FX Bilibili or VX Bilibili for better embeds.<br><b>Pixiv</b>: converts between pixiv.net ↔ phixiv.net.<br><b>Batch convert</b>: <span class='mm-key'>⚡ Convert All (N)</span> processes every link of that type in the message at once.</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>🎛️ Toolbar Icons</div><div class='mm-content'><div class='mm-grid'><div><span class='mm-key'>◫/≡</span> Switch menu style: Flat / Group</div><div><span class='mm-key'>⇄</span> Swap click logic: Copy ↔ Insert</div><div><span class='mm-key'>␣</span> Append space to inserted text</div><div><span class='mm-key'>↵</span> Append newline to inserted text</div><div><span class='mm-key'>☆</span> Custom string panel (saved snippets)</div><div><span class='mm-key'>🖱️</span> Toggle trigger: Hover / Click</div><div><span class='mm-key'>🌐</span> Switch interface language</div></div></div></div><div class='mm-section'><div class='mm-sec-title c-default'>☆ Custom String Panel</div><div class='mm-content'>• Save frequently used text snippets (greetings, templates, code blocks).<br>• Click to copy · Long-press to insert into input box.<br>• <span class='mm-key'>Shift+Click</span> to delete entries continuously without confirmation.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 Wormhole — Overview</div><div class='mm-content'>Wormholes are <b>one-click channel shortcuts</b> that live in the Discord sidebar. Click <span class='mm-key'>＋</span> and paste any Discord channel URL to create one.<br><b>Click</b> the <span class='mm-key'>＋</span> button → create a new wormhole · <b>Long-press 1s</b> → open the settings menu.</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>🖱️ Navigation & Management</div><div class='mm-content'>• <b>Click</b> a wormhole → instantly jump to that channel.<br>• <b>Right-click</b> → menu: Rename · Delete · Set icon · Move to group · Toggle VIP.<br>• <b>VIP <span class='mm-key'>★</span></b>: pinned wormholes auto-float to the top.<br>• <b>Groups</b>: right-click → Move to Group to organize into folders.<br>• <b>Focus Mode</b>: icon-only compact view via the top-right panel button.<br>• <b>History</b> (purple badges): last visited channels saved, click to return.</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>✉️ Send Message</div><div class='mm-content'>• <b>Right-click</b> a wormhole → <b>Send Message Here</b> to open the overlay.<br>• <span class='mm-key'>Ctrl+V</span> to paste images directly — sent with text as one message.<br>• Bottom options (persisted): Auto-close · Go to channel · Show notification.<br>• A clickable 3-second toast appears after sending — click to fly to that channel.</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>⚡ Settings Menu & API Mode</div><div class='mm-content'>• <b>Long-press <span class='mm-key'>＋</span> for 1 second</b> to open the wormhole settings menu.<br>• Menu items: <span class='mm-key'>➕ Create New Wormhole</span> · <span class='mm-key'>✉️ Send Method & API Mode</span> · <span class='mm-key'>⚙️ More Settings</span> (expandable).<br>• <b>Send Method & API Mode</b> → opens the API panel:<br>&nbsp;&nbsp;— <b>Plan A (Navigate)</b>: switches channel, injects text, returns. No API token needed.<br>&nbsp;&nbsp;— <b>Plan B (Direct API)</b>: REST API send, no page switch, instant &amp; silent.<br>• Token is intercepted silently from Discord's own requests — <b>never stored to disk.</b><br>• After page refresh: interceptor auto-restarts when you open the send overlay.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🔍 Duplicate URL Checker</div><div class='mm-content'>Automatically checks for duplicate links when you paste a URL into the chat box.<br>• <b>DOM mode</b> (default): scans all currently visible messages — no API token required.<br>• <b>API mode</b>: scans the last 200 messages via Discord API (requires Wormhole API mode enabled and token captured).<br>• A banner appears at the top of the chat if a duplicate is detected, showing how many times the link appeared.<br>• The banner auto-dismisses once you paste a different URL or switch channels.<br>• <b>No banner = no duplicate</b> — the checker runs silently in the background when no match is found.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🔎 Channel Scout — Search</div><div class='mm-content'>Search the current channel's messages by keyword, directly from chat.<br>• <b>Open</b>: click the 🔎 floating button above the input box, or press <span class='mm-key'>F2</span> anywhere outside the input.<br>• <b>Instant search</b>: results update as you type (150 ms debounce). Keyword is highlighted in gold.<br>• <b>Quick tags</b>: save up to 5 custom keywords as one-click search buttons. Left-click to search · Right-click to delete.<br>• <b>Search history</b>: the 🕐 button shows your last 5 searches, click to re-run.<br>• <b>Jump to message</b>: click any result to scroll it into view with a blue highlight ring.<br>• <b>Paste button</b>: click 📋 to paste clipboard content directly into the search box.<br>• Close with <span class='mm-key'>ESC</span>, <span class='mm-key'>F2</span>, or click outside.<br>⚠ DOM mode only — searches messages currently rendered on screen. Scroll up to load older messages before searching.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌫️ Mute User Messages</div><div class='mm-content'>Softly dim messages from specific users so they fade into the background without disappearing.<br>• <b>Mute</b>: right-click any message → <b>🌫️ Mute messages: {name}</b> in the context menu (appears below Block).<br>• <b>Unmute</b>: right-click any message from the same user → <b>✅ Unmute: {name}</b>.<br>• <b>Manage panel</b>: press <span class='mm-key'>Alt+B</span> to open the mute list — shows all muted users with date added and an Unmute button.<br>• Dimmed messages show at <b>7% opacity</b>. Hover over them to temporarily preview at 42% opacity.<br>• Muting is <b>name-based</b> (display name, not user ID). Works across all channels.<br>• Applied automatically to new messages as they arrive, and re-applied after switching channels.<br>• Data is stored permanently in GM storage — survives page reloads.</div></div></div></div>`,
      reload_confirm: "Settings saved!\nReload page now to apply changes?",
      copy_text: "📋 Copy Text",
      copy_media_url: "🖼️ Copy Media URL",
      no_content: "⚠️ No Content",
      copy_first_link: "🔗 Copy First Link",
      copy_markdown: "🧾 Copy as Markdown",
      copy_all_links: "📎 Copy All Links",
      insert_format_link: "📌 Insert [{t}](URL)",
      copy_hidden_format: "🙈 Copy Hidden (|| Text ||)",
      download_images: "⬇️ Download Images or Media",
      download_zip: "📦 Download as ZIP",
      download_start: "🚀 Downloading...",
      download_zip_start: "📦 Zipping {n} files...",
      download_fail: "❌ Download Failed",
      download_cors_fail:
        "⚠️ CORS restricted — cannot download directly. Please copy the URL and open it manually to save.",
      original_url: "🔗 Original URL",
      convert_all: "⚡ Convert All ({n})",
      convert_imgur: "🖼️ Convert to i.imgur.com",
      to_twitter: "🐦 to twitter.com",
      to_x: "❌ to x.com",
      to_vxtwitter: "🔁 to vxtwitter",
      to_fixupx: "🛠️ to fixupx",
      to_fxtwitter: "🔧 to fxtwitter",
      to_cunnyx: "🍑 to cunnyx",
      to_fixvx: "🧩 to fixvx",
      to_reddit: "👽 to reddit.com",
      to_old_reddit: "📜 to old.reddit",
      to_rxddit: "🔁 to rxddit",
      to_vxreddit: "🛠️ to vxreddit",
      to_instagram: "📷 to instagram.com",
      to_kkinstagram: "🔁 to kkinstagram",
      to_vxinstagram: "🔁 to vxinstagram",
      to_ddinstagram: "🔁 to ddinstagram",
      to_uuinstagram: "🔁 to uuinstagram",
      to_facebed: "🔁 to facebed.com",
      to_tiktok: "🎵 to tiktok.com",
      to_vxtiktok: "🔁 to vxtiktok",
      to_tnktok: "🛠️ to tnktok",
      to_threads: "🧵 to threads.com",
      to_fixthreads: "🔁 to fixthreads",
      to_fx_bilibili: "📺 to FX Bilibili",
      to_vx_bilibili: "📼 to VX Bilibili",
      to_b23: "🔗 to b23.tv",
      to_vxb23: "🔗 to vxb23.tv",
      to_phixiv: "🔙 to phixiv.net",
      to_pixiv: "🎨 to pixiv.net",
      yt_shorts_to_watch: "▶️ YouTube Shorts → Watch",
      restore_pixiv_img: "📖 Restore pixiv link",
      insert_symbol: "✳️ Insert → {s}",
      delete_symbol: "❌",
      delete_confirm: "Deleted: {s}",
      add_symbol: "➕ Add",
      add_symbol_prompt: "Enter text to add:",
      add_success: "Added! Reopen menu to see.",
      remove_symbol: "➖ Remove",
      remove_symbol_prompt: "Enter text to remove:",
      remove_empty: "List empty",
      mode_hover: "🔄 Hover",
      mode_click: "🖱️ Click",
      mode_desc: "Mode: {mode} (Click to toggle)",
      mode_changed: "Mode changed: {mode}",
      export_success: "✅ Settings Exported!\n\nCopied to clipboard.",
      import_prompt: "⬇️ Paste backup code (JSON):",
      import_success: "✅ Imported!\nRefreshing page...",
      import_fail: "❌ Import Failed: Invalid JSON.",
      insert_success: "Inserted",
      copy_success: "Copied",
      copy_fail: "Copy Failed",
      input_not_found: "Input box not found",
      edit_link_text: "Edit Link Text",
      enter_link_text: "Enter text for link prefix (empty to remove):",
      tip_style: "Menu Style: Flat / Group",
      tip_trigger: "Trigger: Hover / Click",
      tip_logic: "Click Logic: Copy / Insert",
      tip_space: "Append Space",
      tip_newline: "Append Newline",
      tip_symbols: "Custom Strings View",
      tip_lang: "Language",
      tip_manual: "Manual",
      mod_msg_warn_title: "⚠️ Disable Message Utility?",
      mod_msg_warn_body:
        "Message Utility (⠿) is the core of this script.\\nAfter disabling, all ⠿ buttons will disappear.\\n\\nTo re-enable: right-click the Tampermonkey icon → 'Enable ⠿ Message Utility'.",
      mod_msg_warn_confirm: "Disable anyway",
      mod_msg_warn_cancel: "Cancel",
      mod_msg_enable_menu: "Enable ⠿ Message Utility",
      rescue_reload_msg: "Settings updated. Reload page to apply changes?",
      rescue_close_btn: "Close",
      grp_copy: "📝 Copy >",
      grp_convert: "🔄 Convert >",
      grp_download: "⬇️ Download >",
      grp_system: "⚙️ System >",
      grp_webhook: "🔗 Webhook >",
      view_main: "Main",
      view_symbols: "Symbols",

      // --- Module C (Expression Helper) - [UPDATED] ---
      em_title: "😊 Expression/GIF Manager",
      em_content:
        "• <b>Toolbar</b>: [📁] Collections | [🎯] Target Mode | [★] Quick Save.<br>• <b>Target Mode</b>: Click to pick any GIF/Sticker on screen.<br>• <b>Collections</b>: Organize into tabs. Drag tabs to reorder.<br>• <b>Shift+Click</b>: Send item without closing menu.",
      em_picker_tip:
        "🔍 Click any GIF/Image to save (Click background to cancel)",
      em_err_no_list: "List container not found. Please open a picker first!",
      em_btn_add_title:
        "Click: Save search keywords. Hold Shift to delete keywords continuously.",
      em_btn_active_title: "Click: Filter by Keyword (Toggle)",
      em_btn_target_title: "Target Mode: Click any GIF/Emoji to save",
      em_btn_save_this: "Save this to Collection",
      em_no_favs: "No favorites yet",
      em_del_confirm: 'Delete "{k}"?',
      em_note_prompt: "Note:",
      em_set_cover_success: "Cover image set!",

      // --- Module D (Wormhole) ---
      wm_url_prompt: "Please enter the full Discord channel URL:",
      wm_name_prompt: "Enter Wormhole Name (e.g. General):",
      wm_edit_title: "Edit Wormhole: {n}",
      wm_created: "Wormhole created!",
      wm_deleted: "Wormhole closed.",
      wm_nav_fail: "Navigation failed, please check the URL.",

      // Menu Actions
      wm_menu_edit: "✎ Edit Name",
      wm_menu_del: "🗑️ Close Wormhole",
      wm_menu_vip_add: "★ Set as VIP (Pin)",
      wm_menu_vip_remove: "☆ Unset VIP",
      wm_menu_move: "📂 Move to Group",

      // Group Related
      wm_group_prompt: "Enter New Group Name:",
      wm_edit_group: "Edit Group Name:",
      wm_group_del_confirm:
        "Dissolve group '{n}'? (Wormholes inside will be kept)",
      wm_group_select_prompt:
        "Select a group by number:\n\n0. [Root/Uncategorized]\n{list}\n\nLeave empty to create a NEW group:",
      wm_group_invalid: "Invalid group selection!",
      wm_move_prompt: "Move to which group? (Enter number)\n\n{list}",
      wm_icon_picker_title: "Choose Icon for {name}",
      wm_icon_set_success: "✅ Icon set for {name}",
      wm_icon_empty: "Please add Emoji in the collection module first",
      wm_title:
        "Wormhole Controls\n• Click: Create new wormhole\n• Long-press 1s: Open settings menu",
      wm_settings_menu_title: "🌀 Wormhole Settings",
      wm_settings_create: "Create New Wormhole",
      wm_settings_send_mode: "Send Method & API Mode",
      wm_settings_more: "More Settings (Coming Soon)",
      wm_settings_position: "Switch Wormhole Position",
      wm_settings_position_navbar: "Navigation Bar",
      wm_settings_position_titlebar: "Channel Title Bar",
      wm_settings_position_input: "Above Chat Input",
      wm_settings_position_topleft: "Top-Left Corner (Fixed)",
      wm_focus_on: "Disable Focus Mode",
      wm_focus_off: "Enable Focus Mode (Icons Only)",
      wm_focus_size: "Icon Size",
      wm_focus_size_s: "S  · Small",
      wm_focus_size_m: "M  · Medium",
      wm_focus_size_l: "L  · Large",

      // 蟲洞傳送訊息
      wm_menu_send: "✉️ Send Message Here",
      wm_send_placeholder: "Type a message to send to #{name}...",
      wm_send_btn: "Send",
      wm_send_cancel: "Cancel",
      wm_send_waiting: "Waiting for editor...",
      wm_send_injecting: "Sending...",
      wm_send_success: "✅ Sent to #{name}!",
      wm_send_toast_title: "✅ Sent to #{name}",
      wm_send_toast_hint: "Click to go to channel",
      wm_send_waiting_token: "⏳ Waiting for Token…",
      wm_send_fail: "❌ Failed — editor not ready.",
      wm_send_empty: "Message cannot be empty.",
      wm_send_returning: "Returning...",
      wm_send_hint: "Shift+Click to send without switching channel",
      wm_send_field_add:    "+ Add field",
      wm_send_field_del:    "Remove field",
      wm_send_sending_n:    "Sending {n}/{total}…",
      wm_send_cool_warn:    "Cool-down: {s}s between messages",
      wm_send_chat_btn:     "Send message",
      wm_send_mode_api: "⚡ API Mode",
      wm_send_mode_nav: "🔀 Navigate Mode",
      wm_send_mode_desc_api: "Send directly, no channel switch",
      wm_send_mode_desc_nav: "Switch to target channel, then send",
      wm_send_autoclose: "Auto-close after send",
      wm_send_show_toast: "Show send notification",
      wm_send_goto_channel: "Go to channel after send",
      wm_send_paste_hint: "📋 Ctrl+V to paste image",
      wm_send_token_warn:
        "⚠️ Token expired. Please re-open the API panel to detect again. Using Mode A this time.",
      wm_send_channel_fail: "❌ Channel load failed",
      wm_send_editor_missing: "❌ Editor not found",
      wm_send_uploading: "📎 Uploading {n} image(s)...",

      // 方案 B — API 模式
      wm_api_panel_title: "⚗️ Wormhole API Mode (Advanced)",
      wm_api_mode_label_a: "Mode A — Navigate (Default)",
      wm_api_mode_label_b: "Mode B — Direct API (No page switch)",
      wm_api_warning_title: "⚠️ Risk Notice",
      wm_api_warning_body:
        "Using a User Token to call the Discord API violates Discord's Terms of Service. Your account may be banned. Use at your own risk.",
      wm_api_token_status_none: "Token: Not detected",
      wm_api_token_status_ready: "Token: Ready (memory only)",
      wm_api_detect_btn: "Detect My Token",
      wm_api_detect_confirm:
        "【Token Interception Consent】\n\nBy clicking OK, you authorize this script to intercept your Discord Token for this session.\n\n🔒 Security Guarantees:\n• Stored in memory only — never written to disk or any storage\n• Automatically cleared when the page is closed or refreshed\n• Never transmitted to any external server — all requests go directly to discord.com\n• Used exclusively for POST /channels/{id}/messages on your behalf\n\n⚠️ Acknowledgement:\n• You understand this session token grants message-sending access\n• You accept full responsibility for all messages sent via this mode\n\nProceed only if you trust this script and understand the above.",
      wm_api_detect_waiting: "⬆️ Switch to any channel once to capture Token",
      wm_api_enable_btn: "Enable API Mode",
      wm_api_disable_btn: "Disable API Mode (back to Mode A)",
      wm_api_enabled_toast: "✅ API Mode enabled",
      wm_api_disabled_toast: "↩️ Returned to Navigate Mode",
      wm_api_view_code: "View Token Interceptor Code",
      wm_api_clear_token: "🗑 Clear Token",
      wm_api_reset_all: "🗑️ Reset All Wormhole Data",
      wm_api_plan_b_first: "Please select Plan B first",
      wm_api_send_fail: "❌ API send failed — check console",

      wm_alert_invalid_url:
        "Invalid URL! Please copy a valid Discord channel URL (containing /channels/).",
      wm_default_channel_name: "Channel",
      wm_refresh_confirm:
        "Wormhole created, but the interface cannot update immediately.\nThis is likely due to Discord locking the UI.\n\nRefresh page now to view?",
      wm_root_group: "Uncategorized",

      // Collections
      em_col_title: "My Collections",
      em_col_add_success: 'Saved to "{g}"!',
      em_col_tab_new: "New Tab",
      em_col_tab_prompt: "New Tab Name:",
      em_col_empty_tab: "This tab is empty.",
      em_col_del_tab_confirm: 'Delete tab "{n}" and all items inside?',
      em_modal_choose_tab: "Save to which collection?",
      em_modal_create_new: "+ Create New...",
      em_col_refresh_tooltip: "Refresh GIF preview (refresh expired CDN cache)",
      em_refresh_no_expired:   "ℹ️ No expired GIFs in this tab",
      em_refresh_consent:      "⚠️ About GIF Refresh\n\nThis feature will use a third-party proxy (fixcdn.hyonsu.com)\nto obtain fresh Discord attachment credentials.\n\nNotes:\n• Your image URLs will be sent to fixcdn.hyonsu.com\n• This is a third-party service, unrelated to Discord or this script\n• Search 'fixcdn hyonsu' to learn more before proceeding\n\nContinue?",
      em_refresh_cancel_tip:   "ℹ️ Cancelled. Manual steps:\n① Find the original GIF on Discord\n② Re-add it to your collection",
      em_refresh_loading:      "Refreshing...",
      em_refresh_ok:           "✨ Refreshed {n} GIF(s){fail} {track}",
      em_refresh_partial_fail: " ({f} failed)",
      em_refresh_fail:         "⚠️ Could not refresh GIFs in this tab",
      em_refresh_track_api:    "(Discord API)",
      em_refresh_track_cdn:    "(fixcdn)",

      // Tooltips
      em_tip_pick: "Set cover image",
      em_tip_edit: "Edit note",
      em_tip_delete: "Delete",
      // Input
      em_menu_emoji: "Emojis",
      em_menu_sticker: "Stickers",
      em_menu_gif: "GIFs",

      // --- GM Menu Commands ---
      menu_export: "📤 Export Settings (Backup)",
      menu_import: "⬇️ Import Settings (Restore)",
      menu_change_lang: "🌐 Change Language",
      custom_lang_desc:
        "Click 「📤 Export」 to get the English source JSON. After translating, click 「📥 Import」 to apply your language.\nNo matching language? Try: Deutsch (Benutzerdefinierte Übersetzung) · ภาษาไทย (ภาษาที่กำหนดเอง) · Türkçe (Özel Çeviri) · Polski (Niestandardowe tłumaczenie) · Italiano (Traduzione personalizzata)",
      custom_lang_export: "📤 Export Text",
      custom_lang_import: "📥 Import Text",
      custom_lang_apply: "✅ Apply & Reload",
      custom_lang_loaded: "✅ Loaded: {name}",
      custom_lang_activate: '🌐 Apply "{name}"',
      custom_lang_json_error: "⚠️ JSON Error: {msg}",
      custom_lang_paste_hint: "Paste the translated JSON here …",
      copy_media_prefixed: "✅ Copied {n} media link(s) with prefix",
      copy_media_urls: "✅ Copied {n} media link(s)",
      wormhole_reset_success: "✅ Data cleared, refreshing…",
      // --- Module C (GIF Refresh) ---
      em_save_success: "Saved: {k}",

      // --- Module F (Webhook) ---
      wh_panel_title: "🔗 Webhook Manager",
      wh_enable: "Enable Webhook",
      wh_tip: "Webhook Manager",
      wh_add_name_ph: "Label (e.g. Animals)",
      wh_add_url_ph: "https://discord.com/api/webhooks/…",
      wh_btn_add: "＋ Add",
      wh_btn_test: "Test",
      wh_btn_delete: "Delete",
      wh_test_ok: "✅ Test sent!",
      wh_test_fail: "❌ Test failed",
      wh_send_content: "📨 Send message to Webhook ▶",
      wh_send_urls: "🔗 Send URLs to Webhook ▶",
      wh_no_webhooks: "No Webhooks yet. Add one below.",
      wh_send_ok: "✅ Sent to [{name}]",
      wh_send_fail: "❌ Send failed [{name}]",
      wh_no_urls: "⚠️ No URLs found in this message",
      wh_url_invalid: "⚠️ Invalid Webhook URL",
      wh_btn_edit: "Edit",
      wh_btn_save: "Save",
      wh_btn_cancel: "Cancel",
      wh_keep_source: "📎 Include source link",
      wh_keep_source_tip: "When checked, the original message link is appended to the sent content.",

      // --- Module G (URL Checker) ---
      uc_duplicate_found: "⚠️ This URL was already posted — appeared {count}× in the last {limit} messages",
      uc_duplicate_found_plural: "⚠️ {n} duplicate URLs — up to {count}× in the last {limit} messages",
      uc_dom_found: "⚠️ This URL was spotted {count}× in {limit} visible messages (DOM mode · no API needed)",
      uc_no_token: "🔍 Duplicate URL Check requires Wormhole API Mode — enable it in the Wormhole settings (hold ＋ for 1s)",
      uc_token_waiting: "⏳ Waiting for API Token… switch to any channel once to capture it",
      uc_fetching: "🔄 Checking for duplicate URLs…",
      uc_dismiss: "✕",
      uc_limit_label: "Scan range:",
      uc_limit_suffix: "messages",

      // --- Module G tooltip (mod_tip) ---
      mod_tip_message:    "Right-click any message to copy, bookmark, or perform quick actions via the ⠿ button.",
      mod_tip_forwarding: "Forward messages to starred channels or users. Adds a forwarding toolbar above the chat input.",
      mod_tip_emoji:      "Browse and insert server emojis from a searchable popup when typing.",
      mod_tip_header:     "Unlocks right-click on media, enables file download helpers and anti-content-hijack guard.",
      mod_tip_wormhole:   "Quick-jump to pinned channels via chip shortcuts at the top of chat. Supports VIP, groups and focus mode.",
      mod_tip_webhook:    "Send messages to registered Webhooks directly from any channel.",
      mod_tip_urlchecker: "Warns you when a pasted URL has already been shared in recent messages. Works without API token (DOM mode).",
      mod_tip_scout:      "Press the search button above the input box or use the keyboard shortcut to search current channel messages by keyword.",
      mod_tip_blacklist:  "Dim messages from specific users so they fade into the background. Right-click any message to add the author.",

      // --- Module H (Channel Scout) ---
      cs_panel_title:   "⌨ Channel Scout",
      cs_placeholder:   "Type a keyword to search channel messages…",
      cs_paste_tip:     "Paste from clipboard",
      cs_history_tip:   "Recent searches",
      cs_no_history:    "No search history yet",
      cs_empty_hint:    "Type a keyword or click a tag to search",
      cs_no_results:    "No matching messages found",
      cs_dom_mode_note: "DOM mode · searches only visible messages",
      cs_right_del_tip: "Right-click tag to delete",
      cs_add_tag:        "+ New Tag",
      cs_add_tag_prompt: "Enter new tag (right-click to delete):",
      cs_float_title:   "Channel Scout (F2)",
      cs_float_label:   "Channel Scout",

      // --- Module H (Mute User) ---
      mu_panel_title:   "🌫️ Mute User Messages",
      mu_empty:         "No muted users\nRight-click a message to add",
      mu_remove_btn:    "Unmute",
      mu_footer_left:   "Right-click a message to mute · hover to preview",
      mu_footer_right:  "Stored in GMStore",
      mu_add_toast:     "🌫️ Muted: {name}",
      mu_remove_toast:  "✅ Unmuted: {name}",
      mu_ctx_mute:      "🌫️ Mute messages: {name}",
      mu_ctx_unmute:    "✅ Unmute: {name}",
      mu_shortcut:      "Alt+B to manage muted users",
      mu_temp_card_name: "Temp",
      mu_temp_card_desc: "Auto-unmute after timer",
      mu_temp_quick:    "Quick select",
      mu_temp_placeholder: "e.g. 3H, 1D 6H, 27H 20M",
      mu_temp_confirm:  "⏳ Mute temporarily",
      mu_temp_expired_toast: "⏰ Temp mute expired: {name}",
      mu_temp_badge_label: "⏳",
      mu_settings_tab_list:    "Mute List",
      mu_settings_tab_style:   "Style Settings",
      mu_settings_clear_all:   "Clear All",
      mu_settings_clear_confirm: "Remove all muted users?",
      mu_settings_ghost_delay: "Ghost vanish delay (seconds)",
      mu_settings_title:       "Settings",
    },

    "zh-TW": {
      name: "繁體中文",
      // --- Module A (Forwarding) ---
      fm_pinned_channels: "★ 收藏頻道",
      fm_toggle_flat: "切換至：平鋪顯示",
      fm_toggle_drop: "切換至：下拉清單",
      fm_help: "使用說明",
      fm_prompt_channel: "輸入頻道關鍵字：",
      fm_prompt_user: "輸入使用者關鍵字 (例如: mighty)：",
      fm_user_zone: "使用者專區",
      fm_no_users: "尚無收藏的使用者",
      fm_add_user: "+ 新增使用者",
      fm_fuzzy: "模糊搜尋",
      fm_remove_confirm: "移除「{target}」？",
      fm_tooltip_channel: "頻道: {c}\n伺服器: {s}",
      fm_tooltip_user_add: "加入使用者專區 (👤)",
      fm_tooltip_star_add: "加入頻道收藏 (★)",
      fm_manual_title: "📚 使用說明書",
      fm_sec_star: "★ 收藏與管理",
      fm_sec_star_content:
        "• 點擊 <span class='help-key'>★</span> 或 <span class='help-key'>👤+</span> 加入收藏。<br>• <span class='help-key'>右鍵</span> 移除收藏。<br>• <span class='help-key'>Shift+右鍵</span> 可快速連續移除 (無須確認)。",
      fm_sec_search: "🔍 兩段式搜尋 (預設)",
      fm_sec_search_content:
        "• 點擊收藏按鈕後，會自動執行「預熱 -> 輸入 -> 鎖定」流程。<br>• 這是為了修復 Discord「直接填入搜尋不到」的 Bug。<br>• 搜尋時會進行 <span style='color:#2dc770'>精準比對</span>，確保不會轉發錯人。",
      fm_sec_fuzzy: "⏎ 模糊搜尋",
      fm_sec_fuzzy_content:
        "• 點擊按鈕右側的 <span class='help-key'>⏎</span> 小箭頭。<br>• 僅輸入前兩個字或第一個單字，適合名稱有變動或符號的頻道。",
      fm_sec_user: "👤 使用者專區",
      fm_sec_user_content:
        "• 點擊最右側的 <span class='help-key'>👤</span> 按鈕可展開用戶清單。<br>• 支援手動新增用戶 ID (適合找不到人的情況)。",
      fm_sec_misc_title: "⚙️ 顯示與小技巧",
      fm_sec_misc:
        "• 左上角按鈕可切換<b>平鋪</b>或<b>下拉選單</b>顯示模式。<br>• <b>歷史紀錄</b>（紫色標籤）會自動記錄最近造訪的頻道，點擊可立即跳回。",

      // --- Module D (Wormhole) 說明 ---
      fm_sec_wormhole: "🌀 蟲洞 — 基本操作",
      fm_sec_wormhole_content:
        "• 點擊 <span class='help-key'>＋</span> 建立按鈕，貼上 Discord 頻道網址即可建立蟲洞捷徑。<br>" +
        "• <b>單擊</b>蟲洞 → 立即跳轉至該頻道。<br>" +
        "• <b>右鍵</b>蟲洞 → 開啟選單：重新命名、刪除、設定圖示、移動到分組、切換 VIP。<br>" +
        "• <b>VIP（★）</b>：設為 VIP 的蟲洞會自動置頂顯示。<br>" +
        "• <b>分組</b>：透過右鍵 → 移動到分組，可將蟲洞整理進資料夾。<br>" +
        "• <b>聚焦模式</b>：僅顯示圖示的精簡視圖，可透過蟲洞面板右上角按鈕切換。",

      fm_sec_wm_send: "✉️ 蟲洞 — 傳送訊息",
      fm_sec_wm_send_content:
        "• <b>右鍵</b>蟲洞 → <b>在此頻道傳送訊息</b>，開啟傳訊輸入欄。<br>" +
        "• <b>方案 A（跳頁模式）</b>：自動切換至目標頻道，將文字注入 Discord 編輯器後返回，無需 API。<br>" +
        "• <b>Shift + 點擊</b>蟲洞 → 在當前頻道開啟輸入欄（不跳頁）。<br>" +
        "• 支援 <b>Ctrl+V 貼上圖片</b>，圖片與文字會合併成一則訊息一起送出。<br>" +
        "• 底部選項：<b>傳送後自動關閉</b> / <b>傳送後前往該頻道</b>（兩者互斥）/ <b>顯示傳訊通知</b>。<br>" +
        "• 傳送成功後會出現可點擊的通知，點擊後立即飛往目標頻道。",

      fm_sec_wm_api: "⚡ 蟲洞 — API 模式（彩蛋）",
      fm_sec_wm_api_content:
        "• <b>長按蟲洞建立按鈕（＋）3 秒</b>，即可解鎖 API 模式設定面板。<br>" +
        "• <b>方案 B（直接 API）</b>：透過 Discord REST API 傳送訊息，無需切換頁面，速度更快、更隱匿。<br>" +
        "• Token 由腳本在背景靜默攔截（來自 Discord 自身發出的請求），<b>絕不儲存或外傳</b>，僅存於記憶體，關閉頁面即消失。<br>" +
        "• 啟用方案 B 後，Token 偵測會自動在背景運行，正常使用 Discord 即可自動捕獲，無需手動操作。<br>" +
        "• API 模式支援圖片上傳（multipart/form-data），圖文可一次傳出。<br>" +
        "• 頁面重新整理後若 Token 遺失，開啟傳訊視窗時攔截器會自動重啟。",
      select_lang_subtitle: "請選擇您的介面語言 / Please Select Language",
      help_btn: "📖 使用說明",
      cancel_btn: "✕ 關閉",
      security_notice_title: "⚠️ 安全與免責聲明",
      security_notice_content:
        "本腳本提供的「網址轉換」功能（如 vxtwitter, kkinstagram 等）皆依賴第三方開源服務。\n若您不信任這些第三方服務，請勿點擊轉換選項。\n請使用者自行具備辨識網址安全性的能力。",
      manual_content:
        "【圖示說明】\n• ◫/≡ : 切換選單風格 (平面 / 群組)\n• ⇄ : 點擊邏輯互換 (複製 / 填充)\n• ␣ : 尾部添加空格\n• ↵ : 尾部添加換行\n• ☆ : 自定義字串面板\n• 🖱️ : 切換觸發模式 (懸停 / 點擊)\n• 🌐 : 切換語言\n\n【操作方式】\n• **單擊**: 複製 (預設)\n• **長按 (0.5秒)**: 填充至輸入框\n• **Shift+單擊**: 同時複製並填充 (保持選單開啟)",
      manual_content_sections: `<div class='mm-section'><div class='mm-sec-title c-default'>⚡ 快速開始</div><div class='mm-content'>將滑鼠懸停在任意 Discord 訊息上 → 右上角出現複製按鈕。<br><b>單擊</b>複製文字 · <b>長按 0.5秒</b>填充到輸入框 · <b>Shift+單擊</b>同時複製並填充（選單保持開啟）。<br>透過工具列的 <span class='mm-key'>🖱️</span> 可切換為<span class='mm-key'>點擊模式</span>，改為手動觸發。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 複製選單 — 文字與連結</div><div class='mm-content'>• <b>複製文字</b>：複製訊息的完整文字內容。<br>• <b>複製媒體網址</b>：複製訊息中圖片或影片的直接連結。<br>• <b>複製第一個連結（已淨化）</b>：提取並清除追蹤參數的第一個 URL。<br>• <b>複製所有連結</b>：將訊息中所有 URL 每行一個一次複製。<br>• <b>複製為 Markdown</b>：格式化為 <span class='mm-key'>[文字](URL)</span> 供 Markdown 使用。<br>• <b>插入 Markdown 連結</b>：直接將連結格式注入 Discord 的輸入框。<br>• <b>隱藏格式</b>：自動包裹為 <span class='mm-key'>|| 暴雷內容 ||</span> 格式。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ 下載</div><div class='mm-content'>• <b>下載圖片/媒體</b>：下載該則訊息中的所有圖片或影片。<br>• <b>下載為 ZIP</b>：多個檔案自動打包為單一 ZIP 壓縮檔。<br>• 下載失敗時自動重試，並備援切換至備用連結。</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 網址轉換</div><div class='mm-content'><b>Twitter / X</b>：在 twitter.com、x.com、vxtwitter、fixupx、fxtwitter、cunnyx 之間互轉，修復 Discord 預覽。<br><b>Instagram</b>：instagram.com ↔ kkinstagram.com，讓嵌入預覽正常顯示。<br><b>Bilibili</b>：轉換為 FX Bilibili 或 VX Bilibili 取得更好的嵌入效果。<br><b>Pixiv</b>：pixiv.net ↔ phixiv.net 互轉，在 Discord 直接顯示插圖預覽。<br><b>批次轉換</b>：<span class='mm-key'>⚡ 全部轉為 (N)</span> 一次處理訊息中同類型的所有連結。</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>🎛️ 工具列圖示說明</div><div class='mm-content'><div class='mm-grid'><div><span class='mm-key'>◫/≡</span> 切換選單風格：平面 / 群組</div><div><span class='mm-key'>⇄</span> 互換點擊邏輯：複製 ↔ 填充</div><div><span class='mm-key'>␣</span> 填充時在尾部附加空格</div><div><span class='mm-key'>↵</span> 填充時在尾部附加換行</div><div><span class='mm-key'>☆</span> 自定義字串面板（常用片段）</div><div><span class='mm-key'>🖱️</span> 切換觸發方式：懸停 / 點擊</div><div><span class='mm-key'>🌐</span> 切換介面語言</div></div></div></div><div class='mm-section'><div class='mm-sec-title c-default'>☆ 自定義字串面板</div><div class='mm-content'>• 儲存常用的文字片段（問候語、模板、程式碼區塊等）。<br>• 單擊複製 · 長按填充到輸入框。<br>• <span class='mm-key'>Shift+單擊</span> 可連續刪除條目，無需逐一確認。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 蟲洞 — 總覽</div><div class='mm-content'>蟲洞是存在 Discord 側邊欄的<b>一鍵頻道捷徑</b>。點擊 <span class='mm-key'>＋</span> 並貼上 Discord 頻道網址即可建立。<br><b>單擊</b> <span class='mm-key'>＋</span> → 建立新蟲洞 · <b>長按 1 秒</b> → 開啟設定選單。</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>🖱️ 導航與管理</div><div class='mm-content'>• <b>單擊</b>蟲洞 → 立即跳轉至該頻道。<br>• <b>右鍵</b>蟲洞 → 選單：重新命名 · 刪除 · 設定圖示 · 移至群組 · 切換 VIP。<br>• <b>VIP <span class='mm-key'>★</span></b>：設為 VIP 的蟲洞自動置頂顯示。<br>• <b>分組</b>：右鍵 → 移動到分組，整理進資料夾。<br>• <b>聚焦模式</b>：圖示精簡視圖，蟲洞面板右上角按鈕切換。<br>• <b>歷史紀錄</b>（紫色標籤）：自動記錄最近造訪頻道，點擊即可返回。</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>✉️ 傳送訊息</div><div class='mm-content'>• <b>右鍵</b>蟲洞 → <b>在此頻道傳送訊息</b> 開啟輸入欄。<br>• <span class='mm-key'>Ctrl+V</span> 直接貼上圖片，圖文合為一則訊息一起送出。<br>• 底部選項（跨次保留）：自動關閉 · 前往頻道 · 顯示通知。<br>• 傳送後彈出 3 秒可點擊通知，點擊即飛往目標頻道。</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>⚙️ 設定選單與 API 模式</div><div class='mm-content'>• <b>長按 <span class='mm-key'>＋</span> 1 秒</b>即可開啟蟲洞設定選單。<br>• 選單項目：<span class='mm-key'>➕ 建立新蟲洞</span> · <span class='mm-key'>✉️ 傳訊方式與 API 模式</span> · <span class='mm-key'>⚙️ 更多設定</span>（可擴充）。<br>• 點擊「<b>傳訊方式與 API 模式</b>」→ 開啟 API 設定面板：<br>&nbsp;&nbsp;— <b>方案 A（跳頁）</b>：自動切換頻道，注入文字後返回，無需 Token。<br>&nbsp;&nbsp;— <b>方案 B（直接 API）</b>：REST API 直送，不切換頁面，即時且隱匿。<br>• Token 由背景靜默攔截 Discord 自身請求取得——<b>絕不寫入磁碟或外傳。</b><br>• 頁面重整後：開啟傳訊輸入欄時攔截器會自動重啟。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🔍 重複網址偵測</div><div class='mm-content'>在聊天框貼上網址時，自動掃描是否已有相同連結出現過。<br>• <b>DOM 模式</b>（預設）：掃描目前頁面可見的所有訊息，無需 API token。<br>• <b>API 模式</b>：透過 Discord API 掃描最近 200 則訊息（需啟用蟲洞 API 模式且已攔截到 token）。<br>• 偵測到重複時，聊天頂部出現 Banner 提示，顯示該連結出現的次數。<br>• 貼上不同連結或切換頻道後，Banner 自動消失。<br>• <b>沒有 Banner = 沒有重複</b>——未命中時偵測器靜默在背景運行。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🔎 頻道搜尋 Channel Scout</div><div class='mm-content'>直接在聊天視窗以關鍵字搜尋目前頻道的訊息。<br>• <b>開啟</b>：點擊輸入框上方的 🔎 懸浮按鈕，或在輸入框外按 <span class='mm-key'>F2</span>。<br>• <b>即時搜尋</b>：輸入時結果即時更新（150ms 延遲），命中關鍵字以金色高亮標示。<br>• <b>快捷標籤</b>：最多儲存 5 個自定義關鍵字作為一鍵搜尋按鈕。左鍵搜尋 · 右鍵刪除。<br>• <b>搜尋歷史</b>：點擊 🕐 按鈕顯示最近 5 筆記錄，點擊即可重新搜尋。<br>• <b>跳至訊息</b>：點擊任一結果，頁面自動捲動並以藍紫框高亮標記目標訊息。<br>• <b>貼上按鈕</b>：點擊 📋 直接將剪貼簿內容填入搜尋框。<br>• 按 <span class='mm-key'>ESC</span>、<span class='mm-key'>F2</span> 或點擊面板外關閉。<br>⚠ 僅 DOM 模式——只能搜尋目前已渲染的訊息。需要搜尋更早的訊息時，請先向上捲動讓 Discord 載入歷史訊息。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌫️ 弱化使用者訊息</div><div class='mm-content'>將特定使用者的訊息柔和地弱化至背景，讓它們不再吸引注意，但不會消失。<br>• <b>加入弱化</b>：對任意訊息按右鍵 → 原生選單中「封鎖」下方出現 <b>🌫️ 弱化訊息：{名稱}</b>，點擊即可。<br>• <b>解除弱化</b>：再次對同一使用者的訊息按右鍵 → <b>✅ 解除弱化：{名稱}</b>。<br>• <b>管理面板</b>：按 <span class='mm-key'>Alt+B</span> 開啟弱化名單，顯示所有被弱化的使用者、加入時間及解除按鈕。<br>• 被弱化的訊息顯示為 <b>7% 不透明度</b>，滑鼠移入可暫時預覽至 42% 透明度。<br>• 以<b>顯示名稱</b>識別（非 User ID），跨所有頻道有效。<br>• 新訊息抵達時自動套用，切換頻道後也會自動重新套用。<br>• 資料永久儲存於 GM storage，頁面重整後仍然保留。</div></div></div></div>`,
      reload_confirm: "語言設定已儲存！\n是否立即重新整理頁面以套用變更？",
      copy_text: "📋 複製文字內容",
      copy_media_url: "🖼️ 複製媒體網址",
      no_content: "⚠️ 無可複製內容",
      copy_first_link: "🔗 複製第一個連結 (已淨化)",
      copy_markdown: "🧾 複製為 Markdown",
      copy_all_links: "📎 複製所有連結",
      insert_format_link: "📌 插入 [{t}](網址) 格式",
      copy_hidden_format: "🙈 複製 隱藏格式（|| 內容 ||）",
      download_images: "⬇️ 下載本則圖片或媒體",
      download_zip: "📦 下載為 ZIP (批次打包)",
      download_start: "🚀 開始下載...",
      download_zip_start: "📦 正在打包 {n} 個檔案...",
      download_fail: "❌ 下載失敗",
      download_cors_fail:
        "⚠️ 此縮圖受 CORS 限制，無法直接下載。請複製網址後手動開啟儲存。",
      original_url: "🔗 原始網址",
      convert_all: "⚡ 全部轉為 ({n})",
      convert_imgur: "🖼️ 轉為 i.imgur.com",
      to_twitter: "🐦 轉為 twitter.com",
      to_x: "❌ 轉為 x.com",
      to_vxtwitter: "🔁 轉為 vxtwitter",
      to_fixupx: "🛠️ 轉為 fixupx",
      to_fxtwitter: "🔧 轉為 fxtwitter",
      to_cunnyx: "🍑 轉為 cunnyx",
      to_fixvx: "🧩 轉為 fixvx",
      to_reddit: "👽 轉為 reddit.com",
      to_old_reddit: "📜 轉為 old.reddit",
      to_rxddit: "🔁 轉為 rxddit",
      to_vxreddit: "🛠️ 轉為 vxreddit",
      to_instagram: "📷 轉為 instagram.com",
      to_kkinstagram: "🔁 轉為 kkinstagram",
      to_vxinstagram: "🔁 轉為 vxinstagram",
      to_ddinstagram: "🔁 轉為 ddinstagram",
      to_uuinstagram: "🔁 轉為 uuinstagram",
      to_facebed: "🔁 轉為 facebed.com",
      to_tiktok: "🎵 轉為 tiktok.com",
      to_vxtiktok: "🔁 轉為 vxtiktok",
      to_tnktok: "🛠️ 轉為 tnktok",
      to_threads: "🧵 轉為 threads.com",
      to_fixthreads: "🔁 轉為 fixthreads",
      to_fx_bilibili: "📺 轉為 FX Bilibili",
      to_vx_bilibili: "📼 轉為 VX Bilibili",
      to_b23: "🔗 轉為 b23.tv",
      to_vxb23: "🔗 轉為 vxb23.tv",
      to_phixiv: "🔙 轉為 phixiv.net",
      to_pixiv: "🎨 轉為 pixiv.net",
      yt_shorts_to_watch: "▶️ YT Shorts → 一般連結",
      restore_pixiv_img: "📖 從圖片還原 pixiv/phixiv",
      insert_symbol: "✳️ 插入 → {s}",
      delete_symbol: "❌",
      delete_confirm: "已刪除: {s}",
      add_symbol: "➕ 新增字串",
      add_symbol_prompt: "輸入要新增的純文字：",
      add_success: "已新增",
      remove_symbol: "➖ 刪除字串",
      remove_symbol_prompt: "輸入要刪除的內容：",
      remove_empty: "無內容",
      mode_hover: "🔄 Hover",
      mode_click: "🖱️ Click",
      mode_desc: "目前: {mode} (點擊切換)",
      mode_changed: "觸發模式已變更: {mode}",
      export_success: "✅ 設定已匯出！\n\n內容已複製到剪貼簿。",
      import_prompt: "⬇️ 請貼上您的備份代碼 (JSON格式)：",
      import_success: "✅ 設定匯入成功！\n頁面將自動重新整理。",
      import_fail: "❌ 匯入失敗：格式錯誤。",
      insert_success: "已插入",
      copy_success: "已複製",
      copy_fail: "複製失敗",
      input_not_found: "找不到輸入框",
      edit_link_text: "編輯連結前綴",
      enter_link_text: "輸入連結前綴文字 (留空則移除)：",
      tip_style: "選單風格: 平面 / 群組",
      tip_trigger: "觸發模式: 懸停 / 點擊",
      tip_logic: "點擊邏輯: 複製 / 填充",
      tip_space: "尾部空一格",
      tip_newline: "尾部換行",
      tip_symbols: "自定義字串",
      tip_lang: "切換語言",
      tip_manual: "使用說明",
      mod_msg_warn_title: "⚠️ 確定停用訊息工具？",
      mod_msg_warn_body:
        "⠿ 訊息工具是本腳本的核心功能。\\n停用後，所有訊息的 ⠿ 按鈕將會消失。\\n\\n若要重新啟用：右鍵點擊 Tampermonkey 圖示 → 選擇「啟用 ⠿ 訊息工具」。",
      mod_msg_warn_confirm: "仍要停用",
      mod_msg_warn_cancel: "取消",
      mod_msg_enable_menu: "啟用 ⠿ 訊息工具",
      rescue_reload_msg: "設定已更新。需要重新整理頁面才能生效。是否立即重新整理？",
      rescue_close_btn: "關閉",
      grp_copy: "📝 複製相關 >",
      grp_convert: "🔄 轉換相關 >",
      grp_download: "⬇️ 下載相關 >",
      grp_system: "⚙️ 系統與符號 >",
      grp_webhook: "🔗 Webhook >",
      view_main: "主選單",
      view_symbols: "自定義字串",

      // --- Module C (Expression Helper) - [UPDATED] ---
      em_title: "😊 表情/GIF 整合管理",
      em_content:
        "• <b>工具列</b>：[📁] 收藏庫 | [🎯] 準心選取 | [★] 關鍵字。<br>• <b>準心模式</b>：點擊後可直接選取畫面上的 GIF 或表情加入收藏。<br>• <b>收藏庫</b>：支援分頁管理，可拖曳分頁排序。<br>• <b>Shift + 點擊</b>：連續發送收藏項目不關閉面板。",
      em_picker_tip: "🔍 請點擊畫面上的 GIF/表情 進行收藏 (點擊黑幕取消)",
      em_err_no_list: "找不到列表容器，請先開啟表情或 GIF視窗！",
      em_btn_add_title: "收藏搜尋關鍵字，按住Shift可以連續刪除關鍵字。",
      em_btn_active_title: "點擊: 填入關鍵字 (切換)",
      em_btn_target_title: "準心模式：點擊畫面上的 GIF/表情 以直接收藏",
      em_btn_save_this: "將此項目加入收藏庫",
      em_no_favs: "尚無收藏",
      em_del_confirm: "刪除「{k}」?",
      em_note_prompt: "備註：",
      em_set_cover_success: "已設定封面圖！",

      // --- Module D (Wormhole) ---
      wm_url_prompt: "請輸入 Discord 頻道完整網址 (URL)：",
      wm_name_prompt: "請輸入蟲洞名稱 (例如: 閒聊區)：",
      wm_edit_title: "編輯蟲洞：{n}",
      wm_created: "已建立蟲洞！",
      wm_deleted: "已關閉蟲洞。",
      wm_nav_fail: "導航失敗，請檢查網址。",
      wm_alert_invalid_url:
        "無效的連結！請複製 Discord 頻道網址 (包含 /channels/)。",
      wm_default_channel_name: "頻道",
      wm_refresh_confirm:
        "已建立蟲洞，但介面無法即時更新。\n這可能是 Discord 暫時鎖定了介面。\n\n是否立即重新整理頁面以顯示？",
      wm_root_group: "未分類",

      // 選單動作
      wm_menu_edit: "✎ 編輯名稱",
      wm_menu_del: "🗑️ 關閉蟲洞",
      wm_menu_vip_add: "★ 設為 VIP (置頂)",
      wm_menu_vip_remove: "☆ 取消 VIP",
      wm_menu_move: "📂 移動到群組",

      // 群組相關
      wm_group_prompt: "請輸入新群組名稱：",
      wm_edit_group: "編輯群組名稱：",
      wm_group_del_confirm: "解散群組「{n}」？(內含蟲洞將會保留)",
      wm_group_select_prompt:
        "請輸入數字選擇群組：\n\n0. [根目錄/未分類]\n{list}\n\n留空並按下確認可建立「新群組」：",
      wm_group_invalid: "無效的群組選擇！",
      wm_move_prompt: "移動到哪個群組？(輸入數字)\n\n{list}",
      wm_icon_picker_title: "選擇 {name} 的圖示",
      wm_icon_set_success: "✅ 已設定 {name} 的圖示",
      wm_icon_empty: "請先在蒐藏圖片模組中新增 Emoji",

      // 聚焦模式
      wm_title: "蟲洞控制台\n• 單擊：建立新蟲洞\n• 長按 1 秒：開啟設定選單",
      wm_settings_menu_title: "🌀 蟲洞設定",
      wm_settings_create: "建立新蟲洞",
      wm_settings_send_mode: "傳訊方式與 API 模式",
      wm_settings_more: "更多設定（敬請期待）",
      wm_settings_position: "切換蟲洞顯示位置",
      wm_settings_position_navbar: "導航欄",
      wm_settings_position_titlebar: "頻道標題欄",
      wm_settings_position_input: "訊息輸入框上緣",
      wm_settings_position_topleft: "左上角（固定懸浮）",
      wm_focus_on: "關閉聚焦模式",
      wm_focus_off: "開啟聚焦模式（僅顯示圖示）",
      wm_focus_size: "圖示大小",
      wm_focus_size_s: "S  · 小",
      wm_focus_size_m: "M  · 中",
      wm_focus_size_l: "L  · 大",

      // 蟲洞傳送訊息
      wm_menu_send: "✉️ 在此頻道傳送訊息",
      wm_send_placeholder: "輸入要傳送到 #{name} 的訊息...",
      wm_send_btn: "傳送",
      wm_send_cancel: "取消",
      wm_send_waiting: "等待編輯器就緒...",
      wm_send_injecting: "正在傳送...",
      wm_send_success: "✅ 已傳送到 #{name}！",
      wm_send_toast_title: "✅ 已傳送到 #{name}",
      wm_send_toast_hint: "點擊可前往該頻道",
      wm_send_waiting_token: "⏳ 等待 Token 就緒…",
      wm_send_fail: "❌ 傳送失敗，編輯器未就緒。",
      wm_send_empty: "訊息不能為空白。",
      wm_send_returning: "返回原頻道...",
      wm_send_hint: "Shift+點擊蟲洞可在不切換頻道的情況下傳送",
      wm_send_field_add:    "+ 新增欄位",
      wm_send_field_del:    "移除欄位",
      wm_send_sending_n:    "傳送中 {n}/{total}…",
      wm_send_cool_warn:    "冷卻中：{s} 秒後傳送下一則",
      wm_send_chat_btn:     "傳送訊息",
      wm_send_mode_api: "⚡ API 模式",
      wm_send_mode_nav: "🔀 跳頁模式",
      wm_send_mode_desc_api: "直接傳送，不切換頻道",
      wm_send_mode_desc_nav: "切換至目標頻道後傳送",
      wm_send_autoclose: "傳送後自動關閉",
      wm_send_show_toast: "顯示傳訊通知",
      wm_send_goto_channel: "傳送後前往該頻道",
      wm_send_paste_hint: "📋 可 Ctrl+V 貼上圖片",
      wm_send_token_warn:
        "⚠️ Token 已失效，請重新開啟彩蛋面板偵測。本次使用方案 A。",
      wm_send_channel_fail: "❌ 頻道載入失敗",
      wm_send_editor_missing: "❌ 找不到輸入框",
      wm_send_uploading: "📎 上傳 {n} 張圖片...",

      // 方案 B — API 模式
      wm_api_panel_title: "⚗️ 蟲洞 API 模式（進階）",
      wm_api_mode_label_a: "方案 A — 跳頁模式（預設）",
      wm_api_mode_label_b: "方案 B — 直接 API（不切換頁面）",
      wm_api_warning_title: "⚠️ 風險聲明",
      wm_api_warning_body:
        "使用 User Token 呼叫 Discord API 違反 Discord 服務條款，帳號可能面臨封禁風險，請自行評估。",
      wm_api_token_status_none: "Token：尚未偵測",
      wm_api_token_status_ready: "Token：已就緒（僅存於記憶體）",
      wm_api_detect_btn: "偵測我的 Token",
      wm_api_detect_confirm:
        "【Token 攔截授權同意書】\n\n點擊「確認」即代表您同意本腳本在本次工作階段中攔截您的 Discord Token。\n\n🔒 安全保證：\n• 僅存於瀏覽器記憶體，絕不寫入任何儲存空間或磁碟\n• 頁面關閉或重新整理後自動清除，不留任何痕跡\n• 絕不傳送至任何外部伺服器，所有請求直接發往 discord.com\n• 僅用於代您執行 POST /channels/{id}/messages 操作\n\n⚠️ 使用者聲明：\n• 您了解此 Token 具備傳送訊息的能力\n• 透過本模式傳送的所有訊息，責任由您自行承擔\n\n請在確認信任本腳本且理解上述內容後再繼續。",
      wm_api_detect_waiting: "⬆️ 請切換到任意頻道一次，即可自動捕捉 Token",
      wm_api_enable_btn: "啟用 API 模式",
      wm_api_disable_btn: "停用 API 模式（返回方案 A）",
      wm_api_enabled_toast: "✅ API 模式已啟用",
      wm_api_disabled_toast: "↩️ 已返回跳頁模式",
      wm_api_view_code: "查看 Token 攔截代碼",
      wm_api_clear_token: "🗑 清除 Token",
      wm_api_reset_all: "🗑️ 重置所有蟲洞資料",
      wm_api_plan_b_first: "請先選擇方案 B",
      wm_api_send_fail: "❌ API 傳送失敗，請查看主控台",

      // --- 收藏庫與工具提示 ---
      em_col_title: "我的收藏庫",
      em_col_add_success: "已儲存到「{g}」！",
      em_col_tab_new: "新增分頁",
      em_col_tab_prompt: "新分頁名稱：",
      em_col_empty_tab: "此分頁尚無內容。",
      em_col_del_tab_confirm: "刪除分頁「{n}」及其所有項目？",
      em_modal_choose_tab: "儲存到哪個收藏庫？",
      em_modal_create_new: "+ 建立新的...",
      em_col_refresh_tooltip: "重新整理 GIF 預覽 (刷新過期的 CDN 快取)",
      em_refresh_no_expired:   "ℹ️ 此分頁無過期的 GIF",
      em_refresh_consent:      "⚠️ 關於 GIF 刷新功能\n\n此功能將透過第三方代理伺服器（fixcdn.hyonsu.com）\n重新取得 Discord 附件連結的存取憑證。\n\n注意事項：\n• 你的圖片網址（URL）將傳送至 fixcdn.hyonsu.com\n• 該服務為第三方個人維護，與 Discord 及本腳本無關\n• 建議搜尋「fixcdn hyonsu」了解其運作方式後再決定\n\n是否繼續？",
      em_refresh_cancel_tip:   "ℹ️ 已取消。手動更新步驟：\n① 在 Discord 找到原始 GIF 訊息\n② 重新點選收藏加入蒐藏匣",
      em_refresh_loading:      "Refreshing...",
      em_refresh_ok:           "✨ 已刷新 {n} 個 GIF{fail} {track}",
      em_refresh_partial_fail: "（{f} 個失敗）",
      em_refresh_fail:         "⚠️ 無法刷新此分頁的 GIF",
      em_refresh_track_api:    "（Discord API）",
      em_refresh_track_cdn:    "（fixcdn）",
      em_tip_pick: "設定封面圖",
      em_tip_edit: "編輯備註",
      em_tip_delete: "刪除",
      em_menu_emoji: "表情符號",
      em_menu_sticker: "貼圖",
      em_menu_gif: "GIF",

      // --- GM 選單命令 ---
      menu_export: "📤 匯出設定 (Backup)",
      menu_import: "⬇️ 匯入設定 (Restore)",
      menu_change_lang: "🌐 變更語言 (Language)",
      custom_lang_desc:
        "點「📤 匯出文本」取得英文原文 JSON，翻譯後再點「📥 匯入文本」貼回即可套用。",
      custom_lang_export: "📤 匯出文本",
      custom_lang_import: "📥 匯入文本",
      custom_lang_apply: "✅ 套用並重新整理",
      custom_lang_loaded: "✅ 已載入：{name}",
      custom_lang_activate: "🌐 套用「{name}」",
      custom_lang_json_error: "⚠️ JSON 格式錯誤：{msg}",
      custom_lang_paste_hint: "貼上翻譯後的 JSON 文本 …",
      copy_media_prefixed: "✅ 已複製 {n} 個帶前綴媒體連結",
      copy_media_urls: "✅ 已複製 {n} 個媒體連結",
      wormhole_reset_success: "✅ 資料已清除，正在重新整理…",
      // --- Module F (Webhook) ---
      wh_panel_title: "🔗 Webhook 管理",
      wh_enable: "啟用 Webhook",
      wh_tip: "Webhook 管理",
      wh_add_name_ph: "標籤（例：動物）",
      wh_add_url_ph: "https://discord.com/api/webhooks/…",
      wh_btn_add: "＋ 新增",
      wh_btn_test: "測試",
      wh_btn_delete: "刪除",
      wh_test_ok: "✅ 測試已送出！",
      wh_test_fail: "❌ 測試失敗",
      wh_send_content: "📨 傳送訊息至 Webhook ▶",
      wh_send_urls: "🔗 傳送網址至 Webhook ▶",
      wh_no_webhooks: "尚未新增任何 Webhook",
      wh_send_ok: "✅ 已傳送至 [{name}]",
      wh_send_fail: "❌ 傳送失敗 [{name}]",
      wh_no_urls: "⚠️ 此訊息中無網址",
      wh_url_invalid: "⚠️ Webhook 網址無效",
      wh_btn_edit: "編輯",
      wh_btn_save: "儲存",
      wh_btn_cancel: "取消",
      wh_keep_source: "📎 附上來源連結",
      wh_keep_source_tip: "勾選後，傳送內容末尾會附上該訊息的原始連結。",

      // --- Module G (URL Checker) ---
      uc_duplicate_found: "⚠️ 此網址已在最近 {limit} 則訊息中出現 {count} 次",
      uc_duplicate_found_plural: "⚠️ {n} 個重複網址，最多出現 {count} 次（掃描最近 {limit} 則）",
      uc_dom_found: "⚠️ 此網址在目前可見 {limit} 則訊息中出現 {count} 次（DOM 模式 · 不需 API）",
      uc_no_token: "🔍 重複網址偵測需要蟲洞 API 模式 — 請長按蟲洞 ＋ 鍵 1 秒開啟設定",
      uc_token_waiting: "⏳ 等待 API Token 就緒… 請切換至任意頻道一次以自動捕捉",
      uc_fetching: "🔄 正在掃描重複網址…",
      uc_dismiss: "✕",
      uc_limit_label: "掃描範圍：",
      uc_limit_suffix: "則訊息",
      // --- Missing keys ---
      welcome_title: "歡迎使用 {script}",
      em_save_success: "已儲存：{k}",

      // --- Module tips ---
      mod_tip_message:    "對任何訊息按右鍵，透過 ⠿ 按鈕快速複製、書籤或執行其他操作。",
      mod_tip_forwarding: "將訊息轉發到收藏頻道或使用者，在聊天輸入框上方顯示轉發工具列。",
      mod_tip_emoji:      "輸入時從可搜尋的彈出視窗瀏覽並插入伺服器表情符號。",
      mod_tip_header:     "解鎖媒體右鍵、啟用檔案下載輔助及防內容劫持保護。",
      mod_tip_wormhole:   "透過聊天頂部的快捷按鈕快速跳轉到已釘選頻道，支援 VIP、群組與聚焦模式。",
      mod_tip_webhook:    "直接從任何頻道發送訊息到已登記的 Webhook。",
      mod_tip_urlchecker: "當貼上的網址已在近期訊息中出現過時發出警告，不需 API token 即可運作（DOM 模式）。",
      mod_tip_scout:      "點擊輸入框上方的搜尋按鈕，或使用快捷鍵，以關鍵字搜尋目前頻道的訊息。",
      mod_tip_blacklist:  "將特定使用者的訊息弱化至背景，讓它們不再吸引注意。對任何訊息按右鍵即可新增。",

      // --- Channel Scout ---
      cs_panel_title:   "⌨ 頻道搜尋",
      cs_placeholder:   "輸入關鍵字搜尋頻道訊息…",
      cs_paste_tip:     "貼上剪貼簿內容",
      cs_history_tip:   "最近搜尋記錄",
      cs_no_history:    "尚無搜尋記錄",
      cs_empty_hint:    "輸入關鍵字或點擊標籤搜尋",
      cs_no_results:    "找不到符合的訊息",
      cs_dom_mode_note: "DOM 模式 · 僅搜尋頁面已載入訊息",
      cs_right_del_tip: "右鍵標籤可刪除",
      cs_add_tag:        "+ 新增標籤",
      cs_add_tag_prompt: "輸入新標籤（右鍵標籤可刪除）：",
      cs_float_title:   "頻道搜尋 (F2)",
      cs_float_label:   "頻道搜尋",

      // --- Mute User ---
      mu_panel_title:   "🌫️ 弱化使用者訊息",
      mu_empty:         "尚未弱化任何使用者\n對訊息按右鍵可加入",
      mu_remove_btn:    "解除",
      mu_footer_left:   "右鍵訊息加入 · hover 可預覽內容",
      mu_footer_right:  "GMStore 永久儲存",
      mu_add_toast:     "🌫️ 已弱化：{name}",
      mu_remove_toast:  "✅ 已解除弱化：{name}",
      mu_ctx_mute:      "🌫️ 弱化訊息：{name}",
      mu_ctx_unmute:    "✅ 解除弱化：{name}",
      mu_shortcut:      "Alt+B 開啟弱化管理面板",
      mu_temp_card_name: "臨時",
      mu_temp_card_desc: "計時結束自動解除",
      mu_temp_quick:    "快速選擇",
      mu_temp_placeholder: "例：3H、1D 6H、27H 20M",
      mu_temp_confirm:  "⏳ 臨時靜音",
      mu_temp_expired_toast: "⏰ 臨時靜音已到期：{name}",
      mu_temp_badge_label: "⏳",
      mu_settings_tab_list:    "靜音名單",
      mu_settings_tab_style:   "樣式設定",
      mu_settings_clear_all:   "全部清除",
      mu_settings_clear_confirm: "確認移除所有靜音對象？",
      mu_settings_ghost_delay: "Ghost 飄走延遲（秒）",
      mu_settings_title:       "設定",
    },    "zh-CN": {
      name: "简体中文",
      // --- Module A (Forwarding) ---
      fm_pinned_channels: "★ 收藏频道",
      fm_toggle_flat: "切换至：平铺显示",
      fm_toggle_drop: "切换至：下拉菜单",
      fm_help: "使用说明",
      fm_prompt_channel: "输入频道关键字：",
      fm_prompt_user: "输入用户关键字 (例如: mighty)：",
      fm_user_zone: "用户专区",
      fm_no_users: "尚无收藏的用户",
      fm_add_user: "+ 新增用户",
      fm_fuzzy: "模糊搜索",
      fm_remove_confirm: "移除「{target}」？",
      fm_tooltip_channel: "频道: {c}\n服务器: {s}",
      fm_tooltip_user_add: "加入用户专区 (👤)",
      fm_tooltip_star_add: "加入频道收藏 (★)",
      fm_manual_title: "📚 使用说明书",
      fm_sec_star: "★ 收藏与管理",
      fm_sec_star_content:
        "• 点击 <span class='help-key'>★</span> 或 <span class='help-key'>👤+</span> 加入收藏。<br>• <span class='help-key'>右键</span> 移除收藏。<br>• <span class='help-key'>Shift+右键</span> 可快速连续移除 (无需确认)。",
      fm_sec_search: "🔍 两段式搜索 (默认)",
      fm_sec_search_content:
        '• 点击收藏按钮后，会自动执行"预热 -> 输入 -> 锁定"流程。<br>• 这是为了修复 Discord"直接填入搜索不到"的 Bug。<br>• 搜索时会进行 <span style=\'color:#2dc770\'>精准比对</span>，确保不会转发错人。',
      fm_sec_fuzzy: "⏎ 模糊搜索",
      fm_sec_fuzzy_content:
        "• 点击按钮右侧的 <span class='help-key'>⏎</span> 小箭头。<br>• 仅输入前两个字或第一个单词，适合名称有变动或符号的频道。",
      fm_sec_user: "👤 用户专区",
      fm_sec_user_content:
        "• 点击最右侧的 <span class='help-key'>👤</span> 按钮可展开用户清单。<br>• 支持手动新增用户 ID (适合找不到人的情况)。",
      fm_sec_misc_title: "⚙️ 显示与小技巧",
      fm_sec_misc:
        "• 左上角按钮可切换<b>平铺</b>或<b>下拉菜单</b>显示模式。<br>• <b>历史记录</b>（紫色标签）会自动记录最近访问的频道，点击可立即跳回。",

      // --- Module D (Wormhole) 说明 ---
      fm_sec_wormhole: "🌀 虫洞 — 基本操作",
      fm_sec_wormhole_content:
        "• 点击 <span class='help-key'>＋</span> 创建按钮，粘贴 Discord 频道网址即可创建虫洞快捷方式。<br>" +
        "• <b>单击</b>虫洞 → 立即跳转至该频道。<br>" +
        "• <b>右键</b>虫洞 → 打开菜单：重命名、删除、设置图标、移动到分组、切换 VIP。<br>" +
        "• <b>VIP（★）</b>：设为 VIP 的虫洞会自动置顶显示。<br>" +
        "• <b>分组</b>：通过右键 → 移动到分组，可将虫洞整理进文件夹。<br>" +
        "• <b>聚焦模式</b>：仅显示图标的精简视图，可通过虫洞面板右上角按钮切换。",

      fm_sec_wm_send: "✉️ 虫洞 — 发送消息",
      fm_sec_wm_send_content:
        "• <b>右键</b>虫洞 → <b>在此频道发送消息</b>，打开消息输入框。<br>" +
        "• <b>方案 A（跳页模式）</b>：自动切换至目标频道，将文字注入 Discord 编辑器后返回，无需 API。<br>" +
        "• <b>Shift + 点击</b>虫洞 → 在当前频道打开输入框（不跳页）。<br>" +
        "• 支持 <b>Ctrl+V 粘贴图片</b>，图片与文字会合并成一条消息一起发送。<br>" +
        "• 底部选项：<b>发送后自动关闭</b> / <b>发送后前往该频道</b>（二者互斥）/ <b>显示发送通知</b>。<br>" +
        "• 发送成功后会出现可点击的通知，点击后立即跳转到目标频道。",

      fm_sec_wm_api: "⚡ 虫洞 — API 模式（彩蛋）",
      fm_sec_wm_api_content:
        "• <b>长按虫洞创建按钮（＋）3 秒</b>，即可解锁 API 模式设置面板。<br>" +
        "• <b>方案 B（直接 API）</b>：通过 Discord REST API 发送消息，无需切换页面，速度更快、更隐蔽。<br>" +
        "• Token 由脚本在后台静默拦截（来自 Discord 自身发出的请求），<b>绝不存储或外传</b>，仅存于内存，关闭页面即消失。<br>" +
        "• 启用方案 B 后，Token 检测会自动在后台运行，正常使用 Discord 即可自动捕获，无需手动操作。<br>" +
        "• API 模式支持图片上传（multipart/form-data），图文可一次发出。<br>" +
        "• 页面刷新后若 Token 丢失，打开发送窗口时拦截器会自动重启。",

      // --- Module B (Message Utils) ---
      welcome_title: "欢迎使用 {script}",
      select_lang_subtitle: "请选择您的界面语言",
      help_btn: "📖 使用说明",
      cancel_btn: "✕ 关闭",
      security_notice_title: "⚠️ 安全与免责声明",
      security_notice_content:
        '本脚本提供的"网址转换"功能（如 vxtwitter, kkinstagram 等）皆依赖第三方开源服务。\n若您不信任这些第三方服务，请勿点击转换选项。\n请使用者自行具备辨识网址安全性的能力。',
      manual_content:
        "【图标说明】\n• ◫/≡ : 切换菜单风格 (平面 / 群组)\n• ⇄ : 点击逻辑互换 (复制 / 填充)\n• ␣ : 尾部添加空格\n• ↵ : 尾部添加换行\n• ☆ : 自定义字符串面板\n• 🖱️ : 切换触发模式 (悬停 / 点击)\n• 🌐 : 切换语言\n\n【操作方式】\n• **单击**: 复制 (默认)\n• **长按 (0.5秒)**: 填充至输入框\n• **Shift+单击**: 同时复制并填充 (保持菜单开启)",
      manual_content_sections: `<div class='mm-section'><div class='mm-sec-title c-default'>⚡ 快速开始</div><div class='mm-content'>将鼠标悬停在任意 Discord 消息上 → 右上角出现复制按钮。<br><b>单击</b>复制文字 · <b>长按 0.5秒</b>填充到输入框 · <b>Shift+单击</b>同时复制并填充（菜单保持开启）。<br>通过工具栏的 <span class='mm-key'>🖱️</span> 可切换为<span class='mm-key'>点击模式</span>，改为手动触发。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 复制菜单 — 文字与链接</div><div class='mm-content'>• <b>复制文字</b>：复制消息的完整文字内容。<br>• <b>复制媒体网址</b>：复制消息中图片或视频的直接链接。<br>• <b>复制第一个链接（已净化）</b>：提取并清除追踪参数的第一个 URL。<br>• <b>复制所有链接</b>：将消息中所有 URL 每行一个一次复制。<br>• <b>复制为 Markdown</b>：格式化为 <span class='mm-key'>[文字](URL)</span> 供 Markdown 使用。<br>• <b>插入 Markdown 链接</b>：直接将链接格式注入 Discord 的输入框。<br>• <b>隐藏格式</b>：自动包裹为 <span class='mm-key'>|| 剧透内容 ||</span> 格式。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ 下载</div><div class='mm-content'>• <b>下载图片/媒体</b>：下载该条消息中的所有图片或视频。<br>• <b>下载为 ZIP</b>：多个文件自动打包为单一 ZIP 压缩包。<br>• 下载失败时自动重试，并备援切换至备用链接。</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 网址转换</div><div class='mm-content'><b>Twitter / X</b>：在 twitter.com、x.com、vxtwitter、fixupx、fxtwitter、cunnyx 之间互转，修复 Discord 预览。<br><b>Instagram</b>：instagram.com ↔ kkinstagram.com，让嵌入预览正常显示。<br><b>Bilibili</b>：转换为 FX Bilibili 或 VX Bilibili 获得更好的嵌入效果。<br><b>Pixiv</b>：pixiv.net ↔ phixiv.net 互转，在 Discord 直接显示插图预览。<br><b>批量转换</b>：<span class='mm-key'>⚡ 全部转为 (N)</span> 一次处理消息中同类型的所有链接。</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>🎛️ 工具栏图标说明</div><div class='mm-content'><div class='mm-grid'><div><span class='mm-key'>◫/≡</span> 切换菜单风格：平面 / 群组</div><div><span class='mm-key'>⇄</span> 互换点击逻辑：复制 ↔ 填充</div><div><span class='mm-key'>␣</span> 填充时在尾部附加空格</div><div><span class='mm-key'>↵</span> 填充时在尾部附加换行</div><div><span class='mm-key'>☆</span> 自定义字符串面板（常用片段）</div><div><span class='mm-key'>🖱️</span> 切换触发方式：悬停 / 点击</div><div><span class='mm-key'>🌐</span> 切换界面语言</div></div></div></div><div class='mm-section'><div class='mm-sec-title c-default'>☆ 自定义字符串面板</div><div class='mm-content'>• 储存常用的文字片段（问候语、模板、代码块等）。<br>• 单击复制 · 长按填充到输入框。<br>• <span class='mm-key'>Shift+单击</span> 可连续删除条目，无需逐一确认。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 虫洞 — 总览</div><div class='mm-content'>虫洞是存在 Discord 侧边栏的<b>一键频道快捷方式</b>。点击 <span class='mm-key'>＋</span> 并粘贴 Discord 频道网址即可创建。<br><b>单击</b> <span class='mm-key'>＋</span> → 创建新虫洞 · <b>长按 1 秒</b> → 打开设置菜单。</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>🖱️ 导航与管理</div><div class='mm-content'>• <b>单击</b>虫洞 → 立即跳转至该频道。<br>• <b>右键</b>虫洞 → 菜单：重命名 · 删除 · 设置图标 · 移至群组 · 切换 VIP。<br>• <b>VIP <span class='mm-key'>★</span></b>：设为 VIP 的虫洞自动置顶显示。<br>• <b>分组</b>：右键 → 移动到分组，整理进文件夹。<br>• <b>聚焦模式</b>：图标精简视图，虫洞面板右上角按钮切换。<br>• <b>历史记录</b>（紫色标签）：自动记录最近访问频道，点击即可返回。</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>✉️ 发送消息</div><div class='mm-content'>• <b>右键</b>虫洞 → <b>在此频道发送消息</b> 打开输入框。<br>• <span class='mm-key'>Ctrl+V</span> 直接粘贴图片，图文合为一条消息一起发送。<br>• 底部选项（跨次保留）：自动关闭 · 前往频道 · 显示通知。<br>• 发送后弹出 3 秒可点击通知，点击即跳转到目标频道。</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>⚙️ 设置菜单与 API 模式</div><div class='mm-content'>• <b>长按 <span class='mm-key'>＋</span> 1 秒</b>即可打开虫洞设置菜单。<br>• 菜单项目：<span class='mm-key'>➕ 创建新虫洞</span> · <span class='mm-key'>✉️ 发送方式与 API 模式</span> · <span class='mm-key'>⚙️ 更多设置</span>（可扩展）。<br>• 点击「<b>发送方式与 API 模式</b>」→ 打开 API 设置面板：<br>&nbsp;&nbsp;— <b>方案 A（跳页）</b>：自动切换频道，注入文字后返回，无需 Token。<br>&nbsp;&nbsp;— <b>方案 B（直接 API）</b>：REST API 直发，不切换页面，即时且隐蔽。<br>• Token 由后台静默拦截 Discord 自身请求取得——<b>绝不写入磁盘或外传。</b><br>• 页面刷新后：打开发送输入框时拦截器会自动重启。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🔍 重复链接检测</div><div class='mm-content'>在聊天框粘贴链接时，自动扫描是否已有相同链接出现过。<br>• <b>DOM 模式</b>（默认）：扫描当前页面可见的所有消息，无需 API token。<br>• <b>API 模式</b>：通过 Discord API 扫描最近 200 条消息（需启用虫洞 API 模式且已拦截到 token）。<br>• 检测到重复时，聊天顶部出现 Banner 提示，显示该链接出现的次数。<br>• 粘贴不同链接或切换频道后，Banner 自动消失。<br>• <b>没有 Banner = 没有重复</b>——未命中时检测器静默在后台运行。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🔎 频道搜索 Channel Scout</div><div class='mm-content'>直接在聊天窗口以关键字搜索当前频道的消息。<br>• <b>打开</b>：点击输入框上方的 🔎 悬浮按钮，或在输入框外按 <span class='mm-key'>F2</span>。<br>• <b>即时搜索</b>：输入时结果即时更新（150ms 延迟），命中关键字以金色高亮标注。<br>• <b>快捷标签</b>：最多保存 5 个自定义关键字作为一键搜索按钮。左键搜索 · 右键删除。<br>• <b>搜索历史</b>：点击 🕐 按钮显示最近 5 条记录，点击可重新搜索。<br>• <b>跳至消息</b>：点击任一结果，页面自动滚动并以蓝紫框高亮标记目标消息。<br>• <b>粘贴按钮</b>：点击 📋 直接将剪贴板内容填入搜索框。<br>• 按 <span class='mm-key'>ESC</span>、<span class='mm-key'>F2</span> 或点击面板外关闭。<br>⚠ 仅 DOM 模式——只能搜索当前已渲染的消息。需要搜索更早消息时，请先向上滚动让 Discord 加载历史消息。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌫️ 弱化用户消息</div><div class='mm-content'>将特定用户的消息柔和地弱化至背景，让其不再引人注意，但不会消失。<br>• <b>加入弱化</b>：右键任意消息 → 原生菜单「封锁」下方出现 <b>🌫️ 弱化消息：{名称}</b>，点击即可。<br>• <b>解除弱化</b>：再次右键同一用户的消息 → <b>✅ 解除弱化：{名称}</b>。<br>• <b>管理面板</b>：按 <span class='mm-key'>Alt+B</span> 打开弱化名单，显示所有被弱化的用户、加入时间及解除按钮。<br>• 被弱化的消息显示为 <b>7% 不透明度</b>，鼠标移入可临时预览至 42% 透明度。<br>• 以<b>显示名称</b>识别（非 User ID），跨所有频道有效。<br>• 新消息到达时自动套用，切换频道后也会自动重新套用。<br>• 数据永久储存于 GM storage，页面刷新后仍然保留。</div></div></div></div>`,
      reload_confirm: "语言设置已保存！\n是否立即刷新页面以应用更改？",
      copy_text: "📋 复制文字内容",
      copy_media_url: "🖼️ 复制媒体网址",
      no_content: "⚠️ 无可复制内容",
      copy_first_link: "🔗 复制第一个链接 (已净化)",
      copy_markdown: "🧾 复制为 Markdown",
      copy_all_links: "📎 复制所有链接",
      insert_format_link: "📌 插入 [{t}](网址) 格式",
      copy_hidden_format: "🙈 复制 隐藏格式（|| 内容 ||）",
      download_images: "⬇️ 下载本条图片或媒体",
      download_zip: "📦 下载为 ZIP (批量打包)",
      download_start: "🚀 开始下载...",
      download_zip_start: "📦 正在打包 {n} 个文件...",
      download_fail: "❌ 下载失败",
      download_cors_fail:
        "⚠️ 此缩略图受 CORS 限制，无法直接下载。请复制网址后手动打开保存。",
      original_url: "🔗 原始网址",
      convert_all: "⚡ 全部转为 ({n})",
      convert_imgur: "🖼️ 转为 i.imgur.com",
      to_twitter: "🐦 转为 twitter.com",
      to_x: "❌ 转为 x.com",
      to_vxtwitter: "🔁 转为 vxtwitter",
      to_fixupx: "🛠️ 转为 fixupx",
      to_fxtwitter: "🔧 转为 fxtwitter",
      to_cunnyx: "🍑 转为 cunnyx",
      to_fixvx: "🧩 转为 fixvx",
      to_reddit: "👽 转为 reddit.com",
      to_old_reddit: "📜 转为 old.reddit",
      to_rxddit: "🔁 转为 rxddit",
      to_vxreddit: "🛠️ 转为 vxreddit",
      to_instagram: "📷 转为 instagram.com",
      to_kkinstagram: "🔁 转为 kkinstagram",
      to_vxinstagram: "🔁 转为 vxinstagram",
      to_ddinstagram: "🔁 转为 ddinstagram",
      to_uuinstagram: "🔁 转为 uuinstagram",
      to_facebed: "🔁 转为 facebed.com",
      to_tiktok: "🎵 转为 tiktok.com",
      to_vxtiktok: "🔁 转为 vxtiktok",
      to_tnktok: "🛠️ 转为 tnktok",
      to_threads: "🧵 转为 threads.com",
      to_fixthreads: "🔁 转为 fixthreads",
      to_fx_bilibili: "📺 转为 FX Bilibili",
      to_vx_bilibili: "📼 转为 VX Bilibili",
      to_b23: "🔗 转为 b23.tv",
      to_vxb23: "🔗 转为 vxb23.tv",
      to_phixiv: "🔙 转为 phixiv.net",
      to_pixiv: "🎨 转为 pixiv.net",
      yt_shorts_to_watch: "▶️ YT Shorts → 普通链接",
      restore_pixiv_img: "📖 从图片还原 pixiv/phixiv",
      insert_symbol: "✳️ 插入 → {s}",
      delete_symbol: "❌",
      delete_confirm: "已删除: {s}",
      add_symbol: "➕ 新增",
      add_symbol_prompt: "输入要新增的纯文本：",
      add_success: "已新增",
      remove_symbol: "➖ 删除",
      remove_symbol_prompt: "输入要删除的内容：",
      remove_empty: "无内容",
      mode_hover: "🔄 Hover",
      mode_click: "🖱️ Click",
      mode_desc: "当前: {mode} (点击切换)",
      mode_changed: "触发模式已变更: {mode}",
      export_success: "✅ 设置已导出！\n\n内容已复制到剪贴板。",
      import_prompt: "⬇️ 请粘贴您的备份代码 (JSON格式)：",
      import_success: "✅ 设置导入成功！\n页面将自动刷新。",
      import_fail: "❌ 导入失败：格式错误。",
      insert_success: "已插入",
      copy_success: "已复制",
      copy_fail: "复制失败",
      input_not_found: "找不到输入框",
      edit_link_text: "编辑链接前缀",
      enter_link_text: "输入链接前缀文字 (留空则移除)：",
      tip_style: "菜单风格: 平面 / 群组",
      tip_trigger: "触发模式: 悬停 / 点击",
      tip_logic: "点击逻辑: 复制 / 填充",
      tip_space: "尾部空一格",
      tip_newline: "尾部换行",
      tip_symbols: "自定义字符串",
      tip_lang: "切换语言",
      tip_manual: "使用说明",
      mod_msg_warn_title: "⚠️ 确定停用消息工具？",
      mod_msg_warn_body:
        "⠿ 消息工具是本脚本的核心功能。\\n停用后，所有消息的 ⠿ 按鈕将会消失。\\n\\n若要重新启用：右键点击 Tampermonkey 图标 → 选择「启用 ⠿ 消息工具」。",
      mod_msg_warn_confirm: "仍要停用",
      mod_msg_warn_cancel: "取消",
      mod_msg_enable_menu: "启用 ⠿ 消息工具",
      rescue_reload_msg: "设置已更新。需要刷新页面才能生效。是否立即刷新？",
      rescue_close_btn: "关闭",
      grp_copy: "📝 复制相关 >",
      grp_convert: "🔄 转换相关 >",
      grp_download: "⬇️ 下载相关 >",
      grp_system: "⚙️ 系统与符号 >",
      grp_webhook: "🔗 Webhook >",
      view_main: "主菜单",
      view_symbols: "自定义字符串",

      // --- Module C (Expression Helper) - [UPDATED] ---
      em_title: "😊 表情/GIF 整合管理",
      em_content:
        "• <b>工具列</b>：[📁] 收藏库 | [🎯] 准心选取 | [★] 关键字。<br>• <b>准心模式</b>：点击后可直接选取画面上的 GIF 或表情加入收藏。<br>• <b>收藏库</b>：支援分页管理，可拖曳分页排序。<br>• <b>Shift + 点击</b>：连续发送收藏项目不关闭面板。",
      em_picker_tip: "🔍 请点击画面上的 GIF/表情 进行收藏 (点击黑幕取消)",
      em_err_no_list: "找不到列表容器，请先开启表情或 GIF窗口！",
      em_btn_add_title: "点击：收藏搜索关键词，按住 Shift 可连续删除关键词。",
      em_btn_active_title: "点击: 填入关键字 (切换)",
      em_btn_target_title: "准心模式：点击画面上的 GIF/表情 以直接收藏",
      em_btn_save_this: "将此项目加入收藏库",
      em_no_favs: "尚无收藏",
      em_del_confirm: '删除"{k}"?',
      em_note_prompt: "备注：",
      em_set_cover_success: "已设定封面图！",

      // --- Module D (Wormhole) ---
      wm_url_prompt: "请输入 Discord 频道完整网址 (URL)：",
      wm_name_prompt: "请输入虫洞名称 (例如: 闲聊区)：",
      wm_edit_title: "编辑虫洞：{n}",
      wm_created: "已创建虫洞！",
      wm_deleted: "已关闭虫洞。",
      wm_nav_fail: "导航失败，请检查网址。",
      wm_alert_invalid_url:
        "无效的链接！请复制 Discord 频道网址 (包含 /channels/)。",
      wm_default_channel_name: "频道",
      wm_refresh_confirm:
        "已创建虫洞，但界面无法即时更新。\n这可能是 Discord 暂时锁定了界面。\n\n是否立即刷新页面以显示？",
      wm_root_group: "未分类",

      // 菜单动作
      wm_menu_edit: "✎ 编辑名称",
      wm_menu_del: "🗑️ 关闭虫洞",
      wm_menu_vip_add: "★ 设为 VIP (置顶)",
      wm_menu_vip_remove: "☆ 取消 VIP",
      wm_menu_move: "📂 移动到分组",

      // 分组相关
      wm_group_prompt: "请输入新分组名称：",
      wm_edit_group: "编辑分组名称：",
      wm_group_del_confirm: '解散分组"{n}"？(内含虫洞将会保留)',
      wm_group_select_prompt:
        '请输入数字选择分组：\n\n0. [根目录/未分类]\n{list}\n\n留空并按下确认可创建"新分组"：',
      wm_group_invalid: "无效的分组选择！",
      wm_move_prompt: "移动到哪个分组？(输入数字)\n\n{list}",
      wm_icon_picker_title: "选择 {name} 的图标",
      wm_icon_set_success: "✅ 已设定 {name} 的图标",
      wm_icon_empty: "请先在收藏图片模块中添加 Emoji",
      wm_title: "虫洞控制台\n• 单击：创建新虫洞\n• 长按 1 秒：打开设置菜单",
      wm_settings_menu_title: "🌀 虫洞设置",
      wm_settings_create: "创建新虫洞",
      wm_settings_send_mode: "发送方式与 API 模式",
      wm_settings_more: "更多设置（敬请期待）",
      wm_settings_position: "切换虫洞显示位置",
      wm_settings_position_navbar: "导航栏",
      wm_settings_position_titlebar: "频道标题栏",
      wm_settings_position_input: "消息输入框上方",
      wm_settings_position_topleft: "左上角（固定悬浮）",
      wm_focus_on: "关闭聚焦模式",
      wm_focus_off: "开启聚焦模式（仅显示图标）",
      wm_focus_size: "图标大小",
      wm_focus_size_s: "S  · 小",
      wm_focus_size_m: "M  · 中",
      wm_focus_size_l: "L  · 大",

      // 虫洞传送消息
      wm_menu_send: "✉️ 在此频道发送消息",
      wm_send_placeholder: "输入要发送到 #{name} 的消息...",
      wm_send_btn: "发送",
      wm_send_cancel: "取消",
      wm_send_waiting: "等待编辑器就绪...",
      wm_send_injecting: "正在发送...",
      wm_send_success: "✅ 已发送到 #{name}！",
      wm_send_toast_title: "✅ 已发送到 #{name}",
      wm_send_toast_hint: "点击可前往该频道",
      wm_send_waiting_token: "⏳ 等待 Token 就绪…",
      wm_send_fail: "❌ 发送失败，编辑器未就绪。",
      wm_send_empty: "消息不能为空白。",
      wm_send_returning: "返回原频道...",
      wm_send_hint: "Shift+点击虫洞可在不切换频道的情况下发送",
      wm_send_field_add:    "+ 添加欄位",
      wm_send_field_del:    "移除欄位",
      wm_send_sending_n:    "发送中 {n}/{total}…",
      wm_send_cool_warn:    "冷却中：{s} 秒后发送下一条",
      wm_send_chat_btn:     "发送消息",
      wm_send_mode_api: "⚡ API 模式",
      wm_send_mode_nav: "🔀 跳页模式",
      wm_send_mode_desc_api: "直接发送，不切换频道",
      wm_send_mode_desc_nav: "切换至目标频道后发送",
      wm_send_autoclose: "发送后自动关闭",
      wm_send_show_toast: "显示发送通知",
      wm_send_goto_channel: "发送后前往该频道",
      wm_send_paste_hint: "📋 可 Ctrl+V 粘贴图片",
      wm_send_token_warn:
        "⚠️ Token 已失效，请重新打开彩蛋面板检测。本次使用方案 A。",
      wm_send_channel_fail: "❌ 频道加载失败",
      wm_send_editor_missing: "❌ 找不到输入框",
      wm_send_uploading: "📎 上传 {n} 张图片...",

      // 方案 B — API 模式
      wm_api_panel_title: "⚗️ 虫洞 API 模式（进阶）",
      wm_api_mode_label_a: "方案 A — 跳页模式（默认）",
      wm_api_mode_label_b: "方案 B — 直接 API（不切换页面）",
      wm_api_warning_title: "⚠️ 风险声明",
      wm_api_warning_body:
        "使用 User Token 调用 Discord API 违反 Discord 服务条款，账号可能面临封禁风险，请自行评估。",
      wm_api_token_status_none: "Token：尚未检测",
      wm_api_token_status_ready: "Token：已就绪（仅存于内存）",
      wm_api_detect_btn: "检测我的 Token",
      wm_api_detect_confirm:
        "【Token 拦截授权同意书】\n\n点击「确认」即代表您同意本脚本在本次会话中拦截您的 Discord Token。\n\n🔒 安全保证：\n• 仅存于浏览器内存，绝不写入任何存储空间或磁盘\n• 页面关闭或刷新后自动清除，不留任何痕迹\n• 绝不发送至任何外部服务器，所有请求直接发往 discord.com\n• 仅用于代您执行 POST /channels/{id}/messages 操作\n\n⚠️ 用户声明：\n• 您了解此 Token 具备发送消息的能力\n• 通过本模式发送的所有消息，责任由您自行承担\n\n请在确认信任本脚本且理解上述内容后再继续。",
      wm_api_detect_waiting: "⬆️ 请切换到任意频道一次，即可自动捕捉 Token",
      wm_api_enable_btn: "启用 API 模式",
      wm_api_disable_btn: "停用 API 模式（返回方案 A）",
      wm_api_enabled_toast: "✅ API 模式已启用",
      wm_api_disabled_toast: "↩️ 已返回跳页模式",
      wm_api_view_code: "查看 Token 拦截代码",
      wm_api_clear_token: "🗑 清除 Token",
      wm_api_reset_all: "🗑️ 重置所有虫洞数据",
      wm_api_plan_b_first: "请先选择方案 B",
      wm_api_send_fail: "❌ API 发送失败，请查看控制台",

      // --- 收藏库与工具提示 ---
      em_col_title: "我的收藏库",
      em_col_add_success: '已保存到"{g}"！',
      em_col_tab_new: "新增标签页",
      em_col_tab_prompt: "新标签页名称：",
      em_col_empty_tab: "此标签页暂无内容。",
      em_col_del_tab_confirm: '删除标签页"{n}"及其所有内容？',
      em_modal_choose_tab: "保存到哪个收藏库？",
      em_modal_create_new: "+ 创建新的...",
      em_col_refresh_tooltip: "刷新 GIF 预览 (刷新过期的 CDN 缓存)",
      em_refresh_no_expired:   "ℹ️ 此分页无过期的 GIF",
      em_refresh_consent:      "⚠️ 关于 GIF 刷新功能\n\n此功能将通过第三方代理服务器（fixcdn.hyonsu.com）\n重新获取 Discord 附件链接的访问凭证。\n\n注意事项：\n• 你的图片网址（URL）将发送至 fixcdn.hyonsu.com\n• 该服务为第三方个人维护，与 Discord 及本脚本无关\n• 建议搜索「fixcdn hyonsu」了解其运作方式后再決定\n\n是否继续？",
      em_refresh_cancel_tip:   "ℹ️ 已取消。手动更新步骤：\n① 在 Discord 找到原始 GIF 消息\n② 重新点选收藏加入收藏库",
      em_refresh_loading:      "Refreshing...",
      em_refresh_ok:           "✨ 已刷新 {n} 个 GIF{fail} {track}",
      em_refresh_partial_fail: "（{f} 个失败）",
      em_refresh_fail:         "⚠️ 无法刷新此分页的 GIF",
      em_refresh_track_api:    "（Discord API）",
      em_refresh_track_cdn:    "（fixcdn）",
      em_tip_pick: "设置封面图",
      em_tip_edit: "编辑备注",
      em_tip_delete: "删除",
      em_menu_emoji: "表情符号",
      em_menu_sticker: "贴纸",
      em_menu_gif: "GIF",

      // --- GM 菜单命令 ---
      menu_export: "📤 导出设置 (Backup)",
      menu_import: "⬇️ 导入设置 (Restore)",
      menu_change_lang: "🌐 切换语言 (Language)",
      custom_lang_desc:
        "点「📤 导出文本」获取英文原文 JSON，翻译后再点「📥 导入文本」粘贴回来即可应用。",
      custom_lang_export: "📤 导出文本",
      custom_lang_import: "📥 导入文本",
      custom_lang_apply: "✅ 应用并刷新",
      custom_lang_loaded: "✅ 已载入：{name}",
      custom_lang_activate: "🌐 应用「{name}」",
      custom_lang_json_error: "⚠️ JSON 格式错误：{msg}",
      custom_lang_paste_hint: "粘贴翻译后的 JSON 文本 …",
      copy_media_prefixed: "✅ 已复制 {n} 个带前缀媒体链接",
      copy_media_urls: "✅ 已复制 {n} 个媒体链接",
      wormhole_reset_success: "✅ 数据已清除，正在刷新…",
      // --- Module F (Webhook) ---
      wh_panel_title: "🔗 Webhook 管理",
      wh_enable: "启用 Webhook",
      wh_tip: "Webhook 管理",
      wh_add_name_ph: "标签（例：动物）",
      wh_add_url_ph: "https://discord.com/api/webhooks/…",
      wh_btn_add: "＋ 添加",
      wh_btn_test: "测试",
      wh_btn_delete: "删除",
      wh_test_ok: "✅ 测试已发送！",
      wh_test_fail: "❌ 测试失败",
      wh_send_content: "📨 发送消息至 Webhook ▶",
      wh_send_urls: "🔗 发送链接至 Webhook ▶",
      wh_no_webhooks: "尚未添加任何 Webhook",
      wh_send_ok: "✅ 已发送至 [{name}]",
      wh_send_fail: "❌ 发送失败 [{name}]",
      wh_no_urls: "⚠️ 此消息中无链接",
      wh_url_invalid: "⚠️ Webhook 链接无效",
      wh_btn_edit: "编辑",
      wh_btn_save: "保存",
      wh_btn_cancel: "取消",
      wh_keep_source: "📎 附上来源链接",
      wh_keep_source_tip: "勾选后，发送内容末尾会附上该消息的原始链接。",

      // --- Module G (URL Checker) ---
      uc_duplicate_found: "⚠️ 此网址已在最近 {limit} 条消息中出现 {count} 次",
      uc_duplicate_found_plural: "⚠️ {n} 个重复网址，最多出现 {count} 次（扫描最近 {limit} 条）",
      uc_dom_found: "⚠️ 此网址在当前可见 {limit} 条消息中出现 {count} 次（DOM 模式 · 无需 API）",
      uc_no_token: "🔍 重复网址检测需要虫洞 API 模式 — 请长按虫洞 ＋ 键 1 秒打开设置",
      uc_token_waiting: "⏳ 等待 API Token 就绪… 请切换到任意频道一次以自动捕捉",
      uc_fetching: "🔄 正在扫描重复网址…",
      uc_dismiss: "✕",
      uc_limit_label: "扫描范围：",
      uc_limit_suffix: "条消息",
      em_save_success: "已保存：{k}",

      // --- Module tips ---
      mod_tip_message:    "右键任意消息，通过 ⠿ 按钮快速复制、书签或执行其他操作。",
      mod_tip_forwarding: "将消息转发到收藏频道或用户，在聊天输入框上方显示转发工具栏。",
      mod_tip_emoji:      "输入时从可搜索的弹出窗口浏览并插入服务器表情符号。",
      mod_tip_header:     "解锁媒体右键、启用文件下载辅助及防内容劫持保护。",
      mod_tip_wormhole:   "通过聊天顶部的快捷按钮快速跳转到已固定频道，支持 VIP、群组与焦点模式。",
      mod_tip_webhook:    "直接从任何频道发送消息到已注册的 Webhook。",
      mod_tip_urlchecker: "当粘贴的链接已在近期消息中出现过时发出警告，无需 API token（DOM 模式）。",
      mod_tip_scout:      "点击输入框上方的搜索按钮，或使用快捷键，按关键字搜索当前频道的消息。",
      mod_tip_blacklist:  "将特定用户的消息弱化至背景，让其不再引人注意。右键任意消息即可添加。",

      // --- Channel Scout ---
      cs_panel_title:   "⌨ 频道搜索",
      cs_placeholder:   "输入关键字搜索频道消息…",
      cs_paste_tip:     "粘贴剪贴板内容",
      cs_history_tip:   "最近搜索记录",
      cs_no_history:    "尚无搜索记录",
      cs_empty_hint:    "输入关键字或点击标签搜索",
      cs_no_results:    "找不到符合的消息",
      cs_dom_mode_note: "DOM 模式 · 仅搜索页面已加载消息",
      cs_right_del_tip: "右键标签可删除",
      cs_add_tag:        "+ 添加标签",
      cs_add_tag_prompt: "输入新标签（右键标签可删除）：",
      cs_float_title:   "频道搜索 (F2)",
      cs_float_label:   "频道搜索",

      // --- Mute User ---
      mu_panel_title:   "🌫️ 弱化用户消息",
      mu_empty:         "尚未弱化任何用户\n右键消息可添加",
      mu_remove_btn:    "解除",
      mu_footer_left:   "右键消息添加 · hover 可预览内容",
      mu_footer_right:  "GMStore 永久储存",
      mu_add_toast:     "🌫️ 已弱化：{name}",
      mu_remove_toast:  "✅ 已解除弱化：{name}",
      mu_ctx_mute:      "🌫️ 弱化消息：{name}",
      mu_ctx_unmute:    "✅ 解除弱化：{name}",
      mu_shortcut:      "Alt+B 打开弱化管理面板",
      mu_temp_card_name: "临时",
      mu_temp_card_desc: "计时结束自动解除",
      mu_temp_quick:    "快速选择",
      mu_temp_placeholder: "例：3H、1D 6H、27H 20M",
      mu_temp_confirm:  "⏳ 临时静音",
      mu_temp_expired_toast: "⏰ 临时静音已到期：{name}",
      mu_temp_badge_label: "⏳",
      mu_settings_tab_list:    "静音名单",
      mu_settings_tab_style:   "样式设置",
      mu_settings_clear_all:   "全部清除",
      mu_settings_clear_confirm: "确认移除所有静音对象？",
      mu_settings_ghost_delay: "Ghost 飘走延迟（秒）",
      mu_settings_title:       "设置",
    },

    ja: {
      name: "日本語",
      // --- Module A (Forwarding) ---
      fm_pinned_channels: "★ お気に入り",
      fm_toggle_flat: "表示切替：タイル",
      fm_toggle_drop: "表示切替：リスト",
      fm_help: "ヘルプ",
      fm_prompt_channel: "チャンネルのキーワードを入力：",
      fm_prompt_user: "ユーザーのキーワードを入力 (例: mighty)：",
      fm_user_zone: "ユーザーリスト",
      fm_no_users: "お気に入りユーザーなし",
      fm_add_user: "+ ユーザーを追加",
      fm_fuzzy: "あいまい検索",
      fm_remove_confirm: "「{target}」を削除しますか？",
      fm_tooltip_channel: "チャンネル: {c}\nサーバー: {s}",
      fm_tooltip_user_add: "ユーザーリストに追加 (👤)",
      fm_tooltip_star_add: "お気に入りに追加 (★)",
      fm_manual_title: "📚 転送マネージャー説明書",
      fm_sec_star: "★ お気に入りと管理",
      fm_sec_star_content:
        "• <span class='help-key'>★</span> または <span class='help-key'>👤+</span> で追加。<br>• <span class='help-key'>右クリック</span> で削除。<br>• <span class='help-key'>Shift+右クリック</span> で連続削除 (確認なし)。",
      fm_sec_search: "🔍 2段階検索 (デフォルト)",
      fm_sec_search_content:
        "• ボタンをクリックすると「予熱 -> 入力 -> ロック」プロセスが自動実行されます。<br>• Discordの「直接入力しても検索されない」バグを修正します。<br>• 誤転送を防ぐため、<span style='color:#2dc770'>完全一致</span> で検索します。",
      fm_sec_fuzzy: "⏎ あいまい検索",
      fm_sec_fuzzy_content:
        "• ボタン右側の <span class='help-key'>⏎</span> 矢印をクリック。<br>• 最初の2文字または最初の単語のみを入力します。名前が変わった場合に便利です。",
      fm_sec_user: "👤 ユーザーリスト",
      fm_sec_user_content:
        "• 右端の <span class='help-key'>👤</span> ボタンでユーザーリストを展開。<br>• 手動でのID追加もサポートしています。",
      fm_sec_misc_title: "⚙️ 表示とヒント",
      fm_sec_misc:
        "• 左上のボタンで<b>タイル</b>または<b>ドロップダウン</b>表示モードを切り替えできます。<br>• <b>履歴</b>（紫のバッジ）は最近訪れたチャンネルを自動で記録し、クリックで即座に戻れます。",

      // --- Module D (Wormhole) 説明 ---
      fm_sec_wormhole: "🌀 ワームホール — 基本操作",
      fm_sec_wormhole_content:
        "• <span class='help-key'>＋</span> 作成ボタンをクリックして Discord チャンネルの URL を貼り付けると、ワームホールが作成されます。<br>" +
        "• <b>クリック</b>するとそのチャンネルへ即座にジャンプします。<br>" +
        "• <b>右クリック</b> → メニュー：名前変更・削除・アイコン設定・グループ移動・VIP 切替。<br>" +
        "• <b>VIP（★）</b>：設定したワームホールは自動的に最上部に固定されます。<br>" +
        "• <b>グループ</b>：右クリック → グループに移動 で、フォルダに整理できます。<br>" +
        "• <b>フォーカスモード</b>：アイコンのみのコンパクト表示。パネル右上のボタンで切り替え。",

      fm_sec_wm_send: "✉️ ワームホール — メッセージ送信",
      fm_sec_wm_send_content:
        "• <b>右クリック</b> → <b>このチャンネルにメッセージを送る</b> で送信オーバーレイを開きます。<br>" +
        "• <b>プラン A（ページ移動）</b>：対象チャンネルへ自動移動し、Discordのエディタにテキストを注入して戻ります。API不要。<br>" +
        "• <b>Shift + クリック</b>：現在のチャンネルでオーバーレイを開きます（移動なし）。<br>" +
        "• <b>Ctrl+V 画像貼り付け</b>に対応。テキストと画像を1通にまとめて送信できます。<br>" +
        "• 下部オプション：<b>送信後に閉じる</b> / <b>送信後チャンネルへ移動</b>（相互排他）/ <b>送信通知を表示</b>。<br>" +
        "• 送信後にクリック可能なトーストが表示され、クリックで対象チャンネルへ即座に移動できます。",

      fm_sec_wm_api: "⚡ ワームホール — API モード（隠し機能）",
      fm_sec_wm_api_content:
        "• <b>ワームホール作成ボタン（＋）を3秒長押し</b>して API モード設定パネルを解除します。<br>" +
        "• <b>プラン B（直接 API）</b>：Discord REST API 経由でメッセージを送信。ページ切替なし、高速・ステルス動作。<br>" +
        "• Token はスクリプトがバックグラウンドで静かに傍受します（Discord 自身のリクエストから）。<b>保存・外部送信は一切なし</b>、メモリのみ保持、ページを閉じると消去。<br>" +
        "• プラン B を有効にすると Token 検出がバックグラウンドで自動起動。Discord を普通に使うだけで自動取得されます。<br>" +
        "• API モードは画像アップロード（multipart/form-data）対応。テキストと画像を1回で送信。<br>" +
        "• ページ更新後に Token が失われた場合、オーバーレイを開くと自動で再起動します。",

      // --- Module B (Message Utils) ---
      welcome_title: "{script} へようこそ",
      select_lang_subtitle: "インターフェース言語を選択してください",
      help_btn: "📖 マニュアル",
      cancel_btn: "✕ 閉じる",
      security_notice_title: "⚠️ セキュリティに関する免責事項",
      security_notice_content:
        "URL変換機能（vxtwitter、kkinstagramなど）はサードパーティのサービスに依存しています。\n信頼できない場合は使用しないでください。\nURLの安全性を識別できる方のみご利用ください。",
      manual_content:
        "【アイコン説明】\n• ◫/≡ : メニュースタイル (フラット / グループ)\n• ⇄ : クリック動作切替 (コピー / 挿入)\n• ␣ : 末尾にスペース追加\n• ↵ : 末尾に改行追加\n• ☆ : カスタム文字列パネル\n• 🖱️ : 起動モード (ホバー / クリック)\n• 🌐 : 言語切り替え\n\n【操作方法】\n• **クリック**: コピー (デフォルト)\n• **長押し (0.5秒)**: 入力欄に挿入\n• **Shift+クリック**: コピーして挿入 (メニュー維持)",
      manual_content_sections: `<div class='mm-section'><div class='mm-sec-title c-default'>⚡ クイックスタート</div><div class='mm-content'>任意の Discord メッセージにマウスを合わせると → 右上にコピーボタンが表示されます。<br><b>クリック</b>でテキストコピー · <b>長押し 0.5秒</b>で入力欄に挿入 · <b>Shift+クリック</b>でコピーと挿入を同時実行（メニュー維持）。<br>ツールバーの <span class='mm-key'>🖱️</span> で<span class='mm-key'>クリックモード</span>に切替可能（手動トリガー）。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 コピーメニュー — テキスト・リンク</div><div class='mm-content'>• <b>テキストをコピー</b>：メッセージの全文テキストをコピーします。<br>• <b>メディアURLをコピー</b>：メッセージ内の画像・動画の直リンクをコピーします。<br>• <b>最初のリンクをコピー（浄化済）</b>：最初のURLからトラッキングパラメータを除去してコピー。<br>• <b>全リンクをコピー</b>：メッセージ内の全URLを1行ずつコピーします。<br>• <b>Markdownとしてコピー</b>：<span class='mm-key'>[テキスト](URL)</span> 形式に変換します。<br>• <b>Markdownリンクを挿入</b>：Discordの入力欄にMarkdown形式で直接挿入します。<br>• <b>隠しテキスト</b>：<span class='mm-key'>|| スポイラー ||</span> 形式で包みます。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ ダウンロード</div><div class='mm-content'>• <b>画像/メディアをダウンロード</b>：メッセージ内の全画像・動画をまとめてダウンロード。<br>• <b>ZIPとしてダウンロード</b>：複数ファイルを一つのZIPアーカイブにまとめます。<br>• 失敗時は自動リトライし、代替URLにフォールバックします。</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 URL変換</div><div class='mm-content'><b>Twitter / X</b>：twitter.com, x.com, vxtwitter, fixupx, fxtwitter, cunnyx の間で相互変換し Discord プレビューを修正。<br><b>Instagram</b>：instagram.com ↔ kkinstagram.com に変換して埋め込みプレビューを有効化。<br><b>Bilibili</b>：FX Bilibili または VX Bilibili に変換してより良い埋め込みを実現。<br><b>Pixiv</b>：pixiv.net ↔ phixiv.net の相互変換で Discord 内にイラストをプレビュー。<br><b>一括変換</b>：<span class='mm-key'>⚡ 全て変換 (N)</span> でメッセージ内の同種リンクをまとめて変換。</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>🎛️ ツールバーアイコン</div><div class='mm-content'><div class='mm-grid'><div><span class='mm-key'>◫/≡</span> メニュースタイル：フラット / グループ</div><div><span class='mm-key'>⇄</span> クリック動作切替：コピー ↔ 挿入</div><div><span class='mm-key'>␣</span> 挿入時に末尾スペースを追加</div><div><span class='mm-key'>↵</span> 挿入時に末尾改行を追加</div><div><span class='mm-key'>☆</span> カスタム文字列パネル</div><div><span class='mm-key'>🖱️</span> トリガー切替：ホバー / クリック</div><div><span class='mm-key'>🌐</span> 言語切り替え</div></div></div></div><div class='mm-section'><div class='mm-sec-title c-default'>☆ カスタム文字列パネル</div><div class='mm-content'>• よく使うテキスト（挨拶文・テンプレート・コードブロック）を保存できます。<br>• クリックでコピー · 長押しで入力欄に挿入。<br>• <span class='mm-key'>Shift+クリック</span>で確認なしに連続削除可能。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 ワームホール — 概要</div><div class='mm-content'>ワームホールは Discord サイドバーの<b>ワンクリックチャンネルショートカット</b>です。<span class='mm-key'>＋</span> をクリックして Discord チャンネル URL を貼り付けると作成できます。<br><b>クリック</b> <span class='mm-key'>＋</span> → 新規作成 · <b>1秒長押し</b> → 設定メニューを開く。</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>🖱️ ナビゲーションと管理</div><div class='mm-content'>• <b>クリック</b>でそのチャンネルへ即ジャンプ。<br>• <b>右クリック</b> → メニュー：名前変更 · 削除 · アイコン設定 · グループ移動 · VIP 切替。<br>• <b>VIP <span class='mm-key'>★</span></b>：設定したワームホールは自動で最上部に固定。<br>• <b>グループ</b>：右クリック → グループに移動 でフォルダ整理。<br>• <b>フォーカスモード</b>：アイコンのみのコンパクト表示。パネル右上ボタンで切替。<br>• <b>履歴</b>（紫バッジ）：最近訪れたチャンネルを自動記録、クリックで即復帰。</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>✉️ メッセージ送信</div><div class='mm-content'>• <b>右クリック</b> → <b>このチャンネルにメッセージを送る</b> でオーバーレイを開く。<br>• <span class='mm-key'>Ctrl+V</span> で画像を直接貼り付け — テキストと一緒に1通で送信。<br>• 下部オプション（セッション間保持）：送信後閉じる · チャンネルへ移動 · 通知を表示。<br>• 送信後3秒間トーストが表示され、クリックで即チャンネルに移動できます。</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>⚙️ 設定メニューと API モード</div><div class='mm-content'>• <b><span class='mm-key'>＋</span> を1秒長押し</b>してワームホール設定メニューを開く。<br>• メニュー：<span class='mm-key'>➕ 新しいワームホールを作成</span> · <span class='mm-key'>✉️ 送信方式・API モード</span> · <span class='mm-key'>⚙️ その他の設定</span>（拡張予定）。<br>• 「<b>送信方式・API モード</b>」→ API 設定パネルを開く：<br>&nbsp;&nbsp;— <b>プラン A（ページ移動）</b>：自動移動→テキスト注入→復帰。Token 不要。<br>&nbsp;&nbsp;— <b>プラン B（直接 API）</b>：REST API 経由。ページ切替なし・即時・ステルス。<br>• Token は Discord 自身のリクエストからバックグラウンドで静かに傍受——<b>ディスク保存なし。</b><br>• ページ更新後：送信オーバーレイを開くとインターセプターが自動再起動。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🔍 重複 URL チェッカー</div><div class='mm-content'>チャット欄に URL を貼り付けると、同じリンクが過去に投稿されていないか自動確認します。<br>• <b>DOM モード</b>（デフォルト）：現在表示中のメッセージを全件スキャン。API トークン不要。<br>• <b>API モード</b>：Discord API で最新 200 件をスキャン（ワームホール API モード有効+トークン取得済み が必要）。<br>• 重複検出時はチャット上部にバナー表示（出現回数も表示）。<br>• 別の URL を貼るかチャンネルを切り替えるとバナーは自動消去。<br>• <b>バナーなし = 重複なし</b>——ヒットしない場合は無音でバックグラウンド動作。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🔎 チャンネル検索 Channel Scout</div><div class='mm-content'>チャット画面からキーワードで現在チャンネルのメッセージを検索します。<br>• <b>開く</b>：入力欄上の 🔎 フローティングボタンをクリック、または入力欄外で <span class='mm-key'>F2</span>。<br>• <b>即時検索</b>：入力と同時に結果更新（150ms 遅延）。ヒット箇所をゴールドでハイライト。<br>• <b>クイックタグ</b>：カスタムキーワードを最大 5 件保存。左クリックで検索・右クリックで削除。<br>• <b>検索履歴</b>：🕐 ボタンで直近 5 件を表示、クリックで再検索。<br>• <b>メッセージへジャンプ</b>：結果をクリックするとスクロールして青紫枠でハイライト。<br>• <b>貼り付けボタン</b>：📋 クリックでクリップボードを検索欄に直接入力。<br>• <span class='mm-key'>ESC</span>・<span class='mm-key'>F2</span>・パネル外クリックで閉じる。<br>⚠ DOM モードのみ——現在レンダリング済みのメッセージのみ対象。古いメッセージは先にスクロールして読み込んでください。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌫️ ユーザーメッセージ弱化</div><div class='mm-content'>特定ユーザーのメッセージを背景に溶け込ませ、邪魔にならないよう薄く表示します（非表示ではありません）。<br>• <b>弱化追加</b>：メッセージを右クリック → 「ブロック」の下に <b>🌫️ メッセージを弱化：{名前}</b> → クリック。<br>• <b>弱化解除</b>：同じユーザーのメッセージを右クリック → <b>✅ 弱化を解除：{名前}</b>。<br>• <b>管理パネル</b>：<span class='mm-key'>Alt+B</span> で弱化リストを開く。追加日時と解除ボタンを表示。<br>• 弱化メッセージは <b>不透明度 7%</b> で表示。ホバーで 42% まで一時プレビュー可能。<br>• <b>表示名</b>で識別（User ID 不使用）、全チャンネルで有効。<br>• 新着メッセージやチャンネル切り替え後も自動で再適用。<br>• データは GM storage に永続保存、ページ更新後も維持。</div></div></div></div>`,
      reload_confirm:
        "設定を保存しました！\nすぐにページを再読み込みしますか？",
      copy_text: "📋 テキストをコピー",
      copy_media_url: "🖼️ メディアURLをコピー",
      no_content: "⚠️ コンテンツなし",
      copy_first_link: "🔗 最初のリンクをコピー (浄化済)",
      copy_markdown: "🧾 Markdownとしてコピー",
      copy_all_links: "📎 全リンクをコピー",
      insert_format_link: "📌 [{t}](URL) を挿入",
      copy_hidden_format: "🙈 隠しテキスト (|| ... ||)",
      download_images: "⬇️ 画像またはメディアを一括ダウンロード",
      download_zip: "📦 ZIPとしてダウンロード",
      download_start: "🚀 ダウンロード中...",
      download_zip_start: "📦 {n} ファイルを圧縮中...",
      download_fail: "❌ ダウンロード失敗",
      download_cors_fail:
        "⚠️ CORS制限により直接ダウンロードできません。URLをコピーしてブラウザで開いて保存してください。",
      original_url: "🔗 元のURL",
      convert_all: "⚡ すべて変換 ({n})",
      convert_imgur: "🖼️ i.imgur.com に変換",
      to_twitter: "🐦 twitter.com へ",
      to_x: "❌ x.com へ",
      to_vxtwitter: "🔁 vxtwitter へ",
      to_fixupx: "🛠️ fixupx へ",
      to_fxtwitter: "🔧 fxtwitter へ",
      to_cunnyx: "🍑 cunnyx へ",
      to_fixvx: "🧩 fixvx へ",
      to_reddit: "👽 reddit.com へ",
      to_old_reddit: "📜 old.reddit へ",
      to_rxddit: "🔁 rxddit へ",
      to_vxreddit: "🛠️ vxreddit へ",
      to_instagram: "📷 instagram.com へ",
      to_kkinstagram: "🔁 kkinstagram へ",
      to_vxinstagram: "🔁 vxinstagram へ",
      to_ddinstagram: "🔁 ddinstagram へ",
      to_uuinstagram: "🔁 uuinstagram へ",
      to_facebed: "🔁 facebed.com へ",
      to_tiktok: "🎵 tiktok.com へ",
      to_vxtiktok: "🔁 vxtiktok へ",
      to_tnktok: "🛠️ tnktok へ",
      to_threads: "🧵 threads.com へ",
      to_fixthreads: "🔁 fixthreads へ",
      to_fx_bilibili: "📺 FX Bilibili へ",
      to_vx_bilibili: "📼 VX Bilibili へ",
      to_b23: "🔗 b23.tv へ",
      to_vxb23: "🔗 vxb23.tv へ",
      to_phixiv: "🔙 phixiv.net へ",
      to_pixiv: "🎨 pixiv.net へ",
      yt_shorts_to_watch: "▶️ YT Shorts → 通常リンク",
      restore_pixiv_img: "📖 画像からpixivを復元",
      insert_symbol: "✳️ 挿入 → {s}",
      delete_symbol: "❌",
      delete_confirm: "削除しました: {s}",
      add_symbol: "➕ 追加",
      add_symbol_prompt: "追加するテキストを入力：",
      add_success: "追加しました",
      remove_symbol: "➖ 削除",
      remove_symbol_prompt: "削除するテキストを入力：",
      remove_empty: "リストは空です",
      mode_hover: "🔄 ホバー",
      mode_click: "🖱️ クリック",
      mode_desc: "モード: {mode} (クリックで切替)",
      mode_changed: "モードを変更しました: {mode}",
      export_success:
        "✅ 設定をエクスポートしました！\n\nクリップボードにコピーされました。",
      import_prompt: "⬇️ バックアップコード (JSON) を貼り付け：",
      import_success: "✅ インポート成功！\nページを更新します。",
      import_fail: "❌ インポート失敗：無効なJSONです。",
      insert_success: "挿入しました",
      copy_success: "コピーしました",
      copy_fail: "コピー失敗",
      input_not_found: "入力欄が見つかりません",
      edit_link_text: "リンクテキストを編集",
      enter_link_text: "リンクの接頭辞を入力 (空で削除):",
      tip_style: "スタイル: フラット / グループ",
      tip_trigger: "起動: ホバー / クリック",
      tip_logic: "クリック: コピー / 挿入",
      tip_space: "末尾にスペース",
      tip_newline: "末尾に改行",
      tip_symbols: "カスタム文字列",
      tip_lang: "言語切替",
      tip_manual: "マニュアル",
      mod_msg_warn_title: "⚠️ メッセージユーティリティを無効にしますか？",
      mod_msg_warn_body:
        "⠿ メッセージユーティリティはこのスクリプトの核心機能です。\\n無効にすると、すべてのメッセージの ⠿ ボタンが消えます。\\n\\n再有効化には：Tampermonkeyアイコンを右クリック → 「⠿ メッセージユーティリティを有効にする」を選択。",
      mod_msg_warn_confirm: "無効にする",
      mod_msg_warn_cancel: "キャンセル",
      mod_msg_enable_menu: "⠿ メッセージユーティリティを有効にする",
      rescue_reload_msg: "設定を更新しました。ページをリロードして有効にします。今すぐリロードしますか？",
      rescue_close_btn: "閉じる",
      grp_copy: "📝 コピー >",
      grp_convert: "🔄 変換 >",
      grp_download: "⬇️ ダウンロード >",
      grp_system: "⚙️ システム >",
      grp_webhook: "🔗 Webhook >",
      view_main: "メインメニュー",
      view_symbols: "カスタム文字列",

      // --- Module C (Expression Helper) - [UPDATED] ---
      em_title: "😊 表情/GIF マネージャー",
      em_content:
        "• <b>ツールバー</b>：[📁] コレクション | [🎯] 選択モード | [★] キーワード。<br>• <b>選択モード</b>：画面上のGIFや絵文字をクリックして保存します。<br>• <b>コレクション</b>：タブ管理に対応、ドラッグして並べ替え。<br>• <b>Shift + Click</b>：パネルを閉じずに連続送信。",
      em_picker_tip: "🔍 画像をクリックして保存 (黒い部分でキャンセル)",
      em_err_no_list: "リストが見つかりません。ウィンドウを開いてください！",
      em_btn_add_title:
        "クリック：検索キーワードをお気に入りに追加します。Shiftキーを押しながらで連続削除できます。",
      em_btn_active_title: "クリック: キーワードを入力 (切替)",
      em_btn_target_title: "選択モード：クリックして保存",
      em_btn_save_this: "コレクションに保存",
      em_no_favs: "お気に入りなし",
      em_del_confirm: "「{k}」を削除しますか？",
      em_note_prompt: "メモ：",
      em_set_cover_success: "カバー画像を設定しました！",

      // --- Module D (Wormhole) ---
      wm_url_prompt: "Discordチャンネルの完全なURLを入力してください：",
      wm_name_prompt: "ワームホール名を入力 (例: 雑談)：",
      wm_edit_title: "ワームホールを編集：{n}",
      wm_created: "ワームホールを作成しました！",
      wm_deleted: "ワームホールを閉じました。",
      wm_nav_fail: "移動に失敗しました。URLを確認してください。",
      wm_alert_invalid_url:
        "無効なリンクです！DiscordのチャンネルURL（/channels/を含む）をコピーしてください。",
      wm_default_channel_name: "チャンネル",
      wm_refresh_confirm:
        "ワームホールを作成しましたが、画面が即座に更新されません。\nDiscordがUIをロックしている可能性があります。\n\n今すぐページを更新して表示しますか？",
      wm_root_group: "未分類",

      // メニューアクション
      wm_menu_edit: "✎ 名前を編集",
      wm_menu_del: "🗑️ 閉じる",
      wm_menu_vip_add: "★ VIPに設定 (固定)",
      wm_menu_vip_remove: "☆ VIPを解除",
      wm_menu_move: "📂 グループへ移動",

      // グループ関連
      wm_group_prompt: "新しいグループ名を入力してください：",
      wm_edit_group: "グループ名を編集：",
      wm_group_del_confirm:
        "グループ「{n}」を解散しますか？(中のワームホールは保持されます)",
      wm_group_select_prompt:
        "番号でグループを選択してください：\n\n0. [ルート/未分類]\n{list}\n\n空欄のまま確認を押すと「新しいグループ」を作成：",
      wm_group_invalid: "無効なグループ選択です！",
      wm_move_prompt: "どのグループに移動しますか？(数字を入力)\n\n{list}",
      wm_icon_picker_title: "{name} のアイコンを選択",
      wm_icon_set_success: "✅ {name} のアイコンを設定しました",
      wm_icon_empty:
        "先にコレクション画像モジュールで Emoji を追加してください",
      wm_title:
        "ワームホール コントロール\n• クリック：新規作成\n• 1秒長押し：設定メニューを開く",
      wm_settings_menu_title: "🌀 ワームホール設定",
      wm_settings_create: "新しいワームホールを作成",
      wm_settings_send_mode: "送信方式・API モード",
      wm_settings_more: "その他の設定（近日公開）",
      wm_settings_position: "表示位置を切り替え",
      wm_settings_position_navbar: "ナビバー",
      wm_settings_position_titlebar: "チャンネルタイトルバー",
      wm_settings_position_input: "チャット入力欄の上",
      wm_settings_position_topleft: "左上固定",
      wm_focus_on: "フォーカスモードを閉じる",
      wm_focus_off: "フォーカスモードを開く（アイコンのみ表示）",
      wm_focus_size: "アイコンサイズ",
      wm_focus_size_s: "S  · 小",
      wm_focus_size_m: "M  · 中",
      wm_focus_size_l: "L  · 大",

      // ワームホールでメッセージを送信
      wm_menu_send: "✉️ このチャンネルにメッセージを送る",
      wm_send_placeholder: "#{name} に送るメッセージを入力...",
      wm_send_btn: "送信",
      wm_send_cancel: "キャンセル",
      wm_send_waiting: "エディターの準備を待っています...",
      wm_send_injecting: "送信中...",
      wm_send_success: "✅ #{name} に送信しました！",
      wm_send_toast_title: "✅ #{name} に送信しました",
      wm_send_toast_hint: "クリックでチャンネルへ移動",
      wm_send_waiting_token: "⏳ Token を待機中…",
      wm_send_fail: "❌ 送信失敗 — エディターが未準備です。",
      wm_send_empty: "メッセージを入力してください。",
      wm_send_returning: "元のチャンネルに戻っています...",
      wm_send_hint: "Shift+クリックでチャンネル切替なしに送信できます",
      wm_send_field_add:    "+ フィールド追加",
      wm_send_field_del:    "フィールド削除",
      wm_send_sending_n:    "送信中 {n}/{total}…",
      wm_send_cool_warn:    "クールダウン：{s}秒後に次を送信",
      wm_send_chat_btn:     "メッセージを送信",
      wm_send_mode_api: "⚡ API モード",
      wm_send_mode_nav: "🔀 ページ移動モード",
      wm_send_mode_desc_api: "直接送信、チャンネル切替なし",
      wm_send_mode_desc_nav: "対象チャンネルに移動してから送信",
      wm_send_autoclose: "送信後に自動で閉じる",
      wm_send_show_toast: "送信通知を表示する",
      wm_send_goto_channel: "送信後にチャンネルへ移動",
      wm_send_paste_hint: "📋 Ctrl+V で画像を貼り付け",
      wm_send_token_warn:
        "⚠️ Token が無効です。もう一度 API パネルを開いて検出してください。今回はプラン A を使用します。",
      wm_send_channel_fail: "❌ チャンネルの読み込みに失敗しました",
      wm_send_editor_missing: "❌ 入力欄が見つかりません",
      wm_send_uploading: "📎 {n} 枚の画像をアップロード中...",

      // プランB — API モード
      wm_api_panel_title: "⚗️ ワームホール API モード（上級）",
      wm_api_mode_label_a: "プラン A — ページ移動（デフォルト）",
      wm_api_mode_label_b: "プラン B — 直接 API（ページ切替なし）",
      wm_api_warning_title: "⚠️ リスク告知",
      wm_api_warning_body:
        "User Token で Discord API を呼び出すことは Discord 利用規約に違反します。アカウントが停止される可能性があります。自己責任でご利用ください。",
      wm_api_token_status_none: "Token：未検出",
      wm_api_token_status_ready: "Token：準備完了（メモリのみ）",
      wm_api_detect_btn: "Token を検出する",
      wm_api_detect_confirm:
        "【Token 傍受 — 同意確認】\n\n「OK」をクリックすることで、このスクリプトが今回のセッション中にあなたの Discord Token を傍受することに同意したとみなされます。\n\n🔒 安全性の保証：\n• ブラウザのメモリにのみ保存され、ディスクやストレージには一切書き込まれません\n• ページを閉じるか更新すると自動的に消去され、痕跡は残りません\n• いかなる外部サーバーにも送信されません。すべてのリクエストは直接 discord.com に送られます\n• あなたの代わりに POST /channels/{id}/messages を実行する目的にのみ使用されます\n\n⚠️ ユーザー確認事項：\n• この Token にはメッセージ送信の権限が含まれることを理解しています\n• このモードで送信したすべてのメッセージについて、責任は自身が負うものとします\n\nスクリプトを信頼し、上記の内容を理解した上で続行してください。",
      wm_api_detect_waiting:
        "⬆️ 任意のチャンネルに一度切り替えると Token が取得されます",
      wm_api_enable_btn: "API モードを有効にする",
      wm_api_disable_btn: "API モードを無効にする（プラン A に戻る）",
      wm_api_enabled_toast: "✅ API モードが有効になりました",
      wm_api_disabled_toast: "↩️ ページ移動モードに戻りました",
      wm_api_view_code: "Token インターセプトコードを見る",
      wm_api_clear_token: "🗑 Token を削除",
      wm_api_reset_all: "🗑️ すべてのワームホールデータをリセット",
      wm_api_plan_b_first: "まずプラン B を選択してください",
      wm_api_send_fail: "❌ API 送信失敗 — コンソールを確認してください",

      // --- コレクション・ツールチップ ---
      em_col_title: "マイコレクション",
      em_col_add_success: "「{g}」に保存しました！",
      em_col_tab_new: "新しいタブ",
      em_col_tab_prompt: "新しいタブ名：",
      em_col_empty_tab: "このタブは空です。",
      em_col_del_tab_confirm: "タブ「{n}」とその全項目を削除しますか？",
      em_modal_choose_tab: "どのコレクションに保存しますか？",
      em_modal_create_new: "+ 新しく作成...",
      em_col_refresh_tooltip: "GIF プレビューを更新 (期限切れの CDN キャッシュをリフレッシュ)",
      em_refresh_no_expired:   "ℹ️ このタブに期限切れのGIFはありません",
      em_refresh_consent:      "⚠️ GIF更新について\n\nこの機能はサードパーティのプロキシ（fixcdn.hyonsu.com）を使用して\nDiscord添付ファイルのアクセス資格情報を更新します。\n\n注意事項：\n• 画像のURLがfixcdn.hyonsu.comに送信されます\n• このサービスはDiscordや本スクリプトと無関係の第三者が運営しています\n• 続行前に「fixcdn hyonsu」を検索して確認することをお勧めします\n\n続行しますか？",
      em_refresh_cancel_tip:   "ℹ️ キャンセルしました。手動更新手順：\n① DiscordでオリジナルGIFメッセージを見つける\n② 再度コレクションに追加する",
      em_refresh_loading:      "Refreshing...",
      em_refresh_ok:           "✨ {n}件のGIFを更新しました{fail} {track}",
      em_refresh_partial_fail: "（{f}件失敗）",
      em_refresh_fail:         "⚠️ このタブのGIFを更新できませんでした",
      em_refresh_track_api:    "（Discord API）",
      em_refresh_track_cdn:    "（fixcdn）",
      em_tip_pick: "カバー画像を設定",
      em_tip_edit: "メモを編集",
      em_tip_delete: "削除",
      em_menu_emoji: "絵文字",
      em_menu_sticker: "スタンプ",
      em_menu_gif: "GIF",

      // --- GM メニューコマンド ---
      menu_export: "📤 設定をエクスポート (Backup)",
      menu_import: "⬇️ 設定をインポート (Restore)",
      menu_change_lang: "🌐 言語を変更 (Language)",
      custom_lang_desc:
        "「📤 テキストをエクスポート」で英語の原文 JSON を取得し、翻訳後に「📥 テキストをインポート」で適用してください。",
      custom_lang_export: "📤 テキストをエクスポート",
      custom_lang_import: "📥 テキストをインポート",
      custom_lang_apply: "✅ 適用してリロード",
      custom_lang_loaded: "✅ 読み込み済み：{name}",
      custom_lang_activate: "🌐「{name}」を適用",
      custom_lang_json_error: "⚠️ JSON エラー：{msg}",
      custom_lang_paste_hint: "翻訳済み JSON をここに貼り付け …",
      copy_media_prefixed: "✅ プレフィックス付きメディアリンクを {n} 件コピーしました",
      copy_media_urls: "✅ メディアリンクを {n} 件コピーしました",
      wormhole_reset_success: "✅ データを削除しました。再読み込み中…",
      // --- Module F (Webhook) ---
      wh_panel_title: "🔗 Webhook 管理",
      wh_enable: "Webhook を有効化",
      wh_tip: "Webhook 管理",
      wh_add_name_ph: "ラベル（例：動物）",
      wh_add_url_ph: "https://discord.com/api/webhooks/…",
      wh_btn_add: "＋ 追加",
      wh_btn_test: "テスト",
      wh_btn_delete: "削除",
      wh_test_ok: "✅ テスト送信しました！",
      wh_test_fail: "❌ テスト失敗",
      wh_send_content: "📨 Webhook へメッセージ送信 ▶",
      wh_send_urls: "🔗 Webhook へ URL 送信 ▶",
      wh_no_webhooks: "Webhook がまだありません",
      wh_send_ok: "✅ [{name}] へ送信しました",
      wh_send_fail: "❌ 送信失敗 [{name}]",
      wh_no_urls: "⚠️ このメッセージに URL がありません",
      wh_url_invalid: "⚠️ Webhook URL が無効です",
      wh_btn_edit: "編集",
      wh_btn_save: "保存",
      wh_btn_cancel: "キャンセル",
      wh_keep_source: "📎 ソースリンクを含める",
      wh_keep_source_tip: "チェックすると、送信内容の末尾に元のメッセージリンクを追加します。",

      // --- Module G (URL Checker) ---
      uc_duplicate_found: "⚠️ この URL は直近 {limit} 件のメッセージで {count} 回投稿されています",
      uc_duplicate_found_plural: "⚠️ {n} 件の重複 URL（最大 {count} 回、直近 {limit} 件をスキャン）",
      uc_dom_found: "⚠️ この URL は表示中の {limit} 件で {count} 回確認されました（DOM モード · API 不要）",
      uc_no_token: "🔍 URL重複チェックにはワームホール API モードが必要です — ＋ を1秒長押しして設定を開いてください",
      uc_token_waiting: "⏳ API Token を待機中… 任意のチャンネルに一度切り替えると自動取得されます",
      uc_fetching: "🔄 重複 URL をスキャン中…",
      uc_dismiss: "✕",
      uc_limit_label: "スキャン範囲：",
      uc_limit_suffix: "件",
      em_save_success: "{k} を保存しました",

      // --- Module tips ---
      mod_tip_message:    "任意のメッセージを右クリックして、⠿ボタンでコピー・ブックマーク・クイック操作。",
      mod_tip_forwarding: "お気に入りチャンネルやユーザーにメッセージを転送。入力欄上部にツールバーを表示。",
      mod_tip_emoji:      "入力中に検索可能なポップアップからサーバー絵文字を挿入。",
      mod_tip_header:     "メディアの右クリックを解除、ファイルDLヘルパー有効化、コンテンツ乗っ取り防止。",
      mod_tip_wormhole:   "チャット上部のチップでピン留めチャンネルへ即移動。VIP・グループ・フォーカス対応。",
      mod_tip_webhook:    "任意のチャンネルから登録済みWebhookにメッセージを送信。",
      mod_tip_urlchecker: "貼り付けたURLが最近の投稿に既に存在する場合に警告。APIトークン不要（DOMモード）。",
      mod_tip_scout:      "入力欄上の検索ボタンまたはショートカットで現在のチャンネルをキーワード検索。",
      mod_tip_blacklist:  "特定ユーザーのメッセージを薄く表示して目立たなくする。右クリックから追加可能。",

      // --- Channel Scout ---
      cs_panel_title:   "⌨ チャンネル検索",
      cs_placeholder:   "キーワードでチャンネルメッセージを検索…",
      cs_paste_tip:     "クリップボードから貼り付け",
      cs_history_tip:   "最近の検索",
      cs_no_history:    "検索履歴がありません",
      cs_empty_hint:    "キーワードを入力するかタグをクリック",
      cs_no_results:    "該当するメッセージが見つかりません",
      cs_dom_mode_note: "DOMモード · 表示中のメッセージのみ検索",
      cs_right_del_tip: "右クリックでタグ削除",
      cs_add_tag:        "+ タグ追加",
      cs_add_tag_prompt: "新しいタグを入力（右クリックで削除）：",
      cs_float_title:   "チャンネル検索 (F2)",
      cs_float_label:   "チャンネル検索",

      // --- Mute User ---
      mu_panel_title:   "🌫️ ユーザーメッセージ弱化",
      mu_empty:         "弱化中のユーザーなし\nメッセージを右クリックで追加",
      mu_remove_btn:    "解除",
      mu_footer_left:   "右クリックで追加 · ホバーでプレビュー",
      mu_footer_right:  "GMStoreに永続保存",
      mu_add_toast:     "🌫️ 弱化しました：{name}",
      mu_remove_toast:  "✅ 解除しました：{name}",
      mu_ctx_mute:      "🌫️ メッセージを弱化：{name}",
      mu_ctx_unmute:    "✅ 弱化を解除：{name}",
      mu_shortcut:      "Alt+B で弱化管理パネルを開く",
      mu_temp_card_name: "一時",
      mu_temp_card_desc: "タイマー終了後に自動解除",
      mu_temp_quick:    "クイック選択",
      mu_temp_placeholder: "例：3H、1D 6H、27H 20M",
      mu_temp_confirm:  "⏳ 一時的にミュート",
      mu_temp_expired_toast: "⏰ 一時ミュートが終了しました：{name}",
      mu_temp_badge_label: "⏳",
      mu_settings_tab_list:    "ミュートリスト",
      mu_settings_tab_style:   "スタイル設定",
      mu_settings_clear_all:   "すべて削除",
      mu_settings_clear_confirm: "ミュートユーザーをすべて削除しますか？",
      mu_settings_ghost_delay: "Ghost 消去ディレイ（秒）",
      mu_settings_title:       "設定",
    },

    ko: {
      name: "한국어",
      // --- Module A (Forwarding) ---
      fm_pinned_channels: "★ 즐겨찾기",
      fm_toggle_flat: "보기 전환: 타일",
      fm_toggle_drop: "보기 전환: 드롭다운",
      fm_help: "도움말",
      fm_prompt_channel: "채널 키워드 입력:",
      fm_prompt_user: "사용자 키워드 입력 (예: mighty):",
      fm_user_zone: "사용자 영역",
      fm_no_users: "즐겨찾는 사용자 없음",
      fm_add_user: "+ 사용자 추가",
      fm_fuzzy: "퍼지 검색",
      fm_remove_confirm: "「{target}」을(를) 제거하시겠습니까?",
      fm_tooltip_channel: "채널: {c}\n서버: {s}",
      fm_tooltip_user_add: "사용자 영역에 추가 (👤)",
      fm_tooltip_star_add: "채널 즐겨찾기에 추가 (★)",
      fm_manual_title: "📚 전달 관리자 매뉴얼",
      fm_sec_star: "★ 즐겨찾기 및 관리",
      fm_sec_star_content:
        "• <span class='help-key'>★</span> 또는 <span class='help-key'>👤+</span> 클릭하여 추가.<br>• <span class='help-key'>우클릭</span>하여 제거.<br>• <span class='help-key'>Shift+우클릭</span>으로 연속 제거 (확인 없음)。",
      fm_sec_search: "🔍 2단계 검색 (기본값)",
      fm_sec_search_content:
        "• 핀을 클릭하면 '예열 -> 입력 -> 잠금' 프로세스가 자동으로 실행됩니다.<br>• Discord의 '직접 입력 시 검색되지 않음' 버그를 수정합니다.<br>• 잘못된 전달을 방지하기 위해 <span style='color:#2dc770'>정확한 일치</span>를 사용합니다.",
      fm_sec_fuzzy: "⏎ 퍼지 검색",
      fm_sec_fuzzy_content:
        "• 버튼 오른쪽의 <span class='help-key'>⏎</span> 화살표를 클릭합니다.<br>• 처음 두 글자 또는 첫 단어만 입력합니다. 이름이 변경된 경우에 유용합니다.",
      fm_sec_user: "👤 사용자 영역",
      fm_sec_user_content:
        "• 맨 오른쪽 <span class='help-key'>👤</span> 버튼을 클릭하여 사용자 목록을 펼칩니다.<br>• 수동 ID 추가를 지원합니다.",
      fm_sec_misc_title: "⚙️ 표시 및 팁",
      fm_sec_misc:
        "• 왼쪽 상단 버튼으로 <b>타일</b> 또는 <b>드롭다운</b> 표시 모드를 전환합니다.<br>• <b>기록</b>（보라색 배지）은 최근 방문한 채널을 자동으로 저장하며 클릭으로 즉시 돌아갈 수 있습니다.",

      // --- Module D (Wormhole) 설명 ---
      fm_sec_wormhole: "🌀 웜홀 — 기본 조작",
      fm_sec_wormhole_content:
        "• <span class='help-key'>＋</span> 생성 버튼을 클릭하고 Discord 채널 URL을 붙여넣으면 웜홀이 생성됩니다.<br>" +
        "• <b>클릭</b>하면 해당 채널로 즉시 이동합니다.<br>" +
        "• <b>우클릭</b> → 메뉴: 이름 변경, 삭제, 아이콘 설정, 그룹 이동, VIP 전환.<br>" +
        "• <b>VIP（★）</b>：VIP로 설정한 웜홀은 자동으로 맨 위에 고정됩니다.<br>" +
        "• <b>그룹</b>：우클릭 → 그룹으로 이동 으로 웜홀을 폴더에 정리할 수 있습니다.<br>" +
        "• <b>포커스 모드</b>：아이콘만 표시하는 간결한 뷰. 패널 우측 상단 버튼으로 전환.",

      fm_sec_wm_send: "✉️ 웜홀 — 메시지 전송",
      fm_sec_wm_send_content:
        "• <b>우클릭</b> → <b>이 채널에 메시지 보내기</b>로 메시지 입력창을 엽니다.<br>" +
        "• <b>플랜 A（페이지 이동）</b>：대상 채널로 자동 이동 후 Discord 에디터에 텍스트를 주입하고 돌아옵니다. API 불필요.<br>" +
        "• <b>Shift + 클릭</b>：현재 채널에서 입력창을 엽니다（이동 없음）.<br>" +
        "• <b>Ctrl+V 이미지 붙여넣기</b> 지원. 이미지와 텍스트를 하나의 메시지로 함께 전송합니다.<br>" +
        "• 하단 옵션：<b>전송 후 자동 닫기</b> / <b>전송 후 채널로 이동</b>（상호 배타）/ <b>전송 알림 표시</b>。<br>" +
        "• 전송 후 클릭 가능한 알림이 나타나며, 클릭하면 대상 채널로 즉시 이동합니다.",

      fm_sec_wm_api: "⚡ 웜홀 — API 모드（숨겨진 기능）",
      fm_sec_wm_api_content:
        "• <b>웜홀 생성 버튼（＋）을 3초 길게 누르면</b> API 모드 설정 패널이 잠금 해제됩니다.<br>" +
        "• <b>플랜 B（직접 API）</b>：Discord REST API를 통해 메시지를 전송. 페이지 전환 없이 빠르고 스텔스하게 동작.<br>" +
        "• Token은 스크립트가 백그라운드에서 조용히 가로챕니다（Discord 자체 요청에서）. <b>저장·외부 전송 없음</b>，메모리에만 유지，페이지 닫으면 소거.<br>" +
        "• 플랜 B 활성화 시 Token 감지가 자동으로 백그라운드에서 실행됩니다. Discord를 평소처럼 사용하면 자동으로 캡처됩니다.<br>" +
        "• API 모드는 이미지 업로드（multipart/form-data）지원. 텍스트와 이미지를 한 번에 전송.<br>" +
        "• 페이지 새로고침 후 Token이 사라진 경우, 전송 창을 열면 인터셉터가 자동으로 재시작됩니다.",

      // --- Module B (Message Utils) ---
      welcome_title: "{script}에 오신 것을 환영합니다",
      select_lang_subtitle: "인터페이스 언어를 선택하십시오",
      help_btn: "📖 사용 설명서",
      cancel_btn: "✕ 닫기",
      security_notice_title: "⚠️ 보안 면책 조항",
      security_notice_content:
        "URL 변환 기능(vxtwitter, kkinstagram 등)은 타사 서비스에 의존합니다.\n신뢰할 수 없는 경우 사용하지 마십시오.\n사용자는 URL 안전성을 식별할 능력이 있어야 합니다.",
      manual_content:
        "【아이콘 설명】\n• ◫/≡ : 메뉴 스타일 (평면 / 그룹)\n• ⇄ : 클릭 로직 전환 (복사 / 삽입)\n• ␣ : 끝에 공백 추가\n• ↵ : 끝에 줄바꿈 추가\n• ☆ : 사용자 정의 문자열 패널\n• 🖱️ : 트리거 모드 (호버 / 클릭)\n• 🌐 : 언어 변경\n\n【조작 방법】\n• **클릭**: 복사 (기본)\n• **길게 누르기 (0.5초)**: 입력창에 삽입\n• **Shift+클릭**: 복사 및 삽입 (메뉴 유지)",
      manual_content_sections: `<div class='mm-section'><div class='mm-sec-title c-default'>⚡ 빠른 시작</div><div class='mm-content'>Discord 메시지에 마우스를 올리면 → 우측 상단에 복사 버튼이 나타납니다.<br><b>클릭</b>으로 텍스트 복사 · <b>길게 누르기 0.5초</b>로 입력창에 삽입 · <b>Shift+클릭</b>으로 복사와 삽입 동시 실행（메뉴 유지）。<br>툴바의 <span class='mm-key'>🖱️</span> 으로 <span class='mm-key'>클릭 모드</span>로 전환 가능（수동 트리거）。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 복사 메뉴 — 텍스트 & 링크</div><div class='mm-content'>• <b>텍스트 복사</b>：메시지의 전체 텍스트를 복사합니다.<br>• <b>미디어 URL 복사</b>：메시지 내 이미지/동영상의 직접 링크를 복사합니다.<br>• <b>첫 번째 링크 복사（정제됨）</b>：추적 파라미터를 제거한 첫 번째 URL을 복사.<br>• <b>모든 링크 복사</b>：메시지 내 모든 URL을 한 줄씩 복사합니다.<br>• <b>Markdown으로 복사</b>：<span class='mm-key'>[텍스트](URL)</span> 형식으로 변환합니다.<br>• <b>Markdown 링크 삽입</b>：Discord 입력창에 Markdown 형식으로 직접 삽입.<br>• <b>숨김 형식</b>：<span class='mm-key'>|| 스포일러 내용 ||</span> 형식으로 감쌉니다.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ 다운로드</div><div class='mm-content'>• <b>이미지/미디어 다운로드</b>：메시지의 모든 이미지·동영상을 한 번에 다운로드.<br>• <b>ZIP으로 다운로드</b>：여러 파일을 하나의 ZIP 아카이브로 묶어 저장.<br>• 실패 시 자동 재시도하며, 대체 URL로 폴백합니다.</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 URL 변환</div><div class='mm-content'><b>Twitter / X</b>：twitter.com, x.com, vxtwitter, fixupx, fxtwitter, cunnyx 간 상호 변환으로 Discord 프리뷰 수정.<br><b>Instagram</b>：instagram.com ↔ kkinstagram.com 변환으로 임베드 프리뷰 활성화.<br><b>Bilibili</b>：FX Bilibili 또는 VX Bilibili로 변환하여 더 나은 임베드 구현.<br><b>Pixiv</b>：pixiv.net ↔ phixiv.net 상호 변환으로 Discord에서 일러스트 프리뷰.<br><b>일괄 변환</b>：<span class='mm-key'>⚡ 전체 변환 (N)</span> 으로 같은 종류의 링크를 한 번에 모두 변환.</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>🎛️ 툴바 아이콘 설명</div><div class='mm-content'><div class='mm-grid'><div><span class='mm-key'>◫/≡</span> 메뉴 스타일：평면 / 그룹</div><div><span class='mm-key'>⇄</span> 클릭 동작 전환：복사 ↔ 삽입</div><div><span class='mm-key'>␣</span> 삽입 시 끝에 공백 추가</div><div><span class='mm-key'>↵</span> 삽입 시 끝에 줄바꿈 추가</div><div><span class='mm-key'>☆</span> 사용자 정의 문자열 패널</div><div><span class='mm-key'>🖱️</span> 트리거 전환：호버 / 클릭</div><div><span class='mm-key'>🌐</span> 언어 변경</div></div></div></div><div class='mm-section'><div class='mm-sec-title c-default'>☆ 사용자 정의 문자열 패널</div><div class='mm-content'>• 자주 쓰는 텍스트（인사말·템플릿·코드 블록）를 저장할 수 있습니다.<br>• 클릭으로 복사 · 길게 눌러 입력창에 삽입.<br>• <span class='mm-key'>Shift+클릭</span>으로 확인 없이 연속 삭제 가능.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 웜홀 — 개요</div><div class='mm-content'>웜홀은 Discord 사이드바의 <b>원클릭 채널 단축키</b>입니다. <span class='mm-key'>＋</span> 를 클릭하고 Discord 채널 URL을 붙여넣으면 생성됩니다.<br><b>클릭</b> <span class='mm-key'>＋</span> → 새 웜홀 생성 · <b>1초 길게 누르기</b> → 설정 메뉴 열기.</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>🖱️ 탐색 및 관리</div><div class='mm-content'>• <b>클릭</b>하면 해당 채널로 즉시 이동합니다.<br>• <b>우클릭</b> → 메뉴: 이름 변경 · 삭제 · 아이콘 설정 · 그룹 이동 · VIP 전환.<br>• <b>VIP <span class='mm-key'>★</span></b>：설정한 웜홀은 자동으로 맨 위에 고정됩니다.<br>• <b>그룹</b>：우클릭 → 그룹으로 이동 으로 폴더에 정리.<br>• <b>포커스 모드</b>：아이콘만 표시. 패널 우측 상단 버튼으로 전환.<br>• <b>기록</b>（보라색 배지）：최근 방문 채널 자동 저장, 클릭으로 즉시 복귀.</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>✉️ 메시지 전송</div><div class='mm-content'>• <b>우클릭</b> → <b>이 채널에 메시지 보내기</b> 로 오버레이 열기.<br>• <span class='mm-key'>Ctrl+V</span> 로 이미지 직접 붙여넣기 — 텍스트와 함께 하나의 메시지로 전송.<br>• 하단 옵션（세션 간 유지）：자동 닫기 · 채널로 이동 · 알림 표시.<br>• 전송 후 3초간 토스트 표시, 클릭하면 즉시 해당 채널로 이동합니다.</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>⚙️ 설정 메뉴 및 API 모드</div><div class='mm-content'>• <b><span class='mm-key'>＋</span> 를 1초 길게 누르면</b> 웜홀 설정 메뉴가 열립니다.<br>• 메뉴 항목：<span class='mm-key'>➕ 새 웜홀 생성</span> · <span class='mm-key'>✉️ 전송 방식 및 API 모드</span> · <span class='mm-key'>⚙️ 추가 설정</span>（확장 예정）。<br>• 「<b>전송 방식 및 API 모드</b>」→ API 설정 패널 열기：<br>&nbsp;&nbsp;— <b>플랜 A（페이지 이동）</b>：자동 이동→텍스트 주입→복귀. Token 불필요.<br>&nbsp;&nbsp;— <b>플랜 B（직접 API）</b>：REST API 전송. 페이지 전환 없이 즉시·스텔스.<br>• Token은 Discord 자체 요청에서 백그라운드로 조용히 가로챕니다——<b>디스크 저장 없음.</b><br>• 페이지 새로고침 후：전송 오버레이를 열면 인터셉터가 자동 재시작.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🔍 중복 URL 검사기</div><div class='mm-content'>채팅창에 URL을 붙여넣으면 같은 링크가 이전에 공유된 적 있는지 자동으로 확인합니다.<br>• <b>DOM 모드</b>（기본）：현재 화면에 표시된 메시지 전체 스캔. API 토큰 불필요.<br>• <b>API 모드</b>：Discord API로 최근 200개 메시지 스캔（웜홀 API 모드 활성화 + 토큰 캡처 필요）.<br>• 중복 감지 시 채팅 상단에 배너 표시（해당 링크가 몇 번 등장했는지 표시）.<br>• 다른 URL을 붙여넣거나 채널을 전환하면 배너 자동 소거.<br>• <b>배너 없음 = 중복 없음</b>——일치하지 않을 때는 백그라운드에서 무음으로 동작.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🔎 채널 검색 Channel Scout</div><div class='mm-content'>채팅 화면에서 키워드로 현재 채널 메시지를 검색합니다.<br>• <b>열기</b>：입력창 위의 🔎 플로팅 버튼 클릭, 또는 입력창 밖에서 <span class='mm-key'>F2</span>.<br>• <b>실시간 검색</b>：입력 즉시 결과 업데이트（150ms 딜레이）. 키워드 금색 하이라이트.<br>• <b>빠른 태그</b>：사용자 정의 키워드 최대 5개 저장. 좌클릭으로 검색·우클릭으로 삭제.<br>• <b>검색 기록</b>：🕐 버튼으로 최근 5건 표시, 클릭으로 재검색.<br>• <b>메시지로 이동</b>：결과 클릭 시 스크롤 이동 + 파란 테두리 하이라이트.<br>• <b>붙여넣기 버튼</b>：📋 클릭으로 클립보드를 검색창에 직접 입력.<br>• <span class='mm-key'>ESC</span>・<span class='mm-key'>F2</span>・패널 외부 클릭으로 닫기.<br>⚠ DOM 모드만 지원——현재 렌더링된 메시지만 검색 가능. 오래된 메시지는 먼저 스크롤하여 로드하세요.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌫️ 사용자 메시지 약화</div><div class='mm-content'>특정 사용자의 메시지를 배경에 녹아들도록 흐리게 표시합니다（숨기지 않고 약화）.<br>• <b>약화 추가</b>：메시지 우클릭 → 「차단」아래 <b>🌫️ 메시지 약화：{이름}</b> → 클릭.<br>• <b>약화 해제</b>：같은 사용자 메시지 우클릭 → <b>✅ 약화 해제：{이름}</b>.<br>• <b>관리 패널</b>：<span class='mm-key'>Alt+B</span> 로 약화 목록 열기. 추가일과 해제 버튼 표시.<br>• 약화된 메시지는 <b>불투명도 7%</b> 표시. 호버 시 42%로 일시 미리보기 가능.<br>• <b>표시 이름</b>으로 식별（User ID 미사용）, 모든 채널에서 유효.<br>• 새 메시지 수신 및 채널 전환 후 자동 재적용.<br>• 데이터는 GM storage에 영구 저장, 페이지 새로고침 후에도 유지.</div></div></div></div>`,
      reload_confirm:
        "설정이 저장되었습니다!\n지금 페이지를 새로 고치시겠습니까?",
      copy_text: "📋 텍스트 복사",
      copy_media_url: "🖼️ 미디어 URL 복사",
      no_content: "⚠️ 콘텐츠 없음",
      copy_first_link: "🔗 첫 번째 링크 복사 (Clean)",
      copy_markdown: "🧾 마크다운으로 복사",
      copy_all_links: "📎 모든 링크 복사",
      insert_format_link: "📌 [{t}](URL) 삽입",
      copy_hidden_format: "🙈 숨겨진 텍스트 복사 (|| ... ||)",
      download_images: "⬇️ 이미지 또는 미디어 일괄 다운로드",
      download_zip: "📦 ZIP으로 다운로드",
      download_start: "🚀 다운로드 중...",
      download_zip_start: "📦 {n}개의 파일 압축 중...",
      download_fail: "❌ 다운로드 실패",
      download_cors_fail:
        "⚠️ CORS 제한으로 직접 다운로드할 수 없습니다. URL을 복사하여 브라우저에서 열어 저장해주세요.",
      original_url: "🔗 원본 URL",
      convert_all: "⚡ 모두 변환 ({n})",
      convert_imgur: "🖼️ i.imgur.com으로 변환",
      to_twitter: "🐦 twitter.com으로",
      to_x: "❌ x.com으로",
      to_vxtwitter: "🔁 vxtwitter로",
      to_fixupx: "🛠️ fixupx로",
      to_fxtwitter: "🔧 fxtwitter로",
      to_cunnyx: "🍑 cunnyx로",
      to_fixvx: "🧩 fixvx로",
      to_reddit: "👽 reddit.com으로",
      to_old_reddit: "📜 old.reddit으로",
      to_rxddit: "🔁 rxddit으로",
      to_vxreddit: "🛠️ vxreddit으로",
      to_instagram: "📷 instagram.com으로",
      to_kkinstagram: "🔁 kkinstagram으로",
      to_vxinstagram: "🔁 vxinstagram으로",
      to_ddinstagram: "🔁 ddinstagram으로",
      to_uuinstagram: "🔁 uuinstagram으로",
      to_facebed: "🔁 facebed.com으로",
      to_tiktok: "🎵 tiktok.com으로",
      to_vxtiktok: "🔁 vxtiktok으로",
      to_tnktok: "🛠️ tnktok으로",
      to_threads: "🧵 threads.com으로",
      to_fixthreads: "🔁 fixthreads으로",
      to_fx_bilibili: "📺 FX Bilibili로",
      to_vx_bilibili: "📼 VX Bilibili로",
      to_b23: "🔗 b23.tv로",
      to_vxb23: "🔗 vxb23.tv로",
      to_phixiv: "🔙 phixiv.net으로",
      to_pixiv: "🎨 pixiv.net으로",
      yt_shorts_to_watch: "▶️ YT Shorts → 일반 링크",
      restore_pixiv_img: "📖 이미지에서 pixiv 복원",
      insert_symbol: "✳️ 삽입 → {s}",
      delete_symbol: "❌",
      delete_confirm: "삭제됨: {s}",
      add_symbol: "➕ 추가",
      add_symbol_prompt: "추가할 텍스트 입력:",
      add_success: "추가되었습니다",
      remove_symbol: "➖ 삭제",
      remove_symbol_prompt: "삭제할 텍스트 입력:",
      remove_empty: "목록이 비었습니다",
      mode_hover: "🔄 호버",
      mode_click: "🖱️ 클릭",
      mode_desc: "모드: {mode} (클릭하여 전환)",
      mode_changed: "모드가 변경되었습니다: {mode}",
      export_success: "✅ 설정 내보내기 완료!\n\n클립보드에 복사되었습니다.",
      import_prompt: "⬇️ 백업 코드 (JSON) 붙여넣기:",
      import_success: "✅ 가져오기 성공!\n페이지를 새로고침합니다.",
      import_fail: "❌ 가져오기 실패: 잘못된 형식.",
      insert_success: "삽입됨",
      copy_success: "복사됨",
      copy_fail: "복사 실패",
      input_not_found: "입력창을 찾을 수 없습니다",
      edit_link_text: "링크 텍스트 편집",
      enter_link_text: "링크 접두사 입력 (제거하려면 비워 두세요):",
      tip_style: "메뉴 스타일: 평면 / 그룹",
      tip_trigger: "트리거: 호버 / 클릭",
      tip_logic: "클릭 로직: 복사 / 삽입",
      tip_space: "공백 추가",
      tip_newline: "줄바꿈 추가",
      tip_symbols: "사용자 정의 문자열 보기",
      tip_lang: "언어 변경",
      tip_manual: "매뉴얼",
      mod_msg_warn_title: "⚠️ 메시지 유틸리티를 비활성화하시겠습니까?",
      mod_msg_warn_body:
        "⠿ 메시지 유틸리티는 이 스크립트의 핵심 기능입니다.\\n비활성화하면 모든 메시지의 ⠿ 버튼이 사라집니다.\\n\\n다시 활성화하려면: Tampermonkey 아이콘 우클릭 → '⠿ 메시지 유틸리티 활성화' 선택.",
      mod_msg_warn_confirm: "비활성화",
      mod_msg_warn_cancel: "취소",
      mod_msg_enable_menu: "⠿ 메시지 유틸리티 활성화",
      rescue_reload_msg: "설정을 업데이트했습니다. 페이지를 새로고침해야 적용됩니다. 지금 새로고침하시겠습니까?",
      rescue_close_btn: "닫기",
      grp_copy: "📝 복사 >",
      grp_convert: "🔄 변환 >",
      grp_download: "⬇️ 다운로드 >",
      grp_system: "⚙️ 시스템 >",
      grp_webhook: "🔗 Webhook >",
      view_main: "메인",
      view_symbols: "기호",

      // --- Module C (Expression Helper) - [UPDATED] ---
      em_title: "😊 이모티콘/GIF 매니저",
      em_content:
        "• <b>도구 모음</b>: [📁] 컬렉션 | [🎯] 선택 모드 | [★] 키워드.<br>• <b>선택 모드</b>: 화면의 GIF나 이모티콘을 클릭하여 저장하세요.<br>• <b>컬렉션</b>: 탭 관리를 지원하며, 드래그하여 순서를 변경할 수 있습니다.<br>• <b>Shift + 클릭</b>: 패널을 닫지 않고 연속 전송.",
      em_picker_tip: "🔍 이미지를 클릭하여 저장 (취소하려면 배경 클릭)",
      em_err_no_list: "목록을 찾을 수 없습니다. 창을 먼저 여세요!",
      em_btn_add_title:
        "클릭: 검색 키워드를 즐겨찾기에 추가합니다. Shift 키를 누른 채로 연속 삭제할 수 있습니다.",
      em_btn_active_title: "클릭: 검색어 입력 (토글)",
      em_btn_target_title: "선택 모드: 클릭하여 저장",
      em_btn_save_this: "컬렉션에 저장",
      em_no_favs: "즐겨찾기 없음",
      em_del_confirm: "「{k}」을(를) 삭제하시겠습니까?",
      em_note_prompt: "메모:",
      em_set_cover_success: "커버 이미지가 설정되었습니다!",

      // --- Module D (Wormhole) ---
      wm_url_prompt: "Discord 채널 전체 URL을 입력하세요:",
      wm_name_prompt: "웜홀 이름을 입력하세요 (예: 잡담):",
      wm_edit_title: "웜홀 편집: {n}",
      wm_created: "웜홀이 생성되었습니다!",
      wm_deleted: "웜홀이 닫혔습니다.",
      wm_nav_fail: "이동 실패, URL을 확인하세요.",
      wm_alert_invalid_url:
        "유효하지 않은 링크입니다! Discord 채널 URL(/channels/ 포함)을 복사하세요.",
      wm_default_channel_name: "채널",
      wm_refresh_confirm:
        "웜홀이 생성되었지만 인터페이스가 즉시 업데이트되지 않습니다.\nDiscord가 UI를 잠갔을 수 있습니다.\n\n지금 페이지를 새로고침하여 표시하시겠습니까?",
      wm_root_group: "미분류",

      // 메뉴 동작
      wm_menu_edit: "✎ 이름 편집",
      wm_menu_del: "🗑️ 웜홀 닫기",
      wm_menu_vip_add: "★ VIP 설정 (고정)",
      wm_menu_vip_remove: "☆ VIP 해제",
      wm_menu_move: "📂 그룹으로 이동",

      // 그룹 관련
      wm_group_prompt: "새 그룹 이름을 입력하세요:",
      wm_edit_group: "그룹 이름 편집:",
      wm_group_del_confirm:
        "그룹 '{n}'을(를) 해체하시겠습니까? (내부 웜홀은 유지됩니다)",
      wm_group_select_prompt:
        "번호로 그룹을 선택하세요:\n\n0. [루트/미분류]\n{list}\n\n비워두고 확인을 누르면 '새 그룹' 생성:",
      wm_group_invalid: "유효하지 않은 그룹 선택입니다!",
      wm_move_prompt: "어느 그룹으로 이동하시겠습니까? (숫자 입력)\n\n{list}",
      wm_icon_picker_title: "{name}의 아이콘 선택",
      wm_icon_set_success: "✅ {name}의 아이콘이 설정되었습니다",
      wm_icon_empty: "먼저 컬렉션 이미지 모듈에서 Emoji를 추가하세요",
      wm_title:
        "웜홀 컨트롤\n• 클릭: 새 웜홀 생성\n• 1초 길게 누르기: 설정 메뉴 열기",
      wm_settings_menu_title: "🌀 웜홀 설정",
      wm_settings_create: "새 웜홀 생성",
      wm_settings_send_mode: "전송 방식 및 API 모드",
      wm_settings_more: "추가 설정 (출시 예정)",
      wm_settings_position: "웜홀 위치 전환",
      wm_settings_position_navbar: "내비게이션 바",
      wm_settings_position_titlebar: "채널 타이틀바",
      wm_settings_position_input: "채팅 입력창 위",
      wm_settings_position_topleft: "왼쪽 상단 고정",
      wm_focus_on: "포커스 모드 끄기",
      wm_focus_off: "포커스 모드 켜기 (아이콘만 표시)",
      wm_focus_size: "아이콘 크기",
      wm_focus_size_s: "S  · 작게",
      wm_focus_size_m: "M  · 보통",
      wm_focus_size_l: "L  · 크게",

      // 웜홀로 메시지 전송
      wm_menu_send: "✉️ 이 채널에 메시지 보내기",
      wm_send_placeholder: "#{name} 에 보낼 메시지를 입력하세요...",
      wm_send_btn: "전송",
      wm_send_cancel: "취소",
      wm_send_waiting: "편집기 준비 대기 중...",
      wm_send_injecting: "전송 중...",
      wm_send_success: "✅ #{name} 에 전송되었습니다！",
      wm_send_toast_title: "✅ #{name} 에 전송되었습니다",
      wm_send_toast_hint: "클릭하면 채널로 이동",
      wm_send_waiting_token: "⏳ Token 대기 중…",
      wm_send_fail: "❌ 전송 실패 — 편집기가 준비되지 않았습니다.",
      wm_send_empty: "메시지를 입력해 주세요.",
      wm_send_returning: "원래 채널로 돌아가는 중...",
      wm_send_hint: "Shift+클릭으로 채널 전환 없이 전송할 수 있습니다",
      wm_send_field_add:    "+ 필드 추가",
      wm_send_field_del:    "필드 제거",
      wm_send_sending_n:    "전송 중 {n}/{total}…",
      wm_send_cool_warn:    "쿨다운: {s}초 후 다음 메시지 전송",
      wm_send_chat_btn:     "메시지 보내기",
      wm_send_mode_api: "⚡ API 모드",
      wm_send_mode_nav: "🔀 페이지 이동 모드",
      wm_send_mode_desc_api: "직접 전송, 채널 전환 없음",
      wm_send_mode_desc_nav: "대상 채널로 이동 후 전송",
      wm_send_autoclose: "전송 후 자동 닫기",
      wm_send_show_toast: "전송 알림 표시",
      wm_send_goto_channel: "전송 후 해당 채널로 이동",
      wm_send_paste_hint: "📋 Ctrl+V 로 이미지 붙여넣기",
      wm_send_token_warn:
        "⚠️ Token이 만료되었습니다. API 패널을 다시 열어 감지해 주세요. 이번에는 플랜 A를 사용합니다.",
      wm_send_channel_fail: "❌ 채널 로드 실패",
      wm_send_editor_missing: "❌ 입력창을 찾을 수 없습니다",
      wm_send_uploading: "📎 {n}개의 이미지 업로드 중...",

      // 플랜 B — API 모드
      wm_api_panel_title: "⚗️ 웜홀 API 모드 (고급)",
      wm_api_mode_label_a: "플랜 A — 페이지 이동 (기본)",
      wm_api_mode_label_b: "플랜 B — 직접 API (페이지 전환 없음)",
      wm_api_warning_title: "⚠️ 위험 고지",
      wm_api_warning_body:
        "User Token으로 Discord API를 호출하는 것은 Discord 서비스 약관을 위반합니다. 계정이 정지될 수 있으며, 사용 시 모든 책임은 본인에게 있습니다.",
      wm_api_token_status_none: "Token：미감지",
      wm_api_token_status_ready: "Token：준비됨 (메모리 전용)",
      wm_api_detect_btn: "내 Token 감지하기",
      wm_api_detect_confirm:
        "【Token 인터셉트 — 동의 확인】\n\n「확인」을 클릭하면 이 스크립트가 현재 세션 중 귀하의 Discord Token을 가로채는 것에 동의하는 것으로 간주됩니다.\n\n🔒 보안 보장：\n• 브라우저 메모리에만 저장되며, 디스크나 스토리지에는 절대 기록되지 않습니다\n• 페이지를 닫거나 새로고침하면 자동으로 삭제되어 흔적이 남지 않습니다\n• 어떤 외부 서버에도 전송되지 않으며, 모든 요청은 discord.com 으로 직접 전송됩니다\n• 귀하를 대신하여 POST /channels/{id}/messages 를 실행하는 용도로만 사용됩니다\n\n⚠️ 사용자 확인 사항：\n• 이 Token에 메시지 전송 권한이 포함되어 있음을 이해합니다\n• 이 모드를 통해 전송된 모든 메시지에 대한 책임은 본인이 집니다\n\n스크립트를 신뢰하고 위 내용을 이해한 후 계속하십시오。",
      wm_api_detect_waiting:
        "⬆️ 아무 채널로 한 번 전환하면 Token이 자동으로 감지됩니다",
      wm_api_enable_btn: "API 모드 활성화",
      wm_api_disable_btn: "API 모드 비활성화 (플랜 A로 돌아가기)",
      wm_api_enabled_toast: "✅ API 모드가 활성화되었습니다",
      wm_api_disabled_toast: "↩️ 페이지 이동 모드로 돌아왔습니다",
      wm_api_view_code: "Token 인터셍트 코드 보기",
      wm_api_clear_token: "🗑 Token 삭제",
      wm_api_reset_all: "🗑️ 모든 웹홀 데이터 초기화",
      wm_api_plan_b_first: "먼저 플랜 B를 선택해 주세요",
      wm_api_send_fail: "❌ API 전송 실패 — 콘솔을 확인해 주세요",

      // --- 컬렉션 및 툴팁 ---
      em_col_title: "내 컬렉션",
      em_col_add_success: '"{g}"에 저장되었습니다！',
      em_col_tab_new: "새 탭",
      em_col_tab_prompt: "새 탭 이름:",
      em_col_empty_tab: "이 탭은 비어 있습니다.",
      em_col_del_tab_confirm: '탭 "{n}"과 모든 항목을 삭제하시겠습니까?',
      em_modal_choose_tab: "어느 컬렉션에 저장하시겠습니까?",
      em_modal_create_new: "+ 새로 만들기...",
      em_col_refresh_tooltip: "GIF 미리보기 새로고침 (만료된 CDN 캐시 새로고침)",
      em_refresh_no_expired:   "ℹ️ 이 탭에 만료된 GIF가 없습니다",
      em_refresh_consent:      "⚠️ GIF 새로고침에 대하여\n\n이 기능은 서드파티 프록시(fixcdn.hyonsu.com)를 통해\nDiscord 첨부 파일 접근 자격을 갱신합니다.\n\n주의 사항:\n• 이미지 URL이 fixcdn.hyonsu.com에 전송됩니다\n• 해당 서비스는 Discord 및 이 스크립트와 무관한 제3자가 운영합니다\n• 진행 전 'fixcdn hyonsu'를 검색하여 확인하시기 바랍니다\n\n계속하시겠습니까?",
      em_refresh_cancel_tip:   "ℹ️ 취소됨. 수동 업데이트 방법:\n① Discord에서 원본 GIF 메시지 찾기\n② 다시 콜렉션에 추가하기",
      em_refresh_loading:      "Refreshing...",
      em_refresh_ok:           "✨ GIF {n}개 새로고침 완료{fail} {track}",
      em_refresh_partial_fail: " ({f}개 실패)",
      em_refresh_fail:         "⚠️ 이 탭의 GIF를 새로고침할 수 없습니다",
      em_refresh_track_api:    "(Discord API)",
      em_refresh_track_cdn:    "(fixcdn)",
      em_tip_pick: "커버 이미지 설정",
      em_tip_edit: "메모 편집",
      em_tip_delete: "삭제",
      em_menu_emoji: "이모지",
      em_menu_sticker: "스티커",
      em_menu_gif: "GIF",

      // --- GM 메뉴 명령 ---
      menu_export: "📤 설정 내보내기 (Backup)",
      menu_import: "⬇️ 설정 가져오기 (Restore)",
      menu_change_lang: "🌐 언어 변경 (Language)",
      custom_lang_desc:
        "「📤 텍스트 내보내기」로 영어 원문 JSON을 받고, 번역 후 「📥 텍스트 가져오기」로 적용하세요.",
      custom_lang_export: "📤 텍스트 내보내기",
      custom_lang_import: "📥 텍스트 가져오기",
      custom_lang_apply: "✅ 적용 및 새로고침",
      custom_lang_loaded: "✅ 불러옴：{name}",
      custom_lang_activate: '🌐 "{name}" 적용',
      custom_lang_json_error: "⚠️ JSON 오류：{msg}",
      custom_lang_paste_hint: "번역된 JSON을 여기에 붙여넣기 …",
      copy_media_prefixed: "✅ 접두사가 포함된 미디어 링크 {n}개를 복사했습니다",
      copy_media_urls: "✅ 미디어 링크 {n}개를 복사했습니다",
      wormhole_reset_success: "✅ 데이터가 삭제되었습니다. 새로고침 중…",
      // --- Module F (Webhook) ---
      wh_panel_title: "🔗 Webhook 관리",
      wh_enable: "Webhook 활성화",
      wh_tip: "Webhook 관리",
      wh_add_name_ph: "레이블 (예: 동물)",
      wh_add_url_ph: "https://discord.com/api/webhooks/…",
      wh_btn_add: "＋ 추가",
      wh_btn_test: "테스트",
      wh_btn_delete: "삭제",
      wh_test_ok: "✅ 테스트 전송 완료!",
      wh_test_fail: "❌ 테스트 실패",
      wh_send_content: "📨 Webhook으로 메시지 전송 ▶",
      wh_send_urls: "🔗 Webhook으로 URL 전송 ▶",
      wh_no_webhooks: "등록된 Webhook이 없습니다",
      wh_send_ok: "✅ [{name}]으로 전송됨",
      wh_send_fail: "❌ 전송 실패 [{name}]",
      wh_no_urls: "⚠️ 이 메시지에 URL이 없습니다",
      wh_url_invalid: "⚠️ Webhook URL이 유효하지 않습니다",
      wh_btn_edit: "편집",
      wh_btn_save: "저장",
      wh_btn_cancel: "취소",
      wh_keep_source: "📎 출처 링크 포함",
      wh_keep_source_tip: "체크 시 전송 내용 끝에 원본 메시지 링크가 추가됩니다.",

      // --- Module G (URL Checker) ---
      uc_duplicate_found: "⚠️ 이 URL은 최근 {limit}개 메시지에서 {count}번 게시되었습니다",
      uc_duplicate_found_plural: "⚠️ {n}개 중복 URL（최대 {count}번, 최근 {limit}개 스캔）",
      uc_dom_found: "⚠️ 이 URL이 표시된 {limit}개 메시지에서 {count}번 발견되었습니다（DOM 모드 · API 불필요）",
      uc_no_token: "🔍 중복 URL 검사는 웜홀 API 모드가 필요합니다 — ＋ 버튼을 1초 길게 눌러 설정을 여세요",
      uc_token_waiting: "⏳ API Token 대기 중… 임의 채널로 한 번 전환하면 자동으로 캡처됩니다",
      uc_fetching: "🔄 중복 URL 스캔 중…",
      uc_dismiss: "✕",
      uc_limit_label: "스캔 범위：",
      uc_limit_suffix: "개 메시지",
      em_save_success: "저장됨: {k}",

      // --- Channel Scout / Mute User (UI 字串) ---
      cs_panel_title:    "⌨ 채널 검색",
      cs_placeholder:    "키워드로 채널 메시지 검색…",
      cs_paste_tip:      "클립보드에서 붙여넣기",
      cs_history_tip:    "최근 검색",
      cs_no_history:     "검색 기록 없음",
      cs_no_results:     "일치하는 메시지 없음",
      cs_empty_hint:     "키워드를 입력하거나 태그를 클릭하세요",
      cs_dom_mode_note:  "DOM 모드 · 현재 표시된 메시지만 검색",
      cs_right_del_tip:  "태그를 우클릭하면 삭제",
      cs_add_tag:        "+ 태그 추가",
      cs_add_tag_prompt: "새 태그 입력 (우클릭으로 삭제):",
      cs_float_title:    "채널 검색 (F2)",
      cs_float_label:    "채널 검색",
      mu_panel_title:   "🌫️ 사용자 메시지 약화",
      mu_empty:         "약화된 사용자 없음\n메시지를 우클릭하여 추가",
      mu_remove_btn:    "해제",
      mu_add_toast:     "🌫️ 약화됨: {name}",
      mu_remove_toast:  "✅ 해제됨: {name}",
      mu_ctx_mute:      "🌫️ 메시지 약화: {name}",
      mu_ctx_unmute:    "✅ 약화 해제: {name}",
      mu_temp_card_name: "임시",
      mu_temp_card_desc: "타이머 종료 후 자동 해제",
      mu_temp_quick:    "빠른 선택",
      mu_temp_placeholder: "예: 3H, 1D 6H, 27H 20M",
      mu_temp_confirm:  "⏳ 임시 음소거",
      mu_temp_expired_toast: "⏰ 임시 음소거 만료: {name}",
      mu_temp_badge_label: "⏳",
      mu_settings_tab_list:    "음소거 목록",
      mu_settings_tab_style:   "스타일 설정",
      mu_settings_clear_all:   "전체 삭제",
      mu_settings_clear_confirm: "모든 음소거 대상을 제거할까요?",
      mu_settings_ghost_delay: "Ghost 사라짐 지연 (초)",
      mu_settings_title:       "설정",
    },
    es: {
      name: "Español",
      // --- Module A (Forwarding) ---
      fm_pinned_channels: "★ Canales fijados",
      fm_toggle_flat: "Cambiar a: Vista plana",
      fm_toggle_drop: "Cambiar a: Desplegable",
      fm_help: "Ayuda",
      fm_prompt_channel: "Introduce la palabra clave del canal:",
      fm_prompt_user: "Introduce el ID o palabra clave del usuario:",
      fm_user_zone: "Zona de usuarios",
      fm_no_users: "Sin usuarios fijados",
      fm_add_user: "+ Añadir usuario",
      fm_fuzzy: "Búsqueda aproximada",
      fm_remove_confirm: "¿Eliminar {target}?",
      fm_tooltip_channel: "Canal: {c}\nServidor: {s}",
      fm_tooltip_user_add: "Añadir a Zona de usuarios (👤)",
      fm_tooltip_star_add: "Añadir a Favoritos (★)",
      fm_manual_title: "📚 Manual del Administrador de Reenvío",
      fm_sec_star: "★ Favoritos y gestión",
      fm_sec_star_content:
        "• Haz clic en <span class='help-key'>★</span> o <span class='help-key'>👤+</span> para fijar.<br>• Clic derecho para eliminar.<br>• <span class='help-key'>Shift+Clic derecho</span> para eliminar rápido (sin confirmar).",
      fm_sec_search: "🔍 Búsqueda en dos pasos (predeterminado)",
      fm_sec_search_content:
        "• Al hacer clic en un pin se ejecuta automáticamente 'Precalentamiento → Entrada → Bloqueo'.<br>• Corrige el error de Discord donde la entrada directa falla.<br>• Usa <span style='color:#2dc770'>Coincidencia exacta</span> para evitar reenvíos incorrectos.",
      fm_sec_fuzzy: "⏎ Búsqueda aproximada",
      fm_sec_fuzzy_content:
        "• Haz clic en la flecha <span class='help-key'>⏎</span> dentro del botón.<br>• Introduce solo los 2 primeros caracteres o la primera palabra.",
      fm_sec_user: "👤 Zona de usuarios",
      fm_sec_user_content:
        "• Haz clic en el botón <span class='help-key'>👤</span> para expandir la lista de usuarios.<br>• Admite adición manual de ID.",
      fm_sec_misc_title: "⚙️ Consejos y visualización",
      fm_sec_misc:
        "• El botón superior izquierdo alterna el modo <b>Plano</b> o <b>Desplegable</b>.<br>• El <b>Historial</b> (etiquetas moradas) guarda automáticamente los canales visitados recientemente.",

      // --- Module D (Wormhole) Manual ---
      fm_sec_wormhole: "🌀 Agujero de gusano — Básico",
      fm_sec_wormhole_content:
        "• Haz clic en <span class='help-key'>＋</span> y pega una URL de canal de Discord para crear un acceso directo.<br>" +
        "• <b>Clic</b> en un agujero de gusano → salta instantáneamente a ese canal.<br>" +
        "• <b>Clic derecho</b> → menú: renombrar, eliminar, icono, mover a grupo o alternar VIP.<br>" +
        "• <b>VIP (★)</b>: los agujeros fijados flotan arriba automáticamente.<br>" +
        "• <b>Grupos</b>: organiza agujeros en carpetas con nombre.<br>" +
        "• <b>Modo enfoque</b>: vista compacta solo con iconos.",
      fm_sec_wm_send: "✉️ Agujero de gusano — Enviar mensaje",
      fm_sec_wm_send_content:
        "• <b>Clic derecho</b> → <b>Enviar mensaje aquí</b> para abrir el panel.<br>" +
        "• <b>Modo A (Navegar)</b>: cambia al canal destino, inyecta texto y regresa.<br>" +
        "• <b>Shift+Clic</b> → abre el panel en el canal actual.<br>" +
        "• Admite <b>pegar imágenes con Ctrl+V</b>.<br>" +
        "• Opciones inferiores: <b>Cierre automático</b> / <b>Ir al canal</b> / <b>Mostrar notificación</b>.",
      fm_sec_wm_api: "⚡ Agujero de gusano — Modo API (secreto)",
      fm_sec_wm_api_content:
        "• <b>Mantén presionado el botón ＋ 3 segundos</b> para desbloquear el Modo API.<br>" +
        "• <b>Modo B (API directa)</b>: envía mensajes vía Discord REST API sin cambiar de página.<br>" +
        "• El token se intercepta silenciosamente en memoria — <b>nunca se almacena ni transmite</b>.<br>" +
        "• Se borra al cerrar la página.",
      welcome_title: "Bienvenido a {script}",
      select_lang_subtitle: "Por favor, selecciona el idioma de la interfaz",
      help_btn: "📖 Manual",
      cancel_btn: "✕ Cerrar",
      security_notice_title: "⚠️ Aviso de seguridad",
      security_notice_content:
        "Las funciones de conversión de URL (como vxtwitter, kkinstagram) dependen de servicios de terceros.\nNo las uses si no confías en dichos servicios.\nLos usuarios deben ser capaces de identificar la seguridad de las URL.",
      manual_content:
        "【Guía de iconos】\n• ◫/≡ : Cambiar estilo de menú (Plano / Grupo)\n• ⇄ : Intercambiar lógica de clic (Copiar / Insertar)\n• ␣ : Añadir espacio al final\n• ↵ : Añadir nueva línea al final\n• ☆ : Panel de cadenas personalizadas\n• 🖱️ : Modo de activación (Hover / Clic)\n• 🌐 : Cambiar idioma\n\n【Acciones】\n• **Clic**: Copiar (predeterminado)\n• **Pulsación larga (0,5s)**: Insertar en el cuadro de texto\n• **Shift+Clic**: Copiar e insertar (mantiene el menú abierto)",
      manual_content_sections:
        "<div class='mm-section'><div class='mm-sec-title c-default'>⚡ Inicio rápido</div><div class='mm-content'>Pasa el cursor sobre cualquier mensaje de Discord → aparece un botón de copiar en la esquina superior derecha.<br><b>Clic</b> para copiar texto · <b>Pulsación larga 0,5s</b> para insertar · <b>Shift+Clic</b> para copiar e insertar.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 Menú de copia</div><div class='mm-content'>• Copiar texto, URL de medios, primer enlace limpio, todos los enlaces, Markdown, texto oculto.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ Descargar</div><div class='mm-content'>• Descargar imágenes/medios individualmente o como ZIP.</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 Conversión de URL</div><div class='mm-content'>Twitter/X, Instagram, Bilibili, Pixiv — conversión mutua para previsualizaciones en Discord.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 Agujero de gusano</div><div class='mm-content'>Accesos directos de canal con un clic en la barra lateral de Discord.</div></div>",
      reload_confirm: "¡Configuración guardada!\n¿Recargar la página ahora?",
      copy_text: "📋 Copiar texto",
      copy_media_url: "🖼️ Copiar URL de medios",
      no_content: "⚠️ Sin contenido",
      copy_first_link: "🔗 Copiar primer enlace (limpio)",
      copy_markdown: "🧾 Copiar como Markdown",
      copy_all_links: "📎 Copiar todos los enlaces",
      insert_format_link: "📌 Insertar [{t}](URL)",
      copy_hidden_format: "🙈 Texto oculto (|| ... ||)",
      download_images: "⬇️ Descargar imágenes/medios",
      download_zip: "📦 Descargar como ZIP",
      download_start: "🚀 Descargando...",
      download_zip_start: "📦 Comprimiendo {n} archivos...",
      download_fail: "❌ Error al descargar",
      download_cors_fail:
        "⚠️ CORS impide la descarga directa. Copia la URL y ábrela en el navegador.",
      original_url: "🔗 URL original",
      convert_all: "⚡ Convertir todo ({n})",
      convert_imgur: "🖼️ Convertir a i.imgur.com",
      to_twitter: "🐦 twitter.com",
      to_x: "❌ x.com",
      to_vxtwitter: "🔁 vxtwitter",
      to_fixupx: "🛠️ fixupx",
      to_fxtwitter: "🔧 fxtwitter",
      to_cunnyx: "🍑 cunnyx",
      to_fixvx: "🧩 fixvx",
      to_reddit: "👽 reddit.com",
      to_old_reddit: "📜 old.reddit",
      to_rxddit: "🔁 rxddit",
      to_vxreddit: "🛠️ vxreddit",
      to_instagram: "📷 instagram.com",
      to_kkinstagram: "🔁 kkinstagram",
      to_vxinstagram: "🔁 to vxinstagram",
      to_ddinstagram: "🔁 to ddinstagram",
      to_uuinstagram: "🔁 to uuinstagram",
      to_facebed: "🔁 facebed.com",
      to_tiktok: "🎵 tiktok.com",
      to_vxtiktok: "🔁 vxtiktok",
      to_tnktok: "🛠️ tnktok",
      to_threads: "🧵 threads.com",
      to_fixthreads: "🔁 fixthreads",
      to_fx_bilibili: "📺 FX Bilibili",
      to_vx_bilibili: "📼 VX Bilibili",
      to_b23: "🔗 b23.tv",
      to_vxb23: "🔗 vxb23.tv",
      to_phixiv: "🔙 phixiv.net",
      to_pixiv: "🎨 pixiv.net",
      yt_shorts_to_watch: "▶️ YT Shorts → enlace normal",
      restore_pixiv_img: "📖 Restaurar pixiv desde imagen",
      insert_symbol: "✳️ Insertar → {s}",
      delete_symbol: "❌",
      delete_confirm: "Eliminado: {s}",
      add_symbol: "➕ Añadir",
      add_symbol_prompt: "Introduce el texto a añadir:",
      add_success: "Añadido",
      remove_symbol: "➖ Eliminar",
      remove_symbol_prompt: "Introduce el texto a eliminar:",
      remove_empty: "La lista está vacía",
      mode_hover: "🔄 Hover",
      mode_click: "🖱️ Clic",
      mode_desc: "Modo: {mode} (clic para cambiar)",
      mode_changed: "Modo cambiado: {mode}",
      export_success:
        "✅ ¡Configuración exportada!\n\nCopiada al portapapeles.",
      import_prompt: "⬇️ Pega el código de respaldo (JSON):",
      import_success: "✅ ¡Importación exitosa!\nRecargando página.",
      import_fail: "❌ Error de importación: JSON inválido.",
      insert_success: "Insertado",
      copy_success: "Copiado",
      copy_fail: "Error al copiar",
      input_not_found: "Cuadro de texto no encontrado",
      edit_link_text: "Editar prefijo de enlace",
      enter_link_text: "Introduce el prefijo del enlace (vacío para eliminar):",
      tip_style: "Estilo de menú: Plano / Grupo",
      tip_trigger: "Activación: Hover / Clic",
      tip_logic: "Lógica de clic: Copiar / Insertar",
      tip_space: "Añadir espacio",
      tip_newline: "Añadir nueva línea",
      tip_symbols: "Ver cadenas personalizadas",
      tip_lang: "Cambiar idioma",
      tip_manual: "Manual",
      mod_msg_warn_title: "⚠️ ¿Deshabilitar Utilidad de Mensajes?",
      mod_msg_warn_body:
        "⠿ La Utilidad de Mensajes es la función principal.\\nSi la deshabilitas, desaparecerá el botón ⠿ en todos los mensajes.",
      mod_msg_warn_confirm: "Deshabilitar",
      mod_msg_warn_cancel: "Cancelar",
      mod_msg_enable_menu: "Habilitar ⠿ Utilidad de Mensajes",
      rescue_reload_msg: "Configuración actualizada. ¿Recargar página para aplicar cambios?",
      rescue_close_btn: "Cerrar",
      grp_copy: "📝 Copiar >",
      grp_convert: "🔄 Convertir >",
      grp_download: "⬇️ Descargar >",
      grp_system: "⚙️ Sistema y símbolos >",
      grp_webhook: "🔗 Webhook >",
      view_main: "Menú principal",
      view_symbols: "Cadenas personalizadas",

      // --- Module C ---
      em_title: "😊 Gestión integrada de expresiones/GIF",
      em_content:
        "• <b>Barra</b>: [📁] Colección | [🎯] Modo mira | [★] Palabras clave.<br>• <b>Modo mira</b>: selecciona directamente GIFs o emojis de la pantalla.<br>• <b>Shift+Clic</b>: enviar consecutivamente sin cerrar el panel.",
      em_picker_tip:
        "🔍 Haz clic en el GIF/emoji (clic en el fondo para cancelar)",
      em_err_no_list:
        "No se encontró el contenedor de lista. ¡Abre primero la ventana de emoji o GIF!",
      em_btn_add_title: "Guardar palabra clave de búsqueda",
      em_btn_active_title: "Clic: rellenar palabra clave (alternar)",
      em_btn_target_title: "Modo mira: clic en GIF/emoji para guardar",
      em_btn_save_this: "Añadir este elemento a la colección",
      em_no_favs: "Sin favoritos aún",
      em_del_confirm: "¿Eliminar «{k}»?",
      em_note_prompt: "Nota:",
      em_set_cover_success: "¡Imagen de portada establecida!",

      // Wormhole nav
      wm_nav_fail: "Error de navegación. Comprueba la URL.",
      wm_alert_invalid_url:
        "¡URL inválida! Por favor copia una URL de canal de Discord (que contenga /channels/).",
      wm_default_channel_name: "Canal",
      wm_refresh_confirm:
        "Agujero de gusano creado, pero la interfaz no puede actualizarse de inmediato.\n\n¿Recargar la página ahora?",
      wm_root_group: "Sin categoría",

      wm_menu_edit: "✎ Editar nombre",
      wm_menu_del: "🗑️ Cerrar agujero",
      wm_menu_vip_add: "★ Fijar como VIP",
      wm_menu_vip_remove: "☆ Quitar VIP",
      wm_menu_move: "📂 Mover al grupo",
      wm_group_prompt: "Introduce el nombre del nuevo grupo:",
      wm_edit_group: "Editar nombre del grupo:",
      wm_group_del_confirm:
        "¿Disolver el grupo «{n}»? (los agujeros se conservarán)",
      wm_group_select_prompt:
        "Introduce un número para seleccionar grupo:\n\n0. [Raíz/Sin categoría]\n{list}\n\nDeja vacío para crear «Nuevo grupo»:",
      wm_group_invalid: "¡Selección de grupo inválida!",
      wm_move_prompt: "¿A qué grupo mover? (introduce número)\n\n{list}",
      wm_icon_picker_title: "Seleccionar icono para {name}",
      wm_icon_set_success: "✅ Icono de {name} establecido",
      wm_icon_empty: "Primero añade un Emoji en el módulo de colección",
      wm_title:
        "Control de agujero de gusano\n• Clic: crear nuevo\n• Pulsación larga 1s: menú de ajustes",
      wm_settings_menu_title: "🌀 Ajustes del agujero de gusano",
      wm_settings_create: "Crear nuevo agujero de gusano",
      wm_settings_send_mode: "Método de envío y Modo API",
      wm_settings_more: "Más ajustes (próximamente)",
      wm_settings_position: "Cambiar posición",
      wm_settings_position_navbar: "Barra de navegación",
      wm_settings_position_titlebar: "Barra de título del canal",
      wm_settings_position_input: "Sobre el cuadro de chat",
      wm_settings_position_topleft: "Esquina superior izquierda (fijo)",
      wm_focus_on: "Desactivar modo enfoque",
      wm_focus_off: "Activar modo enfoque (solo iconos)",
      wm_focus_size: "Tamaño de icono",
      wm_focus_size_s: "S  · Pequeño",
      wm_focus_size_m: "M  · Mediano",
      wm_focus_size_l: "L  · Grande",

      wm_menu_send: "✉️ Enviar mensaje aquí",
      wm_send_placeholder: "Escribe un mensaje para #{name}...",
      wm_send_btn: "Enviar",
      wm_send_cancel: "Cancelar",
      wm_send_waiting: "Esperando al editor...",
      wm_send_injecting: "Enviando...",
      wm_send_success: "✅ ¡Enviado a #{name}!",
      wm_send_toast_title: "✅ Enviado a #{name}",
      wm_send_toast_hint: "Clic para ir al canal",
      wm_send_waiting_token: "⏳ Esperando Token…",
      wm_send_fail: "❌ Error — editor no listo.",
      wm_send_empty: "El mensaje no puede estar vacío.",
      wm_send_returning: "Volviendo...",
      wm_send_hint: "Shift+Clic para enviar sin cambiar de canal",
      wm_send_mode_api: "⚡ Modo API",
      wm_send_mode_nav: "🔀 Modo navegación",
      wm_send_mode_desc_api: "Envío directo, sin cambio de canal",
      wm_send_mode_desc_nav: "Cambiar al canal destino y enviar",
      wm_send_autoclose: "Cerrar automáticamente tras enviar",
      wm_send_show_toast: "Mostrar notificación de envío",
      wm_send_goto_channel: "Ir al canal tras enviar",
      wm_send_paste_hint: "📋 Ctrl+V para pegar imagen",
      wm_send_token_warn:
        "⚠️ Token expirado. Vuelve a abrir el panel API para detectarlo. Usando Modo A esta vez.",
      wm_send_channel_fail: "❌ Error al cargar el canal",
      wm_send_editor_missing: "❌ Editor no encontrado",
      wm_send_uploading: "📎 Subiendo {n} imagen(es)...",

      wm_api_panel_title: "⚗️ Modo API del agujero de gusano (avanzado)",
      wm_api_mode_label_a: "Modo A — Navegar (predeterminado)",
      wm_api_mode_label_b: "Modo B — API directa (sin cambio de página)",
      wm_api_warning_title: "⚠️ Aviso de riesgo",
      wm_api_warning_body:
        "Usar un Token de usuario para llamar a la API de Discord viola los Términos de Servicio. Tu cuenta podría ser suspendida. Úsalo bajo tu propia responsabilidad.",
      wm_api_token_status_none: "Token: No detectado",
      wm_api_token_status_ready: "Token: Listo (solo en memoria)",
      wm_api_detect_btn: "Detectar mi Token",
      wm_api_detect_confirm:
        "【Consentimiento de interceptación de Token】\n\nAl hacer clic en Aceptar, autorizas que este script intercepte tu Token de Discord para esta sesión.\n\n🔒 Garantías de seguridad:\n• Solo en memoria — nunca escrito en disco\n• Se borra al cerrar o recargar la página\n• Nunca transmitido a ningún servidor externo\n• Usado exclusivamente para enviar mensajes en tu nombre\n\n⚠️ Reconocimiento:\n• Entiendes que este token otorga acceso para enviar mensajes\n• Aceptas plena responsabilidad de todos los mensajes enviados\n\nProcede solo si confías en este script.",
      wm_api_detect_waiting:
        "⬆️ Cambia a cualquier canal una vez para capturar el Token",
      wm_api_enable_btn: "Activar Modo API",
      wm_api_disable_btn: "Desactivar Modo API (volver al Modo A)",
      wm_api_enabled_toast: "✅ Modo API activado",
      wm_api_disabled_toast: "↩️ Vuelto al Modo Navegación",
      wm_api_view_code: "Ver código del interceptor de Token",
      wm_api_clear_token: "🗑 Borrar Token",
      wm_api_reset_all: "🗑️ Restablecer todos los datos del agujero",
      wm_api_plan_b_first: "Por favor selecciona primero el Plan B",
      wm_api_send_fail: "❌ Error de API — revisa la consola",

      // Collections
      em_col_title: "Mis colecciones",
      em_col_add_success: '¡Guardado en "{g}"!',
      em_col_tab_new: "Nueva pestaña",
      em_col_tab_prompt: "Nombre de la nueva pestaña:",
      em_col_empty_tab: "Esta pestaña está vacía.",
      em_col_del_tab_confirm:
        '¿Eliminar la pestaña "{n}" y todos sus elementos?',
      em_modal_choose_tab: "¿En qué colección guardar?",
      em_modal_create_new: "+ Crear nueva...",
      em_tip_pick: "Establecer imagen de portada",
      em_tip_edit: "Editar nota",
      em_tip_delete: "Eliminar",
      em_menu_emoji: "Emojis",
      em_menu_sticker: "Stickers",
      em_menu_gif: "GIFs",

      menu_export: "📤 Exportar configuración (Backup)",
      menu_import: "⬇️ Importar configuración (Restaurar)",
      menu_change_lang: "🌐 Cambiar idioma",
      custom_lang_desc:
        "Haz clic en「📤 Exportar texto」para obtener el JSON en inglés. Tradúcelo y usa「📥 Importar texto」para aplicarlo.",
      custom_lang_export: "📤 Exportar texto",
      custom_lang_import: "📥 Importar texto",
      custom_lang_apply: "✅ Aplicar y recargar",
      custom_lang_loaded: "✅ Cargado: {name}",
      custom_lang_activate: '🌐 Aplicar "{name}"',
      custom_lang_json_error: "⚠️ Error JSON: {msg}",
      custom_lang_paste_hint: "Pega el JSON traducido aquí …",
      copy_media_prefixed: "✅ {n} enlace(s) de medios con prefijo copiado(s)",
      copy_media_urls: "✅ {n} enlace(s) de medios copiado(s)",
      wormhole_reset_success: "✅ Datos eliminados, recargando…",
      // --- Module F (Webhook) ---
      wh_panel_title: "🔗 Gestión de Webhook",
      wh_enable: "Activar Webhook",
      wh_tip: "Gestión de Webhook",
      wh_add_name_ph: "Etiqueta (ej: Animales)",
      wh_add_url_ph: "https://discord.com/api/webhooks/…",
      wh_btn_add: "＋ Añadir",
      wh_btn_test: "Probar",
      wh_btn_delete: "Eliminar",
      wh_test_ok: "✅ ¡Prueba enviada!",
      wh_test_fail: "❌ Prueba fallida",
      wh_send_content: "📨 Enviar mensaje al Webhook ▶",
      wh_send_urls: "🔗 Enviar URLs al Webhook ▶",
      wh_no_webhooks: "No hay Webhooks aún",
      wh_send_ok: "✅ Enviado a [{name}]",
      wh_send_fail: "❌ Error al enviar [{name}]",
      wh_no_urls: "⚠️ No hay URLs en este mensaje",
      wh_url_invalid: "⚠️ URL de Webhook inválida",
      wh_btn_edit: "Editar",
      wh_btn_save: "Guardar",
      wh_btn_cancel: "Cancelar",
      wh_keep_source: "📎 Incluir enlace de origen",
      wh_keep_source_tip: "Al marcar, se añade el enlace original del mensaje al final del contenido enviado.",

      // --- Module C (GIF Refresh) ---
      em_col_refresh_tooltip: "Actualizar vista previa de GIF (recargar caché CDN expirado)",
      em_refresh_no_expired:   "ℹ️ No hay GIFs expirados en esta pestaña",
      em_refresh_consent:      "⚠️ Acerca de actualizar GIFs\n\nEsta función usará un proxy de terceros (fixcdn.hyonsu.com)\npara obtener credenciales frescas de adjuntos de Discord.\n\nNotas:\n• Las URLs de tus imágenes serán enviadas a fixcdn.hyonsu.com\n• Es un servicio de terceros, sin relación con Discord ni este script\n• Busca 'fixcdn hyonsu' para más información antes de continuar\n\n¿Continuar?",
      em_refresh_cancel_tip:   "ℹ️ Cancelado. Pasos manuales:\n① Busca el GIF original en Discord\n② Añádelo de nuevo a tu colección",
      em_refresh_loading:      "Actualizando...",
      em_refresh_ok:           "✨ {n} GIF(s) actualizado(s){fail} {track}",
      em_refresh_partial_fail: " ({f} fallaron)",
      em_refresh_fail:         "⚠️ No se pudieron actualizar los GIFs de esta pestaña",
      em_refresh_track_api:    "(Discord API)",
      em_refresh_track_cdn:    "(fixcdn)",
      em_save_success: "Guardado: {k}",

      // --- Module G (URL Checker) ---
      uc_duplicate_found: "⚠️ Esta URL ya fue publicada — apareció {count}× en los últimos {limit} mensajes",
      uc_duplicate_found_plural: "⚠️ {n} URLs duplicadas — hasta {count}× en los últimos {limit} mensajes",
      uc_dom_found: "⚠️ Esta URL apareció {count}× en {limit} mensajes visibles (modo DOM · sin API)",
      uc_no_token: "🔍 La verificación de URL duplicada requiere el modo API de Wormhole — actívalo en los ajustes de Wormhole (mantén ＋ 1s)",
      uc_token_waiting: "⏳ Esperando API Token… cambia a cualquier canal una vez para capturarlo",
      uc_fetching: "🔄 Buscando URLs duplicadas…",
      uc_dismiss: "✕",
      uc_limit_label: "Rango de escaneo:",
      uc_limit_suffix: "mensajes",

      // --- Wormhole (missing) ---
      wm_url_prompt: "Introduce la URL completa del canal de Discord:",
      wm_name_prompt: "Introduce el nombre del Wormhole (ej. General):",
      wm_edit_title: "Editar Wormhole: {n}",
      wm_created: "¡Wormhole creado!",
      wm_deleted: "Wormhole cerrado.",

      // --- Channel Scout / Mute User ---
      cs_panel_title:   "⌨ Búsqueda de canal",
      cs_placeholder:   "Escribe una palabra clave para buscar mensajes…",
      cs_no_results:    "No se encontraron mensajes",
      cs_empty_hint:    "Escribe una palabra clave o haz clic en una etiqueta",
      cs_no_history:    "Sin historial de búsqueda",
      cs_dom_mode_note: "Modo DOM · busca solo mensajes visibles",
      mu_panel_title:   "🌫️ Atenuar mensajes de usuario",
      mu_empty:         "Sin usuarios atenuados\nClic derecho en mensaje para añadir",
      mu_remove_btn:    "Reactivar",
      mu_add_toast:     "🌫️ Atenuado: {name}",
      mu_remove_toast:  "✅ Reactivado: {name}",
      mu_ctx_mute:      "🌫️ Atenuar mensajes: {name}",
      mu_ctx_unmute:    "✅ Reactivar: {name}",
      mu_temp_card_name: "Temporal",
      mu_temp_card_desc: "Se desactiva al terminar",
      mu_temp_quick:    "Selección rápida",
      mu_temp_placeholder: "ej: 3H, 1D 6H, 27H 20M",
      mu_temp_confirm:  "⏳ Silenciar temporalmente",
      mu_temp_expired_toast: "⏰ Silencio temporal expirado: {name}",
      mu_temp_badge_label: "⏳",
    },    "pt-BR": {
      name: "Português (Brasil)",
      // --- Module A (Forwarding) ---
      fm_pinned_channels: "★ Canais fixados",
      fm_toggle_flat: "Alternar para: Vista plana",
      fm_toggle_drop: "Alternar para: Menu suspenso",
      fm_help: "Ajuda",
      fm_prompt_channel: "Digite a palavra-chave do canal:",
      fm_prompt_user: "Digite o ID ou palavra-chave do usuário:",
      fm_user_zone: "Zona de usuários",
      fm_no_users: "Sem usuários fixados",
      fm_add_user: "+ Adicionar usuário",
      fm_fuzzy: "Pesquisa aproximada",
      fm_remove_confirm: "Remover {target}?",
      fm_tooltip_channel: "Canal: {c}\nServidor: {s}",
      fm_tooltip_user_add: "Adicionar à Zona de usuários (👤)",
      fm_tooltip_star_add: "Adicionar aos Favoritos (★)",
      fm_manual_title: "📚 Manual do Gerenciador de Encaminhamento",
      fm_sec_star: "★ Favoritos e gerenciamento",
      fm_sec_star_content:
        "• Clique em <span class='help-key'>★</span> ou <span class='help-key'>👤+</span> para fixar.<br>• Clique com o botão direito para remover.<br>• <span class='help-key'>Shift+Botão direito</span> para remoção rápida (sem confirmação).",
      fm_sec_search: "🔍 Pesquisa em dois passos (padrão)",
      fm_sec_search_content:
        "• Clicar em um pin executa automaticamente 'Aquecimento → Entrada → Bloqueio'.<br>• Corrige o bug do Discord onde a entrada direta falha.<br>• Usa <span style='color:#2dc770'>Correspondência exata</span> para evitar encaminhamentos errados.",
      fm_sec_fuzzy: "⏎ Pesquisa aproximada",
      fm_sec_fuzzy_content:
        "• Clique na seta <span class='help-key'>⏎</span> dentro do botão.<br>• Insere apenas os 2 primeiros caracteres ou a primeira palavra.",
      fm_sec_user: "👤 Zona de usuários",
      fm_sec_user_content:
        "• Clique no botão <span class='help-key'>👤</span> para expandir a lista de usuários.<br>• Suporta adição manual de ID.",
      fm_sec_misc_title: "⚙️ Dicas e exibição",
      fm_sec_misc:
        "• O botão superior esquerdo alterna o modo <b>Plano</b> ou <b>Suspenso</b>.<br>• O <b>Histórico</b> (etiquetas roxas) salva automaticamente os canais visitados recentemente.",

      fm_sec_wormhole: "🌀 Buraco de minhoca — Básico",
      fm_sec_wormhole_content:
        "• Clique em <span class='help-key'>＋</span> e cole uma URL de canal do Discord para criar um atalho.<br>" +
        "• <b>Clique</b> em um buraco → pula instantaneamente para esse canal.<br>" +
        "• <b>Botão direito</b> → menu: renomear, excluir, ícone, mover para grupo ou alternar VIP.<br>" +
        "• <b>VIP (★)</b>: buracos fixados flutuam automaticamente para o topo.<br>" +
        "• <b>Grupos</b>: organize buracos em pastas.<br>" +
        "• <b>Modo foco</b>: visão compacta somente com ícones.",
      fm_sec_wm_send: "✉️ Buraco de minhoca — Enviar mensagem",
      fm_sec_wm_send_content:
        "• <b>Botão direito</b> → <b>Enviar mensagem aqui</b> para abrir o painel.<br>" +
        "• <b>Modo A (Navegar)</b>: muda para o canal destino, injeta texto e retorna.<br>" +
        "• <b>Shift+Clique</b> → abre o painel no canal atual.<br>" +
        "• Suporta <b>colar imagens com Ctrl+V</b>.<br>" +
        "• Opções inferiores: <b>Fechar automaticamente</b> / <b>Ir ao canal</b> / <b>Mostrar notificação</b>.",
      fm_sec_wm_api: "⚡ Buraco de minhoca — Modo API (secreto)",
      fm_sec_wm_api_content:
        "• <b>Mantenha pressionado o botão ＋ por 3 segundos</b> para desbloquear o Modo API.<br>" +
        "• <b>Modo B (API direta)</b>: envia mensagens via Discord REST API sem trocar de página.<br>" +
        "• O token é interceptado silenciosamente na memória — <b>nunca armazenado ou transmitido</b>.<br>" +
        "• Apagado ao fechar a página.",
      welcome_title: "Bem-vindo ao {script}",
      select_lang_subtitle: "Por favor, selecione o idioma da interface",
      help_btn: "📖 Manual",
      cancel_btn: "✕ Fechar",
      security_notice_title: "⚠️ Aviso de segurança",
      security_notice_content:
        "Os recursos de conversão de URL (como vxtwitter, kkinstagram) dependem de serviços de terceiros.\nNão os use se não confiar nesses serviços.\nOs usuários devem ser capazes de identificar a segurança das URL.",
      manual_content:
        "【Guia de ícones】\n• ◫/≡ : Alternar estilo de menu (Plano / Grupo)\n• ⇄ : Trocar lógica de clique (Copiar / Inserir)\n• ␣ : Adicionar espaço ao final\n• ↵ : Adicionar nova linha ao final\n• ☆ : Painel de strings personalizadas\n• 🖱️ : Modo de ativação (Hover / Clique)\n• 🌐 : Alterar idioma\n\n【Ações】\n• **Clique**: Copiar (padrão)\n• **Pressão longa (0,5s)**: Inserir na caixa de texto\n• **Shift+Clique**: Copiar e inserir (mantém o menu aberto)",
      manual_content_sections:
        "<div class='mm-section'><div class='mm-sec-title c-default'>⚡ Início rápido</div><div class='mm-content'>Passe o cursor sobre qualquer mensagem do Discord → aparece um botão de copiar no canto superior direito.<br><b>Clique</b> para copiar · <b>Pressão longa 0,5s</b> para inserir · <b>Shift+Clique</b> para copiar e inserir.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 Menu de cópia</div><div class='mm-content'>• Copiar texto, URL de mídia, primeiro link limpo, todos os links, Markdown, texto oculto.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ Download</div><div class='mm-content'>• Baixar imagens/mídias individualmente ou como ZIP.</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 Conversão de URL</div><div class='mm-content'>Twitter/X, Instagram, Bilibili, Pixiv — conversão mútua para prévias no Discord.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 Buraco de minhoca</div><div class='mm-content'>Atalhos de canal com um clique na barra lateral do Discord.</div></div>",
      reload_confirm: "Configurações salvas!\nRecarregar a página agora?",
      copy_text: "📋 Copiar texto",
      copy_media_url: "🖼️ Copiar URL de mídia",
      no_content: "⚠️ Sem conteúdo",
      copy_first_link: "🔗 Copiar primeiro link (limpo)",
      copy_markdown: "🧾 Copiar como Markdown",
      copy_all_links: "📎 Copiar todos os links",
      insert_format_link: "📌 Inserir [{t}](URL)",
      copy_hidden_format: "🙈 Texto oculto (|| ... ||)",
      download_images: "⬇️ Baixar imagens/mídias",
      download_zip: "📦 Baixar como ZIP",
      download_start: "🚀 Baixando...",
      download_zip_start: "📦 Compactando {n} arquivos...",
      download_fail: "❌ Falha no download",
      download_cors_fail:
        "⚠️ CORS impede o download direto. Copie a URL e abra no navegador.",
      original_url: "🔗 URL original",
      convert_all: "⚡ Converter tudo ({n})",
      convert_imgur: "🖼️ Converter para i.imgur.com",
      to_twitter: "🐦 twitter.com",
      to_x: "❌ x.com",
      to_vxtwitter: "🔁 vxtwitter",
      to_fixupx: "🛠️ fixupx",
      to_fxtwitter: "🔧 fxtwitter",
      to_cunnyx: "🍑 cunnyx",
      to_fixvx: "🧩 fixvx",
      to_reddit: "👽 reddit.com",
      to_old_reddit: "📜 old.reddit",
      to_rxddit: "🔁 rxddit",
      to_vxreddit: "🛠️ vxreddit",
      to_instagram: "📷 instagram.com",
      to_kkinstagram: "🔁 kkinstagram",
      to_vxinstagram: "🔁 to vxinstagram",
      to_ddinstagram: "🔁 to ddinstagram",
      to_uuinstagram: "🔁 to uuinstagram",
      to_facebed: "🔁 facebed.com",
      to_tiktok: "🎵 tiktok.com",
      to_vxtiktok: "🔁 vxtiktok",
      to_tnktok: "🛠️ tnktok",
      to_threads: "🧵 threads.com",
      to_fixthreads: "🔁 fixthreads",
      to_fx_bilibili: "📺 FX Bilibili",
      to_vx_bilibili: "📼 VX Bilibili",
      to_b23: "🔗 b23.tv",
      to_vxb23: "🔗 vxb23.tv",
      to_phixiv: "🔙 phixiv.net",
      to_pixiv: "🎨 pixiv.net",
      yt_shorts_to_watch: "▶️ YT Shorts → link normal",
      restore_pixiv_img: "📖 Restaurar pixiv a partir da imagem",
      insert_symbol: "✳️ Inserir → {s}",
      delete_symbol: "❌",
      delete_confirm: "Excluído: {s}",
      add_symbol: "➕ Adicionar",
      add_symbol_prompt: "Digite o texto a adicionar:",
      add_success: "Adicionado",
      remove_symbol: "➖ Remover",
      remove_symbol_prompt: "Digite o texto a remover:",
      remove_empty: "A lista está vazia",
      mode_hover: "🔄 Hover",
      mode_click: "🖱️ Clique",
      mode_desc: "Modo: {mode} (clique para alternar)",
      mode_changed: "Modo alterado: {mode}",
      export_success:
        "✅ Configurações exportadas!\n\nCopiadas para a área de transferência.",
      import_prompt: "⬇️ Cole o código de backup (JSON):",
      import_success: "✅ Importação bem-sucedida!\nRecarregando página.",
      import_fail: "❌ Falha na importação: JSON inválido.",
      insert_success: "Inserido",
      copy_success: "Copiado",
      copy_fail: "Falha ao copiar",
      input_not_found: "Caixa de texto não encontrada",
      edit_link_text: "Editar prefixo do link",
      enter_link_text: "Digite o prefixo do link (vazio para remover):",
      tip_style: "Estilo do menu: Plano / Grupo",
      tip_trigger: "Ativação: Hover / Clique",
      tip_logic: "Lógica de clique: Copiar / Inserir",
      tip_space: "Adicionar espaço",
      tip_newline: "Adicionar nova linha",
      tip_symbols: "Ver strings personalizadas",
      tip_lang: "Alterar idioma",
      tip_manual: "Manual",
      mod_msg_warn_title: "⚠️ Desativar Utilitário de Mensagens?",
      mod_msg_warn_body:
        "⠿ O Utilitário de Mensagens é a função principal.\\nSe desativado, o botão ⠿ desaparecerá de todas as mensagens.",
      mod_msg_warn_confirm: "Desativar",
      mod_msg_warn_cancel: "Cancelar",
      mod_msg_enable_menu: "Ativar ⠿ Utilitário de Mensagens",
      rescue_reload_msg: "Configurações atualizadas. Recarregar página para aplicar?",
      rescue_close_btn: "Fechar",
      grp_copy: "📝 Copiar >",
      grp_convert: "🔄 Converter >",
      grp_download: "⬇️ Baixar >",
      grp_system: "⚙️ Sistema e símbolos >",
      grp_webhook: "🔗 Webhook >",
      view_main: "Menu principal",
      view_symbols: "Strings personalizadas",

      em_title: "😊 Gerenciamento integrado de expressões/GIF",
      em_content:
        "• <b>Barra</b>: [📁] Coleção | [🎯] Modo mira | [★] Palavras-chave.<br>• <b>Modo mira</b>: selecione GIFs ou emojis diretamente da tela.<br>• <b>Shift+Clique</b>: enviar consecutivamente sem fechar o painel.",
      em_picker_tip: "🔍 Clique no GIF/emoji (clique no fundo para cancelar)",
      em_err_no_list:
        "Contêiner de lista não encontrado. Abra primeiro a janela de emoji ou GIF!",
      em_btn_add_title: "Salvar palavra-chave de pesquisa",
      em_btn_active_title: "Clique: preencher palavra-chave (alternar)",
      em_btn_target_title: "Modo mira: clique no GIF/emoji para salvar",
      em_btn_save_this: "Adicionar este item à coleção",
      em_no_favs: "Sem favoritos ainda",
      em_del_confirm: "Excluir «{k}»?",
      em_note_prompt: "Nota:",
      em_set_cover_success: "Imagem de capa definida!",

      wm_nav_fail: "Falha na navegação. Verifique a URL.",
      wm_alert_invalid_url:
        "URL inválida! Por favor cole uma URL de canal do Discord (contendo /channels/).",
      wm_default_channel_name: "Canal",
      wm_refresh_confirm:
        "Buraco de minhoca criado, mas a interface não pode ser atualizada imediatamente.\n\nRecarregar página agora?",
      wm_root_group: "Sem categoria",

      wm_menu_edit: "✎ Editar nome",
      wm_menu_del: "🗑️ Fechar buraco",
      wm_menu_vip_add: "★ Fixar como VIP",
      wm_menu_vip_remove: "☆ Remover VIP",
      wm_menu_move: "📂 Mover para grupo",
      wm_group_prompt: "Digite o nome do novo grupo:",
      wm_edit_group: "Editar nome do grupo:",
      wm_group_del_confirm:
        "Dissolver o grupo «{n}»? (os buracos serão mantidos)",
      wm_group_select_prompt:
        "Digite um número para selecionar o grupo:\n\n0. [Raiz/Sem categoria]\n{list}\n\nDeixe vazio para criar «Novo grupo»:",
      wm_group_invalid: "Seleção de grupo inválida!",
      wm_move_prompt: "Para qual grupo mover? (digite número)\n\n{list}",
      wm_icon_picker_title: "Selecionar ícone para {name}",
      wm_icon_set_success: "✅ Ícone de {name} definido",
      wm_icon_empty: "Primeiro adicione um Emoji no módulo de coleção",
      wm_title:
        "Controle do buraco de minhoca\n• Clique: criar novo\n• Pressão longa 1s: menu de configurações",
      wm_settings_menu_title: "🌀 Configurações do buraco de minhoca",
      wm_settings_create: "Criar novo buraco de minhoca",
      wm_settings_send_mode: "Método de envio e Modo API",
      wm_settings_more: "Mais configurações (em breve)",
      wm_settings_position: "Alterar posição",
      wm_settings_position_navbar: "Barra de navegação",
      wm_settings_position_titlebar: "Barra de título do canal",
      wm_settings_position_input: "Acima da caixa de chat",
      wm_settings_position_topleft: "Canto superior esquerdo (fixo)",
      wm_focus_on: "Desativar modo foco",
      wm_focus_off: "Ativar modo foco (somente ícones)",
      wm_focus_size: "Tamanho do ícone",
      wm_focus_size_s: "P  · Pequeno",
      wm_focus_size_m: "M  · Médio",
      wm_focus_size_l: "G  · Grande",

      wm_menu_send: "✉️ Enviar mensagem aqui",
      wm_send_placeholder: "Digite uma mensagem para #{name}...",
      wm_send_btn: "Enviar",
      wm_send_cancel: "Cancelar",
      wm_send_waiting: "Aguardando editor...",
      wm_send_injecting: "Enviando...",
      wm_send_success: "✅ Enviado para #{name}!",
      wm_send_toast_title: "✅ Enviado para #{name}",
      wm_send_toast_hint: "Clique para ir ao canal",
      wm_send_waiting_token: "⏳ Aguardando Token…",
      wm_send_fail: "❌ Falha — editor não pronto.",
      wm_send_empty: "A mensagem não pode estar vazia.",
      wm_send_returning: "Voltando...",
      wm_send_hint: "Shift+Clique para enviar sem trocar de canal",
      wm_send_mode_api: "⚡ Modo API",
      wm_send_mode_nav: "🔀 Modo navegação",
      wm_send_mode_desc_api: "Envio direto, sem troca de canal",
      wm_send_mode_desc_nav: "Trocar para o canal destino e enviar",
      wm_send_autoclose: "Fechar automaticamente após enviar",
      wm_send_show_toast: "Mostrar notificação de envio",
      wm_send_goto_channel: "Ir ao canal após enviar",
      wm_send_paste_hint: "📋 Ctrl+V para colar imagem",
      wm_send_token_warn:
        "⚠️ Token expirado. Reabra o painel API para detectar novamente. Usando Modo A desta vez.",
      wm_send_channel_fail: "❌ Falha ao carregar o canal",
      wm_send_editor_missing: "❌ Editor não encontrado",
      wm_send_uploading: "📎 Enviando {n} imagem(ns)...",

      wm_api_panel_title: "⚗️ Modo API do buraco de minhoca (avançado)",
      wm_api_mode_label_a: "Modo A — Navegar (padrão)",
      wm_api_mode_label_b: "Modo B — API direta (sem troca de página)",
      wm_api_warning_title: "⚠️ Aviso de risco",
      wm_api_warning_body:
        "Usar um Token de usuário para chamar a API do Discord viola os Termos de Serviço. Sua conta pode ser banida. Use por sua conta e risco.",
      wm_api_token_status_none: "Token: Não detectado",
      wm_api_token_status_ready: "Token: Pronto (somente na memória)",
      wm_api_detect_btn: "Detectar meu Token",
      wm_api_detect_confirm:
        "【Consentimento de interceptação de Token】\n\nAo clicar em OK, você autoriza que este script intercepte seu Token do Discord para esta sessão.\n\n🔒 Garantias de segurança:\n• Somente na memória — nunca gravado em disco\n• Apagado ao fechar ou recarregar a página\n• Nunca transmitido para qualquer servidor externo\n• Usado exclusivamente para enviar mensagens em seu nome\n\n⚠️ Reconhecimento:\n• Você entende que este token concede acesso para enviar mensagens\n• Você aceita total responsabilidade por todas as mensagens enviadas\n\nProssiga somente se confiar neste script.",
      wm_api_detect_waiting:
        "⬆️ Mude para qualquer canal uma vez para capturar o Token",
      wm_api_enable_btn: "Ativar Modo API",
      wm_api_disable_btn: "Desativar Modo API (voltar ao Modo A)",
      wm_api_enabled_toast: "✅ Modo API ativado",
      wm_api_disabled_toast: "↩️ Retornado ao Modo Navegação",
      wm_api_view_code: "Ver código do interceptor de Token",
      wm_api_clear_token: "🗑 Limpar Token",
      wm_api_reset_all: "🗑️ Redefinir todos os dados do buraco",
      wm_api_plan_b_first: "Por favor selecione primeiro o Plano B",
      wm_api_send_fail: "❌ Falha na API — verifique o console",

      em_col_title: "Minhas coleções",
      em_col_add_success: 'Salvo em "{g}"!',
      em_col_tab_new: "Nova aba",
      em_col_tab_prompt: "Nome da nova aba:",
      em_col_empty_tab: "Esta aba está vazia.",
      em_col_del_tab_confirm: 'Excluir a aba "{n}" e todos os itens?',
      em_modal_choose_tab: "Salvar em qual coleção?",
      em_modal_create_new: "+ Criar nova...",
      em_tip_pick: "Definir imagem de capa",
      em_tip_edit: "Editar nota",
      em_tip_delete: "Excluir",
      em_menu_emoji: "Emojis",
      em_menu_sticker: "Stickers",
      em_menu_gif: "GIFs",

      menu_export: "📤 Exportar configurações (Backup)",
      menu_import: "⬇️ Importar configurações (Restaurar)",
      menu_change_lang: "🌐 Alterar idioma",
      custom_lang_desc:
        "Clique em「📤 Exportar texto」para obter o JSON em inglês. Após traduzir, use「📥 Importar texto」para aplicar.",
      custom_lang_export: "📤 Exportar texto",
      custom_lang_import: "📥 Importar texto",
      custom_lang_apply: "✅ Aplicar e recarregar",
      custom_lang_loaded: "✅ Carregado: {name}",
      custom_lang_activate: '🌐 Aplicar "{name}"',
      custom_lang_json_error: "⚠️ Erro JSON: {msg}",
      custom_lang_paste_hint: "Cole o JSON traduzido aqui …",
      copy_media_prefixed: "✅ {n} link(s) de mídia com prefixo copiado(s)",
      copy_media_urls: "✅ {n} link(s) de mídia copiado(s)",
      wormhole_reset_success: "✅ Dados apagados, recarregando…",
      // --- Module F (Webhook) ---
      wh_panel_title: "🔗 Gerenciar Webhook",
      wh_enable: "Ativar Webhook",
      wh_tip: "Gerenciar Webhook",
      wh_add_name_ph: "Rótulo (ex: Animais)",
      wh_add_url_ph: "https://discord.com/api/webhooks/…",
      wh_btn_add: "＋ Adicionar",
      wh_btn_test: "Testar",
      wh_btn_delete: "Excluir",
      wh_test_ok: "✅ Teste enviado!",
      wh_test_fail: "❌ Teste falhou",
      wh_send_content: "📨 Enviar mensagem ao Webhook ▶",
      wh_send_urls: "🔗 Enviar URLs ao Webhook ▶",
      wh_no_webhooks: "Nenhum Webhook cadastrado",
      wh_send_ok: "✅ Enviado para [{name}]",
      wh_send_fail: "❌ Falha ao enviar [{name}]",
      wh_btn_edit: "Editar",
      wh_btn_save: "Guardar",
      wh_btn_cancel: "Cancelar",
      wh_keep_source: "📎 Incluir link de origem",
      wh_keep_source_tip: "Ao marcar, o link original da mensagem é adicionado ao final do conteúdo enviado.",
      wh_no_urls: "⚠️ Nenhuma URL nesta mensagem",
      wh_url_invalid: "⚠️ URL de Webhook inválida",

      // --- Module C (GIF Refresh) ---
      em_col_refresh_tooltip: "Atualizar prévia de GIF (recarregar cache CDN expirado)",
      em_refresh_no_expired:   "ℹ️ Nenhum GIF expirado nesta aba",
      em_refresh_consent:      "⚠️ Sobre atualização de GIFs\n\nEste recurso usará um proxy de terceiros (fixcdn.hyonsu.com)\npara obter novas credenciais de anexos do Discord.\n\nObservações:\n• Suas URLs de imagens serão enviadas ao fixcdn.hyonsu.com\n• Este é um serviço de terceiros, sem relação com Discord ou este script\n• Pesquise 'fixcdn hyonsu' para mais informações antes de continuar\n\nContinuar?",
      em_refresh_cancel_tip:   "ℹ️ Cancelado. Passos manuais:\n① Encontre o GIF original no Discord\n② Adicione-o novamente à sua coleção",
      em_refresh_loading:      "Atualizando...",
      em_refresh_ok:           "✨ {n} GIF(s) atualizado(s){fail} {track}",
      em_refresh_partial_fail: " ({f} falha(s))",
      em_refresh_fail:         "⚠️ Não foi possível atualizar os GIFs desta aba",
      em_refresh_track_api:    "(Discord API)",
      em_refresh_track_cdn:    "(fixcdn)",
      em_save_success: "Salvo: {k}",

      // --- Module G (URL Checker) ---
      uc_duplicate_found: "⚠️ Esta URL já foi publicada — apareceu {count}× nas últimas {limit} mensagens",
      uc_duplicate_found_plural: "⚠️ {n} URLs duplicadas — até {count}× nas últimas {limit} mensagens",
      uc_dom_found: "⚠️ Esta URL apareceu {count}× em {limit} mensagens visíveis (modo DOM · sem API)",
      uc_no_token: "🔍 A verificação de URL duplicada requer o modo API do Wormhole — ative-o nas configurações do Wormhole (segure ＋ por 1s)",
      uc_token_waiting: "⏳ Aguardando API Token… mude para qualquer canal uma vez para capturá-lo",
      uc_fetching: "🔄 Verificando URLs duplicadas…",
      uc_dismiss: "✕",
      uc_limit_label: "Intervalo de varredura:",
      uc_limit_suffix: "mensagens",

      // --- Wormhole (missing) ---
      wm_url_prompt: "Insira a URL completa do canal do Discord:",
      wm_name_prompt: "Insira o nome do Wormhole (ex. Geral):",
      wm_edit_title: "Editar Wormhole: {n}",
      wm_created: "Wormhole criado!",
      wm_deleted: "Wormhole fechado.",

      // --- Channel Scout / Mute User ---
      cs_panel_title:   "⌨ Pesquisa de canal",
      cs_placeholder:   "Digite uma palavra-chave para pesquisar mensagens…",
      cs_no_results:    "Nenhuma mensagem encontrada",
      cs_empty_hint:    "Digite uma palavra-chave ou clique em uma etiqueta",
      cs_no_history:    "Sem histórico de pesquisa",
      cs_dom_mode_note: "Modo DOM · pesquisa apenas mensagens visíveis",
      mu_panel_title:   "🌫️ Silenciar mensagens de usuário",
      mu_empty:         "Nenhum usuário silenciado\nClique com botão direito para adicionar",
      mu_remove_btn:    "Reativar",
      mu_add_toast:     "🌫️ Silenciado: {name}",
      mu_remove_toast:  "✅ Reativado: {name}",
      mu_ctx_mute:      "🌫️ Silenciar mensagens: {name}",
      mu_ctx_unmute:    "✅ Reativar: {name}",
      mu_temp_card_name: "Temporário",
      mu_temp_card_desc: "Desmuta ao terminar o timer",
      mu_temp_quick:    "Seleção rápida",
      mu_temp_placeholder: "ex: 3H, 1D 6H, 27H 20M",
      mu_temp_confirm:  "⏳ Silenciar temporariamente",
      mu_temp_expired_toast: "⏰ Silêncio temporário expirado: {name}",
      mu_temp_badge_label: "⏳",
    },

    fr: {
      name: "Français",
      // --- Module A (Forwarding) ---
      fm_pinned_channels: "★ Salons épinglés",
      fm_toggle_flat: "Passer à : Vue plate",
      fm_toggle_drop: "Passer à : Menu déroulant",
      fm_help: "Aide",
      fm_prompt_channel: "Entrez le mot-clé du salon :",
      fm_prompt_user: "Entrez l'ID ou le mot-clé de l'utilisateur :",
      fm_user_zone: "Zone utilisateurs",
      fm_no_users: "Aucun utilisateur épinglé",
      fm_add_user: "+ Ajouter un utilisateur",
      fm_fuzzy: "Recherche approximative",
      fm_remove_confirm: "Supprimer {target} ?",
      fm_tooltip_channel: "Salon : {c}\nServeur : {s}",
      fm_tooltip_user_add: "Ajouter à la Zone utilisateurs (👤)",
      fm_tooltip_star_add: "Ajouter aux Favoris (★)",
      fm_manual_title: "📚 Manuel du Gestionnaire de Transfert",
      fm_sec_star: "★ Favoris et gestion",
      fm_sec_star_content:
        "• Cliquez sur <span class='help-key'>★</span> ou <span class='help-key'>👤+</span> pour épingler.<br>• Clic droit pour supprimer.<br>• <span class='help-key'>Shift+Clic droit</span> pour suppression rapide (sans confirmation).",
      fm_sec_search: "🔍 Recherche en deux étapes (défaut)",
      fm_sec_search_content:
        "• Cliquer sur un pin exécute automatiquement 'Préchauffage → Saisie → Verrouillage'.<br>• Corrige le bug de Discord où la saisie directe échoue.<br>• Utilise la <span style='color:#2dc770'>Correspondance exacte</span> pour éviter les transferts incorrects.",
      fm_sec_fuzzy: "⏎ Recherche approximative",
      fm_sec_fuzzy_content:
        "• Cliquez sur la flèche <span class='help-key'>⏎</span> dans le bouton.<br>• Saisit uniquement les 2 premiers caractères ou le premier mot.",
      fm_sec_user: "👤 Zone utilisateurs",
      fm_sec_user_content:
        "• Cliquez sur le bouton <span class='help-key'>👤</span> pour développer la liste.<br>• Prend en charge l'ajout manuel d'ID.",
      fm_sec_misc_title: "⚙️ Conseils et affichage",
      fm_sec_misc:
        "• Le bouton en haut à gauche bascule entre le mode <b>Plat</b> et <b>Déroulant</b>.<br>• L'<b>Historique</b> (badges violets) sauvegarde automatiquement les salons récemment visités.",

      fm_sec_wormhole: "🌀 Trou de ver — Bases",
      fm_sec_wormhole_content:
        "• Cliquez sur <span class='help-key'>＋</span> et collez une URL de salon Discord pour créer un raccourci.<br>" +
        "• <b>Clic</b> sur un trou de ver → saut instantané vers ce salon.<br>" +
        "• <b>Clic droit</b> → menu : renommer, supprimer, icône, déplacer vers un groupe ou basculer VIP.<br>" +
        "• <b>VIP (★)</b> : les trous épinglés remontent automatiquement.<br>" +
        "• <b>Groupes</b> : organisez les trous en dossiers.<br>" +
        "• <b>Mode focus</b> : vue compacte icônes uniquement.",
      fm_sec_wm_send: "✉️ Trou de ver — Envoyer un message",
      fm_sec_wm_send_content:
        "• <b>Clic droit</b> → <b>Envoyer un message ici</b> pour ouvrir le panneau.<br>" +
        "• <b>Mode A (Navigation)</b> : change de salon, injecte le texte et revient.<br>" +
        "• <b>Shift+Clic</b> → ouvre le panneau dans le salon actuel.<br>" +
        "• Prend en charge le <b>collage d'images avec Ctrl+V</b>.<br>" +
        "• Options du bas : <b>Fermeture auto</b> / <b>Aller au salon</b> / <b>Afficher la notification</b>.",
      fm_sec_wm_api: "⚡ Trou de ver — Mode API (secret)",
      fm_sec_wm_api_content:
        "• <b>Maintenez le bouton ＋ appuyé 3 secondes</b> pour déverrouiller le Mode API.<br>" +
        "• <b>Mode B (API directe)</b> : envoie des messages via l'API REST Discord sans changer de page.<br>" +
        "• Le token est intercepté silencieusement en mémoire — <b>jamais stocké ni transmis</b>.<br>" +
        "• Effacé à la fermeture de la page.",
      welcome_title: "Bienvenue sur {script}",
      select_lang_subtitle: "Veuillez sélectionner la langue de l'interface",
      help_btn: "📖 Manuel",
      cancel_btn: "✕ Fermer",
      security_notice_title: "⚠️ Avertissement de sécurité",
      security_notice_content:
        "Les fonctions de conversion d'URL (vxtwitter, kkinstagram, etc.) dépendent de services tiers.\nNe les utilisez pas si vous ne faites pas confiance à ces services.\nLes utilisateurs doivent être capables d'identifier la sécurité des URL.",
      manual_content:
        "【Guide des icônes】\n• ◫/≡ : Changer le style de menu (Plat / Groupe)\n• ⇄ : Inverser la logique de clic (Copier / Insérer)\n• ␣ : Ajouter un espace à la fin\n• ↵ : Ajouter une nouvelle ligne à la fin\n• ☆ : Panneau de chaînes personnalisées\n• 🖱️ : Mode d'activation (Survol / Clic)\n• 🌐 : Changer de langue\n\n【Actions】\n• **Clic** : Copier (défaut)\n• **Appui long (0,5s)** : Insérer dans la zone de texte\n• **Shift+Clic** : Copier et insérer (menu conservé)",
      manual_content_sections:
        "<div class='mm-section'><div class='mm-sec-title c-default'>⚡ Démarrage rapide</div><div class='mm-content'>Survolez un message Discord → un bouton de copie apparaît en haut à droite.<br><b>Clic</b> pour copier · <b>Appui long 0,5s</b> pour insérer · <b>Shift+Clic</b> pour copier et insérer.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 Menu de copie</div><div class='mm-content'>• Copier le texte, l'URL des médias, le premier lien propre, tous les liens, Markdown, texte masqué.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ Télécharger</div><div class='mm-content'>• Télécharger images/médias individuellement ou en ZIP.</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 Conversion d'URL</div><div class='mm-content'>Twitter/X, Instagram, Bilibili, Pixiv — conversion mutuelle pour les aperçus Discord.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 Trou de ver</div><div class='mm-content'>Raccourcis de salon en un clic dans la barre latérale Discord.</div></div>",
      reload_confirm:
        "Paramètres sauvegardés !\nRecharger la page maintenant ?",
      copy_text: "📋 Copier le texte",
      copy_media_url: "🖼️ Copier l'URL des médias",
      no_content: "⚠️ Aucun contenu",
      copy_first_link: "🔗 Copier le premier lien (propre)",
      copy_markdown: "🧾 Copier en Markdown",
      copy_all_links: "📎 Copier tous les liens",
      insert_format_link: "📌 Insérer [{t}](URL)",
      copy_hidden_format: "🙈 Texte masqué (|| ... ||)",
      download_images: "⬇️ Télécharger images/médias",
      download_zip: "📦 Télécharger en ZIP",
      download_start: "🚀 Téléchargement...",
      download_zip_start: "📦 Compression de {n} fichier(s)...",
      download_fail: "❌ Échec du téléchargement",
      download_cors_fail:
        "⚠️ CORS empêche le téléchargement direct. Copiez l'URL et ouvrez-la dans le navigateur.",
      original_url: "🔗 URL originale",
      convert_all: "⚡ Tout convertir ({n})",
      convert_imgur: "🖼️ Convertir en i.imgur.com",
      to_twitter: "🐦 twitter.com",
      to_x: "❌ x.com",
      to_vxtwitter: "🔁 vxtwitter",
      to_fixupx: "🛠️ fixupx",
      to_fxtwitter: "🔧 fxtwitter",
      to_cunnyx: "🍑 cunnyx",
      to_fixvx: "🧩 fixvx",
      to_reddit: "👽 reddit.com",
      to_old_reddit: "📜 old.reddit",
      to_rxddit: "🔁 rxddit",
      to_vxreddit: "🛠️ vxreddit",
      to_instagram: "📷 instagram.com",
      to_kkinstagram: "🔁 kkinstagram",
      to_vxinstagram: "🔁 to vxinstagram",
      to_ddinstagram: "🔁 to ddinstagram",
      to_uuinstagram: "🔁 to uuinstagram",
      to_facebed: "🔁 facebed.com",
      to_tiktok: "🎵 tiktok.com",
      to_vxtiktok: "🔁 vxtiktok",
      to_tnktok: "🛠️ tnktok",
      to_threads: "🧵 threads.com",
      to_fixthreads: "🔁 fixthreads",
      to_fx_bilibili: "📺 FX Bilibili",
      to_vx_bilibili: "📼 VX Bilibili",
      to_b23: "🔗 b23.tv",
      to_vxb23: "🔗 vxb23.tv",
      to_phixiv: "🔙 phixiv.net",
      to_pixiv: "🎨 pixiv.net",
      yt_shorts_to_watch: "▶️ YT Shorts → lien normal",
      restore_pixiv_img: "📖 Restaurer pixiv depuis l'image",
      insert_symbol: "✳️ Insérer → {s}",
      delete_symbol: "❌",
      delete_confirm: "Supprimé : {s}",
      add_symbol: "➕ Ajouter",
      add_symbol_prompt: "Entrez le texte à ajouter :",
      add_success: "Ajouté",
      remove_symbol: "➖ Supprimer",
      remove_symbol_prompt: "Entrez le texte à supprimer :",
      remove_empty: "La liste est vide",
      mode_hover: "🔄 Survol",
      mode_click: "🖱️ Clic",
      mode_desc: "Mode : {mode} (clic pour changer)",
      mode_changed: "Mode changé : {mode}",
      export_success:
        "✅ Paramètres exportés !\n\nCopiés dans le presse-papiers.",
      import_prompt: "⬇️ Collez le code de sauvegarde (JSON) :",
      import_success: "✅ Importation réussie !\nRechargement de la page.",
      import_fail: "❌ Échec de l'importation : JSON invalide.",
      insert_success: "Inséré",
      copy_success: "Copié",
      copy_fail: "Échec de la copie",
      input_not_found: "Zone de texte introuvable",
      edit_link_text: "Modifier le préfixe du lien",
      enter_link_text: "Entrez le préfixe du lien (vide pour supprimer) :",
      tip_style: "Style de menu : Plat / Groupe",
      tip_trigger: "Activation : Survol / Clic",
      tip_logic: "Logique de clic : Copier / Insérer",
      tip_space: "Ajouter un espace",
      tip_newline: "Ajouter une nouvelle ligne",
      tip_symbols: "Voir les chaînes personnalisées",
      tip_lang: "Changer de langue",
      tip_manual: "Manuel",
      mod_msg_warn_title: "⚠️ Désactiver l'Utilitaire de Messages ?",
      mod_msg_warn_body:
        "⠿ L'Utilitaire de Messages est la fonction principale.\\nSi désactivé, le bouton ⠿ disparaîtra de tous les messages.",
      mod_msg_warn_confirm: "Désactiver",
      mod_msg_warn_cancel: "Annuler",
      mod_msg_enable_menu: "Activer ⠿ Utilitaire de Messages",
      rescue_reload_msg: "Paramètres mis à jour. Recharger la page pour appliquer ?",
      rescue_close_btn: "Fermer",
      grp_copy: "📝 Copier >",
      grp_convert: "🔄 Convertir >",
      grp_download: "⬇️ Télécharger >",
      grp_system: "⚙️ Système et symboles >",
      grp_webhook: "🔗 Webhook >",
      view_main: "Menu principal",
      view_symbols: "Chaînes personnalisées",

      em_title: "😊 Gestion intégrée des expressions/GIF",
      em_content:
        "• <b>Barre</b> : [📁] Collection | [🎯] Mode viseur | [★] Mots-clés.<br>• <b>Mode viseur</b> : sélectionnez directement des GIFs ou emojis à l'écran.<br>• <b>Shift+Clic</b> : envoyer consécutivement sans fermer le panneau.",
      em_picker_tip:
        "🔍 Cliquez sur le GIF/emoji (clic sur le fond pour annuler)",
      em_err_no_list:
        "Conteneur de liste introuvable. Ouvrez d'abord la fenêtre emoji ou GIF !",
      em_btn_add_title: "Sauvegarder le mot-clé de recherche",
      em_btn_active_title: "Clic : remplir le mot-clé (basculer)",
      em_btn_target_title:
        "Mode viseur : cliquez sur GIF/emoji pour sauvegarder",
      em_btn_save_this: "Ajouter cet élément à la collection",
      em_no_favs: "Aucun favori pour l'instant",
      em_del_confirm: "Supprimer « {k} » ?",
      em_note_prompt: "Note :",
      em_set_cover_success: "Image de couverture définie !",

      wm_nav_fail: "Échec de la navigation. Vérifiez l'URL.",
      wm_alert_invalid_url:
        "URL invalide ! Veuillez coller une URL de salon Discord (contenant /channels/).",
      wm_default_channel_name: "Salon",
      wm_refresh_confirm:
        "Trou de ver créé, mais l'interface ne peut pas se mettre à jour immédiatement.\n\nRecharger la page maintenant ?",
      wm_root_group: "Non catégorisé",

      wm_menu_edit: "✎ Modifier le nom",
      wm_menu_del: "🗑️ Fermer le trou",
      wm_menu_vip_add: "★ Épingler en VIP",
      wm_menu_vip_remove: "☆ Retirer le VIP",
      wm_menu_move: "📂 Déplacer vers le groupe",
      wm_group_prompt: "Entrez le nom du nouveau groupe :",
      wm_edit_group: "Modifier le nom du groupe :",
      wm_group_del_confirm:
        "Dissoudre le groupe « {n} » ? (les trous seront conservés)",
      wm_group_select_prompt:
        "Entrez un numéro pour sélectionner le groupe :\n\n0. [Racine/Non catégorisé]\n{list}\n\nLaissez vide pour créer « Nouveau groupe » :",
      wm_group_invalid: "Sélection de groupe invalide !",
      wm_move_prompt:
        "Déplacer vers quel groupe ? (entrez le numéro)\n\n{list}",
      wm_icon_picker_title: "Sélectionner l'icône pour {name}",
      wm_icon_set_success: "✅ Icône de {name} définie",
      wm_icon_empty: "Ajoutez d'abord un Emoji dans le module de collection",
      wm_title:
        "Contrôle du trou de ver\n• Clic : créer nouveau\n• Appui long 1s : menu des paramètres",
      wm_settings_menu_title: "🌀 Paramètres du trou de ver",
      wm_settings_create: "Créer un nouveau trou de ver",
      wm_settings_send_mode: "Méthode d'envoi et Mode API",
      wm_settings_more: "Plus de paramètres (à venir)",
      wm_settings_position: "Changer la position",
      wm_settings_position_navbar: "Barre de navigation",
      wm_settings_position_titlebar: "Barre de titre du salon",
      wm_settings_position_input: "Au-dessus de la saisie de chat",
      wm_settings_position_topleft: "Coin supérieur gauche (fixe)",
      wm_focus_on: "Désactiver le mode focus",
      wm_focus_off: "Activer le mode focus (icônes uniquement)",
      wm_focus_size: "Taille des icônes",
      wm_focus_size_s: "S  · Petit",
      wm_focus_size_m: "M  · Moyen",
      wm_focus_size_l: "L  · Grand",

      wm_menu_send: "✉️ Envoyer un message ici",
      wm_send_placeholder: "Tapez un message pour #{name}...",
      wm_send_btn: "Envoyer",
      wm_send_cancel: "Annuler",
      wm_send_waiting: "En attente de l'éditeur...",
      wm_send_injecting: "Envoi en cours...",
      wm_send_success: "✅ Envoyé à #{name} !",
      wm_send_toast_title: "✅ Envoyé à #{name}",
      wm_send_toast_hint: "Cliquez pour aller au salon",
      wm_send_waiting_token: "⏳ En attente du Token…",
      wm_send_fail: "❌ Échec — éditeur non prêt.",
      wm_send_empty: "Le message ne peut pas être vide.",
      wm_send_returning: "Retour en cours...",
      wm_send_hint: "Shift+Clic pour envoyer sans changer de salon",
      wm_send_mode_api: "⚡ Mode API",
      wm_send_mode_nav: "🔀 Mode navigation",
      wm_send_mode_desc_api: "Envoi direct, sans changement de salon",
      wm_send_mode_desc_nav: "Changer de salon cible, puis envoyer",
      wm_send_autoclose: "Fermer automatiquement après envoi",
      wm_send_show_toast: "Afficher la notification d'envoi",
      wm_send_goto_channel: "Aller au salon après envoi",
      wm_send_paste_hint: "📋 Ctrl+V pour coller une image",
      wm_send_token_warn:
        "⚠️ Token expiré. Rouvrez le panneau API pour le détecter à nouveau. Utilisation du Mode A cette fois.",
      wm_send_channel_fail: "❌ Échec du chargement du salon",
      wm_send_editor_missing: "❌ Éditeur introuvable",
      wm_send_uploading: "📎 Envoi de {n} image(s)...",

      wm_api_panel_title: "⚗️ Mode API du trou de ver (avancé)",
      wm_api_mode_label_a: "Mode A — Navigation (défaut)",
      wm_api_mode_label_b: "Mode B — API directe (sans changement de page)",
      wm_api_warning_title: "⚠️ Avis de risque",
      wm_api_warning_body:
        "Utiliser un Token utilisateur pour appeler l'API Discord viole les Conditions d'utilisation. Votre compte peut être banni. Utilisez à vos risques.",
      wm_api_token_status_none: "Token : Non détecté",
      wm_api_token_status_ready: "Token : Prêt (mémoire uniquement)",
      wm_api_detect_btn: "Détecter mon Token",
      wm_api_detect_confirm:
        "【Consentement d'interception du Token】\n\nEn cliquant sur OK, vous autorisez ce script à intercepter votre Token Discord pour cette session.\n\n🔒 Garanties de sécurité :\n• Mémoire uniquement — jamais écrit sur disque\n• Effacé à la fermeture ou au rechargement de la page\n• Jamais transmis à un serveur externe\n• Utilisé exclusivement pour envoyer des messages en votre nom\n\n⚠️ Reconnaissance :\n• Vous comprenez que ce token accorde l'accès à l'envoi de messages\n• Vous acceptez l'entière responsabilité de tous les messages envoyés\n\nProcédez uniquement si vous faites confiance à ce script.",
      wm_api_detect_waiting:
        "⬆️ Changez de salon une fois pour capturer le Token",
      wm_api_enable_btn: "Activer le Mode API",
      wm_api_disable_btn: "Désactiver le Mode API (retour au Mode A)",
      wm_api_enabled_toast: "✅ Mode API activé",
      wm_api_disabled_toast: "↩️ Retour au Mode Navigation",
      wm_api_view_code: "Voir le code de l'intercepteur de Token",
      wm_api_clear_token: "🗑 Effacer le Token",
      wm_api_reset_all: "🗑️ Réinitialiser toutes les données du trou",
      wm_api_plan_b_first: "Veuillez d'abord sélectionner le Plan B",
      wm_api_send_fail: "❌ Échec de l'API — vérifiez la console",

      em_col_title: "Mes collections",
      em_col_add_success: "Enregistré dans « {g} » !",
      em_col_tab_new: "Nouvel onglet",
      em_col_tab_prompt: "Nom du nouvel onglet :",
      em_col_empty_tab: "Cet onglet est vide.",
      em_col_del_tab_confirm:
        "Supprimer l'onglet « {n} » et tous ses éléments ?",
      em_modal_choose_tab: "Enregistrer dans quelle collection ?",
      em_modal_create_new: "+ Créer une nouvelle...",
      em_tip_pick: "Définir l'image de couverture",
      em_tip_edit: "Modifier la note",
      em_tip_delete: "Supprimer",
      em_menu_emoji: "Emojis",
      em_menu_sticker: "Autocollants",
      em_menu_gif: "GIFs",

      menu_export: "📤 Exporter les paramètres (Sauvegarde)",
      menu_import: "⬇️ Importer les paramètres (Restaurer)",
      menu_change_lang: "🌐 Changer de langue",
      custom_lang_desc:
        "Cliquez sur「📤 Exporter le texte」pour obtenir le JSON source en anglais. Traduisez-le puis utilisez「📥 Importer le texte」pour l'appliquer.",
      custom_lang_export: "📤 Exporter le texte",
      custom_lang_import: "📥 Importer le texte",
      custom_lang_apply: "✅ Appliquer et recharger",
      custom_lang_loaded: "✅ Chargé : {name}",
      custom_lang_activate: "🌐 Appliquer « {name} »",
      custom_lang_json_error: "⚠️ Erreur JSON : {msg}",
      custom_lang_paste_hint: "Collez le JSON traduit ici …",
      copy_media_prefixed: "✅ {n} lien(s) média avec préfixe copié(s)",
      copy_media_urls: "✅ {n} lien(s) média copié(s)",
      wormhole_reset_success: "✅ Données supprimées, rechargement…",
      // --- Module F (Webhook) ---
      wh_panel_title: "🔗 Gestion des Webhooks",
      wh_enable: "Activer le Webhook",
      wh_tip: "Gestion des Webhooks",
      wh_add_name_ph: "Étiquette (ex : Animaux)",
      wh_add_url_ph: "https://discord.com/api/webhooks/…",
      wh_btn_add: "＋ Ajouter",
      wh_btn_test: "Tester",
      wh_btn_delete: "Supprimer",
      wh_test_ok: "✅ Test envoyé !",
      wh_test_fail: "❌ Test échoué",
      wh_send_content: "📨 Envoyer le message au Webhook ▶",
      wh_send_urls: "🔗 Envoyer les URLs au Webhook ▶",
      wh_no_webhooks: "Aucun Webhook configuré",
      wh_send_ok: "✅ Envoyé à [{name}]",
      wh_send_fail: "❌ Échec d'envoi [{name}]",
      wh_no_urls: "⚠️ Aucune URL dans ce message",
      wh_url_invalid: "⚠️ URL de Webhook invalide",
      wh_btn_edit: "Modifier",
      wh_btn_save: "Enregistrer",
      wh_btn_cancel: "Annuler",
      wh_keep_source: "📎 Inclure le lien source",
      wh_keep_source_tip: "Si coché, le lien original du message est ajouté à la fin du contenu envoyé.",

      // --- Module C (GIF Refresh) ---
      em_col_refresh_tooltip: "Actualiser l'aperçu GIF (recharger le cache CDN expiré)",
      em_refresh_no_expired:   "ℹ️ Aucun GIF expiré dans cet onglet",
      em_refresh_consent:      "⚠️ À propos de l'actualisation des GIFs\n\nCette fonctionnalité utilisera un proxy tiers (fixcdn.hyonsu.com)\npour obtenir de nouvelles informations d'identification Discord.\n\nRemarques :\n• Vos URLs d'images seront envoyées à fixcdn.hyonsu.com\n• Il s'agit d'un service tiers, sans lien avec Discord ou ce script\n• Recherchez 'fixcdn hyonsu' pour en savoir plus avant de continuer\n\nContinuer ?",
      em_refresh_cancel_tip:   "ℹ️ Annulé. Étapes manuelles :\n① Trouvez le GIF original sur Discord\n② Ajoutez-le à nouveau à votre collection",
      em_refresh_loading:      "Actualisation...",
      em_refresh_ok:           "✨ {n} GIF(s) actualisé(s){fail} {track}",
      em_refresh_partial_fail: " ({f} échec(s))",
      em_refresh_fail:         "⚠️ Impossible d'actualiser les GIFs de cet onglet",
      em_refresh_track_api:    "(Discord API)",
      em_refresh_track_cdn:    "(fixcdn)",
      em_save_success: "Enregistré : {k}",

      // --- Module G (URL Checker) ---
      uc_duplicate_found: "⚠️ Cette URL a déjà été publiée — apparue {count}× dans les {limit} derniers messages",
      uc_duplicate_found_plural: "⚠️ {n} URLs dupliquées — jusqu'à {count}× dans les {limit} derniers messages",
      uc_dom_found: "⚠️ Cette URL est apparue {count}× dans {limit} messages visibles (mode DOM · sans API)",
      uc_no_token: "🔍 La vérification d'URL dupliquée nécessite le mode API Wormhole — activez-le dans les paramètres Wormhole (maintenez ＋ 1s)",
      uc_token_waiting: "⏳ En attente du Token API… changez de salon une fois pour le capturer",
      uc_fetching: "🔄 Recherche d'URLs dupliquées…",
      uc_dismiss: "✕",
      uc_limit_label: "Portée du scan :",
      uc_limit_suffix: "messages",

      // --- Wormhole (missing) ---
      wm_url_prompt: "Entrez l'URL complète du salon Discord :",
      wm_name_prompt: "Entrez le nom du Wormhole (ex. Général) :",
      wm_edit_title: "Modifier le Wormhole : {n}",
      wm_created: "Wormhole créé !",
      wm_deleted: "Wormhole fermé.",
      mu_temp_card_name: "Temporaire",
      mu_temp_card_desc: "Démute après le minuteur",
      mu_temp_quick:    "Sélection rapide",
      mu_temp_placeholder: "ex : 3H, 1D 6H, 27H 20M",
      mu_temp_confirm:  "⏳ Muet temporaire",
      mu_temp_expired_toast: "⏰ Muet temporaire expiré : {name}",
      mu_temp_badge_label: "⏳",
    },

    ru: {
      name: "Русский",
      // --- Module A (Forwarding) ---
      fm_pinned_channels: "★ Закреплённые каналы",
      fm_toggle_flat: "Переключить на: Плоский вид",
      fm_toggle_drop: "Переключить на: Выпадающий список",
      fm_help: "Справка",
      fm_prompt_channel: "Введите ключевое слово канала:",
      fm_prompt_user: "Введите ID или ключевое слово пользователя:",
      fm_user_zone: "Зона пользователей",
      fm_no_users: "Нет закреплённых пользователей",
      fm_add_user: "+ Добавить пользователя",
      fm_fuzzy: "Нечёткий поиск",
      fm_remove_confirm: "Удалить {target}?",
      fm_tooltip_channel: "Канал: {c}\nСервер: {s}",
      fm_tooltip_user_add: "Добавить в зону пользователей (👤)",
      fm_tooltip_star_add: "Добавить в избранное (★)",
      fm_manual_title: "📚 Руководство менеджера переадресации",
      fm_sec_star: "★ Избранное и управление",
      fm_sec_star_content:
        "• Нажмите <span class='help-key'>★</span> или <span class='help-key'>👤+</span> для закрепления.<br>• Правый клик для удаления.<br>• <span class='help-key'>Shift+Правый клик</span> для быстрого удаления (без подтверждения).",
      fm_sec_search: "🔍 Двухэтапный поиск (по умолчанию)",
      fm_sec_search_content:
        "• Нажатие на закреплённый элемент автоматически выполняет «Разогрев → Ввод → Блокировка».<br>• Исправляет ошибку Discord, при которой прямой ввод не работает.<br>• Использует <span style='color:#2dc770'>Точное совпадение</span> для предотвращения ошибочных пересылок.",
      fm_sec_fuzzy: "⏎ Нечёткий поиск",
      fm_sec_fuzzy_content:
        "• Нажмите стрелку <span class='help-key'>⏎</span> внутри кнопки.<br>• Вводит только первые 2 символа или первое слово.",
      fm_sec_user: "👤 Зона пользователей",
      fm_sec_user_content:
        "• Нажмите кнопку <span class='help-key'>👤</span> для раскрытия списка пользователей.<br>• Поддерживает ручное добавление ID.",
      fm_sec_misc_title: "⚙️ Советы и отображение",
      fm_sec_misc:
        "• Кнопка в верхнем левом углу переключает режим <b>Плоский</b> или <b>Выпадающий</b>.<br>• <b>История</b> (фиолетовые метки) автоматически сохраняет недавно посещённые каналы.",

      fm_sec_wormhole: "🌀 Червоточина — Основы",
      fm_sec_wormhole_content:
        "• Нажмите <span class='help-key'>＋</span> и вставьте URL канала Discord для создания ярлыка.<br>" +
        "• <b>Клик</b> на червоточину → мгновенный переход к этому каналу.<br>" +
        "• <b>Правый клик</b> → меню: переименовать, удалить, значок, перенести в группу или переключить VIP.<br>" +
        "• <b>VIP (★)</b>: закреплённые червоточины автоматически всплывают наверх.<br>" +
        "• <b>Группы</b>: организуйте червоточины в именованные папки.<br>" +
        "• <b>Режим фокуса</b>: компактный вид только со значками.",
      fm_sec_wm_send: "✉️ Червоточина — Отправка сообщений",
      fm_sec_wm_send_content:
        "• <b>Правый клик</b> → <b>Отправить сообщение здесь</b> для открытия панели.<br>" +
        "• <b>Режим A (Навигация)</b>: переходит на целевой канал, вставляет текст и возвращается.<br>" +
        "• <b>Shift+Клик</b> → открывает панель в текущем канале.<br>" +
        "• Поддерживает <b>вставку изображений через Ctrl+V</b>.<br>" +
        "• Нижние опции: <b>Автозакрытие</b> / <b>Перейти на канал</b> / <b>Показать уведомление</b>.",
      fm_sec_wm_api: "⚡ Червоточина — Режим API (секретный)",
      fm_sec_wm_api_content:
        "• <b>Удерживайте кнопку ＋ 3 секунды</b> для разблокировки режима API.<br>" +
        "• <b>Режим B (Прямой API)</b>: отправляет сообщения через Discord REST API без смены страницы.<br>" +
        "• Токен перехватывается тихо в памяти — <b>никогда не сохраняется и не передаётся</b>.<br>" +
        "• Очищается при закрытии страницы.",
      welcome_title: "Добро пожаловать в {script}",
      select_lang_subtitle: "Пожалуйста, выберите язык интерфейса",
      help_btn: "📖 Руководство",
      cancel_btn: "✕ Закрыть",
      security_notice_title: "⚠️ Уведомление безопасности",
      security_notice_content:
        "Функции конвертации URL (например, vxtwitter, kkinstagram) зависят от сторонних сервисов.\nНе используйте их, если не доверяете этим сервисам.\nПользователи должны уметь определять безопасность URL.",
      manual_content:
        "【Руководство по иконкам】\n• ◫/≡ : Сменить стиль меню (Плоский / Группа)\n• ⇄ : Поменять логику клика (Копировать / Вставить)\n• ␣ : Добавить пробел в конце\n• ↵ : Добавить новую строку в конце\n• ☆ : Панель пользовательских строк\n• 🖱️ : Режим активации (Hover / Клик)\n• 🌐 : Сменить язык\n\n【Действия】\n• **Клик**: Копировать (по умолчанию)\n• **Долгое нажатие (0,5с)**: Вставить в поле ввода\n• **Shift+Клик**: Копировать и вставить (меню остаётся открытым)",
      manual_content_sections:
        "<div class='mm-section'><div class='mm-sec-title c-default'>⚡ Быстрый старт</div><div class='mm-content'>Наведите курсор на любое сообщение Discord → в правом верхнем углу появится кнопка копирования.<br><b>Клик</b> для копирования · <b>Долгое нажатие 0,5с</b> для вставки · <b>Shift+Клик</b> для копирования и вставки.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 Меню копирования</div><div class='mm-content'>• Копировать текст, URL медиа, первую чистую ссылку, все ссылки, Markdown, скрытый текст.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ Загрузка</div><div class='mm-content'>• Загружать изображения/медиа по отдельности или как ZIP.</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 Конвертация URL</div><div class='mm-content'>Twitter/X, Instagram, Bilibili, Pixiv — взаимная конвертация для предпросмотра в Discord.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 Червоточина</div><div class='mm-content'>Ярлыки каналов в один клик на боковой панели Discord.</div></div>",
      reload_confirm: "Настройки сохранены!\nПерезагрузить страницу сейчас?",
      copy_text: "📋 Копировать текст",
      copy_media_url: "🖼️ Копировать URL медиа",
      no_content: "⚠️ Нет содержимого",
      copy_first_link: "🔗 Копировать первую ссылку (чистую)",
      copy_markdown: "🧾 Копировать как Markdown",
      copy_all_links: "📎 Копировать все ссылки",
      insert_format_link: "📌 Вставить [{t}](URL)",
      copy_hidden_format: "🙈 Скрытый текст (|| ... ||)",
      download_images: "⬇️ Скачать изображения/медиа",
      download_zip: "📦 Скачать как ZIP",
      download_start: "🚀 Загрузка...",
      download_zip_start: "📦 Сжатие {n} файл(ов)...",
      download_fail: "❌ Ошибка загрузки",
      download_cors_fail:
        "⚠️ CORS не позволяет прямую загрузку. Скопируйте URL и откройте в браузере.",
      original_url: "🔗 Оригинальный URL",
      convert_all: "⚡ Конвертировать всё ({n})",
      convert_imgur: "🖼️ Конвертировать в i.imgur.com",
      to_twitter: "🐦 twitter.com",
      to_x: "❌ x.com",
      to_vxtwitter: "🔁 vxtwitter",
      to_fixupx: "🛠️ fixupx",
      to_fxtwitter: "🔧 fxtwitter",
      to_cunnyx: "🍑 cunnyx",
      to_fixvx: "🧩 fixvx",
      to_reddit: "👽 reddit.com",
      to_old_reddit: "📜 old.reddit",
      to_rxddit: "🔁 rxddit",
      to_vxreddit: "🛠️ vxreddit",
      to_instagram: "📷 instagram.com",
      to_kkinstagram: "🔁 kkinstagram",
      to_vxinstagram: "🔁 to vxinstagram",
      to_ddinstagram: "🔁 to ddinstagram",
      to_uuinstagram: "🔁 to uuinstagram",
      to_facebed: "🔁 facebed.com",
      to_tiktok: "🎵 tiktok.com",
      to_vxtiktok: "🔁 vxtiktok",
      to_tnktok: "🛠️ tnktok",
      to_threads: "🧵 threads.com",
      to_fixthreads: "🔁 fixthreads",
      to_fx_bilibili: "📺 FX Bilibili",
      to_vx_bilibili: "📼 VX Bilibili",
      to_b23: "🔗 b23.tv",
      to_vxb23: "🔗 vxb23.tv",
      to_phixiv: "🔙 phixiv.net",
      to_pixiv: "🎨 pixiv.net",
      yt_shorts_to_watch: "▶️ YT Shorts → обычная ссылка",
      restore_pixiv_img: "📖 Восстановить pixiv из изображения",
      insert_symbol: "✳️ Вставить → {s}",
      delete_symbol: "❌",
      delete_confirm: "Удалено: {s}",
      add_symbol: "➕ Добавить",
      add_symbol_prompt: "Введите текст для добавления:",
      add_success: "Добавлено",
      remove_symbol: "➖ Удалить",
      remove_symbol_prompt: "Введите текст для удаления:",
      remove_empty: "Список пуст",
      mode_hover: "🔄 Hover",
      mode_click: "🖱️ Клик",
      mode_desc: "Режим: {mode} (клик для переключения)",
      mode_changed: "Режим изменён: {mode}",
      export_success:
        "✅ Настройки экспортированы!\n\nСкопированы в буфер обмена.",
      import_prompt: "⬇️ Вставьте код резервной копии (JSON):",
      import_success: "✅ Импорт успешен!\nСтраница перезагружается.",
      import_fail: "❌ Ошибка импорта: неверный JSON.",
      insert_success: "Вставлено",
      copy_success: "Скопировано",
      copy_fail: "Ошибка копирования",
      input_not_found: "Поле ввода не найдено",
      edit_link_text: "Изменить префикс ссылки",
      enter_link_text: "Введите префикс ссылки (пустое для удаления):",
      tip_style: "Стиль меню: Плоский / Группа",
      tip_trigger: "Активация: Hover / Клик",
      tip_logic: "Логика клика: Копировать / Вставить",
      tip_space: "Добавить пробел",
      tip_newline: "Добавить новую строку",
      tip_symbols: "Просмотреть пользовательские строки",
      tip_lang: "Сменить язык",
      tip_manual: "Руководство",
      mod_msg_warn_title: "⚠️ Отключить утилиту сообщений?",
      mod_msg_warn_body:
        "⠿ Утилита сообщений является основной функцией.\\nПри отключении кнопка ⠿ исчезнет со всех сообщений.",
      mod_msg_warn_confirm: "Отключить",
      mod_msg_warn_cancel: "Отмена",
      mod_msg_enable_menu: "Включить ⠿ утилиту сообщений",
      rescue_reload_msg: "Настройки обновлены. Перезагрузить страницу для применения?",
      rescue_close_btn: "Закрыть",
      grp_copy: "📝 Копировать >",
      grp_convert: "🔄 Конвертировать >",
      grp_download: "⬇️ Скачать >",
      grp_system: "⚙️ Система и символы >",
      grp_webhook: "🔗 Webhook >",
      view_main: "Главное меню",
      view_symbols: "Пользовательские строки",

      em_title: "😊 Интегрированное управление выражениями/GIF",
      em_content:
        "• <b>Панель</b>: [📁] Коллекция | [🎯] Режим прицела | [★] Ключевые слова.<br>• <b>Режим прицела</b>: выбирайте GIF или эмодзи прямо с экрана.<br>• <b>Shift+Клик</b>: отправлять последовательно без закрытия панели.",
      em_picker_tip: "🔍 Нажмите на GIF/эмодзи (нажмите на фон для отмены)",
      em_err_no_list:
        "Контейнер списка не найден. Сначала откройте окно эмодзи или GIF!",
      em_btn_add_title: "Сохранить ключевое слово поиска",
      em_btn_active_title: "Клик: заполнить ключевое слово (переключить)",
      em_btn_target_title: "Режим прицела: нажмите GIF/эмодзи для сохранения",
      em_btn_save_this: "Добавить этот элемент в коллекцию",
      em_no_favs: "Пока нет избранного",
      em_del_confirm: "Удалить «{k}»?",
      em_note_prompt: "Заметка:",
      em_set_cover_success: "Обложка установлена!",

      wm_nav_fail: "Навигация не удалась. Проверьте URL.",
      wm_alert_invalid_url:
        "Недопустимый URL! Пожалуйста, вставьте URL канала Discord (содержащий /channels/).",
      wm_default_channel_name: "Канал",
      wm_refresh_confirm:
        "Червоточина создана, но интерфейс не может обновиться немедленно.\n\nПерезагрузить страницу сейчас?",
      wm_root_group: "Без категории",

      wm_menu_edit: "✎ Изменить название",
      wm_menu_del: "🗑️ Закрыть червоточину",
      wm_menu_vip_add: "★ Закрепить как VIP",
      wm_menu_vip_remove: "☆ Снять VIP",
      wm_menu_move: "📂 Переместить в группу",
      wm_group_prompt: "Введите название новой группы:",
      wm_edit_group: "Изменить название группы:",
      wm_group_del_confirm:
        "Расформировать группу «{n}»? (червоточины сохранятся)",
      wm_group_select_prompt:
        "Введите номер для выбора группы:\n\n0. [Корень/Без категории]\n{list}\n\nОставьте пустым для создания «Новой группы»:",
      wm_group_invalid: "Недопустимый выбор группы!",
      wm_move_prompt: "В какую группу переместить? (введите номер)\n\n{list}",
      wm_icon_picker_title: "Выбрать значок для {name}",
      wm_icon_set_success: "✅ Значок {name} установлен",
      wm_icon_empty: "Сначала добавьте эмодзи в модуле коллекции",
      wm_title:
        "Управление червоточиной\n• Клик: создать новую\n• Долгое нажатие 1с: меню настроек",
      wm_settings_menu_title: "🌀 Настройки червоточины",
      wm_settings_create: "Создать новую червоточину",
      wm_settings_send_mode: "Метод отправки и режим API",
      wm_settings_more: "Дополнительные настройки (скоро)",
      wm_settings_position: "Изменить позицию",
      wm_settings_position_navbar: "Панель навигации",
      wm_settings_position_titlebar: "Заголовок канала",
      wm_settings_position_input: "Над полем чата",
      wm_settings_position_topleft: "Верхний левый угол (фиксированный)",
      wm_focus_on: "Отключить режим фокуса",
      wm_focus_off: "Включить режим фокуса (только значки)",
      wm_focus_size: "Размер значка",
      wm_focus_size_s: "S  · Маленький",
      wm_focus_size_m: "M  · Средний",
      wm_focus_size_l: "L  · Большой",

      wm_menu_send: "✉️ Отправить сообщение здесь",
      wm_send_placeholder: "Введите сообщение для #{name}...",
      wm_send_btn: "Отправить",
      wm_send_cancel: "Отмена",
      wm_send_waiting: "Ожидание редактора...",
      wm_send_injecting: "Отправка...",
      wm_send_success: "✅ Отправлено в #{name}!",
      wm_send_toast_title: "✅ Отправлено в #{name}",
      wm_send_toast_hint: "Нажмите для перехода на канал",
      wm_send_waiting_token: "⏳ Ожидание токена…",
      wm_send_fail: "❌ Ошибка — редактор не готов.",
      wm_send_empty: "Сообщение не может быть пустым.",
      wm_send_returning: "Возвращаемся...",
      wm_send_hint: "Shift+Клик для отправки без смены канала",
      wm_send_mode_api: "⚡ Режим API",
      wm_send_mode_nav: "🔀 Режим навигации",
      wm_send_mode_desc_api: "Прямая отправка, без смены канала",
      wm_send_mode_desc_nav: "Переход на целевой канал, затем отправка",
      wm_send_autoclose: "Автозакрытие после отправки",
      wm_send_show_toast: "Показывать уведомление об отправке",
      wm_send_goto_channel: "Перейти на канал после отправки",
      wm_send_paste_hint: "📋 Ctrl+V для вставки изображения",
      wm_send_token_warn:
        "⚠️ Токен истёк. Откройте панель API заново для повторного обнаружения. На этот раз используется режим A.",
      wm_send_channel_fail: "❌ Ошибка загрузки канала",
      wm_send_editor_missing: "❌ Редактор не найден",
      wm_send_uploading: "📎 Загрузка {n} изображени(й)...",

      wm_api_panel_title: "⚗️ Режим API червоточины (расширенный)",
      wm_api_mode_label_a: "Режим A — Навигация (по умолчанию)",
      wm_api_mode_label_b: "Режим B — Прямой API (без смены страницы)",
      wm_api_warning_title: "⚠️ Предупреждение о рисках",
      wm_api_warning_body:
        "Использование токена пользователя для вызова API Discord нарушает Условия использования. Ваш аккаунт может быть заблокирован. Используйте на свой страх и риск.",
      wm_api_token_status_none: "Токен: Не обнаружен",
      wm_api_token_status_ready: "Токен: Готов (только в памяти)",
      wm_api_detect_btn: "Обнаружить мой токен",
      wm_api_detect_confirm:
        "【Согласие на перехват токена】\n\nНажав ОК, вы разрешаете этому скрипту перехватить ваш токен Discord для данной сессии.\n\n🔒 Гарантии безопасности:\n• Только в памяти — никогда не записывается на диск\n• Автоматически удаляется при закрытии или перезагрузке страницы\n• Никогда не передаётся на внешние серверы\n• Используется исключительно для отправки сообщений от вашего имени\n\n⚠️ Подтверждение:\n• Вы понимаете, что токен предоставляет доступ к отправке сообщений\n• Вы принимаете полную ответственность за все отправленные сообщения\n\nПродолжайте только если доверяете этому скрипту.",
      wm_api_detect_waiting:
        "⬆️ Переключитесь в любой канал один раз, чтобы захватить Token",
      wm_api_enable_btn: "Включить режим API",
      wm_api_disable_btn: "Отключить режим API (вернуться к режиму A)",
      wm_api_enabled_toast: "✅ Режим API включён",
      wm_api_disabled_toast: "↩️ Возврат к режиму навигации",
      wm_api_view_code: "Просмотреть код перехватчика токена",
      wm_api_clear_token: "🗑 Очистить токен",
      wm_api_reset_all: "🗑️ Сбросить все данные червоточины",
      wm_api_plan_b_first: "Сначала выберите план B",
      wm_api_send_fail: "❌ Ошибка API — проверьте консоль",

      em_col_title: "Мои коллекции",
      em_col_add_success: "Сохранено в «{g}»!",
      em_col_tab_new: "Новая вкладка",
      em_col_tab_prompt: "Название новой вкладки:",
      em_col_empty_tab: "Эта вкладка пуста.",
      em_col_del_tab_confirm: "Удалить вкладку «{n}» со всеми элементами?",
      em_modal_choose_tab: "В какую коллекцию сохранить?",
      em_modal_create_new: "+ Создать новую...",
      em_tip_pick: "Установить обложку",
      em_tip_edit: "Редактировать заметку",
      em_tip_delete: "Удалить",
      em_menu_emoji: "Эмодзи",
      em_menu_sticker: "Стикеры",
      em_menu_gif: "GIF",

      menu_export: "📤 Экспорт настроек (Резервная копия)",
      menu_import: "⬇️ Импорт настроек (Восстановление)",
      menu_change_lang: "🌐 Сменить язык",
      custom_lang_desc:
        "Нажмите「📤 Экспорт текста」для получения исходного JSON на английском. Переведите и используйте「📥 Импорт текста」для применения.",
      custom_lang_export: "📤 Экспорт текста",
      custom_lang_import: "📥 Импорт текста",
      custom_lang_apply: "✅ Применить и перезагрузить",
      custom_lang_loaded: "✅ Загружено: {name}",
      custom_lang_activate: "🌐 Применить «{name}»",
      custom_lang_json_error: "⚠️ Ошибка JSON: {msg}",
      custom_lang_paste_hint: "Вставьте переведённый JSON сюда …",
      copy_media_prefixed: "✅ Скопировано {n} медиассылок с префиксом",
      copy_media_urls: "✅ Скопировано {n} медиассылок",
      wormhole_reset_success: "✅ Данные удалены, перезагрузка…",
      // --- Module F (Webhook) ---
      wh_panel_title: "🔗 Управление Webhook",
      wh_enable: "Включить Webhook",
      wh_tip: "Управление Webhook",
      wh_add_name_ph: "Метка (например: Животные)",
      wh_add_url_ph: "https://discord.com/api/webhooks/…",
      wh_btn_add: "＋ Добавить",
      wh_btn_test: "Тест",
      wh_btn_delete: "Удалить",
      wh_test_ok: "✅ Тест отправлен!",
      wh_test_fail: "❌ Тест не удался",
      wh_send_content: "📨 Отправить сообщение в Webhook ▶",
      wh_send_urls: "🔗 Отправить URL в Webhook ▶",
      wh_no_webhooks: "Webhooks ещё не добавлены",
      wh_send_ok: "✅ Отправлено в [{name}]",
      wh_send_fail: "❌ Ошибка отправки [{name}]",
      wh_no_urls: "⚠️ В этом сообщении нет URL",
      wh_url_invalid: "⚠️ Недействительный URL Webhook",
      wh_btn_edit: "Изменить",
      wh_btn_save: "Сохранить",
      wh_btn_cancel: "Отмена",
      wh_keep_source: "📎 Включить ссылку на источник",
      wh_keep_source_tip: "При включении ссылка на исходное сообщение добавляется в конец отправляемого контента.",

      // --- Module C (GIF Refresh) ---
      em_col_refresh_tooltip: "Обновить превью GIF (сбросить устаревший CDN-кэш)",
      em_refresh_no_expired:   "ℹ️ В этой вкладке нет устаревших GIF",
      em_refresh_consent:      "⚠️ Об обновлении GIF\n\nЭта функция использует сторонний прокси (fixcdn.hyonsu.com)\nдля получения свежих ссылок на вложения Discord.\n\nПримечания:\n• Ваши URL изображений будут отправлены на fixcdn.hyonsu.com\n• Это сторонний сервис, не связанный с Discord или этим скриптом\n• Поищите 'fixcdn hyonsu' для получения дополнительной информации\n\nПродолжить?",
      em_refresh_cancel_tip:   "ℹ️ Отменено. Ручные шаги:\n① Найдите оригинальный GIF в Discord\n② Добавьте его заново в коллекцию",
      em_refresh_loading:      "Обновление...",
      em_refresh_ok:           "✨ Обновлено {n} GIF(ов){fail} {track}",
      em_refresh_partial_fail: " ({f} ошибок)",
      em_refresh_fail:         "⚠️ Не удалось обновить GIF в этой вкладке",
      em_refresh_track_api:    "(Discord API)",
      em_refresh_track_cdn:    "(fixcdn)",
      em_save_success: "Сохранено: {k}",

      // --- Module G (URL Checker) ---
      uc_duplicate_found: "⚠️ Этот URL уже публиковался — встретился {count}× за последние {limit} сообщений",
      uc_duplicate_found_plural: "⚠️ {n} дублирующихся URL — до {count}× за последние {limit} сообщений",
      uc_dom_found: "⚠️ Этот URL встречается {count}× в {limit} видимых сообщениях (режим DOM · без API)",
      uc_no_token: "🔍 Проверка дублирующихся URL требует режима API Wormhole — включите его в настройках Wormhole (удерживайте ＋ 1с)",
      uc_token_waiting: "⏳ Ожидание API Token… переключитесь на любой канал для его получения",
      uc_fetching: "🔄 Поиск дублирующихся URL…",
      uc_dismiss: "✕",
      uc_limit_label: "Диапазон сканирования:",
      uc_limit_suffix: "сообщений",

      // --- Wormhole (missing) ---
      wm_url_prompt: "Введите полный URL канала Discord:",
      wm_name_prompt: "Введите название Wormhole (например, Общий):",
      wm_edit_title: "Редактировать Wormhole: {n}",
      wm_created: "Wormhole создан!",
      wm_deleted: "Wormhole закрыт.",

      // --- Channel Scout / Mute User ---
      cs_panel_title:   "⌨ Поиск по каналу",
      cs_placeholder:   "Введите ключевое слово для поиска…",
      cs_no_results:    "Сообщения не найдены",
      cs_empty_hint:    "Введите ключевое слово или нажмите на тег",
      cs_no_history:    "История поиска пуста",
      cs_dom_mode_note: "Режим DOM · поиск только по видимым сообщениям",
      mu_panel_title:   "🌫️ Приглушить сообщения пользователя",
      mu_empty:         "Нет приглушённых пользователей\nПравый клик по сообщению для добавления",
      mu_remove_btn:    "Восстановить",
      mu_add_toast:     "🌫️ Приглушено: {name}",
      mu_remove_toast:  "✅ Восстановлено: {name}",
      mu_ctx_mute:      "🌫️ Приглушить: {name}",
      mu_ctx_unmute:    "✅ Восстановить: {name}",
      mu_temp_card_name: "Временно",
      mu_temp_card_desc: "Авто-отключение по таймеру",
      mu_temp_quick:    "Быстрый выбор",
      mu_temp_placeholder: "напр.: 3H, 1D 6H, 27H 20M",
      mu_temp_confirm:  "⏳ Временно заглушить",
      mu_temp_expired_toast: "⏰ Временное заглушение истекло: {name}",
      mu_temp_badge_label: "⏳",
    },
  };

  // =========================================================================================
  // 共享核心 §2.1 ── 自定義語言 (Custom Lang) 初始化
  // =========================================================================================

  /** 執行期自定義語言資料，從 localStorage 載入 */
  let _customLangData = null;
  (() => {
    try {
      const raw = localStorage.getItem("copyMenuLanguage_custom");
      if (raw) _customLangData = JSON.parse(raw);
    } catch (e) {
      console.warn("[i18n] Failed to load custom language data:", e);
    }
  })();

  /** 注入 custom 語言入口（name 供語言選擇器顯示用，實際翻譯由 _customLangData 提供） */
  TRANSLATIONS["custom"] = { name: "Custom" };

  // =========================================================================================
  // =========================================================================================
  // 模組 A ── Forwarding Manager · 轉發管理器 (initForwardingManager v20.1)
  // 功能: 收藏頻道/使用者、兩段式精準搜尋、模糊搜尋、Flat/Dropdown 顯示、記憶體優化
  // =========================================================================================
  function initForwardingManager() {
    DEBUG &&
      console.log(
        "[Discord Utilities] Initializing Forwarding Manager (v20.1 Memory Safe)...",
      );

    // === 🛠️ 0. 全域變數與狀態管理 (記憶體優化核心) ===
    let pollInterval = null;
    let isPollingActive = false;
    const searchTimers = new Map(); // 用於管理搜尋 debounce 計時器

    // === 🎨 1. 樣式 (新增 Help Modal 樣式) ===
    const STYLES = `
            #my-pinned-bar { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 16px 12px 16px; background: transparent; width: 100%; box-sizing: border-box; align-items: center; position: relative; z-index: 100; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 6px; }
            .my-divider { width: 1px; height: 18px; background: rgba(255,255,255,0.2); margin: 0 4px; }
            .my-btn { display: inline-flex; align-items: center; justify-content: center; padding: 4px 8px 4px 10px; border-radius: 4px; border: 1px solid transparent; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; color: #dbdee1; background-color: #2b2d31; user-select: none; height: 28px; white-space: nowrap; }
            .my-btn:hover { filter: brightness(1.2); }
            .my-btn:active { transform: translateY(1px); }
            .my-sub-btn { display: inline-flex; align-items: center; justify-content: center; margin-left: 6px; padding: 0 4px; height: 20px; border-radius: 3px; font-size: 11px; color: #72767d; background: rgba(0,0,0,0.1); opacity: 0.6; transition: all 0.2s; cursor: pointer; font-family: monospace; font-weight: bold; }
            .my-sub-btn:hover { background: rgba(255,255,255,0.2); color: #fff; opacity: 1; }
            .my-sub-btn.is-active { background: #248046 !important; color: #fff !important; opacity: 1; box-shadow: 0 0 5px rgba(36, 128, 70, 0.6); }

            /* 按鈕顏色定義 */
            .btn-user-zone { background-color: transparent !important; color: #949BA4 !important; border: 1px solid rgba(148, 155, 164, 0.2) !important; width: 28px; padding: 0 !important; }
            .btn-user-zone:hover { background-color: rgba(148, 155, 164, 0.1) !important; color: #dbdee1 !important; border-color: rgba(148, 155, 164, 0.5) !important; }
            .btn-user-zone.has-items { color: #dbdee1 !important; border-color: rgba(148, 155, 164, 0.5) !important; }
            .btn-star-main { background-color: rgba(240, 178, 50, 0.15) !important; color: #ffc44f !important; border: 1px solid rgba(240, 178, 50, 0.4) !important; min-width: 100px; justify-content: space-between; }
            .btn-star-item { background-color: rgba(240, 178, 50, 0.05) !important; color: #ffc44f !important; border: 1px solid rgba(240, 178, 50, 0.2) !important; }
            .btn-history-group { background-color: rgba(88, 101, 242, 0.1) !important; color: #dee0fc !important; border: 1px solid rgba(88, 101, 242, 0.2) !important; }

            /* 功能按鈕 */
            .btn-toggle-mode { background: transparent !important; color: #b5bac1 !important; padding: 4px !important; width: 28px; }
            .btn-toggle-mode:hover { color: #fff !important; background: rgba(255,255,255,0.1) !important; }
            .btn-help { background: transparent !important; color: #b5bac1 !important; padding: 0 6px !important; min-width: 24px; margin-left: 2px; }
            .btn-help:hover { color: #fff !important; background: rgba(255,255,255,0.1) !important; }
            .btn-add { background: transparent !important; color: #2dc770 !important; border: 1px dashed rgba(45, 199, 112, 0.4) !important; opacity: 0.7; }
            .btn-add:hover { opacity: 1; background: rgba(45, 199, 112, 0.1) !important; }

            /* 下拉選單 */
            .my-dropdown-menu { position: absolute; top: 100%; left: 0; background: #2b2d31; border: 1px solid #1e1f22; border-radius: 4px; box-shadow: 0 8px 16px rgba(0,0,0,0.4); padding: 4px; display: none; flex-direction: column; gap: 2px; z-index: 999;
            min-width: 320px; max-height: 500px; overflow-y: auto; }

            .my-dropdown-menu.show { display: flex; }
            #my-user-dropdown-container .my-dropdown-menu { left: auto; right: 0; }
            .dropdown-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; color: #dbdee1; font-size: 13px; cursor: pointer; border-radius: 2px; transition: background 0.1s; max-width: 100%; }
            .dropdown-item:hover { background: #404249; color: #fff; }

            /* 列表按鈕 */
            .my-list-star-btn { background: transparent; border: none; cursor: pointer; color: #4e5058; padding: 4px; margin-right: 4px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s; }
            .my-list-star-btn:hover { transform: scale(1.1); color: #dbdee1; background: rgba(255,255,255,0.05); }
            .my-list-star-btn.is-active { color: #f0b232; }
            .my-list-user-btn { color: #4e5058; }
            .my-list-user-btn:hover { color: #dbdee1; }
            .my-list-user-btn.is-active { color: #2dc770; }
            .my-ghost-row { opacity: 0.15 !important; filter: grayscale(100%) !important; pointer-events: none !important; transition: opacity 0.3s ease; }
            .my-target-row { background-color: rgba(255, 255, 255, 0.03) !important; box-shadow: inset 2px 0 0 rgba(255, 255, 255, 0.2); }
            .my-user-tagged::before { content: "👤"; color: #949BA4; margin-right: 4px; font-weight: normal; }

            /* Text Truncation Utility */
            .my-ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

            /* Help Modal */
            .my-help-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); animation: fadeIn 0.2s; }
            .my-help-modal { background: #313338; width: 500px; max-width: 90%; max-height: 80vh; border-radius: 8px; box-shadow: 0 8px 16px rgba(0,0,0,0.5); display: flex; flex-direction: column; overflow: hidden; border: 1px solid #1e1f22; color: #dbdee1; font-size: 14px; line-height: 1.5; animation: slideUp 0.2s; }
            .my-help-header { padding: 16px; border-bottom: 1px solid #1e1f22; display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 16px; background: #2b2d31; }
            .my-help-body { padding: 16px; overflow-y: auto; }
            .my-help-close { cursor: pointer; color: #b5bac1; background: transparent; border: none; font-size: 20px; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; }
            .my-help-close:hover { color: #fff; }
            .help-section { margin-bottom: 16px; }
            .help-title { color: #f0b232; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
            .help-content { font-size: 13px; color: #dbdee1; padding-left: 4px; }
            .help-key { background: #1e1f22; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #eee; font-size: 12px; border: 1px solid #3f4147; }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

/* [Module D] Wormhole Styles */
            .my-wormhole-creator-btn { color: #b5bac1; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin: 0 4px; transition: color 0.2s; }
            .my-wormhole-creator-btn:hover { color: #5865F2; }

            .my-wormhole-container { display: flex; align-items: center; gap: 4px; margin-left: 8px; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 8px; }

            /* 一般蟲洞樣式 */
            .my-wormhole-chip {
                background: rgba(30, 31, 34, 0.6);
                border: 1px solid rgba(88, 101, 242, 0.3);
                color: #dbdee1;
                font-size: 12px; font-weight: 500;
                padding: 2px 8px; border-radius: 12px;
                cursor: pointer; user-select: none;
                transition: all 0.2s;
                display: flex; align-items: center; gap: 4px;
                white-space: nowrap;
            }
            .my-wormhole-chip:hover { background: rgba(88, 101, 242, 0.2); border-color: #5865F2; color: #fff; transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
            .my-wormhole-chip:active { transform: translateY(0); }
            .my-wormhole-chip.editing { border-color: #ed4245; animation: my-shake-anim 0.3s ease-in-out infinite; }

            /* 已設為VIP的蟲洞在原位弱化顯示，提示焦點已在左側VIP區 */
            .my-wormhole-chip.vip-dimmed {
                opacity: 0.35;
                filter: grayscale(60%);
                border-color: rgba(88, 101, 242, 0.15);
                color: #72767d;
            }
            .my-wormhole-chip.vip-dimmed:hover {
                opacity: 0.7;
                filter: grayscale(0%);
                border-color: #5865F2;
                color: #dbdee1;
            }
            /* 群組下拉中已VIP的項目同步弱化 */
            .my-wormhole-dropdown .dropdown-item.vip-dimmed {
                opacity: 0.4;
                filter: grayscale(50%);
                color: #72767d;
            }
            .my-wormhole-dropdown .dropdown-item.vip-dimmed:hover {
                opacity: 0.75;
                filter: grayscale(0%);
                color: #dbdee1;
            }

            /* 圖示樣式 */
            .my-wormhole-icon { font-size: 10px; opacity: 0.7; display: flex; align-items: center; }

            /* [VIP 樣式修正] 極簡化：無框、無星號、金色文字 */
            .my-wormhole-chip.vip {
                background: transparent;      /* 移除背景 */
                border: none;                 /* 移除外框 */
                color: #f0b232;               /* 金色文字 */
                padding: 2px 4px;             /* 縮小間距 */
                font-weight: bold;            /* 加粗 */
                box-shadow: none;             /* 移除陰影 */
            }
            .my-wormhole-chip.vip:hover {
                background: rgba(240, 178, 50, 0.1); /* Hover 時給一點點金色背景 */
                color: #ffd700;
                transform: translateY(-1px);
            }
            /* VIP 模式下強制隱藏圖示 */
            .my-wormhole-chip.vip .my-wormhole-icon {
                display: none;
            }

            /* 群組樣式 (若您有實作群組功能) */
            .my-wormhole-group-chip {
                background: rgba(43, 45, 49, 0.8);
                border: 1px dashed rgba(255,255,255,0.2);
                color: #949ba4;
                font-size: 12px; padding: 2px 8px; border-radius: 4px;
                cursor: pointer; display: flex; align-items: center; gap: 4px;
                position: relative;
            }
            .my-wormhole-group-chip:hover { border-color: #dbdee1; color: #fff; }

            /* 群組下拉選單 */
            .my-wormhole-dropdown {
                position: absolute; top: 100%; left: 0;
                background: #1e1f22; border: 1px solid #000;
                border-radius: 4px; padding: 4px; z-index: 2000;
                box-shadow: 0 8px 16px rgba(0,0,0,0.5);
                display: flex; flex-direction: column; gap: 2px;
                min-width: 120px;
            }
        `;
    const styleEl = document.createElement("style");
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    // === 💾 2. 資料結構 ===
    const STORAGE_KEY = "discord_forward_v8";
    const PREF_KEY = "discord_forward_pref";
    function loadData() {
      return GMStore.get(STORAGE_KEY, []);
    }
    function saveData(data) {
      GMStore.set(STORAGE_KEY, data);
    }
    function loadDropdownMode() {
      return GMStore.get(PREF_KEY, true);
    }
    function saveDropdownMode(isDropdown) {
      GMStore.set(PREF_KEY, isDropdown);
    }

    // 輔助：判斷列類型 (User vs Channel)
    function getRowType(row) {
      if (!row) return "channel";
      // Discord 的用戶列表通常包含 avatar 或特定的 class
      const hasAvatar = row.querySelector('img[class*="avatar"]');
      const isFriend = row.className && row.className.includes("friend");
      // 簡單判斷：如果有頭像圖標通常是使用者
      return hasAvatar || isFriend ? "user" : "channel";
    }

    function upsertData(channel, server, options = {}, type = "channel") {
      let data = loadData();
      let item = data.find(
        (i) => i.channel === channel && i.server === server && i.type === type,
      );

      if (!item) {
        const uniqueId = `${channel}::${server}::${Date.now()}`;
        item = {
          id: uniqueId,
          channel: channel,
          server: server,
          isStarred: false,
          lastUsed: 0,
          type: type,
          isNSFW: false,
        };
        data.push(item);
      } else {
        if (!item.type) item.type = "channel";
      }

      if (options.toggleStar) item.isStarred = !item.isStarred;
      if (options.updateTime) item.lastUsed = Date.now();
      if (options.forceStar !== undefined) item.isStarred = options.forceStar;
      if (options.isNSFW !== undefined) item.isNSFW = options.isNSFW;

      item.type = type;

      if (!item.isStarred && item.lastUsed === 0) {
        data = data.filter((i) => i.id !== item.id);
      }

      saveData(data);
      refreshUI();
      refreshListIcons();
    }

    function removeData(channel, server, skipRefresh = false) {
      let data = loadData();
      data = data.filter(
        (i) => !(i.channel === channel && i.server === server),
      );
      saveData(data);
      if (!skipRefresh) {
        refreshUI();
        refreshListIcons();
      }
    }

    function isStarred(channel, server) {
      const item = loadData().find(
        (i) => i.channel === channel && i.server === server,
      );
      return item ? item.isStarred : false;
    }

    // === 🕵️‍♂️ 3. 類型偵測與輪詢 (Memory Leak Optimized) ===

    // 注意：全域點擊監聽已整合至下方 Event Delegation (capture phase)，此處不再重複註冊。

    // =====================
    // 輔助：等待元素出現 (帶超時銷毀機制 & cache)
    // =====================
    function waitForElement(selector, parent = document.body, timeout = 3000) {
      return new Promise((resolve) => {
        const element = parent.querySelector(selector);
        if (element) return resolve(element);

        const observer = new MutationObserver((mutations, obs) => {
          const el = parent.querySelector(selector);
          if (el) {
            obs.disconnect();
            resolve(el);
          }
        });
        observer.observe(parent, { childList: true, subtree: true });

        setTimeout(() => {
          observer.disconnect();
          console.warn(`[waitForElement] Timeout: ${selector} not found`);
          resolve(null);
        }, timeout);
      });
    }

    // =====================
    // 全域管理 observer
    // =====================
    const activeObservers = new WeakMap();
    // modal 的 debounce timer 改用 WeakMap 管理，避免 dataset 字串轉型與 modal 提前移除時存取異常
    const _injectTimers = new WeakMap();

    // =====================
    // 處理轉發視窗開啟邏輯
    // =====================
    async function handleForwardOpen() {
      DEBUG && console.log(
        "[ForwardingManager] Forward button clicked. Waiting for modal...",
      );

      // 等待對話框標題出現
      const modalTitle = await waitForElement('div[role="dialog"] h1');
      if (!modalTitle) return;

      const modal = modalTitle.closest('div[role="dialog"]');
      if (!modal) return;

      const text = modalTitle.innerText || "";
      if (!/Forward|轉發|转发|転送|전달/.test(text)) return;
      DEBUG && console.log("[ForwardingManager] Forward modal detected.");

      // 等待搜尋框存在
      const searchInput = await waitForElement(
        'input[placeholder^="Search"], input[placeholder^="搜尋"], input[placeholder^="検索"]',
        modal,
        2000,
      );
      if (searchInput) injectBarUI(searchInput, modal);

      // 立即注入一次星星
      injectListStars(modal);

      // 啟動局部 observer (避免重複)
      if (!activeObservers.has(modal)) {
        const listObserver = new MutationObserver((mutations) => {
          let shouldInject = false;
          for (const m of mutations) {
            if (m.addedNodes.length > 0) shouldInject = true;
          }
          if (shouldInject) {
            if (_injectTimers.has(modal))
              clearTimeout(_injectTimers.get(modal));
            _injectTimers.set(
              modal,
              setTimeout(() => injectListStars(modal), 120),
            ); // debounce 120ms
          }
        });

        listObserver.observe(modal, { childList: true, subtree: true });
        activeObservers.set(modal, listObserver);
        DEBUG &&
          console.log("[ForwardingManager] Local Observer attached to modal.");

        // 當 modal 被移除，自動銷毀 observer
        const removeObserver = new MutationObserver((mutations, obs) => {
          if (!document.body.contains(modal)) {
            listObserver.disconnect();
            activeObservers.delete(modal);
            obs.disconnect();
            DEBUG && console.log(
              "[ForwardingManager] Modal closed. Local Observer disconnected.",
            );
          }
        });
        removeObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
    }

    // =====================
    // 全域點擊監聽 (Event Delegation, capture phase)
    // =====================
    document.addEventListener(
      "click",
      (e) => {
        // 處理下拉選單關閉
        if (!e.target.closest(".dropdown-container-wrapper")) {
          document
            .querySelectorAll(".my-dropdown-menu")
            .forEach((m) => m.classList.remove("show"));
        }

        // 偵測轉發按鈕點擊
        const forwardBtn = e.target.closest(
          'div[aria-label="轉發"], div[aria-label="Forward"], div[aria-label="转发"], div[aria-label="転送"], div[aria-label="전달"]',
        );
        if (forwardBtn) handleForwardOpen();
      },
      true,
    );

    // =====================
    // 清理函數
    // =====================
    function cleanup() {
      searchTimers.forEach((timer) => clearTimeout(timer));
      searchTimers.clear();

      activeObservers.forEach((observer) => observer.disconnect());
      activeObservers.clear();

      DEBUG && console.log("[ForwardingManager] Cleanup complete");
    }
    // v1.7.0：改由 CleanupRegistry 集中清理
    CleanupRegistry.add(cleanup);

    // =====================
    // NSFW 檢測模組
    // =====================
    function isNSFWChannel(row) {
      try {
        const ariaLabel = row.getAttribute("aria-label") || "";
        if (/\b(nsfw|age-restricted|18\+|adult)\b/i.test(ariaLabel))
          return true;

        // 優先用 data 屬性或 class 標記
        const nsfwAttr = row.getAttribute("data-nsfw") || "";
        if (nsfwAttr.toLowerCase() === "true") return true;

        const badge = row.querySelector(
          'div[class*="badge"] svg, div[class*="icon"] svg',
        );
        if (badge) {
          const path = badge.querySelector("path");
          if (path) {
            const d = path.getAttribute("d") || "";
            if (d.includes("M18.09 1.63") || d.includes("1.43-.7 1.82 0"))
              return true;
          }
        }

        const textBadge = row.querySelector('[class*="badge"]');
        if (textBadge && /NSFW/i.test(textBadge.innerText)) return true;

        return false;
      } catch (error) {
        return false;
      }
    }

    // 使用 WeakMap 快取
    const nsfwCache = new WeakMap();
    function getCachedNSFWStatus(row) {
      if (nsfwCache.has(row)) return nsfwCache.get(row);
      const isNSFW = isNSFWChannel(row);
      nsfwCache.set(row, isNSFW);
      return isNSFW;
    }

    // === 🖥️ 4. UI 渲染 ===
    function truncateText(text, length = 5) {
      if (text.length <= length) return text;
      return text.substring(0, length) + "..";
    }

    function injectBarUI(searchInput, modal) {
      // 防止重複注入
      if (document.getElementById("my-pinned-bar")) return;

      const bar = document.createElement("div");
      bar.id = "my-pinned-bar";

      // 插入位置：搜尋欄上方 (或列表上方)
      const inputContainer = searchInput.parentElement;
      if (inputContainer) {
        inputContainer.before(bar);
        renderBarButtons(bar, modal);
        // 注意：這裡不再重複註冊 click listener
      }
    }

    function refreshUI() {
      const bar = document.getElementById("my-pinned-bar");
      const searchInput = document.querySelector(
        'input[placeholder="搜尋"], input[placeholder="Search"], input[placeholder*="Search"], input[placeholder*="検索"]',
      );
      if (bar && searchInput) {
        const modal = searchInput.closest('div[role="dialog"]');
        bar.innerHTML = "";
        renderBarButtons(bar, modal);
      }
    }

    // 顯示說明模態視窗
    function showHelpModal() {
      const existing = document.querySelector(".my-help-overlay");
      if (existing) existing.remove();

      const overlay = document.createElement("div");
      overlay.className = "my-help-overlay";
      overlay.innerHTML = `
                <div class="my-help-modal" onclick="event.stopPropagation()">
                    <div class="my-help-header">
                        <span>${t("fm_manual_title")}</span>
                        <button class="my-help-close" id="my-help-close-btn">×</button>
                    </div>
                    <div class="my-help-body">
                        <div class="help-section">
                            <div class="help-title">${t("fm_sec_star")}</div>
                            <div class="help-content">${t("fm_sec_star_content")}</div>
                        </div>
                        <div class="help-section">
                            <div class="help-title">${t("fm_sec_search")}</div>
                            <div class="help-content">${t("fm_sec_search_content")}</div>
                        </div>
                        <div class="help-section">
                            <div class="help-title">${t("fm_sec_fuzzy")}</div>
                            <div class="help-content">${t("fm_sec_fuzzy_content")}</div>
                        </div>
                        <div class="help-section">
                            <div class="help-title">${t("fm_sec_user")}</div>
                            <div class="help-content">${t("fm_sec_user_content")}</div>
                        </div>
                        <div class="help-section">
                            <div class="help-title" style="color:#b5bac1;">⚙️ ${t("fm_sec_misc_title") || "Tips"}</div>
                            <div class="help-content">${t("fm_sec_misc")}</div>
                        </div>
                    </div>
                </div>
            `;
      document.body.appendChild(overlay);
      document.getElementById("my-help-close-btn").onclick = () =>
        overlay.remove();
      overlay.onclick = () => overlay.remove();
    }

    function renderBarButtons(container, modal) {
      let data = loadData();
      let isDropdownMode = loadDropdownMode();

      const allStarred = data.filter((i) => i.isStarred);
      const starredChannels = allStarred.filter(
        (i) => !i.type || i.type === "channel",
      );
      const starredUsers = allStarred.filter((i) => i.type === "user");
      const historyList = data
        .filter((i) => !i.isStarred && (!i.type || i.type === "channel"))
        .sort((a, b) => b.lastUsed - a.lastUsed);

      // [左側] 切換模式按鈕
      if (starredChannels.length > 0) {
        const toggleBtn = document.createElement("button");
        toggleBtn.className = "my-btn btn-toggle-mode";
        toggleBtn.title = isDropdownMode
          ? t("fm_toggle_flat")
          : t("fm_toggle_drop");
        toggleBtn.innerHTML = isDropdownMode
          ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zM3 14h7v7H3v-7z"/></svg>`
          : `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"/></svg>`;
        toggleBtn.onclick = (e) => {
          e.stopPropagation();
          saveDropdownMode(!isDropdownMode);
          refreshUI();
        };
        container.appendChild(toggleBtn);
      }

      // 幫助按鈕
      const helpBtn = document.createElement("button");
      helpBtn.className = "my-btn btn-help";
      helpBtn.innerText = "❓";
      helpBtn.title = t("fm_help");
      helpBtn.onclick = (e) => {
        e.stopPropagation();
        showHelpModal();
      };
      container.appendChild(helpBtn);

      // 頻道渲染
      if (starredChannels.length > 0) {
        if (isDropdownMode) {
          renderDropdown(
            container,
            starredChannels,
            t("fm_pinned_channels"),
            "btn-star-main",
            modal,
            "channel",
          );
        } else {
          starredChannels.forEach((item) => {
            const btn = createBtn(
              item,
              "btn-star-item",
              `★ ${truncateText(item.channel)}`,
              modal,
              true,
              "channel",
            );
            btn.title = t("fm_tooltip_channel", {
              c: item.channel,
              s: item.server,
            });
            container.appendChild(btn);
          });
        }
      }

      if (starredChannels.length > 0 && historyList.length > 0) {
        const divider = document.createElement("div");
        divider.className = "my-divider";
        container.appendChild(divider);
      }

      // [中間] 歷史記錄
      historyList.forEach((item) => {
        const btn = createBtn(
          item,
          "btn-history-group",
          truncateText(item.channel),
          modal,
          false,
          "channel",
        );
        btn.title = t("fm_tooltip_channel", {
          c: item.channel,
          s: item.server,
        });
        container.appendChild(btn);
      });

      // [+] 新增
      const addBtn = document.createElement("button");
      addBtn.className = "my-btn btn-add";
      addBtn.innerText = "＋";
      addBtn.onclick = (e) => {
        e.stopPropagation();
        const term = prompt(t("fm_prompt_channel"));
        if (term && term.trim())
          upsertData(term.trim(), "", { updateTime: true }, "channel");
      };
      container.appendChild(addBtn);

      // [右側] 使用者專區
      const userDivider = document.createElement("div");
      userDivider.className = "my-divider";
      container.appendChild(userDivider);

      const userContainer = document.createElement("div");
      userContainer.id = "my-user-dropdown-container";
      userContainer.className = "dropdown-container-wrapper";
      userContainer.style.position = "relative";

      const userBtn = document.createElement("button");
      userBtn.className = `my-btn btn-user-zone ${starredUsers.length > 0 ? "has-items" : ""}`;
      userBtn.innerHTML = `👤`;
      userBtn.title = `${t("fm_user_zone")} (${starredUsers.length})`;
      userBtn.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll(".my-dropdown-menu").forEach((m) => {
          if (m.id !== "my-user-menu") m.classList.remove("show");
        });
        const menu = document.getElementById("my-user-menu");
        menu.classList.toggle("show");
      };

      const userMenu = document.createElement("div");
      userMenu.id = "my-user-menu";
      userMenu.className = "my-dropdown-menu";

      if (starredUsers.length === 0) {
        const emptyTip = document.createElement("div");
        emptyTip.style.padding = "8px";
        emptyTip.style.color = "#888";
        emptyTip.style.fontSize = "12px";
        emptyTip.innerText = t("fm_no_users");
        userMenu.appendChild(emptyTip);
      } else {
        starredUsers.forEach((item) => {
          const row = createDropdownItem(item, modal, "user");
          userMenu.appendChild(row);
        });
      }

      const addUserRow = document.createElement("div");
      addUserRow.className = "dropdown-item";
      addUserRow.style.justifyContent = "center";
      addUserRow.style.borderTop = "1px solid #3f4147";
      addUserRow.style.marginTop = "4px";
      addUserRow.innerHTML = `<span style="color:#2dc770">${t("fm_add_user")}</span>`;
      addUserRow.onclick = (e) => {
        e.stopPropagation();
        const term = prompt(t("fm_prompt_user"));
        if (term && term.trim())
          upsertData(
            term.trim(),
            "",
            { updateTime: true, forceStar: true },
            "user",
          );
      };
      userMenu.appendChild(addUserRow);
      userContainer.appendChild(userBtn);
      userContainer.appendChild(userMenu);
      container.appendChild(userContainer);
    }

    function renderDropdown(container, list, title, btnClass, modal, type) {
      const dropdownContainer = document.createElement("div");
      dropdownContainer.className = "dropdown-container-wrapper";
      dropdownContainer.style.position = "relative";

      const mainBtn = document.createElement("button");
      mainBtn.className = `my-btn ${btnClass}`;
      mainBtn.innerHTML = `<span>${escHtml(title)} (${list.length})</span> <span style="font-size:10px">▼</span>`; // [XSS-L0]
      mainBtn.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll(".my-dropdown-menu").forEach((m) => {
          if (m !== menuDiv) m.classList.remove("show");
        });
        menuDiv.classList.toggle("show");
      };

      const menuDiv = document.createElement("div");
      menuDiv.className = "my-dropdown-menu";
      list.forEach((item) => {
        const row = createDropdownItem(item, modal, type);
        menuDiv.appendChild(row);
      });
      dropdownContainer.appendChild(mainBtn);
      dropdownContainer.appendChild(menuDiv);
      container.appendChild(dropdownContainer);
    }

    function createDropdownItem(item, modal, type) {
      const row = document.createElement("div");
      row.className = "dropdown-item";
      const infoSpan = document.createElement("span");
      infoSpan.style.cssText =
        "flex: 1; display: flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden;";

      const iconSpan = document.createElement("span");
      iconSpan.innerHTML =
        type === "user" ? "👤" : '<span style="color:#f0b232">★</span>';
      iconSpan.style.flexShrink = "0";
      infoSpan.appendChild(iconSpan);

      const channelSpan = document.createElement("span");
      channelSpan.innerText = item.channel;
      channelSpan.className = "my-ellipsis";
      infoSpan.appendChild(channelSpan);

      if (type === "channel" && item.server) {
        const serverSpan = document.createElement("span");
        serverSpan.innerText = item.server;
        serverSpan.className = "my-ellipsis";
        serverSpan.style.cssText =
          "color: #949BA4; font-size: 11px; margin-left: 8px; opacity: 0.8; font-weight: normal;";
        infoSpan.appendChild(serverSpan);
      }
      row.appendChild(infoSpan);

      if (type === "channel") {
        const fuzzyBtn = createSubBtn(
          "⏎",
          t("fm_fuzzy"),
          modal,
          item,
          true,
          type,
        );
        fuzzyBtn.style.flexShrink = "0";
        row.appendChild(fuzzyBtn);
      }

      if (item.isNSFW) {
        const nsfwBadge = document.createElement("span");
        nsfwBadge.innerText = "NSFW";
        nsfwBadge.style.cssText =
          "font-size: 9px; color: #ed4245; background: rgba(237, 66, 69, 0.1); border: 1px solid rgba(237, 66, 69, 0.4); border-radius: 3px; padding: 0 4px; height: 16px; display: flex; align-items: center; justify-content: center; margin-left: 6px; font-weight: 600; letter-spacing: 0.5px; flex-shrink: 0;";
        row.appendChild(nsfwBadge);
      }

      row.onclick = (e) => {
        e.stopPropagation();
        if (type === "channel")
          document
            .querySelectorAll(".my-sub-btn")
            .forEach((b) => b.classList.remove("is-active"));
        performTwoStepSearch(modal, item.channel, item.server, type);
        upsertData(item.channel, item.server, { updateTime: true }, type);
        row.parentElement.classList.remove("show");
      };

      row.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          removeData(item.channel, item.server, true);
          row.style.transition = "opacity 0.2s, transform 0.2s";
          row.style.opacity = "0";
          row.style.transform = "translateX(-10px)";
          setTimeout(() => {
            row.remove();
            const menu = row.closest(".my-dropdown-menu");
            if (menu && menu.querySelectorAll(".dropdown-item").length === 0) {
              const emptyTip = document.createElement("div");
              emptyTip.style.cssText =
                "padding: 12px; color: #888; text-align: center; font-size: 13px;";
              emptyTip.innerText =
                type === "user" ? t("fm_no_users") : "已清空收藏";
              menu.appendChild(emptyTip);
            }
          }, 200);
        } else {
          dmtConfirm(t("fm_remove_confirm", { target: item.channel }), { danger: true })
            .then((ok) => { if (ok) removeData(item.channel, item.server); });
        }
      };
      return row;
    }

    // === 兩段式搜尋 + Debounce ===
    function performTwoStepSearch(modal, fullTerm, server, type) {
      if (searchTimers.has(modal)) clearTimeout(searchTimers.get(modal));

      const searchInput = modal.querySelector(
        'input[placeholder="搜尋"], input[placeholder="Search"], input[placeholder*="Search"], input[placeholder*="検索"]',
      );
      if (!searchInput) {
        console.warn("[Search] Input not found");
        return;
      }

      const warmUpTerm = fullTerm.substring(0, 2);
      setNativeValue(searchInput, warmUpTerm);
      DEBUG && console.log(`[Search] Step 1: Warm-up with "${warmUpTerm}"`);

      const timer = setTimeout(() => {
        setNativeValue(searchInput, fullTerm);
        DEBUG && console.log(`[Search] Step 2: Full term "${fullTerm}"`);
        setTimeout(() => {
          applyFilter(modal, fullTerm, server, type, true);
          searchTimers.delete(modal);
        }, 200);
      }, 250);
      searchTimers.set(modal, timer);
    }

    function createBtn(item, className, text, modal, allowFuzzy, type) {
      const btn = document.createElement("button");
      btn.className = `my-btn ${className}`;
      const textSpan = document.createElement("span");
      textSpan.innerText = text;
      btn.appendChild(textSpan);

      if (className.includes("btn-star-item") && item.server) {
        const serverSpan = document.createElement("span");
        serverSpan.innerText = item.server;
        serverSpan.style.cssText =
          "color: #949BA4; font-size: 11px; margin-left: 6px; font-weight: normal; opacity: 0.8;";
        btn.appendChild(serverSpan);
      }

      if (allowFuzzy && type === "channel") {
        const fuzzyBtn = createSubBtn(
          "⏎",
          t("fm_fuzzy"),
          modal,
          item,
          true,
          type,
        );
        btn.appendChild(fuzzyBtn);
      }

      btn.onclick = (e) => {
        e.stopPropagation();
        if (type === "channel")
          document
            .querySelectorAll(".my-sub-btn")
            .forEach((b) => b.classList.remove("is-active"));
        performTwoStepSearch(modal, item.channel, item.server, type);
        upsertData(item.channel, item.server, { updateTime: true }, type);
      };
      btn.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          removeData(item.channel, item.server);
        } else {
          dmtConfirm(t("fm_remove_confirm", { target: item.channel }), { danger: true })
            .then((ok) => { if (ok) removeData(item.channel, item.server); });
        }
      };
      return btn;
    }

    function createSubBtn(text, title, modal, item, isFuzzy, type) {
      const btn = document.createElement("span");
      btn.className = "my-sub-btn";
      btn.innerText = text;
      btn.title = title;
      btn.onclick = (e) => {
        e.stopPropagation();
        document
          .querySelectorAll(".my-sub-btn")
          .forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");

        let cleanName = item.channel.replace(/[\[\]「」()]/g, "");
        let fuzzyTerm = "";
        let parts = cleanName.split(/[-_\s]+/);
        if (parts.length > 1) fuzzyTerm = parts[0];
        else fuzzyTerm = cleanName.substring(0, 2);
        DEBUG && console.log(`[Fuzzy Search] Using term: "${fuzzyTerm}"`);

        const searchInput = modal.querySelector(
          'input[placeholder*="Search"], input[placeholder*="搜尋"], input[placeholder*="検索"]',
        );
        if (searchInput) {
          setNativeValue(searchInput, fuzzyTerm);
          searchInput.focus();
          setTimeout(() => {
            applyFilter(modal, fuzzyTerm, "", type, false);
          }, 150);
        }
      };
      return btn;
    }

    // === 5. 列表圖示分流 & 使用者前綴 ===
    function injectListStars(modal) {
      const listItems = modal.querySelectorAll('div[role="listitem"]');
      listItems.forEach((row) => {
        const rowType = getRowType(row);
        if (rowType === "user") {
          const nameStrong = row.querySelector("strong");
          if (nameStrong && !nameStrong.classList.contains("my-user-tagged")) {
            nameStrong.classList.add("my-user-tagged");
            nameStrong.setAttribute("data-user-tagged", "true");
          }
        }
        if (row.querySelector(".my-list-action-btn")) return;
        const nameEl = row.querySelector("strong");
        if (!nameEl) return;

        // 獲取伺服器名稱與頻道名稱
        const channelName = nameEl.innerText;
        let serverName = "";
        const subtitle = row.querySelector(
          '[class*="subtitle"], [class*="subText"], [data-list-item-subtitle]',
        );
        if (subtitle) serverName = subtitle.textContent.trim();
        else if (row.innerText.includes("\n")) {
          const lines = row.innerText
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s);
          if (lines.length >= 2 && lines[0] === channelName && lines[1])
            serverName = lines[1];
        }
        if (!serverName) {
          const aria = row.getAttribute("aria-label");
          if (aria && aria.includes(",")) {
            const parts = aria.split(",");
            if (parts.length > 1) serverName = parts[parts.length - 1].trim();
          }
        }

        const iconWrapper = row.querySelector('div[class*="iconWrapper"]');
        if (iconWrapper) {
          const actionBtn = document.createElement("button");
          actionBtn.className = "my-list-action-btn";
          if (rowType === "user") {
            actionBtn.classList.add("my-list-user-btn");
            actionBtn.title = t("fm_tooltip_user_add");
          } else {
            actionBtn.classList.add("my-list-star-btn");
            actionBtn.title = t("fm_tooltip_star_add");
          }

          updateRowIcon(actionBtn, channelName, serverName, rowType);

          actionBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const currentServer = serverName;
            const isNSFW = isNSFWChannel(row);
            upsertData(
              channelName,
              currentServer,
              { toggleStar: true, isNSFW: isNSFW },
              rowType,
            );
            updateRowIcon(actionBtn, channelName, currentServer, rowType);
          };
          iconWrapper.after(actionBtn);
        }
      });
    }

    function updateRowIcon(btn, channel, server, type) {
      const isAdded = isStarred(channel, server);
      if (type === "user") {
        if (isAdded) {
          btn.classList.add("is-active");
          btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`;
        } else {
          btn.classList.remove("is-active");
          btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>`;
        }
      } else {
        if (isAdded) {
          btn.classList.add("is-active");
          btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
        } else {
          btn.classList.remove("is-active");
          btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        }
      }
    }

    function refreshListIcons() {
      const modal = document.querySelector('div[role="dialog"]');
      if (!modal) return;
      const btns = modal.querySelectorAll(".my-list-action-btn");
      btns.forEach((btn) => {
        const row = btn.closest('div[role="listitem"]');
        const nameEl = row.querySelector("strong");
        const subLabel = row.querySelector('div[class*="subLabel"]');
        const rowType = getRowType(row);
        if (nameEl) {
          const sName = subLabel ? subLabel.innerText : "";
          const cName = nameEl.innerText;
          updateRowIcon(btn, cName, sName, rowType);
        }
      });
    }

    // === 核心：輸入法 ===
    function setNativeValue(element, value) {
      const valueSetter = Object.getOwnPropertyDescriptor(element, "value").set;
      const prototype = Object.getPrototypeOf(element);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(
        prototype,
        "value",
      ).set;
      if (valueSetter && valueSetter !== prototypeValueSetter)
        prototypeValueSetter.call(element, value);
      else valueSetter.call(element, value);
      element.focus();
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    }

    function applyFilter(
      modal,
      channelTerm,
      serverTerm,
      targetType = "channel",
      isExactMatch = false,
    ) {
      let checks = 0;
      const maxChecks = targetType === "user" ? 60 : 30;
      const interval = setInterval(() => {
        checks++;
        if (checks > maxChecks) clearInterval(interval);
        const listItems = modal.querySelectorAll('div[role="listitem"]');
        for (let row of listItems) {
          const currentRowType = getRowType(row);
          if (targetType !== currentRowType) {
            row.classList.add("my-ghost-row");
            row.classList.remove("my-target-row");
            continue;
          } else {
            row.classList.remove("my-ghost-row");
            row.classList.add("my-target-row");
          }

          const nameEl = row.querySelector("strong");
          const subLabel = row.querySelector('div[class*="subLabel"]');
          const checkbox = row.querySelector('div[class*="checkbox"]');
          const isChecked = row.getAttribute("aria-selected") === "true";
          if (nameEl && checkbox) {
            const currentChannel = nameEl.innerText;
            const currentServer = subLabel ? subLabel.innerText : "";
            let matchChannel = false;
            if (targetType === "user") {
              const term = channelTerm.toLowerCase();
              matchChannel =
                currentChannel.toLowerCase().includes(term) ||
                currentServer.toLowerCase().includes(term);
            } else {
              if (isExactMatch) {
                matchChannel = currentChannel === channelTerm;
              } else {
                const searchParts = channelTerm
                  .split(" ")
                  .filter((s) => s.length > 0);
                matchChannel = searchParts.every((part) =>
                  currentChannel.toLowerCase().includes(part.toLowerCase()),
                );
              }
            }
            const matchServer =
              serverTerm === "" || currentServer === serverTerm;

            if (matchChannel && matchServer) {
              if (!isChecked) {
                checkbox.click();
                setTimeout(() => {
                  if (row.getAttribute("aria-selected") !== "true")
                    checkbox.click();
                }, 300);
              }
              const originalBg = row.style.backgroundColor;
              row.style.transition = "background 0.2s";
              row.style.backgroundColor = "rgba(240, 178, 50, 0.3)";
              setTimeout(() => {
                row.style.backgroundColor = originalBg;
              }, 400);
              clearInterval(interval);
              return;
            }
          }
        }
      }, 100);
    }
  }

  // =========================================================================================
  // 模組 B ── Message Utility · 訊息工具箱 (initMessageUtility v20.1)
  // 功能: 懸停複製選單、圖片批次下載(ZIP)、網址互轉(Twitter/X/Pixiv/IG等)、移除追蹤參數
  // =========================================================================================
  function initMessageUtility() {
    DEBUG && console.log("[Discord Utilities] Initializing Message Utility...");
    const BUTTON_TOP = -9;
    const BUTTON_RIGHT = 230;
    // Global State for Hover Logic
    let globalCloseTimer = null;
    let globalActiveDropdown = null;

    // 取得共享設定
    let config = getConfig();

    // --- 歡迎 / 語言選擇面板 ---
    function showLanguageSelector() {
      if (document.getElementById("msg-copy-lang-overlay")) return;
      const overlay = document.createElement("div");
      overlay.id = "msg-copy-lang-overlay";
      overlay.style.cssText = `
        position:fixed; inset:0; z-index:2147483647;
        background:rgba(0,0,0,0.55);
        backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
        display:flex; align-items:center; justify-content:center;
        font-family:sans-serif;
        animation:lgFadeIn 0.2s ease;
      `;

      // 注入動畫 keyframe
      const animStyle = document.createElement("style");
      animStyle.textContent = `
        @keyframes lgFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes lgSlideUp{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}
        #msg-copy-lang-overlay button.lang-btn {
          padding:9px 18px; font-size:13.5px; cursor:pointer; font-weight:500;
          background:rgba(255,255,255,0.07); color:#e3e5e8;
          border:1px solid rgba(255,255,255,0.13); border-radius:10px;
          transition:all 0.18s ease; backdrop-filter:blur(4px);
          letter-spacing:0.01em;
        }
        #msg-copy-lang-overlay button.lang-btn:hover {
          background:rgba(88,101,242,0.45); border-color:rgba(88,101,242,0.7);
          color:#fff; transform:translateY(-2px);
          box-shadow:0 4px 16px rgba(88,101,242,0.3);
        }
        #msg-copy-lang-overlay button.lang-btn:active {
          transform:translateY(0); box-shadow:none;
        }
      `;
      document.head.appendChild(animStyle);

      const container = document.createElement("div");
      container.style.cssText = `
        background:rgba(32,34,37,0.82);
        backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px);
        border:1px solid rgba(255,255,255,0.10);
        box-shadow:0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset;
        border-radius:20px; padding:32px 28px 24px;
        text-align:center; max-width:90%; width:520px;
        position:relative; color:#fff;
        animation:lgSlideUp 0.22s cubic-bezier(.19,1,.22,1);
      `;

      const closeBtn = document.createElement("button");
      closeBtn.innerText = "✕";
      closeBtn.style.cssText = `
        position:absolute; top:14px; right:16px;
        background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12);
        border-radius:50%; width:28px; height:28px;
        color:#aaa; font-size:14px; cursor:pointer; line-height:1;
        transition:all 0.15s ease; display:flex; align-items:center; justify-content:center;
      `;
      closeBtn.onmouseenter = () => {
        closeBtn.style.background = "rgba(237,66,69,0.3)";
        closeBtn.style.color = "#fff";
      };
      closeBtn.onmouseleave = () => {
        closeBtn.style.background = "rgba(255,255,255,0.08)";
        closeBtn.style.color = "#aaa";
      };
      closeBtn.onclick = () => {
        overlay.remove();
        animStyle.remove();
      };
      container.appendChild(closeBtn);

      const welcome = document.createElement("h2");
      welcome.innerText = t("welcome_title", { script: SCRIPT_NAME });
      welcome.style.cssText =
        "margin:0 0 6px; font-size:20px; font-weight:700; color:#fff; letter-spacing:-0.01em;";

      const subtitle = document.createElement("p");
      subtitle.innerText = t("select_lang_subtitle");
      subtitle.style.cssText =
        "margin:0 0 20px; color:rgba(255,255,255,0.45); font-size:13px;";

      // 安全提示框（毛玻璃版）
      const noticeBox = document.createElement("div");
      noticeBox.style.cssText = `
        background:rgba(237,66,69,0.10);
        border:1px solid rgba(237,66,69,0.30);
        border-radius:12px; padding:14px 16px; margin-bottom:22px; text-align:left;
      `;
      const noticeTitle = document.createElement("h3");
      noticeTitle.innerText = t("security_notice_title");
      noticeTitle.style.cssText =
        "color:#f87171; margin:0 0 7px; font-size:14px; font-weight:600; display:flex; align-items:center; gap:6px;";
      const noticeContent = document.createElement("p");
      noticeContent.innerText = t("security_notice_content");
      noticeContent.style.cssText =
        "color:rgba(255,255,255,0.7); font-size:12.5px; line-height:1.6; margin:0; white-space:pre-line;";
      noticeBox.appendChild(noticeTitle);
      noticeBox.appendChild(noticeContent);

      container.appendChild(welcome);
      container.appendChild(subtitle);
      container.appendChild(noticeBox);

      // 語言按鈕區
      const btnContainer = document.createElement("div");
      btnContainer.style.cssText =
        "display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-bottom:12px;";

      Object.keys(TRANSLATIONS)
        .filter((lc) => lc !== "custom")
        .forEach((langCode) => {
          const btn = document.createElement("button");
          btn.className = "lang-btn";
          btn.innerText = TRANSLATIONS[langCode].name;
          btn.onclick = () => {
            config.lang = langCode;
            localStorage.setItem("copyMenuLanguage", langCode);
            overlay.remove();
            animStyle.remove();
            dmtConfirm(t("reload_confirm")).then((ok) => { if (ok) location.reload(); });
          };
          btnContainer.appendChild(btn);
        });

      // 自定義語言按鈕
      const customLangBtn = document.createElement("button");
      customLangBtn.className = "lang-btn";
      customLangBtn.innerText = "🌐 " + (_customLangData?.name || "Custom");
      btnContainer.appendChild(customLangBtn);

      container.appendChild(btnContainer);

      // 自定義語言子面板
      const customPanel = document.createElement("div");
      customPanel.style.cssText = `
        display:none;
        background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.10);
        border-radius:12px; padding:16px; margin-bottom:10px; text-align:left;
      `;

      const customTitle = document.createElement("p");
      customTitle.style.cssText =
        "margin:0 0 10px; color:rgba(255,255,255,0.75); font-size:13px; line-height:1.6;";
      customTitle.innerHTML = `<b style="color:#5865F2">🌐 Custom</b><br>${t("custom_lang_desc")}`;
      customPanel.appendChild(customTitle);

      const customBtnRow = document.createElement("div");
      customBtnRow.style.cssText =
        "display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;";

      const exportBtn = document.createElement("button");
      exportBtn.innerText = t("custom_lang_export");
      exportBtn.style.cssText = `
        padding:7px 16px; font-size:13px; cursor:pointer;
        background:rgba(59,165,92,0.25); color:#3ba55c;
        border:1px solid rgba(59,165,92,0.4); border-radius:8px; transition:all 0.15s;
      `;
      exportBtn.onmouseenter = () => {
        exportBtn.style.background = "rgba(59,165,92,0.4)";
        exportBtn.style.color = "#fff";
      };
      exportBtn.onmouseleave = () => {
        exportBtn.style.background = "rgba(59,165,92,0.25)";
        exportBtn.style.color = "#3ba55c";
      };
      exportBtn.onclick = () => {
        const exportData = {
          _note:
            "Translate the VALUES only. Do NOT change the KEYS. Keep {placeholders} like {n} {s} {t} untouched. Preserve HTML tags and class='...' attributes as-is. The 'name' field will be shown in the language selector.",
          name: "My Custom Language",
        };
        const enTranslations = TRANSLATIONS["en"];
        for (const key of Object.keys(enTranslations)) {
          if (key !== "name") exportData[key] = enTranslations[key];
        }
        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "discord-toolkit-custom-lang.json";
        a.click();
        URL.revokeObjectURL(url);
      };
      customBtnRow.appendChild(exportBtn);

      const importBtn = document.createElement("button");
      importBtn.innerText = t("custom_lang_import");
      importBtn.style.cssText = `
        padding:7px 16px; font-size:13px; cursor:pointer;
        background:rgba(88,101,242,0.25); color:#7289da;
        border:1px solid rgba(88,101,242,0.4); border-radius:8px; transition:all 0.15s;
      `;
      importBtn.onmouseenter = () => {
        importBtn.style.background = "rgba(88,101,242,0.45)";
        importBtn.style.color = "#fff";
      };
      importBtn.onmouseleave = () => {
        importBtn.style.background = "rgba(88,101,242,0.25)";
        importBtn.style.color = "#7289da";
      };

      const importArea = document.createElement("div");
      importArea.style.cssText = "display:none; margin-top:10px;";

      const importTextarea = document.createElement("textarea");
      importTextarea.placeholder = t("custom_lang_paste_hint");
      importTextarea.style.cssText = `
        width:100%; min-height:120px;
        background:rgba(0,0,0,0.3); color:#dcddde;
        border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px;
        font-size:12px; font-family:monospace; resize:vertical; box-sizing:border-box;
      `;
      const importError = document.createElement("p");
      importError.style.cssText =
        "color:#ed4245; font-size:12px; margin:4px 0 0; display:none;";

      const importConfirmBtn = document.createElement("button");
      importConfirmBtn.innerText = t("custom_lang_apply");
      importConfirmBtn.style.cssText = `
        margin-top:8px; padding:7px 14px; font-size:13px; cursor:pointer;
        background:rgba(88,101,242,0.4); color:#fff;
        border:1px solid rgba(88,101,242,0.5); border-radius:8px; transition:all 0.15s;
      `;
      importConfirmBtn.onmouseenter = () => {
        importConfirmBtn.style.background = "rgba(88,101,242,0.7)";
      };
      importConfirmBtn.onmouseleave = () => {
        importConfirmBtn.style.background = "rgba(88,101,242,0.4)";
      };
      importConfirmBtn.onclick = () => {
        try {
          const parsed = JSON.parse(importTextarea.value.trim());
          if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null)
            throw new Error("must be a plain JSON object");
          // [Opt v1.6.7 ⑧] 值型別驗證：所有 key 的 value 必須為 string（或 null 跳過）
          const invalidKeys = Object.entries(parsed).filter(
            ([k, v]) => k !== "_note" && v !== null && typeof v !== "string"
          );
          if (invalidKeys.length > 0) {
            throw new Error(
              `non-string values found in keys: ${invalidKeys.map(([k]) => k).slice(0, 5).join(", ")}${invalidKeys.length > 5 ? "…" : ""}`
            );
          }
          delete parsed["_note"];
          localStorage.setItem(
            "copyMenuLanguage_custom",
            JSON.stringify(parsed),
          );
          localStorage.setItem("copyMenuLanguage", "custom");
          _customLangData = parsed;
          overlay.remove();
          animStyle.remove();
          location.reload();
        } catch (err) {
          importError.textContent = t("custom_lang_json_error", {
            msg: err.message,
          });
          importError.style.display = "block";
        }
      };
      importArea.appendChild(importTextarea);
      importArea.appendChild(importError);
      importArea.appendChild(importConfirmBtn);

      importBtn.onclick = () => {
        importArea.style.display =
          importArea.style.display === "none" ? "block" : "none";
        importError.style.display = "none";
      };
      customBtnRow.appendChild(importBtn);

      customPanel.appendChild(customBtnRow);
      customPanel.appendChild(importArea);

      if (_customLangData) {
        const langName = _customLangData.name || "Custom";
        const statusRow = document.createElement("p");
        statusRow.style.cssText =
          "margin:10px 0 0; color:#3ba55c; font-size:12px;";
        statusRow.innerHTML = t("custom_lang_loaded", {
          name: `<b>${escHtml(langName)}</b>`,
        });

        const activateBtn = document.createElement("button");
        activateBtn.innerText = t("custom_lang_activate", { name: langName });
        activateBtn.style.cssText = `
          display:block; margin-top:6px; padding:7px 14px; font-size:12px; cursor:pointer;
          background:rgba(88,101,242,0.35); color:#fff;
          border:1px solid rgba(88,101,242,0.5); border-radius:8px; transition:all 0.15s;
        `;
        activateBtn.onmouseenter = () => {
          activateBtn.style.background = "rgba(88,101,242,0.6)";
        };
        activateBtn.onmouseleave = () => {
          activateBtn.style.background = "rgba(88,101,242,0.35)";
        };
        activateBtn.onclick = () => {
          localStorage.setItem("copyMenuLanguage", "custom");
          overlay.remove();
          animStyle.remove();
          location.reload();
        };
        customPanel.appendChild(statusRow);
        customPanel.appendChild(activateBtn);
      }

      customLangBtn.onclick = () => {
        const isOpen = customPanel.style.display !== "none";
        customPanel.style.display = isOpen ? "none" : "block";
      };

      container.appendChild(customPanel);

      // Help Button
      const helpBtn = document.createElement("button");
      helpBtn.innerText = t("help_btn");
      helpBtn.style.cssText =
        "background:none; border:none; color:rgba(255,255,255,0.35); cursor:pointer; font-size:12px; text-decoration:underline; margin-top:4px;";
      helpBtn.onmouseenter = () => {
        helpBtn.style.color = "#3ba55c";
      };
      helpBtn.onmouseleave = () => {
        helpBtn.style.color = "rgba(255,255,255,0.35)";
      };
      helpBtn.onclick = () => {
        // 精美說明書 overlay（取代舊版 alert）
        const existingManual = document.getElementById("msg-manual-overlay");
        if (existingManual) {
          existingManual.remove();
          return;
        }

        const manualOverlay = document.createElement("div");
        manualOverlay.id = "msg-manual-overlay";
        manualOverlay.style.cssText = `
          position:fixed; inset:0; z-index:2147483647;
          background:rgba(0,0,0,.82);
          display:flex; align-items:center; justify-content:center;
        `;

        const modal = document.createElement("div");
        modal.style.cssText = `
          background:#2b2d31; border:1px solid rgba(255,255,255,.12); border-radius:12px;
          box-shadow:0 20px 60px rgba(0,0,0,.8); width:min(640px,92vw);
          max-height:85vh; display:flex; flex-direction:column; overflow:hidden;
          animation:mmIn .18s cubic-bezier(.19,1,.22,1);
        `;

        const style = document.createElement("style");
        style.textContent = `
          #msg-manual-overlay [data-ss-preserve]{will-change:transform!important;transform:translateZ(0)!important;contain:paint style!important}
          @keyframes mmIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
          #msg-manual-overlay .mm-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
          #msg-manual-overlay .mm-title{color:#e3e5e8;font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px}
          #msg-manual-overlay .mm-close{background:transparent;border:none;color:#72767d;font-size:20px;cursor:pointer;padding:2px 7px;border-radius:4px;line-height:1}
          #msg-manual-overlay .mm-close:hover{color:#fff;background:rgba(255,255,255,.08)}
          #msg-manual-overlay .mm-body{overflow-y:scroll;padding:16px 18px;display:flex;flex-direction:column;gap:14px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;transform:translateZ(0);will-change:transform;contain:paint style}
          #msg-manual-overlay .mm-section{border-radius:7px;padding:11px 14px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025)}
          #msg-manual-overlay .mm-section.accent-blue{background:rgba(88,101,242,.07);border-color:rgba(88,101,242,.22)}
          #msg-manual-overlay .mm-section.accent-green{background:rgba(35,165,90,.06);border-color:rgba(35,165,90,.22)}
          #msg-manual-overlay .mm-section.accent-yellow{background:rgba(240,178,50,.06);border-color:rgba(240,178,50,.22)}
          #msg-manual-overlay .mm-section.accent-wormhole{background:rgba(88,101,242,.06);border-color:rgba(88,101,242,.2)}
          #msg-manual-overlay .mm-sec-title{font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:6px}
          #msg-manual-overlay .mm-sec-title.c-blue{color:#8891f7}
          #msg-manual-overlay .mm-sec-title.c-green{color:#2dc770}
          #msg-manual-overlay .mm-sec-title.c-yellow{color:#f0b232}
          #msg-manual-overlay .mm-sec-title.c-worm{color:#a5b4fc}
          #msg-manual-overlay .mm-sec-title.c-default{color:#b5bac1}
          #msg-manual-overlay .mm-content{font-size:13px;color:#dbdee1;line-height:1.75}
          #msg-manual-overlay .mm-content b{color:#fff}
          #msg-manual-overlay .mm-key{background:#1e1f22;padding:1px 6px;border-radius:4px;font-family:monospace;color:#eee;font-size:11px;border:1px solid #3f4147}
          #msg-manual-overlay .mm-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}
          #msg-manual-overlay .mm-row{display:flex;gap:6px;align-items:baseline}
          #msg-manual-overlay .mm-tag{background:rgba(88,101,242,.25);color:#a5b4fc;border-radius:3px;padding:0 5px;font-size:10px;font-weight:700;flex-shrink:0}
          #msg-manual-overlay .mm-tag.g{background:rgba(35,165,90,.25);color:#57f287}
          #msg-manual-overlay .mm-tag.y{background:rgba(240,178,50,.25);color:#f0b232}
        `;

        const sections = t("manual_content_sections");

        modal.innerHTML = `
          <div class="mm-header">
            <div class="mm-title">📖 ${t("help_btn")}</div>
            <button class="mm-close" id="mm-close-btn">✕</button>
          </div>
          <div class="mm-body" data-ss-preserve="1">${sections}</div>
        `;

        manualOverlay.appendChild(modal);
        document.head.appendChild(style);  // BUG FIX v1.8.3：style 原本未掛載，導致說明書無格式
        document.body.appendChild(manualOverlay);

        const close = () => {
          manualOverlay.remove();
          style.remove();
        };
        document.getElementById("mm-close-btn").onclick = close;
        manualOverlay.addEventListener("click", (e) => {
          if (e.target === manualOverlay) close();
        });
      };
      container.appendChild(helpBtn);

      overlay.appendChild(container);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          overlay.remove();
          animStyle.remove();
        }
      });
      document.body.appendChild(overlay);
    }

    GM_addStyle(`
    /* ── DMT Design Tokens (v1.7.1) ─────────────────────────────────────────────
       方向B：token 值優先引用 Discord 自身 CSS 變數，自動跟隨深色/淺色主題；
               無法取得時 fallback 至腳本內建的 Discord 深色預設值。
       方向A：所有靜態 CSS 區塊（模組B/C/D）的高頻硬編碼改為 var(--dmt-*) 引用。
       ── */
    :root {
      /* 背景層 */
      --dmt-bg-primary:   var(--background-secondary,      #2b2d31);
      --dmt-bg-surface:   var(--background-floating,       #2f3136);
      --dmt-bg-deep:      var(--background-tertiary,       #1e1f22);
      --dmt-bg-overlay:   var(--background-secondary-alt,  #313338);
      --dmt-bg-muted:     var(--interactive-muted,         #4f545c);

      /* 強調色 */
      --dmt-accent:       var(--brand-experiment,          #5865f2);

      /* 文字層 */
      --dmt-text-primary: var(--text-normal,               #dcddde);
      --dmt-text-bright:  var(--header-primary,            #dbdee1);
      --dmt-text-muted:   var(--text-muted,                #72767d);
      --dmt-text-subtle:  var(--text-secondary,            #b5bac1);

      /* 語意色（無 Discord 對應變數時直接 fallback） */
      --dmt-danger:       var(--button-danger-background,  #ed4245);
      --dmt-success:      var(--button-positive-background, #3ba55c);
      --dmt-gold:         #ffd700;  /* VIP / 星標專用，Discord 無對應 */
    }

    .msg-copy-btn {
        position: absolute;
        top: ${BUTTON_TOP}px;
        right: ${BUTTON_RIGHT}px;
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.6);
        font-size: 14px;
        padding: 2px 6px;
        border: 0.5px solid transparent;
        border-radius: 4px;
        cursor: pointer;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.2s, background 0.15s, border-color 0.15s, color 0.15s;
        pointer-events: auto !important;
        user-select: none;
        isolation: isolate;
        /* SVG 居中 */
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: visible;
    }

    .msg-copy-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    /* 選單開啟中：按鈕高亮，視覺確認 */
    .msg-copy-btn.dmt-active {
        background: rgba(88, 101, 242, 0.2);
        border-color: rgba(88, 101, 242, 0.45);
        color: #a5adfa;
        opacity: 1 !important;
    }

    /* ── 漣漪層（擴散感） ─────────────────────────────────────── */
    @keyframes dmt-ripple {
        0%   { transform: scale(0.5); opacity: 0.4; }
        70%  { opacity: 0.15; }
        100% { transform: scale(3.5); opacity: 0; }
    }
    .dmt-ripple {
        position: absolute;
        inset: 0;
        border-radius: 4px;
        background: rgba(88, 101, 242, 0.55);
        pointer-events: none;
        animation: dmt-ripple 0.42s cubic-bezier(0.25, 0, 0.55, 1) forwards;
    }

    /* ── 選單進場 / 退場 ──────────────────────────────────────── */
    @keyframes dmt-menu-in {
        0%   { opacity: 0; transform: scale(0.88) translateY(-6px); }
        65%  { opacity: 1; transform: scale(1.018) translateY(0);   }
        100% { opacity: 1; transform: scale(1)    translateY(0);    }
    }
    @keyframes dmt-menu-out {
        0%   { opacity: 1; transform: scale(1)   translateY(0); }
        100% { opacity: 0; transform: scale(0.9) translateY(-5px); }
    }
    .msg-copy-dropdown.dmt-entering {
        animation: dmt-menu-in 0.22s cubic-bezier(0.34, 1.15, 0.64, 1) forwards;
        transform-origin: top right;
    }
    .msg-copy-dropdown.dmt-leaving {
        animation: dmt-menu-out 0.14s ease-in forwards;
        transform-origin: top right;
        pointer-events: none;
    }

    /* ── 選單項目 stagger 淡入 ────────────────────────────────── */
    @keyframes dmt-item-in {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0);    }
    }
    .msg-copy-dropdown.dmt-entering > *:not(.msg-copy-header) {
        opacity: 0;
        animation: dmt-item-in 0.16s ease both;
    }
    .msg-copy-dropdown.dmt-entering > *:nth-child(2)  { animation-delay: 0.03s; }
    .msg-copy-dropdown.dmt-entering > *:nth-child(3)  { animation-delay: 0.06s; }
    .msg-copy-dropdown.dmt-entering > *:nth-child(4)  { animation-delay: 0.09s; }
    .msg-copy-dropdown.dmt-entering > *:nth-child(5)  { animation-delay: 0.12s; }
    .msg-copy-dropdown.dmt-entering > *:nth-child(6)  { animation-delay: 0.15s; }
    .msg-copy-dropdown.dmt-entering > *:nth-child(n+7){ animation-delay: 0.17s; }

    .msg-copy-container:hover .msg-copy-btn {
        opacity: 1;
    }

    .msg-copy-container:has(.bookmark-msg-btn) .msg-copy-btn {
        right: ${BUTTON_RIGHT + 34}px;
    }

    .msg-copy-dropdown {
        position: fixed;
        background: var(--dmt-bg-surface);
        border-radius: 4px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
        font-size: 14px;
        color: var(--dmt-text-primary);
        padding: 4px 0;
        display: none;
        flex-direction: column;
        z-index: 2147483647;
        min-width: 280px;
        backdrop-filter: blur(5px);
        overflow-y: auto;
        max-height: 70vh;
    }

    .msg-copy-dropdown::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }

    .msg-copy-dropdown::-webkit-scrollbar-track {
        background-color: var(--dmt-bg-primary);
        border-radius: 4px;
    }

    .msg-copy-dropdown::-webkit-scrollbar-thumb {
        background-color: var(--dmt-bg-deep);
        border-radius: 4px;
    }

    .msg-copy-dropdown button {
        background: none;
        border: none;
        color: var(--dmt-text-primary);
        text-align: left;
        padding: 6px 12px;
        cursor: pointer;
        width: 100%;
        user-select: none;
        transition: background 0.1s;
        flex-shrink: 0;
        position: relative;
    }

    .msg-copy-dropdown button:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .msg-copy-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        font-size: 12px;
        color: var(--dmt-text-muted);
        background: var(--dmt-bg-deep);
        user-select: none;
    }

    .msg-copy-header-left {
        font-weight: bold;
        color: var(--dmt-text-primary);
    }

    .msg-copy-header-right {
        display: flex;
        gap: 6px;
    }

    .msg-copy-header-icon {
        cursor: pointer;
        font-size: 14px;
        transition: color 0.2s;
        color: var(--dmt-text-muted);
        width: 18px;
        text-align: center;
    }

    .msg-copy-header-icon:hover {
        color: var(--dmt-text-primary);
    }

    .msg-copy-header-icon.active {
        color: #f1c40f;
        text-shadow: 0 0 5px rgba(241, 196, 15, 0.5);
    }

    .msg-copy-header-icon.active-green {
        color: var(--dmt-success);
        text-shadow: 0 0 5px rgba(59, 165, 92, 0.5);
    }

    /* § 10 — Gear New-dot wrapper */
    .dmt-gear-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
    .dmt-gear-dot {
        position: absolute;
        top: -3px;
        right: -4px;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #f23f43;
        border: 1.5px solid var(--dmt-bg-primary, #2b2d31);
        pointer-events: none;
        animation: dmt-dot-pulse 2s ease-in-out infinite;
    }
    @keyframes dmt-dot-pulse {
        0%, 100% { opacity: 1;   transform: scale(1);    }
        50%       { opacity: 0.6; transform: scale(0.85); }
    }

    .msg-copy-divider {
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
        margin: 6px 0;
        flex-shrink: 0;
    }

    /* Custom link edit button */
    .msg-copy-edit-btn {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        opacity: 0.5;
        font-size: 12px;
        cursor: pointer;
        padding: 2px;
    }

    .msg-copy-edit-btn:hover {
        opacity: 1;
        color: var(--dmt-text-primary);
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
    }

    /* Group Mode Submenus */
    .msg-copy-item-group {
        padding: 6px 12px;
        cursor: pointer;
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: var(--dmt-text-subtle);
        font-weight: bold;
    }

    .msg-copy-item-group:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--dmt-text-primary);
    }

    /* Floating Submenu Portal Style */
    .msg-copy-portal-menu {
        position: fixed;
        background: var(--dmt-bg-surface);
        border: 1px solid var(--dmt-bg-deep);
        min-width: 200px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
        border-radius: 4px;
        padding: 4px 0;
        z-index: 2147483648;
        display: flex;
        flex-direction: column;
    }

    .msg-copy-portal-menu button {
        background: none;
        border: none;
        color: var(--dmt-text-primary);
        text-align: left;
        padding: 6px 12px;
        cursor: pointer;
        width: 100%;
        user-select: none;
        transition: background 0.1s;
    }

    .msg-copy-portal-menu button:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    /* Manager Footer (Only for Symbols View) */
    .msg-copy-manage {
        font-size: 13px;
        color: var(--dmt-text-muted);
        padding: 4px 12px 6px 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        user-select: none;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
        background: var(--dmt-bg-surface);
        position: sticky;
        bottom: 0;
    }

    .msg-copy-manage button {
        font-size: 12px;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: var(--dmt-text-primary);
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
        width: auto;
    }

    .msg-copy-manage button:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    /* .msg-copy-toast は dmtShowToast に統合済み（v1.7.0）
       後方互換のためクラス定義は残すが、実体は #dmt-toast-singleton */
    .msg-copy-toast {
        display: none !important;
    }

    .msg-copy-fly-img {
        position: fixed;
        z-index: 2147483647;
        pointer-events: none;
        border-radius: 8px;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
        transition: all 0.8s cubic-bezier(0.19, 1, 0.22, 1);
        object-fit: cover;
    }

    @keyframes msg-sparkle-burst {
        0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
        }

        100% {
            transform: translate(var(--tx), var(--ty)) scale(0);
            opacity: 0;
        }
    }

    .msg-copy-sparkle {
        position: fixed;
        pointer-events: none;
        z-index: 2147483647;
        width: 6px;
        height: 6px;
        background: #FFF;
        border-radius: 50%;
        box-shadow: 0 0 4px #fff, 0 0 8px var(--dmt-accent);
        animation: msg-sparkle-burst 0.6s ease-out forwards;
    }

    .msg-copy-ghost-card {
        position: fixed;
        z-index: 2147483647;
        pointer-events: none;
        width: 60px;
        height: 80px;
        background: rgba(100, 100, 100, 0.5);
        border: 2px solid rgba(200, 200, 200, 0.8);
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
        transition: all 0.8s cubic-bezier(0.19, 1, 0.22, 1);
    }

    @keyframes slideInRight {
        from {
            transform: translateX(100px);
            opacity: 0;
        }

        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    /* ── Conv-Pref: ⚙ Gear Button (sibling of first convert button) ── */
    .dmt-conv-gear {
        display: inline-flex; align-items: center; justify-content: center;
        width: 28px; flex-shrink: 0; cursor: pointer;
        color: #72767d;
        border-left: 1px solid rgba(255,255,255,0.07);
        transition: color 0.15s, background 0.15s;
    }
    .dmt-conv-gear:hover { color: #fff; background: rgba(255,255,255,0.12); }
    /* 未點過時：藍色強調，引導使用者發現新功能 */
    .dmt-conv-gear.unseen { color: var(--dmt-accent, #5865f2); }

    /* NEW badge (紅點 + 脈衝) */
    .dmt-conv-gear-badge {
        position: absolute; top: -3px; right: -3px;
        width: 7px; height: 7px; border-radius: 50%;
        background: #ed4245;
        box-shadow: 0 0 0 1.5px var(--dmt-bg-primary, #2b2d31);
        animation: dmt-badge-pulse 2s ease-in-out infinite;
    }
    @keyframes dmt-badge-pulse {
        0%, 100% { transform: scale(1);   opacity: 1; }
        50%       { transform: scale(1.3); opacity: 0.7; }
    }

    /* ── Conv-Pref Panel ── */
    #dmt-conv-pref-panel {
        position: fixed; z-index: 2147483647;
        background: var(--dmt-bg-primary, #2b2d31);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px; padding: 0; min-width: 220px; max-width: 280px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.6);
        animation: dmt-panel-in 0.15s cubic-bezier(.19,1,.22,1);
        font-family: sans-serif; font-size: 13px; color: var(--dmt-text-primary, #dbdee1);
        overflow: hidden;
    }
    @keyframes dmt-panel-in {
        from { opacity: 0; transform: scale(0.94) translateY(-4px); }
        to   { opacity: 1; transform: none; }
    }
    #dmt-conv-pref-panel .dmt-cp-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 12px 6px; border-bottom: 1px solid rgba(255,255,255,0.08);
        font-weight: 700; font-size: 12px; text-transform: uppercase;
        letter-spacing: 0.5px; color: var(--dmt-text-muted, #72767d);
    }
    #dmt-conv-pref-panel .dmt-cp-close {
        cursor: pointer; opacity: 0.6; font-size: 14px; line-height: 1;
        padding: 2px 4px; border-radius: 3px;
        transition: opacity 0.15s, background 0.15s;
    }
    #dmt-conv-pref-panel .dmt-cp-close:hover { opacity: 1; background: rgba(255,255,255,0.1); }
    #dmt-conv-pref-panel .dmt-cp-body { padding: 6px 0 8px; max-height: 320px; overflow-y: auto; }
    #dmt-conv-pref-panel .dmt-cp-group-title {
        padding: 6px 12px 3px; font-size: 10px; font-weight: 800;
        text-transform: uppercase; letter-spacing: 0.6px;
        color: var(--dmt-accent, #5865f2);
    }
    #dmt-conv-pref-panel .dmt-cp-row {
        display: flex; align-items: center; gap: 8px;
        padding: 4px 12px; cursor: pointer;
        transition: background 0.12s;
    }
    #dmt-conv-pref-panel .dmt-cp-row:hover { background: rgba(255,255,255,0.06); }
    #dmt-conv-pref-panel .dmt-cp-row input[type=checkbox] {
        width: 14px; height: 14px; cursor: pointer; accent-color: var(--dmt-accent, #5865f2);
        flex-shrink: 0;
    }
    #dmt-conv-pref-panel .dmt-cp-hint {
        padding: 4px 12px 2px; font-size: 10px;
        color: var(--dmt-text-muted, #72767d); border-top: 1px solid rgba(255,255,255,0.06);
        margin-top: 4px; line-height: 1.5;
    }
    #dmt-conv-pref-panel .dmt-cp-reset {
        display: block; width: calc(100% - 24px); margin: 6px 12px 2px;
        padding: 4px 0; background: rgba(237,66,69,0.15); border: 1px solid rgba(237,66,69,0.3);
        border-radius: 4px; color: #f2a0a2; font-size: 11px; font-weight: 700;
        cursor: pointer; text-align: center; transition: background 0.15s;
    }
    #dmt-conv-pref-panel .dmt-cp-reset:hover { background: rgba(237,66,69,0.3); }`);

    // --- Global Menu Control ---
    function closeGlobalMenu() {
      if (globalActiveDropdown) {
        const dd = globalActiveDropdown;
        globalActiveDropdown = null;

        // 清除所有按鈕的 active 高亮
        document.querySelectorAll(".msg-copy-btn.dmt-active")
          .forEach((b) => b.classList.remove("dmt-active"));

        // 退場動畫：scale + 上移，結束後移除 DOM
        dd.classList.remove("dmt-entering");
        dd.classList.add("dmt-leaving");
        dd.addEventListener("animationend", () => {
          dd.remove();
          document
            .querySelectorAll(".msg-copy-portal-menu")
            .forEach((el) => el.remove());
        }, { once: true });

        // 防呆：若動畫不觸發（display:none 等邊緣情況），200ms 後強制移除
        setTimeout(() => { if (dd.isConnected) dd.remove(); }, 200);
      }
    }

    function scheduleCloseGlobalMenu() {
      if (config.triggerMode !== "hover") return;
      if (globalCloseTimer) clearTimeout(globalCloseTimer);
      globalCloseTimer = setTimeout(() => {
        closeGlobalMenu();
      }, 1500); // 1.5s tolerance
    }

    function cancelCloseGlobalMenu() {
      if (globalCloseTimer) {
        clearTimeout(globalCloseTimer);
        globalCloseTimer = null;
      }
    }

    // =============================================================
    // 整合工具 ── 設定匯出 / 匯入 (跨模組 A·B·C·D·E 全備份)
    // =============================================================

    function exportSettings() {
      // 1. 抓取 Module A 資料 (Forwarding)
      const forwardingData = GMStore.get("discord_forward_v8", []);

      // 2. 抓取 Module B 資料 (Config / localStorage)
      const configData = {
        lang: localStorage.getItem("copyMenuLanguage"),
        triggerMode: localStorage.getItem("copyTriggerMode"),
        menuStyle: localStorage.getItem("copyMenuStyle"),
        swapLogic: localStorage.getItem("copySwapLogic"),
        appendSpace: localStorage.getItem("copyAppendSpace"),
        appendNewLine: localStorage.getItem("copyAppendNewLine"),
        linkText: localStorage.getItem("copyLinkText"),
        symbols: JSON.parse(localStorage.getItem("copySymbols") || "[]"),
      };

      // 3. 抓取 Module C 資料 (Expressions)
      const moduleCData = {
        discord_emoji_favorites:    GMStore.get("discord_emoji_favorites",    [], true),
        discord_gif_favorites:      GMStore.get("discord_gif_favorites",      [], true),
        discord_sticker_favorites:  GMStore.get("discord_sticker_favorites",  [], true),
        discord_emoji_collections:  GMStore.get("discord_emoji_collections",  {}, true),
        discord_gif_collections:    GMStore.get("discord_gif_collections",    {}, true),
        discord_sticker_collections:GMStore.get("discord_sticker_collections",{}, true),
        discord_emoji_native_mode:  GMStore.get("discord_emoji_native_mode", true),
      };

      // 4. 抓取 Module D 資料 (Wormholes)
      const moduleDData = GMStore.get("discord_wormholes_v2", null);

      // 4-1. 抓取 Module D 偏好設定 (Wormhole Prefs / localStorage)
      const wormholePrefs = {
        wh_api_mode: localStorage.getItem("wh_api_mode"),
        wh_dock_position: localStorage.getItem("wh_dock_position"),
        wh_send_autoclose: GMStore.get("wh_send_autoclose", "true"),
        wh_send_goto: GMStore.get("wh_send_goto", "false"),
        wh_send_show_toast: GMStore.get("wh_send_show_toast", "true"),
        wormhole_focus_mode: localStorage.getItem("wormhole_focus_mode"),
        wormhole_focus_size: localStorage.getItem("wormhole_focus_size"),
      };

      // 5. 抓取 Module E 資料 (Header Mods / localStorage)
      const headerModPrefs = {
        antiHijack: localStorage.getItem("discord_header_mod_def_antiHijack"),
        concealName: localStorage.getItem("discord_header_mod_def_concealName"),
      };

      // 6. 抓取模組開關狀態
      const moduleToggles = {
        mod_forwarding:  localStorage.getItem("mod_forwarding"),
        mod_message:     localStorage.getItem("mod_message"),
        mod_emoji:       localStorage.getItem("mod_emoji"),
        mod_header:      localStorage.getItem("mod_header"),
        mod_wormhole:    localStorage.getItem("mod_wormhole"),
        mod_webhook:     localStorage.getItem("mod_webhook"),
        mod_urlchecker:  localStorage.getItem("mod_urlchecker"),
        mod_scout:       localStorage.getItem("mod_scout"),
        mod_blacklist:   localStorage.getItem("mod_blacklist"),
      };

      // 6-1. 抓取 Module F 資料 (Webhook)
      const webhookList = GMStore.get("discord_webhook_list", [], true);

      // 7. 抓取 Module A 顯示偏好 (Forwarding pref)
      const forwardingPref = GMStore.get("discord_forward_pref", true);

      // 7-1. 抓取 Module G 資料 (Channel Scout)
      const channelScoutData = {
        cs_custom_tags:    GMStore.get("cs_custom_tags",    [], true),
        cs_search_history: GMStore.get("cs_search_history", [], true),
      };

      // 7-2. 抓取 Module H 資料 (Blacklist / Mute)
      const blacklistData = GMStore.get("blacklist_users", [], true);

      // 8. 組合最終物件
      const data = {
        ver: "EX3", // 版本標記（EX3 新增 Module G/H 資料）
        config: configData,
        forwardingData: forwardingData,
        forwardingPref: forwardingPref,
        ...moduleCData,
        wormholes: moduleDData,
        wormholePrefs: wormholePrefs,
        headerModPrefs: headerModPrefs,
        moduleToggles: moduleToggles,
        webhookList: webhookList,
        channelScoutData: channelScoutData,
        blacklistData: blacklistData,
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `discord_utils_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    function importSettings() {
      const input = prompt(t("import_prompt"));
      if (!input) return;
      try {
        const data = JSON.parse(input);

        // --- 恢復 Config (Module B) ---
        if (Array.isArray(data.symbols)) {
          localStorage.setItem("copySymbols", JSON.stringify(data.symbols));
          config.symbols = data.symbols;
        }
        if (data.triggerMode)
          localStorage.setItem("copyTriggerMode", data.triggerMode);
        if (data.menuStyle)
          localStorage.setItem("copyMenuStyle", data.menuStyle);
        if (data.swapLogic)
          localStorage.setItem("copySwapLogic", data.swapLogic);
        if (data.appendSpace)
          localStorage.setItem("copyAppendSpace", data.appendSpace);
        if (data.appendNewLine)
          localStorage.setItem("copyAppendNewLine", data.appendNewLine);
        if (data.linkText !== undefined)
          localStorage.setItem("copyLinkText", data.linkText);

        // --- 恢復 Config 巢狀格式（EX2 格式）---
        if (data.config) {
          const c = data.config;
          if (c.lang) localStorage.setItem("copyMenuLanguage", c.lang);
          if (c.triggerMode)
            localStorage.setItem("copyTriggerMode", c.triggerMode);
          if (c.menuStyle) localStorage.setItem("copyMenuStyle", c.menuStyle);
          if (c.swapLogic != null)
            localStorage.setItem("copySwapLogic", c.swapLogic);
          if (c.appendSpace != null)
            localStorage.setItem("copyAppendSpace", c.appendSpace);
          if (c.appendNewLine != null)
            localStorage.setItem("copyAppendNewLine", c.appendNewLine);
          if (c.linkText !== undefined)
            localStorage.setItem("copyLinkText", c.linkText);
          if (Array.isArray(c.symbols)) {
            localStorage.setItem("copySymbols", JSON.stringify(c.symbols));
            config.symbols = c.symbols;
          }
        }

        // --- 恢復 Forwarding (Module A) ---
        if (data.forwardingData) {
          GMStore.set("discord_forward_v8", data.forwardingData);
        }
        if (data.forwardingPref != null) {
          GMStore.set("discord_forward_pref", data.forwardingPref);
        }

        // --- 恢復 Expressions (Module C) ---
        if (data.discord_emoji_favorites)
          GMStore.set("discord_emoji_favorites",   data.discord_emoji_favorites,   true);
        if (data.discord_gif_favorites)
          GMStore.set("discord_gif_favorites",     data.discord_gif_favorites,     true);
        if (data.discord_sticker_favorites)
          GMStore.set("discord_sticker_favorites", data.discord_sticker_favorites, true);
        if (data.discord_emoji_collections)
          GMStore.set("discord_emoji_collections", data.discord_emoji_collections, true);
        if (data.discord_gif_collections)
          GMStore.set("discord_gif_collections",   data.discord_gif_collections,   true);
        if (data.discord_sticker_collections)
          GMStore.set("discord_sticker_collections", data.discord_sticker_collections, true);
        if (data.discord_emoji_native_mode != null)
          GMStore.set("discord_emoji_native_mode", data.discord_emoji_native_mode);

        // --- 恢復 Wormholes (Module D) ---
        if (data.wormholes) {
          if (data.wormholes.groups || data.wormholes.wormholes) {
            GMStore.set("discord_wormholes_v2", data.wormholes);
          }
        }

        // --- 恢復 Wormhole 偏好設定 ---
        if (data.wormholePrefs) {
          const wp = data.wormholePrefs;
          if (wp.wh_api_mode != null)
            localStorage.setItem("wh_api_mode", wp.wh_api_mode);
          if (wp.wh_dock_position != null)
            localStorage.setItem("wh_dock_position", wp.wh_dock_position);
          if (wp.wh_send_autoclose != null)
            GMStore.set("wh_send_autoclose", wp.wh_send_autoclose);
          if (wp.wh_send_goto != null)
            GMStore.set("wh_send_goto", wp.wh_send_goto);
          if (wp.wh_send_show_toast != null)
            GMStore.set("wh_send_show_toast", wp.wh_send_show_toast);
          if (wp.wormhole_focus_mode != null)
            localStorage.setItem("wormhole_focus_mode", wp.wormhole_focus_mode);
          if (wp.wormhole_focus_size != null)
            localStorage.setItem("wormhole_focus_size", wp.wormhole_focus_size);
        }

        // --- 恢復 Webhook (Module F) ---
        if (Array.isArray(data.webhookList) && data.webhookList.length > 0) {
          GMStore.set("discord_webhook_list", data.webhookList, true);
        }

        // --- 恢復 Header Mods (Module E) ---
        if (data.headerModPrefs) {
          const hp = data.headerModPrefs;
          if (hp.antiHijack != null)
            localStorage.setItem(
              "discord_header_mod_def_antiHijack",
              hp.antiHijack,
            );
          if (hp.concealName != null)
            localStorage.setItem(
              "discord_header_mod_def_concealName",
              hp.concealName,
            );
        }

        // --- 恢復模組開關 ---
        if (data.moduleToggles) {
          const mt = data.moduleToggles;
          const modKeys = [
            "mod_forwarding",
            "mod_message",
            "mod_emoji",
            "mod_header",
            "mod_wormhole",
            "mod_webhook",
            "mod_urlchecker",
            "mod_scout",
            "mod_blacklist",
          ];
          modKeys.forEach((k) => {
            if (mt[k] != null) localStorage.setItem(k, mt[k]);
          });
        }

        // --- 恢復 Channel Scout (Module G) ---
        if (data.channelScoutData) {
          const cs = data.channelScoutData;
          if (Array.isArray(cs.cs_custom_tags))
            GMStore.set("cs_custom_tags", cs.cs_custom_tags, true);
          if (Array.isArray(cs.cs_search_history))
            GMStore.set("cs_search_history", cs.cs_search_history, true);
        }

        // --- 恢復 Blacklist / Mute (Module H) ---
        if (Array.isArray(data.blacklistData) && data.blacklistData.length > 0) {
          GMStore.set("blacklist_users", data.blacklistData, true);
        }

        alert(t("import_success"));
        location.reload();
      } catch (e) {
        console.error(e);
        alert(t("import_fail"));
      }
    }

    GM_registerMenuCommand(t("menu_export"), exportSettings);
    GM_registerMenuCommand(t("menu_import"), importSettings);
    GM_registerMenuCommand(t("menu_change_lang"), showLanguageSelector);
    // v1.7.0：統一 Toast — 轉發至頂層 dmtShowToast
    function showToast(message, duration = 2000) {
      dmtShowToast(message, { duration });
    }

    function spawnSparkles(x, y) {
      for (let i = 0; i < 8; i++) {
        const p = document.createElement("div");
        p.className = "msg-copy-sparkle";
        p.style.left = x + "px";
        p.style.top = y + "px";
        const angle = Math.random() * Math.PI * 2;
        const velocity = 30 + Math.random() * 50;
        p.style.setProperty("--tx", Math.cos(angle) * velocity + "px");
        p.style.setProperty("--ty", Math.sin(angle) * velocity + "px");
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 600);
      }
    }

    function animateFlyToTopRight(sourceImg, startX, startY) {
      let flyEl;
      let initialTop, initialLeft, initialWidth, initialHeight;
      if (sourceImg) {
        flyEl = document.createElement(
          sourceImg.tagName === "VIDEO" ? "video" : "img",
        );
        const rect = sourceImg.getBoundingClientRect();
        if (sourceImg.tagName === "VIDEO") {
          flyEl.poster = sourceImg.poster;
          flyEl.style.objectFit = "cover";
        } else {
          flyEl.src = sourceImg.src;
        }
        flyEl.className = "msg-copy-fly-img";
        initialTop = rect.top;
        initialLeft = rect.left;
        initialWidth = rect.width;
        initialHeight = rect.height;
      } else {
        flyEl = document.createElement("div");
        flyEl.className = "msg-copy-ghost-card";
        initialWidth = 60;
        initialHeight = 80;
        initialTop = startY - initialHeight / 2;
        initialLeft = startX - initialWidth / 2;
      }
      flyEl.style.top = initialTop + "px";
      flyEl.style.left = initialLeft + "px";
      flyEl.style.width = initialWidth + "px";
      flyEl.style.height = initialHeight + "px";
      flyEl.style.opacity = "1";
      document.body.appendChild(flyEl);
      void flyEl.offsetWidth;
      const targetTop = 60;
      const targetLeft = window.innerWidth - 150;
      requestAnimationFrame(() => {
        flyEl.style.top = targetTop + "px";
        flyEl.style.left = targetLeft + "px";
        flyEl.style.width = "30px";
        flyEl.style.height = "30px";
        flyEl.style.opacity = "0";
      });
      setTimeout(() => {
        if (flyEl && flyEl.parentNode) flyEl.parentNode.removeChild(flyEl);
        spawnSparkles(targetLeft + 15, targetTop + 15);
      }, 800);
    }

    function saveSymbols() {
      localStorage.setItem("copySymbols", JSON.stringify(config.symbols));
    }

    function extractLinks(text) {
      if (!text || typeof text !== "string") return [];
      const regex =
        /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
      return text.match(regex) || [];
    }

    function cleanUrl(urlStr) {
      try {
        const url = new URL(urlStr);
        const paramsToRemove = [
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "utm_term",
          "utm_content",
          "utm_id",
          "utm_referrer",
          "fbclid",
          "gclid",
          "dclid",
          "msclkid",
          "yclid",
          "gbraid",
          "wbraid",
          "igsh",
          "fb_action_ids",
          "fb_action_types",
          "fb_ref",
          "fb_source",
          "sxsrf",
          "ved",
          "ei",
          "gs_lcp",
          "oq",
          "aqs",
          "sourceid",
          "ie",
          "client",
          "feature",
          "pp",
          "pbjreload",
          "annotation_id",
          "si",
          "s",
          "t",
          "twclid",
          "ref",
          "ref_src",
          "sp_ref",
          "sp_url",
          "openExternalBrowser",
        ];
        paramsToRemove.forEach((p) => url.searchParams.delete(p));
        return url.toString();
      } catch (e) {
        return urlStr;
      }
    }

    /**
     * 智能檔名生成器 v2
     * 從Discord嵌入元素提取Twitter/X資訊生成有意義的檔名
     */
    function generateSmartFilename(container, mediaUrl, index = 0) {
      try {
        DEBUG && console.log("[Filename] Generating filename for:", mediaUrl);
        DEBUG && console.log("[Filename] Container:", container);

        // 1. 檢查是否為Twitter/X嵌入 (支援多種選擇器)
        const embedSelectors = [
          ".embedAuthorName__623de", // [Fix] 修正：移除 Link
          'a[href*="x.com/"][href*="/status/"]',
          'a[href*="twitter.com/"][href*="/status/"]',
          'a.embedLink__623de[href*="x.com"]',
          'a.embedLink__623de[href*="twitter.com"]',
          ".embedTitleLink__623de", // [Fix] 新增：標題連結也可能包含用戶名
        ];

        let embedAuthor = null;
        for (const selector of embedSelectors) {
          embedAuthor = container.querySelector(selector);
          if (embedAuthor) {
            DEBUG && console.log(
              "[Filename] Found embed author with selector:",
              selector,
              embedAuthor,
            );
            break;
          }
        }

        if (embedAuthor) {
          // 提取作者用戶名
          let username = "";
          const authorText = embedAuthor.textContent || "";
          DEBUG && console.log("[Filename] Author text:", authorText);

          const usernameMatch = authorText.match(/@([a-zA-Z0-9_]+)/);
          if (usernameMatch) {
            username = usernameMatch[1];
          } else {
            // [Fix] 優先從 href 提取
            const href =
              embedAuthor.href || embedAuthor.closest("a")?.href || "";
            const urlMatch = href.match(/(?:x\.com|twitter\.com)\/([^\/\?]+)/);
            if (urlMatch) username = urlMatch[1];
          }

          DEBUG && console.log("[Filename] Extracted username:", username);

          // [Fix] 提取推文ID - 從任何包含推文連結的元素取得
          let tweetId = "";

          // 方法1: 從 embedAuthor 的 href（如果是 <a> 標籤）
          const authorHref = embedAuthor.href || "";
          let tweetIdMatch = authorHref.match(/status\/(\d+)/);
          if (tweetIdMatch) {
            tweetId = tweetIdMatch[1];
          } else {
            // 方法2: 從 container 中尋找任何包含 status 的連結
            const statusLink = container.querySelector('a[href*="/status/"]');
            if (statusLink) {
              const statusHref = statusLink.href || "";
              DEBUG && console.log("[Filename] Found status link:", statusHref);
              tweetIdMatch = statusHref.match(/status\/(\d+)/);
              if (tweetIdMatch) tweetId = tweetIdMatch[1];
            }
          }

          DEBUG && console.log("[Filename] Tweet ID:", tweetId);

          // 提取推文內容 (前20字符)
          const embedDescSelectors = [
            ".embedDescription__623de",
            'div[class*="embedDescription"]',
            ".embed__623de .markup__75297",
            ".embedTitle__623de", // [Fix] 新增：標題也可能包含內容
          ];

          let contentSnippet = "";
          for (const selector of embedDescSelectors) {
            const embedDesc = container.querySelector(selector);
            if (embedDesc) {
              let text = embedDesc.textContent.trim();
              DEBUG && console.log("[Filename] Found description:", text);

              // [Fix] 移除表情符號和特殊符號，但保留中日韓文字
              text = text
                .replace(/[\n\r\t]/g, " ") // 移除換行
                .replace(/💬\d+|🔁\d+|❤️\d+/g, "") // 移除 Twitter 統計數字
                .replace(/[•·]/g, "") // 移除分隔符號
                .replace(/\s+/g, " ") // 合併多個空格
                .trim();

              // 移除表情符號（保留文字）
              text = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, "");

              // 只保留字母、數字、中日韓文、空格
              // \p{Script=Han} = 中文
              // \p{Script=Hiragana} = 平假名
              // \p{Script=Katakana} = 片假名
              // \p{Script=Hangul} = 韓文
              text = text
                .replace(
                  /[^\p{L}\p{N}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\s]/gu,
                  "",
                )
                .trim()
                .substring(0, 20)
                .replace(/\s+/g, "_");

              DEBUG && console.log("[Filename] Cleaned description:", text);

              if (text.length > 0) {
                contentSnippet = text;
                DEBUG && console.log(
                  "[Filename] Content snippet set to:",
                  contentSnippet,
                );
                break;
              }
            }
          }

          DEBUG &&
            console.log("[Filename] Final content snippet:", contentSnippet);

          // 從媒體URL提取Twitter媒體ID (最穩定方案)
          let mediaId = "";
          try {
            const mediaUrlObj = new URL(mediaUrl);
            const pathParts = mediaUrlObj.pathname.split("/");
            const lastPart = pathParts[pathParts.length - 1];
            mediaId = lastPart.split("?")[0].split(":")[0].split("%")[0];
          } catch (e) {}

          DEBUG && console.log("[Filename] Media ID:", mediaId);

          // [Fix] 從推文ID提取日期（Twitter Snowflake ID 轉換）
          let dateStr = "";
          if (tweetId) {
            try {
              // Twitter Snowflake ID 轉時間戳（毫秒）
              const timestamp = (BigInt(tweetId) >> 22n) + 1288834974657n;
              const date = new Date(Number(timestamp));

              // 格式化為 YYYYMMDD
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, "0");
              const day = String(date.getDate()).padStart(2, "0");
              dateStr = `${year}${month}${day}`;

              DEBUG && console.log("[Filename] Extracted date:", dateStr);
            } catch (e) {
              console.warn(
                "[Filename] Failed to extract date from tweet ID:",
                e,
              );
            }
          }

          // 優先級策略（用戶偏好格式）
          // 1. @用戶名_日期_內容_序號（完整格式）
          if (username && dateStr && contentSnippet) {
            const ext =
              mediaUrl.match(
                /\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i,
              )?.[1] || "jpg";
            const filename = `@${username}_${dateStr}_${contentSnippet}_${index + 1}.${ext}`;
            DEBUG && console.log(
              "[Filename] Using full format (username+date+content):",
              filename,
            );
            return filename;
          }

          // 2. @用戶名_日期_序號（無內容片段）
          if (username && dateStr) {
            const ext =
              mediaUrl.match(
                /\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i,
              )?.[1] || "jpg";
            const filename = `@${username}_${dateStr}_${index + 1}.${ext}`;
            DEBUG && console.log("[Filename] Using username+date:", filename);
            return filename;
          }

          // 3. @用戶名_推文ID_內容_序號（降級方案：使用完整推文ID）
          if (username && tweetId && contentSnippet) {
            const ext =
              mediaUrl.match(
                /\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i,
              )?.[1] || "jpg";
            const filename = `@${username}_${tweetId}_${contentSnippet}_${index + 1}.${ext}`;
            DEBUG &&
              console.log(
                "[Filename] Using username+tweetId+content:",
                filename,
              );
            return filename;
          }

          // 4. @用戶名_推文ID_序號
          if (username && tweetId) {
            const ext =
              mediaUrl.match(
                /\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i,
              )?.[1] || "jpg";
            const filename = `@${username}_${tweetId}_${index + 1}.${ext}`;
            DEBUG &&
              console.log("[Filename] Using username+tweetId:", filename);
            return filename;
          }

          // 5. @用戶名_內容片段_序號
          if (username && contentSnippet) {
            const ext =
              mediaUrl.match(
                /\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i,
              )?.[1] || "jpg";
            const filename = `@${username}_${contentSnippet}_${index + 1}.${ext}`;
            DEBUG &&
              console.log("[Filename] Using username+content:", filename);
            return filename;
          }

          // 6. Twitter媒體ID（降級為備用方案）
          if (mediaId && mediaId.length > 5 && mediaId.includes(".")) {
            DEBUG && console.log("[Filename] Using media ID:", mediaId);
            return mediaId;
          }

          // 7. @用戶名_序號
          if (username) {
            const ext =
              mediaUrl.match(
                /\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i,
              )?.[1] || "jpg";
            const filename = `@${username}_${index + 1}.${ext}`;
            DEBUG && console.log("[Filename] Using username only:", filename);
            return filename;
          }
        }

        DEBUG && console.log("[Filename] No embed info found, using fallback");

        // 2. 降級策略:從URL提取檔名
        try {
          const urlObj = new URL(mediaUrl);
          const pathname = urlObj.pathname;
          let filename = pathname.substring(pathname.lastIndexOf("/") + 1);
          filename = filename.split("?")[0].split(":")[0].split("%3A")[0];
          if (filename && filename.length > 3) {
            DEBUG && console.log("[Filename] Using URL filename:", filename);
            return filename;
          }
        } catch (e) {}

        // 3. 最終降級:時間戳
        const ext =
          mediaUrl.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i)?.[1] ||
          "jpg";
        const filename = `discord_media_${Date.now()}_${index}.${ext}`;
        DEBUG && console.log("[Filename] Using timestamp fallback:", filename);
        return filename;
      } catch (error) {
        console.warn("[generateSmartFilename] Failed:", error);
        return `discord_file_${Date.now()}_${index}.jpg`;
      }
    }

    function extractExternalMediaUrl(msg) {
      const activeVideo = msg.querySelector("video");
      if (
        activeVideo &&
        activeVideo.src &&
        !activeVideo.src.startsWith("blob:")
      )
        return activeVideo.src;

      // 策略0：Discord 上傳附件（media.discordapp.net / cdn.discordapp.com）
      // 優先從 <a class="originalLink_"> 的 data-safe-src 取得乾淨 URL
      // 解決純圖片訊息（無文字）的 ⠿ 按鈕點擊沒有反應的問題
      const originalLinkEl = msg.querySelector('a[class*="originalLink_"]');
      if (originalLinkEl) {
        const safeSrc = originalLinkEl.dataset.safeSrc || originalLinkEl.href;
        if (safeSrc && (safeSrc.includes("discordapp.net") || safeSrc.includes("discordapp.com"))) {
          return safeSrc;
        }
      }
      // 降級：直接抓 media.discordapp.net 的 img src
      const discordMediaImg = msg.querySelector('img[src*="media.discordapp.net/attachments/"]');
      if (discordMediaImg) return discordMediaImg.src;

      // 策略1:查找帶有真實連結的<a>標籤
      const externalLink = msg.querySelector(
        'a[href*="//"]:not([href*="discord.com"]):not([href*="discordapp.net"])',
      );
      if (externalLink && isLikelyMediaFile(externalLink.href)) {
        return externalLink.href;
      }

      // 策略2:檢查圖片的data-屬性(Discord有時會儲存原始URL)
      const proxyImg = msg.querySelector('img[src*="/external/"]');
      if (proxyImg) {
        // 檢查data-safe-src或其他可能的屬性
        if (proxyImg.dataset.safeSrc) {
          const match = proxyImg.dataset.safeSrc.match(/external\/([^?]+)/);
          if (match) {
            try {
              const decoded = decodeURIComponent(match[1]);
              const parts = decoded.split("/");
              const protocolIdx = parts.findIndex(
                (p) => p === "http" || p === "https",
              );
              if (protocolIdx !== -1) {
                const sourceUrl = `${parts[protocolIdx]}://${parts.slice(protocolIdx + 1).join("/")}`;
                return sourceUrl.replace(/%3A/g, ":");
              }
            } catch (e) {}
          }
        }

        // 策略3:解析img的src URL
        try {
          const proxyUrl = proxyImg.src;
          const match = proxyUrl.match(/\/external\/([^?]+)/);
          if (match) {
            const encodedPath = match[1];
            const decoded = decodeURIComponent(encodedPath);

            // 分割路徑並尋找協議段
            const parts = decoded.split("/");
            const protocolIdx = parts.findIndex(
              (p) => p === "http" || p === "https",
            );

            if (protocolIdx !== -1) {
              const protocol = parts[protocolIdx];
              const urlPath = parts.slice(protocolIdx + 1).join("/");
              const sourceUrl = `${protocol}://${urlPath}`;
              return sourceUrl.replace(/%3A/g, ":");
            }

            if (
              decoded.startsWith("http://") ||
              decoded.startsWith("https://")
            ) {
              return decoded;
            }
          }
        } catch (e) {
          console.warn("[extractExternalMediaUrl] Parse failed:", e);
        }

        // 降級：返回代理 img 的完整 src（含 query string）。
        // 注意：原本用 split("?")[0] 截斷，但部分圖片服務（如 gstatic.com/images?q=...）
        // 的識別資訊全在 query string 裡，截斷後 URL 無效。
        // 改為回傳完整 src，讓下游（copyMediaUrl / downloadFile）自行處理。
        return proxyImg.src;
      }

      // 策略4:查找video source標籤
      const videoSource = msg.querySelector('video source[src*="/external/"]');
      if (videoSource) {
        const match = videoSource.src.match(/external\/([^?]+)/);
        if (match) {
          try {
            const decoded = decodeURIComponent(match[1]);
            const parts = decoded.split("/");
            const protocolIdx = parts.findIndex(
              (p) => p === "http" || p === "https",
            );
            if (protocolIdx !== -1) {
              return `${parts[protocolIdx]}://${parts.slice(protocolIdx + 1).join("/")}`.replace(
                /%3A/g,
                ":",
              );
            }
          } catch (e) {}
        }
      }

      const directImg = msg.querySelector(
        'img[src^="http"]:not([src*="discord.com"]):not([src*="discordapp.net"])',
      );
      if (directImg) return directImg.src;

      const discordAttachmentImg = msg.querySelector(
        'img[src*="cdn.discordapp.com/attachments/"]',
      );
      if (discordAttachmentImg) return discordAttachmentImg.src;

      return null;
    }

    function isLikelyMediaFile(url) {
      if (!url) return false;
      // 明確な媒體副檔名チェック（最優先）
      if (/\.(mp4|webm|mov|mkv|jpg|jpeg|png|gif|webp)([?#].*)?$/i.test(url))
        return true;
      // ?format=jpg 等のクエリパラメータ形式（pbs.twimg.com 等）
      if (/[?&]format=(jpg|jpeg|png|gif|webp|mp4|webm)(&|$)/i.test(url))
        return true;
      // Discord CDN / media CDN は attachmentLinks で別途処理するためここでは除外
      //（cdn.discordapp.com を含む ZIP 等の非媒体ファイルを誤判しないため）
      if (
        url.includes("video.twimg.com") ||
        url.includes("pbs.twimg.com") ||
        url.includes("i.imgur.com")
      )
        return true;
      return false;
    }

    function resolveRealFileUrl(linkElement) {
      let href = linkElement.href;

      // 1. Discord CDN 原生附件 (直接返回)
      if (href.includes("cdn.discordapp.com/attachments/")) return href;

      // 2. 檢查 data-safe-src 屬性 (包含真實URL)
      if (linkElement.dataset.safeSrc) {
        const safeSrc = linkElement.dataset.safeSrc;

        // 嘗試從 data-safe-src 提取真實URL
        if (safeSrc.includes("/external/")) {
          try {
            const match = safeSrc.match(/\/external\/([^?]+)/);
            if (match) {
              const encodedPath = match[1];
              const decoded = decodeURIComponent(encodedPath);

              // 分割路徑並尋找協議段
              const parts = decoded.split("/");
              const protocolIdx = parts.findIndex(
                (p) => p === "http" || p === "https",
              );

              if (protocolIdx !== -1) {
                const protocol = parts[protocolIdx];
                const urlPath = parts.slice(protocolIdx + 1).join("/");
                const sourceUrl = `${protocol}://${urlPath}`;
                return sourceUrl.replace(/%3A/g, ":");
              }

              // 如果第一段是雜湊,跳過它
              if (parts.length >= 3 && parts[0].length >= 40) {
                const remainingParts = parts.slice(1);
                const protoIdx2 = remainingParts.findIndex(
                  (p) => p === "http" || p === "https",
                );

                if (protoIdx2 !== -1) {
                  const protocol = remainingParts[protoIdx2];
                  const urlPath = remainingParts.slice(protoIdx2 + 1).join("/");
                  return `${protocol}://${urlPath}`.replace(/%3A/g, ":");
                }

                // 嘗試 https:// 重建
                if (remainingParts.length >= 2) {
                  return `https://${remainingParts.join("/")}`.replace(
                    /%3A/g,
                    ":",
                  );
                }
              }

              if (
                decoded.startsWith("http://") ||
                decoded.startsWith("https://")
              ) {
                return decoded;
              }
            }
          } catch (e) {
            console.warn("[resolveRealFileUrl] Parse error:", e);
          }
        }

        // 如果 data-safe-src 本身就是完整URL
        if (safeSrc.startsWith("http")) return safeSrc;
      }

      // 3. 檢查 href 是否為外部代理連結
      if (href.includes("/external/")) {
        try {
          const match = href.match(/\/external\/([^?]+)/);
          if (match) {
            const encodedPath = match[1];
            const decoded = decodeURIComponent(encodedPath);

            const parts = decoded.split("/");
            const protocolIdx = parts.findIndex(
              (p) => p === "http" || p === "https",
            );

            if (protocolIdx !== -1) {
              const protocol = parts[protocolIdx];
              const urlPath = parts.slice(protocolIdx + 1).join("/");
              return `${protocol}://${urlPath}`.replace(/%3A/g, ":");
            }

            // 雜湊處理
            if (parts.length >= 3 && parts[0].length >= 40) {
              const remainingParts = parts.slice(1);
              const protoIdx2 = remainingParts.findIndex(
                (p) => p === "http" || p === "https",
              );

              if (protoIdx2 !== -1) {
                return `${remainingParts[protoIdx2]}://${remainingParts.slice(protoIdx2 + 1).join("/")}`.replace(
                  /%3A/g,
                  ":",
                );
              }

              if (remainingParts.length >= 2) {
                return `https://${remainingParts.join("/")}`.replace(
                  /%3A/g,
                  ":",
                );
              }
            }
          }
        } catch (e) {}
      }

      // 4. 如果是已知媒體檔案格式,直接返回
      if (isLikelyMediaFile(href)) return href;

      // 5. 降級:返回原始href
      return href;
    }

    // ========================================================================
    // 下載管理器 (DownloadManager)
    // ========================================================================

    class DownloadManager {
      constructor() {
        this.maxRetries = 2;
        this.retryDelay = 1000;
        this.activeDownloads = new Map(); // 追蹤正在進行的下載

        // 新增：並發控制
        this.maxConcurrent = 3; // 最多同時下載 3 個檔案
        this.queue = []; // 等待隊列
        this.stats = {
          // 統計資訊
          success: 0,
          failed: 0,
          total: 0,
        };
      }

      /**
       * 主下載函數 (帶重試和防重複)
       * @param {string} url - 主要 URL
       * @param {string} filename - 儲存檔名
       * @param {string|null} fallbackUrl - 備用 URL
       * @param {number} retryCount - 當前重試次數 (內部使用)
       */
      download(url, filename, fallbackUrl = null, retryCount = 0) {
        // 防止重複下載同一檔案
        const downloadKey = `${url}_${filename}`;
        if (this.activeDownloads.has(downloadKey)) {
          console.warn(`[Download] ⚠ Already downloading: ${filename}`);
          return Promise.resolve({ success: false, reason: "duplicate" });
        }

        // 並發控制：如果超過限制，加入隊列
        if (this.activeDownloads.size >= this.maxConcurrent) {
          DEBUG && console.log(
            `[Download] 📋 Queued: ${filename} (${this.queue.length + 1} in queue)`,
          );
          return new Promise((resolve) => {
            this.queue.push({
              url,
              filename,
              fallbackUrl,
              retryCount,
              resolve,
            });
          });
        }

        // 標記為進行中
        this.activeDownloads.set(downloadKey, true);
        this.stats.total++;

        return new Promise((resolve) => {
          GM_xmlhttpRequest({
            method: "GET",
            url: url,
            responseType: "blob",
            headers: {
              Referer: url,
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              Accept:
                "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
            timeout: 30000, // 30秒超時

            onload: (response) => {
              this.activeDownloads.delete(downloadKey);

              if (response.status === 200) {
                this._saveBlob(response.response, filename);
                this.stats.success++;
                resolve({ success: true, filename });
                this._processQueue(); // 處理下一個
              } else if (response.status === 403 || response.status === 404) {
                this._handleFailure(
                  url,
                  filename,
                  fallbackUrl,
                  retryCount,
                  `HTTP ${response.status}`,
                  resolve,
                );
              } else {
                this._handleFailure(
                  url,
                  filename,
                  fallbackUrl,
                  retryCount,
                  `Unexpected status: ${response.status}`,
                  resolve,
                );
              }
            },

            onerror: (error) => {
              this.activeDownloads.delete(downloadKey);
              this._handleFailure(
                url,
                filename,
                fallbackUrl,
                retryCount,
                "Network error",
                resolve,
              );
            },

            ontimeout: () => {
              this.activeDownloads.delete(downloadKey);
              this._handleFailure(
                url,
                filename,
                fallbackUrl,
                retryCount,
                "Timeout",
                resolve,
              );
            },
          });
        });
      }

      /**
       * 失敗處理邏輯 (重試或備援)
       */
      _handleFailure(url, filename, fallbackUrl, retryCount, reason, resolve) {
        console.warn(`[Download] ❌ Failed (${reason}): ${filename}`);

        // 1. 重試當前 URL
        if (retryCount < this.maxRetries) {
          DEBUG && console.log(
            `[Download] 🔄 Retry ${retryCount + 1}/${this.maxRetries} after ${this.retryDelay}ms`,
          );
          setTimeout(() => {
            this.download(url, filename, fallbackUrl, retryCount + 1).then(
              resolve,
            );
          }, this.retryDelay);
          return;
        }

        // 2. 切換至備用 URL
        if (fallbackUrl && fallbackUrl !== url) {
          DEBUG && console.log(`[Download] 🔀 Switching to fallback: ${fallbackUrl}`);
          this.download(fallbackUrl, `fallback_${filename}`, null, 0).then(
            resolve,
          );
          return;
        }

        // 3. 所有方法失敗
        this.stats.failed++;

        // 偵測已知 CORS 限制來源，給出更具體的錯誤提示
        const corsRestrictedHosts = [
          "encrypted-tbn0.gstatic.com",
          "lh3.googleusercontent.com",
          "lh4.googleusercontent.com",
          "pbs.twimg.com",
        ];
        let isCorsRestricted = false;
        try {
          const hostname = new URL(url).hostname;
          isCorsRestricted = corsRestrictedHosts.some((h) =>
            hostname.endsWith(h),
          );
        } catch (_) {}

        if (isCorsRestricted) {
          showToast(t("download_cors_fail"));
        } else {
          showToast(`❌ ${t("download_fail")}: ${filename}`);
        }
        resolve({ success: false, reason });
        this._processQueue(); // 繼續處理隊列
      }

      /**
       * 儲存 Blob 至本地
       */
      _saveBlob(blob, filename) {
        try {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          link.style.display = "none";

          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // 10秒後清理記憶體
          setTimeout(() => URL.revokeObjectURL(url), 10000);

          DEBUG && console.log(`[Download] ✅ Success: ${filename}`);
        } catch (error) {
          console.error(`[Download] 💾 Save failed:`, error);
          showToast(`❌ ${t("download_fail")}: ${filename}`);
        }
      }

      /**
       * 處理等待隊列
       */
      _processQueue() {
        if (this.queue.length === 0) {
          // 隊列清空，顯示統計
          if (this.stats.total > 0) {
            DEBUG && console.log(
              `[Download] 📊 Stats - Success: ${this.stats.success}, Failed: ${this.stats.failed}, Total: ${this.stats.total}`,
            );
          }
          return;
        }

        while (
          this.queue.length > 0 &&
          this.activeDownloads.size < this.maxConcurrent
        ) {
          const task = this.queue.shift();
          this.download(
            task.url,
            task.filename,
            task.fallbackUrl,
            task.retryCount,
          ).then(task.resolve);
        }
      }

      /**
       * 圖片批次下載 (帶延遲控制)
       */
      batchDownload(urlList, baseFilename = "discord_img") {
        DEBUG && console.log(
          `[Download] 📦 Starting batch download: ${urlList.length} files`,
        );

        urlList.forEach((urlData, index) => {
          const { url, fallback, filename } = urlData;
          const finalName =
            filename || `${baseFilename}_${Date.now()}_${index}.jpg`;

          // 每 200ms 添加一個到隊列 (避免瞬間湧入)
          setTimeout(() => {
            this.download(url, finalName, fallback);
          }, index * 200);
        });
      }

      /**
       * 重置統計資訊
       */
      resetStats() {
        this.stats = { success: 0, failed: 0, total: 0 };
      }

      /**
       * 取得當前狀態
       */
      getStatus() {
        return {
          active: this.activeDownloads.size,
          queued: this.queue.length,
          stats: { ...this.stats },
        };
      }
    }

    // 全域單例與橋接函數 (保持舊代碼兼容性)
    const downloadManager = new DownloadManager();

    function downloadFile(url, filename, fallbackUrl = null) {
      return downloadManager.download(url, filename, fallbackUrl);
    }

    function getMessageText(msg) {
      try {
        // 排除 repliedMessage 區塊，只抓主要訊息內容
        const replyBlock = msg.querySelector('[class*="repliedMessage"]');

        // 主要訊息：排除 reply 區塊後找 message-content
        let textEl = null;
        const allContentEls = msg.querySelectorAll('[id^="message-content-"]');
        for (const el of allContentEls) {
          if (!replyBlock || !replyBlock.contains(el)) {
            textEl = el;
            break;
          }
        }
        // fallback
        if (!textEl) {
          textEl =
            msg.querySelector(
              '[class*="markup-"]:not([class*="repliedMessage"] [class*="markup-"])',
            ) ||
            msg.querySelector(
              '[class*="messageContent"]:not([class*="repliedMessage"] [class*="messageContent"])',
            );
        }

        let mainText = "";
        if (textEl) {
          const clone = textEl.cloneNode(true);
          clone
            .querySelectorAll(
              'span[class*="edited"], span[class*="timestamp"], time, [class*="spoilerWarning"], button',
            )
            .forEach((el) => el.remove());
          clone.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
            el.removeAttribute("aria-hidden");
            el.style.display = "inline";
          });
          mainText = clone.innerText.trim();
        }

        // 【轉發訊息 Fallback】
        // 轉發訊息的外層 message-content 為空（發文者沒有附帶文字），
        // 實際的連結內容藏在 embed 區塊（.content__122e4）底下的 message-content。
        // 若 mainText 為空，且訊息中存在轉發 embed 標頭（headerContainer__），
        // 則主動從 embed 區抓取所有 message-content 的文字並合併，
        // 確保 extractLinks 能解析出 Twitter / X 等連結，讓轉換選項正確出現。
        if (!mainText) {
          const isForwarded =
            msg.querySelector('[class*="headerContainer__"]') !== null;
          if (isForwarded) {
            const allContentEls2 = Array.from(
              msg.querySelectorAll('[id^="message-content-"]'),
            );
            // 第一個是外層空殼，從第二個起才是 embed 實際內容
            const forwardedTexts = allContentEls2
              .slice(1)
              .map((el) => {
                const clone = el.cloneNode(true);
                clone
                  .querySelectorAll(
                    'span[class*="edited"], span[class*="timestamp"], time, [class*="spoilerWarning"], button',
                  )
                  .forEach((n) => n.remove());
                // 將 <a href="..."> 的 href 補進文字，讓連結能被 extractLinks regex 捕捉
                clone.querySelectorAll("a[href]").forEach((a) => {
                  const href = a.getAttribute("href");
                  if (
                    href &&
                    href.startsWith("http") &&
                    !clone.innerText.includes(href)
                  ) {
                    a.insertAdjacentText("afterend", " " + href);
                  }
                });
                return clone.innerText.trim();
              })
              .filter(Boolean);
            mainText = forwardedTexts.join("\n");
          }
        }

        // 附加引用訊息文字（若有）
        if (replyBlock) {
          const replyContentEl = replyBlock.querySelector(
            '[id^="message-content-"], [class*="repliedTextContent"]',
          );
          if (replyContentEl) {
            const replyClone = replyContentEl.cloneNode(true);
            replyClone
              .querySelectorAll('span[class*="edited"], time, button')
              .forEach((el) => el.remove());
            const replyText = replyClone.innerText.trim();
            // 取得被回覆者名稱
            const replyAuthor =
              replyBlock
                .querySelector('[class*="username"]')
                ?.innerText?.trim() || "";
            if (replyText && replyText !== "無法載入訊息") {
              const prefix = replyAuthor
                ? `> @${replyAuthor}: ${replyText}`
                : `> ${replyText}`;
              mainText = mainText ? `${prefix}\n${mainText}` : prefix;
            }
          }
        }

        return mainText;
      } catch (e) {
        const rawText = msg.innerText || "";
        return rawText
          .replace(/\s*(（已编辑）|\(edited\)|▶️|💬)$/gi, "")
          .trim();
      }
    }

    function insertTextToInput(text) {
      const textbox = document.querySelector('[role="textbox"]');
      if (!textbox) return showToast(t("input_not_found"));
      textbox.focus();
      let final = text;
      if (config.appendSpace) final += " ";
      if (config.appendNewLine) final += "\n";
      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      pasteEvent.clipboardData.setData("text/plain", final);
      textbox.dispatchEvent(pasteEvent);
      showToast(t("insert_success"));
    }

    function copyToClipboard(text) {
      let final = text;
      if (config.appendSpace) final += " ";
      if (config.appendNewLine) final += "\n";
      navigator.clipboard
        .writeText(final)
        .then(() => showToast(t("copy_success")))
        .catch(() => showToast(t("copy_fail")));
    }

    function isValidContentImage(img) {
      if (!img) return false;
      if (img.className.includes("avatar") || img.closest('[class*="avatar"]'))
        return false;
      if (img.className.includes("emoji") || img.alt.match(/:\w+:/))
        return false;
      if (img.naturalWidth > 0 && img.naturalWidth < 50) return false;
      return true;
    }

    function findMediaElementByUrl(container, url) {
      if (!url) return null;
      try {
        const filename = url.split("/").pop().split("?")[0];
        const allImgs = Array.from(container.querySelectorAll("img")).filter(
          isValidContentImage,
        );
        for (let img of allImgs) {
          if (img.src.includes(filename)) return img;
        }
        const allVideos = Array.from(container.querySelectorAll("video"));
        for (let vid of allVideos) {
          if (
            (vid.poster && vid.poster.includes(filename)) ||
            (vid.src && vid.src.includes(filename))
          )
            return vid;
        }
        if (url.includes("cdn.discordapp.com")) {
          const id = url.match(/\/(\d+)\//)?.[1];
          if (id) {
            for (let img of allImgs) {
              if (img.src.includes(id)) return img;
            }
            for (let vid of allVideos) {
              if (vid.poster && vid.poster.includes(id)) return vid;
            }
          }
        }
      } catch (e) {
        return null;
      }
      return null;
    }

    function bindButtonAction(btn, textToCopy, textToInsert = null) {
      let pressTimer;
      let isLongPress = false;
      const insertContent = textToInsert || textToCopy;
      const executeAction = (type, shift = false) => {
        let doInsert = false;
        let doCopy = false;
        if (shift) {
          doInsert = true;
          doCopy = true;
        } else if (type === "long") {
          if (config.swapLogic) doCopy = true;
          else doInsert = true;
        } else {
          if (config.swapLogic) doInsert = true;
          else doCopy = true;
        }

        if (doCopy) copyToClipboard(textToCopy);
        if (doInsert) insertTextToInput(insertContent);
      };

      btn.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        isLongPress = false;
        pressTimer = setTimeout(() => {
          isLongPress = true;
          executeAction("long");
        }, 500);
      });
      btn.addEventListener("mouseup", (e) => {
        if (e.button !== 0) return;
        clearTimeout(pressTimer);
        if (!isLongPress) {
          if (e.shiftKey) {
            executeAction("click", true);
          } else {
            executeAction("click", false);
            closeGlobalMenu();
          }
        } else {
          closeGlobalMenu();
        }
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      btn.addEventListener("selectstart", (e) => e.preventDefault());
    }

    // Portal logic for floating submenus
    function showSubmenu(items, parentRect, dropdown) {
      document
        .querySelectorAll(".msg-copy-portal-menu")
        .forEach((el) => el.remove());
      const submenu = document.createElement("div");
      submenu.className = "msg-copy-portal-menu";
      items.forEach((el) => submenu.appendChild(el));
      document.body.appendChild(submenu);

      let left = parentRect.right + 2;
      let top = parentRect.top;
      if (left + 200 > window.innerWidth) left = parentRect.left - 200 - 2;
      const subRect = submenu.getBoundingClientRect();
      if (top + subRect.height > window.innerHeight)
        top = window.innerHeight - subRect.height - 10;

      submenu.style.left = `${left}px`;
      submenu.style.top = `${top}px`;

      // Prevent submenu closing when interacting with it
      submenu.addEventListener("mouseenter", cancelCloseGlobalMenu);
      submenu.addEventListener("mouseleave", () => {
        // Only close submenu on leave, but also schedule global close logic
        // If user goes back to main menu, main menu's enter will cancel this
        submenu.remove();
        scheduleCloseGlobalMenu();
      });
      return submenu;
    }

    // ── 模組開關浮動面板 ─────────────────────────────────────────────────
    function showModuleSettingsPanel(anchorEl) {
      // § 10 — 開啟面板視同「已讀」，移除 gear 紅點
      const gearWrap = anchorEl?.closest(".dmt-gear-wrap") || anchorEl?.parentElement;
      const dot = gearWrap?.querySelector(".dmt-gear-dot");
      if (dot) dot.remove();

      // 移除舊面板
      const existing = document.getElementById("mod-settings-panel");
      if (existing) {
        existing.remove();
        return;
      }

      const lang = getConfig().lang || navigator.language || "en-US";
      const getLang = (labels) => {
        if (labels[lang]) return labels[lang];
        // prefix 模糊比對："en" 能匹配 "en-US"，"zh" 能匹配 "zh-TW" 等
        const prefix = lang.split("-")[0];
        const prefixKey = Object.keys(labels).find(k => k.split("-")[0] === prefix);
        if (prefixKey) return labels[prefixKey];
        return labels["en-US"] || labels["zh-TW"];
      };

      const panel = document.createElement("div");
      panel.id = "mod-settings-panel";
      panel.style.cssText = `
        position: fixed;
        background: #2b2d31;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        padding: 12px 0 8px;
        z-index: 2147483647;
        min-width: 240px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        font-size: 13px;
        color: #dcddde;
      `;

      // 標題
      const title = document.createElement("div");
      title.style.cssText =
        "padding: 0 14px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #72767d;";
      title.textContent =
        {
          "zh-TW": "功能模組開關",
          "zh-CN": "功能模块开关",
          ja: "モジュール設定",
          ko: "모듈 설정",
        }[lang] || "Module Settings";
      panel.appendChild(title);

      const sep = document.createElement("div");
      sep.style.cssText =
        "height: 1px; background: rgba(255,255,255,0.07); margin: 0 0 6px;";
      panel.appendChild(sep);

      // 各模組開關列
      MODULE_DEFS.forEach((mod) => {
        const row = document.createElement("div");
        row.style.cssText =
          "display:flex; align-items:center; justify-content:space-between; padding: 6px 14px; cursor:pointer; border-radius:4px; margin: 0 4px;";
        row.onmouseenter = () =>
          (row.style.background = "rgba(255,255,255,0.06)");
        row.onmouseleave = () => (row.style.background = "");

        const label = document.createElement("span");
        label.style.cssText = "display:flex; align-items:center; gap:7px;";
        label.innerHTML = `<span style="font-size:15px;">${mod.icon}</span><span>${getLang(mod.label)}</span>`;

        // § 10 — New Badge 注入
        const newBadge = renderNewBadge(mod.storageKey);
        if (newBadge) label.appendChild(newBadge);

        // ❓ Tooltip 注入（若 mod.tip 有定義）
        if (mod.tip) {
          const tipBtn = document.createElement("span");
          tipBtn.style.cssText = `
            display:inline-flex; align-items:center; justify-content:center;
            width:14px; height:14px; border-radius:50%;
            color:rgba(185,187,190,0.45); cursor:help; flex-shrink:0;
            font-size:11px; font-weight:700; line-height:1;
            transition: color 0.15s;
          `;
          tipBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
            <path d="M12 17v-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="currentColor" stroke-width="1.5"/>
          </svg>`;
          tipBtn.title = t(mod.tip);
          tipBtn.onmouseenter = () => tipBtn.style.color = "rgba(185,187,190,0.9)";
          tipBtn.onmouseleave = () => tipBtn.style.color = "rgba(185,187,190,0.45)";
          // 阻止點擊 ❓ 觸發整行 toggle
          tipBtn.addEventListener("click", (e) => e.stopPropagation());
          label.appendChild(tipBtn);
        }

        // Toggle 開關
        const enabled = isModEnabled(mod.storageKey);
        const toggle = document.createElement("div");
        toggle.style.cssText = `
          width: 34px; height: 18px; border-radius: 9px;
          background: ${enabled ? "#5865f2" : "#4f545c"};
          position: relative; transition: background 0.2s; flex-shrink: 0;
          cursor: pointer;
        `;
        const thumb = document.createElement("div");
        thumb.style.cssText = `
          width: 14px; height: 14px; border-radius: 50%; background: #fff;
          position: absolute; top: 2px;
          left: ${enabled ? "18px" : "2px"};
          transition: left 0.2s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        `;
        toggle.appendChild(thumb);

        const updateToggle = (on) => {
          toggle.style.background = on ? "#5865f2" : "#4f545c";
          thumb.style.left = on ? "18px" : "2px";
        };

        row.onclick = () => {
          const nowEnabled = isModEnabled(mod.storageKey);
          const next = !nowEnabled;

          // 核心模組關閉前要求確認
          if (mod.warn && !next) {
            const dlg = document.createElement("div");
            dlg.style.cssText = `
              position:fixed; inset:0; background:rgba(0,0,0,0.7);
              z-index:2147483647; display:flex; align-items:center; justify-content:center;
            `;
            const box = document.createElement("div");
            box.style.cssText = `
              background:#2f3136; border-radius:10px; padding:22px 24px; max-width:380px;
              color:#dcddde; font-size:13px; line-height:1.6;
              box-shadow:0 12px 40px rgba(0,0,0,0.6);
            `;
            const warnTitle = document.createElement("div");
            warnTitle.style.cssText =
              "font-size:15px; font-weight:700; margin-bottom:12px; color:#fff;";
            warnTitle.textContent = t("mod_msg_warn_title");
            const warnBody = document.createElement("div");
            warnBody.style.cssText =
              "white-space:pre-line; color:#b9bbbe; margin-bottom:18px;";
            warnBody.textContent = t("mod_msg_warn_body");
            const btnRow = document.createElement("div");
            btnRow.style.cssText =
              "display:flex; gap:10px; justify-content:flex-end;";
            const cancelBtn = document.createElement("button");
            cancelBtn.textContent = t("mod_msg_warn_cancel");
            cancelBtn.style.cssText =
              "padding:7px 16px; border-radius:5px; background:#4f545c; color:#fff; border:none; cursor:pointer; font-size:13px;";
            cancelBtn.onclick = () => dlg.remove();
            const confirmBtn = document.createElement("button");
            confirmBtn.textContent = t("mod_msg_warn_confirm");
            confirmBtn.style.cssText =
              "padding:7px 16px; border-radius:5px; background:#ed4245; color:#fff; border:none; cursor:pointer; font-size:13px;";
            confirmBtn.onclick = () => {
              dlg.remove();
              setModEnabled(mod.storageKey, false);
              updateToggle(false);
              // 提示重整
              const hint = document.createElement("div");
              hint.style.cssText =
                "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#23272a;color:#dcddde;padding:8px 16px;border-radius:6px;font-size:12px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.4);pointer-events:none;";
              hint.textContent =
                mod.icon +
                " " +
                getLang(mod.label) +
                " — " +
                t("mod_msg_warn_confirm") +
                " (重新整頁生效)";
              document.body.appendChild(hint);
              setTimeout(() => hint.remove(), 3000);
            };
            btnRow.appendChild(cancelBtn);
            btnRow.appendChild(confirmBtn);
            box.appendChild(warnTitle);
            box.appendChild(warnBody);
            box.appendChild(btnRow);
            dlg.appendChild(box);
            document.body.appendChild(dlg);
            dlg.addEventListener("click", (e) => {
              if (e.target === dlg) dlg.remove();
            });
            return; // 等待使用者確認，不直接切換
          }

          setModEnabled(mod.storageKey, next);
          updateToggle(next);

          // § 10 — 使用者互動後消除 New badge
          markFeatureSeen(mod.storageKey);
          const existingBadge = label.querySelector(".dmt-new-badge");
          if (existingBadge) existingBadge.remove();
          const hint = document.createElement("div");
          hint.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #23272a; color: #dcddde;
            padding: 8px 16px; border-radius: 6px; font-size: 12px;
            z-index: 999999; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            pointer-events: none;
          `;
          const actionLabel = next
            ? {
                "zh-TW": "已啟用",
                "zh-CN": "已启用",
                ja: "有効",
                ko: "활성화됨",
              }[lang] || "Enabled"
            : {
                "zh-TW": "已停用",
                "zh-CN": "已停用",
                ja: "無効",
                ko: "비활성화됨",
              }[lang] || "Disabled";
          hint.textContent = `${mod.icon} ${getLang(mod.label)} — ${actionLabel}`;
          document.body.appendChild(hint);
          setTimeout(() => hint.remove(), 2000);
        };

        row.appendChild(label);
        row.appendChild(toggle);
        panel.appendChild(row);
      });

      // 分隔線 + 說明書連結
      const sep2 = document.createElement("div");
      sep2.style.cssText =
        "height: 1px; background: rgba(255,255,255,0.07); margin: 8px 0 4px;";
      panel.appendChild(sep2);

      const manualBtn = document.createElement("div");
      manualBtn.style.cssText =
        "padding: 6px 14px; cursor:pointer; color:#72767d; font-size:12px; display:flex; align-items:center; gap:6px; border-radius:4px; margin: 0 4px;";
      manualBtn.innerHTML = `<span>📖</span><span>${{ "zh-TW": "查看使用說明", "zh-CN": "查看使用说明", ja: "マニュアルを見る", ko: "사용 설명서 보기" }[lang] || "View Manual"}</span>`;
      manualBtn.onmouseenter = () =>
        (manualBtn.style.background = "rgba(255,255,255,0.06)");
      manualBtn.onmouseleave = () => (manualBtn.style.background = "");
      manualBtn.onclick = () => {
        panel.remove();
        showManualModal();
      };
      panel.appendChild(manualBtn);

      // 定位：優先往左展開（脫離主 dropdown），再做上下調整
      document.body.appendChild(panel);
      const rect = anchorEl.getBoundingClientRect();
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;

      // 水平：優先在主 dropdown 左側（⚙️ 右側往左推 pw + 12px margin）
      // 若左側空間不足，改到右側
      let left = rect.right - pw - 4;
      if (left < 6) left = rect.right + 8;
      if (left + pw > window.innerWidth - 6) left = window.innerWidth - pw - 6;

      // 垂直：面板頂部與 ⚙️ 同高，向下延伸
      // 若底部超出視窗，往上移
      let top = rect.top;
      if (top + ph > window.innerHeight - 10)
        top = window.innerHeight - ph - 10;
      if (top < 6) top = 6;

      panel.style.top = top + "px";
      panel.style.left = left + "px";

      // 點外部關閉
      const closeHandler = (ev) => {
        if (!panel.contains(ev.target) && ev.target !== anchorEl) {
          panel.remove();
          document.removeEventListener("mousedown", closeHandler, true);
        }
      };
      setTimeout(
        () => document.addEventListener("mousedown", closeHandler, true),
        50,
      );
    }

    // ── 說明書 Modal ─────────────────────────────────────────────────────
    function showManualModal() {
      const existing = document.getElementById("mod-manual-modal");
      if (existing) {
        existing.remove();
        return;
      }

      const overlay = document.createElement("div");
      overlay.id = "mod-manual-modal";
      overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.65);
        z-index: 999998; display: flex; align-items: center; justify-content: center;
      `;

      const box = document.createElement("div");
      box.style.cssText = `
        background: #2b2d31;
        width: min(680px, 92vw); max-height: 80vh;
        display: flex; flex-direction: column;
        box-shadow: 0 16px 48px rgba(0,0,0,0.6);
        color: #dcddde;
      `;

      const head = document.createElement("div");
      head.style.cssText =
        "padding: 14px 18px 10px; font-size: 15px; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center;";
      head.innerHTML = `<span>📖 ${t("tip_manual")}</span><span style="cursor:pointer;font-size:18px;color:#72767d;" id="mod-manual-close">✕</span>`;

      const body = document.createElement("div");
      body.style.cssText = "overflow-y: auto; padding: 16px 18px; flex: 1; display:flex; flex-direction:column; gap:14px;";
      body.innerHTML = t("manual_content_sections");

      // ── 注入 mm-* class 格式 CSS（與 helpBtn overlay 相同規格）──
      const mmStyle = document.createElement("style");
      mmStyle.textContent = `
        #mod-manual-modal .mm-section{border-radius:7px;padding:11px 14px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025)}
        #mod-manual-modal .mm-section.accent-blue{background:rgba(88,101,242,.07);border-color:rgba(88,101,242,.22)}
        #mod-manual-modal .mm-section.accent-green{background:rgba(35,165,90,.06);border-color:rgba(35,165,90,.22)}
        #mod-manual-modal .mm-section.accent-yellow{background:rgba(240,178,50,.06);border-color:rgba(240,178,50,.22)}
        #mod-manual-modal .mm-section.accent-wormhole{background:rgba(88,101,242,.06);border-color:rgba(88,101,242,.2)}
        #mod-manual-modal .mm-sec-title{font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:6px}
        #mod-manual-modal .mm-sec-title.c-blue{color:#8891f7}
        #mod-manual-modal .mm-sec-title.c-green{color:#2dc770}
        #mod-manual-modal .mm-sec-title.c-yellow{color:#f0b232}
        #mod-manual-modal .mm-sec-title.c-worm{color:#a5b4fc}
        #mod-manual-modal .mm-sec-title.c-default{color:#b5bac1}
        #mod-manual-modal .mm-content{font-size:13px;color:#dbdee1;line-height:1.75}
        #mod-manual-modal .mm-content b{color:#fff}
        #mod-manual-modal .mm-key{background:#1e1f22;padding:1px 6px;border-radius:4px;font-family:monospace;color:#eee;font-size:11px;border:1px solid #3f4147}
        #mod-manual-modal .mm-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}
        #mod-manual-modal .mm-row{display:flex;gap:6px;align-items:baseline}
        #mod-manual-modal .mm-tag{background:rgba(88,101,242,.25);color:#a5b4fc;border-radius:3px;padding:0 5px;font-size:10px;font-weight:700;flex-shrink:0}
        #mod-manual-modal .mm-tag.g{background:rgba(35,165,90,.25);color:#57f287}
        #mod-manual-modal .mm-tag.y{background:rgba(240,178,50,.25);color:#f0b232}
      `;
      document.head.appendChild(mmStyle);

      box.appendChild(head);
      box.appendChild(body);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      const close = () => { overlay.remove(); mmStyle.remove(); };
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      box.querySelector("#mod-manual-close").onclick = close;
    }

    function createDropdown(
      container,
      text,
      mediaUrl,
      isSymbolsView = false,
      toggleCallback,
      refreshCallback,
      symbolsPage = 0,
    ) {
      config = getConfig();
      const dropdown = document.createElement("div");
      dropdown.className = "msg-copy-dropdown";

      // Global hover handling for tolerance
      dropdown.addEventListener("mouseenter", cancelCloseGlobalMenu);
      dropdown.addEventListener("mouseleave", scheduleCloseGlobalMenu);

      // Header
      const header = document.createElement("div");
      header.className = "msg-copy-header";
      const leftSpan = document.createElement("span");
      leftSpan.className = "msg-copy-header-left";
      leftSpan.innerText = isSymbolsView ? t("view_symbols") : t("view_main");
      const rightContainer = document.createElement("div");
      rightContainer.className = "msg-copy-header-right";

      // --- Header Action Icons ---
      const createHeaderIcon = (icon, title, activeCondition, onClick) => {
        const el = document.createElement("span");
        el.className = `msg-copy-header-icon ${activeCondition ? "active" : ""}`;
        el.innerText = icon;
        el.title = title;
        el.onclick = (e) => {
          e.stopPropagation();
          cancelCloseGlobalMenu(); // Keep menu open
          onClick();
          refreshCallback(isSymbolsView);
        };
        return el;
      };

      // 1. Menu Style
      rightContainer.appendChild(
        createHeaderIcon(
          config.menuStyle === "group" ? "≡" : "◫",
          t("tip_style"),
          config.menuStyle === "group",
          () => {
            const newVal = config.menuStyle === "group" ? "general" : "group";
            localStorage.setItem("copyMenuStyle", newVal);
          },
        ),
      );
      // 2. Logic Swap
      rightContainer.appendChild(
        createHeaderIcon("⇄", t("tip_logic"), config.swapLogic, () =>
          localStorage.setItem("copySwapLogic", !config.swapLogic),
        ),
      );
      // 3. Append Space
      rightContainer.appendChild(
        createHeaderIcon("␣", t("tip_space"), config.appendSpace, () =>
          localStorage.setItem("copyAppendSpace", !config.appendSpace),
        ),
      );
      // 4. Append Newline
      rightContainer.appendChild(
        createHeaderIcon("↵", t("tip_newline"), config.appendNewLine, () =>
          localStorage.setItem("copyAppendNewLine", !config.appendNewLine),
        ),
      );
      // 5. Symbols View Toggle
      const symIcon = document.createElement("span");
      symIcon.className = `msg-copy-header-icon ${isSymbolsView ? "active" : ""}`;
      symIcon.innerText = "☆";
      symIcon.title = t("tip_symbols");
      symIcon.onclick = (e) => {
        e.stopPropagation();
        cancelCloseGlobalMenu();
        toggleCallback(!isSymbolsView);
      };
      rightContainer.appendChild(symIcon);

      // 6. Trigger Mode
      rightContainer.appendChild(
        createHeaderIcon(
          "🖱️",
          t("tip_trigger"),
          config.triggerMode === "click",
          () => {
            const newVal = config.triggerMode === "hover" ? "click" : "hover";
            localStorage.setItem("copyTriggerMode", newVal);
            showToast(t("mode_changed", { mode: newVal.toUpperCase() }));
          },
        ),
      );
      // 7. Language
      const langIcon = document.createElement("span");
      langIcon.className = "msg-copy-header-icon";
      langIcon.innerText = "🌐";
      langIcon.title = t("tip_lang");
      langIcon.onclick = (e) => {
        e.stopPropagation();
        cancelCloseGlobalMenu(); // Keep open
        showLanguageSelector();
      };
      rightContainer.appendChild(langIcon);
      // 8. Settings Panel (Gear) — 模組開關 + 說明書
      // § 10 — Gear wrapper（讓紅點可 absolute 定位）
      const gearWrap = document.createElement("span");
      gearWrap.className = "dmt-gear-wrap";

      const gearIcon = document.createElement("span");
      gearIcon.className = "msg-copy-header-icon";
      gearIcon.innerText = "⚙️";
      gearIcon.title = t("tip_manual");
      gearIcon.onclick = (e) => {
        e.stopPropagation();
        cancelCloseGlobalMenu();
        showModuleSettingsPanel(gearIcon);
      };

      gearWrap.appendChild(gearIcon);

      // 若有任何模組仍為 New，顯示紅點
      const hasAnyNew = Object.keys(NEW_FEATURES).some(k => isFeatureNew(k));
      if (hasAnyNew) {
        const dot = document.createElement("span");
        dot.className = "dmt-gear-dot";
        gearWrap.appendChild(dot);
      }

      rightContainer.appendChild(gearWrap);

      header.appendChild(leftSpan);
      header.appendChild(rightContainer);
      dropdown.appendChild(header);

      // Content
      if (isSymbolsView) {
        const PAGE_SIZE = 12;
        const totalPages = Math.max(
          1,
          Math.ceil(config.symbols.length / PAGE_SIZE),
        );
        const currentPage = Math.min(symbolsPage, totalPages - 1);
        const pageSymbols = config.symbols.slice(
          currentPage * PAGE_SIZE,
          (currentPage + 1) * PAGE_SIZE,
        );

        // ── 拖曳狀態：用 window 層級變數，跨頁翻頁後仍能取得 srcIndex ──
        // （閉包在翻頁後會死，所以不能放在閉包內）
        if (!window._symDragState) {
          window._symDragState = { srcIndex: -1, hoverTimer: null };
        }
        const DS = window._symDragState;
        const clearDropTimer = () => {
          if (DS.hoverTimer) {
            clearTimeout(DS.hoverTimer);
            DS.hoverTimer = null;
          }
        };

        if (config.symbols.length) {
          pageSymbols.forEach((s, localIdx) => {
            const absIdx = currentPage * PAGE_SIZE + localIdx;

            const row = document.createElement("div");
            row.style.cssText =
              "display:flex; align-items:center; justify-content:space-between; padding:0 12px;";
            // ❌ row 本身不設 draggable，防止點擊 insertBtn 誤觸發拖曳
            row.dataset.absIdx = absIdx;

            // ── ⠿ 手把：唯一可拖動元素 ──────────────────────────────────
            const handle = document.createElement("span");
            handle.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true" style="display:block;pointer-events:none">
              <circle cx="2.5" cy="2.5"  r="1.5"/>
              <circle cx="7.5" cy="2.5"  r="1.5"/>
              <circle cx="2.5" cy="7"    r="1.5"/>
              <circle cx="7.5" cy="7"    r="1.5"/>
              <circle cx="2.5" cy="11.5" r="1.5"/>
              <circle cx="7.5" cy="11.5" r="1.5"/>
            </svg>`;
            handle.style.cssText =
              "color:#555; margin-right:6px; cursor:grab; user-select:none; flex-shrink:0; display:inline-flex; align-items:center;";
            handle.draggable = true;

            handle.addEventListener("dragstart", (e) => {
              DS.srcIndex = absIdx;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(absIdx));
              handle.style.color = "#7289da";
              setTimeout(() => {
                row.style.opacity = "0.4";
              }, 0);
            });
            handle.addEventListener("dragend", () => {
              row.style.opacity = "1";
              handle.style.color = "#555";
              clearDropTimer();
              dropdown
                .querySelectorAll("[data-abs-idx]")
                .forEach((el) => (el.style.outline = ""));
              DS.srcIndex = -1;
            });

            // ── row 作為 drop target ──────────────────────────────────────
            row.addEventListener("dragover", (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              dropdown
                .querySelectorAll("[data-abs-idx]")
                .forEach((el) => (el.style.outline = ""));
              row.style.outline = "1px dashed #7289da";
            });
            row.addEventListener("dragleave", () => {
              row.style.outline = "";
            });
            row.addEventListener("drop", (e) => {
              e.preventDefault();
              e.stopPropagation();
              row.style.outline = "";
              const src = DS.srcIndex;
              const tgt = parseInt(row.dataset.absIdx, 10);
              if (src === -1 || src === tgt) return;

              // ✅ 重排順序（不是交換）：從 src 移除，插入到 tgt 位置
              const arr = [...config.symbols];
              const [moved] = arr.splice(src, 1);
              // splice 後陣列縮短，若 src < tgt 則實際插入點要 -1 已自動補正
              const insertAt = src < tgt ? tgt - 1 : tgt;
              arr.splice(insertAt, 0, moved);
              config.symbols = arr;
              saveSymbols();
              DS.srcIndex = -1;
              const landPage = Math.floor(insertAt / PAGE_SIZE);
              refreshCallback(true, landPage);
            });

            const insertBtn = document.createElement("button");
            insertBtn.textContent = t("insert_symbol", { s: s });
            insertBtn.style.cssText =
              "flex:1; white-space:nowrap; text-align:left; padding:6px 0;";
            bindButtonAction(insertBtn, s, s);

            const delBtn = document.createElement("button");
            delBtn.textContent = t("delete_symbol");
            delBtn.style.cssText = "margin-left:8px; width:auto; color:#f88;";
            delBtn.onclick = (e) => {
              e.stopPropagation();
              config.symbols = config.symbols.filter((item) => item !== s);
              saveSymbols();
              const newTotal = Math.max(
                1,
                Math.ceil(config.symbols.length / PAGE_SIZE),
              );
              const newPage = Math.min(currentPage, newTotal - 1);
              refreshCallback(true, newPage);
              showToast(t("delete_confirm", { s: s }));
            };

            row.appendChild(handle);
            row.appendChild(insertBtn);
            row.appendChild(delBtn);
            dropdown.appendChild(row);
          });
        } else {
          const empty = document.createElement("div");
          empty.innerText = t("remove_empty");
          empty.style.cssText = "padding:12px; color:#aaa; text-align:center;";
          dropdown.appendChild(empty);
        }

        // 分頁控制列（超過一頁才顯示）
        if (totalPages > 1) {
          const pageBar = document.createElement("div");
          pageBar.style.cssText =
            "display:flex; align-items:center; justify-content:center; gap:6px; padding:4px 12px;";

          const makePagBtn = (label, targetPage, disabled) => {
            const btn = document.createElement("button");
            btn.textContent = label;
            btn.style.cssText = `width:28px; padding:2px 0; opacity:${disabled ? "0.3" : "1"};`;
            btn.disabled = disabled;
            btn.onclick = (e) => {
              e.stopPropagation();
              refreshCallback(true, targetPage);
            };

            // 拖曳懸停自動翻頁（600ms）
            btn.addEventListener("dragover", (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (!DS.hoverTimer && !disabled) {
                DS.hoverTimer = setTimeout(() => {
                  DS.hoverTimer = null;
                  // srcIndex 已存在 DS，翻頁後仍可用
                  refreshCallback(true, targetPage);
                }, 600);
              }
            });
            btn.addEventListener("dragleave", clearDropTimer);
            btn.addEventListener("drop", (e) => {
              e.preventDefault();
              clearDropTimer();
              const src = DS.srcIndex;
              if (src === -1 || disabled) return;
              // 拖到分頁按鈕：移到目標頁的第一個位置
              const tgt = targetPage * PAGE_SIZE;
              const arr = [...config.symbols];
              const [moved] = arr.splice(src, 1);
              const insertAt = Math.min(tgt, arr.length);
              arr.splice(insertAt, 0, moved);
              config.symbols = arr;
              saveSymbols();
              DS.srcIndex = -1;
              refreshCallback(true, targetPage);
            });
            return btn;
          };

          const prevBtn = makePagBtn("◀", currentPage - 1, currentPage === 0);
          const pageLabel = document.createElement("span");
          pageLabel.textContent = `${currentPage + 1} / ${totalPages}`;
          pageLabel.style.cssText =
            "font-size:11px; color:#aaa; min-width:40px; text-align:center;";
          const nextBtn = makePagBtn(
            "▶",
            currentPage + 1,
            currentPage === totalPages - 1,
          );

          pageBar.appendChild(prevBtn);
          pageBar.appendChild(pageLabel);
          pageBar.appendChild(nextBtn);
          dropdown.appendChild(pageBar);
        }

        const manageDiv = document.createElement("div");
        manageDiv.className = "msg-copy-manage";
        const addBtn = document.createElement("button");
        addBtn.textContent = t("add_symbol");
        addBtn.onclick = () => {
          const val = prompt(t("add_symbol_prompt"))?.trim();
          if (val && !config.symbols.includes(val)) {
            config.symbols = [...config.symbols, val]; // Fix: 賦值觸發 Proxy set，正確寫入 localStorage
            const newTotal = Math.max(
              1,
              Math.ceil(config.symbols.length / PAGE_SIZE),
            );
            refreshCallback(true, newTotal - 1);
            showToast(t("add_success"));
          }
        };
        const removeBtn = document.createElement("button");
        removeBtn.textContent = t("remove_symbol");
        removeBtn.onclick = () => {
          if (config.symbols.length === 0) return showToast(t("remove_empty"));
          const val = prompt(
            `${t("remove_symbol_prompt")}\n${config.symbols.join("\n")}`,
          )?.trim();
          if (val && config.symbols.includes(val)) {
            config.symbols = config.symbols.filter((s) => s !== val);
            saveSymbols();
            const newTotal = Math.max(
              1,
              Math.ceil(config.symbols.length / PAGE_SIZE),
            );
            const newPage = Math.min(currentPage, newTotal - 1);
            refreshCallback(true, newPage);
            showToast(t("delete_confirm", { s: val }));
          }
        };
        manageDiv.appendChild(addBtn);
        manageDiv.appendChild(removeBtn);
        dropdown.appendChild(manageDiv);
      } else {
        const sections = { copy: [], convert: [], download: [], system: [], webhook: [] };
        const addItem = (
          section,
          label,
          copyValue,
          insertValue = null,
          editConfig = null,
        ) => {
          const btn = document.createElement("button");
          btn.textContent = label;
          bindButtonAction(btn, copyValue, insertValue);

          if (editConfig) {
            const editBtn = document.createElement("span");
            editBtn.className = "msg-copy-edit-btn";
            editBtn.innerText = "✏️";

            // CRITICAL FIX: Stop propagation on all mouse events to prevent parent button trigger
            ["mousedown", "mouseup", "click"].forEach((evt) => {
              editBtn.addEventListener(evt, (e) => e.stopPropagation());
            });
            editBtn.onclick = (e) => {
              e.stopPropagation();
              cancelCloseGlobalMenu();
              const newVal = prompt(t("enter_link_text"), config.linkText);
              if (newVal !== null) {
                const finalVal = newVal.trim() === "" ? "" : newVal.trim();
                localStorage.setItem("copyLinkText", finalVal);
                refreshCallback(false);
              }
            };
            btn.appendChild(editBtn);
          }

          sections[section].push(btn);
        };
        const safeText = typeof text === "string" ? text : "";
        const rawLinks = extractLinks(safeText);
        const links = rawLinks.map(cleanUrl);
        if (safeText) addItem("copy", t("copy_text"), safeText);
        else if (mediaUrl) addItem("copy", t("copy_media_url"), mediaUrl);
        else addItem("copy", t("no_content"), "");

        // ============================================================
        // 下載功能 v2：支援 Discord 附件 + 嵌入式影片 (Embed Video)
        // ============================================================

        // 1. 抓取 Discord 原生附件 (具有下載按鈕的檔案)
        // 排除 Tenor / 外部 embed 的 originalLink（href 是網頁 URL 非媒體檔案），
        // 這類訊息的實際影片由 embedVideos 路徑負責，避免重複計算。
        const _attachmentSeenPaths = new Set();
        const attachmentLinks = Array.from(
          container.querySelectorAll('a[class*="originalLink"]'),
        ).filter((link) => {
          const href = link.href || "";
          // 必須是 Discord CDN 或 media CDN 的附件連結
          const isDiscordCdn =
            href.includes("cdn.discordapp.com/attachments/") ||
            href.includes("media.discordapp.net/attachments/");
          if (!isDiscordCdn) {
            // data-safe-src に /external/ が含まれる → Discord プロキシ経由の外部画像（Twitter 等）
            const safeSrc = link.dataset?.safeSrc || "";
            if (safeSrc.includes("/external/")) return true;
            // ?format=jpg 等のクエリパラメータ形式にも対応
            if (/[?&]format=(jpg|jpeg|png|gif|webp)(&|$)/i.test(href)) return true;
            return isLikelyMediaFile(href);
          }

          // Discord CDN 附件：進一步確認是圖片或影片（排除 zip/pdf 等）
          try {
            const pathname = new URL(href).pathname;
            const hasNonMediaExt = /\.(zip|rar|7z|gz|tar|pdf|txt|doc|docx|xls|xlsx|ppt|pptx|json|xml|csv|exe|dmg|apk|js|ts|html|css)([?#]|$)/i.test(pathname);
            if (hasNonMediaExt) return false;
            // pathname ベースで重複除去（同一ファイルが cdn/media 両ドメインで現れる場合）
            if (_attachmentSeenPaths.has(pathname)) return false;
            _attachmentSeenPaths.add(pathname);
          } catch (_) {}

          return true;
        });

        // 1b. 非メディア附件（zip, pdf, 無拡張子ファイル等）
        // Discord の非画像附件は <a class="fileNameLink__*"> として存在し originalLink_ を持たない
        // ダウンロードボタン <a class="hoverButton__*"> の href も同じ URL なので fileNameLink を優先使用
        const _fileSeenPaths = new Set([..._attachmentSeenPaths]); // 画像と重複しないよう
        // fileNameLink_（一般附件）と metadataDownload_（音声附件）の両方を収集
        const fileAttachmentLinks = Array.from(
          container.querySelectorAll('a[class*="fileNameLink_"], a[class*="metadataDownload_"]'),
        ).filter((link) => {
          const href = link.href || "";
          if (!href.includes("cdn.discordapp.com/attachments/")) return false;
          try {
            const pathname = new URL(href).pathname;
            if (_fileSeenPaths.has(pathname)) return false; // 画像と重複排除
            _fileSeenPaths.add(pathname);
          } catch (_) {}
          return true;
        });

        // 2. 抓取所有可見的 <video> 元素
        // 這包含了原生的影片附件以及 Embed (Twitter/X, YouTube 等預覽)
        const allVideoElements = Array.from(
          container.querySelectorAll("video"),
        );

        // 2.5 抓取訊息文字中的 Markdown 超連結媒體 URL
        // 針對 [text](https://video.twimg.com/...) 這類 Markdown 連結語法
        // Discord 渲染後是普通 <a> 標籤，無 originalLink class，也不產生 <video>
        const markdownMediaLinks = (() => {
          const allAnchors = Array.from(container.querySelectorAll("a[href]"));
          const existingHrefs = new Set([
            ...attachmentLinks.map((l) => l.href),
            ...allVideoElements.map(
              (v) => v.src || v.querySelector("source")?.src || "",
            ),
          ]);
          return allAnchors.filter((a) => {
            const href = a.href;
            if (!href || existingHrefs.has(href)) return false;
            // 僅收錄明確是媒體檔案的連結
            return isLikelyMediaFile(href);
          });
        })();

        // 3. 過濾出 "非重複" 的嵌入式影片
        // Discord 對 [text](url) 語法會同時產生 <a> 和 <video> preview，
        // markdownMediaLinks 已收錄該 <a> href，因此 embedVideos 必須排除相同 URL。
        // 三種 URL 模式必須統一標準化後才能正確比對：
        //   1. cdn.discordapp.com/attachments/...     → 直接去除 query string
        //   2. media.discordapp.net/attachments/...   → 同上（domain 不同但 pathname 相同）
        //   3. images-ext-N.discordapp.net/external/{hash}/{protocol}/{domain}/{path}
        //                                             → 解出真實來源 URL 再去除 query string
        const resolveUrlForComparison = (url) => {
          if (!url) return "";
          try {
            // 處理 Discord 外部代理 URL（images-ext-*.discordapp.net/external/...）
            if (url.includes("/external/")) {
              const match = url.match(/\/external\/[^/]+\/(https?)\/(.+)/);
              if (match) {
                const resolved = `${match[1]}://${match[2]}`;
                return resolved.split("?")[0];
              }
            }
            // cdn / media discordapp：pathname 相同，統一用 pathname 比對
            return new URL(url).pathname;
          } catch (e) {
            DEBUG && console.warn("[resolveUrlForComparison] URL 解析失敗，回退原始值", url, e);
            return url.split("?")[0];
          }
        };
        const markdownMediaHrefs = new Set(
          markdownMediaLinks.map((a) => resolveUrlForComparison(a.href)),
        );
        const embedVideos = allVideoElements.filter((video) => {
          const videoSrc = video.src || video.querySelector("source")?.src;
          if (!videoSrc) return false;
          const videoKey = resolveUrlForComparison(videoSrc);

          // 排除已在 attachmentLinks 中的連結
          if (
            attachmentLinks.some(
              (link) => resolveUrlForComparison(link.href) === videoKey,
            )
          )
            return false;

          // 排除已在 markdownMediaLinks 中的連結（避免與 <a> 重複計算）
          if (markdownMediaHrefs.has(videoKey)) return false;

          return true;
        });

        const totalDownloadCount =
          attachmentLinks.length +
          fileAttachmentLinks.length +
          embedVideos.length +
          markdownMediaLinks.length;

        if (totalDownloadCount > 0) {
          const dlBtn = document.createElement("button");
          dlBtn.textContent =
            totalDownloadCount > 1
              ? `${t("download_images")} (${totalDownloadCount})`
              : t("download_images");

          // 左鍵：下載媒體
          dlBtn.onclick = (e) => {
            showToast(t("download_start"));

            // --- A. 處理原生附件 (維持原有邏輯) ---
            // 為了動畫效果,先收集所有圖片/影片元素
            const visualMedia = [
              ...Array.from(
                container.querySelectorAll('img[src^="http"]'),
              ).filter(
                (img) =>
                  (img.closest('[class*="imageWrapper"]') ||
                    img.closest('[class*="embed"]')) &&
                  isValidContentImage(img),
              ),
              ...allVideoElements,
            ];

            attachmentLinks.forEach((link, index) => {
              const rawUrl = resolveRealFileUrl(link);
              // 嘗試找到對應的 DOM 元素做飛入動畫
              let sourceEl = findMediaElementByUrl(container, rawUrl);
              if (!sourceEl) sourceEl = visualMedia[index] || visualMedia[0];

              if (sourceEl) {
                setTimeout(
                  () => animateFlyToTopRight(sourceEl, e.clientX, e.clientY),
                  index * 75,
                );
              }

              // 使用智能檔名生成器
              const filename = generateSmartFilename(container, rawUrl, index);

              setTimeout(() => {
                downloadFile(rawUrl, filename);
              }, index * 200);
            });

            // --- B. 處理嵌入式影片 (Embed Videos) ---
            embedVideos.forEach((video, i) => {
              let rawUrl = video.src || video.querySelector("source")?.src;

              // 動畫效果：直接使用該 video 元素
              setTimeout(
                () => animateFlyToTopRight(video, e.clientX, e.clientY),
                (attachmentLinks.length + i) * 75,
              );

              // 使用智能檔名生成器 (影片通常為.mp4)
              let filename = generateSmartFilename(
                container,
                rawUrl,
                attachmentLinks.length + i,
              );

              // 從 URL 推斷影片副檔名，不強制 .mp4（避免誤判 webm 等）
              if (filename && !filename.match(/\.(mp4|webm|mov|mkv|avi|m4v)$/i)) {
                const extFromUrl = rawUrl?.match(/\.(mp4|webm|mov|mkv|avi|m4v)([?#]|$)/i)?.[1];
                filename = filename.replace(/\.\w+$/, "") + "." + (extFromUrl || "mp4");
              }

              setTimeout(
                () => {
                  if (rawUrl) downloadFile(rawUrl, filename);
                },
                (attachmentLinks.length + i) * 200,
              );
            });

            // --- C. 處理 Markdown 超連結媒體 ([text](url) 語法) ---
            markdownMediaLinks.forEach((link, i) => {
              const rawUrl = link.href;
              const baseOffset = attachmentLinks.length + embedVideos.length;

              setTimeout(
                () => animateFlyToTopRight(link, e.clientX, e.clientY),
                (baseOffset + i) * 75,
              );

              let filename = generateSmartFilename(
                container,
                rawUrl,
                baseOffset + i,
              );
              // 推斷副檔名
              if (
                filename &&
                !/\.(mp4|webm|mov|mkv|jpg|jpeg|png|gif|webp)$/i.test(filename)
              ) {
                const extMatch = rawUrl.match(
                  /\.(mp4|webm|mov|mkv|jpg|jpeg|png|gif|webp)([?#]|$)/i,
                );
                filename =
                  filename.replace(/\.\w+$/, "") +
                  (extMatch ? "." + extMatch[1] : ".mp4");
              }

              setTimeout(
                () => {
                  if (rawUrl) downloadFile(rawUrl, filename);
                },
                (baseOffset + i) * 200,
              );
            });

            // --- D. 處理非媒體附件（zip / pdf / 無副檔名檔案等）---
            const fileBaseOffset = attachmentLinks.length + embedVideos.length + markdownMediaLinks.length;
            fileAttachmentLinks.forEach((link, i) => {
              const rawUrl = link.href;
              // ファイル名は <a> のテキストから取得（DOM に表示されているファイル名）
              const displayName = link.textContent?.trim() || "";
              // pathname からファイル名を取得（クエリ文字列を除く）
              let filename = displayName || (() => {
                try {
                  const p = new URL(rawUrl).pathname;
                  return decodeURIComponent(p.substring(p.lastIndexOf("/") + 1)).split("?")[0];
                } catch (_) { return `discord_file_${Date.now()}_${i}`; }
              })();

              setTimeout(() => {
                downloadFile(rawUrl, filename);
              }, (fileBaseOffset + i) * 200);
            });

            closeGlobalMenu();
          };

          // 共用：從 Discord proxy URL 提取原始來源 URL
          const extractSourceUrl = (proxyUrl) => {
            try {
              const cleanUrl = proxyUrl.split("?")[0];
              const match = cleanUrl.match(/\/external\/([^?]+)/);
              if (!match) return proxyUrl;
              const decoded = decodeURIComponent(match[1]);
              const parts = decoded.split("/");
              const protocolIdx = parts.findIndex((p) => p === "http" || p === "https");
              if (protocolIdx !== -1) {
                return `${parts[protocolIdx]}://${parts.slice(protocolIdx + 1).join("/")}`.replace(/%3A/g, ":");
              }
              if (parts.length >= 3 && parts[0].length >= 40) {
                const rem = parts.slice(1);
                const pi2 = rem.findIndex((p) => p === "http" || p === "https");
                if (pi2 !== -1) return `${rem[pi2]}://${rem.slice(pi2 + 1).join("/")}`.replace(/%3A/g, ":");
                if (rem.length >= 2) return `https://${rem.join("/")}`.replace(/%3A/g, ":");
              }
              if (decoded.startsWith("http://") || decoded.startsWith("https://")) return decoded;
              return cleanUrl;
            } catch (_) { return proxyUrl.split("?")[0]; }
          };

          // 共用：收集所有媒體 URL
          const _collectMediaUrls = () => {
            const urls = [];
            attachmentLinks.forEach((link) => {
              const href = link.href;
              const raw = href.includes("/external/") ? extractSourceUrl(href) : (resolveRealFileUrl(link) || href);
              if (raw) urls.push(raw);
            });
            embedVideos.forEach((video) => {
              const rawUrl = video.src || video.querySelector("source")?.src;
              if (rawUrl) urls.push(rawUrl.includes("/external/") ? extractSourceUrl(rawUrl) : rawUrl);
            });
            markdownMediaLinks.forEach((link) => { if (link.href) urls.push(link.href); });
            fileAttachmentLinks.forEach((link) => { if (link.href) urls.push(link.href); });
            return urls;
          };

          // 右鍵：複製純媒體 URL
          // Shift+右鍵：複製帶前綴的媒體 URL（[linkText](url) 格式）
          dlBtn.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const collected = _collectMediaUrls();
            if (collected.length === 0) return;

            let textToCopy;
            let toastMsg;

            if (e.shiftKey) {
              // Shift+右鍵：帶前綴格式
              const prefix = config.linkText || "";
              textToCopy = collected.map((u) => `[${prefix || u}](${u})`).join("\n");
              toastMsg = t("copy_media_prefixed", { n: collected.length });
            } else {
              // 普通右鍵：純 URL
              textToCopy = collected.join("\n");
              toastMsg = t("copy_media_urls", { n: collected.length });
            }

            if (typeof GM_setClipboard === "function") {
              GM_setClipboard(textToCopy);
              showToast(toastMsg);
            } else {
              navigator.clipboard.writeText(textToCopy)
                .then(() => showToast(toastMsg))
                .catch(() => showToast(t("copy_fail")));
            }

            closeGlobalMenu();
          });

          sections.download.push(dlBtn);
        }

        if (links.length >= 1) {
          addItem("copy", t("copy_first_link"), links[0]);
          addItem(
            "copy",
            t("copy_markdown"),
            `[${links[0]}](${links[0]})`,
            `[${links[0]}](${links[0]})`,
          );
        }
        if (links.length > 1)
          addItem("copy", t("copy_all_links"), links.join("\n"));
        if (links.length >= 1) {
          // Dynamic Link Format Logic
          const linkPrefix = config.linkText || "";
          const displayPrefix = linkPrefix ? linkPrefix : "";

          const labelStyle =
            linkPrefix && linkPrefix !== "" ? `style="color:cyan"` : "";
          // [XSS-L0] escHtml 防禦：linkPrefix 來自 localStorage（用戶可控），注入 innerHTML 前必須逸出
          const displayLabel = linkPrefix ? escHtml(linkPrefix) : " ";
          const bracketed = links
            .map((url) => `[${linkPrefix}](${url})`)
            .join(" || ");

          // Construct button manually to support HTML innerHTML
          const label = t("insert_format_link", {
            t: `<span ${labelStyle}>${displayLabel}</span>`,
          });
          const btn = document.createElement("button");
          btn.innerHTML = label;
          bindButtonAction(btn, bracketed, bracketed);

          const editBtn = document.createElement("span");
          editBtn.className = "msg-copy-edit-btn";
          editBtn.innerText = "✏️";
          // FIX: Stop propagation on all mouse events for the edit button
          ["mousedown", "mouseup", "click"].forEach((evt) => {
            editBtn.addEventListener(evt, (e) => e.stopPropagation());
          });
          editBtn.onclick = (e) => {
            e.stopPropagation();
            cancelCloseGlobalMenu();
            const newVal = prompt(t("enter_link_text"), config.linkText);
            if (newVal !== null) {
              const finalVal = newVal.trim() === "" ? "" : newVal.trim();
              localStorage.setItem("copyLinkText", finalVal);
              refreshCallback(false);
            }
          };
          btn.appendChild(editBtn);
          sections.copy.push(btn);
        }
        const hiddenSource = safeText || mediaUrl || links[0];
        if (hiddenSource)
          addItem("copy", t("copy_hidden_format"), `|| ${hiddenSource} ||`);
        if (mediaUrl && mediaUrl.includes("i.pixiv.cat/img-original/")) {
          const match = mediaUrl.match(
            /\/(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d+)_p\d+\.(jpg|png|gif)/,
          );
          if (match)
            addItem(
              "convert",
              t("restore_pixiv_img"),
              `https://www.phixiv.net/artworks/${match[7]}`,
            );
        }

        const DOMAIN_GROUPS = [
          {
            type: "twitter",
            label: "Twitter / X",
            domains: [
              "twitter.com",
              "x.com",
              "vxtwitter.com",
              "fixupx.com",
              "fxtwitter.com",
              "cunnyx.com",
              "fixvx.com",
            ],
            labels: {
              "twitter.com": "to_twitter",
              "x.com": "to_x",
              "vxtwitter.com": "to_vxtwitter",
              "fixupx.com": "to_fixupx",
              "fxtwitter.com": "to_fxtwitter",
              "cunnyx.com": "to_cunnyx",
              "fixvx.com": "to_fixvx",
            },
          },
          {
            type: "reddit",
            label: "Reddit",
            domains: [
              "reddit.com",
              "old.reddit.com",
              "rxddit.com",
              "vxreddit.com",
            ],
            labels: {
              "reddit.com": "to_reddit",
              "old.reddit.com": "to_old_reddit",
              "rxddit.com": "to_rxddit",
              "vxreddit.com": "to_vxreddit",
            },
          },
          {
            type: "instagram",
            label: "Instagram",
            domains: [
              "instagram.com",
              "kkinstagram.com",
              "vxinstagram.com",
              "ddinstagram.com",
              "uuinstagram.com",
            ],
            labels: {
              "instagram.com":   "to_instagram",
              "kkinstagram.com": "to_kkinstagram",
              "vxinstagram.com": "to_vxinstagram",
              "ddinstagram.com": "to_ddinstagram",
              "uuinstagram.com": "to_uuinstagram",
            },
          },
          {
            type: "tiktok",
            label: "TikTok",
            domains: ["tiktok.com", "vxtiktok.com", "tnktok.com"],
            labels: {
              "tiktok.com": "to_tiktok",
              "vxtiktok.com": "to_vxtiktok",
              "tnktok.com": "to_tnktok",
            },
          },
          {
            type: "threads",
            label: "Threads",
            domains: ["threads.com", "threads.net", "fixthreads.seria.moe"],
            labels: {
              "threads.com": "to_threads",
              "threads.net": "to_threads",
              "fixthreads.seria.moe": "to_fixthreads",
            },
          },
          {
            type: "facebook",
            label: "Facebook",
            domains: ["facebook.com", "facebed.com"],
            labels: {
              "facebook.com": "to_facebook",
              "facebed.com": "to_facebed",
            },
          },
        ];

        // ── Conv-Pref helpers ────────────────────────────────────────────
        const CONV_PREF_KEY  = (type) => `conv_pref_${type}`;
        const CONV_SEEN_KEY  = "conv_pref_seen"; // 已點過⚙，消除 NEW 徽章
        function getConvPrefs(type) {
          const raw = GMStore.get(CONV_PREF_KEY(type), "");
          return raw ? raw.split(",").filter(Boolean) : [];
        }
        function setConvPrefs(type, domains) {
          GMStore.set(CONV_PREF_KEY(type), domains.join(","));
        }
        function isConvPrefSeen() {
          return GMStore.get(CONV_SEEN_KEY, "") === "1";
        }
        function markConvPrefSeen() {
          GMStore.set(CONV_SEEN_KEY, "1");
        }

        // ── Conv-Pref Panel builder ──────────────────────────────────────
        function openConvPrefPanel(anchorEl) {
          markConvPrefSeen();
          // 移除 NEW 徽章
          document.querySelectorAll(".dmt-conv-gear-badge").forEach(b => b.remove());

          const existing = document.getElementById("dmt-conv-pref-panel");
          if (existing) { existing.remove(); return; }

          const panel = document.createElement("div");
          panel.id = "dmt-conv-pref-panel";

          // Header
          const header = document.createElement("div");
          header.className = "dmt-cp-header";
          header.innerHTML = `<span>⚙ 轉換服務偏好</span>`;
          const closeBtn = document.createElement("span");
          closeBtn.className = "dmt-cp-close";
          closeBtn.textContent = "✕";
          closeBtn.onclick = () => panel.remove();
          header.appendChild(closeBtn);
          panel.appendChild(header);

          const body = document.createElement("div");
          body.className = "dmt-cp-body";

          // 每個 DOMAIN_GROUPS type 一組 checkbox
          DOMAIN_GROUPS.forEach(group => {
            const prefs = getConvPrefs(group.type);
            const title = document.createElement("div");
            title.className = "dmt-cp-group-title";
            title.textContent = group.label;
            body.appendChild(title);

            // 取得唯一 domain 列表
            const uniqueDomains = [...new Set(group.domains)];
            uniqueDomains.forEach(domain => {
              const row = document.createElement("label");
              row.className = "dmt-cp-row";
              const chk = document.createElement("input");
              chk.type = "checkbox";
              // 無偏好（全顯示）時全部打勾，有偏好時只打勾已選的
              chk.checked = prefs.length === 0 || prefs.includes(domain);
              chk.dataset.domain = domain;
              chk.dataset.type   = group.type;
              chk.addEventListener("change", () => {
                // 收集該 type 所有已勾選 domain
                const checked = [...panel.querySelectorAll(`input[data-type="${group.type}"]`)]
                  .filter(c => c.checked)
                  .map(c => c.dataset.domain);
                // 全勾 = 等同無偏好，存空字串
                const allDomains = [...new Set(group.domains)];
                const newPrefs = checked.length === allDomains.length ? [] : checked;
                setConvPrefs(group.type, newPrefs);
              });
              row.appendChild(chk);
              const lbl = document.createElement("span");
              lbl.textContent = domain;
              row.appendChild(lbl);
              body.appendChild(row);
            });
          });

          panel.appendChild(body);

          // Hint
          const hint = document.createElement("div");
          hint.className = "dmt-cp-hint";
          hint.textContent = "☑ 全勾 = 顯示全部（預設）\n✕ 取消勾選 = 隱藏該服務";
          panel.appendChild(hint);

          // Reset button
          const resetBtn = document.createElement("button");
          resetBtn.className = "dmt-cp-reset";
          resetBtn.textContent = "↺ 重設所有偏好";
          resetBtn.onclick = () => {
            DOMAIN_GROUPS.forEach(g => setConvPrefs(g.type, []));
            panel.remove();
            showToast("✅ 已重設為顯示全部服務");
          };
          panel.appendChild(resetBtn);

          // 定位：錨定到 gear button 左下角
          document.body.appendChild(panel);
          const rect = anchorEl.getBoundingClientRect();
          const pw = panel.offsetWidth || 240;
          const ph = panel.offsetHeight || 300;
          let left = rect.right - pw;
          if (left < 8) left = 8;
          let top  = rect.bottom + 4;
          if (top + ph > window.innerHeight - 8) top = rect.top - ph - 4;
          panel.style.left = `${left}px`;
          panel.style.top  = `${top}px`;

          // 點外部關閉
          const onOutside = (e) => {
            if (!panel.contains(e.target) && e.target !== anchorEl) {
              panel.remove();
              document.removeEventListener("mousedown", onOutside, true);
            }
          };
          setTimeout(() => document.addEventListener("mousedown", onOutside, true), 0);
        }
        const collectedLinks = {
          twitter: [],
          reddit: [],
          instagram: [],
          tiktok: [],
          threads: [],
          facebook: [],
          bilibili: [],
          pixiv: [],
        };
        links.forEach((url) => {
          const urlObj = new URL(url);
          const currentHost = urlObj.hostname.replace(/^www\./, "");
          const path = urlObj.pathname + urlObj.search;
          if (url.includes("discordapp.net/external/"))
            addItem(
              "convert",
              t("original_url"),
              decodeURIComponent(url.split("external/")[1]),
            );
          if (url.includes("imgur.com"))
            addItem(
              "convert",
              t("convert_imgur"),
              url.replace(
                /^https?:\/\/(i\.|www\.)?imgur\.com\//,
                "https://i.imgur.com/",
              ),
            );
          DOMAIN_GROUPS.forEach((group) => {
            if (group.domains.includes(currentHost))
              collectedLinks[group.type].push({
                host: currentHost,
                path: path,
              });
          });
          if (
            url.includes("bilibili.com/video/") ||
            url.includes("b23.tv/") ||
            url.includes("vxb23.tv/")
          ) {
            let id =
              url.match(/\/video\/([a-zA-Z0-9]+)/)?.[1] ||
              url.match(/(?:b23\.tv|vxb23\.tv)\/([a-zA-Z0-9]+)/)?.[1];
            if (id) collectedLinks.bilibili.push(id);
          }
          if (
            url.includes("pixiv.net/artworks/") ||
            url.includes("phixiv.net/artworks/")
          ) {
            let id = url.match(/artworks\/(\d+)/)?.[1];
            if (id) collectedLinks.pixiv.push({ id, host: currentHost });
          }
          if (/\.(jpg|png|gif)$/.test(url)) {
            const match = url.match(/(\d+)_p\d+\.(jpg|png|gif)$/);
            if (match)
              addItem(
                "convert",
                t("restore_pixiv_img"),
                `https://www.phixiv.net/artworks/${match[1]}`,
              );
          }
        });
        const processGroup = (type, processor) => {
          const items = collectedLinks[type];
          if (items.length === 0) return;
          if (items.length === 1) processor(items[0], false);
          else processor(items, true);
        };
        DOMAIN_GROUPS.forEach((group) => {
          processGroup(group.type, (data, isBatch) => {
            const prefs = getConvPrefs(group.type); // [] = 全顯示
            if (isBatch) {
              const sourceDomains = new Set(data.map((d) => d.host));
              group.domains.forEach((domain) => {
                if (sourceDomains.size === 1 && sourceDomains.has(domain)) return;
                // [Pref filter] 有偏好設定時，只顯示勾選的 domain
                if (prefs.length > 0 && !prefs.includes(domain)) return;
                const allConverted = data
                  .map((d) => `https://${domain}${d.path}`)
                  .join("\n");
                addItem(
                  "convert",
                  t("convert_all", { n: data.length }) + ` ${domain}`,
                  allConverted,
                );
              });
            } else {
              group.domains.forEach((domain) => {
                if (domain !== data.host) {
                  // [Pref filter] 有偏好設定時，只顯示勾選的 domain
                  if (prefs.length > 0 && !prefs.includes(domain)) return;
                  addItem(
                    "convert",
                    t(group.labels[domain]),
                    `https://${domain}${data.path}`,
                  );
                }
              });
            }
          });
        });

        // ── ⚙ Gear button：與第一個 convert 項目並排（兄弟元素，避免 button 事件衝突）
        if (sections.convert.length > 0) {
          const origBtn = sections.convert[0];

          // wrapper 取代原本的 button，讓 gear 與 button 成為兄弟
          const gearWrapper = document.createElement("div");
          gearWrapper.style.cssText = "position:relative; display:flex; align-items:stretch;";
          origBtn.style.flex = "1";   // button 佔滿剩餘寬度
          origBtn.style.minWidth = "0";
          gearWrapper.appendChild(origBtn);

          const gear = document.createElement("div");
          gear.className = "dmt-conv-gear";
          gear.title = "⚙ 轉換服務偏好設定";
          gear.style.cssText = "position:static; transform:none; flex-shrink:0; opacity:1; width:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; border-left:1px solid rgba(255,255,255,0.07);";
          gear.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

          // unseen 狀態：藍色，首次持續可見
          if (!isConvPrefSeen()) {
            gear.classList.add("unseen");
            const badge = document.createElement("span");
            badge.className = "dmt-conv-gear-badge";
            badge.style.cssText = "position:absolute; top:4px; right:4px;"; // 相對 gear div 定位
            gear.style.position = "relative"; // badge 需要 relative 父元素
            gear.appendChild(badge);
          }

          gear.addEventListener("click", (e) => {
            e.stopPropagation();
            document.querySelectorAll(".dmt-conv-gear.unseen").forEach(g => g.classList.remove("unseen"));
            openConvPrefPanel(gear);
          });

          gearWrapper.appendChild(gear);
          sections.convert[0] = gearWrapper; // 用 wrapper 取代原始按鈕
        }
        if (collectedLinks.bilibili.length > 0) {
          if (collectedLinks.bilibili.length > 1) {
            const allVx = collectedLinks.bilibili
              .map((id) => `https://vxbilibili.com/video/${id}`)
              .join("\n");
            addItem(
              "convert",
              t("convert_all", { n: collectedLinks.bilibili.length }) +
                " vxbilibili",
              allVx,
            );
          } else {
            const id = collectedLinks.bilibili[0];
            addItem(
              "convert",
              t("to_fx_bilibili"),
              `https://fxbilibili.seria.moe/${id}/`,
            );
            addItem(
              "convert",
              t("to_vx_bilibili"),
              `https://vxbilibili.com/video/${id}`,
            );
            addItem("convert", t("to_b23"), `https://b23.tv/${id}`);
            addItem("convert", t("to_vxb23"), `https://vxb23.tv/${id}`);
          }
        }

        if (collectedLinks.pixiv.length > 0) {
          if (collectedLinks.pixiv.length > 1) {
            const allPhixiv = collectedLinks.pixiv
              .map((d) => `https://www.phixiv.net/artworks/${d.id}`)
              .join("\n");
            addItem(
              "convert",
              t("convert_all", { n: collectedLinks.pixiv.length }) + " phixiv",
              allPhixiv,
            );
          } else {
            const d = collectedLinks.pixiv[0];
            if (d.host !== "phixiv.net")
              addItem(
                "convert",
                t("to_phixiv"),
                `https://www.phixiv.net/artworks/${d.id}`,
              );
            if (d.host !== "pixiv.net")
              addItem(
                "convert",
                t("to_pixiv"),
                `https://www.pixiv.net/artworks/${d.id}`,
              );
          }
        }

        // ── YouTube Shorts → Watch 轉換 ──────────────────────────────────────
        links.forEach((url) => {
          const shortsMatch = url.match(
            /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})([?&].*)?$/,
          );
          if (shortsMatch) {
            const videoId = shortsMatch[1];
            const extraParams = shortsMatch[2]
              ? shortsMatch[2].replace(/^[?&]/, "&")
              : "";
            addItem(
              "convert",
              t("yt_shorts_to_watch"),
              `https://www.youtube.com/watch?v=${videoId}${extraParams}`,
            );
          }
        });

        // ── Webhook セクション ──────────────────────────────────────────────
        // window.webhookModule が初期化済みかつ Webhook が1件以上登録されている場合のみ表示
        if (typeof window.webhookModule !== "undefined" && window.webhookModule.getWebhooks().length > 0) {

          // メッセージの永久リンクを確実に取得する
          //
          // Discord の表示モードにより timestamp の DOM 構造が異なる：
          //   標準モード  → <a class="timestamp_..." href="/channels/...">  ← <a> あり
          //   アジア言語  → <span class="asianCompactTimeStamp..."><time>   ← <a> なし
          //
          // 方法 A（主）: data-list-item-id + location.pathname から組み立て
          //   data-list-item-id = "chat-messages___chat-messages-{channelId}-{messageId}"
          //   location.pathname  = "/channels/{guildId}/{channelId}"
          //
          // 方法 B（補完）: <a class="timestamp_..."> の href を利用（標準モード限定）
          const _getMsgPermalink = () => {
            // 方法 A：data-list-item-id から channelId / messageId を抽出
            const listId = container.getAttribute("data-list-item-id") || "";
            const idMatch = listId.match(/chat-messages-(\d+)-(\d+)$/);
            if (idMatch) {
              const channelId = idMatch[1];
              const messageId = idMatch[2];
              // guildId を URL から取得（DM は "@me"）
              const pathMatch = location.pathname.match(/^\/channels\/([^/]+)\//);
              if (pathMatch) {
                return `https://discord.com/channels/${pathMatch[1]}/${channelId}/${messageId}`;
              }
            }
            // 方法 B：タイムスタンプの <a> タグから取得（標準モードの補完）
            const a = container.querySelector('a[class*="timestamp_"][href*="/channels/"]');
            if (a) {
              const href = a.getAttribute("href") || "";
              if (href.startsWith("/channels/")) return "https://discord.com" + href;
            }
            return null;
          };

          // Webhook ごとの「来源リンクを含める」設定を wh.keepSource フィールドで管理
          const _getSrcPref = (id) => {
            const wh = window.webhookModule.getWebhooks().find((w) => w.id === id);
            return wh?.keepSource === true;
          };
          const _setSrcPref = (id, val) => {
            const list = window.webhookModule.getWebhooks().map((w) =>
              w.id === id ? { ...w, keepSource: val } : w
            );
            GMStore.set("discord_webhook_list", list, true);
          };

          // inline-expand ヘルパー
          // 子リスト：各行 = [Webhook名ボタン][☐][❓]
          const makeWebhookParent = (label, onSelect) => {
            const wrapper = document.createElement("div");
            wrapper.style.cssText = "display:flex;flex-direction:column;";

            const parentBtn = document.createElement("button");
            parentBtn.textContent = label;
            parentBtn.style.cssText = "text-align:left;";
            wrapper.appendChild(parentBtn);

            const childList = document.createElement("div");
            childList.style.cssText = [
              "display:none", "flex-direction:column",
              "padding-left:8px",
              "border-left:2px solid rgba(88,101,242,0.4)",
              "margin-left:12px",
            ].join(";");

            window.webhookModule.getWebhooks().forEach((wh) => {
              // 行ラッパー
              const row = document.createElement("div");
              row.style.cssText = [
                "display:flex", "align-items:center",
                "gap:4px", "padding:2px 0",
              ].join(";");

              // 名前ボタン
              const nameBtn = document.createElement("button");
              nameBtn.textContent = wh.name;
              nameBtn.style.cssText = [
                "flex:1", "text-align:left", "font-size:12px",
                "padding:4px 8px", "opacity:0.85",
              ].join(";");
              nameBtn.onmouseenter = () => {
                nameBtn.style.opacity = "1";
                nameBtn.style.background = "rgba(88,101,242,0.15)";
              };
              nameBtn.onmouseleave = () => {
                nameBtn.style.opacity = "0.85";
                nameBtn.style.background = "";
              };
              nameBtn.onclick = (e) => {
                e.stopPropagation();
                cancelCloseGlobalMenu();
                onSelect(wh, _getSrcPref(wh.id));
                closeGlobalMenu();
              };

              // 「来源リンクを含める」チェックボックス
              const chk = document.createElement("input");
              chk.type = "checkbox";
              chk.checked = _getSrcPref(wh.id);
              chk.title = t("wh_keep_source");
              chk.style.cssText = [
                "accent-color:#5865f2", "cursor:pointer",
                "flex-shrink:0", "width:13px", "height:13px",
              ].join(";");
              chk.addEventListener("change", (e) => {
                e.stopPropagation();
                _setSrcPref(wh.id, chk.checked);
              });
              chk.onclick = (e) => {
                e.stopPropagation();
                cancelCloseGlobalMenu();
              };

              // ❓ ヒントアイコン
              const hint = document.createElement("span");
              hint.textContent = "❓";
              hint.title = t("wh_keep_source_tip");
              hint.style.cssText = [
                "font-size:11px", "cursor:default",
                "opacity:0.55", "flex-shrink:0",
                "line-height:1", "user-select:none",
              ].join(";");
              hint.onmouseenter = () => { hint.style.opacity = "1"; };
              hint.onmouseleave = () => { hint.style.opacity = "0.55"; };
              // ❓ クリックでメニューが閉じないよう伝播阻止
              hint.onclick = (e) => {
                e.stopPropagation();
                cancelCloseGlobalMenu();
              };

              row.appendChild(nameBtn);
              row.appendChild(chk);
              row.appendChild(hint);
              childList.appendChild(row);
            });

            let expanded = false;
            parentBtn.onclick = (e) => {
              e.stopPropagation();
              cancelCloseGlobalMenu();
              expanded = !expanded;
              childList.style.display = expanded ? "flex" : "none";
              parentBtn.textContent = label.replace("▶", expanded ? "▼" : "▶");
            };

            wrapper.appendChild(childList);
            return wrapper;
          };

          // 1. 傳送訊息內容
          sections.webhook.push(makeWebhookParent(t("wh_send_content"), (wh, keepSource) => {
            const msgText = getMessageText(container);
            if (!msgText) { showToast(t("no_content")); return; }
            const permalink = keepSource ? _getMsgPermalink() : null;
            const payload = permalink ? `${msgText}\n${permalink}` : msgText;
            // guild_id / channel_id は addWebhook / testWebhook 時に保存済みの値を使用
            const channelUrl = (wh.guild_id && wh.channel_id)
              ? `https://discord.com/channels/${wh.guild_id}/${wh.channel_id}`
              : null;
            window.webhookModule.sendContent(wh.url, payload, wh.name, channelUrl);
          }));

          // 2. 傳送網址（テキスト URL + 附件メディア URL、discord.com/channels は除外）
          sections.webhook.push(makeWebhookParent(t("wh_send_urls"), (wh, keepSource) => {
            const textUrls = (links || []).filter(
              (u) => !u.includes("discord.com/channels/")
            );
            const mediaUrls = [];
            container.querySelectorAll('a[class*="originalLink"], a[class*="fileNameLink_"], a[class*="metadataDownload_"]').forEach((a) => {
              if (a.href && !mediaUrls.includes(a.href)) mediaUrls.push(a.href);
            });
            container.querySelectorAll("video source, video[src]").forEach((el) => {
              const src = el.src || el.getAttribute("src");
              if (src && !mediaUrls.includes(src)) mediaUrls.push(src);
            });
            const allUrls = [...new Set([...textUrls, ...mediaUrls])].filter(Boolean);
            if (keepSource) {
              const permalink = _getMsgPermalink();
              if (permalink && !allUrls.includes(permalink)) allUrls.push(permalink);
            }
            const channelUrl = (wh.guild_id && wh.channel_id)
              ? `https://discord.com/channels/${wh.guild_id}/${wh.channel_id}`
              : null;
            window.webhookModule.sendUrls(wh.url, allUrls, wh.name, channelUrl);
          }));
        }

        // ── セクション描画 ────────────────────────────────────────────────
        if (config.menuStyle === "group") {
          ["copy", "download", "convert", "webhook", "system"].forEach((k) => {
            if (sections[k].length) {
              const groupEl = document.createElement("div");
              groupEl.className = "msg-copy-item-group";
              groupEl.innerText = t(`grp_${k}`);

              groupEl.addEventListener("mouseenter", () => {
                cancelCloseGlobalMenu(); // Keep main menu open
                const rect = groupEl.getBoundingClientRect();
                showSubmenu(sections[k], rect, dropdown);
              });

              dropdown.appendChild(groupEl);
            }
          });
        } else {
          ["copy", "download", "convert", "webhook", "system"].forEach((k) => {
            if (sections[k].length) {
              sections[k].forEach((el) => dropdown.appendChild(el));
              dropdown.appendChild(createDivider());
            }
          });
        }
      }

      return dropdown;
    }

    function createDivider() {
      const d = document.createElement("div");
      d.className = "msg-copy-divider";
      return d;
    }

    // =========================================================================================
    // [2026 優化版] attachToMessage - 延遲計算模式 (Lazy Evaluation)
    // 解決滾動卡頓的核心：滾動時只做最小檢查，滑鼠移上去才做重型解析
    // =========================================================================================
    function attachToMessage(msg) {
      if (msg.dataset.copyAttached) return;

      // [優化 1] 快速檢查：只檢查是否有相關 class，不做深層 DOM 遍歷
      // 這裡只做最粗略的判斷，確保 99% 的訊息都能被選中，誤判也沒關係（因為 hover 時會再次確認）
      const hasTextClass =
        msg.classList.toString().includes("messageContent") ||
        msg.querySelector('[class*="markup-"]') ||
        msg.querySelector('[id^="message-content-"]');

      // [優化 2] 媒體檢查改為極速模式：只看有沒有 img/video 標籤，不解析 src
      const hasMediaTag = msg.querySelector("img, video");

      if (!hasTextClass && !hasMediaTag) return;

      msg.dataset.copyAttached = "true";
      msg.classList.add("msg-copy-container");

      // 修正 Discord 佈局：Discord 訊息節點幾乎都是 static，直接設定避免 getComputedStyle 觸發 reflow
      msg.style.position = "relative";

      const btn = document.createElement("button");
      btn.className = "msg-copy-btn";
      // SVG 方案 B（2×3 dots）：不依賴字型，任何環境均可渲染
      btn.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true" style="display:block;pointer-events:none">
        <circle cx="2.5" cy="2.5"  r="1.5"/>
        <circle cx="7.5" cy="2.5"  r="1.5"/>
        <circle cx="2.5" cy="7"    r="1.5"/>
        <circle cx="7.5" cy="7"    r="1.5"/>
        <circle cx="2.5" cy="11.5" r="1.5"/>
        <circle cx="7.5" cy="11.5" r="1.5"/>
      </svg>`;

      // 閉包變數：快取解析結果，避免重複計算
      let _isMenuRendered = false;

      /**
       * 計算下拉選單的顯示位置，確保不超出視窗邊界。
       * @param {Element} anchorBtn - 觸發按鈕（用於取得錨點座標）
       * @param {Element} dropdown  - 已掛載但尚未定位的選單元素
       */
      const _calcDropdownPos = (anchorBtn, dropdown) => {
        const btnRect = anchorBtn.getBoundingClientRect();
        const dropdownRect = dropdown.getBoundingClientRect();
        let top = btnRect.bottom + window.scrollY;
        let left = btnRect.right - dropdownRect.width + window.scrollX;

        if (btnRect.bottom + dropdownRect.height > window.innerHeight) {
          top = btnRect.top + window.scrollY - dropdownRect.height;
        }
        if (left + dropdownRect.width > window.innerWidth) {
          left = window.innerWidth - dropdownRect.width - 10;
        }

        dropdown.style.top = `${top}px`;
        dropdown.style.left = `${left}px`;
      };

      // 內部渲染函數 (用於切換視圖)
      // 注意：宣告順序先於 showMenu，確保 showMenu 中的 callback 可以正確閉包捕捉
      let _symbolsPage = (() => {
        try {
          return (
            parseInt(localStorage.getItem("copySymbolsPage") || "0", 10) || 0
          );
        } catch (_) {
          return 0;
        }
      })();

      const renderMenuInternal = (isSymbols, page) => {
        if (typeof page === "number") {
          _symbolsPage = page;
          try {
            localStorage.setItem("copySymbolsPage", String(page));
          } catch (_) {}
        }
        closeGlobalMenu();
        const text = getMessageText(msg);
        const mediaUrl = extractExternalMediaUrl(msg);
        const dropdown = createDropdown(
          msg,
          text,
          mediaUrl,
          isSymbols,
          (n) => renderMenuInternal(n),
          (c, p) => renderMenuInternal(c, p),
          _symbolsPage,
        );
        document.body.appendChild(dropdown);
        globalActiveDropdown = dropdown;
        dropdown.style.display = "flex";
        _calcDropdownPos(btn, dropdown);
      };

      const showMenu = () => {
        // [優化 3] 只有在真正需要顯示選單時，才去執行昂貴的 extractExternalMediaUrl 和 getMessageText
        if (globalActiveDropdown) closeGlobalMenu();

        const text = getMessageText(msg);
        const mediaUrl = extractExternalMediaUrl(msg); // 👈 重型操作延後至此

        // 如果真的沒內容，就提示並退出 (這種情況極少)
        if (!text && !mediaUrl) {
          // showToast("無內容"); // 可選：不提示比較不打擾
          return;
        }

        const dropdown = createDropdown(
          msg,
          text,
          mediaUrl,
          false, // isSymbols
          (newState) => renderMenuInternal(newState),
          (currentState, page) => renderMenuInternal(currentState, page),
          _symbolsPage,
        );

        document.body.appendChild(dropdown);
        globalActiveDropdown = dropdown;
        dropdown.style.display = "flex";
        _calcDropdownPos(btn, dropdown);

        // ── 進場動畫 ──────────────────────────────────────────────────
        // 漣漪：從按鈕形狀向外擴散消失
        const ripple = document.createElement("div");
        ripple.className = "dmt-ripple";
        btn.appendChild(ripple);
        ripple.addEventListener("animationend", () => ripple.remove(), { once: true });

        // 按鈕 active 高亮（藍紫色，給使用者「選單已開啟」回饋）
        btn.classList.add("dmt-active");

        // 選單 spring 彈入 + 選單項目依序 stagger 淡入
        dropdown.classList.remove("dmt-leaving");
        dropdown.classList.add("dmt-entering");
        dropdown.addEventListener("animationend", (e) => {
          // 只回應 dropdown 本身的 animationend，不要被子元素的 stagger 觸發
          if (e.target === dropdown) dropdown.classList.remove("dmt-entering");
        }, { once: true });
      };

      // 插入 ⠿ 按鈕：強制在 buttonContainer 之後（DOM 最末），
      // 確保 z-index 不被 Discord hover bar 覆蓋。
      //
      // 修正：轉發訊息（forwarded message）的外層 article 內部，
      // embed 區塊 (.content__122e4) 也含有 buttonContainer，
      // querySelector 會優先命中內層 DOM，導致按鈕被塞進 embed 深層並被
      // overflow:hidden 截掉而不可見。
      // 解法：只認 msg 直屬子層的 buttonContainer，忽略 embed 內部的。
      const discordBtnContainer = (() => {
        // 優先：msg 的直接子代中尋找
        for (const child of msg.children) {
          const childClass =
            typeof child.className === "string"
              ? child.className
              : (child.getAttribute?.("class") ?? "");
          if (childClass.includes("buttonContainer")) {
            return child;
          }
        }
        // 次選：msg 下第一層子代的直接子代（Discord 有時包一層 wrapper）
        for (const child of msg.children) {
          for (const grandchild of child.children) {
            const gcClass =
              typeof grandchild.className === "string"
                ? grandchild.className
                : (grandchild.getAttribute?.("class") ?? "");
            if (gcClass.includes("buttonContainer")) {
              // 確保這個 buttonContainer 不是 embed/content 區塊的後代
              if (
                !grandchild.closest('[class*="content__"]') &&
                !grandchild.closest('[class*="embedFull"]') &&
                !grandchild.closest('[class*="container_b7e1cb"]')
              ) {
                return grandchild;
              }
            }
          }
        }
        return null;
      })();
      if (discordBtnContainer) {
        discordBtnContainer.insertAdjacentElement("afterend", btn);
      } else {
        msg.appendChild(btn);
      }

      // 事件綁定
      btn.addEventListener("mouseenter", () => {
        config = getConfig();
        if (config.triggerMode === "hover") {
          cancelCloseGlobalMenu();
          showMenu();
        }
      });

      btn.addEventListener("mouseleave", () => {
        config = getConfig();
        if (config.triggerMode === "hover") {
          scheduleCloseGlobalMenu();
        }
      });

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        config = getConfig();
        if (globalActiveDropdown) closeGlobalMenu();
        else showMenu();
      });
    }

    // [Fix v1.6.6] 具名 handler，使 beforeunload 可正確移除，避免全域 click listener 永久殘留
    const _globalCloseMenuHandler = (e) => {
      if (
        !e.target.closest(".msg-copy-dropdown") &&
        !e.target.closest(".msg-copy-btn") &&
        !e.target.closest(".msg-copy-portal-menu")
      ) {
        closeGlobalMenu();
      }
    };
    document.addEventListener("click", _globalCloseMenuHandler);
    // v1.7.0：改由 CleanupRegistry 集中清理
    CleanupRegistry.add(() => {
      document.removeEventListener("click", _globalCloseMenuHandler);
    });

    // =========================================================================================
    // Module B Init - 智能區域監聽 (Smart Scope Observer)
    // =========================================================================================
    function init() {
      if (!config.lang) showLanguageSelector();

      // 初次注入
      document.querySelectorAll("div[data-list-item-id]").forEach((node) => {
        if (!node.dataset.copyAttached) attachToMessage(node);
      });

      // IntersectionObserver 注入可見訊息
      // [Opt v1.6.7 ⑤] rootMargin 可設定（localStorage "copyIOMargin"：100/300/500，預設 300）
      const _ioMarginRaw = parseInt(localStorage.getItem("copyIOMargin"), 10);
      const _ioMargin = [100, 300, 500].includes(_ioMarginRaw) ? _ioMarginRaw : 300;
      const io = new IntersectionObserver(
        (entries) => {
          for (const { target, isIntersecting } of entries) {
            if (isIntersecting && !target.dataset.copyAttached) {
              attachToMessage(target);
            }
          }
        },
        {
          root: document,
          rootMargin: `${_ioMargin}px`,
          threshold: 0.1,
        },
      );

      document
        .querySelectorAll("div[data-list-item-id]")
        .forEach((node) => io.observe(node));

      // SPA 頻道切換偵測：URL 變化時 disconnect 舊節點、重新 observe 新節點
      // 避免跨頻道的舊 DOM 節點持續佔用 observer 記憶體
      let _lastUrl = location.href;
      let _urlCheckTimer = null;

      // 共用的重掛載邏輯，供 popstate 快速通道與輪詢備援共同使用
      const _handleUrlChange = () => {
        if (location.href === _lastUrl) return;
        _lastUrl = location.href;
        io.disconnect();
        // 等待新頻道 DOM 渲染完成後重新掛載
        setTimeout(() => {
          document
            .querySelectorAll("div[data-list-item-id]")
            .forEach((node) => {
              if (!node.dataset.copyAttached) attachToMessage(node);
              io.observe(node);
            });
          DEBUG &&
            console.log(
              "[MessageUtility] IO observer reset after navigation",
            );
        }, 500);
      };

      // 快速通道：popstate / Discord 內部 history.pushState 觸發 (≤ 1 frame)
      // [Opt v1.6.7 ②] navigation API 具名化，beforeunload 時 removeEventListener
      let _usingNavigationApi = false;
      if (typeof navigation !== "undefined" && navigation.addEventListener) {
        navigation.addEventListener("navigate", _handleUrlChange, { passive: true });
        _usingNavigationApi = true;
      } else {
        window.addEventListener("popstate", _handleUrlChange, { passive: true });
      }

      // 備援輪詢：SPA 内の programmatic pushState は popstate を発火しないため
      // [Opt v1.6.7 ③] 冷卻降頻：路由切換後 5 秒內無再次變化則降至 5 秒輪詢，節省空轉
      let _pollInterval = 1000;      // 正常間隔 1s
      const _pollIntervalSlow = 5000; // 冷卻後降至 5s
      let _cooldownTimer = null;

      const _checkUrlChange = () => {
        const changed = location.href !== _lastUrl;
        if (changed) {
          _handleUrlChange();
          // 剛切換頻道：恢復快速輪詢，並啟動 5s 冷卻計時
          _pollInterval = 1000;
          clearTimeout(_cooldownTimer);
          _cooldownTimer = setTimeout(() => {
            _pollInterval = _pollIntervalSlow;
          }, 5000);
        }
        _urlCheckTimer = setTimeout(_checkUrlChange, _pollInterval);
      };
      _urlCheckTimer = setTimeout(_checkUrlChange, _pollInterval);

      // [Opt v1.6.7 ②③] visibilitychange 具名化
      const _pollVisibilityHandler = () => {
        if (document.hidden) {
          clearTimeout(_urlCheckTimer);
          clearTimeout(_cooldownTimer);
          _urlCheckTimer = null;
        } else {
          // tab 復帰：立刻偵測一次，恢復快速輪詢
          _handleUrlChange();
          _pollInterval = 1000;
          _urlCheckTimer = setTimeout(_checkUrlChange, _pollInterval);
        }
      };
      document.addEventListener("visibilitychange", _pollVisibilityHandler, { passive: true });

      // v1.7.0：確保頁面卸載時完整清理（改由 CleanupRegistry 集中管理）
      CleanupRegistry.add(() => {
        io.disconnect();
        clearTimeout(_urlCheckTimer);
        clearTimeout(_cooldownTimer);
        document.removeEventListener("visibilitychange", _pollVisibilityHandler);
        if (_usingNavigationApi) {
          navigation.removeEventListener("navigate", _handleUrlChange);
        } else {
          window.removeEventListener("popstate", _handleUrlChange);
        }
      });

      // 保底滑鼠事件
      document.addEventListener(
        "mouseover",
        (e) => {
          const msgNode = e.target.closest("div[data-list-item-id]");
          if (msgNode && !msgNode.dataset.copyAttached) {
            attachToMessage(msgNode);
          }
        },
        { passive: true },
      );

      DEBUG &&
        console.log("[MessageUtility] Hybrid injection mode initialized");
    }

    init();
  }

  // =========================================================================================
  // 模組 C ── Expression / Emoji / GIF / Sticker Manager (initEmojiSearchHelper v22.10)
  // 功能:
  // 1. [Sticker] 移除貼圖的原生模式切換，強制使用最佳化連結 (size=160)，修復尺寸過小問題
  // 2. [Emoji]   保留原生/連結切換功能與黑金 UI
  // 3. [GIF]     收藏庫分頁管理，支援拖曳排序與關鍵字搜尋
  // =========================================================================================

  function initEmojiSearchHelper() {
    DEBUG &&
      console.log(
        "[Discord Utilities] Initializing Expression Search Helper v22.10 (Sticker Fix)...",
      );

    const NATIVE_MODE_KEY = "discord_emoji_native_mode";
    function getNativeMode() {
      return GMStore.get(NATIVE_MODE_KEY, true);
    }
    function setNativeMode(val) {
      GMStore.set(NATIVE_MODE_KEY, val);
    }

    // 局部 Observer 管理器 (防止記憶體洩漏)
    const activeLocalObservers = new WeakMap();

    // 多國語言說明文案
    const MODE_TOOLTIP =
      "🇹🇼 [原生] 發送 Discord 代碼 (需 Nitro) / [連結] 發送圖片網址\n" +
      "🇨🇳 [原生] 发送 Discord 代码 (需 Nitro) / [链接] 发送图片网址\n" +
      "🇺🇸 [Native] Send Discord Tag (Nitro req) / [Link] Send Image URL\n" +
      "🇯🇵 [ネイティブ] コード送信 (Nitro必須) / [リンク] URL送信\n" +
      "🇰🇷 [네이티브] 코드 전송 (Nitro 필요) / [링크] URL 전송";

    // ============================
    // 1. Styles (樣式定義)
    // ============================
    const EMOJI_STYLES = `
            /* 基礎按鈕樣式 */
            .my-tool-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin: 0 1px; cursor: pointer; color: var(--dmt-text-subtle); border-radius: 4px; transition: all 0.2s; flex-shrink: 0; position: relative; }
            .my-tool-btn:hover { color: var(--dmt-text-bright); background: rgba(255,255,255,0.1); }
            .my-tool-btn.is-active { color: #f0b232; }
            .my-tool-btn.is-active svg { fill: #f0b232; }
            .my-tool-btn.target-mode:hover { color: var(--dmt-danger); }
            .my-tool-btn.batch-active { color: var(--dmt-success) !important; background: rgba(67, 181, 129, 0.2); }

            /* GIF Overlay */
            .my-gif-overlay-bar { position: absolute; top: 4px; right: 36px; display: none; gap: 4px; padding: 2px; z-index: 100; background: rgba(0,0,0,0.6); border-radius: 4px; pointer-events: auto; }
            .my-gif-card:hover > .my-gif-overlay-bar { display: flex !important; }
            .my-overlay-btn { width: 22px; height: 22px; color: var(--dmt-text-bright); border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; }
            .my-overlay-btn:hover { background: var(--dmt-accent); }

            /* Popover Menu */
            .my-popover-menu { position: fixed; background: var(--dmt-bg-primary); border: 1px solid var(--dmt-bg-deep); border-radius: 4px; box-shadow: 0 8px 16px rgba(0,0,0,0.5); padding: 0; display: none; flex-direction: column; z-index: 2147483647; min-width: 340px; max-width: 620px; max-height: 550px; overflow: hidden; }
            .my-popover-menu.show { display: flex; }

            /* Menu Items */
            .my-menu-item { padding: 6px 10px; color: var(--dmt-text-primary); font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.03); }
            .my-menu-item:hover { background: rgba(255,255,255,0.08); color: #fff; }
            .my-emoji-preview-box { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
            .my-emoji-icon-preview { width: 100%; height: 100%; border-radius: 3px; object-fit: contain; background: rgba(0,0,0,0.2); }

            /* SVG Icon Placeholder */
            .my-emoji-icon-placeholder {
                width: 100%; height: 100%; border-radius: 4px;
                background: linear-gradient(135deg, var(--dmt-accent) 0%, #4752C4 100%);
                display: flex; align-items: center; justify-content: center;
                font-size: 14px; color: #fff; font-weight: bold;
                text-transform: uppercase; text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
                position: relative; overflow: hidden;
            }
            .my-emoji-icon-placeholder::after { content: ''; position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; background: rgba(0,0,0,0.2); border-radius: 50% 0 0 0; }

            .my-emoji-content { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; gap: 2px; }
            .my-emoji-header { display: flex; align-items: center; gap: 6px; }
            .my-emoji-key { font-weight: 500; font-size: 13px; color: var(--dmt-text-primary); }
            .my-emoji-note-badge { font-size: 9px; color: var(--dmt-text-primary); background: rgba(88, 101, 242, 0.15); border: 1px solid rgba(88, 101, 242, 0.4); border-radius: 3px; padding: 0 4px; height: 16px; display: inline-flex; align-items: center; justify-content: center; font-weight: 600; letter-spacing: 0.5px; white-space: nowrap; }
            .my-emoji-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.1s; }
            .my-menu-item:hover .my-emoji-actions { opacity: 1; }
            .my-emoji-btn { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 3px; font-size: 12px; color: var(--dmt-text-subtle); transition: all 0.1s; }
            .my-emoji-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
            .my-emoji-btn.delete:hover { background: var(--dmt-danger); color: #fff; }

            /* Tabs Layout */
            .my-tabs-header { display: flex; align-items: center; background: var(--dmt-bg-deep); border-bottom: 1px solid #111214; padding: 0 4px; width: 100%; box-sizing: border-box; }
            .my-tab-scroll-area { display: flex; align-items: center; overflow-x: auto; flex: 1; scrollbar-width: none; }
            .my-tab-scroll-area::-webkit-scrollbar { display: none; }
            .my-tab-controls { display: flex; align-items: center; flex-shrink: 0; padding-left: 4px; border-left: 1px solid rgba(255,255,255,0.05); margin-left: 4px; }

            .my-tab { padding: 8px 12px; font-size: 12px; font-weight: 500; color: var(--dmt-text-muted); cursor: pointer; white-space: nowrap; border-bottom: 2px solid transparent; transition: all 0.2s; user-select: none; }
            .my-tab:hover { color: var(--dmt-text-primary); background: rgba(255,255,255,0.05); }
            .my-tab.active { color: #fff; border-bottom-color: var(--dmt-accent); }
            .my-tab.dragging { opacity: 0.5; background: rgba(255,255,255,0.1); }

            /* ── Collection Layout: type sidebar (left) + main area (right) ── */
            /* [Fix] 加寬 max-width 避免 mode-switch 按鈕被右邊界裁切；min-width 確保側邊欄 + 控制列有足夠空間 */
            .my-popover-menu.collection-mode { flex-direction: row; align-items: stretch; min-width: 420px; max-width: 720px; }
            .my-col-main { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow: hidden; }
            /* [Fix] controls 永遠不被壓縮；mode-switch 至少保留 80px */
            .my-tab-controls { flex-shrink: 0 !important; }

            /* Fix: ensure scroll area actually shrinks; tabs stay fixed-width */
            .my-tab-scroll-area { min-width: 0; }
            .my-tab { flex-shrink: 0; }

            /* ── Grid Item Drag-reorder ── */
            .my-col-img-wrapper[draggable="true"] { cursor: grab; }
            .my-col-img-wrapper[draggable="true"]:active { cursor: grabbing; }
            .my-col-img-wrapper.item-dragging { opacity: 0.35; outline: 2px dashed var(--dmt-accent, #5865f2); outline-offset: -2px; }
            .my-col-img-wrapper.item-drag-over { outline: 2px solid var(--dmt-accent, #5865f2); outline-offset: -2px; background: rgba(88,101,242,0.12); }

            /* Drag-over highlight on target tab */
            .my-tab.drag-over { background: rgba(88,101,242,0.18); border-bottom-color: var(--dmt-accent); color: #fff; }

            /* [New] + button anchored in controls (never scrolls away) */
            .my-tab-add-ctrl { padding: 5px 8px; color: var(--dmt-success); cursor: pointer; font-weight: bold; font-size: 16px; line-height: 1; display: flex; align-items: center; justify-content: center; border-radius: 4px; flex-shrink: 0; transition: background 0.15s, color 0.15s; }
            .my-tab-add-ctrl:hover { color: #fff; background: var(--dmt-success); }

            /* ── Type Sidebar: 梯形標籤 ── */
            .my-type-sidebar { display: flex; flex-direction: column; align-items: stretch; background: #1e1f22; width: 54px; flex-shrink: 0; padding: 10px 0; gap: 4px; border-right: 1px solid rgba(0,0,0,0.45); }

            /* ── Sidebar 底部 Mode 切換按鈕 ── */
            .my-sidebar-mode-spacer { flex: 1; }  /* 把按鈕推到底 */
            .my-sidebar-mode-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 8px; }
            .my-sidebar-mode-btn {
                position: relative; display: flex; flex-direction: column;
                align-items: center; justify-content: center; gap: 2px;
                padding: 8px 4px; cursor: pointer; user-select: none;
                color: #72767d; transition: color 0.15s, background 0.15s;
                border-radius: 0;
            }
            .my-sidebar-mode-btn:hover { color: #b5bac1; background: rgba(255,255,255,0.07); }
            /* 狀態指示燈 */
            .my-sidebar-mode-btn::before {
                content: ''; position: absolute; left: 4px; top: 50%; transform: translateY(-50%);
                width: 3px; height: 50%; border-radius: 2px;
                background: transparent; transition: background 0.2s;
            }
            .my-sidebar-mode-btn.native { color: #d4af37; }
            .my-sidebar-mode-btn.native::before { background: #d4af37; }
            .my-sidebar-mode-btn.link { color: #5865f2; }
            .my-sidebar-mode-btn.link::before { background: #5865f2; }
            .my-sidebar-mode-icon { font-size: 13px; line-height: 1; }
            .my-sidebar-mode-label { font-size: 7px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }
            .my-type-tab {
                position: relative; display: flex; flex-direction: column;
                align-items: center; justify-content: center; gap: 3px;
                padding: 10px 4px 10px 8px; cursor: pointer;
                color: #72767d; transition: background 0.15s, color 0.15s;
                user-select: none;
                /* 梯形：右側收尖指向內容區 */
                clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%);
                background: transparent;
            }
            .my-type-tab:hover { color: #b5bac1; background: rgba(255,255,255,0.07); }
            .my-type-tab.active {
                color: #fff;
                background: var(--dmt-bg-primary, #2b2d31);
                box-shadow: inset 3px 0 0 var(--dmt-accent, #5865f2);
                margin-right: -1px; /* 覆蓋側邊欄右邊框，視覺連通 */
                padding-right: 5px;
                z-index: 2;
            }
            .my-type-icon { font-size: 16px; line-height: 1.3; }
            .my-type-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; text-align: center; }

            /* [Black-Gold Mode Switch] */
            .my-mode-switch {
                position: relative;
                padding: 4px 10px; font-size: 11px; border-radius: 12px;
                cursor: pointer;
                background: linear-gradient(135deg, #1a1a1a 0%, #2b2b2b 100%);
                color: #d4af37;
                border: 1px solid #7a6000;
                display: flex; align-items: center; gap: 4px;
                transition: all 0.3s ease; white-space: nowrap;
                overflow: hidden;
                box-shadow: 0 2px 4px rgba(0,0,0,0.5);
                font-weight: bold;
                text-shadow: 0 1px 1px rgba(0,0,0,0.8);
            }
            .my-mode-switch::before {
                content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.2), transparent);
                transition: left 0.5s; pointer-events: none;
            }
            .my-mode-switch:hover::before { left: 100%; transition: left 0.7s; }
            .my-mode-switch:hover { color: #fff; border-color: var(--dmt-gold); box-shadow: 0 0 8px rgba(212, 175, 55, 0.6); text-shadow: 0 0 5px rgba(255, 215, 0, 0.8); }
            .my-mode-switch.active {
                background: linear-gradient(135deg, #000 0%, #333 100%);
                color: var(--dmt-gold); border-color: var(--dmt-gold);
                box-shadow: inset 0 0 5px rgba(255, 215, 0, 0.2);
            }
            .my-mode-switch:hover::after {
                content: '✨'; position: absolute; top: -8px; right: -4px;
                font-size: 14px; opacity: 0; animation: sparkle 0.8s infinite;
            }
            @keyframes sparkle {
                0% { opacity: 0; transform: scale(0.5) rotate(0deg); }
                50% { opacity: 1; transform: scale(1.2) rotate(15deg); }
                100% { opacity: 0; transform: scale(0.5) rotate(30deg); }
            }

            /* Content Area */
            .my-tab-content { padding: 8px; overflow-y: auto; max-height: 400px; min-height: 180px; background: var(--dmt-bg-surface); position: relative; }

            /* Grid System */
            .my-col-grid { display: grid; gap: 8px; width: 100%; box-sizing: border-box; }
            .my-col-grid.emoji { grid-template-columns: repeat(auto-fill, 58px); gap: 4px; justify-content: start; }
            .my-col-grid.sticker { grid-template-columns: repeat(auto-fill, 100px); justify-content: start; }
            .my-col-grid.gif { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); }

            /* Wrappers & Images */
            .my-col-img-wrapper { position: relative; background: var(--dmt-bg-primary); border-radius: 4px; cursor: pointer; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
            .my-col-grid.emoji .my-col-img-wrapper { width: 58px; height: 58px; background: transparent; border-radius: 2px; box-shadow: none; }
            .my-col-grid.emoji .my-col-img-wrapper:hover { background: rgba(255,255,255,0.08); }
            .my-col-grid.sticker .my-col-img-wrapper { width: 100px; height: 100px; background: transparent; box-shadow: none; }
            .my-col-grid.gif .my-col-img-wrapper { aspect-ratio: 1 / 1; width: 100%; }
            .my-col-img { width: 100%; height: 100%; object-fit: contain; transition: transform 0.15s; }
            .my-col-grid.emoji .my-col-img { width: 48px; height: 48px; }
            .my-col-img-wrapper:hover .my-col-img { transform: scale(1.1); }
            .my-col-text { font-size: 32px; user-select: none; }

            /* Delete Button */
            .my-col-del-btn { position: absolute; top: 0; right: 0; width: 20px; height: 20px; background: rgba(0,0,0,0.6); color: var(--dmt-danger); display: flex; align-items: center; justify-content: center; border-bottom-left-radius: 6px; z-index: 999; backdrop-filter: blur(2px); opacity: 0; transition: opacity 0.1s; pointer-events: auto; }
            .my-col-del-btn > * { pointer-events: none; }
            .my-col-img-wrapper:hover .my-col-del-btn, .my-col-del-btn:hover { opacity: 1; }
            .my-col-del-btn:hover { background: var(--dmt-danger); color: #fff; }

            /* Modal & Picker */
            .my-save-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--dmt-bg-overlay); border: 1px solid var(--dmt-bg-deep); box-shadow: 0 0 0 100vw rgba(0,0,0,0.7); border-radius: 8px; z-index: 2147483649; width: 250px; overflow: hidden; animation: myPop 0.2s ease-out; }
            .my-save-header { background: var(--dmt-bg-primary); padding: 10px; font-size: 14px; font-weight: bold; color: #fff; text-align: center; border-bottom: 1px solid var(--dmt-bg-deep); }
            .my-save-list { max-height: 300px; overflow-y: auto; }
            .my-save-item { padding: 10px 15px; cursor: pointer; color: var(--dmt-text-bright); font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.1s; }
            .my-save-item:hover { background: var(--dmt-accent); color: #fff; }
            .my-save-item.create { color: var(--dmt-success); font-weight: 500; }
            .my-save-item.create:hover { background: var(--dmt-success); color: #fff; }
            @keyframes myPop { from { opacity: 0; transform: translate(-50%, -45%); } to { opacity: 1; transform: translate(-50%, -50%); } }
            .my-picker-mask { position: fixed; background: rgba(0, 0, 0, 0.75); z-index: 2147483647; cursor: crosshair; }
            .my-picker-tip { position: fixed; top: 10%; left: 50%; transform: translateX(-50%); background: var(--dmt-accent); color: white; padding: 10px 20px; border-radius: 20px; font-size: 14px; font-weight: bold; box-shadow: 0 4px 15px rgba(0,0,0,0.5); z-index: 2147483648; pointer-events: none; }
            .my-picker-frame { position: fixed; pointer-events: none; z-index: 2147483648; box-shadow: 0 0 0 2px var(--dmt-accent), 0 0 20px rgba(88, 101, 242, 0.5); border-radius: 4px; }

            /* [New Feature] Eat & Shine Animation (吃飽與閃光特效) */
            @keyframes my-eat-shine {
                0% { transform: scale(1); filter: none; color: var(--interactive-normal); }
                /* 瞬間膨脹到 2.5 倍，變金色，發出強力金光 */
                20% { transform: scale(2.5) rotate(-15deg); filter: drop-shadow(0 0 15px #ffd700); color: #ffd700; }
                /* 回縮 */
                40% { transform: scale(1.6) rotate(10deg); filter: drop-shadow(0 0 10px #ffd700); color: #ffd700; }
                /* 再次小彈跳 */
                60% { transform: scale(1.9) rotate(-5deg); filter: drop-shadow(0 0 8px #ffd700); color: #ffd700; }
                /* 穩定下來 */
                80% { transform: scale(1.2) rotate(0deg); filter: drop-shadow(0 0 5px #ffd700); color: #ffd700; }
                100% { transform: scale(1); filter: none; color: var(--interactive-normal); }
            }
            /* 使用 cubic-bezier 產生果凍般的彈性效果 */
            .my-eat-anim { animation: my-eat-shine 0.8s cubic-bezier(0.25, 1.5, 0.5, 1); }

            /* 一般 Hover 狀態的輕微晃動 (保持不變或移除，視需求) */
            @keyframes my-gentle-shake {
                0% { transform: rotate(0deg); } 25% { transform: rotate(-10deg); } 75% { transform: rotate(10deg); } 100% { transform: rotate(0deg); }
            }

            /* ── 蒐藏庫入口按鈕：不依賴 Discord hash class，用 CSS variable 貼合原生風格 ── */
            .my-chat-input-folder-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 4px;
                flex-shrink: 0;
            }
            .dmt-folder-btn {
                background: transparent;
                border: none;
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                color: var(--interactive-normal, #b5bac1);
                transition: color 0.15s, background 0.15s;
                flex-shrink: 0;
            }
            .dmt-folder-btn:hover {
                background: var(--background-modifier-hover, rgba(79,84,92,0.16));
                color: var(--interactive-hover, #dbdee1);
                animation: my-gentle-shake 0.5s ease-in-out infinite;
            }

            .my-popover-menu.input-mode {
                border-bottom-left-radius: 0;
                border-bottom-right-radius: 4px;
                border-top-left-radius: 4px;
                border-top-right-radius: 4px;
                box-shadow: 0 -4px 12px rgba(0,0,0,0.5);
            }
            /* 準心引導動畫（compositor-only：transform + filter，不觸發 paint）*/
            @keyframes super-pulse {
                0%   { transform: scale(1);    filter: drop-shadow(0 0 0px transparent); opacity: 0.7; }
                50%  { transform: scale(1.12); filter: drop-shadow(0 0 6px #ffd700);     opacity: 1;   }
                100% { transform: scale(1);    filter: drop-shadow(0 0 0px transparent); opacity: 0.7; }
            }
            .my-tool-btn.target-mode.animating {
                animation: super-pulse 1.5s ease-in-out infinite;
                will-change: transform, filter, opacity; /* 提示瀏覽器提升合成層 */
            }
            .my-tool-btn.target-mode.animating:hover {
                animation-play-state: paused;
                color: #f23f43 !important;
                filter: none;
                transform: scale(1.1);
                box-shadow: none;
            }

            /* v1.7.0：@keyframes fadeUp 移至靜態注入，不再於每次 showEmojiToast 動態插入 */
            @keyframes fadeUp {
                0%   { opacity: 0; transform: translate(-50%, 0);     }
                10%  { opacity: 1; transform: translate(-50%, -10px); }
                90%  { opacity: 1; transform: translate(-50%, -10px); }
                100% { opacity: 0; transform: translate(-50%, 0);     }
            }
        `;
    GM_addStyle(EMOJI_STYLES);

    const ICON_STAR_EMPTY =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
    const ICON_STAR_FILLED =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
    const ICON_FOLDER =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
    const ICON_TARGET =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>';
    const TYPES = { EMOJI: "emoji", GIF: "gif", STICKER: "sticker" };

    // ============================
    // 2. 資料存取
    // ============================
    function cleanData(raw) {
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((item) => item && typeof item === "object" && item.key)
        .map((item) => ({
          key: item.key,
          note: item.note || "",
          icon: item.icon || "",
        }));
    }
    function getFavs(type) {
      try {
        const key =
          type === TYPES.GIF
            ? "discord_gif_favorites"
            : type === TYPES.STICKER
              ? "discord_sticker_favorites"
              : "discord_emoji_favorites";
        const raw = GMStore.get(key, [], true);
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string")
          return raw.map((k) => ({ key: k, note: "", icon: "" }));
        return cleanData(raw);
      } catch (e) {
        return [];
      }
    }
    function saveFavs(type, data) {
      const key =
        type === TYPES.GIF
          ? "discord_gif_favorites"
          : type === TYPES.STICKER
            ? "discord_sticker_favorites"
            : "discord_emoji_favorites";
      GMStore.set(key, data, true);
    }
    function getCollectionKey(type) {
      if (type === TYPES.GIF) return "discord_gif_collections";
      if (type === TYPES.STICKER) return "discord_sticker_collections";
      return "discord_emoji_collections";
    }
    function getCollections(type) {
      try {
        const key = getCollectionKey(type);
        let data = GMStore.get(key, {}, true);
        if (typeof data !== "object" || Array.isArray(data)) data = {};
        if (Object.keys(data).length === 0) {
          data = { General: [] };
          saveCollections(type, data);
        }
        return data;
      } catch (e) {
        return { General: [] };
      }
    }
    function saveCollections(type, data) {
      GMStore.set(getCollectionKey(type), data, true);
    }
    function reorderCollections(type, oldIndex, newIndex) {
      const cols = getCollections(type);
      const entries = Object.entries(cols);
      const generalIndex = entries.findIndex(([k]) => k === "General");
      if (generalIndex > -1) {
        const [gen] = entries.splice(generalIndex, 1);
        entries.unshift(gen);
      }
      if (
        oldIndex < 0 ||
        oldIndex >= entries.length ||
        newIndex < 0 ||
        newIndex >= entries.length
      )
        return;
      const [moved] = entries.splice(oldIndex, 1);
      entries.splice(newIndex, 0, moved);
      const newCols = Object.fromEntries(entries);
      saveCollections(type, newCols);
    }
    function addToCollection(type, colName, content) {
      const cols = getCollections(type);
      if (!cols[colName]) cols[colName] = [];

      // 將 content 轉換為物件格式（包含元數據）
      let item = content;
      if (typeof content === "string") {
        // 如果是 URL，解析並儲存元數據
        if (content.startsWith("http")) {
          item = parseMediaUrl(content, type);
        } else {
          // 純文字（emoji 字符等）保持原樣
          item = { content: content, type: "text" };
        }
      }

      // 檢查重複（基於 URL 或 content）
      const key = item.url || item.content;
      const isDuplicate = cols[colName].some((existing) => {
        const existingKey =
          typeof existing === "object"
            ? existing.url || existing.content
            : existing;
        return existingKey === key;
      });

      if (!isDuplicate) {
        cols[colName].push(item);
        saveCollections(type, cols);
        showEmojiToast(t("em_col_add_success", { g: colName }));

        // 收藏時立即背景下載並快取，確保 CDN 簽名過期後仍可顯示
        // ⚠️ Discord attachment URL 的 ex/is/hm 是 CDN 存取憑證，去掉後 403
        //    → 必須用「原始含簽名 URL」下載，但快取 key 用 stableUrl pathname（穩定）
        //    fetchAndCacheMedia 內部的 gifCacheKey() 本來就只取 pathname，兩端一致
        if (type === TYPES.GIF || type === TYPES.STICKER) {
          // 下載源：優先用帶簽名的原始 URL（item.url），才能通過 CDN 驗證
          // 備援：item.stableUrl（非 Discord CDN 的來源，如 Tenor/Klipy 不需簽名）
          const downloadUrl =
            typeof item === "object"
              ? item.url || item.content || item.stableUrl
              : item;
          if (downloadUrl && downloadUrl.startsWith("http")) {
            fetchAndCacheMedia(downloadUrl).then((dataUrl) => {
              if (dataUrl) {
                DEBUG &&
                  console.log(
                    "[GifCache] Pre-cached on save:",
                    downloadUrl.slice(0, 60),
                  );
              } else {
                console.warn(
                  "[GifCache] Pre-cache failed (CDN may have expired already):",
                  downloadUrl.slice(0, 80),
                );
              }
            });
          }
        }

        // [New] 觸發「吃飽+閃光」特效 (Eat & Shine)
        const inputFolderBtn = document.querySelector(
          ".my-chat-input-folder-btn button",
        );
        if (inputFolderBtn) {
          // 移除舊動畫 class 以便重新觸發
          inputFolderBtn.classList.remove("my-eat-anim");

          // 強制瀏覽器重繪 (Reflow)
          void inputFolderBtn.offsetWidth;

          // 加入新的特效 class
          inputFolderBtn.classList.add("my-eat-anim");

          // 動畫結束後自動移除 class (可選，保持乾淨)
          setTimeout(() => {
            inputFolderBtn.classList.remove("my-eat-anim");
          }, 800);
        }
      }
    }

    // ============================
    // 3. Helper Functions
    // ============================

    // ── GIF 永久快取：收藏時立即下載並轉 base64，免受 CDN 簽名失效影響 ──
    const GIF_CACHE_PREFIX = "gifcache_";
    const GIF_CACHE_INDEX = "gifcache_index";
    const GIF_MAX_BYTES = 400 * 1024; // 單張超過 400KB 改存 IndexedDB
    // FIFO 淘汰上限：GM + IDB 合計最多保留此數量的快取項目
    // 可在 localStorage 設定 "dmtGifCacheMax"（整數，預設 120，最小 10）
    const GIF_CACHE_MAX_COUNT = Math.max(
      10,
      parseInt(localStorage.getItem("dmtGifCacheMax") || "120", 10) || 120
    );

    // IndexedDB 封裝（懶初始化）
    let _idbPromise = null;
    function openGifIDB() {
      if (_idbPromise) return _idbPromise;
      _idbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open("DiscordGifCache", 1);
        req.onupgradeneeded = (e) => {
          e.target.result.createObjectStore("blobs", { keyPath: "id" });
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
      });
      return _idbPromise;
    }
    async function idbPut(id, dataUrl) {
      const db = await openGifIDB();
      return new Promise((res, rej) => {
        const tx = db.transaction("blobs", "readwrite");
        tx.objectStore("blobs").put({ id, dataUrl });
        tx.oncomplete = () => res();
        tx.onerror = (e) => rej(e.target.error);
      });
    }
    async function idbGet(id) {
      const db = await openGifIDB();
      return new Promise((res, rej) => {
        const tx = db.transaction("blobs", "readonly");
        const req = tx.objectStore("blobs").get(id);
        req.onsuccess = (e) => res(e.target.result?.dataUrl || null);
        req.onerror = (e) => rej(e.target.error);
      });
    }
    async function idbDelete(id) {
      const db = await openGifIDB();
      return new Promise((res) => {
        const tx = db.transaction("blobs", "readwrite");
        tx.objectStore("blobs").delete(id);
        tx.oncomplete = () => res();
        tx.onerror   = () => res(); // 刪除失敗不中斷流程
      });
    }

    // 將 URL 的路徑部分作為穩定 key（去掉 query string）
    function gifCacheKey(url) {
      try {
        return new URL(url).pathname;
      } catch (e) {
        DEBUG && console.warn("[gifCacheKey] URL 解析失敗，回退原始字串", url, e);
        return url;
      }
    }

    // 讀快取：先查 GM，再查 IDB
    async function readGifCache(url) {
      const k = gifCacheKey(url);
      const gmKey = GIF_CACHE_PREFIX + k;
      // GM storage 讀取
      try {
        const val = GMStore.get(gmKey, null);
        if (val) return val;
      } catch (_) {}
      // IDB 讀取
      try {
        const val = await idbGet(k);
        if (val) return val;
      } catch (_) {}
      return null;
    }

    // 寫快取：小檔用 GM，大檔用 IDB；寫入後觸發 FIFO 淘汰
    async function writeGifCache(url, dataUrl) {
      const k = gifCacheKey(url);
      const byteLen = Math.round(dataUrl.length * 0.75); // base64 估算
      try {
        if (byteLen <= GIF_MAX_BYTES) {
          GMStore.set(GIF_CACHE_PREFIX + k, dataUrl);
        } else {
          await idbPut(k, dataUrl);
        }
        // 維護索引以便淘汰與清理
        try {
          const idx = GMStore.get(GIF_CACHE_INDEX, [], true);
          if (!idx.includes(k)) {
            idx.push(k);
          }
          // ── FIFO 淘汰：超過上限時移除最舊的項目 ──
          while (idx.length > GIF_CACHE_MAX_COUNT) {
            const evictKey = idx.shift(); // 取出最舊的 key
            // 同時清 GM 和 IDB（不確定存在哪層，兩個都刪）
            try { GMStore.del(GIF_CACHE_PREFIX + evictKey); } catch (_) {}
            try { await idbDelete(evictKey); } catch (_) {}
            DEBUG && console.log("[GifCache] FIFO evict:", evictKey);
          }
          GMStore.set(GIF_CACHE_INDEX, idx, true);
        } catch (_) {}
      } catch (e) {
        console.warn("[GifCache] write failed:", e);
      }
    }

    // 核心：下載並快取 GIF（回傳 base64 data URL）
    // 原本使用 new Promise(async ...) 反模式（async executor 內的例外不會 reject 外層），
    // 現改為正規 async function，未捕獲的非同步例外可正確傳播。
    // @param {string}   url         目標 URL
    // @param {Function} [onProgress]  進度回呼 (loaded, total) → void（v1.8.1）
    async function fetchAndCacheMedia(url, onProgress = null) {
      // 先嘗試命中快取
      try {
        const cached = await readGifCache(url);
        if (cached) {
          onProgress && onProgress(1, 1); // 快取命中視為完成
          return cached;
        }
      } catch (_) {}

      // 用 GM_xmlhttpRequest 繞過 CORS（包裝成 Promise）
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: url,
          responseType: "arraybuffer",
          timeout: 15000,
          onprogress(res) {
            if (onProgress && res.total > 0) {
              onProgress(res.loaded, res.total);
            }
          },
          onload(res) {
            if (res.status !== 200) {
              resolve(null);
              return;
            }
            // v1.7.0：FileReader async 取代 O(n) btoa 字元迴圈，避免大型 GIF 凍結 UI thread
            try {
              const mime =
                res.responseHeaders
                  .match(/content-type:\s*([^\r\n;]+)/i)?.[1]
                  ?.trim() ||
                (url.includes(".gif") ? "image/gif" : "image/webp");
              const blob = new Blob([res.response], { type: mime });
              const reader = new FileReader();
              reader.onload = () => {
                const b64 = reader.result; // 已是 "data:mime;base64,..." 格式
                writeGifCache(url, b64).catch(() => {});
                resolve(b64);
              };
              reader.onerror = () => {
                console.error("[GifCache] FileReader error");
                resolve(null);
              };
              reader.readAsDataURL(blob);
            } catch (e) {
              console.error("[GifCache] encode error:", e);
              resolve(null);
            }
          },
          onerror() {
            resolve(null);
          },
          ontimeout() {
            resolve(null);
          },
        });
      });
    }

    // ── CDN 過期檢測：解析 Discord 附件 URL 的 ex 參數（十六進制 Unix 時間戳）──
    function isDiscordUrlExpired(url) {
      const m = url.match(/[?&]ex=([0-9a-f]+)/i);
      if (!m) return false; // 無 ex 參數（Tenor / Klipy 等永久連結）不受影響
      return Date.now() > parseInt(m[1], 16) * 1000;
    }

    // ── fixcdn Proxy URL 建構：替換 hostname，保留路徑與其他 query 參數 ──
    // fixcdn.hyonsu.com 會在後端取得新 ex/is/hm 後重新導向至 Discord CDN
    function toFixcdnUrl(url) {
      return url
        .replace("cdn.discordapp.com", "fixcdn.hyonsu.com")
        .replace("media.discordapp.net", "fixcdn.hyonsu.com");
    }

    // 修補 img 元素：若載入失敗則嘗試從快取或重新下載
    // stableUrl = 去掉 CDN 簽名參數的永久 URL（用於快取 key）
    async function attachGifFallback(imgEl, originalUrl, stableUrl) {
      if (!originalUrl || !originalUrl.startsWith("http")) return;
      // 優先用 stableUrl 作為快取 key；fallback 到 originalUrl
      const cacheTarget =
        stableUrl && stableUrl.startsWith("http") ? stableUrl : originalUrl;

      // 先嘗試讀取本地快取（async 讀完才掛 onerror，避免競爭條件）
      let cachedDataUrl = null;
      try {
        cachedDataUrl = await readGifCache(cacheTarget);
      } catch (_) {}

      if (cachedDataUrl) {
        // 快取命中：直接替換 src，完全跳過網路請求
        imgEl.src = cachedDataUrl;
        return;
      }

      // 快取未命中：掛上 onerror，等待 CDN URL 失效時顯示靜態占位
      imgEl.onerror = async function () {
        this.onerror = null; // 防止無限循環
        this.alt = "🖼️";
        this.title = cacheTarget; // Tooltip 顯示原始連結
        this.style.cssText = [
          "object-fit:contain",
          "background:rgba(0,0,0,0.25)",
          "border-radius:4px",
          "font-size:24px",
          "display:flex",
          "align-items:center",
          "justify-content:center",
        ].join(";");
        DEBUG &&
          console.warn(
            "[GifCache] CDN expired, no local cache:",
            cacheTarget.slice(0, 80),
          );
      };
    }

    function parseMediaUrl(url, type) {
      const result = {
        url: url,
        thumbnail: null,
        stableUrl: url, // 去除時效參數的穩定 URL
        mediaType: type, // GIF / EMOJI / STICKER
        filename: "media", // 檔案名稱
        createdAt: new Date().toISOString(),
      };

      try {
        const urlObj = new URL(url);

        // 判斷檔案類型
        const path = urlObj.pathname.toLowerCase();
        if (path.match(/\.(gif|webp)$/)) {
          result.fileType = "gif";
        } else if (path.match(/\.(jpg|jpeg|png)$/)) {
          result.fileType = "image";
        } else if (path.match(/\.(mp4|webm|mov)$/)) {
          result.fileType = "video";
        }

        // 提取檔案名稱
        const pathParts = path.split("/");
        result.filename = pathParts[pathParts.length - 1] || "media";

        // 移除 Discord 的時效性參數（ex, is, hm）
        const searchParams = new URLSearchParams(urlObj.search);
        const hasTimeParams =
          searchParams.has("ex") ||
          searchParams.has("is") ||
          searchParams.has("hm");

        if (hasTimeParams) {
          searchParams.delete("ex");
          searchParams.delete("is");
          searchParams.delete("hm");

          // 重建穩定的 URL
          urlObj.search = searchParams.toString();
          result.stableUrl = urlObj.toString();

          // 生成縮圖 URL（適用於 Discord CDN）
          if (
            url.includes("cdn.discordapp.com") ||
            url.includes("media.discordapp.net")
          ) {
            const thumbParams = new URLSearchParams(searchParams);
            // 設定縮圖尺寸（保持長寬比）
            thumbParams.set("width", "400");
            thumbParams.set("height", "300");

            urlObj.search = thumbParams.toString();
            result.thumbnail = urlObj.toString();
          } else {
            result.thumbnail = result.stableUrl;
          }
        } else {
          // 如果沒有時效參數，直接使用原始 URL
          result.thumbnail = url;
        }
      } catch (e) {
        console.error("[parseMediaUrl] Failed to parse:", url, e);
        // 解析失敗時使用原始 URL
        result.thumbnail = url;
        result.stableUrl = url;
      }

      return result;
    }

    function detectAnimatedUrl(srcUrl) {
      return new Promise((resolve) => {
        const clean = srcUrl.split("?")[0];
        const gifUrl = clean.replace(/\.(webp|png|jpg)$/, ".gif");
        const img = new Image();
        img.onload = () => resolve({ isGif: true, url: gifUrl });
        img.onerror = () => resolve({ isGif: false, url: srcUrl });
        img.src = gifUrl + "?t=" + Date.now();
        setTimeout(() => resolve({ isGif: false, url: srcUrl }), 1500);
      });
    }

    function setNativeValue(element, value) {
      if (!element) return;
      if (element.type === "file") return;
      element.focus();
      const valueSetter = Object.getOwnPropertyDescriptor(
        element,
        "value",
      )?.set;
      const prototype = Object.getPrototypeOf(element);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(
        prototype,
        "value",
      )?.set;
      if (prototypeValueSetter && valueSetter !== prototypeValueSetter)
        prototypeValueSetter.call(element, value);
      else if (valueSetter) valueSetter.call(element, value);
      else element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function createMediaElement(content, isCompact = false, type) {
      if (!content) return null;

      let el;

      // 相容性處理：支援新舊兩種格式
      let actualContent = content;
      let thumbnailUrl = null;

      if (typeof content === "object" && content !== null) {
        // 新格式：物件（包含元數據）
        actualContent = content.content || content.url || content.stableUrl;
        thumbnailUrl = content.thumbnail || content.stableUrl || content.url;
      } else {
        // 舊格式：純字串
        actualContent = content;
        thumbnailUrl = content;
      }

      const isUrl =
        actualContent.startsWith("http") ||
        actualContent.startsWith("data:") ||
        actualContent.startsWith("blob:");

      if (isUrl) {
        // 使用縮圖 URL 來顯示（避免破圖）
        const displayUrl = thumbnailUrl || actualContent;

        if (actualContent.includes(".mp4") || actualContent.includes(".webm")) {
          el = document.createElement("video");
          el.src = displayUrl;
          el.muted = true;
          el.loop = true;
          el.autoplay = true;
        } else {
          el = document.createElement("img");
          el.src = displayUrl;

          // 優先嘗試讀取永久快取，避免 CDN 簽名失效導致破圖
          const _cacheTarget = actualContent || displayUrl;
          // 從 content 物件中取出 stableUrl（去簽名 URL），用於快取命中
          const _stableUrl =
            typeof content === "object" && content !== null
              ? content.stableUrl || null
              : null;
          if (_cacheTarget && _cacheTarget.startsWith("http")) {
            attachGifFallback(el, _cacheTarget, _stableUrl);
          } else {
            el.onerror = function () {
              if (this.src !== actualContent && actualContent !== displayUrl) {
                console.warn(
                  "[createMediaElement] Thumbnail failed, trying original URL:",
                  actualContent,
                );
                this.src = actualContent;
              }
            };
          }
        }
        el.className = "my-col-img";
      } else {
        el = document.createElement("span");
        el.className = isCompact ? "my-col-text" : "my-emoji-char-preview";
        el.innerText = actualContent;
        if (!isCompact) {
          el.style.fontSize = "20px";
          el.style.display = "flex";
          el.style.alignItems = "center";
          el.style.justifyContent = "center";
          el.style.width = "100%";
          el.style.height = "100%";
        }
      }
      return el;
    }

    function getSendableUrl(input, type) {
      // 相容性處理：支援物件格式
      let url = input;
      if (typeof input === "object" && input !== null) {
        url = input.stableUrl || input.url || input.content;
      }

      if (!url || !url.startsWith || !url.startsWith("http")) return url;
      const cleanUrl = url.split("?")[0];

      // [Fix] 針對貼圖強制使用 size=160 (解決顯示過小問題)
      if (type === TYPES.STICKER) return cleanUrl + "?size=160";

      // Emoji 使用 size=56 (標準大小)
      if (type === TYPES.EMOJI) return cleanUrl + "?size=56";

      return url;
    }

    // 產生原生 Discord 表情代碼 <name:id>
    function getNativeEmojiTag(url, isAnimated) {
      const match = url.match(/emojis\/(\d+)/);
      if (!match) return null;
      const id = match[1];
      const name = "emoji";
      return isAnimated ? `<a:${name}:${id}>` : `<:${name}:${id}>`;
    }

    function pasteAndSend(url) {
      try {
        const textarea = document.querySelector(
          'div[role="textbox"][contenteditable]',
        );
        if (!textarea) {
          console.warn("Textbox not found");
          GM_setClipboard(url);
          showEmojiToast("無法找到輸入框，已複製連結！", url);
          return;
        }
        const hasText =
          textarea.textContent && textarea.textContent.trim().length > 0;
        const sendUrlAction = () => {
          textarea.focus();
          const pasteEvent = new ClipboardEvent("paste", {
            clipboardData: new DataTransfer(),
            bubbles: true,
            cancelable: true,
          });
          pasteEvent.clipboardData.setData("text/plain", url);
          textarea.dispatchEvent(pasteEvent);
          setTimeout(() => {
            textarea.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
              }),
            );
          }, 50);
        };
        if (hasText) {
          textarea.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            }),
          );
          setTimeout(() => {
            sendUrlAction();
          }, 150);
        } else {
          sendUrlAction();
        }
      } catch (e) {
        GM_setClipboard(url);
        showEmojiToast("發送失敗，已複製連結", url);
      }
    }

    // ============================
    // 4. UI Logic
    // ============================
    let activeDropdown = null;
    let activeTrigger = null;
    let currentActiveTab = "General";
    let batchTargetMode = false;
    let activeBatchCollection = null;
    let activeBatchType = null;
    let dragSrcIndex = null;
    let currentViewType = TYPES.EMOJI; // [New] 側邊型別標籤的持久狀態
    let itemDragSrcIdx = null;         // [New] 格內項目拖曳排序索引

    function repositionDropdown(center = false) {
      const dropdown = document.querySelector(".my-popover-menu.show");
      if (!dropdown || !activeTrigger) return;
      const rect = dropdown.getBoundingClientRect();
      let left;
      if (center) {
        // 初次開啟時：以觸發按鈕所在容器為基準置中
        const container =
          activeTrigger.closest('div[class*="header"], div[class*="container"]') ||
          document.body;
        const containerRect = container.getBoundingClientRect();
        left = containerRect.left + containerRect.width / 2 - rect.width / 2;
      } else {
        // 切換分頁後：保持現有 left，僅防止超出視窗邊緣
        left = parseFloat(dropdown.style.left) || rect.left;
      }
      if (left < 10) left = 10;
      if (left + rect.width > window.innerWidth - 10)
        left = window.innerWidth - rect.width - 10;
      dropdown.style.left = `${left}px`;
    }

    function showDropdown(triggerBtn) {
      const dropdown = document.querySelector(".my-popover-menu");
      dropdown.style.visibility = "hidden";
      dropdown.classList.add("show");
      const btnRect = triggerBtn.getBoundingClientRect();
      dropdown.style.top = `${btnRect.bottom + 8}px`;
      activeDropdown = dropdown;
      activeTrigger = triggerBtn;
      repositionDropdown(true); // 初次開啟：置中
      dropdown.style.visibility = "visible";
    }

    function closeAllMenus() {
      document
        .querySelectorAll(".my-popover-menu.show")
        .forEach((m) => {
          m.classList.remove("show");
          m.classList.remove("collection-mode"); // [Fix] 避免側邊欄布局殘留到其他選單
        });
      const modal = document.querySelector(".my-save-modal");
      if (modal) modal.remove();
      activeDropdown = null;
      activeTrigger = null;
    }

    document.addEventListener("mousedown", (e) => {
      if (!activeDropdown) return;
      if (e.target.closest(".my-save-modal")) return;
      if (e.target.closest(".my-popover-menu")) return;
      if (
        activeTrigger &&
        (activeTrigger.contains(e.target) || activeDropdown.contains(e.target))
      )
        return;
      closeAllMenus();
    });

    // ============================
    // 5. Target Selection & Modal
    // ============================
    function startTargetSelection(type, onUrlSelected, continuous = false) {
      closeAllMenus();
      const scroller =
        document.querySelector('div[class*="scroller"][class*="list"]') ||
        document.querySelector('div[class*="scroller"][class*="grid"]') ||
        document.querySelector(
          '[id^="gif-picker-tab-panel"] div[class*="scroller"]',
        ) ||
        document.querySelector(
          '[id^="sticker-picker-tab-panel"] div[class*="scroller"]',
        );

      if (!scroller) {
        alert(t("em_err_no_list"));
        return;
      }
      if (continuous) showEmojiToast("連續模式已開啟 (Esc 退出)", null);

      const masks = [];
      const createMask = (l, t, w, h) => {
        const m = document.createElement("div");
        m.className = "my-picker-mask";
        m.style.left = l + "px";
        m.style.top = t + "px";
        m.style.width = w + "px";
        m.style.height = h + "px";
        document.body.appendChild(m);
        masks.push(m);
        m.addEventListener("click", cleanup);
      };
      const rect = scroller.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      createMask(0, 0, winW, rect.top);
      createMask(0, rect.bottom, winW, winH - rect.bottom);
      createMask(0, rect.top, rect.left, rect.height);
      createMask(rect.right, rect.top, winW - rect.right, rect.height);

      const tip = document.createElement("div");
      tip.className = "my-picker-tip";
      tip.innerText = continuous
        ? activeBatchCollection
          ? `已鎖定: ${activeBatchCollection}`
          : "請點擊目標選擇分類"
        : t("em_btn_target_title");
      document.body.appendChild(tip);
      const frame = document.createElement("div");
      frame.className = "my-picker-frame";
      frame.style.display = "none";
      document.body.appendChild(frame);

      function getTarget(e) {
        const el = e.target;
        const media = el.closest('img[src^="http"], video');
        if (media) return media;
        const btn = el.closest('button[data-type="emoji"]');
        if (btn) {
          const img = btn.querySelector("img");
          if (img) return img;
        }
        return null;
      }

      let _rafId = null;
      function onMouseMove(e) {
        if (_rafId) return;
        _rafId = requestAnimationFrame(() => {
          _rafId = null;
          const target = getTarget(e);
          if (target) {
            const tr = target.getBoundingClientRect();
            frame.style.left = tr.left + "px";
            frame.style.top = tr.top + "px";
            frame.style.width = tr.width + "px";
            frame.style.height = tr.height + "px";
            frame.style.display = "block";
          } else {
            frame.style.display = "none";
          }
        });
      }

      function killEvent(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }

      function onInteraction(e) {
        const target = getTarget(e);
        if (target) {
          killEvent(e);
          if (e.type === "click") {
            let content = "";
            if (
              target.src &&
              (target.src.includes("/emojis/") ||
                target.src.includes("/stickers/") ||
                target.src.includes("tenor"))
            ) {
              content = target.src;
            } else if (target.tagName === "VIDEO") {
              const cdnSrc =
                target.src || target.querySelector("source")?.src || "";
              const pageUrl = getKlipyPageUrl(target) || "";
              const finalUrl = pageUrl || cdnSrc;
              if (finalUrl) {
                const thumb =
                  _klipyThumbCache.get(pageUrl) || cdnSrc || pageUrl;
                content = pageUrl
                  ? {
                      url: finalUrl,
                      content: finalUrl,
                      stableUrl: finalUrl,
                      thumbnail: thumb,
                      mediaType: TYPES.GIF,
                      filename: finalUrl.split("/").pop(),
                      createdAt: new Date().toISOString(),
                    }
                  : cdnSrc;
              }
            } else if (target.alt && target.alt.length < 10) {
              content = target.alt;
            } else {
              content = target.src;
            }
            if (content) onUrlSelected(content);
            if (!continuous) cleanup();
          }
        } else if (e.target.closest(".my-picker-mask") && !continuous) {
          cleanup();
        }
      }

      function cleanup() {
        masks.forEach((m) => m.remove());
        tip.remove();
        frame.remove();
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("click", onInteraction, true);
        document.removeEventListener("mousedown", onInteraction, true);
        document.removeEventListener("mouseup", onInteraction, true);
        document.removeEventListener("mousemove", onMouseMove, {
          passive: true,
        });
        batchTargetMode = false;
        activeBatchCollection = null;
        activeBatchType = null;
        document
          .querySelectorAll(".my-tool-btn.batch-active")
          .forEach((b) => b.classList.remove("batch-active"));
      }

      function onKey(e) {
        if (e.key === "Escape") cleanup();
      }

      document.addEventListener("keydown", onKey);
      document.addEventListener("click", onInteraction, true);
      document.addEventListener("mousedown", onInteraction, true);
      document.addEventListener("mouseup", onInteraction, true);
      document.addEventListener("mousemove", onMouseMove, { passive: true });
    }

    function handleTargetClickLogic(type, content) {
      if (batchTargetMode && activeBatchCollection) {
        addToCollection(activeBatchType, activeBatchCollection, content);
        return;
      }
      showSaveModal(type, content, (selectedColName) => {
        addToCollection(type, selectedColName, content);
        if (batchTargetMode) {
          activeBatchCollection = selectedColName;
          activeBatchType = type;
          const tip = document.querySelector(".my-picker-tip");
          if (tip)
            tip.innerText = `已鎖定: ${activeBatchCollection} (連點加入 / Esc 退出)`;
        }
      });
    }

    function showSaveModal(type, url, onSelect) {
      const existing = document.querySelector(".my-save-modal");
      if (existing) existing.remove();
      const modal = document.createElement("div");
      modal.className = "my-save-modal";
      modal.addEventListener("mousedown", (e) => e.stopPropagation());
      modal.addEventListener("click", (e) => e.stopPropagation());
      const header = document.createElement("div");
      header.className = "my-save-header";
      header.innerText = t("em_modal_choose_tab");
      modal.appendChild(header);
      const list = document.createElement("div");
      list.className = "my-save-list";
      const cols = getCollections(type);
      Object.keys(cols).forEach((name) => {
        const item = document.createElement("div");
        item.className = "my-save-item";
        item.innerText = `📂 ${name}`;
        item.onclick = () => {
          onSelect(name);
          modal.remove();
        };
        list.appendChild(item);
      });
      const createBtn = document.createElement("div");
      createBtn.className = "my-save-item create";
      createBtn.innerText = t("em_modal_create_new");
      createBtn.onclick = () => {
        const newName = prompt(t("em_col_tab_prompt"));
        if (newName && newName.trim()) {
          onSelect(newName.trim());
          modal.remove();
        }
      };
      list.appendChild(createBtn);
      modal.appendChild(list);
      document.body.appendChild(modal);
      setTimeout(() => {
        const closeFn = (e) => {
          if (!modal.contains(e.target)) {
            modal.remove();
            document.removeEventListener("click", closeFn);
          }
        };
        document.addEventListener("click", closeFn);
      }, 100);
    }

    // v1.7.0：統一 Toast — 轉發至頂層 dmtShowToast
    // 原本每次呼叫都動態插入 @keyframes fadeUp style，現已移入 EMOJI_STYLES 靜態注入
    function showEmojiToast(msg, iconUrl) {
      dmtShowToast(String(msg), { icon: iconUrl || null, duration: 2000 });
    }

    // ============================
    // 6. UI Renderers
    // ============================
    function renderKeywordDropdown(input, list, btn, type) {
      const dropdown = document.querySelector(".my-popover-menu");
      if (!dropdown) return;
      dropdown.innerHTML = "";
      dropdown.style.padding = "0";
      const container = document.createElement("div");
      container.style.padding = "4px";
      if (list.length === 0) {
        container.innerHTML = `<div style="padding:12px; color:#72767d; font-size:12px; text-align:center;">${t("em_no_favs")}</div>`;
      } else {
        list.forEach((item) => {
          const row = document.createElement("div");
          row.className = "my-menu-item";
          row.addEventListener("mousedown", (ev) => ev.preventDefault());

          const iconBox = document.createElement("div");
          iconBox.className = "my-emoji-preview-box";

          let media = createMediaElement(item.icon, false, type);
          if (!media) {
            // 精緻化文字圖示: 使用 SVG 背景 + 首字
            media = document.createElement("div");
            media.className = "my-emoji-icon-placeholder";
            const letter = (item.key || "?").substring(0, 1).toUpperCase();
            media.innerHTML = `
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.2)" style="position:absolute;">
                            <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"></path>
                        </svg>
                        <span style="position:relative; z-index:2; font-size:16px;">${letter}</span>
                    `;
          } else if (media.tagName === "SPAN" && !item.icon) {
            media.className = "my-emoji-icon-placeholder";
          }

          iconBox.appendChild(media);
          row.appendChild(iconBox);

          const contentDiv = document.createElement("div");
          contentDiv.className = "my-emoji-content";
          const headerDiv = document.createElement("div");
          headerDiv.className = "my-emoji-header";
          headerDiv.innerHTML = `<span class="my-emoji-key">${escHtml(item.key)}</span>`;
          if (item.note)
            headerDiv.innerHTML += `<span class="my-emoji-note-badge">${escHtml(item.note)}</span>`;
          contentDiv.appendChild(headerDiv);
          row.appendChild(contentDiv);

          const actionsDiv = document.createElement("div");
          actionsDiv.className = "my-emoji-actions";

          const pickBtn = document.createElement("div");
          pickBtn.className = "my-emoji-btn pick-icon";
          pickBtn.innerHTML = "🔍";
          pickBtn.onclick = (ev) => {
            ev.stopPropagation();
            startTargetSelection(
              type,
              (newUrl) => {
                item.icon = newUrl;
                saveFavs(type, list);
                if (btn) {
                  btn.click();
                  btn.click();
                }
                showEmojiToast(t("em_set_cover_success"), newUrl);
              },
              false,
            );
          };
          actionsDiv.appendChild(pickBtn);

          const editBtn = document.createElement("div");
          editBtn.className = "my-emoji-btn";
          editBtn.innerHTML = "✎";
          editBtn.onclick = (ev) => {
            ev.stopPropagation();
            const newNote = prompt(t("em_note_prompt"), item.note || "");
            if (newNote !== null) {
              item.note = newNote.trim();
              saveFavs(type, list);
              if (btn) {
                btn.click();
                btn.click();
              }
            }
          };
          actionsDiv.appendChild(editBtn);

          const delBtn = document.createElement("div");
          delBtn.className = "my-emoji-btn delete";
          delBtn.innerHTML = "✕";
          delBtn.addEventListener("mousedown", (ev) => ev.stopPropagation());
          delBtn.onclick = (ev) => {
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            // Shift+click → 直接刪除；否則彈出非阻塞確認
            if (ev.shiftKey) {
              const newList = list.filter((k) => k.key !== item.key);
              saveFavs(type, newList);
              renderKeywordDropdown(input, newList, btn, type);
            } else {
              dmtConfirm(t("em_del_confirm", { k: item.key }), { danger: true }).then((ok) => {
                if (!ok) return;
                const newList = list.filter((k) => k.key !== item.key);
                saveFavs(type, newList);
                renderKeywordDropdown(input, newList, btn, type);
              });
            }
            return; // 以下原本的 if (doDelete) 區塊由上方分支取代
            // （已移至 Patch 7 的 dmtConfirm 分支）
          };
          actionsDiv.appendChild(delBtn);

          row.appendChild(actionsDiv);
          row.onclick = (ev) => {
            if (ev.target.closest(".my-emoji-btn")) return;
            ev.stopPropagation();
            setNativeValue(input, item.key);
            input.focus();
            closeAllMenus();
          };
          container.appendChild(row);
        });
      }
      dropdown.appendChild(container);
    }

    function renderTabsView(input, type) {
      currentViewType = type; // [New] persist for sidebar switching
      const dropdown = document.querySelector(".my-popover-menu");
      if (!dropdown) return;
      dropdown.innerHTML = "";
      dropdown.classList.remove("input-mode"); // clean up old mode class
      dropdown.classList.add("collection-mode");

      // 資料準備
      const cols = getCollections(type);
      let tabNames = Object.keys(cols);
      tabNames = ["General", ...tabNames.filter((n) => n !== "General")];
      if (!tabNames.includes(currentActiveTab) && tabNames.length > 0)
        currentActiveTab = tabNames[0];

      // --- 0. 建立 Type Sidebar（梯形分類標籤）---
      const typeSidebar = document.createElement("div");
      typeSidebar.className = "my-type-sidebar";
      [
        { id: TYPES.EMOJI,   icon: "😃", label: t("em_menu_emoji")   },
        { id: TYPES.STICKER, icon: "🖼️", label: t("em_menu_sticker") },
        { id: TYPES.GIF,     icon: "🎞️", label: t("em_menu_gif")     },
      ].forEach(({ id, icon, label }) => {
        const typeTab = document.createElement("div");
        typeTab.className = `my-type-tab${id === type ? " active" : ""}`;
        typeTab.innerHTML = `<span class="my-type-icon">${icon}</span><span class="my-type-label">${label}</span>`;
        typeTab.addEventListener("mousedown", (e) => e.stopPropagation());
        typeTab.onclick = (e) => {
          e.stopPropagation();
          currentActiveTab = "General"; // 切換類型時重置到 General
          renderTabsView(input, id);
        };
        typeSidebar.appendChild(typeTab);
      });

      // --- 0b. 側邊欄底部：LINK / NATIVE 切換按鈕（僅 EMOJI 顯示）---
      if (type === TYPES.EMOJI) {
        const isNative = getNativeMode();
        const spacer = document.createElement("div");
        spacer.className = "my-sidebar-mode-spacer";
        const divider = document.createElement("div");
        divider.className = "my-sidebar-mode-divider";
        const modeBtn = document.createElement("div");
        modeBtn.className = `my-sidebar-mode-btn ${isNative ? "native" : "link"}`;
        modeBtn.innerHTML = isNative
          ? `<span class="my-sidebar-mode-icon">✦</span><span class="my-sidebar-mode-label">NATIVE</span>`
          : `<span class="my-sidebar-mode-icon">🔗</span><span class="my-sidebar-mode-label">LINK</span>`;
        modeBtn.title = MODE_TOOLTIP;
        modeBtn.addEventListener("mousedown", (e) => e.stopPropagation());
        modeBtn.onclick = (e) => {
          e.stopPropagation();
          setNativeMode(!isNative);
          renderTabsView(input, type);
        };
        typeSidebar.appendChild(spacer);
        typeSidebar.appendChild(divider);
        typeSidebar.appendChild(modeBtn);
      }

      // --- 1. 建立 Main Area ---
      const colMain = document.createElement("div");
      colMain.className = "my-col-main";

      // --- 1a. 建立 Header ---
      const header = document.createElement("div");
      header.className = "my-tabs-header";

      const scrollArea = document.createElement("div");
      scrollArea.className = "my-tab-scroll-area";

      // 建立分頁標籤 (Tabs)
      tabNames.forEach((name, index) => {
        const tab = document.createElement("div");
        tab.className = `my-tab ${name === currentActiveTab ? "active" : ""}`;
        tab.innerText = name;
        tab.draggable = name !== "General"; // General 固定位置，不可拖曳

        // Tab 右鍵刪除
        tab.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          if (name === "General") return;
          dmtConfirm(t("em_col_del_tab_confirm", { n: name }), { danger: true }).then((ok) => {
            if (!ok) return;
            delete cols[name];
            saveCollections(type, cols);
            renderTabsView(input, type);
          });
        });

        // Tab 拖曳排序（改良版：dragenter/dragleave 視覺回饋 + 正確重置 dragSrcIndex）
        tab.addEventListener("dragstart", (ev) => {
          dragSrcIndex = index;
          tab.classList.add("dragging");
          ev.dataTransfer.effectAllowed = "move";
          ev.dataTransfer.setData("text/plain", String(index));
        });
        tab.addEventListener("dragend", () => {
          dragSrcIndex = null; // [Fix] 拖曳結束後確實重置
          tab.classList.remove("dragging");
          document.querySelectorAll(".my-tab.drag-over").forEach((t) => t.classList.remove("drag-over"));
        });
        tab.addEventListener("dragenter", (ev) => {
          ev.preventDefault();
          if (dragSrcIndex !== null && dragSrcIndex !== index)
            tab.classList.add("drag-over");
        });
        tab.addEventListener("dragleave", () => {
          tab.classList.remove("drag-over");
        });
        tab.addEventListener("dragover", (ev) => {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "move";
          return false;
        });
        tab.addEventListener("drop", (ev) => {
          ev.stopPropagation();
          tab.classList.remove("drag-over");
          if (dragSrcIndex !== null && dragSrcIndex !== index) {
            reorderCollections(type, dragSrcIndex, index);
            dragSrcIndex = null; // [Fix] drop 後重置
            renderTabsView(input, type);
          }
          return false;
        });

        tab.addEventListener("mousedown", (ev) => ev.stopPropagation());
        tab.onclick = (ev) => {
          ev.stopPropagation();
          currentActiveTab = name;
          renderTabsView(input, type);
        };
        scrollArea.appendChild(tab);
      });

      header.appendChild(scrollArea);

      // --- 1b. 建立控制區（新增分頁 + Refresh + Mode Switch）---
      const controls = document.createElement("div");
      controls.className = "my-tab-controls";
      Object.assign(controls.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
      });

      // [Fix] 新增分頁按鈕移至控制區，不再隨分頁捲動而消失
      const addTabBtn = document.createElement("div");
      addTabBtn.className = "my-tab-add-ctrl";
      addTabBtn.innerText = "+";
      addTabBtn.title = t("em_col_tab_new");
      addTabBtn.addEventListener("mousedown", (ev) => ev.stopPropagation());
      addTabBtn.onclick = (ev) => {
        ev.stopPropagation();
        const newName = prompt(t("em_col_tab_prompt"));
        if (newName && newName.trim()) {
          const finalName = newName.trim();
          if (!cols[finalName]) {
            cols[finalName] = [];
            saveCollections(type, cols);
            currentActiveTab = finalName;
            renderTabsView(input, type);
          }
        }
      };
      controls.appendChild(addTabBtn);

      // [新增] GIF 重新整理按鈕（SVG 圖示 + 多語言）
      if (type === TYPES.GIF) {
        const refreshBtn = document.createElement("div");

        // SVG 刷新圖示（簡約風格）
        refreshBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 4v6h-6"></path>
            <path d="M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"></path>
          </svg>
        `;

        refreshBtn.title = t("em_col_refresh_tooltip");

        Object.assign(refreshBtn.style, {
          cursor: "pointer",
          width: "24px",
          height: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: "0.6",
          transition: "opacity 0.2s, background 0.2s, transform 0.2s",
          borderRadius: "4px",
          color: "#b5bac1",
          flexShrink: "0",
        });

        refreshBtn.onmouseenter = () => {
          refreshBtn.style.opacity = "1";
          refreshBtn.style.color = "#dbdee1";
          refreshBtn.style.background = "rgba(88, 101, 242, 0.2)";
          refreshBtn.style.transform = "rotate(20deg)";
        };
        refreshBtn.onmouseleave = () => {
          refreshBtn.style.opacity = "0.6";
          refreshBtn.style.color = "#b5bac1";
          refreshBtn.style.background = "transparent";
          refreshBtn.style.transform = "rotate(0deg)";
        };

        refreshBtn.addEventListener("mousedown", (e) => e.stopPropagation());
        refreshBtn.onclick = async (e) => {
          e.stopPropagation();

          const currentItems = cols[currentActiveTab] || [];

          // ① 只處理含 ex 參數且已過期的 Discord CDN 附件連結
          const expiredItems = currentItems.filter((item) => {
            const url = typeof item === "object" ? item.url || item.content : item;
            return url && url.startsWith("http") && isDiscordUrlExpired(url);
          });

          if (expiredItems.length === 0) {
            showToast(t("em_refresh_no_expired"));
            return;
          }

          // ② 嘗試取得 Wormhole Plan B Token（記憶體，頁面關閉後清除）
          const token = window.wormholeModule?._cachedToken || null;

          // ③ 無 token 時走 fixcdn 備用路徑，需先取得使用者同意
          if (!token) {
            const CONSENT_KEY = "dmt_fixcdn_consent";
            if (localStorage.getItem(CONSENT_KEY) !== "1") {
              const agreed = await dmtConfirm(t("em_refresh_consent"));
              if (!agreed) {
                showToast(t("em_refresh_cancel_tip"));
                return;
              }
              localStorage.setItem(CONSENT_KEY, "1");
            }
          }

          // ④ 懶注入 Loading Overlay CSS（只注入一次）
          if (!document.getElementById("dmt-gif-refresh-style")) {
            const s = document.createElement("style");
            s.id = "dmt-gif-refresh-style";
            s.textContent = [
              "@keyframes dmt-spin { to { transform: rotate(360deg); } }",
              "@keyframes dmt-pulse { 0%,100%{ opacity:.35; } 50%{ opacity:1; } }",
              ".dmt-refresh-overlay {",
              "  position:absolute; inset:0; z-index:20;",
              "  background:rgba(32,34,37,0.78); backdrop-filter:blur(3px);",
              "  display:flex; flex-direction:column;",
              "  align-items:center; justify-content:center; gap:8px;",
              "  border-radius:0 0 4px 4px; pointer-events:none;",
              "}",
              ".dmt-refresh-overlay .dmt-ro-icon {",
              "  font-size:30px; line-height:1;",
              "  animation: dmt-spin 2s linear infinite;",
              "  display:inline-block;",
              "}",
              ".dmt-refresh-overlay .dmt-ro-label {",
              "  color:#b5bac1; font-size:12px; letter-spacing:.06em;",
              "  animation: dmt-pulse 1.4s ease-in-out infinite;",
              "}",
              ".dmt-refresh-overlay .dmt-ro-counter {",
              "  color:#72767d; font-size:11px;",
              "}",
            ].join("\n");
            document.head.appendChild(s);
          }

          // ⑤ 顯示 Loading Overlay
          const panelContent =
            refreshBtn.closest(".my-popover-menu")?.querySelector(".my-tab-content");
          let overlay = null;
          let counterEl = null;
          if (panelContent) {
            overlay   = document.createElement("div");
            overlay.className = "dmt-refresh-overlay";
            const iconEl    = document.createElement("span");
            iconEl.className = "dmt-ro-icon";
            iconEl.textContent = "🧊";
            const labelEl   = document.createElement("span");
            labelEl.className = "dmt-ro-label";
            labelEl.textContent = t("em_refresh_loading");
            counterEl = document.createElement("span");
            counterEl.className = "dmt-ro-counter";
            counterEl.textContent = `0 / ${expiredItems.length}`;
            overlay.append(iconEl, labelEl, counterEl);
            panelContent.appendChild(overlay);
          }

          // ⑥ 鎖定刷新按鈕
          refreshBtn.style.opacity = "0.3";
          refreshBtn.style.pointerEvents = "none";

          let refreshCount = 0;
          let failCount    = 0;
          let doneCount    = 0;

          for (const item of expiredItems) {
            const url = typeof item === "object" ? item.url || item.content : item;
            if (!url || !url.startsWith("http")) { doneCount++; continue; }

            try {
              // 清除舊快取（BUG FIX：改用 gifCacheKey() 取 pathname，與寫入時一致）
              const cacheKey = gifCacheKey(url);
              try { GMStore.del(GIF_CACHE_PREFIX + cacheKey); } catch (_) {}
              try { await idbDelete(cacheKey); } catch (_) {}

              // ⑦ 主線：Discord 官方 refresh-urls API（需要 Wormhole Plan B Token）
              let freshUrl = null;
              if (token) {
                freshUrl = await new Promise((resolve) => {
                  GM_xmlhttpRequest({
                    method:  "POST",
                    url:     "https://discord.com/api/v9/attachments/refresh-urls",
                    headers: {
                      "Content-Type":  "application/json",
                      "Authorization": token,
                    },
                    data:    JSON.stringify({ attachment_urls: [url] }),
                    timeout: 10000,
                    onload(res) {
                      if (res.status !== 200) { resolve(null); return; }
                      try {
                        const data = JSON.parse(res.responseText);
                        resolve(data.refreshed_urls?.[0]?.refreshed || null);
                      } catch (_) { resolve(null); }
                    },
                    onerror()  { resolve(null); },
                    ontimeout(){ resolve(null); },
                  });
                });
              }

              // ⑧ 備用：fixcdn.hyonsu.com Proxy（GM_xmlhttpRequest 繞過 CSP）
              const downloadUrl = freshUrl || toFixcdnUrl(url);

              // v1.8.1：傳入 onProgress，讓 overlay 顯示下載百分比
              const dataUrl = await fetchAndCacheMedia(downloadUrl, (loaded, total) => {
                if (counterEl && total > 0) {
                  const pct = Math.round((loaded / total) * 100);
                  counterEl.textContent = `${doneCount + 1} / ${expiredItems.length}  ${pct}%`;
                }
              });
              if (dataUrl) {
                if (freshUrl && typeof item === "object") item.url = freshUrl;
                refreshCount++;
              } else {
                failCount++;
              }
            } catch (err) {
              DEBUG && console.error("[GifRefresh] Error:", err);
              failCount++;
            }

            // 更新進度計數
            doneCount++;
            if (counterEl) counterEl.textContent = `${doneCount} / ${expiredItems.length}`;
          }

          // 移除 overlay
          overlay?.remove();

          // 有刷新成功時持久化回 collections
          // token 路徑：item.url 已更新為新的 freshUrl，需要寫回
          // fixcdn 路徑：item.url 未變，但快取已重新下載，saveCollections 確保
          //              collections 的 updatedAt 等 metadata 同步（無副作用）
          if (refreshCount > 0) saveCollections(type, cols);

          refreshBtn.style.opacity       = "0.6";
          refreshBtn.style.pointerEvents = "auto";

          renderTabsView(input, type);

          const track = token ? t("em_refresh_track_api") : t("em_refresh_track_cdn");
          const failSuffix = failCount > 0 ? t("em_refresh_partial_fail", { f: failCount }) : "";
          const msg = refreshCount > 0
            ? t("em_refresh_ok", { n: refreshCount, fail: failSuffix, track })
            : failCount > 0
            ? t("em_refresh_fail")
            : t("em_refresh_no_expired");

          showToast(msg);
        };
        controls.appendChild(refreshBtn);
      }

      header.appendChild(controls);
      colMain.appendChild(header);

      // --- 2. 建立內容區 (Grid) ---
      const content = document.createElement("div");
      content.className = "my-tab-content";
      content.addEventListener("mousedown", (ev) => ev.stopPropagation());

      const currentItems = cols[currentActiveTab] || [];
      const grid = document.createElement("div");
      grid.className = "my-col-grid";

      // 設定 Grid 樣式類別
      if (type === TYPES.EMOJI) grid.classList.add("emoji");
      else if (type === TYPES.STICKER) grid.classList.add("sticker");
      else grid.classList.add("gif");

      if (currentItems.length === 0) {
        content.innerHTML = `<div style="padding:20px; color:#72767d; font-size:12px; text-align:center;">${t("em_col_empty_tab")}</div>`;
      } else {
        currentItems.forEach((url, itemIndex) => {
          const wrap = document.createElement("div");
          wrap.className = "my-col-img-wrapper";
          wrap.draggable = true;

          // ── 格內項目拖曳排序 ──
          wrap.addEventListener("dragstart", (ev) => {
            itemDragSrcIdx = itemIndex;
            wrap.classList.add("item-dragging");
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", String(itemIndex));
            ev.stopPropagation(); // 不觸發分頁的 dragstart
          });
          wrap.addEventListener("dragend", () => {
            itemDragSrcIdx = null;
            wrap.classList.remove("item-dragging");
            grid.querySelectorAll(".item-drag-over").forEach((el) => el.classList.remove("item-drag-over"));
          });
          wrap.addEventListener("dragenter", (ev) => {
            ev.preventDefault();
            if (itemDragSrcIdx !== null && itemDragSrcIdx !== itemIndex)
              wrap.classList.add("item-drag-over");
          });
          wrap.addEventListener("dragleave", () => {
            wrap.classList.remove("item-drag-over");
          });
          wrap.addEventListener("dragover", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.dataTransfer.dropEffect = "move";
          });
          wrap.addEventListener("drop", (ev) => {
            ev.stopPropagation();
            wrap.classList.remove("item-drag-over");
            if (itemDragSrcIdx !== null && itemDragSrcIdx !== itemIndex) {
              const arr = cols[currentActiveTab];
              const [moved] = arr.splice(itemDragSrcIdx, 1);
              arr.splice(itemIndex, 0, moved);
              itemDragSrcIdx = null;
              saveCollections(type, cols);
              renderTabsView(input, type);
            }
          });

          const media = createMediaElement(url, true, type);
          if (media) wrap.appendChild(media);

          // 刪除按鈕
          const del = document.createElement("div");
          del.className = "my-col-del-btn";
          del.style.zIndex = "999";
          del.style.width = "20px";
          del.style.height = "20px";
          del.style.borderRadius = "0 0 0 6px";
          del.style.background = "rgba(0, 0, 0, 0.6)";
          del.style.backdropFilter = "blur(2px)";
          del.innerHTML =
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none; display:block;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

          del.onmouseenter = () => {
            del.style.background = "#ed4245";
          };
          del.onmouseleave = () => {
            del.style.background = "rgba(0, 0, 0, 0.6)";
          };

          const stopAll = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
          };
          del.addEventListener("mousedown", stopAll);
          del.addEventListener("click", (ev) => {
            stopAll(ev);

            // 相容性比對：支援新舊格式
            cols[currentActiveTab] = cols[currentActiveTab].filter((item) => {
              // 新格式（物件）vs 新格式（物件）
              if (typeof item === "object" && typeof url === "object") {
                const itemKey = item.url || item.stableUrl || item.content;
                const urlKey = url.url || url.stableUrl || url.content;
                return itemKey !== urlKey;
              }
              // 舊格式（字串）vs 舊格式（字串）
              else if (typeof item === "string" && typeof url === "string") {
                return item !== url;
              }
              // 混合格式：提取 URL 進行比較
              else {
                const itemUrl =
                  typeof item === "object"
                    ? item.url || item.stableUrl || item.content
                    : item;
                const targetUrl =
                  typeof url === "object"
                    ? url.url || url.stableUrl || url.content
                    : url;
                return itemUrl !== targetUrl;
              }
            });

            saveCollections(type, cols);
            renderTabsView(input, type);
          });
          wrap.appendChild(del);

          // [Core Fix] 點擊發送邏輯
          wrap.onclick = async (ev) => {
            if (ev.target.closest(".my-col-del-btn")) return;
            if (!ev.shiftKey) closeAllMenus();

            let finalUrl = url;

            // [關鍵分支] 根據類型決定發送方式
            if (type === TYPES.EMOJI) {
              // Emoji: 允許切換原生代碼或連結
              const isNative = getNativeMode();
              wrap.style.opacity = "0.5"; // Loading 效果
              try {
                // [Fix] url 可能已被 parseMediaUrl 轉為物件格式，先正規化為字串
                const rawUrl =
                  typeof url === "object"
                    ? url.url || url.stableUrl || url.content
                    : url;
                const result = await detectAnimatedUrl(rawUrl);
                if (isNative) {
                  const nativeTag = getNativeEmojiTag(result.url, result.isGif);
                  finalUrl = nativeTag ? nativeTag : getSendableUrl(url, type);
                } else {
                  // 連結模式：如果是 GIF，使用原始連結，否則使用標準 size
                  if (result.isGif)
                    finalUrl =
                      result.url.split("?")[0] + "?size=56&quality=lossless";
                  else finalUrl = getSendableUrl(url, type);
                }
              } catch (e) {
                console.warn("Detection failed", e);
                finalUrl = getSendableUrl(url, type);
              }
              wrap.style.opacity = "1";
            } else {
              // [Fix] Sticker & GIF: 強制使用連結 (Size=160 會在 getSendableUrl 中處理)
              finalUrl = getSendableUrl(url, type);
            }

            pasteAndSend(finalUrl);
          };
          grid.appendChild(wrap);
        });
        content.appendChild(grid);
      }
      colMain.appendChild(content);
      dropdown.appendChild(typeSidebar);
      dropdown.appendChild(colMain);
      // [Fix] 內容更新後重新夾緊位置，避免切換到較寬分頁時超出視窗邊緣
      repositionDropdown();
    }

    // ============================
    // 7. Core Injection (Updated: Idle Easter Egg)
    // ============================
    const processedNodes = new WeakSet();

    function injectInputTools(node) {
      if (!node) return;
      let input;
      if (node.tagName === "INPUT") {
        input = node;
      } else {
        input = node.querySelector('input[type="text"], input[type="search"]');
        if (!input) input = node.querySelector("input");
      }

      if (!input || input.type === "file" || input.type === "hidden") return;

      let headerContainer = node.closest(
        'div[class*="header"], div[class*="container"]',
      );
      const gifPickerWrapper = input.closest('[id^="gif-picker"]');
      const stickerPickerWrapper = input.closest('[id^="sticker-picker"]');

      if (!headerContainer && (gifPickerWrapper || stickerPickerWrapper)) {
        headerContainer = input.parentElement;
      }
      if (!headerContainer) return;

      const ariaControls = input.getAttribute("aria-controls") || "";
      const isSticker =
        ariaControls.includes("sticker") || stickerPickerWrapper;
      const isEmoji =
        input.placeholder.includes("emoji") ||
        input.placeholder.includes("表情") ||
        headerContainer.querySelector('div[class*="diversitySelector"]');
      const isGif =
        gifPickerWrapper ||
        input.placeholder.includes("Tenor") ||
        input.placeholder.includes("GIF") ||
        input.getAttribute("aria-label")?.includes("Tenor");

      if (!isSticker && !isEmoji && !isGif) return;
      const currentType = isSticker
        ? TYPES.STICKER
        : isGif
          ? TYPES.GIF
          : TYPES.EMOJI;

      // 清理舊的 Container (包含移除舊的 Listener)
      const existingContainer =
        headerContainer.querySelector(".my-emoji-toolbar");
      if (existingContainer) {
        if (existingContainer._boundInput === input && input.isConnected)
          return;
        else {
          existingContainer.remove();
          processedNodes.delete(headerContainer);
        }
      }

      processedNodes.add(node);
      processedNodes.add(headerContainer);

      // --- 建立工具列 ---
      const btnContainer = document.createElement("div");
      btnContainer.className = "my-emoji-toolbar";
      btnContainer._boundInput = input;
      btnContainer.style.display = "flex";
      btnContainer.style.alignItems = "center";

      // 1. 蒐藏庫按鈕
      const folderBtn = document.createElement("div");
      folderBtn.className = "my-tool-btn";
      folderBtn.innerHTML = ICON_FOLDER;
      folderBtn.title = t("em_col_title");
      folderBtn.onclick = (e) => {
        e.stopPropagation();
        closeAllMenus();
        renderTabsView(input, currentType);
        showDropdown(folderBtn);
      };
      btnContainer.appendChild(folderBtn);

      // 2. [Core] 準心按鈕
      const targetBtn = document.createElement("div");
      targetBtn.className = "my-tool-btn target-mode animating";
      targetBtn.innerHTML = ICON_TARGET;
      targetBtn.title = t("em_btn_target_title");

      targetBtn.onclick = (e) => {
        e.stopPropagation();
        targetBtn.classList.remove("animating"); // 點擊後停止浮誇動畫
        const isContinuous = e.shiftKey;
        if (isContinuous) {
          batchTargetMode = true;
          activeBatchCollection = null;
          activeBatchType = currentType;
          targetBtn.classList.add("batch-active");
        }
        startTargetSelection(
          currentType,
          (content) => {
            handleTargetClickLogic(currentType, content);
          },
          isContinuous,
        );
      };
      btnContainer.appendChild(targetBtn);

      // 3. 關鍵字儲存按鈕
      const starBtn = document.createElement("div");
      starBtn.className = "my-tool-btn";
      starBtn.innerHTML = ICON_STAR_EMPTY;
      starBtn.title = t("em_btn_add_title");
      btnContainer.appendChild(starBtn);

      // 插入到 UI
      const searchIcon = headerContainer.querySelector('div[class*="icon"]');
      const diversitySelector = headerContainer.querySelector(
        'div[class*="diversitySelector"]',
      );

      if (searchIcon && searchIcon.parentNode) {
        searchIcon.parentNode.insertBefore(
          btnContainer,
          searchIcon.nextSibling,
        );
      } else if (diversitySelector) {
        diversitySelector.parentNode.insertBefore(
          btnContainer,
          diversitySelector,
        );
      } else {
        if (
          input.parentElement &&
          getComputedStyle(input.parentElement).display === "flex"
        ) {
          input.parentElement.appendChild(btnContainer);
        } else {
          headerContainer.appendChild(btnContainer);
        }
      }

      // 輸入框邏輯 (保持不變)
      let ignoreInputEvent = false;
      const updateStarState = () => {
        const val = input.value.trim();
        const list = getFavs(currentType);
        const exists = list.some((item) => item.key === val);
        if (val && exists) {
          starBtn.classList.add("is-active");
          starBtn.innerHTML = ICON_STAR_FILLED;
        } else {
          starBtn.classList.remove("is-active");
          starBtn.innerHTML = ICON_STAR_EMPTY;
        }
      };
      input.addEventListener("input", () => {
        if (!ignoreInputEvent) updateStarState();
      });
      starBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAllMenus();
        const val = input.value.trim();
        const list = getFavs(currentType);
        const exists = list.some((item) => item.key === val);

        if (val && !exists) {
          list.push({ key: val, note: "", icon: "" });
          saveFavs(currentType, list);
          showEmojiToast(
            t("em_save_success", { k: val }) || `已儲存關鍵字: ${val}`,
          );
          ignoreInputEvent = true;
          setNativeValue(input, "");
          ignoreInputEvent = false;
          input.focus();
          updateStarState();
          return;
        }
        renderKeywordDropdown(input, list, starBtn, currentType);
        showDropdown(starBtn);
      });
    }

    // ── Klipy CDN→頁面URL 快取（XHR 攔截）──────────────────────────────
    // Discord GIF search API 回傳: [{src: "https://static.klipy.com/...webm", url: "https://klipy.com/gifs/xxx"}]
    // 攔截後建立 Map，讓 getKlipyPageUrl 可以查詢
    const _klipyUrlCache = new Map(); // cdn_src → page_url
    const _klipyThumbCache = new Map(); // page_url → gif_src (webp thumbnail)

    (function _installKlipyXhrInterceptor() {
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._klipyUrl =
          typeof url === "string" &&
          url.includes("discord.com/api") &&
          url.includes("klipy")
            ? url
            : null;
        return origOpen.call(this, method, url, ...rest);
      };

      XMLHttpRequest.prototype.send = function (...args) {
        if (this._klipyUrl) {
          this.addEventListener("load", function () {
            try {
              const data = JSON.parse(this.responseText);
              const items = Array.isArray(data)
                ? data
                : data.gifs || data.results || [];
              items.forEach((item) => {
                if (item.src && item.url) {
                  const cdnKey = item.src.replace(/^https?:/, "");
                  _klipyUrlCache.set(cdnKey, item.url);
                  _klipyUrlCache.set(item.src, item.url);
                  // 存 thumbnail（gif_src 是 webp，可直接用 <img> 顯示）
                  if (item.gif_src) {
                    _klipyThumbCache.set(item.url, item.gif_src);
                  }
                }
              });
            } catch (_) {}
          });
        }
        return origSend.call(this, ...args);
      };
    })();

    // 從快取查詢 Klipy 頁面 URL；傳入 video 元素
    function getKlipyPageUrl(mediaEl) {
      try {
        const src = mediaEl.src || mediaEl.getAttribute("src") || "";
        if (!src) return null;
        // 直接查（完整 URL 或 // 開頭皆可）
        if (_klipyUrlCache.has(src)) return _klipyUrlCache.get(src);
        const srcNoProto = src.replace(/^https?:/, "");
        if (_klipyUrlCache.has(srcNoProto))
          return _klipyUrlCache.get(srcNoProto);
      } catch (_) {}
      return null;
    }

    function injectGifOverlay(node) {
    if (!node || processedNodes.has(node)) return;

    // 直接查找目標元素，簡化選擇邏輯
    let card = node.closest('[role="gridcell"], div[class*="result"]');
    if (!card) return;

    // 避免重複處理
    processedNodes.add(node);

    // 👇 【移除】card.style.position = "relative"; (這會破壞 Discord 的瀑布流虛擬滾動)
    // 👇 【新增】加入 class 讓上方定義的 CSS hover 規則 (.my-gif-card:hover) 生效
    card.classList.add("my-gif-card");

    // 創建overlay
    const overlay = document.createElement("div");
    overlay.className = "my-gif-overlay-bar";

    // 創建「保存」按鈕
    const targetBtn = document.createElement("div");
    targetBtn.className = "my-overlay-btn";
    targetBtn.innerHTML = ICON_TARGET;
    targetBtn.title = t("em_btn_save_this");
    targetBtn.style.marginRight = "4px";
    targetBtn.onclick = (e) => {
      e.stopPropagation();
      let pageUrl = "";
      let cdnSrc = "";
      const media = card.querySelector("video, img");
      if (media) {
        cdnSrc = media.src || media.querySelector("source")?.src || "";
        pageUrl = getKlipyPageUrl(media) || "";
      }
      const finalUrl = pageUrl || cdnSrc;
      if (!finalUrl) return;

      // thumbnail 優先：webp快取 > cdnSrc(webm可播) > pageUrl(破圖)
      const thumb = _klipyThumbCache.get(pageUrl) || cdnSrc || pageUrl;
      const payload = {
        url: finalUrl,
        content: finalUrl,
        stableUrl: finalUrl,
        thumbnail: thumb,
        mediaType: TYPES.GIF,
        filename: finalUrl.split("/").pop(),
        createdAt: new Date().toISOString(),
      };
      showSaveModal(TYPES.GIF, finalUrl, (col) =>
        addToCollection(TYPES.GIF, col, payload),
      );
    };
    overlay.appendChild(targetBtn);

    // 創建「收藏」按鈕
    const folderBtn = document.createElement("div");
    folderBtn.className = "my-overlay-btn";
    folderBtn.innerHTML = ICON_FOLDER;
    folderBtn.title = t("em_col_title");
    folderBtn.onclick = (e) => {
      e.stopPropagation();
      closeAllMenus();
      const input = document.querySelector('input[placeholder*="Tenor"]');
      renderTabsView(input, TYPES.GIF);
      showDropdown(folderBtn);
    };
    overlay.appendChild(folderBtn);

    // 把overlay添加到卡片上
    card.appendChild(overlay);
  }

    // ============================
    // 8. Event-Driven Public Interface & Trigger
    // ============================
    const dropdown = document.createElement("div");
    dropdown.className = "my-popover-menu";
    dropdown.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
    document.body.appendChild(dropdown);

    // 內部注入函數
    const injectEmojiInputTools = function (pickerContainer) {
      if (!pickerContainer) return;

      // 1. 封裝注入邏輯，方便重複調用
      const runInputInjection = () => {
        const inputs = pickerContainer.querySelectorAll(
          'input[type="text"], input[type="search"]',
        );
        inputs.forEach(injectInputTools);
      };
      // 初次執行
      runInputInjection();

      // 2. 注入 GIF/Sticker Overlay
      const buttons = pickerContainer.querySelectorAll(
        'div[class*="favButton"], div[class*="FavoriteButton"]',
      );
      buttons.forEach(injectGifOverlay);

      // 3. 啟動局部 Observer (針對滾動加載內容與分頁切換)
      const isDynamicList =
        pickerContainer.querySelector('[id^="gif-picker"]') ||
        pickerContainer.querySelector('[id^="sticker-picker"]') ||
        pickerContainer.querySelector('div[class*="scroller"]') ||
        pickerContainer.querySelector('div[class*="header"]');

      if (isDynamicList && !activeLocalObservers.has(pickerContainer)) {
        DEBUG && console.log(
          "[EmojiSearchHelper] Attaching local observer to dynamic list...",
        );

        const localObserver = new MutationObserver((mutations) => {
          let shouldRecheckInputs = false;

          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType !== 1) continue;

              // [Fix] 偵測輸入框或包含輸入框的容器 (解決分頁切換按鈕消失問題)
              if (node.tagName === "INPUT" || node.querySelector("input")) {
                shouldRecheckInputs = true;
              }

              // 檢查 GIF 卡片
              if (
                node.className &&
                typeof node.className === "string" &&
                (node.className.includes("favButton") ||
                  node.className.includes("FavoriteButton"))
              ) {
                injectGifOverlay(node);
              } else if (node.querySelectorAll) {
                node
                  .querySelectorAll(
                    'div[class*="favButton"], div[class*="FavoriteButton"]',
                  )
                  .forEach(injectGifOverlay);
              }
            }
          }

          // 如果 DOM 結構有重大變更，重新檢查輸入框
          if (shouldRecheckInputs) {
            runInputInjection();
          }
        });

        localObserver.observe(pickerContainer, {
          childList: true,
          subtree: true,
        });
        activeLocalObservers.set(pickerContainer, localObserver);

        // 當 Container 被移除時，斷開 Observer
        const removeObserver = new MutationObserver((mutations, obs) => {
          if (!document.body.contains(pickerContainer)) {
            localObserver.disconnect();
            activeLocalObservers.delete(pickerContainer);
            obs.disconnect();
            DEBUG && console.log("[EmojiSearchHelper] Local observer disconnected.");
          }
        });
        removeObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
    };

    // 啟動監聽器：只在點擊表情按鈕後才去尋找 Picker
    function setupTrigger() {
      document.addEventListener(
        "click",
        (e) => {
          const target = e.target;
          // 檢查是否點擊了表情/GIF/貼圖按鈕 (包含 SVG/Path 子元素)
          const btn = target.closest(
            'div[aria-label="新增表情符號"], div[aria-label="Open GIF picker"], div[aria-label="Open sticker picker"], div[aria-label="開啟貼圖選取器"], div[aria-label="開啟 GIF 選取器"], button[aria-label="Select Emoji"]',
          );

          if (btn) {
            DEBUG &&
              console.log(
                "[EmojiHelper] Button clicked, waiting for picker...",
              );
            waitForPicker();
          }
        },
        true,
      ); // Capture phase
    }

    function waitForPicker() {
      // 使用 MutationObserver 等待 Picker 出現 (最多等 2 秒)
      const observer = new MutationObserver((mutations, obs) => {
        // 尋找 Picker 的多種特徵
        const input = document.querySelector(
          'input[placeholder^="Search"], input[placeholder^="搜尋"], input[placeholder^="尋找"]',
        );

        // 如果找到輸入框，且它位於對話框或 Picker 內
        if (
          input &&
          input.closest(
            'div[class*="expressionPicker"], div[role="dialog"], div[class*="layer"]',
          )
        ) {
          const container = input.closest(
            'div[class*="expressionPicker"], div[role="dialog"], div[class*="layer"]',
          );
          obs.disconnect();
          DEBUG && console.log("[EmojiHelper] Picker found! Injecting tools...");
          injectEmojiInputTools(container);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 2000);
    }

    // ============================
    // 9. Chat Entity Saver (Popout Mode - Left Side)
    // 功能: 監聽彈窗，按鈕改為左上角
    // [Fix v1.4.8] 新增 mouseover 即時注入，解決 layerContainer 彈窗消失過快問題
    // ============================
    function initChatEntitySaver() {
      DEBUG && console.log("[ChatSaver] Initialized (Left Side)");

      const formatStickerUrl = (raw, isGif) => {
        if (!raw) return null;
        const clean = raw.split("?")[0];
        const ext = isGif ? ".gif" : ".png";
        return (
          clean.replace(/\.(webp|png|jpg|gif)$/, ext) +
          "?size=160&quality=lossless"
        );
      };

      const injectIntoPopout = (popoutNode) => {
        // 👇 【補上這行】防止 MutationObserver 重複觸發導致多個按鈕
        if (popoutNode.querySelector(".my-chat-save-btn")) return;

        const img = popoutNode.querySelector(
          'img[class*="primaryEmoji_"], img[class*="sticker_"], img[class*="pngImage_"], img[class*="reactionTooltipEmoji_"], img.emoji[src*="/emojis/"]',
        );
        if (!img) return;

        let src = img.src;
        let type = null;

        if (img.classList.contains("emoji") || src.includes("/emojis/")) {
          type = TYPES.EMOJI;
        } else if (src.includes("/stickers/")) {
          type = TYPES.STICKER;
          // 過濾PNG 變相過濾APNG貼圖
          // if (src.includes(".png") && !src.includes("/emojis/")) return;
        }

        if (!type) return;

        const btn = document.createElement("div");
        btn.className = "my-chat-save-btn";
        btn.innerHTML = ICON_FOLDER;
        btn.title = t("em_btn_save_this");

        // reactionTooltip 彈窗：按鈕定位在圖片左上角外側，不遮住圖片
        const isReactionTooltip =
          !!popoutNode.closest('div[class*="reactionTooltip"]') ||
          popoutNode.className.includes("reactionTooltip");

        if (isReactionTooltip) {
          // 插入到圖片之前，用相對 inline 排版讓按鈕出現在圖片左側
          btn.style.cssText = `
              position: absolute;
              top: -6px;
              left: -6px;
              z-index: 1001;
              background: rgba(0, 0, 0, 0.75);
              color: #ffffff;
              width: 22px; height: 22px;
              border-radius: 4px;
              display: flex; align-items: center; justify-content: center;
              cursor: pointer;
              backdrop-filter: blur(2px);
              box-shadow: 0 2px 5px rgba(0,0,0,0.4);
              transition: background 0.2s;
              font-size: 13px;
          `;
          // 讓父層 inner 容器有相對定位基準
          const inner =
            popoutNode.querySelector('div[class*="reactionTooltipInner"]') ||
            popoutNode;
          inner.style.position = "relative";
          inner.appendChild(btn);
        } else {
          // 一般 emojiSection / stickerSection 彈窗：原本左上角定位
          btn.style.cssText = `
              position: absolute;
              top: 7px;
              left: 7px;
              z-index: 1000;
              background: rgba(0, 0, 0, 0.7);
              color: #ffffff;
              width: 24px; height: 24px;
              border-radius: 4px;
              display: flex; align-items: center; justify-content: center;
              cursor: pointer;
              backdrop-filter: blur(2px);
              box-shadow: 0 2px 5px rgba(0,0,0,0.3);
              transition: all 0.2s;
          `;
        }

        btn.onmouseenter = () => {
          btn.style.background = "#5865F2";
        };
        btn.onmouseleave = () => {
          btn.style.background = "rgba(0, 0, 0, 0.7)";
        };

        btn.onclick = async (e) => {
          e.stopPropagation();
          btn.style.cursor = "wait";
          btn.innerHTML = "⏳";

          let finalUrl = src;

          if (type === TYPES.STICKER) {
            try {
              const result = await detectAnimatedUrl(src);
              finalUrl = formatStickerUrl(src, result.isGif);
            } catch (err) {
              finalUrl = formatStickerUrl(src, false);
            }
          } else if (type === TYPES.EMOJI) {
            if (src.includes(".gif")) {
              finalUrl = src.split("?")[0] + "?size=56&quality=lossless";
            } else if (src.includes(".webp") || src.includes("animated=true")) {
              // 偵測是否為動態 webp，是的話轉成 .gif
              try {
                const result = await detectAnimatedUrl(src);
                if (result.isGif) {
                  finalUrl =
                    result.url.split("?")[0] + "?size=56&quality=lossless";
                } else {
                  finalUrl = src.split("?")[0] + "?size=56";
                }
              } catch (err) {
                finalUrl = src.split("?")[0] + "?size=56";
              }
            } else {
              finalUrl = src.split("?")[0] + "?size=56";
            }
          }

          showSaveModal(type, finalUrl, (col) =>
            addToCollection(type, col, finalUrl),
          );
          btn.innerHTML = ICON_FOLDER;
          btn.style.cursor = "pointer";
        };

        // reactionTooltip 已在上方 if 分支中完成注入（inner.appendChild）
        // 一般彈窗走這裡
        if (!isReactionTooltip) {
          popoutNode.style.position = "relative";
          popoutNode.appendChild(btn);
        }
      };

      // --- [Fix v1.4.8] mouseover 即時注入：專門處理 hover 彈窗 ---
      // MutationObserver 對 hover popout 有 timing 問題（debounce 期間彈窗已消失）
      // 改用 mouseover capture，在滑鼠真正停在含 emoji 圖片的元素上時立即注入
      // [Fix v1.4.8b] 擴充選擇器：支援 reactionTooltipEmoji_ (反應表情彈窗)
      const POPOUT_IMG_SEL =
        'img[class*="primaryEmoji_"], img[class*="sticker_"], img[class*="pngImage_"], img[class*="reactionTooltipEmoji_"], img.emoji[src*="/emojis/"]';

      const _hoverInjectHandler = (e) => {
    const target = e.target;
    if (!target || target.nodeType !== 1) return;

    // 找圖片：target 本身或其最近祖先
    const imgEl = target.matches && target.matches(POPOUT_IMG_SEL) ? target : target.closest ? target.closest(POPOUT_IMG_SEL) : null;
    if (!imgEl) return;

    // 👇 【新增防呆】禁止在表情/貼圖/GIF 選擇器內觸發，避免 React 崩潰導致視窗關閉
    if (imgEl.closest('div[class*="expressionPicker"]') ||
        imgEl.closest('[id^="sticker-picker"]') ||
        imgEl.closest('[id^="emoji-picker"]')) {
      return;
    }

    // 確認圖片位於 hover popout 彈窗內（避免誤觸主介面的 emoji）
    const layerRoot = imgEl.closest('div[class*="clickTrapContainer"]') || imgEl.closest('div[class*="layerContainer"]');
    if (!layerRoot) return;

    // 找最近的有意義容器作為注入點
    const popoutContainer = imgEl.closest('div[class*="reactionTooltip"]') || imgEl.closest('div[class*="emojiSection_"]') || imgEl.closest('div[class*="stickerSection_"]') || layerRoot;
    if (!popoutContainer) return;

    // 避免重複注入
    if (popoutContainer.querySelector(".my-chat-save-btn")) return;
    injectIntoPopout(popoutContainer);
  };
      document.addEventListener("mouseover", _hoverInjectHandler, true);

      // --- MutationObserver：處理一般彈窗（非 hover 類型）---
      let _entitySaverDebounce = null;
      let _pendingNodes = [];
      const observer = new MutationObserver((mutations) => {
        //  如果網頁在背景，直接忽略 DOM 變動，不收集節點
        if (document.hidden) return;

        // 立即收集節點，避免 debounce 延遲後 mutations 參考失效
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) _pendingNodes.push(node);
          }
        }
        clearTimeout(_entitySaverDebounce);
        _entitySaverDebounce = setTimeout(() => {
          const nodes = _pendingNodes;
          _pendingNodes = [];
          for (const node of nodes) {
            if (node.nodeType !== 1) continue;
            const emojiSection = node.querySelector
              ? node.querySelector('div[class*="emojiSection_"]')
              : null;
            const stickerSection = node.querySelector
              ? node.querySelector('div[class*="stickerSection_"]')
              : null;
            if (emojiSection) injectIntoPopout(emojiSection);
            else if (stickerSection) injectIntoPopout(stickerSection);
            // [Fix] 增加 typeof 檢查，防止 SVG 元素導致 className.includes 報錯
            else if (
              node.classList &&
              typeof node.className === "string" &&
              (node.className.includes("emojiSection_") ||
                node.className.includes("stickerSection_"))
            ) {
              injectIntoPopout(node);
            }
          }
        }, 80);
      });

      observer.observe(document.body, { childList: true, subtree: true });
    }

    // 啟動聊天室蒐藏監聽
    initChatEntitySaver();

    // ============================
    // 10. Chat Input Quick Button (聊天輸入框快速按鈕 v3 - 強制置左)
    // 功能: 輸入框右側透明按鈕、向上彈出選單、互動搖晃、始終置左
    // ============================
    function initChatInputButton() {
      // [Change] 移除 WeakSet，改用即時 DOM 檢查以支援強制排序

      const injectButton = (container) => {
        // 1. 必須在 channelTextArea 範圍內（排除訊息 hover 工具列等非輸入區的 buttons）
        if (!container.closest('[class*="channelTextArea"], [class*="channelTextarea"]')) return;

        // 2. 必須含有 Discord 原生輸入區按鈕（class + 多語 aria-label 雙重保險，相容 Discord 改名）
        const hasInputBtns =
          container.querySelector('[class*="emojiButton"], [class*="emoji_button"]') ||
          container.querySelector(
            'button[aria-label*="moji"], button[aria-label*="GIF"],' +
            'button[aria-label*="ticker"], button[aria-label*="表情"],' +
            'button[aria-label*="スタンプ"], button[aria-label*="스티커"]'
          );
        if (!hasInputBtns) return;

        // 3. 已存在則強制置左
        const existingBtn = container.querySelector(".my-chat-input-folder-btn");
        if (existingBtn) {
          if (container.firstChild !== existingBtn) container.prepend(existingBtn);
          return;
        }

        // 4. 建立按鈕（自定義 .dmt-folder-btn，不再依賴 Discord hash class）
        const btnContainer = document.createElement("div");
        btnContainer.className = "my-chat-input-folder-btn";

        const btn = document.createElement("button");
        btn.className = "dmt-folder-btn";
        btn.setAttribute("type", "button");
        btn.setAttribute("aria-label", "開啟蒐藏庫");
        // SVG 繼承 currentColor，由 CSS 控制顏色，無需 JS 手動切換
        btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;

        btn.onclick = (e) => {
          e.stopPropagation();
          closeAllMenus();
          const channelTextArea = container.closest(
            '[class*="channelTextArea"], [class*="channelTextarea"]',
          );
          const input = channelTextArea?.querySelector('div[role="textbox"]');
          showQuickTypeMenu(btn, input);
        };

        btnContainer.appendChild(btn);
        container.prepend(btnContainer);
      };

      const showQuickTypeMenu = (triggerBtn, inputElement) => {
        const dropdown = document.querySelector(".my-popover-menu");
        dropdown.innerHTML = "";
        dropdown.className = "my-popover-menu input-mode show";
        dropdown.style.padding = "4px";
        dropdown.style.visibility = "visible";

        const types = [
          { id: TYPES.EMOJI, label: t("em_menu_emoji"), icon: "😃" },
          { id: TYPES.STICKER, label: t("em_menu_sticker"), icon: "🖼️" },
          { id: TYPES.GIF, label: t("em_menu_gif"), icon: "🎞️" },
        ];

        types.forEach((t) => {
          const item = document.createElement("div");
          item.className = "my-menu-item";
          item.style.fontSize = "14px";
          item.style.padding = "8px 12px";
          item.innerHTML = `<span style="margin-right:8px">${t.icon}</span> ${t.label}`;

          item.onclick = (e) => {
            e.stopPropagation();
            const inputProxy = inputElement;
            renderTabsView(inputProxy, t.id);
            updatePosition();
          };
          dropdown.appendChild(item);
        });

        const updatePosition = () => {
          const btnRect = triggerBtn.getBoundingClientRect();
          const menuRect = dropdown.getBoundingClientRect();

          let left = btnRect.left;
          if (left + menuRect.width > window.innerWidth) {
            left = window.innerWidth - menuRect.width - 10;
          }
          const gap = 8;
          const top = btnRect.top - menuRect.height - gap;
          dropdown.style.top = `${top}px`;
          dropdown.style.left = `${left}px`;
        };

        updatePosition();
        activeDropdown = dropdown;
        activeTrigger = triggerBtn;
      };

      const DMT_BTN_SEL = 'div[class*="buttons__"], div[class*="buttonsInner_"]';
      let _inputBtnDebounce = null;

      const observer = new MutationObserver(() => {
        if (document.hidden) return;

        // 只要有變動，我們只負責重置計時器，完全不跑迴圈！
        clearTimeout(_inputBtnDebounce);
        _inputBtnDebounce = setTimeout(() => {
          // injectButton 內部已有 .my-chat-input-folder-btn 存在性檢查，無需 dmt-injected 標記
          document.querySelectorAll(DMT_BTN_SEL).forEach(injectButton);
        }, 100);
      });

      observer.observe(document.body, { childList: true, subtree: true });

      // 初次執行：加入重試機制，確保 Discord 輸入欄已渲染
      // observer 能補漏大部分情況，重試作為雙重保險應對初次載入 timing 問題
      let _scanRetry = 0;
      const MAX_SCAN_RETRY = 5;
      const _initialScan = () => {
        const found = document.querySelectorAll(DMT_BTN_SEL);
        if (found.length > 0) {
          found.forEach(injectButton);
        } else if (_scanRetry < MAX_SCAN_RETRY) {
          _scanRetry++;
          setTimeout(_initialScan, 500);
        }
      };
      setTimeout(_initialScan, 300);
    }

    // 啟動快速按鈕模組
    initChatInputButton();

    setupTrigger();
  }

  DEBUG &&
    console.log(
      "[EmojiSearchHelper] Event-driven interface ready: window.injectEmojiInputTools",
    );

  // =========================================================================================
  // 模組 F ── Webhook Manager (initWebhookManager v1.1)
  // 功能: 傳送訊息內容或網址至自定義 Discord Webhook，支援多標籤管理與測試
  // =========================================================================================
  function initWebhookManager() {
    DEBUG && console.log("[Discord Utilities] Initializing Webhook Manager v1.1...");

    const STORAGE_KEY = "discord_webhook_list";

    // SVG：上向き矢印 + 接続端子のシンプルな Webhook アイコン
    const WH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

    // ── § 0. ローカル showToast ────────────────────────────────────────────────
    // initMessageUtility の showToast はそのスコープ内に閉じているため、
    // webhookManager 専用の軽量版を用意する。
    // onClick を渡すとトーストがクリッカブルになる（pointer-events:auto）。
    // v1.7.0：統一 Toast — 轉發至頂層 dmtShowToast
    function _showToast(message, duration = 2500, onClick = null) {
      dmtShowToast(message, { duration, onClick });
    }

    // ── § 1. 資料層 ────────────────────────────────────────────────────────────
    function getData() {
      return GMStore.get(STORAGE_KEY, [], true) || [];
    }
    function saveData(list) {
      GMStore.set(STORAGE_KEY, list, true);
    }

    // GET /api/webhooks/{id}/{token} → { guild_id, channel_id } or null
    // 認証不要：トークンが URL に含まれているため
    function _fetchWebhookMeta(webhookUrl) {
      return new Promise((resolve) => {
        const m = webhookUrl.match(/\/api\/webhooks\/(\d+)\/([^/?#]+)/);
        if (!m) { resolve(null); return; }
        GM_xmlhttpRequest({
          method: "GET",
          url: `https://discord.com/api/webhooks/${m[1]}/${m[2]}`,
          onload(res) {
            try {
              if (res.status === 200) {
                const d = JSON.parse(res.responseText);
                resolve(d.guild_id && d.channel_id
                  ? { guild_id: d.guild_id, channel_id: d.channel_id }
                  : null);
              } else { resolve(null); }
            } catch (_) { resolve(null); }
          },
          onerror()  { resolve(null); },
          ontimeout() { resolve(null); },
          timeout: 8000,
        });
      });
    }

    // meta を webhook エントリに書き込む共通関数
    function _applyMeta(id, meta) {
      if (!meta) return;
      const list = getData().map((w) =>
        w.id === id ? { ...w, guild_id: meta.guild_id, channel_id: meta.channel_id } : w
      );
      saveData(list);
    }

    function addWebhook(name, url) {
      const entry = { id: Date.now(), name: name.trim(), url: url.trim(),
                      guild_id: null, channel_id: null };
      const list = getData();
      list.push(entry);
      saveData(list);
      // バックグラウンドで guild_id / channel_id を取得して保存
      _fetchWebhookMeta(url).then((meta) => _applyMeta(entry.id, meta));
      return list;
    }
    function removeWebhook(id) {
      const list = getData().filter((w) => w.id !== id);
      saveData(list);
      return list;
    }
    function editWebhook(id, name, url) {
      const list = getData().map((w) =>
        w.id === id
          ? { ...w, name: name.trim(), url: url.trim(), guild_id: null, channel_id: null }
          : w
      );
      saveData(list);
      // URL が変わった可能性があるので meta を再取得
      _fetchWebhookMeta(url).then((meta) => _applyMeta(id, meta));
      return list;
    }

    // ── § 2. 傳送邏輯（GM_xmlhttpRequest で CORS 回避）──────────────────────
    function _post(webhookUrl, content) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "POST",
          url: webhookUrl,
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify({ content: String(content).slice(0, 2000) }),
          onload(res) {
            // 204（wait なし）/ 200（wait=true）どちらも成功
            if (res.status === 200 || res.status === 204) resolve();
            else reject(new Error(`HTTP ${res.status}: ${res.responseText}`));
          },
          onerror(err) { reject(new Error(String(err))); },
          ontimeout()  { reject(new Error("timeout")); },
          timeout: 10000,
        });
      });
    }

    // testWebhook：配送確認のみ（guild_id / channel_id は _fetchWebhookMeta で別取得）
    async function testWebhook(webhookUrl) {
      return _post(webhookUrl, "🔗 Webhook test — Discord Message Toolkit");
    }

    // ── § 2b. SPA ナビゲーション ─────────────────────────────────────────────
    // guild_id + channel_id は事前に _fetchWebhookMeta で取得・保存済みのものを使う。
    // Discord がレンダリングした <a href="/channels/..."> を直接 .click() するのが
    // 最も確実（React の onClick が発火してサイドバーも含めた完全ナビゲーション）。
    function _spaNavigate(channelUrl) {
      try {
        const urlObj    = new URL(channelUrl);
        const segments  = urlObj.pathname.split("/").filter(Boolean);
        const guildId   = segments[1];
        const channelId = segments[2];
        if (!channelId) throw new Error("no channelId");

        const chPath = `/channels/${guildId}/${channelId}`;

        // Step 1: 同サーバー — チャンネルリンクが既に DOM にある場合
        const anchor = document.querySelector(`a[href="${chPath}"]`);
        if (anchor) { anchor.click(); return; }

        // Step 2: 別サーバー — サーバーアイコンを先にクリック
        const guildAnchor = document.querySelector(
          `a[href="/channels/${guildId}"], a[href="/channels/${guildId}/"]`
        );
        if (guildAnchor) {
          guildAnchor.click();
          const attempt = (retry = 0) => {
            const ch = document.querySelector(`a[href="${chPath}"]`);
            if (ch) { ch.click(); return; }
            if (retry < 15) setTimeout(() => attempt(retry + 1), 150);
            else _wormholeOrFallback(channelUrl);
          };
          setTimeout(() => attempt(), 200);
          return;
        }

        // Step 3: DOM に見つからない → Wormhole チェーン
        _wormholeOrFallback(channelUrl);
      } catch (_) {
        _wormholeOrFallback(channelUrl);
      }
    }

    function _wormholeOrFallback(channelUrl) {
      if (window.wormholeModule?.navigateToChannel) {
        window.wormholeModule.navigateToChannel(channelUrl);
        return;
      }
      try {
        const path = new URL(channelUrl).pathname;
        window.history.pushState(null, "", path);
        window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      } catch (_) {
        window.location.href = channelUrl;
      }
    }

    // channelUrl は送信元の wh.guild_id / wh.channel_id から呼び出し側で構築して渡す
    async function sendContent(webhookUrl, msgText, whName, channelUrl = null) {
      try {
        await _post(webhookUrl, msgText);
        const onClick = channelUrl ? () => _spaNavigate(channelUrl) : null;
        _showToast(t("wh_send_ok", { name: whName }), 4000, onClick);
      } catch (e) {
        DEBUG && console.error("[Webhook] sendContent failed:", e);
        _showToast(t("wh_send_fail", { name: whName }));
      }
    }

    async function sendUrls(webhookUrl, urls, whName, channelUrl = null) {
      if (!urls.length) { _showToast(t("wh_no_urls")); return; }
      try {
        await _post(webhookUrl, urls.join("\n"));
        const onClick = channelUrl ? () => _spaNavigate(channelUrl) : null;
        _showToast(t("wh_send_ok", { name: whName }), 4000, onClick);
      } catch (e) {
        DEBUG && console.error("[Webhook] sendUrls failed:", e);
        _showToast(t("wh_send_fail", { name: whName }));
      }
    }

    // ── § 3. 共通 CSS ──────────────────────────────────────────────────────────
    const PANEL_CSS = `
      .wh-panel { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        background:#2b2d31; border-radius:12px; padding:20px 22px;
        min-width:420px; max-width:520px; color:#dcddde; font-size:13px;
        box-shadow:0 12px 40px rgba(0,0,0,.65); z-index:2147483641;
        display:flex; flex-direction:column; gap:12px; }
      .wh-overlay { position:fixed; inset:0; z-index:2147483640; background:rgba(0,0,0,.45); }
      .wh-title-row { display:flex; align-items:center; justify-content:space-between; }
      .wh-title { font-size:15px; font-weight:700; color:#fff; }
      .wh-close { cursor:pointer; color:#b9bbbe; font-size:18px; line-height:1; padding:2px 4px; }
      .wh-close:hover { color:#fff; }
      .wh-list { display:flex; flex-direction:column; gap:6px; max-height:230px; overflow-y:auto; }
      .wh-empty { color:#72767d; font-size:12px; padding:8px 0; }
      .wh-row { display:flex; align-items:center; gap:8px; padding:8px 10px;
        background:#1e1f22; border-radius:8px; }
      .wh-info { flex:1; min-width:0; }
      .wh-name { font-weight:600; color:#fff; font-size:13px; }
      .wh-url  { color:#72767d; font-size:11px; white-space:nowrap;
        overflow:hidden; text-overflow:ellipsis; }
      .wh-btn  { padding:4px 10px; border:none; border-radius:5px; cursor:pointer;
        font-size:12px; white-space:nowrap; }
      .wh-btn-test   { background:#5865f2; color:#fff; }
      .wh-btn-delete { background:#4f545c; color:#fff; }
      .wh-btn:hover  { filter:brightness(1.15); }
      .wh-btn:disabled { opacity:.5; cursor:default; filter:none; }
      .wh-form { display:flex; flex-direction:column; gap:6px;
        border-top:1px solid rgba(255,255,255,.08); padding-top:10px; }
      .wh-input { padding:8px 10px; background:#1e1f22; border:1px solid #3f4147;
        border-radius:6px; color:#dcddde; font-size:13px; outline:none; width:100%;
        box-sizing:border-box; }
      .wh-input:focus { border-color:#5865f2; }
      .wh-add-btn { padding:8px; border:none; border-radius:6px;
        background:#57f287; color:#000; cursor:pointer; font-size:13px;
        font-weight:600; }
      .wh-add-btn:hover { filter:brightness(1.08); }
      .wh-nav-btn { cursor:pointer; display:flex; align-items:center;
        justify-content:center; width:24px; height:24px; opacity:.7;
        transition:opacity .15s; color:var(--interactive-normal,#b9bbbe); flex-shrink:0; }
      .wh-nav-btn:hover { opacity:1; }
    `;
    if (!document.getElementById("wh-style")) {
      const s = document.createElement("style");
      s.id = "wh-style";
      s.textContent = PANEL_CSS;
      document.head.appendChild(s);
    }

    // ── § 4. 設定面板 ─────────────────────────────────────────────────────────
    let _overlay = null;

    function closePanel() {
      _overlay?.remove();
      _overlay = null;
    }

    function openPanel() {
      closePanel();

      const overlay = document.createElement("div");
      overlay.className = "wh-overlay";
      overlay.onclick = (e) => { if (e.target === overlay) closePanel(); };

      const panel = document.createElement("div");
      panel.className = "wh-panel";

      // タイトル行
      const titleRow = document.createElement("div");
      titleRow.className = "wh-title-row";
      const titleEl = document.createElement("div");
      titleEl.className = "wh-title";
      titleEl.textContent = t("wh_panel_title");
      const closeBtn = document.createElement("span");
      closeBtn.className = "wh-close";
      closeBtn.textContent = "✕";
      closeBtn.onclick = closePanel;
      titleRow.appendChild(titleEl);
      titleRow.appendChild(closeBtn);
      panel.appendChild(titleRow);

      // Webhook リスト
      const listEl = document.createElement("div");
      listEl.className = "wh-list";

      const renderList = () => {
        listEl.innerHTML = "";
        const list = getData();
        if (!list.length) {
          const empty = document.createElement("div");
          empty.className = "wh-empty";
          empty.textContent = t("wh_no_webhooks");
          listEl.appendChild(empty);
          return;
        }
        list.forEach((wh) => {
          const row = document.createElement("div");
          row.className = "wh-row";
          row.style.flexDirection = "column";
          row.style.alignItems = "stretch";

          // ── 表示モード ──
          const viewMode = document.createElement("div");
          viewMode.style.cssText = "display:flex;align-items:center;gap:8px;";

          const info = document.createElement("div");
          info.className = "wh-info";
          const nameEl = document.createElement("div");
          nameEl.className = "wh-name";
          nameEl.textContent = wh.name;
          const urlEl = document.createElement("div");
          urlEl.className = "wh-url";
          urlEl.textContent = wh.url;
          info.appendChild(nameEl);
          info.appendChild(urlEl);

          // テストボタン
          const testBtn = document.createElement("button");
          testBtn.className = "wh-btn wh-btn-test";
          testBtn.textContent = t("wh_btn_test");
          testBtn.onclick = async () => {
            testBtn.disabled = true;
            testBtn.textContent = "…";
            try {
              await testWebhook(wh.url);
              testBtn.textContent = "✅";
              _showToast(t("wh_test_ok"));
              // テスト成功時に guild_id / channel_id を取得・保存（既存 webhook の補完）
              _fetchWebhookMeta(wh.url).then((meta) => _applyMeta(wh.id, meta));
            } catch (e) {
              DEBUG && console.error("[Webhook] test failed:", e);
              testBtn.textContent = "❌";
              _showToast(t("wh_test_fail"));
            }
            setTimeout(() => {
              testBtn.textContent = t("wh_btn_test");
              testBtn.disabled = false;
            }, 2000);
          };

          // 編集ボタン
          const editBtn = document.createElement("button");
          editBtn.className = "wh-btn";
          editBtn.style.background = "#4f545c";
          editBtn.style.color = "#fff";
          editBtn.textContent = t("wh_btn_edit");

          // 削除ボタン
          const delBtn = document.createElement("button");
          delBtn.className = "wh-btn wh-btn-delete";
          delBtn.textContent = t("wh_btn_delete");
          delBtn.onclick = () => { removeWebhook(wh.id); renderList(); };

          viewMode.appendChild(info);
          viewMode.appendChild(testBtn);
          viewMode.appendChild(editBtn);
          viewMode.appendChild(delBtn);

          // ── 編集モード ──
          const editMode = document.createElement("div");
          editMode.style.cssText = "display:none;flex-direction:column;gap:6px;padding-top:6px;";

          const nameInput = document.createElement("input");
          nameInput.className = "wh-input";
          nameInput.value = wh.name;
          nameInput.placeholder = t("wh_add_name_ph");

          const urlInput = document.createElement("input");
          urlInput.className = "wh-input";
          urlInput.value = wh.url;
          urlInput.placeholder = t("wh_add_url_ph");

          const btnRow = document.createElement("div");
          btnRow.style.cssText = "display:flex;gap:6px;";

          const saveBtn = document.createElement("button");
          saveBtn.className = "wh-btn wh-btn-test";
          saveBtn.style.flex = "1";
          saveBtn.textContent = t("wh_btn_save");

          const cancelBtn = document.createElement("button");
          cancelBtn.className = "wh-btn wh-btn-delete";
          cancelBtn.textContent = t("wh_btn_cancel");

          btnRow.appendChild(saveBtn);
          btnRow.appendChild(cancelBtn);
          editMode.appendChild(nameInput);
          editMode.appendChild(urlInput);
          editMode.appendChild(btnRow);

          // ── トグルロジック ──
          const enterEdit = () => {
            viewMode.style.display = "none";
            editMode.style.display = "flex";
            nameInput.focus();
          };
          const leaveEdit = () => {
            viewMode.style.display = "flex";
            editMode.style.display = "none";
          };

          editBtn.onclick = enterEdit;
          cancelBtn.onclick = leaveEdit;

          saveBtn.onclick = () => {
            const newName = nameInput.value.trim();
            const newUrl  = urlInput.value.trim();
            if (!newName) { nameInput.focus(); return; }
            if (!newUrl.startsWith("https://discord.com/api/webhooks/")) {
              _showToast(t("wh_url_invalid")); return;
            }
            editWebhook(wh.id, newName, newUrl);
            renderList();
          };

          // Enter で保存、Escape でキャンセル
          [nameInput, urlInput].forEach((el) =>
            el.addEventListener("keydown", (e) => {
              if (e.key === "Enter")  { e.preventDefault(); saveBtn.click(); }
              if (e.key === "Escape") { e.preventDefault(); leaveEdit(); }
            })
          );

          row.appendChild(viewMode);
          row.appendChild(editMode);
          listEl.appendChild(row);
        });
      };

      renderList();
      panel.appendChild(listEl);

      // 追加フォーム
      const form = document.createElement("div");
      form.className = "wh-form";

      const nameInput = document.createElement("input");
      nameInput.className = "wh-input";
      nameInput.placeholder = t("wh_add_name_ph");

      const urlInput = document.createElement("input");
      urlInput.className = "wh-input";
      urlInput.placeholder = t("wh_add_url_ph");

      const addBtn = document.createElement("button");
      addBtn.className = "wh-add-btn";
      addBtn.textContent = t("wh_btn_add");
      addBtn.onclick = () => {
        const name = nameInput.value.trim();
        const url  = urlInput.value.trim();
        if (!name) { nameInput.focus(); return; }
        if (!url.startsWith("https://discord.com/api/webhooks/")) {
          _showToast(t("wh_url_invalid")); return;
        }
        addWebhook(name, url);
        nameInput.value = "";
        urlInput.value  = "";
        renderList();
      };

      // Enter キーでも追加
      [nameInput, urlInput].forEach((el) =>
        el.addEventListener("keydown", (e) => { if (e.key === "Enter") addBtn.click(); })
      );

      form.appendChild(nameInput);
      form.appendChild(urlInput);
      form.appendChild(addBtn);
      panel.appendChild(form);

      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      _overlay = overlay;
      nameInput.focus();
    }

    // ── § 5. trailing_ ボタン注入 ─────────────────────────────────────────────
    function injectButton() {
      const trailing = document.querySelector('div[class*="trailing_"]');
      if (!trailing || trailing.querySelector(".wh-nav-btn")) return;

      const btn = document.createElement("div");
      btn.className = "wh-nav-btn";
      btn.innerHTML = WH_SVG;
      btn.title = t("wh_tip");
      btn.onclick = (e) => { e.stopPropagation(); _overlay ? closePanel() : openPanel(); };

      // Wormhole ボタングループの前に挿入、なければ先頭
      const whGroup = trailing.querySelector(".my-wormhole-creator-btn")?.closest("div[style]");
      if (whGroup) trailing.insertBefore(btn, whGroup);
      else trailing.prepend(btn);
    }

    injectButton();

    // SPA ナビゲーション後のボタン再注入を監視
    // Wormhole observer と同様に document.hidden チェック＋debounce を実装
    // タブが非表示の間に蓄積したミューテーションが復帰時に一気に発火するのを防ぐ
    let _btnDebounceTimer = null;
    let _btnObserverTarget = null;
    const _btnObserver = new MutationObserver(() => {
      if (document.hidden) return; // タブ非表示中は何もしない
      clearTimeout(_btnDebounceTimer);
      _btnDebounceTimer = setTimeout(() => {
        injectButton();
        // trailing_ が新たに出現・消失したらターゲットを更新
        const trailing = document.querySelector('div[class*="trailing_"]');
        if (trailing && trailing !== _btnObserverTarget) {
          _btnObserverTarget = trailing;
          _btnObserver.disconnect();
          _btnObserver.observe(trailing, { childList: true });
          _btnObserver.observe(document.body, { childList: true });
        }
      }, 150);
    });
    const _initialTrailing = document.querySelector('div[class*="trailing_"]');
    if (_initialTrailing) {
      _btnObserverTarget = _initialTrailing;
      _btnObserver.observe(_initialTrailing, { childList: true });
      _btnObserver.observe(document.body, { childList: true }); // trailing 消失検知
    } else {
      _btnObserver.observe(document.body, { childList: true, subtree: true });
    }
    // v1.8.0：改由 CleanupRegistry 集中清理
    CleanupRegistry.add(() => _btnObserver.disconnect());

    // ── § 6. createDropdown 向け公開 API ─────────────────────────────────────
    // 僅在開發模式下暴露除錯函式，避免擴大攻擊面
    if (DEBUG) {
      window.webhookModule = {
        getWebhooks: getData,
        sendContent,
        sendUrls,
      };
    }

    DEBUG && console.log("[WebhookManager] Ready. Webhooks:", getData().length);
  }

  // =========================================================================================
  // 模組 E ── Header Mods · 頻道標題列增強 (initHeaderMods v5.2)
  // 功能: 右鍵防劫持 (Anti-Hijack) + 隱藏伺服器/頻道名稱 (Conceal Name)
  // =========================================================================================
  function initHeaderMods() {
    DEBUG &&
      console.log(
        "[Discord Utilities] Initializing Header Mods (Fix Long Press)...",
      );

    // --- 0. 設定與常數 ---
    const STORAGE_PREFIX = "discord_header_mod_def_";
    const PRESS_DELAY = 500; // 長按判定時間 (ms)

    // --- 1. 樣式注入 ---
    const HEADER_MOD_STYLES = `
        .header-mod-btn {
            margin: 0 4px; width: 24px; min-width: 24px; height: 24px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; flex: 0 0 auto; position: relative;
            color: #B5BAC1; transition: color 0.2s, transform 0.1s; z-index: 100;
        }
        .header-mod-btn:hover { color: #DDB9B9; }
        .header-mod-btn.enabled { color: #23A559; }
        .header-mod-btn.saving { animation: pulseSave 0.4s ease-in-out; color: #f0b232 !important; }

        @keyframes pulseSave {
            0% { transform: scale(1); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
        }

        /* 全域 Tooltip */
        .header-mod-global-tooltip {
            position: fixed; background: #111214; border: 1px solid #2b2d31;
            box-shadow: 0 8px 16px rgba(0,0,0,0.6); border-radius: 8px;
            padding: 8px 12px; z-index: 2147483647; width: max-content; pointer-events: none;
            opacity: 0; transform: translateY(-10px); visibility: hidden;
            transition: all 0.2s cubic-bezier(0.19, 1, 0.22, 1);
            font-family: monospace; font-size: 12px; line-height: 1.5; color: #dbdee1;
            text-align: left;
        }
        .header-mod-global-tooltip.show { opacity: 1; transform: translateY(0); visibility: visible; }

        .header-mod-list { display: flex; flex-direction: column; gap: 2px; }
        .header-mod-row { display: flex; gap: 8px; align-items: center; }
        .header-mod-lang { color: #888; width: 24px; display: inline-block; text-align: center; }
        .header-mod-val { color: #fff; }
        .header-mod-val.off { color: #fa777c; }

        .header-mod-divider { height: 1px; background: #2b2d31; margin: 6px 0; }

        .header-mod-footer { font-size: 11px; color: #949BA4; display: flex; flex-direction: column; gap: 2px; }
        .header-mod-def-status { font-weight: bold; color: #f0b232; }
    `;
    const styleEl = document.createElement("style");
    styleEl.textContent = HEADER_MOD_STYLES;
    document.head.appendChild(styleEl);

    // --- 2. Tooltip 容器 ---
    let globalTooltip = document.querySelector(".header-mod-global-tooltip");
    if (!globalTooltip) {
      globalTooltip = document.createElement("div");
      globalTooltip.className = "header-mod-global-tooltip";
      document.body.appendChild(globalTooltip);
    }

    // --- 3. 狀態管理 (記憶核心) ---
    const loadDefault = (key) => {
      const val = localStorage.getItem(STORAGE_PREFIX + key);
      // 當 val 為 null (代表第一次安裝/無紀錄) 時，回傳 false (預設關閉)
      return val === null ? false : val === "true";
    };
    const saveDefault = (key, val) => {
      localStorage.setItem(STORAGE_PREFIX + key, val);
    };

    const State = {
      antiHijack: loadDefault("antiHijack"),
      concealName: loadDefault("concealName"),
    };

    // --- 4. 翻譯與說明文 ---
    const TEXTS = {
      antiHijack: {
        on: [
          { l: "🇹🇼", t: "右鍵防劫持: 開啟" },
          { l: "🇨🇳", t: "右键防劫持: 开启" },
          { l: "🇺🇸", t: "Anti-Hijack: ON" },
          { l: "🇯🇵", t: "右クリック防止: ON" },
          { l: "🇰🇷", t: "우클릭 방지: ON" },
          { l: "🇪🇸", t: "Anti-Hijack: ON" },
          { l: "🇧🇷", t: "Anti-Sequestro: ATIVO" },
          { l: "🇫🇷", t: "Anti-Détournement: ON" },
          { l: "🇷🇺", t: "Защита ПКМ: ВКЛ" },
        ],
        off: [
          { l: "🇹🇼", t: "右鍵防劫持: 關閉" },
          { l: "🇨🇳", t: "右键防劫持: 关闭" },
          { l: "🇺🇸", t: "Anti-Hijack: OFF" },
          { l: "🇯🇵", t: "右クリック防止: OFF" },
          { l: "🇰🇷", t: "우클릭 방지: OFF" },
          { l: "🇪🇸", t: "Anti-Hijack: OFF" },
          { l: "🇧🇷", t: "Anti-Sequestro: INATIVO" },
          { l: "🇫🇷", t: "Anti-Détournement: OFF" },
          { l: "🇷🇺", t: "Защита ПКМ: ВЫКЛ" },
        ],
        desc: {
          "zh-TW": "長按 0.5 秒儲存為預設狀態",
          "zh-CN": "长按 0.5 秒保存为默认状态",
          en: "Long press 0.5s to save as default",
          ja: "0.5秒長押しでデフォルトとして保存",
          ko: "0.5초 길게 눌러 기본값으로 저장",
          es: "Mantén 0.5s para guardar como predeterminado",
          "pt-BR": "Pressione 0.5s para salvar como padrão",
          fr: "Maintenir 0.5s pour enregistrer par défaut",
          ru: "Удержание 0.5с для сохранения по умолчанию",
        },
      },
      concealName: {
        on: [
          { l: "🇹🇼", t: "檔名隱藏: 開啟 (亂碼)" },
          { l: "🇨🇳", t: "文件名隐藏: 开启" },
          { l: "🇺🇸", t: "Conceal Name: ON" },
          { l: "🇯🇵", t: "ファイル名隠蔽: ON" },
          { l: "🇰🇷", t: "파일명 숨기기: ON" },
          { l: "🇪🇸", t: "Ocultar Nombre: ON" },
          { l: "🇧🇷", t: "Ocultar Nome: ATIVO" },
          { l: "🇫🇷", t: "Masquer le nom: ON" },
          { l: "🇷🇺", t: "Скрыть имя файла: ВКЛ" },
        ],
        off: [
          { l: "🇹🇼", t: "檔名隱藏: 關閉 (原名)" },
          { l: "🇨🇳", t: "文件名隐藏: 关闭" },
          { l: "🇺🇸", t: "Conceal Name: OFF" },
          { l: "🇯🇵", t: "ファイル名隠蔽: OFF" },
          { l: "🇰🇷", t: "파일명 숨기기: OFF" },
          { l: "🇪🇸", t: "Ocultar Nombre: OFF" },
          { l: "🇧🇷", t: "Ocultar Nome: INATIVO" },
          { l: "🇫🇷", t: "Masquer le nom: OFF" },
          { l: "🇷🇺", t: "Скрыть имя файла: ВЫКЛ" },
        ],
        desc: {
          "zh-TW": "長按 0.5 秒儲存為預設狀態",
          "zh-CN": "长按 0.5 秒保存为默认状态",
          en: "Long press 0.5s to save as default",
          ja: "0.5秒長押しでデフォルトとして保存",
          ko: "0.5초 길게 눌러 기본값으로 저장",
          es: "Mantén 0.5s para guardar como predeterminado",
          "pt-BR": "Pressione 0.5s para salvar como padrão",
          fr: "Maintenir 0.5s pour enregistrer par défaut",
          ru: "Удержание 0.5с для сохранения по умолчанию",
        },
      },
    };

    // --- 5. 核心邏輯 ---

    // [Logic A] Anti-Hijack
    const antiHijackHandler = (e) => {
      if (State.antiHijack) e.stopPropagation();
    };
    function toggleAntiHijack(enable) {
      if (enable) {
        document.addEventListener("contextmenu", antiHijackHandler, true);
        document.addEventListener("auxclick", antiHijackHandler, true);
      } else {
        document.removeEventListener("contextmenu", antiHijackHandler, true);
        document.removeEventListener("auxclick", antiHijackHandler, true);
      }
    }
    // 初始狀態
    toggleAntiHijack(State.antiHijack);

    // [Fix v1.6.6] 具名 handler，beforeunload 時移除，消除孤立監聽器
    const _wormholeVisibilityHandler = () => {
      document.documentElement.classList.toggle(
        "wormhole-page-hidden",
        document.hidden,
      );
    };
    document.addEventListener("visibilitychange", _wormholeVisibilityHandler);
    // v1.8.0：改由 CleanupRegistry 集中清理
    CleanupRegistry.add(() => {
      document.removeEventListener("visibilitychange", _wormholeVisibilityHandler);
    });

    // [Logic B] Conceal Filename
    const concealHandler = (() => {
      const REPLACE_PREFIX = "_";
      // 先備份原始 descriptor，以便停用時還原（Object.defineProperty 不可逆，必須主動 revert）
      const _origFileNameDesc = Object.getOwnPropertyDescriptor(
        File.prototype,
        "name",
      );
      const _getFilename = _origFileNameDesc.get;
      const randomString = (len = 6) =>
        Math.random()
          .toString(36)
          .substring(2, 2 + len);

      Object.defineProperty(File.prototype, "name", {
        get() {
          const originalName = _getFilename.call(this);
          if (!State.concealName) return originalName;
          const extension = originalName.split(".").pop();
          return (
            randomString() + REPLACE_PREFIX + randomString() + "." + extension
          );
        },
        configurable: true, // 確保後續可以再次 defineProperty 還原
      });

      // 還原函式：模組停用或頁面卸載時呼叫
      return {
        restore() {
          try {
            Object.defineProperty(File.prototype, "name", _origFileNameDesc);
          } catch (_) {}
        },
      };
    })();

    // --- 6. UI 渲染 (Tooltip & Button) ---

    function updateTooltipContent(type) {
      const config = TEXTS[type];
      const currentList = State[type] ? config.on : config.off;
      const isDefaultOn = loadDefault(type);

      const listHTML = currentList
        .map(
          (item) => `
            <div class="header-mod-row">
                <span class="header-mod-lang">${item.l}</span>
                <span class="header-mod-val ${!State[type] ? "off" : ""}">${item.t}</span>
            </div>
        `,
        )
        .join("");

      const _lang = getConfig().lang || "en";
      const _statusLabels = {
        "zh-TW": { on: "預設：開啟", off: "預設：關閉", mem: "💾 記憶狀態" },
        "zh-CN": { on: "默认：开启", off: "默认：关闭", mem: "💾 记忆状态" },
        en: { on: "Default: ON", off: "Default: OFF", mem: "💾 Memory" },
        ja: { on: "デフォルト: ON", off: "デフォルト: OFF", mem: "💾 記憶" },
        ko: { on: "기본값: ON", off: "기본값: OFF", mem: "💾 메모리" },
        es: {
          on: "Predeterminado: ON",
          off: "Predeterminado: OFF",
          mem: "💾 Memoria",
        },
        "pt-BR": {
          on: "Padrão: ATIVO",
          off: "Padrão: INATIVO",
          mem: "💾 Memória",
        },
        fr: { on: "Par défaut: ON", off: "Par défaut: OFF", mem: "💾 Mémoire" },
        ru: { on: "По умолч.: ВКЛ", off: "По умолч.: ВЫКЛ", mem: "💾 Память" },
      };
      const _sl = _statusLabels[_lang] || _statusLabels["en"];
      const statusText = isDefaultOn ? _sl.on : _sl.off;
      const _descText =
        typeof config.desc === "object"
          ? config.desc[_lang] || config.desc["en"]
          : config.desc;

      globalTooltip.innerHTML = `
            <div class="header-mod-list">${listHTML}</div>
            <div class="header-mod-divider"></div>
            <div class="header-mod-footer">
                <div>${_sl.mem}: <span class="header-mod-def-status" style="color:${isDefaultOn ? "#2dc770" : "#ed4245"}">${statusText}</span></div>
                <div>🖱️ ${_descText}</div>
            </div>
        `;
    }

    function showGlobalTooltip(btnElement, type) {
      updateTooltipContent(type);
      const rect = btnElement.getBoundingClientRect();
      const tooltipX = rect.left + rect.width / 2;
      const tooltipY = rect.bottom + 10;

      globalTooltip.style.left = `${tooltipX}px`;
      globalTooltip.style.top = `${tooltipY}px`;
      globalTooltip.style.transform = `translateX(-85%)`;
      globalTooltip.classList.add("show");
    }

    function createHeaderButton(id, iconPath, type) {
      if (!TEXTS[type]) return document.createElement("div");

      const btn = document.createElement("div");
      btn.id = id;
      btn.setAttribute("role", "button");
      btn.setAttribute("tabindex", "0");
      btn.className = `header-mod-btn ${State[type] ? "enabled" : ""}`;
      btn.innerHTML = `<svg aria-hidden="true" role="img" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;">${iconPath}</svg>`;

      let pressTimer = null;
      let isLongPress = false;

      btn.onmouseenter = () => showGlobalTooltip(btn, type);
      btn.onmouseleave = () => {
        globalTooltip.classList.remove("show");
        if (pressTimer) clearTimeout(pressTimer);
      };

      btn.onmousedown = (e) => {
        if (e.button !== 0) return;
        isLongPress = false;
        pressTimer = setTimeout(() => {
          isLongPress = true;

          State[type] = !State[type]; // 1. 切換狀態
          if (type === "antiHijack") toggleAntiHijack(State[type]); // 2. 執行功能

          btn.classList.toggle("enabled", State[type]); // 3. 立即變色

          // 4. 儲存新狀態為預設值
          saveDefault(type, State[type]);

          // 5. 播放動畫
          btn.classList.add("saving");
          setTimeout(() => btn.classList.remove("saving"), 400);

          // 6. 更新 Tooltip
          updateTooltipContent(type);
        }, PRESS_DELAY);
      };

      btn.onmouseup = (e) => {
        if (e.button !== 0) return;
        if (pressTimer) clearTimeout(pressTimer);

        if (!isLongPress) {
          // 短按：暫時切換
          State[type] = !State[type];
          if (type === "antiHijack") toggleAntiHijack(State[type]);

          btn.classList.toggle("enabled", State[type]);
          updateTooltipContent(type);
        }
      };

      btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
      };
      return btn;
    }

    // --- 7. DOM 注入 ---
    function injectButtons() {
      const parentSelector =
        'div:has(> [aria-label="收件匣"]), div:has(> [aria-label="Inbox"]), div:has(> [aria-label="收件箱"])';
      const siblingSelector =
        '[aria-label="收件匣"], [aria-label="Inbox"], [aria-label="收件箱"]';

      const container = document.querySelector(parentSelector);
      const sibling = document.querySelector(siblingSelector);

      if (!container || !sibling) return;

      if (!document.getElementById("discord-antihijack-btn")) {
        const path =
          '<rect x="6" y="2" width="12" height="20" rx="6" ry="6"></rect><line x1="12" y1="2" x2="12" y2="10"></line>';
        const btn = createHeaderButton(
          "discord-antihijack-btn",
          path,
          "antiHijack",
        );
        container.insertBefore(btn, sibling);
      }

      if (!document.getElementById("discord-filename-btn")) {
        const path =
          '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline>';
        const btn = createHeaderButton(
          "discord-filename-btn",
          path,
          "concealName",
        );
        container.insertBefore(btn, sibling);
      }
    }

    let _headerModDebounce = null;
    const observer = new MutationObserver(() => {
      if (document.hidden) return;
      clearTimeout(_headerModDebounce);
      _headerModDebounce = setTimeout(() => {
        if (
          !document.getElementById("discord-antihijack-btn") ||
          !document.getElementById("discord-filename-btn")
        ) {
          injectButtons();
        }
      }, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 頁面卸載時還原 File.prototype.name，避免全域污染殘留
    // v1.8.0：改由 CleanupRegistry 集中清理
    CleanupRegistry.add(() => {
      observer.disconnect();
      concealHandler.restore();
    });

    setTimeout(injectButtons, 2000);
  }

  // =========================================================================================
  // 模組 D ── Wormhole Module Pro · 蟲洞快捷導航 (WormholeModule class)
  // 功能: 一鍵跳頻道、VIP 置頂、分組管理、聚焦模式、跨頻道傳訊（方案 A/B）
  // =========================================================================================

  class WormholeModule {
    constructor() {
      this.STORAGE_KEY = "discord_wormholes_v2";
      this.ICONS = {
        wormhole: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.12 3.88a8 8 0 0 1-3.68 15.69"/><path d="M18.84 6a10 10 0 0 0-14.72 13.84"/><path d="M9.88 20.12a8 8 0 0 1 3.68-15.69"/><path d="M5.16 18a10 10 0 0 0 14.72-13.84"/></svg>`,
        portal: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`,
        star: `<svg width="14" height="14" viewBox="0 0 24 24" fill="gold" stroke="gold" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        starOutline: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        folder: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
        chevronDown: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`,
        focusOff: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`,
        focusOn: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`,
        focusSize: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="11"/></svg>`,
      };
      this.observer = null;
      this.refreshTimer = null;
      this.activeDropdown = null;
      this.dropdownCloseTimer = null;
      this.focusMode = this.getFocusMode();
      // 方案 B 狀態（記憶體，頁面關閉清除）
      this._cachedToken = null;
      this._tokenWatcher = null;
      // Monitor 狀態（記憶體）
      this._monitorTimer = null;          // setInterval handle
      this._monitorBadgeMap = new Map();  // wormholeId → unread count（記憶體，重渲染後恢復用）
      this._monitorVisHandler = null;     // visibilitychange handler ref（清理用）
    }

    // ==========================================
    // Core: Initialization
    // ==========================================
    initialize() {
      DEBUG && console.log("[Wormhole Module V3] Initializing...");
      this.injectStyles();
      this.setupGlobalListeners();

      // B 模式已選定 → 頁面載入時立刻啟動背景攔截器
      // 讓 Token 在使用者開 overlay 之前就就緒，不再依賴 overlay 開啟時機
      if (this.getApiMode() && !this._cachedToken) {
        this._startTokenInterceptor((token) => {
          this._cachedToken = token;
          DEBUG && console.log("[WH API] Token pre-fetched at init ✅");
        });
      }

      setTimeout(() => {
        const trailingGroup = document.querySelector('div[class*="trailing_"]');
        if (trailingGroup) this.injectCreatorButton(trailingGroup);

        const pos = this.getDockPosition();
        if (pos === "input") {
          this._injectInputDock();
        } else if (pos === "navbar") {
          this._injectNavbarDock();
        } else if (pos === "topleft") {
          this._injectTopLeftDock();
        } else {
          // titlebar
          this._injectTitlebarDock();
        }
      }, 1000);

      this.setupObserver();
      this._setupModalWatcher();

      // Monitor：Token 就緒後啟動（最多等 30 秒，避免 Token 還沒攔截到就啟動失敗）
      if (this.getMonitorEnabled() && this.getApiMode()) {
        const tryStart = (waited = 0) => {
          if (this._cachedToken) {
            this.startMonitor();
          } else if (waited < 30000) {
            setTimeout(() => tryStart(waited + 1000), 1000);
          } else {
            DEBUG && console.warn("[WH Monitor] Token not ready after 30s, monitor not started.");
          }
        };
        tryStart();
      }
    }

    // [除錯] 重置所有資料 (修復雙重刷新問題)
    async resetAllData() {
      const ok = await dmtConfirm(
        "⚠️ [DEBUG RESET] ⚠️\n\n確定要刪除所有蟲洞與群組資料嗎？\n此動作無法復原！",
        { danger: true }
      );
      if (ok) {
        try {
          // 1. [視覺優先] 先立刻清空畫面，讓使用者感覺「已刪除」
          const container = document.querySelector(".my-wormhole-container");
          if (container) {
            container.style.opacity = "0.5"; // 變半透明提示正在處理
            container.innerHTML = ""; // 移除所有元素
          }

          // 2. [數據清除] 定義空結構
          const emptyData = { groups: [], vipWormholes: [], wormholes: [] };

          // 3. [雙重寫入] 強制覆蓋 GM 存儲與 LocalStorage
          if (typeof GM_setValue !== "undefined") {
            GM_setValue(this.STORAGE_KEY, emptyData);
            // 順便清除舊版 v1 key，防止遷移邏輯干擾
            if (typeof GM_deleteValue !== "undefined") {
              GM_deleteValue("discord_wormholes_v1");
            }
          }
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(emptyData));

          // 4. 提示與重整
          this.showToast(t("wormhole_reset_success"));
          DEBUG && console.log("[Wormhole] Data reset complete.");

          // 5. [延遲重整] 延長至 1000ms，確保寫入操作完成
          setTimeout(() => window.location.reload(), 1000);
        } catch (error) {
          console.error("[Wormhole] Reset failed:", error);
          alert("❌ 重置失敗，請查看控制台 (F12) 錯誤訊息。");
        }
      }
    }

    setupGlobalListeners() {
      document.addEventListener("click", (e) => {
        // 1. 處理群組下拉選單 (Group Dropdown)
        if (
          !e.target.closest(".my-wormhole-dropdown") &&
          !e.target.closest(".my-wormhole-group-chip")
        ) {
          this.closeAllDropdowns();
        }

        // 2. [Fix] 處理編輯/右鍵選單 (Context Menu)
        // 如果點擊的地方不是選單內部，就關閉它
        if (!e.target.closest(".my-popover-menu")) {
          const menu = document.querySelector(".my-popover-menu");
          if (menu && menu.classList.contains("show")) {
            menu.classList.remove("show");
          }
        }
      });
    }

    // ==========================================
    // Data Management (Fix Default Data)
    // ==========================================
    getDefaultData() {
      return {
        groups: [],
        vipWormholes: [],
        wormholes: [], // [Fix] 必須包含根目錄陣列
        groupIcons: {}, // 群組自訂圖示 { groupId: emojiUrl }
      };
    }

    getData() {
      try {
        let data = null;
        if (typeof GM_getValue !== "undefined") {
          data = GM_getValue(this.STORAGE_KEY, null);
        } else {
          const stored = localStorage.getItem(this.STORAGE_KEY);
          data = stored ? JSON.parse(stored) : null;
        }

        // 若完全無資料，回傳預設結構
        if (!data) return this.getDefaultData();

        // 若是舊版陣列結構，進行遷移
        if (Array.isArray(data)) {
          return { groups: [], vipWormholes: [], wormholes: data };
        }

        // [Fix] 確保所有欄位都存在 (避免 undefined 錯誤)
        if (!Array.isArray(data.groups)) data.groups = [];
        if (!Array.isArray(data.vipWormholes)) data.vipWormholes = [];
        if (!Array.isArray(data.wormholes)) data.wormholes = [];
        if (!data.groupIcons || typeof data.groupIcons !== "object")
          data.groupIcons = {};

        return data;
      } catch (error) {
        console.error("[Wormhole] Failed to load data:", error);
        return this.getDefaultData();
      }
    }

    saveData(data) {
      try {
        if (typeof GM_setValue !== "undefined") {
          GM_setValue(this.STORAGE_KEY, data);
          return true;
        }
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        return true;
      } catch (error) {
        console.error("[Wormhole] Failed to save data:", error);
        return false;
      }
    }

    getAllWormholes() {
      const data = this.getData();
      const all = [...data.wormholes];
      data.groups.forEach((group) => {
        group.wormholes.forEach((w) => {
          all.push({ ...w, groupId: group.id, groupName: group.name });
        });
      });
      return all;
    }

    findWormhole(wormholeId) {
      const data = this.getData();
      let found = data.wormholes.find((w) => w.id === wormholeId);
      if (found) return { wormhole: found, group: null };

      for (const group of data.groups) {
        found = group.wormholes.find((w) => w.id === wormholeId);
        if (found) return { wormhole: found, group };
      }
      return null;
    }

    // ==========================================
    // Injection Logic & Debug Button
    // ==========================================
    injectCreatorButton(container) {
      if (container.querySelector(".my-wormhole-creator-btn")) return;

      // 建立按鈕容器
      const btnGroup = document.createElement("div");
      btnGroup.style.cssText = "display: flex; gap: 8px; align-items: center;";

      // 蟲洞建立按鈕
      const createBtn = document.createElement("div");
      createBtn.className = "my-wormhole-creator-btn";
      createBtn.innerHTML = this.ICONS.wormhole;
      createBtn.title = this.t("wm_title");

      let debugPressTimer;
      let isLongPress = false;

      createBtn.onmousedown = (e) => {
        if (e.button !== 0) return;
        isLongPress = false;
        debugPressTimer = setTimeout(() => {
          isLongPress = true;
          this.openSettingsMenu(createBtn);
        }, 500);
      };

      const clearTimer = () => clearTimeout(debugPressTimer);
      createBtn.onmouseup = clearTimer;
      createBtn.onmouseleave = clearTimer;

      createBtn.onclick = (e) => {
        if (isLongPress) {
          isLongPress = false;
          return;
        }
        this.createNewWormhole();
      };

      // 聚焦模式切換按鈕
      const focusBtn = document.createElement("div");
      focusBtn.className = "my-wormhole-focus-btn";
      focusBtn.innerHTML = this.focusMode
        ? this.ICONS.focusOn
        : this.ICONS.focusOff;
      // title 屬性改由 hover tooltip 卡片取代，此處清空避免原生 tooltip 遮擋
      focusBtn.removeAttribute("title");

      // 長按 → 開啟聚焦選單（從 openSettingsMenu 複用定位邏輯）
      let _fbPressTimer = null;
      let _fbIsLongPress = false;

      focusBtn.onmousedown = (e) => {
        if (e.button !== 0) return;
        _fbIsLongPress = false;
        _fbPressTimer = setTimeout(() => {
          _fbIsLongPress = true;
          this.openSettingsMenu(focusBtn);
        }, 500);
      };
      const _fbClear = () => clearTimeout(_fbPressTimer);
      focusBtn.onmouseup   = _fbClear;
      focusBtn.onmouseleave = _fbClear;

      focusBtn.onclick = (e) => {
        e.stopPropagation();
        if (_fbIsLongPress) { _fbIsLongPress = false; return; }
        this.toggleFocusMode();
      };

      // ── Hover tooltip 卡片 ──────────────────────────────────────────
      let _fbTipTimer = null;
      const _fbTipId  = "wh-focus-btn-tip";

      focusBtn.addEventListener("mouseenter", () => {
        _fbTipTimer = setTimeout(() => {
          if (document.getElementById(_fbTipId)) return;
          const tip = document.createElement("div");
          tip.id = _fbTipId;
          tip.innerHTML = `
            <div class="wh-fbtip-title">${this.focusMode ? "Focus mode: ON" : "Focus mode: OFF"}</div>
            <div class="wh-fbtip-body">
              <span class="wh-fbtip-key">Click</span> — toggle focus mode<br>
              <span class="wh-fbtip-key">Long-press</span> — open focus settings<br>
              <hr class="wh-fbtip-hr">
              <span class="wh-fbtip-dim">Create wormhole:</span><br>
              <span class="wh-fbtip-key">Click ＋</span> — create new wormhole<br>
              <span class="wh-fbtip-key">Long-press ＋</span> — open wormhole settings
            </div>`;
          document.body.appendChild(tip);
          if (!document.getElementById("wh-fbtip-styles")) {
            const s = document.createElement("style");
            s.id = "wh-fbtip-styles";
            s.textContent = `
              #wh-focus-btn-tip{position:fixed;z-index:2147483647;background:var(--dmt-bg-primary);border:1px solid rgba(255,255,255,.12);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.75);padding:10px 14px;min-width:210px;pointer-events:none;animation:wh-fbtip-in .15s ease}
              @keyframes wh-fbtip-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
              .wh-fbtip-title{font-size:11px;font-weight:700;color:var(--dmt-accent);letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px}
              .wh-fbtip-body{font-size:12px;color:var(--dmt-text-muted);line-height:1.7}
              .wh-fbtip-key{display:inline-block;background:rgba(88,101,242,.18);border:1px solid rgba(88,101,242,.35);color:var(--dmt-text-bright);font-size:11px;font-weight:600;padding:1px 6px;border-radius:4px;line-height:1.5}
              .wh-fbtip-dim{color:var(--dmt-text-muted);font-size:11px}
              .wh-fbtip-hr{border:none;border-top:1px solid rgba(255,255,255,.08);margin:6px 0}
            `;
            document.head.appendChild(s);
          }
          // 定位：緊貼按鈕下方
          const rect = focusBtn.getBoundingClientRect();
          const tw = 210;
          let left = rect.left;
          if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
          tip.style.left = `${left}px`;
          tip.style.top  = `${rect.bottom + 6}px`;
        }, 400);
      });

      focusBtn.addEventListener("mouseleave", () => {
        clearTimeout(_fbTipTimer);
        document.getElementById(_fbTipId)?.remove();
      });

      btnGroup.appendChild(createBtn);
      btnGroup.appendChild(focusBtn);
      container.prepend(btnGroup);
    }

    injectWormholeDisplay(titleContainer) {
      // [Fix] 驗證注入目標是否合法（防止注入到帳戶面板、伺服器清單等）
      if (!this._isValidChannelHeader(titleContainer)) {
        console.warn(
          "[Wormhole] Rejected invalid inject target:",
          titleContainer,
        );
        return;
      }

      // [Fix] 清理在其他位置的流浪容器（同一頁面不應存在多個）
      document.querySelectorAll(".my-wormhole-container").forEach((c) => {
        if (c.parentElement !== titleContainer) {
          DEBUG &&
            console.warn(
              "[Wormhole] Removing stray container from:",
              c.parentElement,
            );
          c.remove();
        }
      });

      if (titleContainer.querySelector(".my-wormhole-container")) return;

      const wrapper = document.createElement("div");
      wrapper.className = "my-wormhole-container";

      // 直接 append 到最後 = 在 flex row 中位於最右端，不受 DOM 結構影響
      titleContainer.appendChild(wrapper);

      this.renderWormholes(wrapper);
    }

    // ==========================================
    // Action: Create Wormhole (Smart Fix)
    // ==========================================
    createNewWormhole() {
      const url = prompt(this.t("wm_url_prompt"));
      if (!url) return;

      if (!this.validateUrl(url)) {
        alert(this.t("wm_alert_invalid_url"));
        return;
      }

      const data = this.getData();

      // 1. 準備群組清單
      let groupOptions = "";
      if (data.groups.length > 0) {
        groupOptions = data.groups
          .map((g, i) => `${i + 1}. ${g.name}`)
          .join("\n");
      } else {
        groupOptions = "(無現有群組 / No existing groups)";
      }

      // 2. 詢問使用者
      // 提示：輸入數字選擇，輸入文字直接建立新群組
      let groupChoice = prompt(
        this.t("wm_group_select_prompt").replace("{list}", groupOptions),
      );

      if (groupChoice === null) return; // 取消

      let targetGroup = null; // null = 根目錄
      let targetList = data.wormholes; // 預設指向根目錄

      // 3. 智慧判斷邏輯
      const choice = groupChoice.trim();
      const index = parseInt(choice);

      if (choice === "") {
        // === 空白 -> 詢問建立新群組 ===
        const newGroupName = prompt(this.t("wm_group_prompt"));
        if (newGroupName) {
          const newGroup = {
            id: Date.now(),
            name: newGroupName.trim(),
            wormholes: [],
          };
          data.groups.push(newGroup);
          targetGroup = newGroup;
          targetList = newGroup.wormholes;
        } else {
          // 如果留空還取消命名，就預設放到根目錄 (不強制建立群組)
          // 這樣使用者如果只是想取消建立群組，還可以繼續建立蟲洞
        }
      } else if (!isNaN(index)) {
        // === 輸入數字 -> 選擇現有 ===
        if (index === 0) {
          // 0 -> 根目錄
          targetGroup = null;
          targetList = data.wormholes;
        } else if (index > 0 && index <= data.groups.length) {
          // 1~N -> 現有群組
          targetGroup = data.groups[index - 1];
          targetList = targetGroup.wormholes;
        } else {
          alert(this.t("wm_group_invalid"));
          return;
        }
      } else {
        const newGroup = {
          id: Date.now(),
          name: choice,
          wormholes: [],
        };
        data.groups.push(newGroup);
        targetGroup = newGroup;
        targetList = newGroup.wormholes;
      }

      // 4. 輸入蟲洞名稱
      const defaultName = `${this.t("wm_default_channel_name")} ${targetList.length + 1}`;
      const name = prompt(this.t("wm_name_prompt"), defaultName);
      if (!name) return;

      // 5. 嘗試抓取伺服器圖示
      const serverIcon = this.getCurrentServerIcon();

      const newWormhole = {
        id: Date.now() + 1, // +1 避免與 group ID 撞針
        name: name.trim(),
        url: url.trim(),
        createdAt: new Date().toISOString(),
        icon: serverIcon || null, // 新增：伺服器圖示 URL
      };

      targetList.push(newWormhole);

      if (this.saveData(data)) {
        this.showToast(this.t("wm_created"));
        // 強制刷新顯示
        const success = this.refreshDisplay();
        if (!success) {
          dmtConfirm(this.t("wm_refresh_confirm")).then((ok) => { if (ok) window.location.reload(); });
        }
      }
    }

    // ==========================================
    // UI Rendering
    // ==========================================
    forceRefreshDisplay() {
      let container = document.querySelector(".my-wormhole-container");
      if (container) {
        this.renderWormholes(container);
        return;
      }

      if (this.getDockPosition() === "input") {
        this._injectInputDock();
        return;
      }

      // [Fix] 掃描所有候選元素，取第一個通過驗證的
      const allTitleCandidates = document.querySelectorAll(
        'div[class*="title_"]',
      );
      for (const candidate of allTitleCandidates) {
        if (this._isValidChannelHeader(candidate)) {
          this.injectWormholeDisplay(candidate);
          return;
        }
      }

      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => {
        if (this.getDockPosition() === "input") {
          this._injectInputDock();
          return;
        }
        const allRetry = document.querySelectorAll('div[class*="title_"]');
        for (const candidate of allRetry) {
          if (this._isValidChannelHeader(candidate)) {
            this.injectWormholeDisplay(candidate);
            break;
          }
        }
      }, 200);
    }

    refreshDisplay() {
      const container = document.querySelector(".my-wormhole-container");
      if (container) {
        this.renderWormholes(container);
        return true;
      }
      this.forceRefreshDisplay();
      return false;
    }

    renderWormholes(container) {
      if (!container) return;
      // SPA 防漏：清空前先移除掛在 body 的所有 💬 按鈕（fixed 定位，不在 container 內）
      document.querySelectorAll(".wh-chat-btn").forEach(btn => btn.remove());
      container.innerHTML = "";
      const data = this.getData();

      // 建立雙列容器
      const row1 = document.createElement("div");
      row1.className = "wh-row-1";
      const row2 = document.createElement("div");
      row2.className = "wh-row-2";

      // 1. VIP 區塊
      const vipList = [];
      data.vipWormholes.forEach((vipId) => {
        const result = this.findWormhole(vipId);
        if (result) {
          const groupName = result.group
            ? result.group.name
            : this.t("wm_root_group");
          vipList.push({ ...result.wormhole, groupName });
        }
      });

      if (vipList.length > 0) {
        const vipSection = document.createElement("div");
        vipSection.className = "my-wormhole-vip-section";
        vipList.forEach((w) => {
          vipSection.appendChild(this.createVIPChip(w));
        });
        row1.appendChild(vipSection);
      }

      // 2. 群組區塊
      data.groups.forEach((group) => {
        if (group.wormholes.length > 0) {
          row1.appendChild(this.createGroupChip(group));
        }
      });

      // 3. 根目錄區塊
      data.wormholes.forEach((w) => {
        const chip = this.createWormholeChip({ ...w, isVIP: false });
        // 若已設為VIP（已在左側VIP區顯示），原位chip加視覺弱化
        if (data.vipWormholes.includes(w.id)) {
          chip.classList.add("vip-dimmed");
        }
        row1.appendChild(chip);
      });

      container.appendChild(row1);
      container.appendChild(row2);

      // 4. 應用聚焦模式樣式（直接傳入 container，避免 DOM 未掛載時 querySelector 失敗）
      this.applyFocusMode(this.focusMode, container);

      // 5. 啟動溢出平衡器
      this._scheduleBalanceRows(container);

      // 6. 綁定 body-level tooltip（繞過 Discord header 的 overflow:hidden）
      this._bindTooltips(container);

      // 7. navbar 模式：row-2 改 fixed 定位，繞過 Discord trailing_ 的 overflow:hidden
      if (this.getDockPosition() === "navbar") {
        this._bindNavbarRow2(container, row2);
      }

      // 8. 重渲染後恢復 Monitor badge（避免 renderWormholes 清空 innerHTML 後 badge 消失）
      this._restoreBadges();
    }

    // ==========================================
    // Navbar Row-2：fixed 定位，避免被 trailing_ overflow:hidden 裁切
    // ==========================================
    _bindNavbarRow2(container, row2) {
      // 把 row2 移出 container，掛到 body 層（不影響 DOM 結構邏輯）
      // 改用 fixed 定位，hover container 時計算位置顯示
      row2.style.position = "fixed";
      row2.style.zIndex = "2147483640";
      row2.style.display = "flex"; // 覆蓋 absolute 模式的 inline 行為

      const show = () => {
        if (!row2.children.length) return;
        const rect = container.getBoundingClientRect();
        row2.style.left = rect.left + "px";
        row2.style.top = rect.bottom + "px";
        row2.style.opacity = "1";
        row2.style.pointerEvents = "auto";
        row2.style.transform = "translateY(0)";
      };
      const hide = () => {
        row2.style.opacity = "0";
        row2.style.pointerEvents = "none";
        row2.style.transform = "translateY(-2px)";
      };

      // hover container 顯示，離開 container 或 row2 時隱藏
      container.addEventListener("mouseenter", show);
      container.addEventListener("mouseleave", (e) => {
        // 若滑鼠移到 row2 本身，不隱藏
        if (e.relatedTarget && row2.contains(e.relatedTarget)) return;
        hide();
      });
      row2.addEventListener("mouseleave", (e) => {
        if (e.relatedTarget && container.contains(e.relatedTarget)) return;
        hide();
      });

      hide(); // 初始隱藏
    }
    // Body-level Tooltip（繞過 header overflow:hidden）
    // ==========================================
    _bindTooltips(container) {
      // 建立或重用唯一 tooltip 節點
      let tip = document.getElementById("wh-body-tooltip");
      if (!tip) {
        tip = document.createElement("div");
        tip.id = "wh-body-tooltip";
        Object.assign(tip.style, {
          position: "fixed",
          pointerEvents: "none",
          background: "rgba(10,10,12,0.92)",
          color: "#e3e5e8",
          fontSize: "11px",
          fontWeight: "600",
          padding: "3px 9px",
          borderRadius: "5px",
          boxShadow: "0 3px 10px rgba(0,0,0,0.55)",
          zIndex: "2147483647",
          whiteSpace: "nowrap",
          letterSpacing: "0.02em",
          opacity: "0",
          transition: "opacity 0.12s ease",
        });
        document.body.appendChild(tip);
      }

      // 綁定所有 chip
      const chips = container.querySelectorAll(
        ".my-wormhole-chip, .my-wormhole-vip-chip",
      );
      chips.forEach((chip) => {
        const name = chip.dataset.wormholeName;
        if (!name) return;

        // 防止重複綁定
        if (chip.dataset.tooltipBound) return;
        chip.dataset.tooltipBound = "1";

        const isVip = chip.classList.contains("my-wormhole-vip-chip");

        chip.addEventListener("mouseenter", (e) => {
          tip.textContent = name;
          tip.style.color = isVip ? "#ffd700" : "#e3e5e8";
          // 定位：chip 正上方，螢幕邊緣自動迴避
          const rect = chip.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          tip.style.left = "0px";
          tip.style.top = "0px";
          tip.style.opacity = "1";
          // 等一幀取得 tip 尺寸後再定位
          requestAnimationFrame(() => {
            const tw = tip.offsetWidth;
            const th = tip.offsetHeight;
            const safeX = Math.min(
              Math.max(x - tw / 2, 6),
              window.innerWidth - tw - 6,
            );
            const y = rect.top - th - 7;
            tip.style.left = `${safeX}px`;
            tip.style.top = `${y}px`;
          });
        });

        chip.addEventListener("mouseleave", () => {
          tip.style.opacity = "0";
        });
      });
    }

    // ==========================================
    // Overflow Balance: 雙列自動分配
    // ==========================================

    /**
     * 在 renderWormholes 末尾呼叫，
     * 等一個 rAF 讓 DOM 穩定後執行靜態分行
     */
    _scheduleBalanceRows(container) {
      requestAnimationFrame(() => {
        this._balanceRows(container);
      });
    }

    /**
     * 固定規則：row1 最多保留 ROW1_MAX 個 chip，
     * 超出的依序搬到 row2。
     * 不依賴 ResizeObserver，行為穩定可預期。
     */
    _balanceRows(container) {
      const ROW1_MAX = 11;
      if (!container || !document.body.contains(container)) return;

      const row1 = container.querySelector(".wh-row-1");
      const row2 = container.querySelector(".wh-row-2");
      if (!row1 || !row2) return;

      // 把所有 chip 先收回 row1（支援多次刷新不錯位）
      while (row2.firstChild) {
        row1.appendChild(row2.firstChild);
      }

      // 超過 ROW1_MAX 的依順序搬到 row2
      const chips = Array.from(row1.children);
      chips.slice(ROW1_MAX).forEach((chip) => row2.appendChild(chip));
    }
    createVIPChip(wormhole) {
      const chip = document.createElement("div");
      chip.className = "my-wormhole-vip-chip";
      chip.dataset.wormholeName = wormhole.name;
      chip.dataset.wormholeId   = wormhole.id;
      chip.style.cssText = "position:relative; overflow:visible;";

      const iconHtml = wormhole.icon
        ? `<img src="${wormhole.icon}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;" draggable="false">`
        : `<span class="vip-icon">${this.ICONS.star}</span>`;

      chip.innerHTML = `
            ${iconHtml}
            <span class="vip-text">${escHtml(wormhole.name)}</span>
        `;
      chip.dataset.wormholeUrl = wormhole.url;
      chip.draggable = true;

      // ── 💬 hover 傳送按鈕（聚焦模式下由 CSS 自動隱藏）──────────────
      const chatBtn = document.createElement("button");
      chatBtn.className = "wh-chat-btn";
      chatBtn.title     = this.t("wm_send_chat_btn") || "Send message";
      chatBtn.innerHTML = `<span class="wh-chat-icon">💬</span>`;
      chatBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.openSendMessageOverlay(wormhole);
      });
      document.body.appendChild(chatBtn);

      const _positionChatBtn = () => {
        const r = chip.getBoundingClientRect();
        chatBtn.style.top  = (r.top  - 10) + "px";
        chatBtn.style.left = (r.right - 10) + "px";
      };
      chip.addEventListener("mouseenter", () => {
        _positionChatBtn();
        chatBtn.classList.add("visible");
      });
      chip.addEventListener("mouseleave", (e) => {
        if (e.relatedTarget === chatBtn || chatBtn.contains(e.relatedTarget)) return;
        chatBtn.classList.remove("visible");
      });
      chatBtn.addEventListener("mouseleave", () => chatBtn.classList.remove("visible"));

      DEBUG && console.log("[VIP Chip] Created:", wormhole.name, "draggable:", chip.draggable, "id:", wormhole.id);

      this.attachChipEvents(chip, wormhole, true);
      this.attachDragEvents(chip, wormhole, "vip");
      return chip;
    }

    createWormholeChip(wormhole) {
      const chip = document.createElement("div");
      chip.className = "my-wormhole-chip";
      chip.dataset.wormholeName = wormhole.name;
      chip.dataset.wormholeId   = wormhole.id;
      chip.style.cssText = "position:relative; overflow:visible;";

      const iconHtml = wormhole.icon
        ? `<img src="${wormhole.icon}" style="width:16px;height:16px;border-radius:50%;object-fit:cover;" class="my-wormhole-icon" draggable="false">`
        : `<span class="my-wormhole-icon">${this.ICONS.portal}</span>`;

      chip.innerHTML = `${iconHtml}<span class="item-name">${escHtml(wormhole.name)}</span>`;
      chip.dataset.wormholeUrl = wormhole.url;
      chip.draggable = true;

      // ── 💬 hover 傳送按鈕（position:fixed，脫離 Discord overflow:hidden 父層）──
      const chatBtn = document.createElement("button");
      chatBtn.className  = "wh-chat-btn";
      chatBtn.title      = this.t("wm_send_chat_btn") || "Send message";
      chatBtn.innerHTML  = `<span class="wh-chat-icon">💬</span>`;
      chatBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.openSendMessageOverlay(wormhole);
      });
      document.body.appendChild(chatBtn); // 掛到 body，fixed 定位不受父層影響

      const _positionChatBtn = () => {
        const r = chip.getBoundingClientRect();
        chatBtn.style.top  = (r.top  - 10) + "px";
        chatBtn.style.left = (r.right - 10) + "px";
      };
      chip.addEventListener("mouseenter", () => {
        _positionChatBtn();
        chatBtn.classList.add("visible");
      });
      chip.addEventListener("mouseleave", (e) => {
        // 滑鼠移到 chatBtn 本身時不隱藏
        if (e.relatedTarget === chatBtn || chatBtn.contains(e.relatedTarget)) return;
        chatBtn.classList.remove("visible");
      });
      chatBtn.addEventListener("mouseleave", () => chatBtn.classList.remove("visible"));

      DEBUG && console.log("[Wormhole Chip] Created:", wormhole.name, "draggable:", chip.draggable, "id:", wormhole.id);

      this.attachChipEvents(chip, wormhole, false);
      this.attachDragEvents(chip, wormhole, "normal");
      return chip;
    }

    createGroupChip(group) {
      const chip = document.createElement("div");
      chip.className = "my-wormhole-group-chip";
      chip.dataset.groupId = group.id;

      // 取得自訂圖示
      const data = this.getData();
      const customIcon = data.groupIcons?.[group.id];
      const displayIcon = customIcon
        ? `<img src="${customIcon}" style="width:16px;height:16px;object-fit:contain;">`
        : this.ICONS.folder;

      chip.innerHTML = `
            <span class="group-icon" style="cursor:pointer;">${displayIcon}</span>
            <span class="group-name">${escHtml(group.name)}</span>
            <span class="group-count">(${group.wormholes.length})</span>
            <span class="group-chevron">${this.ICONS.chevronDown}</span>
        `;
      this.attachGroupChipEvents(chip, group);
      return chip;
    }

    attachChipEvents(chip, wormhole, isVIP) {
      let pressTimer = null;
      let isLongPress = false;
      let isDraggingNow = false;
      let mouseDownPos = null; // 記錄 mousedown 位置

      const startPress = (e) => {
        if (isDraggingNow) return;
        isLongPress = false;
        mouseDownPos = { x: e.clientX, y: e.clientY }; // 記錄起始位置

        pressTimer = setTimeout(() => {
          if (!isDraggingNow) {
            isLongPress = true;
            chip.classList.add("editing");
            this.createWormholeContextMenu(wormhole, chip);
          }
        }, 600);
      };

      const cancelPress = () => {
        clearTimeout(pressTimer);
        chip.classList.remove("editing");
        mouseDownPos = null;
      };

      // 監聽拖曳開始
      chip.addEventListener("dragstart", () => {
        isDraggingNow = true;
        cancelPress();
      });

      // 拖曳結束後重置
      chip.addEventListener("dragend", () => {
        setTimeout(() => {
          isDraggingNow = false;
        }, 100);
      });

      chip.addEventListener("mousedown", (e) => {
        if (e.button === 0) {
          startPress(e);
        }
      });

      // [Fix] 在 mousemove 時檢查是否移動超過閾值，若是則取消長按
      chip.addEventListener("mousemove", (e) => {
        if (mouseDownPos && pressTimer) {
          const deltaX = Math.abs(e.clientX - mouseDownPos.x);
          const deltaY = Math.abs(e.clientY - mouseDownPos.y);
          // 移動超過 5px 就取消長按，讓拖曳可以順利進行
          if (deltaX > 5 || deltaY > 5) {
            cancelPress();
          }
        }
      }, { passive: true });

      chip.addEventListener("mouseup", cancelPress);
      chip.addEventListener("mouseleave", cancelPress);

      chip.addEventListener("click", (e) => {
        // 拖曳時不觸發點擊
        if (isDraggingNow) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // 長按選單顯示時不觸發導航
        if (isLongPress || document.querySelector(".my-popover-menu.show")) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        cancelPress();

        if (e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          this.openSendMessageOverlay(wormhole);
          return;
        }

        this.navigateToChannel(wormhole.url);
        // Monitor：點擊後清除 badge，更新 sessionStorage 基準
        this._clearWormholeBadge(wormhole.id);
      });

      chip.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.createWormholeContextMenu(wormhole, chip);
      });
    }

    // ==========================================
    // 拖曳排序事件處理
    // ==========================================
    attachDragEvents(chip, wormhole, type) {
      let dragStartX = 0;
      let dragStartY = 0;
      let hasDragged = false;
      let isDragging = false;

      chip.addEventListener("dragstart", (e) => {
        DEBUG &&
          console.log(
            "[Drag] dragstart triggered for:",
            wormhole.name,
            "id:",
            wormhole.id,
          );

        dragStartX = e.clientX;
        dragStartY = e.clientY;
        hasDragged = false;
        isDragging = true;

        // 設定拖曳數據
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({
            wormholeId: wormhole.id,
            type: type, // 'vip' 或 'normal'
          }),
        );

        DEBUG &&
          console.log("[Drag] Drag data set:", {
            wormholeId: wormhole.id,
            type,
          });

        // 創建拖曳圖像
        const dragImage = chip.cloneNode(true);
        dragImage.style.opacity = "0.7";
        dragImage.style.position = "absolute";
        dragImage.style.top = "-9999px";
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 20, 20);
        setTimeout(() => dragImage.remove(), 0);

        // 視覺反饋 - 只使用 class，不設置 pointerEvents
        chip.classList.add("dragging");
      });

      chip.addEventListener("drag", (e) => {
        const deltaX = Math.abs(e.clientX - dragStartX);
        const deltaY = Math.abs(e.clientY - dragStartY);
        if (deltaX > 5 || deltaY > 5) {
          hasDragged = true;
        }
      });

      chip.addEventListener("dragend", (e) => {
        DEBUG && console.log("[Drag] dragend triggered");
        isDragging = false;
        chip.classList.remove("dragging");

        // 清理所有可能殘留的drag-over狀態
        document.querySelectorAll(".drag-over").forEach((el) => {
          el.classList.remove("drag-over");
        });

        // 如果有拖曳動作,取消點擊事件
        if (hasDragged) {
          e.preventDefault();
          e.stopPropagation();
        }
      });

      chip.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        // 高亮目標位置(排除自身)
        if (!chip.classList.contains("dragging")) {
          chip.classList.add("drag-over");
        }
      });

      chip.addEventListener("dragleave", (e) => {
        // 檢查是否真的離開元素(避免子元素觸發)
        const rect = chip.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;

        if (
          x < rect.left ||
          x > rect.right ||
          y < rect.top ||
          y > rect.bottom
        ) {
          chip.classList.remove("drag-over");
        }
      });

      chip.addEventListener("drop", (e) => {
        DEBUG && console.log("[Drag] drop event triggered on:", wormhole.name);
        e.preventDefault();
        e.stopPropagation();
        chip.classList.remove("drag-over");

        try {
          const dragData = JSON.parse(e.dataTransfer.getData("text/plain"));
          const draggedId = parseInt(dragData.wormholeId);
          const draggedType = dragData.type; // 'vip' 或 'normal'
          const targetId = parseInt(wormhole.id);
          const targetType = type; // 本身 chip 在 bind 時傳入的 type

          DEBUG &&
            console.log("[Drag] Drop data:", {
              draggedId,
              targetId,
              draggedType,
              targetType,
            });

          // [修復] 嚴格限制：禁止跨區塊拖曳 (VIP 只能跟 VIP 換，一般只能跟一般換)
          if (draggedType !== targetType) {
            console.warn("[Drag] 跨區塊拖曳被拒絕，保持原本的分類邊界");
            return;
          }

          if (draggedId === targetId) {
            DEBUG && console.log("[Drag] Same wormhole, skipping swap");
            return;
          }

          DEBUG && console.log("[Drag] Swapping:", draggedId, "↔", targetId);
          // 執行排序交換，明確傳入它們所屬的區塊類型
          this.swapWormholes(draggedId, targetId, targetType);
        } catch (err) {
          console.error("[Drag] Failed to parse data:", err);
        }
      });
    }

    // 交換兩個蟲洞的位置
    swapWormholes(draggedId, targetId, listType) {
      const data = this.getData();
      draggedId = parseInt(draggedId);
      targetId = parseInt(targetId);

      DEBUG &&
        console.log(
          "[Swap] Start swapping:",
          draggedId,
          "↔",
          targetId,
          "in",
          listType,
        );

      if (listType === "vip") {
        // VIP 區塊內的排序交換
        const dIdx = data.vipWormholes.findIndex(
          (id) => parseInt(id) === draggedId,
        );
        const tIdx = data.vipWormholes.findIndex(
          (id) => parseInt(id) === targetId,
        );
        if (dIdx !== -1 && tIdx !== -1) {
          [data.vipWormholes[dIdx], data.vipWormholes[tIdx]] = [
            data.vipWormholes[tIdx],
            data.vipWormholes[dIdx],
          ];
        }
      } else {
        // 一般區塊內的排序交換 (Root)
        const dIdx = data.wormholes.findIndex(
          (w) => parseInt(w.id) === draggedId,
        );
        const tIdx = data.wormholes.findIndex(
          (w) => parseInt(w.id) === targetId,
        );

        if (dIdx !== -1 && tIdx !== -1) {
          [data.wormholes[dIdx], data.wormholes[tIdx]] = [
            data.wormholes[tIdx],
            data.wormholes[dIdx],
          ];
        } else {
          // 如果不在根目錄，檢查是否在同一個群組內互換
          data.groups.forEach((group) => {
            const gdIdx = group.wormholes.findIndex(
              (w) => parseInt(w.id) === draggedId,
            );
            const gtIdx = group.wormholes.findIndex(
              (w) => parseInt(w.id) === targetId,
            );
            if (gdIdx !== -1 && gtIdx !== -1) {
              [group.wormholes[gdIdx], group.wormholes[gtIdx]] = [
                group.wormholes[gtIdx],
                group.wormholes[gdIdx],
              ];
            }
          });
        }
      }

      DEBUG && console.log("[Swap] Saving data and refreshing display");
      this.saveData(data);
      this.refreshDisplay();
    }

    attachGroupChipEvents(chip, group) {
      const groupId = `group-${group.id}`;
      let hoverTimer = null;

      const showDropdown = () => {
        this.closeAllDropdowns();
        const dropdown = document.createElement("div");
        dropdown.className = "my-wormhole-dropdown";
        dropdown.dataset.groupId = groupId;

        const data = this.getData();

        group.wormholes.forEach((wormhole) => {
          const isPinned = data.vipWormholes.includes(wormhole.id);
          const item = document.createElement("div");
          // 已設為VIP者加視覺弱化，提示焦點在左側VIP區
          item.className = isPinned ? "dropdown-item disabled vip-dimmed" : "dropdown-item disabled";

          // 優先使用伺服器圖示
          const iconHtml = wormhole.icon
            ? `<img src="${wormhole.icon}" style="width:16px;height:16px;border-radius:50%;object-fit:cover;margin-right:4px;">`
            : `<span class="item-icon">${this.ICONS.portal}</span>`;

          item.innerHTML = `
                    ${iconHtml}
                    <span class="item-name">${escHtml(wormhole.name)}</span>
                    <button class="item-pin-btn" data-pinned="${isPinned}" title="${isPinned ? this.t("wm_menu_vip_remove") : this.t("wm_menu_vip_add")}">
                        ${isPinned ? this.ICONS.star : this.ICONS.starOutline}
                    </button>
                `;

          // --- 下拉項目互動邏輯 ---
          let itemPressTimer = null;
          let isItemLongPress = false;

          const startItemPress = () => {
            isItemLongPress = false;
            itemPressTimer = setTimeout(() => {
              isItemLongPress = true;
              this.closeAllDropdowns();
              this.createWormholeContextMenu(wormhole, item);
            }, 600);
          };
          const cancelItemPress = () => clearTimeout(itemPressTimer);

          item.addEventListener("mousedown", (e) => {
            if (e.button === 0) startItemPress();
          });
          item.addEventListener("mouseup", cancelItemPress);
          item.addEventListener("mouseleave", cancelItemPress);

          const nameArea = item.querySelector(".item-name");
          nameArea.addEventListener("click", (e) => {
            e.stopPropagation();
            cancelItemPress();
            if (isItemLongPress) return;
            if (!item.classList.contains("disabled")) {
              this.navigateToChannel(wormhole.url);
              this.closeAllDropdowns();
            }
          });

          const pinBtn = item.querySelector(".item-pin-btn");
          pinBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            cancelItemPress();
            if (!item.classList.contains("disabled")) {
              this.toggleVIP(wormhole.id, !isPinned);
              this.closeAllDropdowns();
            }
          });

          item.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cancelItemPress();
            if (!item.classList.contains("disabled")) {
              this.createWormholeContextMenu(wormhole, item);
            }
          });

          dropdown.appendChild(item);
        });

        // Positioning
        const rect = chip.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;
        document.body.appendChild(dropdown);
        this.activeDropdown = dropdown;

        setTimeout(() => {
          dropdown
            .querySelectorAll(".dropdown-item")
            .forEach((item) => item.classList.remove("disabled"));
        }, 250);

        dropdown.addEventListener("mouseenter", () =>
          clearTimeout(this.dropdownCloseTimer),
        );
        dropdown.addEventListener("mouseleave", () => {
          this.dropdownCloseTimer = setTimeout(
            () => this.closeAllDropdowns(),
            300,
          );
        });
      };

      chip.addEventListener("mouseenter", () => {
        clearTimeout(hoverTimer);
        clearTimeout(this.dropdownCloseTimer);
        hoverTimer = setTimeout(showDropdown, 400);
      });

      chip.addEventListener("mouseleave", () => {
        clearTimeout(hoverTimer);
        this.dropdownCloseTimer = setTimeout(() => {
          if (
            this.activeDropdown &&
            !chip.matches(":hover") &&
            !this.activeDropdown.matches(":hover")
          ) {
            this.closeAllDropdowns();
          }
        }, 300);
      });

      chip.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.createGroupContextMenu(group, chip);
      });

      // 為資料夾圖示添加點擊事件
      const folderIcon = chip.querySelector(".group-icon");
      if (folderIcon) {
        folderIcon.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openGroupIconPicker(group);
        });
      }
    }

    // ==========================================
    // Menu & CRUD Actions
    // ==========================================
    createWormholeContextMenu(wormhole, triggerElement) {
      const dropdown =
        document.querySelector(".my-popover-menu") ||
        this.createDropdownElement();
      dropdown.innerHTML = "";
      dropdown.className = "my-popover-menu show";

      const data = this.getData();
      const isPinned = data.vipWormholes.includes(wormhole.id);

      const addItem = (label, icon, onClick, isDanger = false) => {
        const item = document.createElement("div");
        item.className = "my-menu-item";
        // label 為 this.t() 翻譯常數（純文字），改用 textContent 避免潛在 XSS 風險
        item.textContent = label;
        if (isDanger) item.style.color = "#ed4245";
        item.onclick = (e) => {
          e.stopPropagation();
          onClick();
          dropdown.classList.remove("show");
        };
        dropdown.appendChild(item);
      };

      addItem(this.t("wm_menu_send"), "✉️", () =>
        this.openSendMessageOverlay(wormhole),
      );
      addItem(this.t("wm_menu_edit"), "✎", () => this.editWormhole(wormhole));

      // VIP Toggle
      const label = isPinned
        ? this.t("wm_menu_vip_remove")
        : this.t("wm_menu_vip_add");
      const icon = isPinned ? "☆" : "★";
      addItem(label, icon, () => this.toggleVIP(wormhole.id, !isPinned));

      addItem(this.t("wm_menu_move"), "📁", () => this.moveWormhole(wormhole));
      addItem(
        this.t("wm_menu_del"),
        "🗑️",
        () => this.deleteWormhole(wormhole),
        true,
      );

      this._positionMenu(dropdown, triggerElement);
    }

    createGroupContextMenu(group, triggerElement) {
      const dropdown =
        document.querySelector(".my-popover-menu") ||
        this.createDropdownElement();
      dropdown.innerHTML = "";
      dropdown.className = "my-popover-menu show";

      // [Fix] 修正這裡：同樣移除 icon span
      const addItem = (label, icon, onClick, isDanger = false) => {
        const item = document.createElement("div");
        item.className = "my-menu-item";

        // label 為 this.t() 翻譯常數（純文字），改用 textContent 避免未來翻譯動態化時的 XSS 風險
        item.textContent = label;

        if (isDanger) item.style.color = "#ed4245";
        item.onclick = (e) => {
          e.stopPropagation();
          onClick();
          dropdown.classList.remove("show");
        };
        dropdown.appendChild(item);
      };

      addItem(this.t("wm_menu_edit"), "✎", () => this.editGroup(group));
      addItem(this.t("wm_menu_del"), "🗑️", () => this.deleteGroup(group), true);

      this._positionMenu(dropdown, triggerElement);
    }

    createDropdownElement() {
      const d = document.createElement("div");
      d.className = "my-popover-menu";
      d.style.padding = "4px";
      document.body.appendChild(d);
      return d;
    }

    closeAllDropdowns() {
      document
        .querySelectorAll(".my-wormhole-dropdown")
        .forEach((d) => d.remove());
      this.activeDropdown = null;
      clearTimeout(this.dropdownCloseTimer);
    }

    // ==========================================
    // 蟲洞傳送訊息 v5 + 方案 B API 模式骨架
    //
    // 傳送路由：
    //   apiMode === false → _sendViaWormhole()  (方案 A：跳頁注入)
    //   apiMode === true  → _sendViaApi()        (方案 B：REST API) [TODO]
    //
    // Token 生命週期：
    //   存於 this._cachedToken (記憶體)
    //   頁面關閉即清除，永不寫入任何持久化儲存
    //
    // API 模式偏好：
    //   存於 localStorage('wh_api_mode') = 'true'/'false'
    //   僅記錄使用者意願，不存 Token
    // ==========================================

    // ── 狀態 ──────────────────────────────────────────────────────────────
    // this._cachedToken  : string | null  (記憶體，頁面關閉清除)
    // this._tokenWatcher : function | null (fetch 攔截器解除函數)

    getApiMode() {
      return localStorage.getItem("wh_api_mode") === "true";
    }

    setApiMode(enabled) {
      localStorage.setItem("wh_api_mode", String(enabled));
    }

    // ==========================================
    // 彩蛋入口：API 模式面板
    // 長按蟲洞建立按鈕 3 秒觸發
    // ==========================================
    // ==========================================
    // ==========================================
    // Dock Position: navbar | titlebar | input
    // ==========================================
    getDockPosition() {
      const raw = localStorage.getItem("wh_dock_position") || "navbar";
      // 相容舊值 "header" → 映射到 "titlebar"
      if (raw === "header") return "titlebar";
      return raw;
    }

    setDockPosition(pos) {
      localStorage.setItem("wh_dock_position", pos);
    }

    // 統一切換入口，pos: "navbar" | "titlebar" | "input" | "topleft"
    switchDockPosition(pos) {
      this.setDockPosition(pos);

      // 移除所有現有容器與 dock
      document
        .querySelectorAll(".my-wormhole-container")
        .forEach((c) => c.remove());
      document.getElementById("wh-input-dock")?.remove();
      this._cleanupNavbarDock();
      document.getElementById("wh-titlebar-dock")?.remove();
      this._cleanupTopLeftDock();

      if (pos === "input") {
        this._injectInputDock();
      } else if (pos === "titlebar") {
        this._injectTitlebarDock();
      } else if (pos === "topleft") {
        this._injectTopLeftDock();
      } else {
        // navbar
        this._injectNavbarDock();
      }
    }

    // 注入到導航欄（trailing_ 旁邊，獨立 dock 包裹）
    _injectNavbarDock() {
      if (document.getElementById("wh-navbar-dock")) return;
      const trailingGroup = document.querySelector('div[class*="trailing_"]');
      if (!trailingGroup) return;

      const dock = document.createElement("div");
      dock.id = "wh-navbar-dock";
      const wrapper = document.createElement("div");
      wrapper.className = "my-wormhole-container";
      dock.appendChild(wrapper);

      // position:fixed 掛到 body，完全脫離 Discord header 的 overflow:hidden
      // 位置跟著 trailing_ 的左緣即時計算
      document.body.appendChild(dock);
      this.renderWormholes(wrapper);

      const reposition = () => {
        const rect = trailingGroup.getBoundingClientRect();
        dock.style.left = rect.left - dock.offsetWidth - 6 + "px";
        dock.style.top =
          rect.top + (rect.height - dock.offsetHeight) / 2 + "px";
      };

      requestAnimationFrame(() => {
        reposition();
        this._navbarDockReposition = reposition;
        window.addEventListener("resize", reposition);
        // MutationObserver 每 100ms 可能觸發重算，用 rAF 節流避免無限循環
        this._navbarRafPending = false;
        this._navbarDockRepositionThrottled = () => {
          if (this._navbarRafPending) return;
          this._navbarRafPending = true;
          requestAnimationFrame(() => {
            this._navbarRafPending = false;
            reposition();
          });
        };
      });
    }

    _cleanupNavbarDock() {
      const dock = document.getElementById("wh-navbar-dock");
      if (dock) dock.remove();
      if (this._navbarDockReposition) {
        window.removeEventListener("resize", this._navbarDockReposition);
        this._navbarDockReposition = null;
      }
    }

    // 注入到左上角（固定在視窗左上角，垂直排列）
    _injectTopLeftDock() {
      if (document.getElementById("wh-topleft-dock")) return;

      const dock = document.createElement("div");
      dock.id = "wh-topleft-dock";

      const wrapper = document.createElement("div");
      wrapper.className = "my-wormhole-container";
      dock.appendChild(wrapper);

      document.body.appendChild(dock);
      this.renderWormholes(wrapper);
    }

    _cleanupTopLeftDock() {
      const dock = document.getElementById("wh-topleft-dock");
      if (dock) dock.remove();
    }

    // 注入到頻道標題欄（section[class*="title_"] 下方）
    _injectTitlebarDock(retryCount = 0) {
      if (document.getElementById("wh-titlebar-dock")) return;

      // 精確選取 section 標籤的頻道標題欄，排除 div（導航欄也含 title_ class）
      const titleSection = document.querySelector('section[class*="title_"]');
      if (!titleSection) {
        // section 尚未出現（頻道剛切換），最多重試 5 次
        if (retryCount < 5) {
          setTimeout(() => this._injectTitlebarDock(retryCount + 1), 200);
        }
        return;
      }

      // 在 section 後面插入 dock（標題欄正下方）
      const dock = document.createElement("div");
      dock.id = "wh-titlebar-dock";
      titleSection.parentNode.insertBefore(dock, titleSection.nextSibling);

      const wrapper = document.createElement("div");
      wrapper.className = "my-wormhole-container";
      dock.appendChild(wrapper);
      this.renderWormholes(wrapper);
    }

    _injectInputDock() {
      // 目標：scrollableContainer_ —— 這是整個聊天視窗的滾動容器，
      // 其父層是垂直 flex column，insertBefore 能讓 dock 出現在輸入框正上方。
      const SELECTORS = [
        'div[class*="scrollableContainer_"]',
        'form[class*="form_"]',
        'div[class*="channelTextArea_"]',
      ];

      let anchorEl = null;
      for (const sel of SELECTORS) {
        anchorEl = document.querySelector(sel);
        if (anchorEl) break;
      }

      if (!anchorEl) {
        // 🐛 修正：fallback 只做視覺降級，不覆寫使用者選擇的位置
        // 下次 MutationObserver 偵測到 DOM 就緒後會自動重試
        console.warn(
          "[WH Dock] Could not find chat input area, will retry on next DOM change",
        );
        return;
      }

      // 若父層是橫向 flex row，往上再取一層
      const parentEl = anchorEl.parentNode;
      const parentStyle = window.getComputedStyle(parentEl);
      if (
        parentStyle.display === "flex" &&
        parentStyle.flexDirection === "row"
      ) {
        anchorEl = parentEl;
      }

      const dock = document.createElement("div");
      dock.id = "wh-input-dock";
      anchorEl.parentNode.insertBefore(dock, anchorEl);

      const wrapper = document.createElement("div");
      wrapper.className = "my-wormhole-container";
      dock.appendChild(wrapper);
      this.renderWormholes(wrapper);
    }

    openSettingsMenu(anchorEl) {
      // 關掉已存在的選單
      const existing = document.getElementById("wh-settings-menu");
      if (existing) {
        existing.remove();
        return;
      }

      const menu = document.createElement("div");
      menu.id = "wh-settings-menu";

      const currentDock = this.getDockPosition(); // 'navbar' | 'titlebar' | 'input'

      // ── 選單標題 ──
      const titleEl = document.createElement("div");
      titleEl.id = "wh-sm-title";
      titleEl.textContent = this.t("wm_settings_menu_title");
      menu.appendChild(titleEl);

      // ── 動作區 ──
      const actions = [
        {
          key: "wm_settings_create",
          icon: "➕",
          action: () => {
            menu.remove();
            this.createNewWormhole();
          },
        },
        {
          key: "wm_settings_send_mode",
          icon: "✉️",
          action: () => {
            menu.remove();
            this.openApiModePanel();
          },
        },
      ];
      actions.forEach(({ key, icon, action }) => {
        const row = document.createElement("div");
        row.className = "wh-sm-item";
        row.innerHTML = `<span class="wh-sm-icon">${icon}</span><span>${this.t(key)}</span>`;
        row.onclick = action;
        menu.appendChild(row);
      });

      // ── 分隔線 ──
      const sep = document.createElement("div");
      sep.className = "wh-sm-sep";
      menu.appendChild(sep);

      // ── 位置區 section header ──
      const posHeader = document.createElement("div");
      posHeader.className = "wh-sm-section";
      posHeader.textContent = this.t("wm_settings_position");
      menu.appendChild(posHeader);

      // ── 四個位置選項 ──
      const positions = [
        { pos: "navbar", key: "wm_settings_position_navbar", icon: "🧭" },
        { pos: "titlebar", key: "wm_settings_position_titlebar", icon: "📌" },
        { pos: "input", key: "wm_settings_position_input", icon: "⌨️" },
        { pos: "topleft", key: "wm_settings_position_topleft", icon: "📍" },
      ];
      positions.forEach(({ pos, key, icon }) => {
        const isActive = currentDock === pos;
        const sub = document.createElement("div");
        sub.className =
          "wh-sm-item wh-sm-pos" + (isActive ? " wh-sm-active" : "");
        sub.innerHTML = `
          <span class="wh-sm-icon">${icon}</span>
          <span class="wh-sm-pos-label">${this.t(key)}</span>
          <span class="wh-sm-radio">${isActive ? "●" : "○"}</span>`;
        if (!isActive)
          sub.onclick = () => {
            menu.remove();
            this.switchDockPosition(pos);
          };
        menu.appendChild(sub);
      });

      // ── 聚焦大小區（只在聚焦模式開啟時顯示）──
      if (this.focusMode) {
        const sep2 = document.createElement("div");
        sep2.className = "wh-sm-sep";
        menu.appendChild(sep2);

        const sizeHeader = document.createElement("div");
        sizeHeader.className = "wh-sm-section";
        sizeHeader.textContent = this.t("wm_focus_size");
        menu.appendChild(sizeHeader);

        const currentSize = this.getFocusSize();
        const sizes = [
          { key: "wm_focus_size_s", val: "s" },
          { key: "wm_focus_size_m", val: "m" },
          { key: "wm_focus_size_l", val: "l" },
        ];
        sizes.forEach(({ key, val }) => {
          const isActive = currentSize === val;
          const sizeRow = document.createElement("div");
          sizeRow.className =
            "wh-sm-item wh-sm-pos" + (isActive ? " wh-sm-active" : "");
          sizeRow.innerHTML = `<span class="wh-sm-pos-label">${this.t(key)}</span><span class="wh-sm-radio">${isActive ? "●" : "○"}</span>`;
          if (!isActive)
            sizeRow.onclick = () => {
              menu.remove();
              this.setFocusSize(val);
              this.applyFocusMode(true);
            };
          menu.appendChild(sizeRow);
        });

        // ── Show labels toggle（僅聚焦模式下顯示）──
        const sep3 = document.createElement("div");
        sep3.className = "wh-sm-sep";
        menu.appendChild(sep3);

        const labelHeader = document.createElement("div");
        labelHeader.className = "wh-sm-section";
        labelHeader.textContent = "Label";
        menu.appendChild(labelHeader);

        const showLabels = this.getFocusShowLabels();
        const labelRow = document.createElement("div");
        labelRow.className = "wh-sm-item wh-sm-pos" + (showLabels ? " wh-sm-active" : "");
        labelRow.innerHTML = `
          <span class="wh-sm-icon">🏷️</span>
          <span class="wh-sm-pos-label">Show name below icon</span>
          <span class="wh-sm-radio">${showLabels ? "●" : "○"}</span>`;
        labelRow.onclick = () => {
          const next = !this.getFocusShowLabels();
          this.setFocusShowLabels(next);
          this.applyFocusMode(true);
          menu.remove();
        };
        menu.appendChild(labelRow);
      }

      // ── 注入樣式（只注入一次）──
      if (!document.getElementById("wh-settings-menu-styles")) {
        const s = document.createElement("style");
        s.id = "wh-settings-menu-styles";
        s.textContent = `
          #wh-settings-menu{position:fixed;z-index:2147483646;background:var(--dmt-bg-primary);border:1px solid rgba(255,255,255,.1);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.7);padding:4px;min-width:220px;animation:wh-sm-in .14s cubic-bezier(.19,1,.22,1)}
          @keyframes wh-sm-in{from{opacity:0;transform:scale(.94) translateY(-5px)}to{opacity:1;transform:none}}
          #wh-sm-title{color:var(--dmt-text-muted);font-size:10px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;padding:6px 12px 4px}
          .wh-sm-sep{height:1px;background:rgba(255,255,255,.07);margin:4px 0}
          .wh-sm-section{color:var(--dmt-text-muted);font-size:10px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;padding:6px 12px 3px;margin-top:2px}
          .wh-sm-item{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:6px;color:var(--dmt-text-bright);font-size:13px;cursor:pointer;transition:background .1s}
          .wh-sm-item:hover{background:rgba(88,101,242,.18);color:#fff}
          .wh-sm-pos{padding:5px 10px}
          .wh-sm-pos.wh-sm-active{color:#fff;cursor:default}
          .wh-sm-pos.wh-sm-active:hover{background:transparent}
          .wh-sm-pos-label{flex:1}
          .wh-sm-radio{font-size:11px;color:var(--dmt-text-muted);flex-shrink:0}
          .wh-sm-active .wh-sm-radio{color:var(--dmt-accent)}
          .wh-sm-icon{width:18px;text-align:center;font-size:14px;flex-shrink:0}
        `;
        document.head.appendChild(s);
      }

      document.body.appendChild(menu);

      // 定位：緊貼 anchor 按鈕下方
      const rect = anchorEl.getBoundingClientRect();
      const mw = 220;
      let left = rect.left;
      let top = rect.bottom + 6;
      if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;

      // 點擊外部關閉
      const onOutside = (e) => {
        if (!menu.contains(e.target) && e.target !== anchorEl) {
          menu.remove();
          document.removeEventListener("mousedown", onOutside, true);
        }
      };
      setTimeout(
        () => document.addEventListener("mousedown", onOutside, true),
        0,
      );
    }

    openApiModePanel() {
      if (document.getElementById("wh-api-panel")) return;

      let panelApiMode = this.getApiMode(); // 面板內的暫存狀態
      const hasToken = !!this._cachedToken;

      // Token 區段是否可操作：初始值取決於目前模式
      const tokenSectionEnabled = () => panelApiMode;

      const panel = document.createElement("div");
      panel.id = "wh-api-panel";

      // 攔截代碼摘要（供使用者驗證）
      const interceptorCode = `// 同時攔截 XHR 與 fetch，取得後立即還原（單次觸發）
// 方法一：XHR setRequestHeader（Discord 主要走此路徑）
const origSetHeader = unsafeWindow.XMLHttpRequest.prototype.setRequestHeader;
unsafeWindow.XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
  if (name.toLowerCase() === "authorization") {
    unsafeWindow.XMLHttpRequest.prototype.setRequestHeader = origSetHeader;
    onToken(value); // 僅傳遞給本腳本記憶體變數
  }
  return origSetHeader.apply(this, arguments);
};
// 方法二：fetch Authorization header（部分 API 呼叫）
const origFetch = unsafeWindow.fetch;
unsafeWindow.fetch = function(...args) {
  const token = args[1]?.headers?.Authorization || args[1]?.headers?.authorization;
  if (args[0]?.includes?.("discord.com/api") && token) {
    unsafeWindow.fetch = origFetch;
    onToken(token);
  }
  return origFetch.apply(this, args);
};
// Token 僅存於記憶體，頁面關閉即清除，不寫入任何儲存空間`;

      panel.innerHTML = `
        <div id="wh-api-backdrop"></div>
        <div id="wh-api-modal">

          <div id="wh-api-header">
            <span id="wh-api-title">${this.t("wm_api_panel_title")}</span>
            <button id="wh-api-close">✕</button>
          </div>

          <div id="wh-api-mode-row">
            <label class="wh-api-radio ${!panelApiMode ? "active" : ""}">
              <input type="radio" name="wh-mode" value="a" ${!panelApiMode ? "checked" : ""}>
              ${this.t("wm_api_mode_label_a")}
            </label>
            <label class="wh-api-radio ${panelApiMode ? "active" : ""}">
              <input type="radio" name="wh-mode" value="b" ${panelApiMode ? "checked" : ""}>
              ${this.t("wm_api_mode_label_b")}
            </label>
          </div>

          <div id="wh-api-warning">
            <div id="wh-api-warning-title">${this.t("wm_api_warning_title")}</div>
            <div id="wh-api-warning-body">${this.t("wm_api_warning_body")}</div>
            <details id="wh-api-code-details">
              <summary>${this.t("wm_api_view_code")}</summary>
              <pre id="wh-api-code">${interceptorCode}</pre>
            </details>
          </div>

          <div id="wh-api-token-section" class="${panelApiMode ? "" : "disabled"}">
            <div id="wh-api-token-status" class="${hasToken ? "ok" : ""}">
              ${
                hasToken
                  ? `${this.t("wm_api_token_status_ready")}：${this._cachedToken.substring(0, 8)}***`
                  : this.t("wm_api_token_status_none")
              }
            </div>
            <div id="wh-api-token-actions">
              <button id="wh-api-detect-btn" ${hasToken || !panelApiMode ? "disabled" : ""}>
                ${this.t("wm_api_detect_btn")}
              </button>
              <button id="wh-api-clear-token-btn" ${!hasToken || !panelApiMode ? "disabled" : ""}>
                ${this.t("wm_api_clear_token")}
              </button>
            </div>
            <div id="wh-api-detect-status">${hasToken ? "" : panelApiMode ? `<span style="color:#f0b232;font-weight:500;">${this.t("wm_api_detect_waiting")}</span>` : this.t("wm_api_plan_b_first")}</div>
          </div>

          <div id="wh-monitor-section" class="${panelApiMode ? "" : "disabled"}">
            <div id="wh-monitor-section-title">🔔 Wormhole message monitor</div>
            <div id="wh-monitor-row-main">
              <span id="wh-monitor-label">Detect new messages in wormhole channels</span>
              <label class="wh-monitor-toggle-wrap" title="${panelApiMode ? "" : "Enable API Mode (Plan B) first"}">
                <input type="checkbox" id="wh-monitor-toggle" ${this.getMonitorEnabled() && panelApiMode ? "checked" : ""} ${panelApiMode ? "" : "disabled"}>
                <span class="wh-monitor-slider"></span>
              </label>
            </div>
            <div id="wh-monitor-row-opts" class="${this.getMonitorEnabled() && panelApiMode ? "" : "hidden"}">
              <span class="wh-monitor-opt-label">Poll interval</span>
              <select id="wh-monitor-interval">
                <option value="15" ${this.getMonitorInterval() === 15 ? "selected" : ""}>15 seconds</option>
                <option value="30" ${this.getMonitorInterval() === 30 ? "selected" : ""}>30 seconds</option>
                <option value="60" ${this.getMonitorInterval() === 60 ? "selected" : ""}>60 seconds</option>
              </select>
              <span class="wh-monitor-opt-label" style="margin-left:12px;">Badge style</span>
              <select id="wh-monitor-badge-style">
                <option value="dot" ${this.getMonitorBadgeStyle() === "dot" ? "selected" : ""}>Dot</option>
                <option value="count" ${this.getMonitorBadgeStyle() === "count" ? "selected" : ""}>Count</option>
              </select>
            </div>
            <div id="wh-monitor-desc">Requires API Mode (Plan B) and a valid token. Polls all wormhole channels in the background and shows a badge when new messages arrive. Clicking a wormhole clears its badge.</div>
          </div>

          <div id="wh-api-footer">
            <button id="wh-api-reset-btn">${this.t("wm_api_reset_all")}</button>
            <div id="wh-api-footer-right">
              <button id="wh-api-cancel-btn">${this.t("wm_send_cancel")}</button>
              <button id="wh-api-apply-btn" ${!panelApiMode || hasToken ? "" : "disabled"}>
                ${panelApiMode ? this.t("wm_api_disable_btn") : this.t("wm_api_enable_btn")}
              </button>
            </div>
          </div>

        </div>`;

      if (!document.getElementById("wh-api-styles")) {
        const s = document.createElement("style");
        s.id = "wh-api-styles";
        s.textContent = `
          #wh-api-panel{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center}
          #wh-api-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px)}
          #wh-api-modal{position:relative;background:var(--dmt-bg-primary);border:1px solid rgba(88,101,242,.5);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.8);padding:20px 24px 18px;width:min(520px,92vw);display:flex;flex-direction:column;gap:16px;animation:wh-in .2s cubic-bezier(.19,1,.22,1)}
          @keyframes wh-in{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}
          #wh-api-header{display:flex;align-items:center;justify-content:space-between}
          #wh-api-title{color:var(--dmt-text-bright);font-size:15px;font-weight:700;letter-spacing:.01em}
          #wh-api-close{background:transparent;border:none;color:var(--dmt-text-muted);font-size:18px;cursor:pointer;padding:2px 6px;border-radius:4px;line-height:1}
          #wh-api-close:hover{color:#fff;background:rgba(255,255,255,.08)}
          #wh-api-mode-row{display:flex;flex-direction:column;gap:8px}
          .wh-api-radio{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;border:1.5px solid rgba(255,255,255,.08);color:var(--dmt-text-subtle);font-size:13px;cursor:pointer;transition:all .15s}
          .wh-api-radio.active{border-color:rgba(88,101,242,.6);background:rgba(88,101,242,.1);color:#fff}
          .wh-api-radio input{accent-color:var(--dmt-accent)}
          #wh-api-warning{background:rgba(237,66,69,.08);border:1px solid rgba(237,66,69,.3);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
          #wh-api-warning-title{color:var(--dmt-danger);font-size:13px;font-weight:700}
          #wh-api-warning-body{color:#c4c9ce;font-size:12px;line-height:1.6}
          #wh-api-code-details summary{color:var(--dmt-text-muted);font-size:11px;cursor:pointer;margin-top:6px}
          #wh-api-code{background:var(--dmt-bg-deep);color:var(--dmt-text-subtle);font-size:11px;padding:8px;border-radius:4px;overflow-x:auto;margin-top:6px;white-space:pre-wrap;word-break:break-all}
          #wh-api-token-section{display:flex;flex-direction:column;gap:8px;transition:opacity .2s}
          #wh-api-token-section.disabled{opacity:.35;pointer-events:none}
          #wh-api-token-status{font-size:12px;color:var(--dmt-text-muted);padding:8px 12px;background:var(--dmt-bg-deep);border-radius:6px;border:1px solid rgba(255,255,255,.06)}
          #wh-api-token-status.ok{color:#2dc770;border-color:rgba(45,199,112,.3)}
          #wh-api-token-actions{display:flex;gap:8px;flex-wrap:wrap}
          #wh-api-detect-btn{padding:7px 14px;border-radius:6px;background:rgba(88,101,242,.15);border:1px solid rgba(88,101,242,.4);color:#8a98f8;font-size:13px;cursor:pointer;transition:all .15s}
          #wh-api-detect-btn:hover:not(:disabled){background:rgba(88,101,242,.3);color:#fff}
          #wh-api-detect-btn:disabled{opacity:.4;cursor:not-allowed}
          #wh-api-clear-token-btn{padding:7px 14px;border-radius:6px;background:transparent;border:1px solid rgba(237,66,69,.35);color:var(--dmt-danger);font-size:13px;cursor:pointer;transition:all .15s}
          #wh-api-clear-token-btn:hover:not(:disabled){background:rgba(237,66,69,.1)}
          #wh-api-clear-token-btn:disabled{opacity:.25;cursor:not-allowed}
          #wh-api-detect-status{font-size:11px;color:var(--dmt-text-muted);min-height:16px}
          #wh-api-footer{display:flex;align-items:center;justify-content:space-between;padding-top:4px;border-top:1px solid rgba(255,255,255,.06)}
          #wh-api-reset-btn{background:transparent;border:none;color:#4e5058;font-size:12px;cursor:pointer;padding:4px 8px;border-radius:4px}
          #wh-api-reset-btn:hover{color:var(--dmt-danger);background:rgba(237,66,69,.08)}
          #wh-api-footer-right{display:flex;gap:8px}
          #wh-api-cancel-btn{padding:7px 16px;border-radius:6px;background:transparent;border:1px solid #4e5058;color:var(--dmt-text-bright);font-size:13px;cursor:pointer}
          #wh-api-cancel-btn:hover{background:rgba(255,255,255,.06)}
          #wh-api-apply-btn{padding:7px 18px;border-radius:6px;background:var(--dmt-accent);border:none;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s}
          #wh-api-apply-btn:hover:not(:disabled){filter:brightness(1.12)}
          #wh-api-apply-btn:disabled{background:#3c4270;color:var(--dmt-text-muted);cursor:not-allowed}
          #wh-monitor-section{display:flex;flex-direction:column;gap:8px;padding:12px 14px;background:rgba(88,101,242,.05);border:1px solid rgba(88,101,242,.2);border-radius:8px;transition:opacity .2s}
          #wh-monitor-section.disabled{opacity:.35;pointer-events:none}
          #wh-monitor-section-title{font-size:12px;font-weight:700;color:var(--dmt-text-muted);letter-spacing:.04em;text-transform:uppercase}
          #wh-monitor-row-main{display:flex;align-items:center;justify-content:space-between;gap:8px}
          #wh-monitor-label{font-size:13px;color:var(--dmt-text-bright)}
          .wh-monitor-toggle-wrap{position:relative;display:inline-block;width:36px;height:20px;flex-shrink:0}
          .wh-monitor-toggle-wrap input{opacity:0;width:0;height:0;position:absolute}
          .wh-monitor-slider{position:absolute;inset:0;background:rgba(255,255,255,.15);border-radius:20px;cursor:pointer;transition:background .2s}
          .wh-monitor-slider::before{content:"";position:absolute;width:14px;height:14px;left:3px;top:3px;background:#fff;border-radius:50%;transition:transform .2s}
          .wh-monitor-toggle-wrap input:checked + .wh-monitor-slider{background:var(--dmt-accent)}
          .wh-monitor-toggle-wrap input:checked + .wh-monitor-slider::before{transform:translateX(16px)}
          #wh-monitor-row-opts{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:4px}
          #wh-monitor-row-opts.hidden{display:none}
          .wh-monitor-opt-label{font-size:12px;color:var(--dmt-text-muted)}
          #wh-monitor-interval,#wh-monitor-badge-style{background:var(--dmt-bg-deep);border:1px solid rgba(255,255,255,.1);color:var(--dmt-text-bright);font-size:12px;padding:3px 8px;border-radius:5px;cursor:pointer}
          #wh-monitor-desc{font-size:11px;color:var(--dmt-text-muted);line-height:1.5}
        `;
        document.head.appendChild(s);
      }

      document.body.appendChild(panel);

      const closePanel = () => panel.remove();

      // ── 取得 UI 元件 ────────────────────────────────────────────────
      const tokenSection = panel.querySelector("#wh-api-token-section");
      const tokenStatus = panel.querySelector("#wh-api-token-status");
      const detectBtn = panel.querySelector("#wh-api-detect-btn");
      const clearTokenBtn = panel.querySelector("#wh-api-clear-token-btn");
      const detectStatus = panel.querySelector("#wh-api-detect-status");
      const applyBtn = panel.querySelector("#wh-api-apply-btn");

      // ── 更新 Token 區段 UI 的統一函數 ────────────────────────────────
      const refreshTokenUI = () => {
        const tok = this._cachedToken;
        tokenSection.className = panelApiMode ? "" : "disabled";
        tokenStatus.className = tok ? "ok" : "";
        tokenStatus.textContent = tok
          ? `${this.t("wm_api_token_status_ready")}：${tok.substring(0, 8)}***`
          : this.t("wm_api_token_status_none");
        detectBtn.disabled = !panelApiMode || !!tok;
        clearTokenBtn.disabled = !panelApiMode || !tok;
        applyBtn.disabled = panelApiMode && !tok;
        applyBtn.textContent = panelApiMode
          ? this.t("wm_api_enable_btn")
          : this.t("wm_api_disable_btn");
        if (!panelApiMode) {
          detectStatus.textContent = this.t("wm_api_plan_b_first");
          applyBtn.disabled = false; // A 模式可直接套用
        } else if (!tok) {
          detectStatus.innerHTML = `<span style="color:#f0b232;font-weight:500;">${this.t("wm_api_detect_waiting")}</span>`;
        } else {
          detectStatus.textContent = "";
        }
      };

      // ── 事件綁定 ─────────────────────────────────────────────────────
      panel.querySelector("#wh-api-backdrop").onclick = closePanel;
      panel.querySelector("#wh-api-close").onclick = closePanel;
      panel.querySelector("#wh-api-cancel-btn").onclick = closePanel;

      panel.querySelector("#wh-api-reset-btn").onclick = () => {
        closePanel();
        this.resetAllData();
      };

      // Radio 切換：互斥 + 自動啟動攔截器（選 B 時）
      panel.querySelectorAll('input[name="wh-mode"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          panelApiMode = radio.value === "b";
          panel
            .querySelectorAll(".wh-api-radio")
            .forEach((l) => l.classList.remove("active"));
          radio.closest(".wh-api-radio").classList.add("active");
          refreshTokenUI();

          // 選 B 且尚無 Token → 自動啟動攔截器（免手動點偵測）
          if (panelApiMode && !this._cachedToken) {
            this._startTokenInterceptor((token) => {
              this._cachedToken = token;
              refreshTokenUI();
            });
          }
        });
      });

      // 手動偵測按鈕（備用，自動攔截失敗時使用）
      detectBtn.onclick = () => {
        dmtConfirm(this.t("wm_api_detect_confirm")).then((ok) => {
          if (!ok) return;
          this._startTokenInterceptor((token) => {
            this._cachedToken = token;
            refreshTokenUI();
          });
        });
      };

      // 清除 Token 按鈕
      clearTokenBtn.onclick = () => {
        this._stopTokenInterceptor();
        this._cachedToken = null;
        refreshTokenUI();
      };

      // 套用按鈕
      applyBtn.onclick = () => {
        this.setApiMode(panelApiMode);
        this.showToast(
          panelApiMode
            ? this.t("wm_api_enabled_toast")
            : this.t("wm_api_disabled_toast"),
        );
        // 啟用 B 模式且無 Token → 立刻在背景啟動攔截器（不等到 overlay 開啟）
        if (panelApiMode && !this._cachedToken) {
          this._startTokenInterceptor((token) => {
            this._cachedToken = token;
            DEBUG && console.log("[WH API] Token pre-fetched after mode switch ✅");
          });
        } else if (!panelApiMode) {
          // 切回 A 模式 → 停止攔截器並清除 Token
          this._stopTokenInterceptor();
          this._cachedToken = null;
          // 同步停止 Monitor（A 模式無 Token 無法輪詢）
          this.stopMonitor();
        }
        closePanel();
      };

      // ── Monitor Row 事件綁定 ────────────────────────────────────────
      const monitorSection  = panel.querySelector("#wh-monitor-section");
      const monitorToggle   = panel.querySelector("#wh-monitor-toggle");
      const monitorRowOpts  = panel.querySelector("#wh-monitor-row-opts");
      const monitorInterval = panel.querySelector("#wh-monitor-interval");
      const monitorBadge    = panel.querySelector("#wh-monitor-badge-style");

      // Radio 切換時同步更新 Monitor Section 的 disabled 狀態
      const refreshMonitorSection = () => {
        monitorSection.className = panelApiMode ? "" : "disabled";
        if (!panelApiMode) {
          monitorToggle.checked = false;
          monitorRowOpts.classList.add("hidden");
        }
      };

      // 讓 refreshTokenUI 結束後也同步 Monitor section
      const origRefreshTokenUI = refreshTokenUI;
      // 重新綁定：在 radio change 後刷新 monitor section
      panel.querySelectorAll('input[name="wh-mode"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          refreshMonitorSection();
        });
      });

      monitorToggle.addEventListener("change", () => {
        const enabled = monitorToggle.checked;
        this.setMonitorEnabled(enabled);
        monitorRowOpts.classList.toggle("hidden", !enabled);
        if (enabled && this._cachedToken) {
          this.startMonitor();
        } else {
          this.stopMonitor();
        }
      });

      monitorInterval.addEventListener("change", () => {
        this.setMonitorInterval(parseInt(monitorInterval.value, 10));
        // 若已啟動，重啟以套用新間隔
        if (this.getMonitorEnabled() && this._cachedToken) {
          this.stopMonitor();
          this.startMonitor();
        }
      });

      monitorBadge.addEventListener("change", () => {
        this.setMonitorBadgeStyle(monitorBadge.value);
        // 立即重繪現有 badge（讓使用者即時預覽樣式）
        this._restoreBadges();
      });

      // 初始化：先刷新 UI 反映真實狀態，再決定是否啟動攔截器
      refreshTokenUI();
      if (panelApiMode && !this._cachedToken) {
        this._startTokenInterceptor((token) => {
          this._cachedToken = token;
          refreshTokenUI();
        });
      }
    }

    // ==========================================
    // Token 攔截器
    // Hook window.fetch，從 Authorization header 取得 Token
    // 取得後立即解除 hook，最小化影響範圍
    // ==========================================
    _startTokenInterceptor(onToken) {
      if (this._tokenWatcher) return; // 已在攔截中

      // ── 使用 unsafeWindow 存取頁面真實的 XHR 與 fetch（突破沙盒限制）──
      const uw = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
      const self = this;
      let stopped = false;

      // ── 統一 Token 處理（確保只觸發一次）────────────────────────────────
      const handleToken = (token) => {
        if (stopped) return;
        if (!token || token === "undefined" || token.startsWith("Bot ")) return;
        stopped = true;
        // 還原兩個攔截器
        uw.XMLHttpRequest.prototype.setRequestHeader = origXhrSetHeader;
        uw.fetch = origFetch;
        self._tokenWatcher = null;
        DEBUG && console.log(
          "[WH API] Token intercepted ✅ (length:",
          token.length,
          ")",
        );
        onToken(token);
      };

      // ── 先完整 snapshot，再統一掛鉤（避免兩次賦值之間的競態條件）────────
      const origXhrSetHeader = uw.XMLHttpRequest.prototype.setRequestHeader;
      const origFetch = uw.fetch;

      // ── 1. 攔截 XHR setRequestHeader（Discord 主要走 XHR）────────────────
      uw.XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        try {
          if (name.toLowerCase() === "authorization") {
            handleToken(value);
          }
        } catch (_) {}
        return origXhrSetHeader.apply(this, arguments);
      };

      // ── 2. 攔截 fetch（部分 API 呼叫走 fetch）────────────────────────────
      uw.fetch = function (...args) {
        try {
          const url =
            typeof args[0] === "string"
              ? args[0]
              : args[0] instanceof Request
                ? args[0].url
                : args[0]?.url || "";
          const headers = args[1]?.headers;
          if (url.includes("discord.com/api") && headers) {
            let token = null;
            // 在 unsafeWindow 的真實頁面環境中，Headers 就是頁面的 Headers
            if (typeof headers.get === "function") {
              token =
                headers.get("Authorization") || headers.get("authorization");
            } else if (typeof headers === "object") {
              token =
                headers["Authorization"] || headers["authorization"] || null;
            }
            if (token) handleToken(token);
          }
        } catch (_) {}
        return origFetch.apply(this, args);
      };

      // 停止函數：還原兩者
      this._tokenWatcher = () => {
        stopped = true;
        uw.XMLHttpRequest.prototype.setRequestHeader = origXhrSetHeader;
        uw.fetch = origFetch;
      };
      DEBUG && console.log(
        "[WH API] Token interceptor started (XHR + fetch via unsafeWindow)",
      );
    }

    // 解除 Token 攔截器（清理用）
    _stopTokenInterceptor() {
      if (this._tokenWatcher) {
        this._tokenWatcher();
        this._tokenWatcher = null;
        DEBUG && console.log("[WH API] Token interceptor stopped");
      }
    }

    // ==========================================
    // 傳送路由（方案 A / B 自動切換）
    // ==========================================
    openSendMessageOverlay(wormhole) {
      if (document.getElementById("wh-send-overlay")) return;

      const overlay = document.createElement("div");
      overlay.id = "wh-send-overlay";
      const ph = this.t("wm_send_placeholder").replace(
        "#{name}",
        wormhole.name,
      );

      // 彩蛋解鎖狀態：localStorage 曾設定過 wh_api_mode 才顯示切換按鈕
      const apiUnlocked = localStorage.getItem("wh_api_mode") !== null;
      let isApiMode = this.getApiMode();
      const hasToken = !!this._cachedToken;
      const needsToken = isApiMode && !hasToken;

      // B 模式但 Token 遺失（頁面重整後）→ 靜默啟動攔截器，不煩使用者
      // 攔截成功 → 移除警告；5秒未偵測到 → 才顯示警告提示使用者手動操作
      if (needsToken) {
        let tokenDetected = false;
        this._startTokenInterceptor((token) => {
          tokenDetected = true;
          this._cachedToken = token;
          const warn = document.getElementById("wh-send-token-warn");
          if (warn) {
            warn.style.transition = "opacity 0.4s";
            warn.style.opacity = "0";
            setTimeout(() => warn.remove(), 400);
          }
        });
        // 5 秒後仍未偵測到 → 才顯示警告
        setTimeout(() => {
          if (tokenDetected) return;
          const warn = document.getElementById("wh-send-token-warn");
          if (warn) {
            warn.style.transition = "opacity 0.4s";
            warn.style.opacity = "1";
          }
        }, 5000);
      }

      overlay.innerHTML = `
        <div id="wh-send-backdrop"></div>
        <div id="wh-send-modal" class="${isApiMode ? "mode-api" : "mode-nav"}">
          <div id="wh-send-header">
            <span id="wh-send-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5865f2" stroke-width="2.5" style="margin-right:6px;vertical-align:middle;flex-shrink:0"><path d="M14.12 3.88a8 8 0 0 1-3.68 15.69"/><path d="M18.84 6a10 10 0 0 0-14.72 13.84"/><path d="M9.88 20.12a8 8 0 0 1 3.68-15.69"/><path d="M5.16 18a10 10 0 0 0 14.72-13.84"/></svg>
              ${escHtml(wormhole.name)}
            </span>
            <button id="wh-send-close" aria-label="close">✕</button>
          </div>
          ${needsToken ? `<div id="wh-send-token-warn" style="opacity:0">${this.t("wm_send_token_warn")}</div>` : ""}
          <div id="wh-send-dropzone">
            <div id="wh-send-fields"></div>
            <button id="wh-send-field-add">${this.t("wm_send_field_add") || "+ Add field"}</button>
            <div id="wh-send-cool-note"></div>
            <div id="wh-send-paste-hint">${this.t("wm_send_paste_hint")}</div>
            <div id="wh-send-paste-preview"></div>
          </div>
          <hr id="wh-send-divider">
          <div id="wh-send-footer">
            <div id="wh-send-footer-left">
              ${
                apiUnlocked
                  ? `
              <button id="wh-send-mode-toggle" class="${isApiMode ? "is-api" : "is-nav"}">
                ${
                  isApiMode
                    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> ${this.t("wm_send_mode_api")}`
                    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg> ${this.t("wm_send_mode_nav")}`
                }
              </button>
              <span id="wh-send-mode-desc">${isApiMode ? this.t("wm_send_mode_desc_api") : this.t("wm_send_mode_desc_nav")}</span>
              `
                  : ""
              }
            </div>
            <div id="wh-send-actions">
              <button id="wh-send-cancel-btn">${this.t("wm_send_cancel")}</button>
              <button id="wh-send-submit-btn">${this.t("wm_send_btn")}</button>
            </div>
          </div>
          <div id="wh-send-bottom-row">
            <div id="wh-send-checkboxes">
              <label id="wh-send-autoclose-label">
                <input type="checkbox" id="wh-send-autoclose" ${GMStore.get("wh_send_autoclose", "true") !== "false" ? "checked" : ""}>
                <span>${this.t("wm_send_autoclose")}</span>
              </label>
              <label id="wh-send-goto-label" class="${GMStore.get("wh_send_autoclose", "true") !== "false" ? "cb-disabled" : ""}">
                <input type="checkbox" id="wh-send-goto" ${GMStore.get("wh_send_goto", "false") === "true" ? "checked" : ""} ${GMStore.get("wh_send_autoclose", "true") !== "false" ? "disabled" : ""}>
                <span>${this.t("wm_send_goto_channel")}</span>
              </label>
              <label id="wh-send-show-toast-label">
                <input type="checkbox" id="wh-send-show-toast" ${GMStore.get("wh_send_show_toast", "true") !== "false" ? "checked" : ""}>
                <span>${this.t("wm_send_show_toast")}</span>
              </label>
            </div>
            <span id="wh-send-status"></span>
          </div>
        </div>`;

      if (!document.getElementById("wh-send-styles")) {
        const s = document.createElement("style");
        s.id = "wh-send-styles";
        s.textContent = `
          #wh-send-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center}
          #wh-send-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(3px)}
          #wh-send-modal{position:relative;background:var(--dmt-bg-primary);border:1px solid rgba(88,101,242,.35);border-radius:10px;box-shadow:0 16px 48px rgba(0,0,0,.7);padding:18px 20px 14px;width:min(560px,92vw);display:flex;flex-direction:column;gap:12px;animation:wh-in .18s cubic-bezier(.19,1,.22,1)}
          @keyframes wh-in{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
          #wh-send-header{display:flex;align-items:center;justify-content:space-between}
          #wh-send-title{color:var(--dmt-text-bright);font-size:14px;font-weight:600;display:flex;align-items:center;flex:1}
          #wh-send-close{background:transparent;border:none;color:var(--dmt-text-muted);font-size:18px;cursor:pointer;padding:2px 6px;border-radius:4px;line-height:1}
          #wh-send-close:hover{color:#fff;background:rgba(255,255,255,.08)}
          #wh-send-token-warn{font-size:12px;color:#f0b232;padding:6px 10px;background:rgba(240,178,50,.08);border-radius:6px;border:1px solid rgba(240,178,50,.2)}
          #wh-send-dropzone{position:relative;display:flex;flex-direction:column;gap:6px}
          #wh-send-input{width:100%;box-sizing:border-box;background:var(--dmt-bg-deep);color:var(--dmt-text-bright);border:1.5px solid rgba(88,101,242,.25);border-radius:6px;padding:10px 12px;font-size:14px;line-height:1.5;resize:vertical;min-height:72px;max-height:220px;outline:none;font-family:inherit;transition:border-color .15s}
          #wh-send-input:focus{border-color:rgba(88,101,242,.7)}
          #wh-send-input:disabled{opacity:.5;cursor:not-allowed}
          #wh-send-paste-hint{font-size:10px;color:#4e5058;text-align:right}
          #wh-send-paste-preview{display:flex;flex-wrap:wrap;gap:6px}
          .wh-paste-thumb{position:relative;width:64px;height:64px;border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,.1)}
          .wh-paste-thumb img{width:100%;height:100%;object-fit:cover}
          .wh-paste-thumb-rm{position:absolute;top:1px;right:1px;background:rgba(0,0,0,.7);color:#fff;border:none;border-radius:3px;font-size:10px;cursor:pointer;padding:0 3px;line-height:16px}
          #wh-send-divider{border:none;border-top:1px solid rgba(255,255,255,.06);margin:0}
          #wh-send-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:2px}
          #wh-send-footer-left{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
          #wh-send-actions{display:flex;gap:8px;flex-shrink:0}
          /* ── 模式切換按鈕：帶外框，明確可點擊 ── */
          #wh-send-mode-toggle{
            display:inline-flex;align-items:center;gap:5px;
            padding:4px 10px;border-radius:5px;cursor:pointer;
            font-size:12px;font-weight:500;
            background:rgba(255,255,255,.04);
            border:1px solid rgba(255,255,255,.12);
            color:var(--dmt-text-subtle);
            transition:background .15s,border-color .15s,color .15s;
            white-space:nowrap;flex-shrink:0;
          }
          #wh-send-mode-toggle svg{flex-shrink:0;opacity:.75;transition:stroke .15s}
          #wh-send-mode-toggle:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.22);color:#fff}
          #wh-send-mode-toggle.is-api{color:#2dc770;border-color:rgba(35,165,90,.45);background:rgba(35,165,90,.08)}
          #wh-send-mode-toggle.is-api svg{stroke:#2dc770;opacity:1}
          #wh-send-mode-toggle.is-api:hover{background:rgba(35,165,90,.15);border-color:rgba(35,165,90,.7)}
          #wh-send-mode-desc{font-size:11px;color:#4e5058;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          #wh-send-bottom-row{display:flex;align-items:center;justify-content:space-between;min-height:18px;padding:0 2px}
          #wh-send-checkboxes{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
          #wh-send-autoclose-label,#wh-send-goto-label,#wh-send-show-toast-label{display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;font-size:12px;color:var(--dmt-text-muted);transition:color .15s,opacity .15s}
          #wh-send-autoclose-label:hover,#wh-send-goto-label:hover,#wh-send-show-toast-label:hover{color:var(--dmt-text-subtle)}
          #wh-send-autoclose-label input,#wh-send-goto-label input,#wh-send-show-toast-label input{accent-color:var(--dmt-accent);cursor:pointer;width:13px;height:13px}
          #wh-send-goto-label.cb-disabled{opacity:.35;cursor:not-allowed;pointer-events:none}
          #wh-send-status{font-size:12px;color:var(--dmt-text-muted);text-align:right}
          #wh-send-status.err{color:var(--dmt-danger)}
          #wh-send-status.ok{color:#23a55a}
          #wh-send-cancel-btn{padding:7px 16px;border-radius:3px;background:transparent;border:none;color:var(--dmt-text-bright);font-size:14px;cursor:pointer;transition:background .1s}
          #wh-send-cancel-btn:hover{background:rgba(255,255,255,.06)}
          #wh-send-submit-btn{padding:7px 18px;border-radius:3px;background:var(--dmt-accent);border:none;color:#fff;font-size:14px;font-weight:500;cursor:pointer;transition:background .15s}
          #wh-send-submit-btn:hover:not(:disabled){filter:brightness(1.12)}
          #wh-send-submit-btn:disabled{background:#3c4270;color:var(--dmt-text-muted);cursor:not-allowed}

          /* ── overlay 退場動畫 ── */
          @keyframes wh-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(6px) scale(.97)}}
          #wh-send-overlay.wh-leaving #wh-send-modal{animation:wh-out .15s ease-in forwards}
          #wh-send-overlay.wh-leaving #wh-send-backdrop{animation:wh-out .15s ease-in forwards}

          /* ── 多段訊息欄位列表 ── */
          #wh-send-fields{display:flex;flex-direction:column;gap:8px}
          .wh-field-row{display:flex;gap:6px;align-items:flex-start}
          .wh-field-num{font-size:10px;color:rgba(185,187,190,.4);min-width:14px;padding-top:12px;flex-shrink:0;text-align:right}
          .wh-field-textarea{flex:1;box-sizing:border-box;background:var(--dmt-bg-deep);color:var(--dmt-text-bright);border:1.5px solid rgba(88,101,242,.25);border-radius:6px;padding:8px 10px;font-size:14px;line-height:1.5;resize:vertical;min-height:60px;max-height:160px;outline:none;font-family:inherit;transition:border-color .15s}
          .wh-field-textarea:focus{border-color:rgba(88,101,242,.7)}
          .wh-field-textarea:disabled{opacity:.5;cursor:not-allowed}
          .wh-field-del{background:transparent;border:none;color:rgba(237,66,69,.5);cursor:pointer;font-size:14px;padding:8px 2px;flex-shrink:0;transition:color .12s;line-height:1}
          .wh-field-del:hover{color:rgba(237,66,69,.9)}
          #wh-send-field-add{align-self:flex-start;font-size:11px;font-weight:600;padding:3px 10px;border-radius:5px;background:rgba(88,101,242,.1);border:1px solid rgba(88,101,242,.25);color:rgba(88,101,242,.8);cursor:pointer;transition:background .12s,color .12s;margin-top:2px}
          #wh-send-field-add:hover{background:rgba(88,101,242,.22);color:#c0c5f7}
          #wh-send-field-add:disabled{opacity:.35;cursor:not-allowed}
          #wh-send-cool-note{font-size:10px;color:rgba(240,178,50,.75);min-height:14px}

        `;
        document.head.appendChild(s);
      }

      document.body.appendChild(overlay);

      // ── 多段欄位管理 ────────────────────────────────────────────────
      const fieldsEl   = overlay.querySelector("#wh-send-fields");
      const addFieldBtn = overlay.querySelector("#wh-send-field-add");
      const coolNote   = overlay.querySelector("#wh-send-cool-note");
      const status     = overlay.querySelector("#wh-send-status");
      const submitBtn  = overlay.querySelector("#wh-send-submit-btn");
      const modeDesc   = overlay.querySelector("#wh-send-mode-desc");

      const MAX_FIELDS = 5;
      // 發送完畢後的冷卻時間（ms）：1-2 欄無冷卻 / 3-4 欄 5s / 5 欄 8s
      const POST_COOL_MAP = { 1: 0, 2: 0, 3: 5000, 4: 5000, 5: 8000 };
      // 欄位間的偽人類打字間隔範圍（ms）
      const SEND_JITTER_MIN = 300;
      const SEND_JITTER_MAX = 600;

      function getFieldCount() {
        return fieldsEl.querySelectorAll(".wh-field-textarea").length;
      }

      function updateCoolNote() {
        const n = getFieldCount();
        if (n <= 2) { coolNote.textContent = ""; return; }
        const s = POST_COOL_MAP[Math.min(n, 5)] / 1000;
        coolNote.textContent = (this.t("wm_send_cool_warn") || "Cool-down: {s}s between messages")
          .replace("{s}", s.toFixed(0));
      }

      function addField(placeholder, autofocus = false) {
        const n = getFieldCount() + 1;
        const row = document.createElement("div");
        row.className = "wh-field-row";
        const numEl = document.createElement("span");
        numEl.className = "wh-field-num";
        numEl.textContent = n;
        const ta = document.createElement("textarea");
        ta.className   = "wh-field-textarea";
        ta.placeholder = placeholder;
        ta.rows        = 2;
        ta.maxLength   = 2000;
        const delBtn = document.createElement("button");
        delBtn.className   = "wh-field-del";
        delBtn.title       = this.t("wm_send_field_del") || "Remove";
        delBtn.textContent = "✕";
        delBtn.style.display = n <= 2 ? "none" : ""; // 前兩格不顯示刪除鈕
        delBtn.addEventListener("click", () => {
          row.remove();
          // 重新編號
          fieldsEl.querySelectorAll(".wh-field-num").forEach((el, i) => { el.textContent = i + 1; });
          // 僅剩 2 格時隱藏所有刪除鈕
          const rows = fieldsEl.querySelectorAll(".wh-field-row");
          rows.forEach((r, i) => {
            const btn = r.querySelector(".wh-field-del");
            if (btn) btn.style.display = rows.length <= 2 ? "none" : "";
          });
          addFieldBtn.disabled = getFieldCount() >= MAX_FIELDS;
          updateCoolNote.call(this);
        });
        row.appendChild(numEl);
        row.appendChild(ta);
        row.appendChild(delBtn);
        fieldsEl.appendChild(row);
        addFieldBtn.disabled = getFieldCount() >= MAX_FIELDS;
        updateCoolNote.call(this);
        if (autofocus) requestAnimationFrame(() => ta.focus());
        ta.addEventListener("keydown", (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            submitBtn.click();
          }
        });
        return ta;
      }

      // 預設建立兩個欄位
      addField.call(this, ph, true);
      addField.call(this, this.t("wm_send_placeholder")?.replace("#{name}", "") || "Field 2…");

      addFieldBtn.addEventListener("click", () => {
        if (getFieldCount() >= MAX_FIELDS) return;
        addField.call(this, "", true);
        // 讓所有刪除鈕可見（超過 2 格）
        fieldsEl.querySelectorAll(".wh-field-del").forEach(b => { b.style.display = ""; });
      });

      // ── 關閉（含退場動畫）────────────────────────────────────────────
      const setStatus = (msg, cls = "") => {
        status.textContent = msg;
        status.className = cls;
      };
      const closeOverlay = (instant = false) => {
        if (instant) { overlay.remove(); document.removeEventListener("keydown", escHandler); return; }
        overlay.classList.add("wh-leaving");
        overlay.addEventListener("animationend", () => {
          overlay.remove();
          document.removeEventListener("keydown", escHandler);
        }, { once: true });
        // 防呆：160ms 後強制移除
        setTimeout(() => { if (overlay.isConnected) { overlay.remove(); document.removeEventListener("keydown", escHandler); } }, 160);
      };
      const lock = (on) => {
        overlay.querySelectorAll(".wh-field-textarea, #wh-send-submit-btn, #wh-send-cancel-btn, #wh-send-close, #wh-send-field-add")
          .forEach(el => { el.disabled = on; });
      };
      const escHandler = (e) => { if (e.key === "Escape") closeOverlay(); };

      overlay.querySelector("#wh-send-backdrop").onclick = () => closeOverlay();
      overlay.querySelector("#wh-send-close").onclick    = () => closeOverlay();
      overlay.querySelector("#wh-send-cancel-btn").onclick = () => closeOverlay();
      document.addEventListener("keydown", escHandler);

      // ── 黑金切換按鈕邏輯 ───────────────────────────────────────────
      const toggleBtn = overlay.querySelector("#wh-send-mode-toggle");
      if (toggleBtn) {
        const descEl = overlay.querySelector("#wh-send-mode-desc");
        toggleBtn.onclick = () => {
          isApiMode = !isApiMode;
          this.setApiMode(isApiMode);
          toggleBtn.className = isApiMode ? "is-api" : "is-nav";
          // 重繪按鈕內容（含 SVG icon）
          toggleBtn.innerHTML = isApiMode
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> ${this.t("wm_send_mode_api")}`
            : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg> ${this.t("wm_send_mode_nav")}`;
          if (descEl)
            descEl.textContent = isApiMode
              ? this.t("wm_send_mode_desc_api")
              : this.t("wm_send_mode_desc_nav");
        };
      }

      // ── Ctrl+V 貼上圖片（委派到 overlay，讓任何 textarea 都能觸發）──
      const preview = overlay.querySelector("#wh-send-paste-preview");
      let pendingFiles = [];
      const addThumb = (file) => {
        const idx = pendingFiles.length;
        pendingFiles.push(file);
        const wrap = document.createElement("div");
        wrap.className = "wh-paste-thumb";
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        const rm = document.createElement("button");
        rm.className = "wh-paste-thumb-rm";
        rm.textContent = "✕";
        rm.onclick = () => { pendingFiles.splice(idx, 1); wrap.remove(); URL.revokeObjectURL(img.src); };
        wrap.appendChild(img);
        wrap.appendChild(rm);
        preview.appendChild(wrap);
      };
      overlay.addEventListener("paste", (e) => {
        if (!e.target.classList.contains("wh-field-textarea")) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        let hasImage = false;
        for (const item of items) {
          if (item.type.startsWith("image/")) { hasImage = true; addThumb(item.getAsFile()); }
        }
        if (hasImage) e.preventDefault();
      });

      // ── checkbox 互斥邏輯 ────────────────────────────────────────────
      const autocloseEl  = overlay.querySelector("#wh-send-autoclose");
      const gotoEl       = overlay.querySelector("#wh-send-goto");
      const gotoLabel    = overlay.querySelector("#wh-send-goto-label");
      const showToastEl  = overlay.querySelector("#wh-send-show-toast");
      const syncMutex = () => {
        const ac = autocloseEl.checked;
        gotoLabel.classList.toggle("cb-disabled", ac);
        gotoEl.disabled = ac;
        if (ac) gotoEl.checked = false;
      };
      autocloseEl.addEventListener("change", () => { GMStore.set("wh_send_autoclose", String(autocloseEl.checked)); syncMutex(); });
      gotoEl.addEventListener("change",      () => { GMStore.set("wh_send_goto",       String(gotoEl.checked)); });
      showToastEl.addEventListener("change", () => { GMStore.set("wh_send_show_toast", String(showToastEl.checked)); });

      // ── 多段分送 submit ──────────────────────────────────────────────
      submitBtn.onclick = async () => {
        // 收集所有非空欄位文字
        const texts = [...fieldsEl.querySelectorAll(".wh-field-textarea")]
          .map(ta => ta.value.trim())
          .filter(Boolean);
        const hasImg = pendingFiles.length > 0;

        if (!texts.length && !hasImg) {
          setStatus(this.t("wm_send_empty"), "err");
          fieldsEl.querySelector(".wh-field-textarea")?.focus();
          return;
        }

        lock(true);
        try {
          // Token 等待
          if (this.getApiMode() && !this._cachedToken && this._tokenWatcher) {
            setStatus(this.t("wm_send_waiting_token"));
            await new Promise((resolve) => {
              const deadline = Date.now() + 4000;
              const poll = setInterval(() => {
                if (this._cachedToken || Date.now() >= deadline) { clearInterval(poll); resolve(); }
              }, 100);
            });
          }

          const useApi   = this.getApiMode() && !!this._cachedToken;
          const total    = texts.length || 1;
          const postCool = POST_COOL_MAP[Math.min(total, 5)] ?? 0;
          const jitter   = () => new Promise(r =>
            setTimeout(r, SEND_JITTER_MIN + Math.random() * (SEND_JITTER_MAX - SEND_JITTER_MIN))
          );

          // ── 按下即關閉 overlay，改由藥丸顯示進度 ────────────────────
          closeOverlay(true); // instant，不播退場動畫（避免搶進度藥丸的注意力）

          // 建立進度藥丸（複用 _showSendToast 樣式基礎，追加進度模式）
          const existing = document.getElementById("wh-send-result-toast");
          if (existing) existing.remove();
          const pill = document.createElement("div");
          pill.id = "wh-send-result-toast";
          pill.style.cssText = `
            position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(8px);
            background:#2b2d31; color:#f2f3f5; padding:10px 20px; border-radius:20px;
            font-size:13px; font-weight:500; box-shadow:0 8px 24px rgba(0,0,0,0.45);
            z-index:2147483649; border:1px solid rgba(88,101,242,0.4);
            user-select:none; text-align:center; min-width:160px;
            opacity:0; transition:opacity 0.18s, transform 0.18s, border-color 0.2s, background 0.2s;
            pointer-events:auto; white-space:nowrap;
          `;
          document.body.appendChild(pill);
          requestAnimationFrame(() => {
            pill.style.opacity = "1";
            pill.style.transform = "translateX(-50%) translateY(0)";
          });

          const self = this;
          const hint = self.t("wm_send_toast_hint") || "Click to go to channel";

          // setPill：上行文字 + 固定下行 hint；始終可點擊跳轉
          const setPill = (topText, state = "progress") => {
            pill.innerHTML = `<div style="font-weight:500">${topText}</div><div style="font-size:11px;margin-top:3px;opacity:0.65">${hint}</div>`;
            if (state === "ok") {
              pill.style.borderColor = "rgba(35,165,90,.55)";
              pill.style.color = "#23a55a";
              pill.onmouseenter = () => { pill.style.boxShadow = "0 8px 28px rgba(35,165,90,.25)"; pill.style.borderColor = "rgba(35,165,90,.85)"; };
              pill.onmouseleave = () => { pill.style.boxShadow = "0 8px 24px rgba(0,0,0,0.45)"; pill.style.borderColor = "rgba(35,165,90,.55)"; };
            } else if (state === "err") {
              pill.style.borderColor = "rgba(237,66,69,.55)";
              pill.style.color = "#ed4245";
            } else if (state === "cool") {
              pill.style.borderColor = "rgba(240,178,50,.4)";
              pill.style.color = "#f0b232";
            } else {
              pill.style.borderColor = "rgba(88,101,242,.4)";
              pill.style.color = "#dbdee1";
            }
          };

          // 藥丸從一開始就可點擊跳轉（不等完成）
          pill.style.cursor = "pointer";
          pill.onclick = () => self.navigateToChannel(wormhole.url);
          pill.onmouseenter = () => { pill.style.boxShadow = "0 8px 28px rgba(88,101,242,.2)"; };
          pill.onmouseleave = () => { pill.style.boxShadow = "0 8px 24px rgba(0,0,0,0.45)"; };

          const dismissPill = (delay = 3000) => {
            setTimeout(() => {
              pill.style.opacity = "0";
              pill.style.transform = "translateX(-50%) translateY(8px)";
              setTimeout(() => pill.remove(), 220);
            }, delay);
          };

          // ── 分段逐一發送 ─────────────────────────────────────────────
          let sendOk = true;
          for (let i = 0; i < total; i++) {
            const segText = texts[i] ?? "";
            const isLast  = i === total - 1;
            const files   = isLast && hasImg ? pendingFiles : [];

            setPill(
              (self.t("wm_send_sending_n") || "Sending {n}/{total}…")
                .replace("{n}", i + 1).replace("{total}", total)
            );

            const ok = useApi
              ? await self._sendViaApi(wormhole, segText, () => {}, files)
              : await self._sendViaWormhole(wormhole, segText, () => {}, files);

            if (!ok) {
              pill.style.cursor = "default";
              pill.onclick = null;
              setPill(useApi ? self.t("wm_api_send_fail") : self.t("wm_send_fail"), "err");
              dismissPill(3500);
              sendOk = false;
              break;
            }

            if (!isLast) await jitter();
          }

          if (!sendOk) return;

          pendingFiles = [];

          // ── 發送後冷卻倒數（藥丸持續顯示，仍可點擊跳轉）────────────
          if (postCool > 0) {
            let remaining = Math.ceil(postCool / 1000);
            const coolLabel = (s) =>
              (self.t("wm_send_cool_warn") || "Cool-down: {s}s").replace("{s}", s);
            setPill(coolLabel(remaining), "cool");

            const coolTick = setInterval(() => {
              remaining--;
              if (remaining <= 0) {
                clearInterval(coolTick);
                setPill(self.t("wm_send_toast_title").replace("#{name}", wormhole.name), "ok");
                dismissPill(3000);
              } else {
                setPill(coolLabel(remaining), "cool");
              }
            }, 1000);
          } else {
            setPill(self.t("wm_send_toast_title").replace("#{name}", wormhole.name), "ok");
            dismissPill(3000);
          }
        } catch (err) {
          console.error("[WH Send]", err);
          setStatus(this.t("wm_send_fail"), "err");
          lock(false);
        }
      };
    }

    // ==========================================
    // 圖片傳送（方案 A 內部輔助）
    // 導航到目標頻道 → 把圖片 paste 到 slateEl → 視情況插入文字 → Enter 送出
    // 文字和圖片合為一次操作，避免 Discord 拆成兩則訊息
    // ==========================================
    async _sendImagesViaA(wormhole, files, text, setStatus) {
      const originUrl = window.location.href;
      const targetPath = (() => {
        try {
          return new URL(wormhole.url).pathname;
        } catch (e) {
          DEBUG && console.warn("[_sendImagesViaA] wormhole.url 解析失敗", wormhole.url, e);
          return null;
        }
      })();
      const alreadyHere = targetPath && window.location.pathname === targetPath;

      if (!alreadyHere) {
        this.navigateToChannel(wormhole.url);
        setStatus(this.t("wm_send_waiting"));
        const ready = await this._waitForSlateEditor(8000);
        if (!ready) {
          setStatus(this.t("wm_send_channel_fail"), "err");
          return false;
        }
      }

      const result = this._getSlateEditor();
      if (!result) {
        setStatus(this.t("wm_send_editor_missing"), "err");
        return false;
      }
      const { editor, slateEl } = result;

      // 1. 先清空編輯器
      editor.children = [{ type: "line", children: [{ text: "" }] }];
      editor.onChange();
      await this._tick(60);

      // 2. 若有文字，先注入（Discord 會把文字附在圖片訊息上）
      if (text) {
        slateEl.focus();
        if (!editor.selection) {
          editor.selection = {
            anchor: { path: [0, 0], offset: 0 },
            focus: { path: [0, 0], offset: 0 },
          };
        }
        editor.insertText(text);
        await this._tick(80);
      }

      setStatus(this.t("wm_send_uploading", { n: files.length }));

      // 3. 把所有 File paste 到 slateEl（Discord 的 paste handler 攔截並上傳）
      const dt = new DataTransfer();
      for (const file of files) dt.items.add(file);

      slateEl.focus();
      await this._tick(60);
      slateEl.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }),
      );

      // 4. 等 Discord 接手上傳確認對話框（若有）或直接掛載預覽
      await this._tick(600);

      // 5. 按 Enter 送出（Discord 有圖片時按 Enter = 確認上傳並送出）
      slateEl.focus();
      await this._tick(60);
      slateEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
          composed: true,
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
        }),
      );
      DEBUG && console.log("[WH Send] Image + text dispatched via paste+Enter");

      if (!alreadyHere) {
        await this._waitForEditorClear(2000);
        setStatus(this.t("wm_send_returning"));
        this.navigateToChannel(originUrl);
      }
      return true;
    }

    // ==========================================
    // 方案 B：REST API 傳送
    // 純文字 → JSON POST
    // 含圖片 → multipart/form-data（files[] + payload_json）
    // 支援 rate limit (429) 自動等待重試一次
    // ==========================================
    async _sendViaApi(wormhole, text, setStatus, files = []) {
      // ── 1. 從蟲洞 URL 解析 channelId ────────────────────────────────
      let channelId = null;
      try {
        const pathname = new URL(wormhole.url).pathname;
        const m = pathname.match(/\/channels\/[^/]+\/(\d+)/);
        if (m) channelId = m[1];
      } catch (_) {}

      if (!channelId) {
        console.error(
          "[WH API] Cannot parse channelId from URL:",
          wormhole.url,
        );
        setStatus("❌ 無法解析頻道 ID，請確認蟲洞連結格式", "err");
        return false;
      }

      if (!this._cachedToken) {
        console.error("[WH API] No token available");
        setStatus("❌ Token 不存在，請重新偵測", "err");
        return false;
      }

      const hasFiles = files && files.length > 0;

      // ── 2. 組裝請求 ──────────────────────────────────────────────────
      const buildRequest = async () => {
        if (!hasFiles) {
          // 純文字：JSON POST
          return {
            headers: {
              "Content-Type": "application/json",
              Authorization: this._cachedToken,
            },
            data: JSON.stringify({
              content: text,
              nonce: String(Math.floor(Math.random() * 1e13)),
              tts: false,
            }),
          };
        }

        // 含圖片：multipart/form-data
        // payload_json 放訊息內容，files[N] 放圖片 binary
        const formData = new FormData();
        const attachments = files.map((f, i) => ({
          id: String(i),
          filename: f.name || `image_${i}.png`,
        }));
        formData.append(
          "payload_json",
          JSON.stringify({
            content: text || "",
            nonce: String(Math.floor(Math.random() * 1e13)),
            tts: false,
            attachments,
          }),
        );
        for (let i = 0; i < files.length; i++) {
          formData.append(
            `files[${i}]`,
            files[i],
            files[i].name || `image_${i}.png`,
          );
        }

        // FormData → ArrayBuffer（GM_xmlhttpRequest 需要 binary data）
        // 用 fetch 轉換（本地 blob，不經網路）
        const blob = await new Promise((resolve) => {
          const req = new Request("", { method: "POST", body: formData });
          req.blob ? req.blob().then(resolve) : resolve(null);
        }).catch(() => null);

        // 直接傳 FormData（GM_xmlhttpRequest 支援）
        return {
          headers: {
            Authorization: this._cachedToken,
            // 不設 Content-Type，讓瀏覽器自動帶 boundary
          },
          data: formData,
        };
      };

      // ── 3. 發送 ──────────────────────────────────────────────────────
      const reqOpts = await buildRequest();
      const doRequest = () =>
        new Promise((resolve) => {
          GM_xmlhttpRequest({
            method: "POST",
            url: `https://discord.com/api/v10/channels/${channelId}/messages`,
            headers: reqOpts.headers,
            data: reqOpts.data,
            timeout: 30000,
            onload: (res) => resolve(res),
            onerror: (err) => resolve({ status: 0, _err: err }),
            ontimeout: () => resolve({ status: 0, _err: "timeout" }),
          });
        });

      setStatus(hasFiles ? "📡 Uploading & sending..." : "📡 Sending...");
      let res = await doRequest();

      // ── 4. Rate Limit 處理 ───────────────────────────────────────────
      if (res.status === 429) {
        let retryAfterMs = 1000;
        try {
          const body = JSON.parse(res.responseText);
          retryAfterMs = Math.ceil((body.retry_after || 1) * 1000) + 100;
        } catch (_) {}
        console.warn(`[WH API] Rate limited. Waiting ${retryAfterMs}ms...`);
        setStatus(`⏳ Rate limited, retrying in ${Math.ceil(retryAfterMs / 1000)}s...`);
        await new Promise((r) => setTimeout(r, retryAfterMs));
        res = await doRequest();
      }

      // ── 5. 結果 ──────────────────────────────────────────────────────
      if (res.status === 200 || res.status === 201) {
        DEBUG &&
          console.log(
            `[WH API] Message sent ✅ → channel ${channelId}${hasFiles ? ` (+${files.length} file(s))` : ""}`,
          );
        return true;
      }

      let detail = `HTTP ${res.status}`;
      try {
        const body = JSON.parse(res.responseText);
        const codeMap = {
          10003: "Unknown Channel",
          50001: "Missing Access",
          50013: "Missing Permissions",
          50035: "Invalid Form Body",
          40002: "Verification Required",
        };
        const code = body.code;
        detail = codeMap[code]
          ? `${codeMap[code]} (${code})`
          : `${body.message || ""} (${code || res.status})`;
        console.error("[WH API] Send failed:", body);
      } catch (_) {
        if (res._err) console.error("[WH API] Network error:", res._err);
      }

      setStatus(`❌ ${t("wh_send_fail", { name: detail })}`, "err");
      return false;
    }

    // ==========================================
    // 方案 A：跳頁注入 (v5 診斷驗證版)
    // 含圖片時委派給 _sendImagesViaA（圖文同批）
    // ==========================================
    async _sendViaWormhole(wormhole, text, setStatus, files = []) {
      // 有圖片 → 走圖文合併路徑
      if (files.length > 0) {
        return this._sendImagesViaA(wormhole, files, text, setStatus);
      }

      // 純文字路徑（原有邏輯不動）
      const originUrl = window.location.href;
      const targetPath = (() => {
        try {
          return new URL(wormhole.url).pathname;
        } catch (e) {
          DEBUG && console.warn("[sendTextViaA] wormhole.url 解析失敗", wormhole.url, e);
          return null;
        }
      })();
      const alreadyHere = targetPath && window.location.pathname === targetPath;

      if (!alreadyHere) {
        this.navigateToChannel(wormhole.url);
        setStatus(this.t("wm_send_waiting"));
        const ready = await this._waitForSlateEditor(8000);
        if (!ready) {
          console.warn("[WH Send] Editor not ready after 8s");
          this.navigateToChannel(originUrl);
          return false;
        }
      }

      setStatus(this.t("wm_send_injecting"));
      const sent = await this._injectAndSend(text);

      if (!alreadyHere) {
        await this._waitForEditorClear(1500);
        setStatus(this.t("wm_send_returning"));
        this.navigateToChannel(originUrl);
      }

      return sent;
    }

    _waitForSlateEditor(timeout = 8000) {
      return new Promise((resolve) => {
        const deadline = Date.now() + timeout;
        const timer = setInterval(() => {
          if (this._getSlateEditor()) {
            clearInterval(timer);
            resolve(true);
            return;
          }
          if (Date.now() >= deadline) {
            clearInterval(timer);
            resolve(false);
          }
        }, 80);
      });
    }

    _waitForEditorClear(timeout = 1500) {
      return new Promise((resolve) => {
        const deadline = Date.now() + timeout;
        const timer = setInterval(() => {
          const ed = this._getSlateEditor();
          const isEmpty =
            !ed || ed.editor?.children?.[0]?.children?.[0]?.text === "";
          if (isEmpty || Date.now() >= deadline) {
            clearInterval(timer);
            resolve();
          }
        }, 80);
      });
    }

    _getSlateEditor() {
      const sl = document.querySelector('[data-slate-editor="true"]');
      if (!sl) return null;
      const fk = Object.keys(sl).find((k) => k.startsWith("__reactFiber"));
      if (!fk) return null;
      let fiber = sl[fk];
      for (let i = 0; i < 15 && fiber; i++) {
        const ed = fiber.memoizedProps?.editor;
        if (
          ed &&
          typeof ed.insertText === "function" &&
          typeof ed.onChange === "function"
        ) {
          return { editor: ed, slateEl: sl };
        }
        fiber = fiber.return;
      }
      return null;
    }

    async _injectAndSend(text) {
      const result = this._getSlateEditor();
      if (!result) {
        console.error("[WH Send] Cannot get Slate editor");
        return false;
      }
      const { editor, slateEl } = result;
      try {
        editor.children = [{ type: "line", children: [{ text: "" }] }];
        editor.onChange();
        await this._tick(80);

        slateEl.focus();
        if (!editor.selection) {
          editor.selection = {
            anchor: { path: [0, 0], offset: 0 },
            focus: { path: [0, 0], offset: 0 },
          };
        }
        editor.insertText(text);
        await this._tick(100);

        const inserted = editor.children?.[0]?.children?.[0]?.text || "";
        if (!inserted) {
          console.error("[WH Send] insertText failed");
          return false;
        }

        slateEl.focus();
        await this._tick(60);
        slateEl.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
          }),
        );
        DEBUG && console.log("[WH Send] Enter dispatched");
        return true;
      } catch (err) {
        console.error("[WH Send] _injectAndSend error:", err);
        return false;
      }
    }

    _tick(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    /**
     * 智慧定位浮動選單：
     * 下方空間不足時自動改往上展開，並做左右邊界鉗制。
     */
    _positionMenu(menu, triggerEl) {
      const gap = 8;
      // 先移到螢幕外讓瀏覽器完成 layout，才能量到真實高度
      menu.style.position = "fixed";
      menu.style.top = "-9999px";
      menu.style.left = "-9999px";
      requestAnimationFrame(() => {
        const rect = triggerEl.getBoundingClientRect();
        const mh = menu.offsetHeight || 160;
        const mw = menu.offsetWidth || 160;
        const spaceBelow = window.innerHeight - rect.bottom - gap;

        // 下方空間夠 → 往下；否則往上
        const top =
          spaceBelow >= mh
            ? rect.bottom + gap
            : Math.max(gap, rect.top - mh - gap);

        // 水平鉗制（防止超出右緣或左緣）
        let left = rect.left;
        if (left + mw > window.innerWidth - gap)
          left = window.innerWidth - mw - gap;
        if (left < gap) left = gap;

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
      });
    }

    // --- Action Methods ---
    editWormhole(wormhole) {
      const newName = prompt(
        this.t("wm_edit_title", { n: wormhole.name }),
        wormhole.name,
      );
      if (!newName || newName.trim() === wormhole.name) return;
      const data = this.getData();
      let found = data.wormholes.find((w) => w.id === wormhole.id);
      if (found) found.name = newName.trim();
      else {
        data.groups.forEach((g) => {
          let sub = g.wormholes.find((w) => w.id === wormhole.id);
          if (sub) sub.name = newName.trim();
        });
      }
      this.saveData(data);
      this.refreshDisplay();
    }

    toggleVIP(wormholeId, pin) {
      const data = this.getData();
      if (pin) {
        if (!data.vipWormholes.includes(wormholeId))
          data.vipWormholes.push(wormholeId);
      } else {
        data.vipWormholes = data.vipWormholes.filter((id) => id !== wormholeId);
      }
      this.saveData(data);
      this.refreshDisplay();
    }

    moveWormhole(wormhole) {
      const data = this.getData();
      let groupOptions = "0. [根目錄]";
      data.groups.forEach((g, i) => {
        groupOptions += `\n${i + 1}. ${g.name}`;
      });
      const choice = prompt(this.t("wm_move_prompt", { list: groupOptions }));
      if (!choice) return;
      const index = parseInt(choice);
      if (isNaN(index)) return;

      let tempWormhole = null;
      const rootIdx = data.wormholes.findIndex((w) => w.id === wormhole.id);
      if (rootIdx !== -1) tempWormhole = data.wormholes.splice(rootIdx, 1)[0];
      else {
        data.groups.forEach((g) => {
          const subIdx = g.wormholes.findIndex((w) => w.id === wormhole.id);
          if (subIdx !== -1) tempWormhole = g.wormholes.splice(subIdx, 1)[0];
        });
      }
      if (!tempWormhole) return;

      if (index === 0) data.wormholes.push(tempWormhole);
      else if (index > 0 && index <= data.groups.length)
        data.groups[index - 1].wormholes.push(tempWormhole);
      else data.wormholes.push(tempWormhole); // Fallback

      this.saveData(data);
      this.refreshDisplay();
    }

    async deleteWormhole(wormhole) {
      const ok = await dmtConfirm(this.t("em_del_confirm", { k: wormhole.name }), { danger: true });
      if (!ok) return;
      const data = this.getData();
      data.wormholes = data.wormholes.filter((w) => w.id !== wormhole.id);
      data.groups.forEach((g) => {
        g.wormholes = g.wormholes.filter((w) => w.id !== wormhole.id);
      });
      data.vipWormholes = data.vipWormholes.filter((id) => id !== wormhole.id);
      this.saveData(data);
      this.refreshDisplay();
    }

    editGroup(group) {
      const newName = prompt("編輯群組名稱:", group.name);
      if (newName && newName.trim() !== group.name) {
        const data = this.getData();
        const target = data.groups.find((g) => g.id === group.id);
        if (target) {
          target.name = newName.trim();
          this.saveData(data);
          this.refreshDisplay();
        }
      }
    }

    async deleteGroup(group) {
      const ok = await dmtConfirm(this.t("wm_group_del_confirm", { n: group.name }), { danger: true });
      if (!ok) return;
      const data = this.getData();
      const target = data.groups.find((g) => g.id === group.id);
      if (target) {
        data.wormholes.push(...target.wormholes);
        data.groups = data.groups.filter((g) => g.id !== group.id);
        // 同時刪除自訂圖示
        if (data.groupIcons && data.groupIcons[group.id]) {
          delete data.groupIcons[group.id];
        }
        this.saveData(data);
        this.refreshDisplay();
      }
    }

    openGroupIconPicker(group) {
      // 讀取 Emoji 蒐藏資料
      const EMOJI_TYPE = "emoji";
      const collections = this.getEmojiCollections(EMOJI_TYPE);
      const collectionNames = Object.keys(collections);

      if (
        collectionNames.length === 0 ||
        (collectionNames.length === 1 &&
          collections[collectionNames[0]].length === 0)
      ) {
        this.showToast(this.t("wm_icon_empty"), "⚠️");
        return;
      }

      // 建立彈窗
      const modal = document.createElement("div");
      modal.className = "wormhole-icon-picker-modal";
      modal.innerHTML = `
        <div class="wormhole-icon-picker-overlay"></div>
        <div class="wormhole-icon-picker-content">
          <div class="picker-header">
            <span class="picker-title">${this.t("wm_icon_picker_title", { name: group.name })}</span>
            <button class="picker-close">✕</button>
          </div>
          <div class="picker-tabs"></div>
          <div class="picker-grid"></div>
        </div>
      `;

      // 樣式注入
      if (!document.getElementById("wormhole-icon-picker-styles")) {
        const style = document.createElement("style");
        style.id = "wormhole-icon-picker-styles";
        style.textContent = `
          .wormhole-icon-picker-modal { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 10001; display: flex; align-items: center; justify-content: center; }
          .wormhole-icon-picker-overlay { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px); }
          .wormhole-icon-picker-content { position: relative; background: #2b2d31; border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); width: 90%; max-width: 500px; max-height: 70vh; display: flex; flex-direction: column; }
          .picker-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid #1e1f22; }
          .picker-title { color: #fff; font-size: 16px; font-weight: 600; }
          .picker-close { background: transparent; border: none; color: #b5bac1; font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all 0.2s; }
          .picker-close:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
          .picker-tabs { display: flex; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #1e1f22; overflow-x: auto; }
          .picker-tab { padding: 6px 12px; background: rgba(88, 101, 242, 0.1); border: 1px solid rgba(88, 101, 242, 0.3); border-radius: 4px; color: #b5bac1; font-size: 13px; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
          .picker-tab:hover { background: rgba(88, 101, 242, 0.2); color: #fff; }
          .picker-tab.active { background: rgba(88, 101, 242, 0.3); border-color: #5865f2; color: #fff; }
          .picker-grid { padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); gap: 8px; overflow-y: auto; max-height: 400px; }
          .picker-emoji-item { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 6px; cursor: pointer; transition: all 0.2s; background: rgba(255, 255, 255, 0.05); }
          .picker-emoji-item:hover { background: rgba(88, 101, 242, 0.2); transform: scale(1.1); }
          .picker-emoji-item img { width: 32px; height: 32px; object-fit: contain; }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(modal);

      // 關閉邏輯
      const close = () => {
        modal.remove();
      };

      modal.querySelector(".picker-close").onclick = close;
      modal.querySelector(".wormhole-icon-picker-overlay").onclick = close;

      // 渲染分頁與表情
      const tabsContainer = modal.querySelector(".picker-tabs");
      const gridContainer = modal.querySelector(".picker-grid");
      let activeTab = collectionNames[0];

      const renderTabs = () => {
        tabsContainer.innerHTML = "";
        collectionNames.forEach((name) => {
          const tab = document.createElement("div");
          tab.className = `picker-tab ${name === activeTab ? "active" : ""}`;
          tab.textContent = name;
          tab.onclick = () => {
            activeTab = name;
            renderTabs();
            renderGrid();
          };
          tabsContainer.appendChild(tab);
        });
      };

      const renderGrid = () => {
        gridContainer.innerHTML = "";
        const emojis = collections[activeTab] || [];

        if (emojis.length === 0) {
          gridContainer.innerHTML =
            '<div style="grid-column: 1/-1; text-align: center; color: #72767d; padding: 20px;">此資料夾尚無 Emoji</div>';
          return;
        }

        emojis.forEach((url) => {
          const item = document.createElement("div");
          item.className = "picker-emoji-item";
          // 改用 DOM API 設定 src，並驗證協議防止 javascript: 等非法 URL [XSS-L2]
          const img = document.createElement("img");
          img.alt = "emoji";
          if (typeof url === "string" && /^https?:\/\//i.test(url)) {
            img.src = url;
          }
          item.appendChild(img);
          item.onclick = () => {
            const data = this.getData();
            if (!data.groupIcons) data.groupIcons = {};
            data.groupIcons[group.id] = url;
            this.saveData(data);
            this.refreshDisplay();
            this.showToast(this.t("wm_icon_set_success", { name: group.name }));
            close();
          };
          gridContainer.appendChild(item);
        });
      };

      renderTabs();
      renderGrid();
    }

    // 輔助函數：讀取 Emoji 蒐藏資料
    getEmojiCollections(type) {
      try {
        const key =
          type === "gif"
            ? "discord_gif_collections"
            : type === "sticker"
              ? "discord_sticker_collections"
              : "discord_emoji_collections";

        if (typeof GM_getValue !== "undefined") {
          let data = JSON.parse(GM_getValue(key, "{}"));
          if (typeof data !== "object" || Array.isArray(data)) data = {};
          return data;
        }

        // Fallback to localStorage
        const stored = localStorage.getItem(key);
        if (stored) {
          let data = JSON.parse(stored);
          if (typeof data !== "object" || Array.isArray(data)) data = {};
          return data;
        }

        return {};
      } catch (e) {
        console.error("[Wormhole] Failed to load emoji collections:", e);
        return {};
      }
    }

    // 輔助函數：抓取當前伺服器圖示
    getCurrentServerIcon() {
      try {
        // 方法 1：從側邊欄抓取選中的伺服器
        const selectedServer = document.querySelector(
          '[class*="wrapper"][aria-selected="true"]',
        );
        if (selectedServer) {
          const iconImg = selectedServer.querySelector('img[class*="icon"]');
          if (iconImg && iconImg.src) {
            // 提升圖示品質：改為 size=128
            return iconImg.src.replace(/size=\d+/, "size=128");
          }
        }

        // 方法 2：從 URL 解析 Guild ID（無法取得 icon hash，僅作降級方案）
        const pathParts = window.location.pathname.split("/");
        if (
          pathParts[1] === "channels" &&
          pathParts[2] &&
          pathParts[2] !== "@me"
        ) {
          const guildId = pathParts[2];

          // 嘗試從 React Fiber 取得伺服器資料
          const fiber = this.findReactFiber(
            document.querySelector('[class*="sidebar"]'),
          );
          if (fiber) {
            const guild = this.findGuildDataInFiber(fiber, guildId);
            if (guild && guild.icon) {
              return `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.webp?size=128&quality=lossless`;
            }
          }
        }

        DEBUG && console.log("[Wormhole] No server icon found");
        return null;
      } catch (e) {
        console.error("[Wormhole] Failed to get server icon:", e);
        return null;
      }
    }

    // 輔助函數：尋找 React Fiber
    findReactFiber(element) {
      if (!element) return null;
      const key = Object.keys(element).find((k) =>
        k.startsWith("__reactFiber"),
      );
      return element[key] || null;
    }

    // 輔助函數：從 Fiber 中尋找 Guild 資料
    findGuildDataInFiber(fiber, guildId) {
      let current = fiber;
      let depth = 100;

      while (current && depth-- > 0) {
        // 檢查 memoizedProps
        if (current.memoizedProps) {
          const props = current.memoizedProps;
          if (props.guild && props.guild.id === guildId) {
            return props.guild;
          }
          if (props.guilds) {
            const guild = Object.values(props.guilds).find(
              (g) => g.id === guildId,
            );
            if (guild) return guild;
          }
        }

        // 檢查 stateNode
        if (current.stateNode) {
          const state = current.stateNode;
          if (state.guild && state.guild.id === guildId) {
            return state.guild;
          }
        }

        // 遞迴搜尋
        current = current.child || current.sibling || current.return;
      }

      return null;
    }

    // ==========================================
    // Focus Mode (聚焦模式)
    // ==========================================
    getFocusSize() {
      return localStorage.getItem("wormhole_focus_size") || "m";
    }

    setFocusSize(size) {
      localStorage.setItem("wormhole_focus_size", size);
    }

    getFocusShowLabels() {
      return localStorage.getItem("wormhole_focus_show_labels") === "true";
    }

    setFocusShowLabels(v) {
      localStorage.setItem("wormhole_focus_show_labels", String(v));
    }

    // 尺寸對照表：S=20 M=28 L=38（chip px，外框圓圈完整大小）
    _focusSizePx(size) {
      return { s: 20, m: 28, l: 38 }[size] ?? 28;
    }

    openFocusSizeMenu(anchorEl) {
      const existingMenu = document.getElementById("wh-focus-size-menu");
      if (existingMenu) {
        existingMenu.remove();
        return;
      }

      const currentSize = this.getFocusSize();
      const menu = document.createElement("div");
      menu.id = "wh-focus-size-menu";

      const sizes = [
        { key: "wm_focus_size_s", val: "s" },
        { key: "wm_focus_size_m", val: "m" },
        { key: "wm_focus_size_l", val: "l" },
      ];

      sizes.forEach(({ key, val }) => {
        const isActive = currentSize === val;
        const row = document.createElement("div");
        row.className = "wh-fsm-item" + (isActive ? " wh-fsm-active" : "");
        row.innerHTML = `<span class="wh-fsm-radio">${isActive ? "●" : "○"}</span><span>${this.t(key)}</span>`;
        if (!isActive) {
          row.onclick = () => {
            menu.remove();
            this.setFocusSize(val);
            this.applyFocusMode(true); // 重新套用尺寸
          };
        }
        menu.appendChild(row);
      });

      // 樣式（只注入一次）
      if (!document.getElementById("wh-focus-size-menu-styles")) {
        const s = document.createElement("style");
        s.id = "wh-focus-size-menu-styles";
        s.textContent = `
          #wh-focus-size-menu{position:fixed;z-index:2147483646;background:#2b2d31;border:1px solid rgba(255,255,255,.1);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.65);padding:4px;min-width:140px;animation:wh-sm-in .12s cubic-bezier(.19,1,.22,1)}
          .wh-fsm-item{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:5px;color:#dbdee1;font-size:12px;cursor:pointer;transition:background .1s}
          .wh-fsm-item:hover{background:rgba(88,101,242,.18);color:#fff}
          .wh-fsm-active{color:#fff;cursor:default}
          .wh-fsm-active:hover{background:transparent}
          .wh-fsm-radio{font-size:10px;color:#72767d;width:12px;text-align:center;flex-shrink:0}
          .wh-fsm-active .wh-fsm-radio{color:#5865f2}
        `;
        document.head.appendChild(s);
      }

      document.body.appendChild(menu);

      const rect = anchorEl.getBoundingClientRect();
      const mw = 140;
      let left = rect.left;
      let top = rect.bottom + 5;
      if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;

      const onOutside = (e) => {
        if (!menu.contains(e.target) && e.target !== anchorEl) {
          menu.remove();
          document.removeEventListener("mousedown", onOutside, true);
        }
      };
      setTimeout(
        () => document.addEventListener("mousedown", onOutside, true),
        0,
      );
    }

    getFocusMode() {
      try {
        const stored = localStorage.getItem("wormhole_focus_mode");
        return stored === "true";
      } catch (e) {
        return false;
      }
    }

    setFocusMode(enabled) {
      try {
        localStorage.setItem("wormhole_focus_mode", String(enabled));
        this.focusMode = enabled;
      } catch (e) {
        console.error("[Wormhole] Failed to save focus mode:", e);
      }
    }

    toggleFocusMode() {
      const newMode = !this.focusMode;
      this.setFocusMode(newMode);

      // 更新按鈕圖示
      const focusBtn = document.querySelector(".my-wormhole-focus-btn");
      if (focusBtn) {
        focusBtn.innerHTML = newMode ? this.ICONS.focusOn : this.ICONS.focusOff;
        focusBtn.title = newMode
          ? this.t("wm_focus_on")
          : this.t("wm_focus_off");
      }

      // 應用樣式變化
      this.applyFocusMode(newMode);

      // [修復]禁用聚焦模式切換的Toast提示(無干擾體驗)
      // this.showToast(newMode ? '✅ 已開啟聚焦模式' : '✅ 已關閉聚焦模式');
    }

    applyFocusMode(enabled, containerEl = null) {
      // containerEl 由 renderWormholes 直接傳入，避免 DOM 尚未掛載時 querySelector 找不到
      const container =
        containerEl || document.querySelector(".my-wormhole-container");

      // 尺寸計算
      const sz = this._focusSizePx(this.getFocusSize());
      const vipSz = Math.round(sz * 0.78);
      const imgSz = Math.round(sz * 0.82);
      const vipImgSz = Math.round(vipSz * 0.82);
      const iconFs = Math.round(sz * 0.62);
      const overlap = "-" + Math.round(sz * 0.22) + "px";
      const vipOverlap = "-" + Math.round(vipSz * 0.2) + "px";

      // 🔧 改用 <style id="wh-focus-size-override"> 注入 :root 變數，
      // 比 documentElement.style.setProperty 優先級更高且不受 SPA 路由清除影響。
      let sizeStyle = document.getElementById("wh-focus-size-override");
      if (!sizeStyle) {
        sizeStyle = document.createElement("style");
        sizeStyle.id = "wh-focus-size-override";
        document.head.appendChild(sizeStyle);
      }
      sizeStyle.textContent = `
        :root {
          --wh-focus-chip: ${sz}px;
          --wh-focus-vip: ${vipSz}px;
          --wh-focus-img: ${imgSz}px;
          --wh-focus-vip-img: ${vipImgSz}px;
          --wh-focus-icon-fs: ${iconFs}px;
          --wh-focus-overlap: ${overlap};
          --wh-focus-vip-overlap: ${vipOverlap};
        }
      `;

      if (!container) return;

      if (enabled) {
        container.classList.add("focus-mode");
      } else {
        container.classList.remove("focus-mode");
      }

      // Show labels：聚焦模式開啟且使用者選擇顯示名稱時套用
      if (enabled && this.getFocusShowLabels()) {
        container.classList.add("focus-show-labels");
      } else {
        container.classList.remove("focus-show-labels");
      }
    }

    // ==========================================
    // Helpers & Navigation
    // ==========================================
    showToast(msg, emoji = "✅") {
      if (typeof showEmojiToast === "function") showEmojiToast(msg);
      else alert(emoji + " " + msg);
    }

    // 傳送成功後的可點擊 toast
    // 停留 2 秒，點擊可立刻前往頻道
    _showSendToast(wormhole) {
      const existing = document.getElementById("wh-send-result-toast");
      if (existing) existing.remove();

      const toast = document.createElement("div");
      toast.id = "wh-send-result-toast";
      toast.innerHTML = `
        <div id="wh-srt-main">${this.t("wm_send_toast_title").replace("#{name}", escHtml(wormhole.name))}</div>
        <div id="wh-srt-hint">${this.t("wm_send_toast_hint")}</div>
      `;
      toast.style.cssText = `
        position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(8px);
        background:#2b2d31; color:#f2f3f5; padding:10px 18px; border-radius:10px;
        font-size:13px; font-weight:500; box-shadow:0 8px 24px rgba(0,0,0,0.45);
        z-index:2147483649; border:1px solid rgba(88,101,242,0.4);
        cursor:pointer; user-select:none; text-align:center; min-width:180px;
        opacity:0; transition:opacity 0.2s, transform 0.2s;
        pointer-events:auto;
      `;
      const hintStyle = `font-size:11px; color:#72767d; margin-top:3px;`;

      document.body.appendChild(toast);
      // 強制 reflow 後啟動動畫
      requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateX(-50%) translateY(0)";
        const hint = toast.querySelector("#wh-srt-hint");
        if (hint) hint.style.cssText = hintStyle;
      });

      let dismissed = false;
      const dismiss = (navigate = false) => {
        if (dismissed) return;
        dismissed = true;
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(8px)";
        setTimeout(() => toast.remove(), 220);
        if (navigate) this.navigateToChannel(wormhole.url);
      };

      toast.addEventListener("click", () => dismiss(true));

      // 3 秒後自動消失
      const timer = setTimeout(() => dismiss(false), 3000);
      // 點擊時清掉 timer 避免重複
      toast.addEventListener("click", () => clearTimeout(timer), {
        once: true,
      });
    }

    t(key, params = {}) {
      if (typeof t === "function") return t(key, params);
      return key;
    }

    validateUrl(url) {
      return url && url.includes("/channels/");
    }

    // SPA Navigation (Simplified)
    navigateToChannel(fullUrl) {
      try {
        const urlObj = new URL(fullUrl);
        const targetPath = urlObj.pathname + urlObj.search + urlObj.hash;
        if (window.location.pathname === targetPath) return true;

        // Try different SPA methods
        if (this.tryDiscordNavigator(targetPath)) return true;
        if (this.tryReactHistory(targetPath)) return true;
        if (this.tryHistoryAPI(targetPath)) return true;
        if (this.tryPopState(targetPath)) return true;

        window.location.href = fullUrl;
        return false;
      } catch (e) {
        window.location.href = fullUrl;
        return false;
      }
    }

    tryDiscordNavigator(path) {
      try {
        const possiblePaths = [
          "webpackChunkdiscord_app",
          "_ws",
          "DiscordNative",
        ];
        for (const prop of possiblePaths) {
          if (window[prop] && Array.isArray(window[prop])) {
            const modules = window[prop];
            for (const module of modules) {
              if (module?.[1]) {
                for (const key in module[1]) {
                  const exports = module[1][key]?.exports;
                  if (exports?.push && typeof exports.push === "function") {
                    exports.push(path);
                    return true;
                  }
                }
              }
            }
          }
        }
      } catch (e) {}
      return false;
    }

    tryReactHistory(path) {
      try {
        const fiberKey = Object.keys(document.querySelector("div") || {}).find(
          (k) => k.startsWith("__reactFiber"),
        );
        if (!fiberKey) return false;
        const searchRoots = [
          document.querySelector('div[class*="appMount"]'),
          document.body,
        ];
        for (const root of searchRoots) {
          if (!root) continue;
          let fiber = root[fiberKey];
          let depth = 50;
          while (fiber && depth-- > 0) {
            let h =
              fiber.memoizedProps?.history || fiber.memoizedProps?.navigator;
            if (h?.push) {
              h.push(path);
              return true;
            }
            if (fiber.stateNode?.history?.push) {
              fiber.stateNode.history.push(path);
              return true;
            }
            fiber = fiber.child || fiber.return;
          }
        }
      } catch (e) {}
      return false;
    }

    tryHistoryAPI(path) {
      try {
        if (window.history?.pushState) {
          window.history.pushState(null, "", path);
          window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
          return true;
        }
      } catch (e) {}
      return false;
    }

    tryPopState(path) {
      try {
        const currentState = window.history.state;
        window.history.replaceState(currentState, "", path);
        window.dispatchEvent(
          new PopStateEvent("popstate", { state: currentState }),
        );
        return true;
      } catch (e) {}
      return false;
    }

    /**
     * 驗證目標 title_ 元素是否真的是頻道標題欄。
     * 策略：負向排除 + 正向特徵比對（檢查元素本身，而非祖先鏈）
     *
     * 實際的頻道標題元素長這樣：
     *   <div class="title_xxxx" role="button" aria-label="...Quick Switcher...">
     *     <div class="guildIcon_xxxx ..."></div>
     *     <div data-text-variant="text-sm/medium">頻道名稱</div>
     *   </div>
     */
    _isValidChannelHeader(el) {
      if (!el) return false;

      // ── 負向排除：明確不是這些區域 ──────────────────────────
      if (el.closest('nav[class*="guilds"]')) return false;
      if (el.closest('ul[class*="guilds"]')) return false;
      if (el.closest('[class*="panels_"]')) return false;
      if (el.closest('[class*="privateChannels_"]')) return false;
      if (el.closest('[class*="membersWrap_"]')) return false;
      if (el.closest('[class*="searchResultsWrap_"]')) return false;

      // ── 正向特徵：元素本身需帶有「頻道 Quick Switcher」的識別特徵 ──
      // 特徵 1：包含 guildIcon_ 的子元素（伺服器圖示）
      if (el.querySelector('[class*="guildIcon_"]')) return true;

      // 特徵 2：帶有 data-text-variant 的子元素（頻道名稱文字節點）
      if (el.querySelector("[data-text-variant]")) return true;

      // 特徵 3：自身 role=button + 有 aria-label（Quick Switcher 按鈕本身）
      if (el.getAttribute("role") === "button" && el.getAttribute("aria-label"))
        return true;

      return false;
    }

    /**
     * 清除所有位於非預期位置的流浪蟲洞容器。
     * 當 Discord 切換頻道/頁面時，舊的 title_ 節點可能消失，
     * 但 observer 也可能在新的非目標節點上觸發注入，此方法負責清理。
     */
    _removeStrayContainers() {
      // dirty flag：只在有注入過、或 dock 位置改變後才需要清理，避免每次 mutation 都跑 querySelectorAll
      if (!this._strayCheckNeeded) return;
      this._strayCheckNeeded = false;
      const dockPos = this.getDockPosition();
      document.querySelectorAll(".my-wormhole-container").forEach((c) => {
        const parent = c.parentElement;
        if (!parent) {
          c.remove();
          return;
        }

        if (dockPos === "input") {
          if (parent.id === "wh-input-dock") return;
          DEBUG &&
            console.warn(
              "[Wormhole] Removing stray container (input mode) from:",
              parent,
            );
          c.remove();
          return;
        }
        if (dockPos === "navbar") {
          if (parent.id === "wh-navbar-dock") return;
          DEBUG &&
            console.warn(
              "[Wormhole] Removing stray container (navbar mode) from:",
              parent,
            );
          c.remove();
          return;
        }
        if (dockPos === "topleft") {
          if (parent.id === "wh-topleft-dock") return;
          DEBUG &&
            console.warn(
              "[Wormhole] Removing stray container (topleft mode) from:",
              parent,
            );
          c.remove();
          return;
        }
        // titlebar 模式
        if (parent.id === "wh-titlebar-dock") return;
        if (this._isValidChannelHeader(parent)) return;
        DEBUG &&
          console.warn("[Wormhole] Removing stray container from:", parent);
        c.remove();
      });
    }

    // ==========================================
    // Monitor: Settings Accessors
    // ==========================================
    getMonitorEnabled() {
      return GMStore.get("wh_monitor_enabled", "false") === "true";
    }
    setMonitorEnabled(v) {
      GMStore.set("wh_monitor_enabled", String(v));
    }
    getMonitorInterval() {
      return parseInt(GMStore.get("wh_monitor_interval", "30"), 10);
    }
    setMonitorInterval(v) {
      GMStore.set("wh_monitor_interval", String(v));
    }
    getMonitorBadgeStyle() {
      return GMStore.get("wh_monitor_badge_style", "dot");
    }
    setMonitorBadgeStyle(v) {
      GMStore.set("wh_monitor_badge_style", v);
    }

    // ==========================================
    // Monitor: Lifecycle
    // ==========================================
    startMonitor() {
      if (this._monitorTimer) return; // 已在運行
      const intervalMs = this.getMonitorInterval() * 1000;

      DEBUG && console.log(`[WH Monitor] Started. Interval: ${intervalMs / 1000}s`);

      // 立刻執行一次，不等第一個 tick
      this._pollAllWormholes();

      this._monitorTimer = setInterval(() => {
        if (!document.hidden) this._pollAllWormholes();
      }, intervalMs);

      // 分頁重新可見時補一次 poll
      if (!this._monitorVisHandler) {
        this._monitorVisHandler = () => {
          if (!document.hidden && this._monitorTimer) this._pollAllWormholes();
        };
        document.addEventListener("visibilitychange", this._monitorVisHandler);
      }
    }

    stopMonitor() {
      if (this._monitorTimer) {
        clearInterval(this._monitorTimer);
        this._monitorTimer = null;
        DEBUG && console.log("[WH Monitor] Stopped.");
      }
      if (this._monitorVisHandler) {
        document.removeEventListener("visibilitychange", this._monitorVisHandler);
        this._monitorVisHandler = null;
      }
    }

    // ==========================================
    // Monitor: Poll All Wormholes
    // ==========================================
    async _pollAllWormholes() {
      if (!this._cachedToken) return;
      const wormholes = this.getAllWormholes();
      if (!wormholes.length) return;

      for (const wh of wormholes) {
        try {
          const channelId = this._extractChannelId(wh.url);
          if (!channelId) continue;

          const res = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
              method: "GET",
              url: `https://discord.com/api/v10/channels/${channelId}/messages?limit=1`,
              headers: { Authorization: this._cachedToken, "Content-Type": "application/json" },
              onload: resolve,
              onerror: reject,
              ontimeout: reject,
            });
          });

          if (res.status !== 200) continue;
          let msgs;
          try { msgs = JSON.parse(res.responseText); } catch { continue; }
          if (!Array.isArray(msgs) || !msgs.length) continue;

          const latestId = msgs[0].id;
          const sessionKey = `wh_last_msg_${wh.id}`;
          const knownId = sessionStorage.getItem(sessionKey);

          if (!knownId) {
            // 初次見到：記錄基準，不顯示 badge
            sessionStorage.setItem(sessionKey, latestId);
          } else if (latestId !== knownId && BigInt(latestId) > BigInt(knownId)) {
            // 有新訊息：計算增量（單純 +1 since 只取 limit=1，改用累加）
            const current = this._monitorBadgeMap.get(wh.id) || 0;
            this._monitorBadgeMap.set(wh.id, current + 1);
            this._setWormholeBadge(wh.id);
            // 更新 knownId 為最新（避免每次 poll 都 +1 同一則）
            sessionStorage.setItem(sessionKey, latestId);
          }
        } catch (err) {
          DEBUG && console.warn(`[WH Monitor] Poll failed for wormhole ${wh.id}:`, err);
        }

        // Rate-limit 保護：每次 wormhole 查詢之間間隔 200ms
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // ==========================================
    // Monitor: Badge Rendering
    // ==========================================

    /** 根據 _monitorBadgeMap 在所有 chip 上設置 badge */
    _setWormholeBadge(wormholeId) {
      const count = this._monitorBadgeMap.get(wormholeId) || 0;
      if (count === 0) return;

      const style = this.getMonitorBadgeStyle();
      const chips = document.querySelectorAll(`[data-wormhole-id="${wormholeId}"]`);
      chips.forEach(chip => {
        // 確保 chip 有 position:relative（badge 定位依賴）
        const cs = getComputedStyle(chip);
        if (cs.position === "static") chip.style.position = "relative";

        // 移除舊 badge（避免重複）
        chip.querySelector(".wh-monitor-badge")?.remove();

        const badge = document.createElement("span");
        badge.className = "wh-monitor-badge";
        if (style === "count") {
          badge.textContent = count > 99 ? "99+" : String(count);
          badge.classList.add("wh-monitor-badge--count");
        } else {
          badge.classList.add("wh-monitor-badge--dot");
        }
        chip.appendChild(badge);
      });
    }

    /** 清除指定蟲洞的 badge 並重置 sessionStorage 基準 */
    _clearWormholeBadge(wormholeId) {
      this._monitorBadgeMap.delete(wormholeId);
      // 不清除 sessionStorage，讓下次 poll 以「已讀後的最新 ID」為基準
      // （poll 時若 knownId === latestId 就不會再計入）
      document.querySelectorAll(`[data-wormhole-id="${wormholeId}"] .wh-monitor-badge`)
        .forEach(b => b.remove());
    }

    /** renderWormholes 重繪後，從 _monitorBadgeMap 恢復所有 badge */
    _restoreBadges() {
      if (!this._monitorBadgeMap.size) return;
      this._monitorBadgeMap.forEach((count, wormholeId) => {
        if (count > 0) this._setWormholeBadge(wormholeId);
      });
    }

    /** 從 wormhole URL 萃取 channel ID */
    _extractChannelId(url) {
      try {
        const m = new URL(url).pathname.match(/\/channels\/\d+\/(\d+)/);
        return m ? m[1] : null;
      } catch {
        return null;
      }
    }

    setupObserver() {
      this._strayCheckNeeded = false;
      let debounceTimer = null;
      this.observer = new MutationObserver(() => {
        if (document.hidden) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this._removeStrayContainers();

          const trailingGroup = document.querySelector(
            'div[class*="trailing_"]',
          );
          if (trailingGroup) this.injectCreatorButton(trailingGroup);

          const pos = this.getDockPosition();

          if (pos === "input") {
            if (!document.getElementById("wh-input-dock")) {
              this._strayCheckNeeded = true;
              this._injectInputDock();
            }
            return;
          }

          if (pos === "navbar") {
            if (!document.getElementById("wh-navbar-dock")) {
              this._strayCheckNeeded = true;
              this._injectNavbarDock();
            }
            return;
          }

          if (pos === "topleft") {
            if (!document.getElementById("wh-topleft-dock")) {
              this._strayCheckNeeded = true;
              this._injectTopLeftDock();
            }
            return;
          }

          // titlebar：確保注射到正確的 section.title_ 頻道標題欄
          if (!document.getElementById("wh-titlebar-dock")) {
            this._strayCheckNeeded = true;
            this._injectTitlebarDock();
          }
        }, 100);
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
    }

    // ==========================================
    // Discord 圖片預覽偵測：carouselModal 開啟時隱藏 navbar dock
    // ==========================================
    _setupModalWatcher() {
      const MODAL_SEL =
        '[class*="carouselModal_"], [class*="imageModal_"], [class*="layerModal_"]';
      const setNavbarDockVisibility = (visible) => {
        const dock = document.getElementById("wh-navbar-dock");
        if (dock) dock.style.opacity = visible ? "1" : "0";
        if (dock) dock.style.pointerEvents = visible ? "auto" : "none";
      };

      const check = () => {
        if (document.hidden) return;
        const hasModal = !!document.querySelector(MODAL_SEL);
        setNavbarDockVisibility(!hasModal);
      };

      const modalWatcher = new MutationObserver(check);
      modalWatcher.observe(document.body, { childList: true, subtree: false });
      this._modalWatcher = modalWatcher;
    }

    injectStyles() {
      if (document.getElementById("wormhole-pro-styles")) return;
      const style = document.createElement("style");
      style.id = "wormhole-pro-styles";
      style.textContent = `
            .my-wormhole-vip-section { display: flex; gap: 2px; margin-right: 10px; padding-right: 10px; border-right: 1px solid rgba(255,215,0,0.2); }
            .my-wormhole-vip-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: transparent; border-radius: 6px; color: var(--dmt-gold); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; position: relative; overflow: visible; }
            .my-wormhole-vip-chip:hover { transform: scale(1.08); transform-origin: center; text-shadow: 0 0 8px rgba(255, 215, 0, 0.6); }
            .my-wormhole-group-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; background: rgba(88, 101, 242, 0.1); border: 1.5px solid rgba(88, 101, 242, 0.3); border-radius: 5px; color: var(--dmt-accent); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; margin-right: 6px; }
            .my-wormhole-group-chip:hover { background: rgba(88, 101, 242, 0.2); border-color: rgba(88, 101, 242, 0.5); transform: translateY(-1px); }
            .my-wormhole-chip { background: rgba(30, 31, 34, 0.6); border: 1px solid rgba(88, 101, 242, 0.3); color: var(--dmt-text-primary); font-size: 12px; font-weight: 500; padding: 2px 8px; border-radius: 12px; cursor: pointer; user-select: none; transition: all 0.2s; display: flex; align-items: center; gap: 4px; white-space: nowrap; margin-right: 4px; max-width: 120px; }
            .my-wormhole-chip .item-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
            .my-wormhole-chip:hover { background: rgba(88, 101, 242, 0.2); border-color: var(--dmt-accent); color: #fff; transform: translateY(-1px); }
            .my-wormhole-dropdown { position: fixed; background: var(--dmt-bg-primary); border: 1px solid var(--dmt-bg-deep); border-radius: 6px; box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4); padding: 4px; z-index: 10000; min-width: 200px; max-height: 300px; overflow-y: auto; }
            .dropdown-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 4px; color: var(--dmt-text-primary); font-size: 13px; cursor: pointer; transition: all 0.15s ease; }
            .dropdown-item:hover { background: rgba(88, 101, 242, 0.2); color: #fff; }
            .dropdown-item.disabled { opacity: 0.5; pointer-events: none; }
            .item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .item-pin-btn { background: transparent; border: none; padding: 4px; cursor: pointer; border-radius: 3px; opacity: 0.6; display: flex; align-items: center; }
            .item-pin-btn:hover { opacity: 1; background: rgba(255, 215, 0, 0.1); transform: scale(1.15); }
            .my-wormhole-creator-btn { color: var(--dmt-text-subtle); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin: 0 4px; transition: color 0.2s; }
            .my-wormhole-creator-btn:hover { color: var(--dmt-accent); }
            .my-wormhole-focus-btn { color: var(--dmt-text-subtle); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; transition: all 0.2s; }
            .my-wormhole-focus-btn:hover { color: var(--dmt-accent); transform: scale(1.1); }
            /* Input dock: 輸入框上緣停靠列 */
            #wh-input-dock { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px; padding: 0 12px; min-height: 28px; background: rgba(30,31,34,0.6); border-bottom: 1px solid rgba(255,255,255,0.06); width: 100%; box-sizing: border-box; flex-shrink: 0; order: -1; }
            #wh-input-dock .my-wormhole-container { margin-left: 0; border-left: none; padding-left: 0; }
            /* Navbar dock: 導航欄停靠列 */
            #wh-navbar-dock { position: fixed; display: flex; align-items: center; z-index: 2147483640; overflow: visible; pointer-events: auto; }
            #wh-navbar-dock .my-wormhole-container { margin-left: 0; border-left: none; padding-left: 0; overflow: visible; }
            /* Titlebar dock: 頻道標題欄下方停靠列 */
            #wh-titlebar-dock { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px; padding: 2px 16px; background: transparent; border-bottom: 1px solid rgba(255,255,255,0.05); width: 100%; box-sizing: border-box; flex-shrink: 0; min-height: 36px; }
            #wh-titlebar-dock .my-wormhole-container { margin-left: 0; border-left: none; padding-left: 0; }
            /* Top-left dock: 左上角固定水平停靠列 */
            #wh-topleft-dock { position: fixed; top: 4px; left: 72px; display: flex; flex-direction: row; align-items: center; gap: 0; z-index: 2147483640; overflow: visible; pointer-events: auto; background: rgba(30,31,34,0.88); backdrop-filter: blur(8px); border: 1px solid rgba(88,101,242,0.25); border-radius: 20px; padding: 3px 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.5); }
            #wh-topleft-dock .my-wormhole-container { margin-left: 0; border-left: none; padding-left: 0; overflow: visible; flex-direction: row; align-items: center; }
            #wh-topleft-dock .wh-row-1 { flex-direction: row; align-items: center; gap: 0; flex-wrap: nowrap; }
            #wh-topleft-dock .wh-row-2 { position: absolute; top: calc(100% + 6px); left: 0; opacity: 0; pointer-events: none; flex-direction: row; flex-wrap: wrap; gap: 4px; padding: 4px 8px; background: rgba(30,31,34,0.95); border: 1px solid rgba(88,101,242,0.25); border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); transition: opacity 0.2s ease; }
            #wh-topleft-dock:hover .wh-row-2 { opacity: 1; pointer-events: auto; }
            #wh-topleft-dock .my-wormhole-chip,
            #wh-topleft-dock .my-wormhole-vip-chip { max-width: 120px; width: auto; box-sizing: border-box; margin-bottom: 0; }
            /* titlebar / input dock 聚焦模式：chip 固定小尺寸，不膨脹 */
            #wh-titlebar-dock .my-wormhole-container.focus-mode,
            #wh-input-dock .my-wormhole-container.focus-mode { padding-top: 0; }
            #wh-titlebar-dock .my-wormhole-container.focus-mode .my-wormhole-chip,
            #wh-titlebar-dock .my-wormhole-container.focus-mode .my-wormhole-vip-chip,
            #wh-input-dock .my-wormhole-container.focus-mode .my-wormhole-chip,
            #wh-input-dock .my-wormhole-container.focus-mode .my-wormhole-vip-chip { width: var(--wh-focus-chip, 28px); height: var(--wh-focus-chip, 28px); max-width: var(--wh-focus-chip, 28px); }
            #wh-titlebar-dock .my-wormhole-container.focus-mode .my-wormhole-vip-chip,
            #wh-input-dock .my-wormhole-container.focus-mode .my-wormhole-vip-chip { width: var(--wh-focus-vip, 22px); height: var(--wh-focus-vip, 22px); max-width: var(--wh-focus-vip, 22px); }
            .my-wormhole-container { display: flex; flex-direction: row; align-items: center; flex-shrink: 0; margin-left: 8px; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 8px; transition: all 0.3s ease; position: relative; }
            .wh-row-1 { display: flex; align-items: center; gap: 0; flex-wrap: nowrap; flex-shrink: 0; }
            /* 第二列以後：平常隱藏，hover 整個容器時淡入
               top: 100% + padding-top 代替 gap，確保滑鼠移動時 hover 不中斷 */
            .wh-row-2 {
                position: absolute;
                top: 100%;           /* 緊接 row1 底部，無真空地帶 */
                left: 0;
                display: flex;
                align-items: flex-start;
                gap: 4px;
                flex-wrap: wrap;     /* 自然換行，可承載最多 10 列 */
                max-width: 520px;    /* 限制彈出寬度，超過即換行 */
                background: rgba(30,31,34,0.97);
                border: 1px solid rgba(88,101,242,0.35);
                border-radius: 0 0 8px 8px;
                padding: 10px 8px 6px 8px;  /* padding-top=10px 就是視覺間距，同時保持 hover 連續 */
                z-index: 10003;
                opacity: 0;
                pointer-events: none;
                transform: translateY(-2px);
                transition: opacity 0.18s ease, transform 0.18s ease;
                box-shadow: 0 6px 20px rgba(0,0,0,0.6);
            }
            .my-wormhole-container:hover .wh-row-2:not(:empty) { opacity: 1; pointer-events: auto; transform: translateY(0); }

            /* ── row2 chip：回歸圓形，外觀與 row1 一致，文字隱藏 ── */
            .wh-row-2 .my-wormhole-chip,
            .wh-row-2 .my-wormhole-vip-chip {
                flex-direction: row;
                align-items: center;
                justify-content: center;
                width: 28px;
                min-width: 28px;
                max-width: 28px;
                height: 28px;
                padding: 0;
                margin-right: 4px;
                border-radius: 50%;
                background: rgba(40, 42, 48, 0.9);
                border: 2px solid rgba(88, 101, 242, 0.35);
                box-shadow: none;
                gap: 0;
                overflow: visible;   /* tooltip 需要溢出 */
            }
            .wh-row-2 .my-wormhole-chip:hover,
            .wh-row-2 .my-wormhole-vip-chip:hover {
                background: rgba(88, 101, 242, 0.3);
                border-color: rgba(88, 101, 242, 0.7);
                transform: scale(1.06);
                transform-origin: center;
                box-shadow: 0 4px 12px rgba(88,101,242,0.3);
            }
            .wh-row-2 .my-wormhole-vip-chip {
                border-color: rgba(255, 215, 0, 0.45);
            }
            .wh-row-2 .my-wormhole-vip-chip:hover {
                background: rgba(255, 215, 0, 0.15);
                border-color: rgba(255, 215, 0, 0.8);
                box-shadow: 0 4px 12px rgba(255,215,0,0.25);
                transform: scale(1.06);
                transform-origin: center;
            }

            /* 圖示大小 */
            .wh-row-2 .my-wormhole-chip img.my-wormhole-icon,
            .wh-row-2 .my-wormhole-vip-chip img {
                width: 22px !important;
                height: 22px !important;
                border-radius: 50%;
            }
            .wh-row-2 .my-wormhole-chip .my-wormhole-icon,
            .wh-row-2 .my-wormhole-vip-chip .vip-icon {
                font-size: 17px;
                line-height: 1;
            }

            /* row2 文字隱藏 */
            .wh-row-2 .my-wormhole-chip .item-name,
            .wh-row-2 .my-wormhole-vip-chip .vip-text {
                display: none !important;
            }

            /* ── Tooltip 由 JS 負責（body 層級，不受 header overflow 限制）── */

            /* 聚焦模式樣式 */
            .my-wormhole-container.focus-mode { position: relative; padding-top: 0; align-items: center; }
            .my-wormhole-container.focus-mode .my-wormhole-vip-chip,
            .my-wormhole-container.focus-mode .my-wormhole-chip {
                width: var(--wh-focus-chip, 32px);
                height: var(--wh-focus-chip, 32px);
                max-width: var(--wh-focus-chip, 32px);
                padding: 0;
                margin-right: var(--wh-focus-overlap, -6px);
                border-radius: 50%;
                justify-content: center;
                background: rgba(30, 31, 34, 0.9);
                border: 2px solid rgba(88, 101, 242, 0.5);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                position: relative;
                transition: all 0.2s ease;
            }
            .my-wormhole-container.focus-mode .my-wormhole-vip-chip {
                width: var(--wh-focus-vip, 24px);
                height: var(--wh-focus-vip, 24px);
                max-width: var(--wh-focus-vip, 24px);
                margin-right: var(--wh-focus-vip-overlap, -5px);
                border-color: rgba(255, 215, 0, 0.6);
                transition: all 0.2s ease;
            }
            .my-wormhole-container.focus-mode .my-wormhole-vip-chip:last-child,
            .my-wormhole-container.focus-mode .my-wormhole-chip:last-child {
                margin-right: 0;
            }
            .my-wormhole-container.focus-mode .my-wormhole-vip-chip img,
            .my-wormhole-container.focus-mode .my-wormhole-chip img {
                width: var(--wh-focus-img, 26px) !important;
                height: var(--wh-focus-img, 26px) !important;
                border-radius: 50%;
            }
            /* VIP 圖示縮小配合容器 */
            .my-wormhole-container.focus-mode .my-wormhole-vip-chip img {
                width: var(--wh-focus-vip-img, 18px) !important;
                height: var(--wh-focus-vip-img, 18px) !important;
            }
            .my-wormhole-container.focus-mode .my-wormhole-vip-chip .vip-icon,
            .my-wormhole-container.focus-mode .my-wormhole-chip .my-wormhole-icon {
                font-size: var(--wh-focus-icon-fs, 18px);
            }
            /* VIP icon 縮小 */
            .my-wormhole-container.focus-mode .my-wormhole-vip-chip .vip-icon {
                font-size: 17px;
            }
            .my-wormhole-container.focus-mode .vip-text,
            .my-wormhole-container.focus-mode .item-name { display: none; }
            /* 共用 hover */
            .my-wormhole-container.focus-mode .my-wormhole-vip-chip:hover,
            .my-wormhole-container.focus-mode .my-wormhole-chip:hover {
                transform: scale(1.15);
                box-shadow: 0 6px 20px rgba(88, 101, 242, 0.6);
                z-index: 10;
            }
            /* VIP hover：純 scale 放大，不改變 width/height 避免 layout reflow */
            .my-wormhole-container.focus-mode .my-wormhole-vip-chip:hover {
                transform: scale(1.2);
                transform-origin: center;
                box-shadow: 0 6px 20px rgba(255, 215, 0, 0.8);
                z-index: 10;
            }

            /* 聚焦模式Tooltip提示 */
            .my-wormhole-container.focus-mode .wh-row-1 .my-wormhole-vip-chip::after,
            .my-wormhole-container.focus-mode .wh-row-1 .my-wormhole-chip::after {
                content: attr(data-wormhole-name);
                position: absolute;
                bottom: calc(100% + 8px);
                left: 50%;
                transform: translateX(-50%) scale(0.9);
                padding: 6px 12px;
                background: rgba(0, 0, 0, 0.9);
                color: #fff;
                font-size: 12px;
                font-weight: 500;
                border-radius: 6px;
                white-space: nowrap;
                pointer-events: none;
                opacity: 0;
                transition: all 0.2s ease;
                z-index: 10002;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            }
            .my-wormhole-container.focus-mode .wh-row-1 .my-wormhole-vip-chip:hover::after,
            .my-wormhole-container.focus-mode .wh-row-1 .my-wormhole-chip:hover::after {
                opacity: 1;
                transform: translateX(-50%) scale(1);
            }

            /* 拖曳樣式 */
            .my-wormhole-vip-chip.dragging,
            .my-wormhole-chip.dragging {
                opacity: 0.5 !important;
                transform: scale(0.95) !important;
                cursor: grabbing !important;
                z-index: 9999 !important;
            }

            .my-wormhole-vip-chip.drag-over,
            .my-wormhole-chip.drag-over {
                border-color: #5865F2 !important;
                border-width: 2px !important;
                box-shadow: 0 0 0 3px rgba(88, 101, 242, 0.3) !important;
                animation: dragShake 0.3s ease-in-out infinite;
            }

            @keyframes dragShake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-2px); }
                75% { transform: translateX(2px); }
            }

            /* 聚焦模式下的拖曳樣式調整 */
            .my-wormhole-container.focus-mode .my-wormhole-vip-chip.dragging,
            .my-wormhole-container.focus-mode .my-wormhole-chip.dragging {
                opacity: 0.5 !important;
                transform: scale(0.8) !important;
                margin-right: -8px;
            }

            .my-wormhole-container.focus-mode .my-wormhole-vip-chip.dragging {
                margin-right: -10px;
            }

            .my-wormhole-container.focus-mode .my-wormhole-vip-chip.drag-over,
            .my-wormhole-container.focus-mode .my-wormhole-chip.drag-over {
                transform: scale(1.05) !important;
                z-index: 10;
            }

            /* 確保聚焦模式下拖曳時Tooltip不顯示 */
            .my-wormhole-container.focus-mode .wh-row-1 .my-wormhole-vip-chip.dragging::after,
            .my-wormhole-container.focus-mode .wh-row-1 .my-wormhole-chip.dragging::after {
                display: none;
            }

            /* ── Focus: show labels ── */
            /* chip 改為垂直排列：icon 上、名稱下 */
            .my-wormhole-container.focus-mode.focus-show-labels .my-wormhole-chip,
            .my-wormhole-container.focus-mode.focus-show-labels .my-wormhole-vip-chip {
                flex-direction: column;
                width: auto !important;
                max-width: 56px !important;
                height: auto !important;
                border-radius: 8px !important;
                padding: 4px 4px 3px !important;
                gap: 3px;
                margin-right: 4px !important;
                overflow: visible;
            }
            /* 名稱文字：強制顯示（覆蓋 focus-mode 的 display:none）*/
            .my-wormhole-container.focus-mode.focus-show-labels .vip-text,
            .my-wormhole-container.focus-mode.focus-show-labels .item-name {
                display: block !important;
                font-size: 10px;
                font-weight: 500;
                color: var(--dmt-text-primary);
                text-align: center;
                max-width: 48px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                line-height: 1.2;
            }
            /* VIP 名稱顏色 */
            .my-wormhole-container.focus-mode.focus-show-labels .my-wormhole-vip-chip .vip-text {
                color: var(--dmt-gold, #ffd700);
            }
            /* hover 時不再 scale，改輕微上浮 */
            .my-wormhole-container.focus-mode.focus-show-labels .my-wormhole-chip:hover,
            .my-wormhole-container.focus-mode.focus-show-labels .my-wormhole-vip-chip:hover {
                transform: translateY(-2px) !important;
                width: auto !important;
                max-width: 56px !important;
                height: auto !important;
                margin-right: 4px !important;
            }

            /* ── Monitor Badge ── */
            .wh-monitor-badge {
                position: absolute;
                top: -4px;
                right: -4px;
                pointer-events: none;
                z-index: 10;
                line-height: 1;
            }
            .wh-monitor-badge--dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #ed4245;
                border: 1.5px solid rgba(0,0,0,0.5);
                display: block;
            }
            .wh-monitor-badge--count {
                min-width: 16px;
                height: 16px;
                padding: 0 4px;
                border-radius: 8px;
                background: #ed4245;
                color: #fff;
                font-size: 10px;
                font-weight: 700;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1.5px solid rgba(0,0,0,0.5);
                box-sizing: border-box;
            }

            /* ── 💬 hover 傳送按鈕（全域注入，position:fixed 脫離父層 overflow）── */
            .wh-chat-btn {
                position: fixed;
                display: flex; align-items: center; gap: 3px;
                background: rgba(24,25,28,.94);
                border: 1px solid rgba(88,101,242,.5);
                border-radius: 10px; padding: 2px 7px 2px 5px;
                cursor: pointer;
                opacity: 0; transform: translateY(3px) scale(.9);
                transition: opacity .18s, transform .18s;
                pointer-events: none;
                z-index: 2147483640; white-space: nowrap;
                box-shadow: 0 2px 8px rgba(0,0,0,.5);
            }
            .wh-chat-btn.visible { opacity: 1; transform: none; pointer-events: auto; }
            .focus-mode .wh-chat-btn { display: none !important; }
            .wh-chat-icon { font-size: 16px; line-height: 1; }
        `;
      document.head.appendChild(style);
    }

    destroy() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this._modalWatcher) {
        this._modalWatcher.disconnect();
        this._modalWatcher = null;
      }
      clearTimeout(this.refreshTimer);
      clearTimeout(this.dropdownCloseTimer);
      this.closeAllDropdowns();
    }
  }

  // =========================================================================================
  // 條件式模組初始化（依模組開關決定是否啟動）
  // 啟動順序: D(Wormhole) → A(Forwarding) → B(Message) → C(Emoji) → E(Header)
  // 注意: Wormhole 為 class 實例化，其餘為 init 函數；順序影響 DOM 注入時機
  // =========================================================================================
  if (isModEnabled("mod_wormhole")) {
    try {
      const wormholeModule = new WormholeModule();
      wormholeModule.initialize();
      window.wormholeModule = wormholeModule;

      // 僅在開發模式下暴露除錯函式，避免擴大攻擊面
      if (DEBUG) {
        window.testWormhole = () => {
          console.log("=== Wormhole Pro Debug ===");
          const data = window.wormholeModule.getData();
          console.log("Groups:", data.groups);
          console.log("VIP Wormholes:", data.vipWormholes);
          console.log(
            "Total Wormholes:",
            window.wormholeModule.getAllWormholes().length,
          );
        };
      }
    } catch (err) {
      console.error("[Wormhole] Initialization failed:", err);
    }
  }


  // =========================================================================================
  // 模組 G ── Duplicate URL Checker（重複網址偵測）
  // 觸發：使用者在輸入框貼上 URL 時掃描目前頻道訊息，若重複則顯示 Banner 提示。
  // Token 來源：借用 window.wormholeModule._cachedToken（蟲洞 API 模式），零額外攔截。
  // =========================================================================================
  // 模組 H ── User Blacklist (mod_blacklist)
  // 對訊息右鍵加入黑名單 → MutationObserver 自動弱化該用戶的所有訊息
  // 作者識別：[class*="username_"]（探針確認，Discord 當前版本穩定）
  // =========================================================================================
  function initBlacklist() {
    const BL_STORE_KEY  = "blacklist_users";   // GMStore JSON 陣列
    const BL_MUTED_CLS  = "dmt-bl-muted";      // 注入到訊息容器的 class
    const BL_PANEL_ID   = "dmt-bl-panel";
    const MSG_SEL       = '[data-list-item-id*="chat-messages-"]';
    const AUTHOR_SEL    = '[class*="username_"]';
    // Ghost 樣式的 vanish timer：每個訊息容器獨立計時，4 秒後觸發飄走動畫
    const _ghostTimers  = new WeakMap();

    // ── CSS ─────────────────────────────────────────────────────────
    if (!document.getElementById("dmt-bl-style")) {
      const s = document.createElement("style");
      s.id = "dmt-bl-style";
      s.textContent = `
        /* ── Style 1: Ghost ─────────────────────────────────────────────
           等待期（delay ≥ 2s）：文字縮半、圖片壓縮、👻 搖擺於右上角
           等待期（delay < 2s）：跳過縮小、直接以原貌觸發飄走
           飄走：整列往上帶走 + opacity 淡出 + 高度平滑收攏
           飄走後：高度 0，pointer-events off，禁止互動               */

        /* ── 等待期基礎（共用）── */
        .dmt-bl-s1 {
          position: relative !important;
          will-change: transform, opacity;
        }

        /* ── 等待期「縮小」狀態（delay ≥ 2s 才套此 class）── */
        .dmt-bl-s1.dmt-ghost-shrunk {
          pointer-events: auto !important; /* 飄走前仍可互動 */
        }
        /* 文字縮為約一半 */
        .dmt-bl-s1.dmt-ghost-shrunk [id^="message-content-"] {
          font-size: 7px !important;
          line-height: 1.4 !important;
          color: #6d6f78 !important;
        }
        /* 用戶名縮小 */
        .dmt-bl-s1.dmt-ghost-shrunk [class*="username_"] {
          font-size: 10px !important;
          color: #6d6f78 !important;
          opacity: 0.7 !important;
        }
        /* 時間戳縮小 */
        .dmt-bl-s1.dmt-ghost-shrunk [class*="timestamp_"] {
          font-size: 9px !important;
          opacity: 0.4 !important;
        }
        /* 頭像縮小 + 灰化 */
        .dmt-bl-s1.dmt-ghost-shrunk [class*="avatar_"] {
          width:     22px !important;
          height:    22px !important;
          min-width: 22px !important;
          opacity: 0.45 !important;
          filter: grayscale(60%) !important;
        }
        /* 圖片 / 附件壓成縮圖佔位：隱藏原圖，用 ::after 顯示小縮圖符號 */
        .dmt-bl-s1.dmt-ghost-shrunk [class*="imageWrapper_"],
        .dmt-bl-s1.dmt-ghost-shrunk [class*="mediaAttachment_"],
        .dmt-bl-s1.dmt-ghost-shrunk [class*="embedWrapper_"],
        .dmt-bl-s1.dmt-ghost-shrunk [class*="attachmentInner_"] {
          width:   32px !important;
          height:  18px !important;
          overflow: hidden !important;
          opacity:  0.30 !important;
          filter:   grayscale(80%) !important;
          border-radius: 3px !important;
        }
        /* Reactions 和 thread button 隱藏 */
        .dmt-bl-s1.dmt-ghost-shrunk [class*="reactions_"],
        .dmt-bl-s1.dmt-ghost-shrunk [class*="threadButton_"],
        .dmt-bl-s1.dmt-ghost-shrunk [class*="buttonContainer_"] {
          display: none !important;
        }
        /* 👻 搖擺圖示：absolute 貼右上角 */
        .dmt-bl-s1.dmt-ghost-shrunk::after {
          content: "👻";
          position: absolute;
          top:   4px;
          right: 14px;
          font-size: 17px;
          pointer-events: none;
          animation: dmt-ghost-bob 5s ease-in-out infinite;
          transform-origin: center bottom;
          z-index: 1;
        }
        @keyframes dmt-ghost-bob {
          0%,100% { transform: translateY(0)   rotate(-5deg); }
          30%     { transform: translateY(-3px) rotate(3deg);  }
          60%     { transform: translateY(-5px) rotate(-2deg); }
        }

        /* ── 飄走動畫（ghost-carry：帶旋轉 + 淡出，比純 float-up 更「被帶走」） ── */
        @keyframes dmt-ghost-vanish {
          0%   { opacity: 0.55; transform: translateY(0)     rotate(0deg);   }
          5%   { opacity: 0.52; transform: translateY(-2px)  rotate(-6deg);  }
          100% { opacity: 0;    transform: translateY(-34px) rotate(-8deg);  }
        }
        .dmt-bl-s1.dmt-ghost-vanished {
          animation: dmt-ghost-vanish 1.5s cubic-bezier(.19, 1, .22, 1) forwards !important;
          pointer-events: none !important;
        }
        /* 飄走完成後：鎖定終態 */
        .dmt-bl-s1.dmt-ghost-done {
          height: 0 !important;
          min-height: 0 !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          margin-top: 0 !important;
          margin-bottom: 0 !important;
          overflow: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          transition: none !important;
        }

        /* ── Style 2: Collapse ──────────────────────────────────────────
           所有子元素完全隱藏，容器壓縮為純細線
           居中分隔線風格：文字在中間，兩側短線，不碰左右邊緣            */
        .dmt-bl-s2 {
          height: 14px !important;
          min-height: 0 !important;
          max-height: 14px !important;
          padding: 0 !important;
          margin: 0 !important;
          position: relative !important;
          cursor: pointer !important;
          overflow: visible !important;
          box-sizing: border-box !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        /* 所有直接子元素完全隱藏 */
        .dmt-bl-s2 > * {
          display: none !important;
          visibility: hidden !important;
        }
        /* 居中文字：絕對置中 */
        .dmt-bl-s2::before {
          content: "muted";
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          font-size: 7px;
          font-family: "gg sans", "Noto Sans", sans-serif;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(237,66,69,0.6);
          pointer-events: none;
          white-space: nowrap;
          z-index: 1;
          background: #000;
          padding: 0 8px;
        }
        /* 兩側細線：不碰左右邊，各留 48px */
        .dmt-bl-s2::after {
          content: "";
          position: absolute;
          top: 50%;
          left: 48px;
          right: 48px;
          height: 1px;
          background: rgba(79,84,92,0.35);
          pointer-events: none;
          z-index: 0;
        }
        /* hover 時：以對象名稱取代 "muted"（需 JS 寫入 data-dmt-author）*/
        .dmt-bl-s2:not(.dmt-bl-open):hover[data-dmt-author]::before {
          content: attr(data-dmt-author) " · muted";
          color: rgba(185,187,190,0.75);
          text-transform: none;
          letter-spacing: 0.04em;
        }
        /* ── Collapse 群組合併：同作者連續列整合為一 ──────────────────── */
        /* 被合併隱藏的前幾條（非代表列） */
        .dmt-bl-s2-merged {
          display: none !important;
        }
        /* 代表列（最後一條）：顯示訊息數量 badge */
        .dmt-bl-s2[data-dmt-count]::before {
          content: "muted × " attr(data-dmt-count);
        }
        /* hover 時合併代表列也顯示作者 */
        .dmt-bl-s2[data-dmt-count]:not(.dmt-bl-open):hover[data-dmt-author]::before {
          content: attr(data-dmt-author) " · " attr(data-dmt-count) " msgs";
        }
        /* 展開後完全恢復 */
        .dmt-bl-s2.dmt-bl-open {
          height: auto !important;
          min-height: revert !important;
          max-height: none !important;
          padding: revert !important;
          display: revert !important;
          overflow: visible !important;
        }
        .dmt-bl-s2.dmt-bl-open > * {
          display: revert !important;
          visibility: visible !important;
        }
        .dmt-bl-s2.dmt-bl-open::before,
        .dmt-bl-s2.dmt-bl-open::after {
          display: none !important;
        }

        /* ── Style 0: Dim（深度弱化 + 緊湊）──────────────────────────── */
        .dmt-bl-s0 {
          opacity: 0.04 !important;
          filter: grayscale(100%) !important;
          transition: opacity 0.5s, filter 0.5s;
          padding-top: 1px !important;
          padding-bottom: 1px !important;
        }
        .dmt-bl-s0 [class*="contents_"] {
          padding-top: 1px !important;
          padding-bottom: 1px !important;
        }
        /* peek：hover 進入感應區（左 200px），opacity 0.35 */
        /* hover 效果改由 JS mousemove 委派控制（限縮感應區域至容器左緣 200px 內）*/
        .dmt-bl-s0.dmt-bl-s0-peek {
          opacity: 0.35 !important;
          filter: grayscale(0%) !important;
        }
        /* reveal：頭像區（左 72px）停留 1.3s，完全點亮 */
        .dmt-bl-s0.dmt-bl-s0-reveal {
          opacity: 1 !important;
          filter: grayscale(0%) !important;
        }

        /* ── Style 4: Fog Strip ─────────────────────────────────────────
           比 Collapse 稍高（22px），indigo 色系文字，居中橫線
           文字比 Collapse 大、更易辨認；不可點擊展開（純視覺分隔）      */
        .dmt-bl-s4 {
          height: 22px !important;
          min-height: 0 !important;
          max-height: 22px !important;
          padding: 0 !important;
          margin: 0 !important;
          position: relative !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: default !important;
        }
        .dmt-bl-s4 > * {
          display: none !important;
          visibility: hidden !important;
        }
        /* 居中橫線 */
        .dmt-bl-s4::after {
          content: "";
          position: absolute;
          top: 50%; left: 48px; right: 48px;
          height: 1px;
          background: rgba(88,101,242,0.22);
          pointer-events: none;
          z-index: 0;
        }
        /* 中央文字：indigo 色，比 Collapse 的 7px 大（11px） */
        .dmt-bl-s4::before {
          content: attr(data-dmt-author);
          position: absolute; left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          font-size: 10px;
          font-family: "gg sans", "Noto Sans", sans-serif;
          letter-spacing: 0.10em;
          text-transform: uppercase;
          color: rgba(88,101,242,0.50);
          pointer-events: none;
          white-space: nowrap;
          z-index: 1;
          background: #313338;
          padding: 0 10px;
        }
        /* 無 data-dmt-author 時退回通用文字 */
        .dmt-bl-s4:not([data-dmt-author])::before,
        .dmt-bl-s4[data-dmt-author=""]::before {
          content: "ghost";
          letter-spacing: 0.14em;
        }

        /* ── Style 5: Redacted ──────────────────────────────────────────
           保留頭像（灰化）+ 用戶名 + 時間戳；文字替換為灰色佔位條
           傳達「知道有訊息但內容已消音」的概念感                         */
        .dmt-bl-s5 {
          opacity: 0.68 !important;
          pointer-events: none !important;
          cursor: default !important;
        }
        /* 頭像灰化 */
        .dmt-bl-s5 [class*="avatar_"] {
          filter: grayscale(100%) !important;
          opacity: 0.35 !important;
        }
        /* 訊息本文：隱藏，由 ::after 偽元素替換為佔位條 */
        .dmt-bl-s5 [id^="message-content-"],
        .dmt-bl-s5 [id^="message-accessories-"],
        .dmt-bl-s5 [class*="repliedMessage_"],
        .dmt-bl-s5 [class*="buttonContainer_"] {
          display: none !important;
        }
        /* 佔位條：注入在 cozyMessage 末尾 */
        .dmt-bl-s5 [class*="cozyMessage_"]::after,
        .dmt-bl-s5 [class*="compact_"]::after {
          content: "";
          display: block;
          height: 12px;
          border-radius: 3px;
          background: rgba(79,84,92,0.40);
          width: 55%;
          margin: 4px 0 6px;
          pointer-events: none;
        }
        /* 用戶名降低亮度 */
        .dmt-bl-s5 [class*="username_"] {
          opacity: 0.45 !important;
          font-size: 12px !important;
        }
        /* 時間戳更暗 */
        .dmt-bl-s5 [class*="timestamp_"] {
          opacity: 0.25 !important;
        }

        /* ── Style 6: Sidebar Stripe ────────────────────────────────────
           單行高度，左側 indigo 細邊框，整列壓縮至標題列（用戶名 + 時間）
           hover 點亮；空間效率高，適合不想看到訊息但想知道誰在說話      */
        .dmt-bl-s6 {
          opacity: 0.28 !important;
          border-left: 3px solid rgba(88,101,242,0.25) !important;
          padding-left: 13px !important;
          transition: opacity 0.25s ease, border-color 0.25s ease !important;
          cursor: default !important;
          pointer-events: none !important;
        }
        .dmt-bl-s6:hover {
          opacity: 0.70 !important;
          border-left-color: rgba(88,101,242,0.65) !important;
        }
        /* 隱藏本文、附件、引用、按鈕，只保留 header（用戶名 + 時間） */
        .dmt-bl-s6 [id^="message-content-"],
        .dmt-bl-s6 [id^="message-accessories-"],
        .dmt-bl-s6 [class*="repliedMessage_"],
        .dmt-bl-s6 [class*="buttonContainer_"],
        .dmt-bl-s6 [class*="reactions_"],
        .dmt-bl-s6 [class*="threadButton_"] {
          display: none !important;
        }
        /* 頭像縮小 */
        .dmt-bl-s6 [class*="avatar_"] {
          width:     22px !important;
          height:    22px !important;
          min-width: 22px !important;
          border-radius: 50% !important;
          opacity: 0.6 !important;
          filter: grayscale(40%) !important;
        }
        /* 用戶名縮小 */
        .dmt-bl-s6 [class*="username_"] {
          font-size: 11px !important;
        }
        /* cozyMessage 壓縮 padding */
        .dmt-bl-s6 [class*="cozyMessage_"],
        .dmt-bl-s6 [class*="compact_"] {
          padding-top: 1px !important;
          padding-bottom: 2px !important;
          min-height: 0 !important;
        }

        /* ── BOT 轉發靜音（自動規則，沿用 Dim 外觀）──────────────────────
           當 BOT 回覆黑名單對象時自動套用，視覺沿用 Dim（極暗 + 灰化）
           左側加橘色細邊框作為識別，提示「這是 BOT relay 被靜音」
           hover 行為與 Dim 完全一致（JS mousemove 委派，不用 CSS :hover）  */
        .dmt-bl-bot-relay {
          opacity: 0.05 !important;
          filter: grayscale(100%) !important;
          transition: opacity 0.5s, filter 0.5s !important;
          border-left: 2px solid rgba(242,153,74,0.18) !important;
        }
        /* peek：hover 進入感應區（左 200px），opacity 0.35 */
        .dmt-bl-bot-relay.dmt-bl-bot-relay-peek {
          opacity: 0.35 !important;
          filter: grayscale(0%) !important;
        }
        /* reveal：頭像區停留 1.3s，完全點亮 */
        .dmt-bl-bot-relay.dmt-bl-bot-relay-reveal {
          opacity: 1 !important;
          filter: grayscale(0%) !important;
        }

        /* ── 樣式選擇器浮層 ───────────────────────────────────────────── */
        @keyframes dmt-bl-picker-in {
          from { opacity:0; transform:translateY(6px) scale(.96); }
          to   { opacity:1; transform:none; }
        }
        /* Mute按鈕點亮動畫：選擇卡片後從灰暗升起 */
        @keyframes dmt-bl-confirm-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(88,101,242,0.6); }
          60%  { box-shadow: 0 0 0 6px rgba(88,101,242,0); }
          100% { box-shadow: 0 0 0 0 rgba(88,101,242,0); }
        }
        #dmt-bl-picker {
          position: fixed; z-index: 2147483648;
          background: rgba(22,23,26,0.97);
          border: 1px solid rgba(88,101,242,0.35);
          border-radius: 14px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.75);
          backdrop-filter: blur(16px);
          padding: 18px;
          width: 460px;
          max-height: calc(100vh - 24px); /* 上下各留 12px，永不超出 viewport */
          overflow-y: auto;
          overflow-x: hidden;
          font-family: sans-serif;
          animation: dmt-bl-picker-in 0.18s cubic-bezier(.19,1,.22,1) forwards;
        }
        #dmt-bl-picker::-webkit-scrollbar { width: 5px; }
        #dmt-bl-picker::-webkit-scrollbar-track { background: transparent; }
        #dmt-bl-picker::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.12); border-radius: 3px;
        }
        #dmt-bl-picker::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.22);
        }
        #dmt-bl-picker .picker-title {
          font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: rgba(185,187,190,0.5);
          margin-bottom: 12px;
        }
        /* ── "or" 抖動動畫 ── */
        @keyframes dmt-bl-or-shake {
          0%   { transform: scale(1)    rotate(0deg);  }
          15%  { transform: scale(1.18) rotate(-4deg); }
          30%  { transform: scale(1.22) rotate(3deg);  }
          45%  { transform: scale(1.20) rotate(-3deg); }
          60%  { transform: scale(1.15) rotate(2deg);  }
          75%  { transform: scale(1.10) rotate(-1deg); }
          100% { transform: scale(1.08) rotate(0deg);  }
        }
        /* ── cards 容器：group + or + temp ── */
        #dmt-bl-picker .picker-cards { display: flex; align-items: stretch; gap: 0; }
        /* ── 六張永久卡的 group 包裝：2 列 × 3 欄 grid ── */
        #dmt-bl-picker .picker-group {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; flex: 3;
          border: 1.5px solid rgba(255,255,255,0.10);
          border-radius: 9px; padding: 5px;
          background: rgba(255,255,255,0.02);
        }
        /* ── "or" 垂直分隔 ── */
        #dmt-bl-picker .picker-or {
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; width: 28px;
          font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: rgba(185,187,190,0.3);
          transition: color 0.25s;
          transform-origin: center;
        }
        #dmt-bl-picker .picker-or.active {
          color: rgba(185,187,190,0.8);
          animation: dmt-bl-or-shake 0.55s cubic-bezier(.19,1,.22,1) forwards;
        }
        /* ── 永久卡 ── */
        #dmt-bl-picker .picker-card {
          flex: 1; border-radius: 8px; padding: 10px 6px;
          background: transparent;
          border: 1px solid transparent;
          cursor: pointer; text-align: center;
          transition: border-color 0.15s, background 0.15s;
        }
        #dmt-bl-picker .picker-card:hover {
          border-color: rgba(88,101,242,0.55);
          background: rgba(88,101,242,0.1);
        }
        #dmt-bl-picker .picker-card.selected {
          border-color: rgba(88,101,242,0.8);
          background: rgba(88,101,242,0.18);
        }
        /* ── Temp 卡：初始灰暗，enabled 後顯現 ── */
        #dmt-bl-picker .picker-card-temp {
          flex: 1; border-radius: 8px; padding: 10px 6px;
          background: rgba(255,255,255,0.02);
          border: 1.5px solid rgba(255,255,255,0.07);
          cursor: default; text-align: center;
          opacity: 0.38; pointer-events: none;
          transition: border-color 0.2s, background 0.2s, opacity 0.2s;
        }
        #dmt-bl-picker .picker-card-temp.enabled {
          opacity: 1; cursor: pointer; pointer-events: auto;
        }
        #dmt-bl-picker .picker-card-temp.enabled:hover {
          border-color: rgba(242,153,74,0.6);
          background: rgba(242,153,74,0.1);
        }
        #dmt-bl-picker .picker-card-temp.selected {
          border-color: rgba(242,153,74,0.85);
          background: rgba(242,153,74,0.18);
        }
        #dmt-bl-picker .picker-icon { font-size: 20px; margin-bottom: 5px; }
        #dmt-bl-picker .picker-name {
          font-size: 12px; font-weight: 600;
          color: rgba(219,222,225,0.9); margin-bottom: 3px;
        }
        #dmt-bl-picker .picker-desc {
          font-size: 11px; color: rgba(185,187,190,0.55); line-height: 1.4;
        }
        /* ── 預覽區 ── */
        #dmt-bl-picker .picker-preview {
          background: rgba(0,0,0,0.28);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          padding: 8px 12px;
          margin: 6px 0 4px;
          min-height: 56px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          overflow: hidden;
        }
        #dmt-bl-picker .picker-preview-label {
          font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase;
          color: rgba(185,187,190,0.30); margin-bottom: 4px; flex-shrink: 0;
        }
        #dmt-bl-picker .pv-msg {
          display: flex; gap: 8px; align-items: flex-start;
        }
        #dmt-bl-picker .pv-av {
          width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 600; color: #fff;
        }
        #dmt-bl-picker .pv-name { font-size: 11px; font-weight: 600; margin-bottom: 1px; }
        #dmt-bl-picker .pv-text { font-size: 11px; line-height: 1.35; }
        /* ── Ghost 等待期縮小 ── */
        #dmt-bl-picker .pv-ghost-shrunk .pv-text { font-size: 6px !important; color: #6d6f78 !important; }
        #dmt-bl-picker .pv-ghost-shrunk .pv-name { font-size: 9px !important; color: #6d6f78 !important; }
        #dmt-bl-picker .pv-ghost-shrunk .pv-av   { width:18px !important; height:18px !important; font-size:8px !important; opacity:.4 !important; filter:grayscale(60%) !important; }
        #dmt-bl-picker .pv-ghost-icon { font-size:13px; display:inline-block; vertical-align:middle; margin-right:3px; animation:dmt-ghost-bob 5s ease-in-out infinite; transform-origin:center bottom; }
        /* ── Ghost 飄走 ── */
        #dmt-bl-picker .pv-ghost { opacity: 0.75; will-change: transform, opacity; }
        @keyframes pv-floatup {
          0%   { opacity: 0.75; transform: translateY(0)     rotate(0deg);  }
          5%   { opacity: 0.70; transform: translateY(-2px)  rotate(-6deg); }
          100% { opacity: 0;    transform: translateY(-28px) rotate(-8deg); }
        }
        #dmt-bl-picker .pv-ghost.pv-go {
          animation: pv-floatup 1.3s cubic-bezier(.19,1,.22,1) forwards;
        }
        /* ── Collapse：hover 模擬展開 ── */
        #dmt-bl-picker .pv-collapse {
          height: 16px; position: relative; overflow: hidden; flex-shrink: 0;
          cursor: pointer; transition: height 0.3s cubic-bezier(.4,0,.2,1);
        }
        #dmt-bl-picker .pv-collapse::before {
          content: ""; position: absolute; top: 8px; left: 0; right: 0;
          height: 1px; background: rgba(88,101,242,0.25); transition: opacity 0.2s;
        }
        #dmt-bl-picker .pv-collapse::after {
          content: "collapsed · hover to expand";
          position: absolute; left: 50%; top: 8px;
          transform: translate(-50%, -50%);
          font-size: 8px; letter-spacing: .1em; text-transform: uppercase;
          color: rgba(88,101,242,0.5); background: rgba(22,23,26,0.95); padding: 0 6px;
          white-space: nowrap; transition: opacity 0.2s;
        }
        #dmt-bl-picker .pv-collapse:hover { height: 38px; }
        #dmt-bl-picker .pv-collapse:hover::before,
        #dmt-bl-picker .pv-collapse:hover::after { opacity: 0; }
        #dmt-bl-picker .pv-collapse .pv-expanded {
          position: absolute; top: 4px; left: 0; right: 0;
          display: flex; gap: 6px; align-items: flex-start;
          opacity: 0; transition: opacity 0.2s 0.15s;
        }
        #dmt-bl-picker .pv-collapse:hover .pv-expanded { opacity: 1; }
        /* ── Dim：hover 點亮 ── */
        #dmt-bl-picker .pv-dim {
          opacity: 0.06; filter: grayscale(100%); cursor: pointer;
          transition: opacity 0.35s ease, filter 0.35s ease;
        }
        #dmt-bl-picker .pv-dim:hover { opacity: 0.55; filter: grayscale(0%); }
        /* ── Fog Strip ── */
        #dmt-bl-picker .pv-fog {
          height: 16px; position: relative; overflow: hidden; flex-shrink: 0;
        }
        #dmt-bl-picker .pv-fog::before {
          content: ""; position: absolute; top: 50%; left: 0; right: 0;
          height: 1px; background: rgba(88,101,242,0.22);
        }
        #dmt-bl-picker .pv-fog::after {
          content: attr(data-name);
          position: absolute; left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          font-size: 8px; letter-spacing: .10em; text-transform: uppercase;
          color: rgba(88,101,242,0.5); background: rgba(22,23,26,0.95); padding: 0 6px;
          white-space: nowrap;
        }
        /* ── Redacted：shimmer 呼吸 ── */
        #dmt-bl-picker .pv-redacted { opacity: 0.65; }
        #dmt-bl-picker .pv-redacted .pv-av { filter: grayscale(100%); opacity: 0.3; }
        #dmt-bl-picker .pv-redacted .pv-name { font-size: 10px; color: #6d6f78; }
        @keyframes pv-shimmer {
          0%,100% { width: 62%; opacity: 0.40; }
          50%      { width: 46%; opacity: 0.20; }
        }
        #dmt-bl-picker .pv-redacted-bar {
          height: 10px; border-radius: 3px; background: #3a3b40; display: block;
          animation: pv-shimmer 2.2s ease-in-out infinite;
        }
        /* ── Sidebar：hover 點亮 ── */
        #dmt-bl-picker .pv-sidebar {
          border-left: 3px solid rgba(88,101,242,0.22);
          padding-left: 8px; opacity: 0.28; align-items: center; cursor: pointer;
          transition: opacity 0.25s ease, border-color 0.25s ease;
        }
        #dmt-bl-picker .pv-sidebar:hover { opacity: 0.75; border-left-color: rgba(88,101,242,0.65); }
        #dmt-bl-picker .pv-sidebar .pv-av { width: 18px; height: 18px; font-size: 8px; }
        #dmt-bl-picker .pv-sidebar .pv-name { font-size: 10px; color: #949ba4; margin: 0; }
        /* Mute 確認按鈕：預設灰暗 */
        #dmt-bl-picker .picker-confirm {
          margin-top: 10px; width: 100%;
          background: rgba(88,101,242,0.25);
          border: 1px solid rgba(88,101,242,0.3);
          border-radius: 7px;
          color: rgba(255,255,255,0.45); font-size: 12px; font-weight: 600;
          padding: 7px 0; cursor: pointer;
          transition: background 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s;
        }
        /* 選擇卡片後點亮 */
        #dmt-bl-picker .picker-confirm.lit {
          background: rgba(88,101,242,0.85);
          border-color: rgba(88,101,242,0.9);
          color: #fff;
          animation: dmt-bl-confirm-pulse 0.5s ease-out;
        }
        #dmt-bl-picker .picker-confirm.lit:hover {
          background: rgba(88,101,242,1);
        }
        /* ── Temp 時間選擇區 ── */
        #dmt-bl-picker .picker-temp-section {
          overflow: hidden; max-height: 0;
          transition: max-height 0.25s ease, opacity 0.2s ease;
          opacity: 0;
        }
        #dmt-bl-picker .picker-temp-section.open {
          max-height: 160px; opacity: 1;
        }
        #dmt-bl-picker .picker-temp-divider {
          border: none; border-top: 1px solid rgba(255,255,255,0.07);
          margin: 9px 0 7px;
        }
        #dmt-bl-picker .picker-temp-label {
          font-size: 9px; color: rgba(185,187,190,0.4);
          letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px;
        }
        #dmt-bl-picker .picker-chips {
          display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px;
        }
        #dmt-bl-picker .picker-chip {
          padding: 3px 9px; border-radius: 12px; font-size: 10px; font-weight: 600;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          color: rgba(219,222,225,0.75); cursor: pointer;
          transition: background 0.12s, border-color 0.12s, color 0.12s;
        }
        #dmt-bl-picker .picker-chip:hover {
          background: rgba(88,101,242,0.22); border-color: rgba(88,101,242,0.6);
          color: #c0c5f7;
        }
        #dmt-bl-picker .picker-chip.active {
          background: rgba(88,101,242,0.35); border-color: rgba(88,101,242,0.8);
          color: #c0c5f7;
        }
        #dmt-bl-picker .picker-time-input {
          width: 100%; background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.14); border-radius: 6px;
          padding: 5px 8px; font-size: 11px; color: rgba(219,222,225,0.9);
          outline: none; box-sizing: border-box;
        }
        #dmt-bl-picker .picker-time-input::placeholder { color: rgba(185,187,190,0.35); }
        #dmt-bl-picker .picker-time-input:focus {
          border-color: rgba(88,101,242,0.6); background: rgba(88,101,242,0.08);
        }
        #dmt-bl-picker .picker-time-parsed {
          font-size: 9px; color: rgba(88,101,242,0.75); margin-top: 4px; min-height: 12px;
        }
        #dmt-bl-picker .picker-time-parsed.err { color: rgba(237,66,69,0.7); }

        /* ── picker 標題列（flex，齒輪右對齊） ─────────────────────── */
        #dmt-bl-picker .picker-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 10px;
        }
        #dmt-bl-picker .picker-gear-btn {
          width: 28px; height: 28px; border-radius: 6px;
          background: transparent; border: none;
          color: rgba(185,187,190,0.45); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: background 0.15s, color 0.15s, transform 0.3s;
        }
        #dmt-bl-picker .picker-gear-btn:hover {
          background: rgba(88,101,242,0.15); color: #a5adfa;
        }
        #dmt-bl-picker .picker-gear-btn.active {
          background: rgba(88,101,242,0.22); color: #a5adfa;
          transform: rotate(90deg);
        }

        /* ── 設定頁面（預設隱藏，切換時顯示） ──────────────────────── */
        #dmt-bl-picker .picker-settings {
          display: none; flex-direction: column; gap: 0;
          animation: dmt-bl-picker-in 0.15s ease both;
        }
        #dmt-bl-picker .picker-settings.open { display: flex; }

        /* ── Tab 列 ─────────────────────────────────────────────────── */
        #dmt-bl-picker .pset-tabs {
          display: flex; gap: 2px;
          background: rgba(255,255,255,0.04); border-radius: 7px;
          padding: 3px; margin-bottom: 10px;
        }
        #dmt-bl-picker .pset-tab {
          flex: 1; padding: 4px 0; font-size: 11px; font-weight: 600;
          text-align: center; border-radius: 5px; cursor: pointer;
          color: rgba(185,187,190,0.5);
          transition: background 0.15s, color 0.15s;
        }
        #dmt-bl-picker .pset-tab.active {
          background: rgba(88,101,242,0.35); color: #c0c5f7;
        }
        #dmt-bl-picker .pset-tab:not(.active):hover {
          background: rgba(255,255,255,0.07); color: rgba(219,222,225,0.8);
        }

        /* ── Tab 內容頁 ─────────────────────────────────────────────── */
        #dmt-bl-picker .pset-page { display: none; flex-direction: column; gap: 6px; }
        #dmt-bl-picker .pset-page.active {
          display: flex;
          min-height: 120px;
          max-height: 280px;
          overflow: visible;  /* 必須 visible，讓絕對定位的下拉選單能溢出容器 */
        }
        /* scrollbar 移至 pset-list 層（實際捲動的容器） */
        #dmt-bl-picker .pset-page.active::-webkit-scrollbar { width: 0; }

        /* ── 名單列表 ───────────────────────────────────────────────── */
        #dmt-bl-picker .pset-list {
          display: flex; flex-direction: column; gap: 2px;
          max-height: 280px;
          overflow-y: auto;   /* 捲動責任下移至此層 */
          overflow-x: visible;
        }
        #dmt-bl-picker .pset-list::-webkit-scrollbar { width: 4px; }
        #dmt-bl-picker .pset-list::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.12); border-radius: 2px;
        }
        #dmt-bl-picker .pset-row {
          display: flex; align-items: center; gap: 6px;
          padding: 5px 6px; border-radius: 5px;
          background: rgba(255,255,255,0.03); position: relative;
        }
        #dmt-bl-picker .pset-row:hover { background: rgba(255,255,255,0.07); }
        #dmt-bl-picker .pset-row-name {
          flex: 1; font-size: 12px; color: #dbdee1;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        #dmt-bl-picker .pset-row-badge {
          font-size: 10px; color: rgba(185,187,190,0.55); flex-shrink: 0;
          padding: 2px 5px; border-radius: 4px; cursor: pointer;
          border: 1px solid transparent; transition: background 0.12s, border-color 0.12s;
          position: relative;
        }
        #dmt-bl-picker .pset-row-badge:hover {
          background: rgba(88,101,242,0.15); border-color: rgba(88,101,242,0.35);
          color: #a5adfa;
        }
        #dmt-bl-picker .pset-row-badge.temp-badge {
          color: #f4a04a; border-color: rgba(242,153,74,0.25);
          background: rgba(242,153,74,0.08);
        }
        #dmt-bl-picker .pset-row-badge.temp-badge:hover {
          background: rgba(242,153,74,0.2); border-color: rgba(242,153,74,0.5);
        }
        /* body 掛載（脫離 picker stacking context），selector 不依賴父層 */
        .pset-style-dropdown {
          position: fixed;
          background: #1e1f22; border: 1px solid rgba(88,101,242,0.4);
          border-radius: 7px; box-shadow: 0 8px 20px rgba(0,0,0,0.6);
          z-index: 2147483649; overflow: hidden; min-width: 120px;
          animation: dmt-bl-picker-in 0.12s ease both;
        }
        .pset-style-opt {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 10px; font-size: 11px; color: #dbdee1;
          cursor: pointer; transition: background 0.1s; white-space: nowrap;
        }
        .pset-style-opt:hover { background: rgba(88,101,242,0.18); }
        .pset-style-opt.active { color: #a5adfa; background: rgba(88,101,242,0.1); }
        /* +30m 延長按鈕 */
        #dmt-bl-picker .pset-extend-btn {
          font-size: 9px; font-weight: 600; flex-shrink: 0;
          padding: 2px 5px; border-radius: 4px; cursor: pointer;
          background: rgba(242,153,74,0.1); border: 1px solid rgba(242,153,74,0.3);
          color: #f4a04a; transition: background 0.12s; white-space: nowrap;
        }
        #dmt-bl-picker .pset-extend-btn:hover { background: rgba(242,153,74,0.28); }
        #dmt-bl-picker .pset-row-del {
          width: 18px; height: 18px; border-radius: 4px; flex-shrink: 0;
          background: rgba(237,66,69,0.12); border: 1px solid rgba(237,66,69,0.25);
          color: rgba(237,66,69,0.7); cursor: pointer; font-size: 12px;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.12s, color 0.12s;
        }
        #dmt-bl-picker .pset-row-del:hover {
          background: rgba(237,66,69,0.3); color: #fff;
        }
        #dmt-bl-picker .pset-empty {
          font-size: 11px; color: rgba(185,187,190,0.4);
          text-align: center; padding: 16px 0;
        }
        #dmt-bl-picker .pset-clear-btn {
          align-self: flex-end; font-size: 10px; font-weight: 600;
          padding: 3px 10px; border-radius: 5px;
          background: rgba(237,66,69,0.1); border: 1px solid rgba(237,66,69,0.25);
          color: rgba(237,66,69,0.7); cursor: pointer;
          transition: background 0.12s, color 0.12s;
        }
        #dmt-bl-picker .pset-clear-btn:hover {
          background: rgba(237,66,69,0.28); color: #fff;
        }

        /* ── 樣式設定區 ─────────────────────────────────────────────── */
        #dmt-bl-picker .pset-setting-row {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        #dmt-bl-picker .pset-setting-row:last-child { border-bottom: none; }
        #dmt-bl-picker .pset-setting-label {
          flex: 1; font-size: 11px; color: rgba(185,187,190,0.75);
        }
        #dmt-bl-picker .pset-setting-input {
          width: 52px; text-align: center;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14);
          border-radius: 5px; padding: 3px 5px; font-size: 12px;
          color: rgba(219,222,225,0.9); outline: none;
        }
        #dmt-bl-picker .pset-setting-input:focus {
          border-color: rgba(88,101,242,0.6); background: rgba(88,101,242,0.08);
        }
        #dmt-bl-picker .pset-setting-unit {
          font-size: 10px; color: rgba(185,187,190,0.4); flex-shrink: 0;
        }

        /* ── 管理面板 ── */
        @keyframes dmt-bl-in  { from { opacity:0; transform:translateY(8px) scale(.97); } to { opacity:1; transform:none; } }
        @keyframes dmt-bl-out { from { opacity:1; transform:none; } to { opacity:0; transform:translateY(6px) scale(.97); } }
        #${BL_PANEL_ID} {
          position: fixed; z-index: 2147483601;
          width: 360px; max-height: 480px;
          display: flex; flex-direction: column;
          background: rgba(24,25,28,0.96);
          border: 1px solid rgba(88,101,242,0.28);
          border-radius: 12px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(88,101,242,0.08);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          font-family: sans-serif;
          animation: dmt-bl-in 0.2s cubic-bezier(.19,1,.22,1) forwards;
          overflow: hidden;
        }
        #${BL_PANEL_ID}.dmt-bl-leaving {
          animation: dmt-bl-out 0.18s cubic-bezier(.4,0,1,1) forwards !important;
          pointer-events: none;
        }
        #${BL_PANEL_ID} .bl-header {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 14px 8px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        #${BL_PANEL_ID} .bl-title {
          font-size: 12px; font-weight: 700;
          color: rgba(185,187,190,0.7); letter-spacing: 0.06em;
          text-transform: uppercase; flex: 1;
        }
        #${BL_PANEL_ID} .bl-close {
          background:none; border:none; cursor:pointer;
          color:rgba(185,187,190,0.6); font-size:16px; line-height:1;
          padding:0 2px; transition:color .15s;
        }
        #${BL_PANEL_ID} .bl-close:hover { color:#fff; }
        #${BL_PANEL_ID} .bl-list {
          flex: 1; overflow-y: auto; padding: 6px 8px;
          min-height: 0;
        }
        #${BL_PANEL_ID} .bl-list::-webkit-scrollbar { width: 4px; }
        #${BL_PANEL_ID} .bl-list::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1); border-radius: 2px;
        }
        #${BL_PANEL_ID} .bl-row {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 8px; border-radius: 7px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          transition: background .12s; position: relative;
        }
        #${BL_PANEL_ID} .bl-row:last-child { border-bottom: none; }
        #${BL_PANEL_ID} .bl-row:hover { background: rgba(88,101,242,0.07); }
        #${BL_PANEL_ID} .bl-name {
          flex: 1; font-size: 13px; color: #dbdee1;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        #${BL_PANEL_ID} .bl-style-badge {
          font-size: 9px; font-weight: 600; letter-spacing: 0.06em;
          text-transform: uppercase; padding: 2px 6px; border-radius: 4px;
          cursor: pointer; flex-shrink: 0; transition: background 0.15s;
          background: rgba(88,101,242,0.15); border: 1px solid rgba(88,101,242,0.3);
          color: #9ea6f5; position: relative;
        }
        #${BL_PANEL_ID} .bl-style-badge:hover { background: rgba(88,101,242,0.3); }

        /* body 掛載（脫離 panel stacking context），selector 不依賴父層 */
        .bl-style-dropdown {
          position: fixed;
          background: #1e1f22; border: 1px solid rgba(88,101,242,0.4);
          border-radius: 7px; box-shadow: 0 8px 24px rgba(0,0,0,0.6);
          z-index: 2147483648; overflow: hidden; min-width: 120px;
          animation: dmt-bl-picker-in 0.14s ease both;
        }
        .bl-style-opt {
          display: flex; align-items: center; gap: 7px;
          padding: 7px 10px; font-size: 12px; color: #dbdee1;
          cursor: pointer; transition: background 0.1s;
          white-space: nowrap;
        }
        .bl-style-opt:hover { background: rgba(88,101,242,0.18); }
        .bl-style-opt.active { color: #a5adfa; background: rgba(88,101,242,0.12); }

        #${BL_PANEL_ID} .bl-temp-badge {
          background: rgba(242,153,74,0.15); border-color: rgba(242,153,74,0.4);
          color: #f4a04a; cursor: default; letter-spacing: 0.03em;
          text-transform: none; position: relative;
        }
        /* Temp badge 可點擊切換樣式 */
        #${BL_PANEL_ID} .bl-temp-badge.switchable {
          cursor: pointer;
        }
        #${BL_PANEL_ID} .bl-temp-badge.switchable:hover { background: rgba(242,153,74,0.3); }

        /* ── Temp 延長按鈕 ── */
        #${BL_PANEL_ID} .bl-extend-btn {
          background: rgba(242,153,74,0.1); border: 1px solid rgba(242,153,74,0.3);
          border-radius: 4px; color: #f4a04a; font-size: 10px;
          padding: 2px 5px; cursor: pointer; flex-shrink: 0;
          transition: background .12s; white-space: nowrap;
        }
        #${BL_PANEL_ID} .bl-extend-btn:hover { background: rgba(242,153,74,0.28); }

        #${BL_PANEL_ID} .bl-date {
          font-size: 10px; color: rgba(185,187,190,0.4); flex-shrink: 0;
        }
        #${BL_PANEL_ID} .bl-remove {
          background: rgba(237,66,69,0.1);
          border: 1px solid rgba(237,66,69,0.25);
          border-radius: 5px; color: #f57879;
          font-size: 11px; padding: 2px 7px; cursor: pointer;
          flex-shrink: 0; transition: background .15s;
        }
        #${BL_PANEL_ID} .bl-remove:hover { background: rgba(237,66,69,0.3); }
        #${BL_PANEL_ID} .bl-empty {
          text-align: center; padding: 28px 0;
          color: rgba(185,187,190,0.4); font-size: 12px;
        }
        #${BL_PANEL_ID} .bl-footer {
          display: flex; align-items: center; justify-content: space-between;
          padding: 6px 14px;
          border-top: 1px solid rgba(255,255,255,0.06);
          font-size: 10px; color: rgba(185,187,190,0.35); flex-shrink: 0;
        }
      `;
      document.head.appendChild(s);
    }

    // ── 儲存讀寫 ─────────────────────────────────────────────────────
    // 儲存格式：{ name, addedAt, style, expiresAt? }
    //   style: 2=Collapse(預設), 1=Ghost, 0=Dim, 99=Temp（臨時，使用 Collapse 外觀）
    //   expiresAt: ISO 字串（Temp 模式）或 undefined（永久）
    const BL_STYLES = {
      1: { cls: "dmt-bl-s1", icon: "👻", name: "Ghost" },
      2: { cls: "dmt-bl-s2", icon: "━",  name: "Collapse" },
      0: { cls: "dmt-bl-s0", icon: "🌫", name: "Dim" },
      4: { cls: "dmt-bl-s4", icon: "〰", name: "Fog Strip" },
      5: { cls: "dmt-bl-s5", icon: "▬",  name: "Redacted" },
      6: { cls: "dmt-bl-s6", icon: "▎",  name: "Sidebar" },
    };
    const BL_TEMP_STYLE_ID = 99; // Temp 使用 Collapse (style 2) 外觀
    const BL_ALL_CLS = [...Object.values(BL_STYLES).map(s => s.cls), "dmt-bl-bot-relay"];

    // ── BOT 轉發規則：偵測 BOT 回覆靜音對象的訊息，自動套用靜音 ─────────────
    // 啟用條件：GMStore "bl_bot_relay" === true
    // 規則：訊息為 BOT + 有 repliedMessage_ + 被回覆者在黑名單 → 套用 dmt-bl-bot-relay
    //       緊接在後、同 BOT 的連續訊息（無 groupStart_）也一併套用
    const BOT_TAG_SEL     = '[class*="botTag"]';
    const REPLY_SEL       = '[class*="repliedMessage_"]';
    const REPLY_USER_SEL  = '[class*="repliedMessage_"] [class*="username_"]';
    const GROUP_START_SEL = '[class*="groupStart_"]';

    function _applyBotRelay(container, nameMap) {
      if (!GMStore.get("bl_bot_relay", true)) return false;
      // 只處理尚未被黑名單直接命中的訊息
      if (BL_ALL_CLS.some(c => c !== "dmt-bl-bot-relay" && container.classList.contains(c))) return false;
      // 必須是 BOT 且有回覆
      if (!container.querySelector(BOT_TAG_SEL)) return false;
      const replyEl = container.querySelector(REPLY_SEL);
      if (!replyEl) return false;
      // 取得被回覆者名稱
      const replyUserEl = replyEl.querySelector('[class*="username_"]');
      if (!replyUserEl) return false;
      const repliedTo = replyUserEl.dataset.text || replyUserEl.textContent.replace(/^@/, "").trim();
      if (!nameMap.has(repliedTo)) return false;
      // 命中：套用 bot-relay class
      container.classList.add("dmt-bl-bot-relay");
      return true;
    }

    function _applyBotRelayFollowUps(container, nameMap) {
      // 對「groupStart_ BOT 轉發」後的連續訊息（同 BOT、無 groupStart_）也套用
      if (!GMStore.get("bl_bot_relay", true)) return;
      // container 必須是一個 groupStart_ BOT 訊息且已命中 relay
      if (!container.classList.contains("dmt-bl-bot-relay")) return;
      const li = container.closest("li");
      if (!li) return;
      let nextLi = li.nextElementSibling;
      let followUpCount = 0;
      const MAX_RELAY_FOLLOWUPS = 8;
      while (nextLi && followUpCount < MAX_RELAY_FOLLOWUPS) {
        const next = nextLi.querySelector?.(MSG_SEL);
        if (!next) break;
        // 若下一則是新的 groupStart_，不同發話者，停止
        if (next.matches(GROUP_START_SEL)) break;
        // 確認是同一 BOT（無 groupStart_ 且無自己的 repliedMessage_ 代替）
        if (next.querySelector(BOT_TAG_SEL) && !next.querySelector(REPLY_SEL)) {
          next.classList.add("dmt-bl-bot-relay");
        } else {
          break;
        }
        followUpCount++;
        nextLi = nextLi.nextElementSibling;
      }
    }

    function blLoad() {
      return GMStore.get(BL_STORE_KEY, [], true) || [];
    }
    function blSave(arr) {
      GMStore.set(BL_STORE_KEY, arr, true);
    }
    function blAdd(name, style = 2, expiresAt = null) {
      const list = blLoad();
      if (list.some(u => u.name === name)) return false;
      const entry = { name, addedAt: new Date().toISOString(), style };
      if (expiresAt) entry.expiresAt = expiresAt;
      list.push(entry);
      blSave(list);
      return true;
    }
    function blRemove(name) {
      blSave(blLoad().filter(u => u.name !== name));
    }
    function blHas(name) {
      return blLoad().some(u => u.name === name);
    }
    function blGetStyle(name) {
      return blLoad().find(u => u.name === name)?.style ?? 2;
    }
    function blGetExpiresAt(name) {
      return blLoad().find(u => u.name === name)?.expiresAt ?? null;
    }
    function blSetStyle(name, style) {
      const list = blLoad();
      const entry = list.find(u => u.name === name);
      if (entry) { entry.style = style; blSave(list); }
    }

    // ── DOM 套用 / 解除 ──────────────────────────────────────────────
    // Discord 訊息結構（探針 v2026-05-07 確認）：
    //   OL.scrollerInner > LI.messageListItem > [data-list-item-id]
    // 連續訊息的 [data-list-item-id] 沒有 username_，
    // 且 previousElementSibling 在容器層是 undefined（各自被 LI 包住）。
    // 正確做法：往上找 LI，再找前一個 LI 兄弟，再往內取訊息容器。

    // 從單一容器取出「真正的作者名」（排除 reply 預覽區塊）
    function _getOwnAuthor(container) {
      const replyBlock = container.querySelector('[class*="repliedMessage_"]');
      const candidates = container.querySelectorAll(AUTHOR_SEL);
      for (const el of candidates) {
        if (replyBlock && replyBlock.contains(el)) continue;
        const name = el.textContent.trim();
        if (name) return name;
      }
      return null;
    }

    function _resolveAuthor(container) {
      const own = _getOwnAuthor(container);
      if (own) return own;
      let li = container.closest("li");
      if (!li) return null;
      let prevLi = li.previousElementSibling;
      while (prevLi) {
        const prevContainer = prevLi.querySelector(MSG_SEL);
        if (prevContainer) {
          const a = _getOwnAuthor(prevContainer);
          if (a) return a;
        }
        prevLi = prevLi.previousElementSibling;
      }
      return null;
    }

    // 套用樣式到單一容器（先清除所有舊 style class 再加新的）
    // authorName：Collapse / Fog Strip hover tooltip 用，寫入 data-dmt-author；空字串則清除屬性
    function _applyStyle(container, styleId, authorName = "") {
      // 取消 Ghost 計時器（vanish timer 或 done timer）
      if (_ghostTimers.has(container)) {
        clearTimeout(_ghostTimers.get(container));
        _ghostTimers.delete(container);
      }
      BL_ALL_CLS.forEach(c => container.classList.remove(c));
      container.classList.remove(
        "dmt-bl-open", "dmt-ghost-vanished", "dmt-ghost-done", "dmt-ghost-shrunk"
      );
      // 清除 Ghost 高度過渡留下的 inline style
      container.style.cssText = "";
      // 清除 👻 ghost icon DOM 節點
      if (container._dmt_ghostIcon) {
        container._dmt_ghostIcon.remove();
        delete container._dmt_ghostIcon;
      }
      // 寫入 / 清除 data-dmt-author（供 Collapse / Fog Strip hover CSS 讀取）
      if (authorName) {
        container.dataset.dmtAuthor = authorName;
      } else {
        delete container.dataset.dmtAuthor;
      }
      const def = BL_STYLES[styleId === BL_TEMP_STYLE_ID ? 2 : styleId];
      if (def) container.classList.add(def.cls);
      // ── Ghost 三段式時序 ────────────────────────────────────────────────
      if (styleId === 1) {
        const delayMs  = Math.min(10, Math.max(1, GMStore.get("bl_ghost_delay", 4))) * 1000;
        const VANISH_MS = 1500; // 飄走動畫本身固定 1.5s
        const HAS_SHRINK = delayMs >= 2000; // delay < 2s 跳過縮小等待期

        // ── Phase 1：縮小等待期（僅 delay ≥ 2s）──────────────────────────
        if (HAS_SHRINK) {
          container.classList.add("dmt-ghost-shrunk");

          // 注入 👻 ghost icon（名稱前）：inline，隨訊息縮小一起顯示
          const ghostIcon = document.createElement("span");
          ghostIcon.className = "dmt-ghost-icon";
          ghostIcon.textContent = "👻";
          ghostIcon.style.cssText = [
            "font-size:13px",
            "pointer-events:none",
            "animation:dmt-ghost-bob 5s ease-in-out infinite",
            "transform-origin:center bottom",
            "display:inline-block",
            "vertical-align:middle",
            "margin-right:3px",
            "line-height:1",
          ].join(";");
          const replyBlock  = container.querySelector('[class*="repliedMessage_"]');
          const usernameEls = container.querySelectorAll(AUTHOR_SEL);
          let targetUsername = null;
          for (const el of usernameEls) {
            if (replyBlock && replyBlock.contains(el)) continue;
            targetUsername = el;
            break;
          }
          if (targetUsername) {
            targetUsername.parentNode.insertBefore(ghostIcon, targetUsername);
          } else {
            container.appendChild(ghostIcon);
          }
          container._dmt_ghostIcon = ghostIcon;
        }

        // ── Phase 2：飄走觸發（在 delayMs 後）─────────────────────────────
        const vanishTimer = setTimeout(() => {
          _ghostTimers.delete(container);

          // 鎖定當前（縮小後）高度，不移除 shrunk——保持縮小狀態飄走，避免瞬間放大的頓感
          const fullH = container.scrollHeight;
          container.style.height   = fullH + "px";
          container.style.overflow = "hidden";

          // 單一 transition 設定：高度收攏延遲 0.35s（飄走開始後才收），duration 0.9s
          // opacity 與飄走同步從 0s 開始，讓整體感覺是「淡出帶走」
          container.style.transition = [
            "height 0.9s cubic-bezier(.4,0,.2,1) 0.35s",
            "padding-top 0.9s cubic-bezier(.4,0,.2,1) 0.35s",
            "padding-bottom 0.9s cubic-bezier(.4,0,.2,1) 0.35s",
            "margin-top 0.9s cubic-bezier(.4,0,.2,1) 0.35s",
            "margin-bottom 0.9s cubic-bezier(.4,0,.2,1) 0.35s",
          ].join(",");

          // 單次 rAF 啟動 height collapse（簡化雙 rAF，減少 layout thrash 頓點）
          requestAnimationFrame(() => {
            container.style.height        = "0";
            container.style.paddingTop    = "0";
            container.style.paddingBottom = "0";
            container.style.marginTop     = "0";
            container.style.marginBottom  = "0";
          });

          // 啟動飄走 CSS animation（shrunk class 保留，讓動畫從縮小尺寸起飛）
          container.classList.add("dmt-ghost-vanished");

          // ── Phase 3：收尾鎖定 ─────────────────────────────────────────
          const doneTimer = setTimeout(() => {
            container.classList.add("dmt-ghost-done");
            container.style.cssText = "";
          }, VANISH_MS + 100);

          _ghostTimers.set(container, doneTimer);
        }, delayMs);

        _ghostTimers.set(container, vanishTimer);
      }
    }

    function blApplyAll() {
      const list = blLoad();
      const nameMap = new Map(list.map(u => [u.name, u.style ?? 2]));
      document.querySelectorAll(MSG_SEL).forEach(container => {
        const name = _resolveAuthor(container);
        if (!name) return;
        if (nameMap.has(name)) {
          _applyStyle(container, nameMap.get(name), name);
        } else {
          BL_ALL_CLS.forEach(c => container.classList.remove(c));
          container.classList.remove("dmt-bl-open");
          delete container.dataset.dmtAuthor;
          // BOT 轉發偵測（僅在非黑名單訊息上）
          if (_applyBotRelay(container, nameMap)) {
            _applyBotRelayFollowUps(container, nameMap);
          }
        }
      });
      _mergeCollapseGroups();
    }

    function blApplyNode(container) {
      const list = blLoad();
      const nameMap = new Map(list.map(u => [u.name, u.style ?? 2]));
      const name = _resolveAuthor(container);
      if (!name) return;
      if (nameMap.has(name)) {
        _applyStyle(container, nameMap.get(name), name);
      } else {
        BL_ALL_CLS.forEach(c => container.classList.remove(c));
        container.classList.remove("dmt-bl-open");
        delete container.dataset.dmtAuthor;
        if (_applyBotRelay(container, nameMap)) {
          _applyBotRelayFollowUps(container, nameMap);
        }
      }
      _mergeCollapseGroups();
    }

    // ── MutationObserver：監聽新訊息插入 + SPA 換頻道後重掃 ─────────
    // pathname → channelId（不依賴 initURLChecker 內部的 getCurrentChannelId）
    const _blGetChannel = () => {
      const m = location.pathname.match(/\/channels\/\d+\/(\d+)/);
      return m ? m[1] : location.pathname;
    };
    let _blLastChannelId = _blGetChannel();
    const _blObserver = new MutationObserver((mutations) => {
      // 偵測 SPA 頻道切換：pathname 變化 → 重掃整頁
      const currentChannel = _blGetChannel();
      if (currentChannel !== _blLastChannelId) {
        _blLastChannelId = currentChannel;
        // 新頁面 DOM 尚未完全渲染，分三波掃描覆蓋 React 各批次渲染
        setTimeout(blApplyAll, 400);
        setTimeout(blApplyAll, 1200);
        setTimeout(blApplyAll, 2500);
        return;
      }
      // 正常新訊息插入
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(MSG_SEL)) {
            blApplyNode(node);
          }
          node.querySelectorAll?.(MSG_SEL).forEach(blApplyNode);
        }
      }
    });
    _blObserver.observe(document.body, { childList: true, subtree: true });

    // ── Collapse 群組合併 ────────────────────────────────────────────
    // 掃描所有相鄰的 .dmt-bl-s2 LI，把同作者連續群組整合成單一代表列：
    //   - 前幾條加 .dmt-bl-s2-merged（CSS display:none）
    //   - 最後一條（代表列）寫 data-dmt-count="N"（N = 群組訊息總數）
    // 跨群組邊界（非 .dmt-bl-s2 的 LI、時間分隔線）自然切斷群組。
    // 展開狀態（.dmt-bl-open）的代表列視為已展開群組，跳過合併。
    function _mergeCollapseGroups() {
      // 找所有訊息所在的 OL（聊天串列容器）
      const lists = new Set();
      document.querySelectorAll(MSG_SEL + ".dmt-bl-s2").forEach(c => {
        const ol = c.closest("ol");
        if (ol) lists.add(ol);
      });

      lists.forEach(ol => {
        // 先清除這個 OL 內所有舊的合併狀態
        ol.querySelectorAll(".dmt-bl-s2-merged").forEach(c => {
          c.classList.remove("dmt-bl-s2-merged");
        });
        ol.querySelectorAll(MSG_SEL + "[data-dmt-count]").forEach(c => {
          delete c.dataset.dmtCount;
        });

        // 掃描 LI 兄弟，組成連續 Collapse 群組
        const lis = Array.from(ol.children); // OL 的直接子 LI
        let group = []; // 當前群組的 [container, ...] 累積

        const flushGroup = () => {
          if (group.length <= 1) { group = []; return; }
          // 群組有 2 條以上才需要合併
          const count = group.length;
          // 前幾條加 merged（隱藏）
          for (let i = 0; i < count - 1; i++) {
            group[i].classList.add("dmt-bl-s2-merged");
            delete group[i].dataset.dmtCount;
          }
          // 最後一條作代表列，寫數量
          const rep = group[count - 1];
          rep.classList.remove("dmt-bl-s2-merged");
          rep.dataset.dmtCount = String(count);
          group = [];
        };

        lis.forEach(li => {
          const container = li.querySelector(MSG_SEL);
          if (container && container.classList.contains("dmt-bl-s2")
              && !container.classList.contains("dmt-bl-open")) {
            group.push(container);
          } else {
            // 遇到非 Collapse 的 LI（分隔線、其他樣式、已展開）→ 切斷群組
            flushGroup();
          }
        });
        flushGroup(); // 處理尾部殘餘群組
      });
    }

    // ── Collapse 樣式：點擊展開/收合（Ghost 不可展開，動畫不可逆）────
    document.addEventListener("click", (e) => {
      const container = e.target.closest(MSG_SEL);
      if (!container) return;
      if (!container.classList.contains("dmt-bl-s2")) return;
      // 不在操作按鈕上
      if (e.target.closest("button, a, [role='button']")) return;
      if (container.classList.contains("dmt-bl-open")) {
        // 收合：重新套用 Collapse 確保 DOM 乾淨還原
        // （避免展開期間 React 更新 DOM 後 > * 選擇器遮蔽失效）
        _applyStyle(container, 2, container.dataset.dmtAuthor || "");
        // 收合後重新合併群組
        _mergeCollapseGroups();
      } else {
        // 展開：把此群組的所有 merged 兄弟一起恢復可見
        const ol = container.closest("ol");
        if (ol) {
          // 找同群組範圍（往前往後找連續 .dmt-bl-s2-merged 且同 author）
          const author = container.dataset.dmtAuthor || "";
          // 往前恢復被合併的列
          let li = container.closest("li")?.previousElementSibling;
          while (li) {
            const c = li.querySelector(MSG_SEL);
            if (c && c.classList.contains("dmt-bl-s2-merged")
                && (c.dataset.dmtAuthor || "") === author) {
              c.classList.remove("dmt-bl-s2-merged");
              c.classList.add("dmt-bl-open");
              li = li.previousElementSibling;
            } else break;
          }
        }
        container.classList.add("dmt-bl-open");
        delete container.dataset.dmtCount;
      }
    }, true);

    // 初始化時掃描已載入訊息
    // Discord 為 React SPA，重載後訊息容器非同步渲染，
    // 單次同步掃描常在 DOM 就緒前執行而撈不到目標。
    // 補三波延遲掃描（與 SPA 換頻道相同策略）確保覆蓋各批次渲染。
    blApplyAll();
    setTimeout(blApplyAll, 400);
    setTimeout(blApplyAll, 1200);
    setTimeout(blApplyAll, 2500);

    // ── Temp 倒數輪詢：每 30 秒掃描到期的臨時靜音項目 ──────────────
    // 到期條件：entry.expiresAt 存在且 Date.now() >= new Date(expiresAt).getTime()
    // 到期動作：blRemove → blApplyAll → Toast
    // CleanupRegistry 補 clearInterval 防止 SPA 切換後殘留
    const _blTempInterval = setInterval(() => {
      const now = Date.now();
      const expired = blLoad().filter(u => u.expiresAt && now >= new Date(u.expiresAt).getTime());
      if (expired.length === 0) return;
      expired.forEach(u => {
        blRemove(u.name);
        dmtShowToast(t("mu_temp_expired_toast").replace("{name}", u.name));
      });
      blApplyAll();
      // 若管理面板開著，即時重建以反映最新資料
      // 注意：openBlPanel() 第一行會 toggle 關閉並 return，不可直接呼叫
      // 改為 instant 關閉後重開，確保面板顯示最新倒數狀態
      if (document.getElementById(BL_PANEL_ID)) {
        closeBlPanel(true); // 即時移除舊面板（不播動畫）
        openBlPanel();      // 重建面板並渲染最新列表
      }
    }, 30000);

    // 注冊清理（防止 SPA 切換後 interval 殘留）
    CleanupRegistry.add(() => clearInterval(_blTempInterval));

    // ── 管理面板 ─────────────────────────────────────────────────────
    function openBlPanel() {
      if (document.getElementById(BL_PANEL_ID)) {
        closeBlPanel(); return;
      }
      const panel = document.createElement("div");
      panel.id = BL_PANEL_ID;
      // 畫面置中顯示，視覺直覺且不受面板高度影響
      panel.style.left      = "50%";
      panel.style.top       = "50%";
      panel.style.transform = "translate(-50%, -50%)";

      const header = document.createElement("div");
      header.className = "bl-header";
      const title = document.createElement("div");
      title.className = "bl-title";
      title.textContent = t("mu_panel_title");
      const closeBtn = document.createElement("button");
      closeBtn.className = "bl-close";
      closeBtn.textContent = "×";
      closeBtn.onclick = () => closeBlPanel();
      header.appendChild(title);
      header.appendChild(closeBtn);

      const list = document.createElement("div");
      list.className = "bl-list";

      function renderList() {
        list.innerHTML = "";
        const entries = blLoad();
        if (entries.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bl-empty";
          empty.textContent = t("mu_empty");
          list.appendChild(empty);
          return;
        }

        // 關閉所有下拉（點外或切換時）
        function closeAllDropdowns() {
          document.querySelectorAll(".bl-style-dropdown").forEach(d => d.remove());
        }

        entries.forEach(({ name, addedAt, style = 2, expiresAt }) => {
          const row = document.createElement("div");
          row.className = "bl-row";

          const nameEl = document.createElement("div");
          nameEl.className = "bl-name";
          nameEl.textContent = name;

          const isTemp = !!expiresAt;
          const curStyle = style === BL_TEMP_STYLE_ID ? 2 : style;
          const styleDef = BL_STYLES[curStyle] || BL_STYLES[2];

          // ── 樣式徽章 ───────────────────────────────────────────────────
          const badge = document.createElement("div");

          if (isTemp) {
            // Temp：顯示倒數 + 可點擊切換外觀樣式
            badge.className = "bl-style-badge bl-temp-badge switchable";
            const msLeft  = Math.max(0, new Date(expiresAt).getTime() - Date.now());
            const minsLeft = Math.round(msLeft / 60000);
            const dLeft = Math.floor(minsLeft / 1440);
            const hLeft = Math.floor((minsLeft % 1440) / 60);
            const mLeft = minsLeft % 60;
            let remain = "";
            if (dLeft)  remain += dLeft + "d ";
            if (hLeft)  remain += hLeft + "h ";
            if (mLeft || !remain) remain += (minsLeft === 0 ? "<1" : mLeft) + "m";
            badge.textContent = `${styleDef.icon} ⏳ ${remain.trim()}`;
            badge.title = `${styleDef.name} (Temp) — expires ${new Date(expiresAt).toLocaleString()}\nClick to change style`;

            badge.addEventListener("click", (e) => {
              e.stopPropagation();
              const existing = document.querySelector(".bl-style-dropdown");
              if (existing) { existing.remove(); return; }
              closeAllDropdowns();
              const dd = document.createElement("div");
              dd.className = "bl-style-dropdown";
              Object.entries(BL_STYLES).forEach(([id, def]) => {
                const opt = document.createElement("div");
                opt.className = "bl-style-opt" + (curStyle === +id ? " active" : "");
                opt.textContent = `${def.icon}  ${def.name}`;
                opt.addEventListener("click", (ev) => {
                  ev.stopPropagation();
                  // 更新 style 但保留 expiresAt（仍是 Temp）
                  const arr = blLoad().map(u => u.name === name ? { ...u, style: +id } : u);
                  blSave(arr);
                  blApplyAll();
                  renderList();
                });
                dd.appendChild(opt);
              });
              // body 掛載：跳脫 panel 的 overflow:hidden + backdrop-filter stacking context
              document.body.appendChild(dd);
              requestAnimationFrame(() => {
                const r = badge.getBoundingClientRect();
                const ddH = dd.offsetHeight || 220;
                const below = window.innerHeight - r.bottom;
                dd.style.top  = (below >= ddH || below >= r.top ? r.bottom + 4 : r.top - ddH - 4) + "px";
                dd.style.left = r.left + "px";
              });
            });
          } else {
            // 永久：badge 點擊展開下拉，選擇新樣式
            badge.className = "bl-style-badge";
            badge.textContent = `${styleDef.icon} ${styleDef.name}`;
            badge.title = "Click to change style";

            badge.addEventListener("click", (e) => {
              e.stopPropagation();
              const existing = document.querySelector(".bl-style-dropdown");
              if (existing) { existing.remove(); return; }
              closeAllDropdowns();
              const dd = document.createElement("div");
              dd.className = "bl-style-dropdown";
              Object.entries(BL_STYLES).forEach(([id, def]) => {
                const opt = document.createElement("div");
                opt.className = "bl-style-opt" + (curStyle === +id ? " active" : "");
                opt.textContent = `${def.icon}  ${def.name}`;
                opt.addEventListener("click", (ev) => {
                  ev.stopPropagation();
                  blSetStyle(name, +id);
                  blApplyAll();
                  renderList();
                });
                dd.appendChild(opt);
              });
              // body 掛載：跳脫 panel 的 overflow:hidden + backdrop-filter stacking context
              document.body.appendChild(dd);
              requestAnimationFrame(() => {
                const r = badge.getBoundingClientRect();
                const ddH = dd.offsetHeight || 220;
                const below = window.innerHeight - r.bottom;
                dd.style.top  = (below >= ddH || below >= r.top ? r.bottom + 4 : r.top - ddH - 4) + "px";
                dd.style.left = r.left + "px";
              });
            });
          }

          // ── Temp 延長按鈕（+30m）──────────────────────────────────────
          const extendBtn = isTemp ? (() => {
            const btn = document.createElement("button");
            btn.className = "bl-extend-btn";
            btn.textContent = "+30m";
            btn.title = "Extend mute by 30 minutes";
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const arr = blLoad().map(u => {
                if (u.name !== name) return u;
                const base = Math.max(Date.now(), new Date(u.expiresAt).getTime());
                return { ...u, expiresAt: new Date(base + 30 * 60 * 1000).toISOString() };
              });
              blSave(arr);
              renderList();
            });
            return btn;
          })() : null;

          const dateEl = document.createElement("div");
          dateEl.className = "bl-date";
          dateEl.textContent = addedAt ? new Date(addedAt).toLocaleDateString() : "";

          const removeBtn = document.createElement("button");
          removeBtn.className = "bl-remove";
          removeBtn.textContent = t("mu_remove_btn");
          removeBtn.addEventListener("click", () => {
            blRemove(name);
            blApplyAll();
            renderList();
          });

          row.appendChild(nameEl);
          row.appendChild(badge);
          if (extendBtn) row.appendChild(extendBtn);
          row.appendChild(dateEl);
          row.appendChild(removeBtn);
          list.appendChild(row);
        });

        // 點 list 外關閉下拉
        document.addEventListener("mousedown", closeAllDropdowns, { capture: true, once: true });
      }
      renderList();

      const footer = document.createElement("div");
      footer.className = "bl-footer";
      footer.innerHTML = `<span>${t("mu_footer_left")}</span><span>${t("mu_footer_right")}</span>`;

      panel.appendChild(header);
      panel.appendChild(list);
      panel.appendChild(footer);
      document.body.appendChild(panel);

      // 點外關閉（排除 body 掛載的下拉選單，避免點選項時誤關 panel）
      const _outside = (e) => {
        if (e.target.closest(".bl-style-dropdown")) return;
        if (!panel.contains(e.target)) {
          closeBlPanel();
          document.removeEventListener("mousedown", _outside, true);
        }
      };
      document.addEventListener("mousedown", _outside, true);

      // ── 面板倒數 badge 即時刷新：每 30 秒重算剩餘時間 ──────────────
      // renderList 為此 closure 內部函數，可直接引用
      const _panelTick = setInterval(() => {
        if (document.getElementById(BL_PANEL_ID)) {
          renderList();
        } else {
          clearInterval(_panelTick);
        }
      }, 30000);
      // 用 MutationObserver 偵測 panel 從 DOM 移除（remove event 不可靠）
      const _panelTickGuard = new MutationObserver(() => {
        if (!document.getElementById(BL_PANEL_ID)) {
          clearInterval(_panelTick);
          _panelTickGuard.disconnect();
        }
      });
      _panelTickGuard.observe(document.body, { childList: true, subtree: true });
    }

    function closeBlPanel(instant = false) {
      const panel = document.getElementById(BL_PANEL_ID);
      if (!panel) return;
      // 同時清除 body 上懸空的樣式選單（點外關閉 panel 時 dropdown 不會自動消失）
      document.querySelectorAll(".bl-style-dropdown").forEach(d => d.remove());
      if (instant) { panel.remove(); return; }
      panel.classList.add("dmt-bl-leaving");
      setTimeout(() => panel.remove(), 200);
    }

    // ── 樣式選擇器浮層 ───────────────────────────────────────────────
    function _openStylePicker(name, onConfirm) {
        document.getElementById("dmt-bl-picker")?.remove();

        let selectedStyle = 2; // 預設 Collapse
        let isTempMode    = false; // 是否啟用 Temp 模式
        let tempMinutes   = 0; // Temp 模式下的倒數分鐘數

      // ── 時間解析工具 ────────────────────────────────────────────────
      // 支援：27H 20M / 1D 6H / 90M / 純數字（分鐘） / 3H 等組合
      function _parseTimeStr(str) {
        str = str.trim().toUpperCase();
        let total = 0;
        const d = str.match(/(\d+)\s*D/); if (d) total += parseInt(d[1]) * 1440;
        const h = str.match(/(\d+)\s*H/); if (h) total += parseInt(h[1]) * 60;
        const m = str.match(/(\d+)\s*M/); if (m) total += parseInt(m[1]);
        if (!total && /^\d+$/.test(str)) total = parseInt(str);
        return total > 0 ? total : 0;
      }
      function _formatMins(mins) {
        if (!mins) return "";
        const dv = Math.floor(mins / 1440);
        const hv = Math.floor((mins % 1440) / 60);
        const mv = mins % 60;
        // 依當前介面語言選擇時間單位文字
        const lang = (typeof t === "function")
          ? (t("__lang__") || "en-US")
          : "en-US";
        const isCJK = /^zh|^ja|^ko/.test(lang);
        const units = isCJK
          ? { d: "天", h: "小時", m: "分" }
          : { d: " day", h: " hour", m: " min" };
        const plural = (n, u) => isCJK ? n + u : n + u + (n > 1 ? "s" : "");
        const parts = [];
        if (dv) parts.push(plural(dv, units.d));
        if (hv) parts.push(plural(hv, units.h));
        if (mv) parts.push(plural(mv, units.m));
        return parts.length ? "\u2248 " + parts.join(" ") : "";
      }

      const picker = document.createElement("div");
      picker.id = "dmt-bl-picker";
      // 初始置中；rAF 後測量實際高度並做邊緣防護，確保預覽區不被瀏覽器邊緣截斷
      picker.style.cssText = `left:50%; transform:translateX(-50%); top:12px;`;
      // 掛到 DOM 後根據實際高度置中，並確保不超出上下邊界
      const _clampPickerPos = () => {
        requestAnimationFrame(() => {
          const PAD = 12;
          const vh  = window.innerHeight;
          const h   = picker.offsetHeight;
          const idealTop = Math.round((vh - h) / 2);
          picker.style.top = Math.max(PAD, Math.min(idealTop, vh - h - PAD)) + "px";
        });
      };

      // ── 標題列（flex：左側 title、右側齒輪）────────────────────────
      const headerEl = document.createElement("div");
      headerEl.className = "picker-header";

      const titleEl = document.createElement("div");
      titleEl.className = "picker-title";
      titleEl.textContent = `Mute style for ${name}`;

      const gearBtn = document.createElement("button");
      gearBtn.className = "picker-gear-btn";
      gearBtn.title = t("mu_settings_title") || "Settings";
      gearBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events:none"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

      headerEl.appendChild(titleEl);
      headerEl.appendChild(gearBtn);

      const cardsEl = document.createElement("div");
      cardsEl.className = "picker-cards";


      const confirmBtn = document.createElement("button");
      confirmBtn.className = "picker-confirm";
      confirmBtn.textContent = t("mu_ctx_mute").replace("{name}", "").trim() || "Mute";

      // ── Temp 時間選擇展開區 ──────────────────────────────────────────
      const tempSection = document.createElement("div");
      tempSection.className = "picker-temp-section";

      const divider = document.createElement("hr");
      divider.className = "picker-temp-divider";

      const chipsLabel = document.createElement("div");
      chipsLabel.className = "picker-temp-label";
      chipsLabel.textContent = t("mu_temp_quick") || "Quick select";

      const chipsContainer = document.createElement("div");
      chipsContainer.className = "picker-chips";

      const QUICK_CHIPS = [
        { label: "30M",  mins: 30    },
        { label: "1H",   mins: 60    },
        { label: "3H",   mins: 180   },
        { label: "6H",   mins: 360   },
        { label: "12H",  mins: 720   },
        { label: "1D",   mins: 1440  },
        { label: "3D",   mins: 4320  },
        { label: "7D",   mins: 10080 },
      ];

      const timeInput = document.createElement("input");
      timeInput.type = "text";
      timeInput.className = "picker-time-input";
      timeInput.placeholder = t("mu_temp_placeholder") || "e.g. 3H, 1D 6H, 27H 20M";

      const parsedEl = document.createElement("div");
      parsedEl.className = "picker-time-parsed";

      function _updateTempUI() {
        const mins = _parseTimeStr(timeInput.value);
        tempMinutes = mins;
        if (timeInput.value.trim() === "") {
          parsedEl.textContent = "";
          parsedEl.classList.remove("err");
        } else if (mins > 0) {
          parsedEl.textContent = _formatMins(mins);
          parsedEl.classList.remove("err");
        } else {
          parsedEl.textContent = "⚠ unrecognized format";
          parsedEl.classList.add("err");
        }
        // 確認按鈕：Temp 模式下需要有效分鐘數才點亮
        if (isTempMode) {
          if (mins > 0) {
            confirmBtn.textContent = t("mu_temp_confirm") || "⏳ Mute temporarily";
            confirmBtn.classList.add("lit");
          } else {
            confirmBtn.textContent = t("mu_temp_confirm") || "⏳ Mute temporarily";
            confirmBtn.classList.remove("lit");
          }
        }
      }

      QUICK_CHIPS.forEach(({ label, mins }) => {
        const chip = document.createElement("div");
        chip.className = "picker-chip";
        chip.textContent = label;
        chip.addEventListener("click", () => {
          chipsContainer.querySelectorAll(".picker-chip").forEach(c => c.classList.remove("active"));
          chip.classList.add("active");
          const h = Math.floor(mins / 60), m = mins % 60;
          timeInput.value = (h ? h + "H" : "") + (m ? (h ? " " : "") + m + "M" : "");
          _updateTempUI();
        });
        chipsContainer.appendChild(chip);
      });

      timeInput.addEventListener("input", () => {
        chipsContainer.querySelectorAll(".picker-chip").forEach(c => c.classList.remove("active"));
        _updateTempUI();
      });

      tempSection.appendChild(divider);
      tempSection.appendChild(chipsLabel);
      tempSection.appendChild(chipsContainer);
      tempSection.appendChild(timeInput);
      tempSection.appendChild(parsedEl);

      // ── 卡片渲染：group（六張永久）+ or 分隔 + Temp 卡 ──────────────
      const PERM_STYLES = [
        { id: 2, icon: "━",  name: "Collapse",  desc: "Thin line · click to expand"      },
        { id: 1, icon: "👻", name: "Ghost",     desc: "Full msg · floats up & fades"     },
        { id: 0, icon: "🌫", name: "Dim",       desc: "Dark & compact · hover to reveal" },
        { id: 4, icon: "〰", name: "Fog Strip", desc: "Name label · indigo divider"      },
        { id: 5, icon: "▬",  name: "Redacted",  desc: "Name kept · content blocked"      },
        { id: 6, icon: "▎",  name: "Sidebar",   desc: "Single row · stripe indicator"    },
      ];
      const TEMP_DEF = {
        id: BL_TEMP_STYLE_ID,
        icon: "⏳",
        name: t("mu_temp_card_name") || "Temp",
        desc: t("mu_temp_card_desc") || "Auto-unmute after timer",
      };

      // group 容器（三張永久卡）
      const groupEl = document.createElement("div");
      groupEl.className = "picker-group";

      // "or" 分隔
      const orEl = document.createElement("div");
      orEl.className = "picker-or";
      orEl.textContent = "or";

      // Temp 卡（初始灰暗 disabled）
      const tempCard = document.createElement("div");
      tempCard.className = "picker-card-temp";
      tempCard.dataset.style = BL_TEMP_STYLE_ID;
      tempCard.innerHTML = `
        <div class="picker-icon">${TEMP_DEF.icon}</div>
        <div class="picker-name">${TEMP_DEF.name}</div>
        <div class="picker-desc">${TEMP_DEF.desc}</div>`;

      // 渲染三張永久卡
      PERM_STYLES.forEach(({ id, icon, name: sName, desc }) => {
        const card = document.createElement("div");
        card.className = "picker-card" + (id === selectedStyle ? " selected" : "");
        card.dataset.style = id;
        card.innerHTML = `
          <div class="picker-icon">${icon}</div>
          <div class="picker-name">${sName}</div>
          <div class="picker-desc">${desc}</div>`;
        card.addEventListener("click", () => {
          groupEl.querySelectorAll(".picker-card").forEach(c => c.classList.remove("selected"));
          card.classList.add("selected");
          selectedStyle = id;
          _updatePreview(id);

          if (!isTempMode) {
            // 啟用 Temp 卡、"or" 點亮（動畫播一次後移除 active）
            tempCard.classList.add("enabled");
            orEl.classList.add("active");
            orEl.addEventListener("animationend", () => orEl.classList.remove("active"), { once: true });
            confirmBtn.textContent = t("mu_ctx_mute").replace("{name}", "").trim() || "Mute";
            confirmBtn.classList.add("lit");
          }
        });
        groupEl.appendChild(card);
      });

      // Temp 卡點擊（只有 enabled 後才有效）
      tempCard.addEventListener("click", () => {
        if (!tempCard.classList.contains("enabled")) return;
        isTempMode = !isTempMode;
        if (isTempMode) {
          tempCard.classList.add("selected");
          tempSection.classList.add("open");
          _updateTempUI();
        } else {
          tempCard.classList.remove("selected");
          tempSection.classList.remove("open");
          confirmBtn.textContent = t("mu_ctx_mute").replace("{name}", "").trim() || "Mute";
          confirmBtn.classList.add("lit");
        }
        // Temp 展開 / 收合後重新計算 Picker 垂直位置
        _clampPickerPos();
      });

      cardsEl.appendChild(groupEl);
      cardsEl.appendChild(orEl);
      cardsEl.appendChild(tempCard);

      // ── 預覽區 ─────────────────────────────────────────────────────
      const previewEl = document.createElement("div");
      previewEl.className = "picker-preview";

      const pvLabel = document.createElement("div");
      pvLabel.className = "picker-preview-label";
      pvLabel.textContent = "Preview";
      previewEl.appendChild(pvLabel);

      // 假訊息資料（用於預覽展示）
      const PV_AV_COLOR = "#5865f2";
      const PV_NAME = name || "User";

      // 更新預覽區內容
      function _updatePreview(styleId) {
        while (previewEl.children.length > 1) previewEl.removeChild(previewEl.lastChild);

        const avHtml   = `<div class="pv-av" style="background:${PV_AV_COLOR};">${PV_NAME.charAt(0).toUpperCase()}</div>`;
        const nameSpan = `<span class="pv-name" style="color:#c9cdfb;">${PV_NAME}</span>`;
        const timeSpan = `<span style="font-size:9px;color:#4f545c;margin-left:4px;">just now</span>`;
        const textSpan = `<span class="pv-text" style="color:#dbdee1;">This message will be muted.</span>`;

        switch (styleId) {
          case 1: { // Ghost — Phase 1 縮小 + 👻，2.5s 後飄走 + height collapse，重置循環
            previewEl.insertAdjacentHTML("beforeend",
              `<div class="pv-msg pv-ghost pv-ghost-shrunk" id="pv-ghost-row">
                ${avHtml}
                <div class="pv-mb"><div><span class="pv-ghost-icon">👻</span>${nameSpan}${timeSpan}</div>${textSpan}</div>
              </div>`
            );
            (function scheduleGhost() {
              const row = previewEl.querySelector("#pv-ghost-row");
              if (!row) return;
              // 重置狀態
              row.classList.remove("pv-go");
              row.classList.add("pv-ghost-shrunk");
              row.style.cssText = "";
              void row.offsetWidth;
              // 2.5s 後觸發飄走
              const t1 = setTimeout(() => {
                const r = previewEl.querySelector("#pv-ghost-row");
                if (!r) return;
                r.classList.remove("pv-ghost-shrunk");
                // 鎖定高度，啟動 height collapse transition
                const h = r.scrollHeight;
                r.style.height     = h + "px";
                r.style.overflow   = "hidden";
                r.style.transition = "height 0.7s cubic-bezier(.4,0,.2,1) 0.4s, opacity 0.3s ease";
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  r.style.height  = "0";
                  r.style.opacity = "0";
                }));
                r.classList.add("pv-go");
                // 動畫結束後重置
                const t2 = setTimeout(() => {
                  if (!previewEl.querySelector("#pv-ghost-row")) return;
                  scheduleGhost();
                }, 1500);
                previewEl._pvTimers.push(t2);
              }, 2500);
              previewEl._pvTimers.push(t1);
            })();
            return;
          }
          case 2: // Collapse — hover 展開假訊息
            previewEl.insertAdjacentHTML("beforeend",
              `<div class="pv-collapse">
                <div class="pv-expanded">
                  ${avHtml}
                  <div style="font-size:10px;color:#dbdee1;">${PV_NAME} · ${textSpan}</div>
                </div>
              </div>`
            );
            break;
          case 0: // Dim — hover 點亮
            previewEl.insertAdjacentHTML("beforeend",
              `<div class="pv-msg pv-dim">${avHtml}<div class="pv-mb"><div>${nameSpan}${timeSpan}</div>${textSpan}</div></div>`
            );
            break;
          case 4: // Fog Strip
            previewEl.insertAdjacentHTML("beforeend",
              `<div class="pv-fog" data-name="${PV_NAME}"></div>`
            );
            break;
          case 5: // Redacted — shimmer 呼吸
            previewEl.insertAdjacentHTML("beforeend",
              `<div class="pv-msg pv-redacted">${avHtml}<div class="pv-mb"><div class="pv-name">${PV_NAME}</div><span class="pv-redacted-bar"></span></div></div>`
            );
            break;
          case 6: // Sidebar — hover 點亮
            previewEl.insertAdjacentHTML("beforeend",
              `<div class="pv-msg pv-sidebar">${avHtml}<div class="pv-name">${PV_NAME} <span style="font-size:9px;color:#4f545c;">just now</span></div></div>`
            );
            break;
          default:
            previewEl.insertAdjacentHTML("beforeend",
              `<div class="pv-msg">${avHtml}<div class="pv-mb"><div>${nameSpan}${timeSpan}</div>${textSpan}</div></div>`
            );
        }
      }

      // 清除計時器（切換樣式時，避免舊 Ghost timer 繼續跑）
      const _clearPvTimers = () => {
        (previewEl._pvTimers || []).forEach(clearTimeout);
        previewEl._pvTimers = [];
        // 重置 Ghost row inline style（避免 height:0 殘留導致下次預覽顯示空白）
        const ghostRow = previewEl.querySelector("#pv-ghost-row");
        if (ghostRow) ghostRow.style.cssText = "";
      };
      // 包裝 _updatePreview，切換前先清 timer
      const _switchPreview = (id) => { _clearPvTimers(); _updatePreview(id); };

      // 初始預覽（預設 Collapse）
      _updatePreview(selectedStyle);

      // 重新把卡片點擊 hook 一層，確保切換時清 Ghost timer
      groupEl.querySelectorAll(".picker-card").forEach(card => {
        card.addEventListener("click", () => _clearPvTimers());
      });

      confirmBtn.addEventListener("click", () => {
        if (isTempMode) {
          if (tempMinutes <= 0) return; // 無有效時間，不允許確認
          const expiresAt = new Date(Date.now() + tempMinutes * 60000).toISOString();
          picker.remove();
          onConfirm(selectedStyle, expiresAt); // 送出原本選好的實體樣式 + 到期時間
        } else {
          picker.remove();
          onConfirm(selectedStyle, null);
        }
      });

      picker.appendChild(headerEl);
      picker.appendChild(cardsEl);
      picker.appendChild(previewEl);
      picker.appendChild(tempSection);
      picker.appendChild(confirmBtn);

      // ── 設定面板（齒輪切換後顯示） ─────────────────────────────────
      const settingsEl = document.createElement("div");
      settingsEl.className = "picker-settings";

      // Tab 列
      const tabsEl = document.createElement("div");
      tabsEl.className = "pset-tabs";
      const tabList  = document.createElement("div");
      tabList.className  = "pset-tab active";
      tabList.textContent = t("mu_settings_tab_list")  || "Mute List";
      const tabStyle = document.createElement("div");
      tabStyle.className = "pset-tab";
      tabStyle.textContent = t("mu_settings_tab_style") || "Style Settings";
      tabsEl.appendChild(tabList);
      tabsEl.appendChild(tabStyle);

      // ── 名單頁 ──────────────────────────────────────────────────────
      const pageList = document.createElement("div");
      pageList.className = "pset-page active";

      function _renderSettingsList() {
        pageList.innerHTML = "";
        const entries = blLoad();
        if (!entries.length) {
          const empty = document.createElement("div");
          empty.className = "pset-empty";
          empty.textContent = "—";
          pageList.appendChild(empty);
          return;
        }
        const listEl = document.createElement("div");
        listEl.className = "pset-list";

        function closeAllPsetDropdowns() {
          document.querySelectorAll(".pset-style-dropdown").forEach(d => d.remove());
        }

        entries.forEach(entry => {
          const isTemp   = !!entry.expiresAt;
          const curStyle = (entry.style === BL_TEMP_STYLE_ID ? 2 : entry.style) ?? 2;
          const styleDef = BL_STYLES[curStyle] || BL_STYLES[2];

          const row = document.createElement("div");
          row.className = "pset-row";

          // 名稱
          const nameEl = document.createElement("div");
          nameEl.className = "pset-row-name";
          nameEl.textContent = entry.name;

          // Badge：永久顯示樣式名；Temp 顯示倒數
          const badgeEl = document.createElement("div");
          if (isTemp) {
            const msLeft   = Math.max(0, new Date(entry.expiresAt).getTime() - Date.now());
            const minsLeft = Math.round(msLeft / 60000);
            const dLeft    = Math.floor(minsLeft / 1440);
            const hLeft    = Math.floor((minsLeft % 1440) / 60);
            const mLeft    = minsLeft % 60;
            let remain = "";
            if (dLeft) remain += dLeft + "d ";
            if (hLeft) remain += hLeft + "h ";
            if (mLeft || !remain) remain += (minsLeft === 0 ? "<1" : mLeft) + "m";
            badgeEl.className = "pset-row-badge temp-badge";
            badgeEl.textContent = `${styleDef.icon} ⏳ ${remain.trim()}`;
            badgeEl.title = `Expires ${new Date(entry.expiresAt).toLocaleString()}\nClick to change style`;
          } else {
            badgeEl.className = "pset-row-badge";
            badgeEl.textContent = `${styleDef.icon} ${styleDef.name}`;
            badgeEl.title = "Click to change style";
          }

          // Badge 點擊 → 下拉選單切換樣式
          badgeEl.addEventListener("click", (e) => {
            e.stopPropagation();
            // 若已開啟則關閉
            const existing = document.querySelector(".pset-style-dropdown");
            if (existing) { existing.remove(); return; }
            closeAllPsetDropdowns();
            const dd = document.createElement("div");
            dd.className = "pset-style-dropdown";
            Object.entries(BL_STYLES).forEach(([id, def]) => {
              const opt = document.createElement("div");
              opt.className = "pset-style-opt" + (curStyle === +id ? " active" : "");
              opt.textContent = `${def.icon}  ${def.name}`;
              opt.addEventListener("click", (ev) => {
                ev.stopPropagation();
                const arr = blLoad().map(u =>
                  u.name === entry.name ? { ...u, style: +id } : u
                );
                blSave(arr);
                blApplyAll();
                _renderSettingsList();
              });
              dd.appendChild(opt);
            });
            // body 掛載：跳脫 picker 的 backdrop-filter stacking context
            document.body.appendChild(dd);
            requestAnimationFrame(() => {
              const rect = badgeEl.getBoundingClientRect();
              const ddH  = dd.offsetHeight || 220;
              const spaceBelow = window.innerHeight - rect.bottom;
              dd.style.top  = (spaceBelow >= ddH || spaceBelow >= rect.top
                ? rect.bottom + 3 : rect.top - ddH - 3) + "px";
              dd.style.right = (window.innerWidth - rect.right) + "px";
            });
          });

          // +30m 延長按鈕（僅 Temp）
          const extendBtn = isTemp ? (() => {
            const btn = document.createElement("button");
            btn.className = "pset-extend-btn";
            btn.textContent = "+30m";
            btn.title = "Extend by 30 minutes";
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const arr = blLoad().map(u => {
                if (u.name !== entry.name) return u;
                const base = Math.max(Date.now(), new Date(u.expiresAt).getTime());
                return { ...u, expiresAt: new Date(base + 30 * 60 * 1000).toISOString() };
              });
              blSave(arr);
              _renderSettingsList();
            });
            return btn;
          })() : null;

          // 刪除按鈕
          const delBtn = document.createElement("button");
          delBtn.className = "pset-row-del";
          delBtn.textContent = "✕";
          delBtn.title = "Remove";
          delBtn.addEventListener("click", () => {
            const arr = blLoad().filter(e => e.name !== entry.name);
            blSave(arr);
            blApplyAll();
            _renderSettingsList();
          });

          row.appendChild(nameEl);
          row.appendChild(badgeEl);
          if (extendBtn) row.appendChild(extendBtn);
          row.appendChild(delBtn);
          listEl.appendChild(row);
        });

        pageList.appendChild(listEl);

        // 全部清除
        const clearBtn = document.createElement("button");
        clearBtn.className = "pset-clear-btn";
        clearBtn.textContent = t("mu_settings_clear_all") || "Clear All";
        clearBtn.addEventListener("click", () => {
          if (confirm(t("mu_settings_clear_confirm") || "Remove all muted users?")) {
            blSave([]);
            blApplyAll();
            _renderSettingsList();
          }
        });
        pageList.appendChild(clearBtn);

        // 點外關閉下拉
        document.addEventListener("mousedown", closeAllPsetDropdowns, { capture: true, once: true });
      }
      _renderSettingsList();

      // ── 樣式設定頁 ──────────────────────────────────────────────────
      const pageStyle = document.createElement("div");
      pageStyle.className = "pset-page";

      // Ghost 飄走延遲設定
      const ghostRow = document.createElement("div");
      ghostRow.className = "pset-setting-row";
      const ghostLabel = document.createElement("div");
      ghostLabel.className = "pset-setting-label";
      ghostLabel.textContent = t("mu_settings_ghost_delay") || "Ghost vanish delay (seconds)";
      const ghostInput = document.createElement("input");
      ghostInput.type  = "number";
      ghostInput.min   = "1";
      ghostInput.max   = "10";
      ghostInput.step  = "0.5";
      ghostInput.className = "pset-setting-input";
      ghostInput.value = String(GMStore.get("bl_ghost_delay", 4));
      const ghostUnit = document.createElement("span");
      ghostUnit.className = "pset-setting-unit";
      ghostUnit.textContent = "s";
      ghostInput.addEventListener("change", () => {
        const v = Math.min(10, Math.max(1, parseFloat(ghostInput.value) || 4));
        ghostInput.value = v;
        GMStore.set("bl_ghost_delay", v);
      });
      ghostRow.appendChild(ghostLabel);
      ghostRow.appendChild(ghostInput);
      ghostRow.appendChild(ghostUnit);
      pageStyle.appendChild(ghostRow);

      // ── BOT 轉發自動靜音開關 ──────────────────────────────────────────
      const botRelayRow = document.createElement("div");
      botRelayRow.className = "pset-setting-row";
      const botRelayLabel = document.createElement("div");
      botRelayLabel.className = "pset-setting-label";
      botRelayLabel.textContent = "Auto-mute bot relay";
      const botRelayDesc = document.createElement("div");
      botRelayDesc.className = "pset-setting-desc";
      botRelayDesc.textContent = "Dim BOT messages that reply to muted users";
      botRelayDesc.style.cssText = "font-size:10px;color:rgba(185,187,190,0.5);margin-top:2px;";
      const botRelayToggle = document.createElement("input");
      botRelayToggle.type = "checkbox";
      botRelayToggle.className = "pset-setting-toggle";
      botRelayToggle.checked = GMStore.get("bl_bot_relay", true);
      botRelayToggle.style.cssText = "margin-left:auto;width:16px;height:16px;cursor:pointer;flex-shrink:0;accent-color:rgba(88,101,242,0.9);";
      botRelayToggle.addEventListener("change", () => {
        GMStore.set("bl_bot_relay", botRelayToggle.checked);
        blApplyAll(); // 即時重掃
      });
      const botRelayLeft = document.createElement("div");
      botRelayLeft.style.cssText = "display:flex;flex-direction:column;flex:1;min-width:0;";
      botRelayLeft.appendChild(botRelayLabel);
      botRelayLeft.appendChild(botRelayDesc);
      botRelayRow.appendChild(botRelayLeft);
      botRelayRow.appendChild(botRelayToggle);
      pageStyle.appendChild(botRelayRow);
      tabList.addEventListener("click", () => {
        tabList.classList.add("active");
        tabStyle.classList.remove("active");
        pageList.classList.add("active");
        pageStyle.classList.remove("active");
      });
      tabStyle.addEventListener("click", () => {
        tabStyle.classList.add("active");
        tabList.classList.remove("active");
        pageStyle.classList.add("active");
        pageList.classList.remove("active");
      });

      settingsEl.appendChild(tabsEl);
      settingsEl.appendChild(pageList);
      settingsEl.appendChild(pageStyle);
      picker.appendChild(settingsEl);

      // ── 齒輪切換：主畫面 ↔ 設定頁 ──────────────────────────────────
      const mainEls = [cardsEl, tempSection, confirmBtn];
      gearBtn.addEventListener("click", () => {
        const isOpen = settingsEl.classList.contains("open");
        if (isOpen) {
          settingsEl.classList.remove("open");
          gearBtn.classList.remove("active");
          mainEls.forEach(el => { el.style.display = ""; });
          titleEl.textContent = `Mute style for ${name}`;
        } else {
          settingsEl.classList.add("open");
          gearBtn.classList.add("active");
          mainEls.forEach(el => { el.style.display = "none"; });
          titleEl.textContent = t("mu_settings_title") || "Settings";
          _renderSettingsList();
        }
      });

      document.body.appendChild(picker);
      _clampPickerPos();
      setTimeout(() => {
        const dismiss = (e) => {
          if (!picker.contains(e.target)) {
            picker.remove();
            document.removeEventListener("mousedown", dismiss, true);
          }
        };
        document.addEventListener("mousedown", dismiss, true);
      }, 0);
    }

    // ── 右鍵選單注入：直接注入原生 Discord #user-context 選單 ─────────
    // 策略：contextmenu 時記錄訊息容器 → MutationObserver 偵測選單出現
    //       → 在 #user-context-block（封鎖）之後插入黑名單 menuitem
    //       → 樣式完全繼承原生選單 class，位置固定不浮動

    let _blCtxContainer = null; // contextmenu 時記錄當前訊息容器

    function _onContextMenu(e) {
      // 記錄右鍵目標的訊息容器（可能為 null，代表非訊息區域）
      _blCtxContainer = e.target.closest(MSG_SEL) || null;
    }

    // 監聽原生 Discord 選單插入 DOM
    const _blMenuObserver = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (!(node instanceof Element)) continue;
          const menu = node.id === "user-context"
            ? node
            : node.querySelector?.("#user-context");
          if (!menu) continue;

          // 非訊息區域右鍵 → 不注入
          if (!_blCtxContainer) continue;
          const name = _resolveAuthor(_blCtxContainer);
          if (!name) continue;

          // 避免重複注入
          if (menu.querySelector("#dmt-bl-inject")) continue;

          // 找注入點：#user-context-block（封鎖）
          const blockItem = menu.querySelector("#user-context-block");
          if (!blockItem) continue;

          // isBlocked 用函數動態讀取，確保每次點擊前狀態正確
          const getIsBlocked = () => blHas(name);

          // 完全複製封鎖項目的 className，確保視覺一致
          const injectItem = document.createElement("div");
          injectItem.id = "dmt-bl-inject";
          injectItem.className = blockItem.className;
          injectItem.setAttribute("role", "menuitem");
          injectItem.setAttribute("tabindex", "-1");
          injectItem.setAttribute("data-menu-item", "true");
          // flex 排版：label 佔剩餘空間（overflow ellipsis），gear 固定右側不偏移
          injectItem.style.cssText = "display:flex !important; align-items:center !important; gap:6px !important;";

          const labelEl = blockItem.querySelector('[class*="label_"]');
          const label = document.createElement("div");
          label.className = labelEl?.className || "";
          // label 必須 flex:1 + 截斷，才能讓 gear 固定右側
          label.style.cssText = "flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";

          // ⚙️ 管理面板按鈕（固定寬度，不受名稱長短影響）
          const gearBtn = document.createElement("div");
          gearBtn.textContent = "⚙️";
          gearBtn.title = "Manage mute list";
          gearBtn.style.cssText = [
            "flex-shrink:0",
            "width:20px",
            "height:20px",
            "display:flex",
            "align-items:center",
            "justify-content:center",
            "font-size:13px",
            "border-radius:4px",
            "cursor:pointer",
            "opacity:0.55",
            "transition:opacity 0.15s, background 0.15s",
          ].join(";");
          gearBtn.addEventListener("mouseenter", () => {
            gearBtn.style.opacity = "1";
            gearBtn.style.background = "rgba(255,255,255,0.10)";
          });
          gearBtn.addEventListener("mouseleave", () => {
            gearBtn.style.opacity = "0.55";
            gearBtn.style.background = "";
          });
          gearBtn.addEventListener("click", (e) => {
            e.stopPropagation(); // 不觸發 injectItem 的 mute/unmute
            document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); // 關閉右鍵選單
            setTimeout(() => openBlPanel(), 80);
          });

          // 渲染函數：依當前狀態更新文字與顏色
          const renderLabel = () => {
            const blocked = getIsBlocked();
            label.style.color = blocked ? "#9ea6f5" : "#f57879";
            label.textContent = blocked
              ? t("mu_ctx_unmute").replace("{name}", name)
              : t("mu_ctx_mute").replace("{name}", name);
          };
          renderLabel();
          injectItem.appendChild(label);
          injectItem.appendChild(gearBtn);

          injectItem.addEventListener("mouseenter", () => {
            injectItem.style.background = getIsBlocked()
              ? "rgba(88,101,242,0.18)" : "rgba(237,66,69,0.18)";
          });
          injectItem.addEventListener("mouseleave", () => {
            injectItem.style.background = "";
          });
          injectItem.addEventListener("click", () => {
            document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            setTimeout(() => {
              if (getIsBlocked()) {
                blRemove(name);
                blApplyAll();
                dmtShowToast(t("mu_remove_toast").replace("{name}", name));
              } else {
                _openStylePicker(name, (chosenStyle, expiresAt) => {
                  blAdd(name, chosenStyle, expiresAt);
                  blApplyAll();
                  dmtShowToast(t("mu_add_toast").replace("{name}", name));
                });
              }
              // 選單關閉後重新渲染（若選單仍在 DOM 中）
              renderLabel();
            }, 80);
          });

          // 插在「封鎖」之後
          blockItem.insertAdjacentElement("afterend", injectItem);
        }
      }
    });
    _blMenuObserver.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("contextmenu", _onContextMenu, true);

    // ── 全域快捷鍵 Alt+B 開啟管理面板 ───────────────────────────────
    function _onBlKeydown(e) {
      if (e.altKey && e.key === "b") {
        e.preventDefault();
        openBlPanel();
      }
    }
    document.addEventListener("keydown", _onBlKeydown, true);

    // ── Dim 樣式（s0）hover 感應區域限縮 ────────────────────────────
    // 僅在滑鼠位於容器左緣起算 200px 範圍內才亮起（頭像欄約 72px 在內）
    // 使用單一委派 mousemove，避免對每個訊息逐一掛 listener
    const DIM_PEEK_X   = 200; // px，從容器 left 起算；進入此區顯示 peek（0.35 opacity）
    const DIM_DWELL_MS = 1300; // ms，頭像／名稱區停留門檻
    let _dimLastPeek   = null; // 目前正在 peek 的容器
    let _dimLastReveal = null; // 目前已 reveal 的容器
    let _dimDwellTimer = null; // 頭像區停留計時器

    function _clearDwell() {
      if (_dimDwellTimer) {
        clearTimeout(_dimDwellTimer);
        _dimDwellTimer = null;
      }
    }

    function _clearReveal(container) {
      if (container) {
        container.classList.remove("dmt-bl-s0-reveal", "dmt-bl-bot-relay-reveal");
      }
      if (_dimLastReveal === container) _dimLastReveal = null;
    }

    function _onDimMousemove(e) {
      // Dim（dmt-bl-s0）和 BOT relay（dmt-bl-bot-relay）共用同一套 peek/reveal 邏輯
      const container = e.target.closest(".dmt-bl-s0, .dmt-bl-bot-relay");
      const isRelay   = container && !container.classList.contains("dmt-bl-s0");
      const PEEK_CLS  = isRelay ? "dmt-bl-bot-relay-peek"   : "dmt-bl-s0-peek";
      const REV_CLS   = isRelay ? "dmt-bl-bot-relay-reveal" : "dmt-bl-s0-reveal";
      if (container) {
        const rect    = container.getBoundingClientRect();
        const xOffset = e.clientX - rect.left;
        const inPeek  = xOffset <= DIM_PEEK_X;
        const inAvatar = !!e.target.closest(
          '[class*="avatar_"],[class*="username_"],[class*="headerText_"],[class*="timestamp_"]'
        );

        if (inPeek) {
          if (_dimLastPeek !== container) {
            _dimLastPeek?.classList.remove("dmt-bl-s0-peek", "dmt-bl-bot-relay-peek");
            _clearDwell();
            _clearReveal(_dimLastReveal);
            _dimLastPeek = container;
            container.classList.add(PEEK_CLS);
          }

          if (inAvatar) {
            if (!container.classList.contains(REV_CLS) && !_dimDwellTimer) {
              _dimDwellTimer = setTimeout(() => {
                _dimDwellTimer = null;
                if (_dimLastPeek === container) {
                  _clearReveal(_dimLastReveal);
                  container.classList.add(REV_CLS);
                  _dimLastReveal = container;
                }
              }, DIM_DWELL_MS);
            }
          } else {
            _clearDwell();
          }
        } else {
          if (_dimLastPeek === container) {
            container.classList.remove(PEEK_CLS);
            _clearReveal(container);
            _clearDwell();
            _dimLastPeek = null;
          }
        }
      } else {
        if (_dimLastPeek) {
          _dimLastPeek.classList.remove("dmt-bl-s0-peek", "dmt-bl-bot-relay-peek");
          _dimLastPeek = null;
        }
        _clearReveal(_dimLastReveal);
        _clearDwell();
      }
    }
    document.addEventListener("mousemove", _onDimMousemove, { passive: true });

    // ── Cleanup ──────────────────────────────────────────────────────
    CleanupRegistry.add(() => {
      _blObserver.disconnect();
      _blMenuObserver.disconnect();
      document.removeEventListener("contextmenu", _onContextMenu, true);
      document.removeEventListener("keydown",     _onBlKeydown,   true);
      document.removeEventListener("mousemove",   _onDimMousemove);
      _dimLastPeek?.classList.remove("dmt-bl-s0-peek", "dmt-bl-bot-relay-peek");
      _dimLastPeek = null;
      _clearReveal(_dimLastReveal);
      _clearDwell();
      document.querySelectorAll(".dmt-bl-s0-reveal")
        .forEach(el => el.classList.remove("dmt-bl-s0-reveal"));
      closeBlPanel(true);
      document.getElementById("dmt-bl-picker")?.remove();
      document.getElementById("dmt-bl-inject")?.remove();
      document.getElementById("dmt-bl-style")?.remove();
      document.querySelectorAll(BL_ALL_CLS.map(c => `.${c}`).join(","))
        .forEach(el => BL_ALL_CLS.forEach(c => el.classList.remove(c)));
      // 清除群組合併殘留狀態
      document.querySelectorAll(".dmt-bl-s2-merged").forEach(el => {
        el.classList.remove("dmt-bl-s2-merged");
      });
      document.querySelectorAll("[data-dmt-count]").forEach(el => {
        delete el.dataset.dmtCount;
      });
    });

    DEBUG && console.log("[Blacklist] Module H initialized, entries:", blLoad().length);
  }

  // 分頁拉取：每次 100 則，預設掃描 200 則（可透過 GMStore 設定）。
  // URL 正規化：忽略 scheme / www / fragment / UTM 參數，支援 YouTube 短網址展開。
  // paste 監聽：全域 capture phase，繞過 Slate/React 事件攔截。
  // DOM 定位：closest('[class*="scrollableContainer_"]') 抗 Discord DOM 改版。
  // =========================================================================================
  function initURLChecker() {

    // ── 設定讀取（掃描上限，預設 200，可由 GMStore 調整）──
    const SCAN_LIMIT_KEY = "uc_scan_limit";
    function getScanLimit() {
      const v = parseInt(GMStore.get(SCAN_LIMIT_KEY, 200), 10);
      return Number.isFinite(v) && v >= 50 && v <= 1000 ? v : 200;
    }

    // ── URL 正規化（深度模式）──────────────────────────────────────────
    const UTM_PARAMS = new Set([
      "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
      "fbclid","gclid","mc_eid","ref","source","si",
    ]);

    // ── 誤判排除清單 ────────────────────────────────────────────────
    // 符合任一前綴的 URL 將不參與重複比對（貼上偵測與歷史掃描雙向排除）
    const IGNORED_URL_PREFIXES = [
      // Discord 自動嵌入資源（非使用者主動貼上）
      "https://cdn.discordapp.com/emojis/",
      "https://media.discordapp.net/stickers/",
      "https://cdn.discordapp.com/attachments/",
      "https://media.discordapp.net/attachments/",
      // Discord 外部圖片 Proxy（自動插入，URL 含 hash 每次不同）
      "https://images-ext-",
      // Discord 邀請連結（同伺服器重複出現很正常）
      "https://discord.gg/",
      "https://discord.com/invite/",
      // GIF / 動態貼圖服務（同一張 GIF 常多次分享）
      "https://tenor.com/",
      "https://www.tenor.com/",
      "https://media.tenor.com/",
      "https://klipy.com/gifs/",
      "https://giphy.com/",
      "https://media.giphy.com/",
      "https://i.giphy.com/",
      // Twitter / X 直連媒體 CDN（每次 session token 不同，或屬串流分片）
      "https://video.twimg.com/",
      "https://pbs.twimg.com/",
      "https://ton.twimg.com/",
    ];

    // 直連媒體副檔名：影片、音訊、圖片、串流分片
    const DIRECT_MEDIA_EXT_RE = /\.(?:mp4|webm|mov|avi|mkv|m4v|mp3|ogg|wav|flac|aac|m4a|ts|m3u8|png|jpe?g|gif|webp|avif|svg)(?:[?#]|$)/i;
    // CDN 串流分片路徑特徵（HLS seg、DASH chunk）
    const CDN_SEGMENT_RE = /\/(?:seg-\d+|chunk-\w+|index\d*\.m3u8|.*\.ts)(?:[?#]|$)/i;

    function isIgnoredURL(raw) {
      const url = raw.trim();
      if (IGNORED_URL_PREFIXES.some(prefix => url.startsWith(prefix))) return true;
      // 直連靜態資源或串流分片 → 每次 URL 含動態 token，不適合做重複比對
      if (DIRECT_MEDIA_EXT_RE.test(url)) return true;
      if (CDN_SEGMENT_RE.test(url)) return true;
      return false;
    }

    // ── Domain 家族正規化對照表（proxy → 原始 domain）──────────────────
    // 讓 fixupx / vxtwitter / fxtwitter 等 proxy 與原始 twitter.com 視為同一網址，
    // Instagram / Bilibili / Pixiv 同理，避免「換個 proxy 貼同一篇文章」被漏判。
    const DOMAIN_CANONICAL_MAP = {
      // Twitter / X 家族
      "x.com":            "twitter.com",
      "vxtwitter.com":    "twitter.com",
      "c.vxtwitter.com":  "twitter.com",
      "fixupx.com":       "twitter.com",
      "fxtwitter.com":    "twitter.com",
      "cunnyx.com":       "twitter.com",
      // Instagram 家族
      "kkinstagram.com":  "instagram.com",
      "vxinstagram.com":  "instagram.com",
      "ddinstagram.com":  "instagram.com",
      "uuinstagram.com":  "instagram.com",
      // Bilibili 家族
      "fxbilibili.com":   "bilibili.com",
      "vxbilibili.com":   "bilibili.com",
      // Pixiv 家族
      "phixiv.net":       "pixiv.net",
    };

    function normalizeURL(raw) {
      try {
        let str = raw.trim();
        // YouTube 短網址展開
        const ytShort = str.match(/^https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})/);
        if (ytShort) str = `https://www.youtube.com/watch?v=${ytShort[1]}`;

        const u = new URL(str);
        let host = u.hostname.replace(/^www\./, "").toLowerCase();
        // ── Domain 家族正規化：proxy domain → 原始 domain ──
        host = DOMAIN_CANONICAL_MAP[host] ?? host;

        UTM_PARAMS.forEach(k => u.searchParams.delete(k));
        const path = u.pathname.replace(/\/+$/, "") || "/";
        const params = [...u.searchParams.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join("&");
        return `${host}${path}${params ? "?" + params : ""}`.toLowerCase();
      } catch {
        return raw.trim().toLowerCase();
      }
    }

    // ── URL 擷取 ────────────────────────────────────────────────────
    const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
    function extractURLs(text) {
      return (text.match(URL_RE) || [])
        .filter(u => !isIgnoredURL(u))
        .map(normalizeURL);
    }

    // ── Discord API 分頁拉取訊息 ────────────────────────────────────
    async function fetchMessages(channelId, token, limit) {
      const all = [];
      let before = null;
      const pageSize = 100;

      while (all.length < limit) {
        const count = Math.min(pageSize, limit - all.length);
        let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=${count}`;
        if (before) url += `&before=${before}`;

        const res = await new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: "GET",
            url,
            headers: { Authorization: token, "Content-Type": "application/json" },
            onload: resolve,
            onerror: reject,
            ontimeout: reject,
          });
        });

        if (res.status !== 200) break;
        let batch;
        try { batch = JSON.parse(res.responseText); } catch { break; }
        if (!Array.isArray(batch) || batch.length === 0) break;

        all.push(...batch);
        before = batch[batch.length - 1].id;
        if (batch.length < count) break;
      }
      return all;
    }

    // ── 取得目前頻道 ID ──────────────────────────────────────────────
    function getCurrentChannelId() {
      const m = location.pathname.match(/\/channels\/\d+\/(\d+)/);
      return m ? m[1] : null;
    }

    // ── Banner UI ────────────────────────────────────────────────────
    const BANNER_ID = "dmt-uc-banner";

    if (!document.getElementById("dmt-uc-style")) {
      const s = document.createElement("style");
      s.id = "dmt-uc-style";
      s.textContent = `
        #dmt-uc-banner {
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 0;
          margin: 0 4px 4px;
          border-radius: 8px;
          font-size: 13px;
          font-family: sans-serif;
          line-height: 1.4;
          box-shadow: 0 4px 16px rgba(0,0,0,0.5);
          overflow: hidden;
          animation: dmt-uc-slide 0.18s cubic-bezier(.19,1,.22,1);
          pointer-events: auto;
        }
        /* 進場：上浮淡入 */
        @keyframes dmt-uc-slide {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        /* 退場：下沉淡出縮高 */
        @keyframes dmt-uc-exit {
          from { opacity: 1; transform: translateY(0);   max-height: 80px; }
          to   { opacity: 0; transform: translateY(4px); max-height: 0;    margin-bottom: 0; }
        }
        #dmt-uc-banner.uc-exiting {
          animation: dmt-uc-exit 0.32s cubic-bezier(.4,0,1,1) forwards;
          pointer-events: none;
        }
        /* 主體列（文字 + 按鈕） */
        #dmt-uc-banner .uc-body {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 14px;
        }
        #dmt-uc-banner.uc-warn {
          background: #2b1d1d;
          border: 1px solid var(--dmt-danger, #ed4245);
          color: #f2a0a2;
        }
        #dmt-uc-banner.uc-info {
          background: var(--dmt-bg-primary, #2b2d31);
          border: 1px solid rgba(255,255,255,0.12);
          color: var(--dmt-text-muted, #72767d);
        }
        #dmt-uc-banner .uc-msg { flex: 1; }
        #dmt-uc-banner .uc-dismiss {
          background: none; border: none; cursor: pointer;
          color: inherit; opacity: 0.6; font-size: 14px;
          padding: 0 2px; line-height: 1; flex-shrink: 0;
        }
        #dmt-uc-banner .uc-dismiss:hover { opacity: 1; }
        /* [New] 掃描上限快捷鈕 */
        #dmt-uc-banner .uc-limit-btn {
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
          border-radius: 4px; cursor: pointer; color: inherit;
          opacity: 0.7; font-size: 11px; font-weight: 700;
          padding: 2px 6px; line-height: 1.4; flex-shrink: 0;
          transition: opacity 0.15s, background 0.15s;
        }
        #dmt-uc-banner .uc-limit-btn:hover { opacity: 1; background: rgba(255,255,255,0.15); }
        /* Progress bar（倒數條，僅 warn 顯示） */
        #dmt-uc-banner .uc-progress {
          height: 3px;
          width: 100%;
          background: rgba(255,255,255,0.10);
          border-radius: 0 0 8px 8px;
          overflow: hidden;
        }
        #dmt-uc-banner .uc-progress-fill {
          height: 100%;
          width: 100%;
          background: var(--dmt-danger, #ed4245);
          transform-origin: left center;
          animation: dmt-uc-progress linear forwards;
        }
        @keyframes dmt-uc-progress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
        /* 懸停時暫停倒數動畫 */
        #dmt-uc-banner:hover .uc-progress-fill {
          animation-play-state: paused;
        }

        /* ── F2 懸浮提示按鈕（鍵盤造型） ── */
        @keyframes dmt-f2-float {
          0%,100% { transform: translateY(0px);  }
          50%      { transform: translateY(-3px); }
        }
        @keyframes dmt-f2-in {
          from { opacity: 0; transform: translateY(8px) scale(0.82); }
          to   { opacity: 1; transform: translateY(0px) scale(1);    }
        }
        @keyframes dmt-f2-out {
          from { opacity: 1; transform: translateY(0px) scale(1);    }
          to   { opacity: 0; transform: translateY(5px) scale(0.82); }
        }
        /* 外層容器：收合狀態只見鍵帽，hover 展開右側標籤 */
        #dmt-f2-hint {
          position: fixed;
          z-index: 2147483600;
          display: inline-flex;
          align-items: center;
          gap: 0;
          cursor: pointer;
          user-select: none;
          pointer-events: auto;
          animation: dmt-f2-in 0.2s cubic-bezier(.19,1,.22,1) forwards,
                     dmt-f2-float 2.8s ease-in-out 0.2s infinite;
          white-space: nowrap;
        }
        #dmt-f2-hint.dmt-f2-leaving {
          animation: dmt-f2-out 0.25s cubic-bezier(.4,0,1,1) forwards !important;
          pointer-events: none;
        }
        /* 暫停漂浮，讓展開動作不晃 */
        #dmt-f2-hint:hover {
          animation-play-state: paused, paused;
        }
        #dmt-f2-hint.dmt-f2-leaving {
          animation: dmt-f2-out 0.25s cubic-bezier(.4,0,1,1) forwards !important;
        }
        /* 鍵帽本體 */
        #dmt-f2-hint .dmt-f2-cap {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          /* 圓形磁石感：柔和光暈邊框 */
          background: rgba(48, 50, 58, 0.88);
          border: 1.5px solid rgba(88, 101, 242, 0.35);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.10),
            0 2px 10px rgba(0,0,0,0.45),
            0 0 8px rgba(88,101,242,0.18);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #9ea6f5;
          transition: background 0.15s, box-shadow 0.15s, color 0.15s, border-color 0.15s;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
        }
        #dmt-f2-hint:hover .dmt-f2-cap {
          background: rgba(88, 101, 242, 0.52);
          border-color: rgba(88, 101, 242, 0.75);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.18),
            0 3px 14px rgba(88,101,242,0.45),
            0 0 0 1px rgba(88,101,242,0.3);
          color: #fff;
        }
        /* 展開標籤：收合時 max-width:0 + opacity:0，hover 滑出 */
        #dmt-f2-hint .dmt-f2-label {
          max-width: 0;
          overflow: hidden;
          opacity: 0;
          font-size: 11px;
          font-family: sans-serif;
          font-weight: 500;
          color: #c5c8d6;
          background: rgba(30, 31, 36, 0.78);
          border: 1px solid rgba(88, 101, 242, 0.3);
          border-left: none;
          border-radius: 0 14px 14px 0;
          padding: 0;
          height: 26px;
          line-height: 26px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition:
            max-width 0.22s cubic-bezier(.19,1,.22,1),
            opacity   0.18s ease,
            padding   0.22s cubic-bezier(.19,1,.22,1);
          white-space: nowrap;
          pointer-events: none;
        }
        #dmt-f2-hint:hover .dmt-f2-label {
          max-width: 120px;
          opacity: 1;
          padding: 0 10px 0 8px;
          pointer-events: auto;
        }

        /* ── 頻道搜尋面板 (Channel Scout) ── */
        @keyframes dmt-cs-in {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes dmt-cs-out {
          from { opacity: 1; transform: none; }
          to   { opacity: 0; transform: translateY(6px) scale(0.97); }
        }
        #dmt-cs-panel {
          position: fixed;
          z-index: 2147483601;
          width: 420px;
          max-height: 480px;
          display: flex;
          flex-direction: column;
          background: rgba(24, 25, 28, 0.96);
          border: 1px solid rgba(88, 101, 242, 0.35);
          border-radius: 12px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(88,101,242,0.1);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          font-family: sans-serif;
          animation: dmt-cs-in 0.2s cubic-bezier(.19,1,.22,1) forwards;
          overflow: hidden;
        }
        #dmt-cs-panel.dmt-cs-leaving {
          animation: dmt-cs-out 0.18s cubic-bezier(.4,0,1,1) forwards !important;
          pointer-events: none;
        }
        /* 標題列 */
        #dmt-cs-panel .cs-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px 8px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        #dmt-cs-panel .cs-title {
          font-size: 12px;
          font-weight: 700;
          color: rgba(88, 101, 242, 0.9);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          flex: 1;
        }
        #dmt-cs-panel .cs-close {
          background: none; border: none; cursor: pointer;
          color: rgba(185,187,190,0.6); font-size: 16px; line-height: 1;
          padding: 0 2px; transition: color 0.15s;
        }
        #dmt-cs-panel .cs-close:hover { color: #fff; }
        /* 搜尋輸入框 */
        #dmt-cs-panel .cs-search-row {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          gap: 8px;
          flex-shrink: 0;
        }
        #dmt-cs-panel .cs-input {
          flex: 1;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px;
          color: #e3e5e8;
          font-size: 13px;
          padding: 7px 10px;
          outline: none;
          transition: border-color 0.15s;
          font-family: sans-serif;
        }
        #dmt-cs-panel .cs-input:focus {
          border-color: rgba(88, 101, 242, 0.6);
        }
        #dmt-cs-panel .cs-input::placeholder { color: rgba(185,187,190,0.45); }
        /* 輸入列右側按鈕組 */
        #dmt-cs-panel .cs-input-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; flex-shrink: 0;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 7px; cursor: pointer; color: rgba(185,187,190,0.65);
          transition: background .15s, border-color .15s, color .15s;
        }
        #dmt-cs-panel .cs-input-btn:hover {
          background: rgba(88,101,242,0.22);
          border-color: rgba(88,101,242,0.5);
          color: #c5caff;
        }
        /* 歷史下拉 */
        #dmt-cs-hist-dropdown {
          position: absolute; z-index: 10;
          top: calc(100% + 4px); right: 0;
          min-width: 200px; max-width: 340px;
          background: rgba(24,25,28,0.98);
          border: 1px solid rgba(88,101,242,0.35);
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.6);
          backdrop-filter: blur(12px);
          overflow: hidden;
          font-family: sans-serif;
        }
        #dmt-cs-hist-dropdown .cs-hist-item {
          padding: 7px 12px; font-size: 12px;
          color: rgba(219,222,225,0.85); cursor: pointer;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          transition: background .12s;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        #dmt-cs-hist-dropdown .cs-hist-item:last-child { border-bottom: none; }
        #dmt-cs-hist-dropdown .cs-hist-item:hover {
          background: rgba(88,101,242,0.15); color: #fff;
        }
        #dmt-cs-hist-dropdown .cs-hist-empty {
          padding: 10px 12px; font-size: 11px;
          color: rgba(185,187,190,0.4); text-align: center;
        }
        /* searchRow 需要 relative 才能讓下拉定位 */
        #dmt-cs-panel .cs-search-row { position: relative; }
        /* 自定義標籤列 */
        #dmt-cs-panel .cs-tags {
          display: flex;
          gap: 5px;
          padding: 0 12px 8px;
          flex-wrap: wrap;
          flex-shrink: 0;
        }
        #dmt-cs-panel .cs-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 6px;
          background: rgba(88, 101, 242, 0.15);
          border: 1px solid rgba(88, 101, 242, 0.3);
          color: #9ea6f5;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
          user-select: none;
          white-space: nowrap;
        }
        #dmt-cs-panel .cs-tag:hover {
          background: rgba(88, 101, 242, 0.32);
          border-color: rgba(88, 101, 242, 0.6);
          color: #c5caff;
        }
        #dmt-cs-panel .cs-tag.cs-tag-edit {
          background: rgba(255,255,255,0.05);
          border-color: rgba(255,255,255,0.15);
          color: rgba(185,187,190,0.6);
        }
        #dmt-cs-panel .cs-tag.cs-tag-edit:hover {
          background: rgba(255,255,255,0.1);
          color: #fff;
        }
        /* 結果區 */
        #dmt-cs-panel .cs-results {
          flex: 1;
          overflow-y: auto;
          padding: 4px 6px 8px;
          min-height: 0;
        }
        #dmt-cs-panel .cs-results::-webkit-scrollbar { width: 4px; }
        #dmt-cs-panel .cs-results::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1); border-radius: 2px;
        }
        #dmt-cs-panel .cs-result-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 7px 8px;
          border-radius: 7px;
          cursor: pointer;
          transition: background 0.12s;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        #dmt-cs-panel .cs-result-item:last-child { border-bottom: none; }
        #dmt-cs-panel .cs-result-item:hover { background: rgba(88, 101, 242, 0.12); }
        #dmt-cs-panel .cs-result-meta {
          font-size: 10px;
          color: rgba(185,187,190,0.5);
          white-space: nowrap;
          flex-shrink: 0;
          padding-top: 2px;
          min-width: 52px;
          text-align: right;
        }
        #dmt-cs-panel .cs-result-body {
          flex: 1;
          min-width: 0;
        }
        #dmt-cs-panel .cs-result-author {
          font-size: 11px;
          font-weight: 700;
          color: #a0aaf5;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        #dmt-cs-panel .cs-result-text {
          font-size: 12px;
          color: rgba(219, 222, 225, 0.8);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        #dmt-cs-panel .cs-result-text mark {
          background: rgba(255, 215, 0, 0.25);
          color: #ffd700;
          border-radius: 2px;
          padding: 0 1px;
        }
        /* 空結果 / 提示 */
        #dmt-cs-panel .cs-empty {
          text-align: center;
          padding: 24px 0;
          color: rgba(185,187,190,0.4);
          font-size: 12px;
        }
        /* 底部模式標籤 */
        #dmt-cs-panel .cs-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 14px;
          border-top: 1px solid rgba(255,255,255,0.06);
          font-size: 10px;
          color: rgba(185,187,190,0.35);
          flex-shrink: 0;
        }
      `;
      document.head.appendChild(s);
    }

    // warn 自動消失時間（ms）；info 不自動消失（中間狀態，結果出來自然覆蓋）
    const UC_WARN_DURATION = 6000;
    let _autoDismissTimer = null;

    function showBanner(type, message, scanLimit = null) {
      const editor = document.querySelector('div[data-slate-editor="true"]');
      if (!editor) return;
      // closest 抗 Discord DOM 改版，fallback 到 parentElement 鏈
      const slateContainer = editor.closest('[class*="scrollableContainer_"]')
        || editor.parentElement?.parentElement?.parentElement;
      if (!slateContainer) return;
      const anchor = slateContainer.parentElement;
      if (!anchor) return;

      removeBanner();
      const banner = document.createElement("div");
      banner.id = BANNER_ID;
      banner.className = `uc-${type}`;

      // ── 主體列：訊息文字 + [⚙ N則] 快捷鈕（warn + API 模式才顯示）+ 關閉按鈕 ──
      const body = document.createElement("div");
      body.className = "uc-body";

      const msg = document.createElement("span");
      msg.className = "uc-msg";
      msg.textContent = message;
      body.appendChild(msg);

      // [New] 掃描上限快捷鈕：點擊即 prompt 調整，不用進 GMStore
if (type === "warn" && scanLimit !== null) {
  const limitBtn = document.createElement("button");
  limitBtn.className = "uc-limit-btn";
  limitBtn.textContent = `⚙ ${scanLimit}`;
  limitBtn.title = "Click to adjust scan limit (50–1000)";
  limitBtn.onclick = () => {
    const input = prompt(
      `Adjust scan limit (current: ${scanLimit}, range: 50–1000):`,
      String(scanLimit)
    );
    if (!input) return;
    const v = parseInt(input, 10);
    if (Number.isFinite(v) && v >= 50 && v <= 1000) {
      GMStore.set(SCAN_LIMIT_KEY, String(v));
      showToast(`✅ Scan limit updated to ${v}`);
    }
  };
  body.appendChild(limitBtn);
}

      const dismissBtn = document.createElement("button");
      dismissBtn.className = "uc-dismiss";
      dismissBtn.textContent = t("uc_dismiss");
      dismissBtn.onclick = () => dismissBanner();
      body.appendChild(dismissBtn);
      banner.appendChild(body);

      // ── Progress bar（僅 warn 顯示，視覺化倒數） ──
      if (type === "warn") {
        const progress = document.createElement("div");
        progress.className = "uc-progress";
        const fill = document.createElement("div");
        fill.className = "uc-progress-fill";
        fill.style.animationDuration = `${UC_WARN_DURATION}ms`;
        progress.appendChild(fill);
        banner.appendChild(progress);

        // 自動消失：等 progress bar 跑完後觸發退場動畫
        _autoDismissTimer = setTimeout(() => dismissBanner(), UC_WARN_DURATION);
      }

      anchor.insertBefore(banner, slateContainer);
    }

    // 帶退場動畫的消失（使用者點 ✕ 或自動計時到期）
    function dismissBanner() {
      clearTimeout(_autoDismissTimer);
      _autoDismissTimer = null;
      const banner = document.getElementById(BANNER_ID);
      if (!banner) return;
      banner.classList.add("uc-exiting");
      // 動畫結束後才真正移除，保持 0.32s 退場動畫完整播放
      banner.addEventListener("animationend", () => banner.remove(), { once: true });
    }

    // 即時移除（showBanner 覆蓋前呼叫，不需要動畫）
    function removeBanner() {
      clearTimeout(_autoDismissTimer);
      _autoDismissTimer = null;
      document.getElementById(BANNER_ID)?.remove();
    }

    // ── DOM Fallback：掃描頁面已渲染的訊息（無 token 時使用）──────────
    function scanDOMMessages() {
      // Discord 訊息內容 selector（兩個版本的 class 名稱都支援）
      const msgEls = document.querySelectorAll(
        '[class*="messageContent_"], [class*="markup_"][id*="message-content"]'
      );
      const urlMap = new Map(); // normalizedURL → count
      msgEls.forEach(el => {
        extractURLs(el.textContent || "").forEach(u => {
          urlMap.set(u, (urlMap.get(u) || 0) + 1);
        });
      });
      return { urlMap, count: msgEls.length };
    }

    // ── 核心：貼上觸發 → 掃描 → 比對 ──────────────────────────────
    let _debounceTimer = null;

    async function onPaste(e) {
      const text = (e.clipboardData || window.clipboardData)?.getData("text") || "";
      const pastedURLs = text.match(URL_RE);
      if (!pastedURLs || pastedURLs.length === 0) return;

      // 排除誤判清單中的 URL（GIF、emoji、附件等）
      const filteredURLs = pastedURLs.filter(u => !isIgnoredURL(u));
      if (filteredURLs.length === 0) return;

      const normalizedPasted = filteredURLs.map(normalizeURL);

      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(async () => {

        const wh = window.wormholeModule;
        const apiMode = localStorage.getItem("wh_api_mode") === "true";
        const token = (apiMode && isModEnabled("mod_wormhole")) ? (wh?._cachedToken || null) : null;
        const channelId = getCurrentChannelId();
        if (!channelId) return;

        // ── 路徑 A：有 token → API 拉取歷史 ──
        if (token) {
          showBanner("info", t("uc_fetching"));
          try {
            const limit = getScanLimit();
            const messages = await fetchMessages(channelId, token, limit);

            // [Fix] Map 計次：同一 URL 出現幾次就記幾次
            const urlMap = new Map();
            for (const msg of messages) {
              extractURLs(msg.content || "").forEach(u => {
                urlMap.set(u, (urlMap.get(u) || 0) + 1);
              });
              (msg.embeds || []).forEach(em => {
                if (em.url) {
                  const nu = normalizeURL(em.url);
                  urlMap.set(nu, (urlMap.get(nu) || 0) + 1);
                }
              });
            }

            const hits = normalizedPasted.filter(u => urlMap.has(u));
            if (hits.length > 0) {
              const maxCount = Math.max(...hits.map(u => urlMap.get(u)));
              const key = hits.length === 1 ? "uc_duplicate_found" : "uc_duplicate_found_plural";
              showBanner("warn", t(key)
                .replace("{n}",     String(hits.length))
                .replace("{count}", String(maxCount))
                .replace("{limit}", String(messages.length)),
                getScanLimit()
              );
            } else {
              removeBanner();
            }
          } catch (err) {
            DEBUG && console.warn("[URLChecker] fetchMessages failed:", err);
            removeBanner();
          }
          return;
        }

        // ── 路徑 B：無 token → DOM fallback（掃描頁面可見訊息）──
        const { urlMap: domMap, count: domCount } = scanDOMMessages();
        const domHits = normalizedPasted.filter(u => domMap.has(u));
        if (domHits.length > 0) {
          const maxCount = Math.max(...domHits.map(u => domMap.get(u)));
          showBanner("warn", t("uc_dom_found")
            .replace("{count}", String(maxCount))
            .replace("{limit}", String(domCount)),
            null // DOM 模式不顯示掃描上限調整
          );
        } else {
          // 無重複且無 token：靜默，不顯示 no_token 提示避免干擾輸入
          removeBanner();
        }

      }, 120);
    }

    // ── 全域 Capture 監聽 paste（繞過 Slate/React 事件攔截）────────
    function globalPasteHandler(e) {
      if (e.target.closest('div[role="textbox"][data-slate-editor="true"]')) {
        onPaste(e);
      }
    }
    document.addEventListener("paste", globalPasteHandler, true);

    // 頻道切換時清除舊 banner
    const _ucObserver = new MutationObserver(() => {
      if (!document.getElementById(BANNER_ID)) return;
      const channelId = getCurrentChannelId();
      if (channelId !== _ucObserver._lastChannelId) {
        removeBanner();
        _ucObserver._lastChannelId = channelId;
      }
    });
    _ucObserver._lastChannelId = getCurrentChannelId();
    _ucObserver.observe(document.body, { childList: true, subtree: true });

    // ── Channel Scout：搜尋引擎 + 面板 UI（由獨立開關 mod_scout 控制）──
    // ⚠️ 架構耦合說明：Channel Scout 的初始化嵌套在 initURLChecker() 內部。
    // 這是刻意設計——Scout 依賴 URLChecker 建立的 MutationObserver 與頻道切換機制。
    // 因此：mod_urlchecker 關閉時，mod_scout 的開關也會一同失效（即使 mod_scout 為 true）。
    // 若日後需要讓兩者完全獨立，應將 Scout 抽出為獨立的 initScout() 函數，並建立共用的 observer 層。
    const _scoutEnabled = isModEnabled("mod_scout");

    if (_scoutEnabled) {
    const CS_PANEL_ID    = "dmt-cs-panel";
    const CS_TAGS_KEY    = "cs_custom_tags";      // GMStore key
    const CS_MAX_RESULTS = 30;                    // 最多顯示幾筆
    const CS_PREVIEW_LEN = 90;                    // 每筆摘要截斷字元數

    // 取得自定義標籤（最多 5 個）
    function _csGetTags() {
      return GMStore.get(CS_TAGS_KEY, [], true) || [];
    }
    function _csSetTags(arr) {
      GMStore.set(CS_TAGS_KEY, arr.slice(0, 5), true);
    }

    // 掃描 DOM 訊息，回傳 [{el, author, text, msgId}]
    function _csScanDOM() {
      const results = [];
      // 取訊息容器節點（含 data-list-item-id 的最外層 li/div）
      const containers = document.querySelectorAll('[data-list-item-id*="chat-messages-"]');
      containers.forEach(container => {
        // 取作者名
        const authorEl = container.querySelector('[class*="username_"], [class*="clickableUsername_"], [class*="headerText_"] [class*="username"]');
        const author   = authorEl?.textContent?.trim() || "";

        // 取正文（排除 reply 預覽）
        const contentEl = container.querySelector('[id^="message-content-"]')
          || container.querySelector('[class*="messageContent_"]');
        const text = contentEl?.textContent?.trim() || "";
        if (!text) return;

        // 取 msgId（供 scrollIntoView 定位）
        const listId  = container.getAttribute("data-list-item-id") || "";
        const idMatch = listId.match(/chat-messages-\d+-(\d+)$/);
        const msgId   = idMatch ? idMatch[1] : null;

        results.push({ el: container, author, text, msgId });
      });
      return results;
    }

    // 搜尋：keyword → [{el, author, text, matchIndex, msgId}]
    function _csSearch(keyword) {
      if (!keyword.trim()) return [];
      const kw    = keyword.trim().toLowerCase();
      const msgs  = _csScanDOM();
      const hits  = [];
      for (const m of msgs) {
        const idx = m.text.toLowerCase().indexOf(kw);
        if (idx !== -1) hits.push({ ...m, matchIndex: idx });
        if (hits.length >= CS_MAX_RESULTS) break;
      }
      return hits;
    }

    // 高亮關鍵字
    // 雙重 escape 設計說明：
    //   1. escHtml(preview) → 整段文字先 HTML-escape，確保訊息內容不含危險標籤
    //   2. escHtml(kw)      → keyword 同樣 escape，使兩者處於相同的編碼空間
    //   3. 在 escape 後的字串中用 escape 後的 keyword 做 RegExp 匹配
    //      → <mark> 標籤由腳本自行插入（受信任），其餘內容已安全 escape
    //   注意：未使用第一行宣告的 re 變數，可安全刪除
    function _csHighlight(text, keyword) {
      const preview = text.length > CS_PREVIEW_LEN
        ? text.slice(0, CS_PREVIEW_LEN) + "…"
        : text;
      if (!keyword.trim()) return escHtml(preview);
      const kw = keyword.trim();
      return escHtml(preview).replace(
        new RegExp(escHtml(kw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
        m => `<mark>${m}</mark>`
      );
    }

    // 關閉面板（帶動畫）
    function _csClose(instant = false) {
      const panel = document.getElementById(CS_PANEL_ID);
      if (!panel) return;
      if (instant) { panel.remove(); return; }
      panel.classList.add("dmt-cs-leaving");
      setTimeout(() => panel.remove(), 200);
    }

    // 跳至訊息
    function _csJumpTo(item) {
      _csClose(true);
      // 優先用 scrollIntoView（精確定位已渲染節點）
      if (item.el) {
        item.el.scrollIntoView({ behavior: "smooth", block: "center" });
        // 短暫高亮
        const prev = item.el.style.outline;
        item.el.style.outline = "2px solid rgba(88,101,242,0.7)";
        item.el.style.borderRadius = "4px";
        setTimeout(() => {
          item.el.style.outline = prev;
          item.el.style.borderRadius = "";
        }, 1800);
      }
    }

    // 渲染結果列表
    function _csRenderResults(container, hits, keyword) {
      container.innerHTML = "";
      if (hits.length === 0) {
        const empty = document.createElement("div");
        empty.className = "cs-empty";
        empty.textContent = keyword.trim() ? t("cs_no_results") : t("cs_empty_hint");
        container.appendChild(empty);
        return;
      }
      hits.forEach(item => {
        const row = document.createElement("div");
        row.className = "cs-result-item";

        const meta = document.createElement("div");
        meta.className = "cs-result-meta";
        meta.textContent = `#${(item.msgId || "").slice(-4) || "——"}`;

        const body = document.createElement("div");
        body.className = "cs-result-body";

        if (item.author) {
          const authorEl = document.createElement("div");
          authorEl.className = "cs-result-author";
          authorEl.textContent = item.author;
          body.appendChild(authorEl);
        }

        const textEl = document.createElement("div");
        textEl.className = "cs-result-text";
        textEl.innerHTML = _csHighlight(item.text, keyword);
        body.appendChild(textEl);

        row.appendChild(meta);
        row.appendChild(body);
        row.addEventListener("click", () => _csJumpTo(item));
        container.appendChild(row);
      });
    }

    // 開啟搜尋面板
    function openSearchPanel(initialQuery = "") {
      // 避免重複開啟
      if (document.getElementById(CS_PANEL_ID)) {
        document.querySelector("#dmt-cs-panel .cs-input")?.focus();
        return;
      }

      // 計算位置：輸入框左上方偏右
      const anchor = _getEditorAnchor();
      const posRect = anchor?.getBoundingClientRect();

      const panel = document.createElement("div");
      panel.id = CS_PANEL_ID;

      // 位置：固定在輸入框上方，若 anchor 取不到則置中下方
      if (posRect) {
        const panelW = 420;
        let left = posRect.left + F2_OFFSET_X;
        // 防止超出右側視窗
        if (left + panelW > window.innerWidth - 10) {
          left = window.innerWidth - panelW - 10;
        }
        panel.style.left = left + "px";
        panel.style.bottom = (window.innerHeight - posRect.top + 8) + "px";
      } else {
        panel.style.left  = "50%";
        panel.style.bottom = "120px";
        panel.style.transform = "translateX(-50%)";
      }

      // ── 標題列 ──
      const header = document.createElement("div");
      header.className = "cs-header";
      const title = document.createElement("div");
      title.className = "cs-title";
      title.textContent = t("cs_panel_title");
      const closeBtn = document.createElement("button");
      closeBtn.className = "cs-close";
      closeBtn.textContent = "×";
      closeBtn.onclick = () => _csClose();
      header.appendChild(title);
      header.appendChild(closeBtn);

      // ── 搜尋輸入框 ──
      const CS_HIST_KEY = "cs_search_history";  // GMStore key
      const CS_HIST_MAX = 5;
      function _csHistLoad() { return GMStore.get(CS_HIST_KEY, [], true) || []; }
      function _csHistPush(kw) {
        if (!kw.trim()) return;
        let hist = _csHistLoad().filter(h => h !== kw.trim());
        hist.unshift(kw.trim());
        GMStore.set(CS_HIST_KEY, hist.slice(0, CS_HIST_MAX), true);
      }

      const searchRow = document.createElement("div");
      searchRow.className = "cs-search-row";

      const input = document.createElement("input");
      input.className = "cs-input";
      input.placeholder = t("cs_placeholder");
      input.value = initialQuery;
      input.type = "text";

      // ── 貼上按鈕 ──
      const pasteBtn = document.createElement("div");
      pasteBtn.className = "cs-input-btn";
      pasteBtn.title = t("cs_paste_tip");
      pasteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="2" width="8" height="4" rx="1.5" stroke="currentColor" stroke-width="1.8"/>
        <path d="M7 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>`;
      pasteBtn.addEventListener("mousedown", async (e) => {
        e.preventDefault();
        try {
          const text = await navigator.clipboard.readText();
          if (text.trim()) {
            input.value = text.trim();
            input.dispatchEvent(new Event("input"));
            input.focus();
          }
        } catch {
          // clipboard 權限被拒：fallback 聚焦讓使用者手動貼上
          input.focus();
          document.execCommand?.("paste");
        }
      });

      // ── 歷史下拉按鈕 ──
      const histBtn = document.createElement("div");
      histBtn.className = "cs-input-btn";
      histBtn.title = t("cs_history_tip");
      histBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
        <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

      // 歷史下拉開關
      let _histDropdown = null;
      function _closeHistDropdown() {
        _histDropdown?.remove();
        _histDropdown = null;
      }
      histBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (_histDropdown) { _closeHistDropdown(); return; }

        const dropdown = document.createElement("div");
        dropdown.id = "dmt-cs-hist-dropdown";
        _histDropdown = dropdown;

        const hist = _csHistLoad();
        if (hist.length === 0) {
          const empty = document.createElement("div");
          empty.className = "cs-hist-empty";
          empty.textContent = t("cs_no_history");
          dropdown.appendChild(empty);
        } else {
          hist.forEach(kw => {
            const item = document.createElement("div");
            item.className = "cs-hist-item";
            item.textContent = kw;
            item.addEventListener("mousedown", (ev) => {
              ev.preventDefault();
              input.value = kw;
              input.dispatchEvent(new Event("input"));
              input.focus();
              _closeHistDropdown();
            });
            dropdown.appendChild(item);
          });
        }
        searchRow.appendChild(dropdown);

        // 點外關閉
        setTimeout(() => {
          const _hDismiss = (ev) => {
            if (!dropdown.contains(ev.target) && ev.target !== histBtn) {
              _closeHistDropdown();
              document.removeEventListener("mousedown", _hDismiss, true);
            }
          };
          document.addEventListener("mousedown", _hDismiss, true);
        }, 0);
      });

      searchRow.appendChild(input);
      searchRow.appendChild(pasteBtn);
      searchRow.appendChild(histBtn);

      // ── 自定義標籤列 ──
      const tagsRow = document.createElement("div");
      tagsRow.className = "cs-tags";

      function _renderTags(currentKeyword) {
        tagsRow.innerHTML = "";
        const tags = _csGetTags();
        tags.forEach((tag, i) => {
          const t = document.createElement("div");
          t.className = "cs-tag";
          t.textContent = tag;
          // 左鍵：帶入搜尋
          t.addEventListener("click", () => {
            input.value = tag;
            input.dispatchEvent(new Event("input"));
          });
          // 右鍵：刪除
          t.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            const arr = _csGetTags();
            arr.splice(i, 1);
            _csSetTags(arr);
            _renderTags(input.value);
          });
          tagsRow.appendChild(t);
        });
        // 新增標籤按鈕（最多 5 個）
        if (tags.length < 5) {
          const addBtn = document.createElement("div");
          addBtn.className = "cs-tag cs-tag-edit";
          addBtn.textContent = t("cs_add_tag") || "+ New Tag";
          addBtn.onclick = () => {
            const val = prompt(t("cs_add_tag_prompt") || "Enter new tag (right-click to delete):", "");
            if (val?.trim()) {
              const arr = _csGetTags();
              arr.push(val.trim());
              _csSetTags(arr);
              _renderTags(input.value);
            }
          };
          tagsRow.appendChild(addBtn);
        }
      }
      _renderTags(initialQuery);

      // ── 結果列表 ──
      const results = document.createElement("div");
      results.className = "cs-results";

      // 初始渲染（若有 initialQuery 就直接搜）
      const initHits = initialQuery.trim() ? _csSearch(initialQuery) : [];
      _csRenderResults(results, initHits, initialQuery);

      // 即時搜尋
      let _searchTimer = null;
      input.addEventListener("input", () => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => {
          const kw   = input.value;
          const hits = _csSearch(kw);
          _csRenderResults(results, hits, kw);
          // 有實質關鍵字才寫入歷史
          if (kw.trim().length >= 2) _csHistPush(kw);
        }, 150);
      });

      // ── 底部資訊列 ──
      const footer = document.createElement("div");
      footer.className = "cs-footer";
      footer.innerHTML = `<span>${t("cs_dom_mode_note")}</span><span>${t("cs_right_del_tip")}</span>`;

      // ── 組裝 ──
      panel.appendChild(header);
      panel.appendChild(searchRow);
      panel.appendChild(tagsRow);
      panel.appendChild(results);
      panel.appendChild(footer);
      document.body.appendChild(panel);

      // 自動聚焦輸入框
      requestAnimationFrame(() => input.focus());

      // 點擊面板外關閉
      const _outsideClick = (e) => {
        if (!panel.contains(e.target) && e.target.id !== F2_HINT_ID) {
          _csClose();
          document.removeEventListener("mousedown", _outsideClick, true);
        }
      };
      document.addEventListener("mousedown", _outsideClick, true);

      // ESC 關閉
      const _escClose = (e) => {
        if (e.key === "Escape") {
          _csClose();
          document.removeEventListener("keydown", _escClose, true);
        }
      };
      document.addEventListener("keydown", _escClose, true);
    }

    // ── F2 懸浮提示按鈕 ─────────────────────────────────────────────
    // 當焦點進入 Discord 輸入框時，浮現半透明「F2」提示按鈕
    // 2.5 秒後淡出；點擊立即觸發 F2（預留功能入口）；失焦則提前消失
    const F2_HINT_ID  = "dmt-f2-hint";
    const F2_SHOW_MS  = 2500;   // 停留時間
    const F2_OFFSET_X = 200;    // 相對輸入框左側偏右 200px
    const F2_OFFSET_Y = -28;    // 向上偏移（輸入框上方，比之前往下 5px）
    let _f2HintTimer    = null;
    let _editorFocused  = false; // 真正 focus 才允許顯示，防止 SPA 換頁後誤觸

    function _getEditorAnchor() {
      const editor = document.querySelector('div[data-slate-editor="true"]');
      if (!editor) return null;
      return editor.closest('[class*="scrollableContainer_"]')
          || editor.closest('[class*="channelTextArea_"]')
          || editor.parentElement?.parentElement?.parentElement
          || null;
    }

    function _removeF2Hint(instant = false) {
      clearTimeout(_f2HintTimer);
      _f2HintTimer = null;
      const el = document.getElementById(F2_HINT_ID);
      if (!el) return;
      if (instant) { el.remove(); return; }
      el.classList.add("dmt-f2-leaving");
      setTimeout(() => el.remove(), 300);
    }

    function _showF2Hint() {
      // 只有使用者真正聚焦輸入框時才顯示，頻道切換重建 DOM 不觸發
      if (!_editorFocused) return;

      // 已存在則刷新計時，不重複建立
      if (document.getElementById(F2_HINT_ID)) {
        clearTimeout(_f2HintTimer);
        _f2HintTimer = setTimeout(() => _removeF2Hint(), F2_SHOW_MS);
        return;
      }

      const anchor = _getEditorAnchor();
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      if (!rect.width) return;

      const btn = document.createElement("div");
      btn.id = F2_HINT_ID;
      btn.innerHTML = `
        <span class="dmt-f2-cap" title="${t("cs_float_title") || "Channel Scout (F2)"}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M15.5 15.5L20 20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="dmt-f2-label">${t("cs_float_label") || "Channel Scout"}</span>`;

      btn.style.left = (rect.left + F2_OFFSET_X) + "px";
      btn.style.top  = (rect.top  + F2_OFFSET_Y) + "px";

      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        _removeF2Hint(true);
        openSearchPanel();
      });

      document.body.appendChild(btn);
      _f2HintTimer = setTimeout(() => _removeF2Hint(), F2_SHOW_MS);
    }

    // 監聽焦點：使用 capture 模式繞過 React 事件攔截
    function _onF2FocusIn(e) {
      if (e.target.closest('div[role="textbox"][data-slate-editor="true"]')) {
        _editorFocused = true;   // 使用者主動點擊 / Tab 進入才設旗標
        _showF2Hint();
      }
    }
    function _onF2FocusOut(e) {
      if (e.target.closest('div[role="textbox"][data-slate-editor="true"]')) {
        _editorFocused = false;  // 失焦時清除旗標，頻道切換 SPA 重建後不會殘留
        _removeF2Hint();
      }
    }

    // 全域 F2 快捷鍵（不搶 Discord 原生行為：僅在非輸入框 focus 時攔截）
    function _onF2Keydown(e) {
      if (e.key !== "F2") return;
      // 若焦點在輸入框內則放行（Discord 自身可能有用途）
      if (e.target.closest('div[role="textbox"][data-slate-editor="true"]')) return;
      e.preventDefault();
      e.stopPropagation();
      if (document.getElementById(CS_PANEL_ID)) {
        _csClose();
      } else {
        openSearchPanel();
      }
    }

    document.addEventListener("focusin",  _onF2FocusIn,  true);
    document.addEventListener("focusout", _onF2FocusOut, true);
    document.addEventListener("keydown",  _onF2Keydown,  true);

    CleanupRegistry.add(() => {
      _ucObserver.disconnect();
      document.removeEventListener("paste",    globalPasteHandler, true);
      document.removeEventListener("focusin",  _onF2FocusIn,  true);
      document.removeEventListener("focusout", _onF2FocusOut, true);
      document.removeEventListener("keydown",  _onF2Keydown,  true);
      clearTimeout(_debounceTimer);
      clearTimeout(_f2HintTimer);
      _removeF2Hint(true);
      _csClose(true);
      removeBanner();
    });

    } else {
      // mod_scout 停用時，只清理 URLChecker 基本資源
      CleanupRegistry.add(() => {
        _ucObserver.disconnect();
        document.removeEventListener("paste", globalPasteHandler, true);
        clearTimeout(_debounceTimer);
        removeBanner();
      });
    } // end if (_scoutEnabled)

    DEBUG && console.log("[URLChecker] Module G initialized, scan limit:", getScanLimit());
  }
  // 初始化其他模組，各自包含錯誤處理
  const initModules = [
    { name: "Forwarding", fn: initForwardingManager, key: "mod_forwarding" },
    { name: "Message", fn: initMessageUtility, key: "mod_message" },
    { name: "Emoji", fn: initEmojiSearchHelper, key: "mod_emoji" },
    { name: "Header", fn: initHeaderMods, key: "mod_header" },
    { name: "Webhook", fn: initWebhookManager, key: "mod_webhook" },
    { name: "URLChecker", fn: initURLChecker, key: "mod_urlchecker" },
    { name: "Blacklist",  fn: initBlacklist,  key: "mod_blacklist"  },
  ];

  initModules.forEach(({ name, fn, key }) => {
    if (isModEnabled(key)) {
      try {
        fn();
      } catch (err) {
        console.error(`[${name}] Initialization failed:`, err);
      }
    }
  });

  // ── 救援設定按鈕：當 mod_message 停用（齒輪⚙️隨之消失）時，注入全域浮動按鈕 ──
  // 確保使用者永遠有辦法開啟模組開關面板，避免全關後陷入死鎖
  if (!isModEnabled("mod_message")) {
    const rescueBtn = document.createElement("div");
    rescueBtn.id = "dmt-rescue-btn";
    rescueBtn.title = t("mod_msg_enable_menu");
    rescueBtn.textContent = "⚙️";

    // 改用 style 屬性 API 而非 cssText，提高安全性與可維護性
    Object.assign(rescueBtn.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "2147483646",
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      background: "var(--dmt-accent, #5865f2)",
      color: "var(--dmt-text-bright, #dbdee1)",
      fontSize: "18px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
      userSelect: "none",
      opacity: "0.5",
      transition: "opacity 0.2s",
    });

    rescueBtn.onmouseenter = () => {
      rescueBtn.style.opacity = "1";
    };
    rescueBtn.onmouseleave = () => {
      rescueBtn.style.opacity = "0.5";
    };
    rescueBtn.onclick = () => {
      // 直接顯示模組開關面板（獨立版本，不依賴 initMessageUtility 閉包）
      const existing = document.getElementById("mod-settings-panel-rescue");
      if (existing) {
        existing.remove();
        return;
      }
      const lang = getConfig().lang || navigator.language || "en-US";
      const getLang = (labels) => {
        if (labels[lang]) return labels[lang];
        // prefix 模糊比對："en" 能匹配 "en-US"，"zh" 能匹配 "zh-TW" 等
        const prefix = lang.split("-")[0];
        const prefixKey = Object.keys(labels).find(k => k.split("-")[0] === prefix);
        if (prefixKey) return labels[prefixKey];
        return labels["en-US"] || labels["zh-TW"];
      };
      const overlay = document.createElement("div");
      overlay.id = "mod-settings-panel-rescue";
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483647",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
      });
      const box = document.createElement("div");
      Object.assign(box.style, {
        background: "var(--dmt-bg-primary, #2b2d31)",
        borderRadius: "12px",
        padding: "20px 24px",
        minWidth: "280px",
        maxWidth: "360px",
        color: "var(--dmt-text-primary, #dcddde)",
        fontSize: "13px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
      });
      const title = document.createElement("div");
      Object.assign(title.style, {
        fontSize: "15px",
        fontWeight: "700",
        color: "var(--dmt-text-bright, #dbdee1)",
        marginBottom: "14px",
      });
      title.textContent = "⚙️ Discord Message Toolkit";
      box.appendChild(title);
      MODULE_DEFS.forEach((mod) => {
        const row = document.createElement("div");
        Object.assign(row.style, {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "7px 0",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        });
        const nameSpan = document.createElement("span");
        nameSpan.textContent = `${mod.icon} ${getLang(mod.label)}`;
        const enabled = isModEnabled(mod.storageKey);
        const toggleEl = document.createElement("div");
        Object.assign(toggleEl.style, {
          width: "34px",
          height: "18px",
          borderRadius: "9px",
          background: enabled ? "var(--dmt-accent, #5865f2)" : "var(--dmt-bg-muted, #4f545c)",
          position: "relative",
          cursor: "pointer",
          transition: "background 0.2s",
          flexShrink: "0",
        });
        const thumb = document.createElement("div");
        Object.assign(thumb.style, {
          width: "14px",
          height: "14px",
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          top: "2px",
          left: enabled ? "18px" : "2px",
          transition: "left 0.2s",
        });
        toggleEl.appendChild(thumb);
        toggleEl.onclick = () => {
          const nowOn = isModEnabled(mod.storageKey);
          const next = !nowOn;
          setModEnabled(mod.storageKey, next);
          toggleEl.style.background = next
            ? "var(--dmt-accent, #5865f2)"
            : "var(--dmt-bg-muted, #4f545c)";
          thumb.style.left = next ? "18px" : "2px";

          // 提示用戶需要重新整理頁面，讓用戶決定是否立即執行
          dmtConfirm(t("rescue_reload_msg")).then((ok) => {
            if (ok) setTimeout(() => location.reload(), 300);
          });
        };
        row.appendChild(nameSpan);
        row.appendChild(toggleEl);
        box.appendChild(row);
      });
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "✕ " + t("rescue_close_btn");
      Object.assign(closeBtn.style, {
        marginTop: "14px",
        width: "100%",
        padding: "7px",
        border: "none",
        borderRadius: "6px",
        background: "var(--dmt-bg-muted, #4f545c)",
        color: "#fff",
        cursor: "pointer",
        fontSize: "13px",
      });
      closeBtn.onclick = () => overlay.remove();
      box.appendChild(closeBtn);
      overlay.appendChild(box);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
      });
      document.body.appendChild(overlay);
    };
    document.addEventListener("DOMContentLoaded", () =>
      document.body.appendChild(rescueBtn),
    );
    // DOMContentLoaded 可能已觸發（UserScript 注入時機）
    if (document.body) document.body.appendChild(rescueBtn);
  }

  // ── Debug 模式運行時切換菜單 ──
  GM_registerMenuCommand(
    `🐛 Toggle Debug Mode (${DEBUG ? "ON" : "OFF"})`,
    () => {
      const current = GMStore.get("debugModeEnabled", false);
      GMStore.set("debugModeEnabled", !current);
      const msg = !current
        ? "[Discord Utilities] Debug mode enabled. Please reload the page."
        : "[Discord Utilities] Debug mode disabled. Please reload the page.";
      alert(msg);
      console.log(msg);
    }
  );

  // ── 模組狀態查詢菜單 ──
  GM_registerMenuCommand(
    "📊 Show Module Status",
    () => {
      const status = MODULE_DEFS.map(
        (m) => `${m.icon}${isModEnabled(m.storageKey) ? "✓" : "✗"}`
      ).join(" ");
      console.log("[Discord Utilities] Module Status:", status);
      alert(`Module Status:\n${status}`);
    }
  );

  // ── 全域錯誤處理器（捕獲未預期的異常，防止腳本完全崩潰） ──
  window.addEventListener("error", (event) => {
    if (event.filename && event.filename.includes("greasyfork")) {
      console.error(
        `[Discord Utilities] Uncaught error at ${event.filename}:${event.lineno}:${event.colno}`,
        event.error
      );
      if (DEBUG) {
        alert(`[Error] ${event.message}\n\nCheck console for details.`);
      }
    }
  });

  DEBUG && console.log(
    "[Discord Utilities] v" + SCRIPT_VERSION + " loaded successfully. Modules:",
    MODULE_DEFS.map(
      (m) => `${m.icon}${isModEnabled(m.storageKey) ? "✓" : "✗"}`,
    ).join(" "),
  );
})();