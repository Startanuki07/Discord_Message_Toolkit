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
// @namespace    https://greasyfork.org/en/users/1575945-star-tanuki07?locale_override=1
// @namespace    https://github.com/Startanuki07?tab=repositories
// @version      1.4.4
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
// @grant       GM_listValues
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// @grant       GM_setClipboard
// @grant       GM_xmlhttpRequest
// @grant       GM_info
// @grant       unsafeWindow
// @connect     *
// ==/UserScript==

(function () {
  "use strict";

  const DEBUG = false;

  const SCRIPT_NAME = GM_info?.script?.name || "Discord Integrated Utilities";

  const ConfigManager = {
    _cache: null,
    _defaults: {
      lang: null,
      triggerMode: "hover",
      symbols: ["𓈒𓂂𓏸"],
      menuStyle: "general",
      swapLogic: false,
      appendSpace: false,
      appendNewLine: false,
      linkText: "text",
    },

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
                } catch {
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

              this._cache = null;
              return true;
            },
          },
        );
      }
      return this._cache;
    },

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
        modForwarding: "mod_forwarding",
        modMessage:    "mod_message",
        modEmoji:      "mod_emoji",
        modHeader:     "mod_header",
        modWormhole:   "mod_wormhole",
      };
      return keyMap[prop] || prop;
    },
  };

  const MODULE_DEFS = [
    { key: "modMessage",    storageKey: "mod_message",    icon: "⠿",  warn: true,
      label: { "en-US": "Message Utility (⠿)", "zh-TW": "訊息工具 (⠿)", "zh-CN": "消息工具 (⠿)", "ja": "メッセージユーティリティ (⠿)", "ko": "메시지 유틸리티 (⠿)" } },
    { key: "modForwarding", storageKey: "mod_forwarding", icon: "📋", label: { "en-US": "Forwarding Manager",  "zh-TW": "轉發管理員",   "zh-CN": "转发管理员",   "ja": "転送マネージャー", "ko": "전달 관리자" } },
    { key: "modEmoji",      storageKey: "mod_emoji",      icon: "😀", label: { "en-US": "Emoji Search Helper", "zh-TW": "表情搜尋輔助", "zh-CN": "表情搜索助手", "ja": "絵文字検索", "ko": "이모지 검색" } },
    { key: "modHeader",     storageKey: "mod_header",     icon: "📌", label: { "en-US": "Anti-Hijack & File Tools", "zh-TW": "右鍵解鎖",   "zh-CN": "右键解锁",   "ja": "右クリック解除", "ko": "우클릭 해제" } },
    { key: "modWormhole",   storageKey: "mod_wormhole",   icon: "🌀", label: { "en-US": "Wormhole",            "zh-TW": "蟲洞",         "zh-CN": "虫洞",         "ja": "ワームホール", "ko": "웜홀" } },
  ];
  function isModEnabled(storageKey) {
    const val = localStorage.getItem(storageKey);
    return val === null ? true : val !== "false";
  }
  function setModEnabled(storageKey, enabled) {
    localStorage.setItem(storageKey, String(enabled));
  }

  function getConfig() {
    return ConfigManager.config;
  }

  const _escMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => _escMap[c]);
  }

  class TranslationCacheManager {
    constructor(maxSize = 500) {
      this.cache = new Map();
      this.maxSize = maxSize;
    }

    get(key) {
      if (!this.cache.has(key)) return null;
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    set(key, value) {
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.maxSize) {
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

  const TranslationCache = new TranslationCacheManager(500);

  function t(key, params = {}) {
    const config = getConfig();
    const lang = config.lang || "en";

    const paramKeys = Object.keys(params);
    const cacheKey = paramKeys.length
      ? `${lang}:${key}:${JSON.stringify(params)}`
      : `${lang}:${key}`;

    const cached = TranslationCache.get(cacheKey);
    if (cached !== null) return cached;

    let text = (lang === "custom"
      ? (_customLangData?.[key] || TRANSLATIONS["en"][key])
      : (TRANSLATIONS[lang]?.[key] || TRANSLATIONS["en"][key])
    ) || key;

    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }

    TranslationCache.set(cacheKey, text);
    return text;
  }

  function clearTranslationCache() {
    TranslationCache.clear();
    DEBUG && console.log("[Translation] Cache cleared");
  }

  const TRANSLATIONS = {
    en: {
      name: "English",
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

      fm_sec_wormhole: "🌀 Wormhole — Basics",
      fm_sec_wormhole_content:
        "• Click <span class='help-key'>＋</span> (create button) and paste a Discord channel URL to create a Wormhole shortcut.<br>"
        + "• <b>Click</b> a Wormhole → jump to that channel instantly.<br>"
        + "• <b>Right-click</b> a Wormhole → context menu: rename, delete, set icon, move to group, or toggle VIP.<br>"
        + "• <b>VIP (★)</b>: pinned Wormholes float to the top automatically.<br>"
        + "• <b>Groups</b>: organize Wormholes into named folders via right-click → Move to Group.<br>"
        + "• <b>Focus Mode</b>: icon-only compact view — toggle via the button at top-right of the Wormhole panel.",

      fm_sec_wm_send: "✉️ Wormhole — Send Message",
      fm_sec_wm_send_content:
        "• <b>Right-click</b> a Wormhole → <b>Send Message Here</b> to open the message overlay.<br>"
        + "• <b>Mode A (Navigate)</b>: switches to the target channel, injects text into Discord's editor, then returns — no API needed.<br>"
        + "• <b>Shift+Click</b> a Wormhole → opens the overlay in the current channel (no navigation).<br>"
        + "• Supports <b>Ctrl+V image paste</b> — images are attached and sent together with text.<br>"
        + "• Bottom options: <b>Auto-close</b> / <b>Go to channel</b> (mutual exclusive) / <b>Show notification</b>.<br>"
        + "• After sending, a clickable toast appears — click it to fly to the target channel.",

      fm_sec_wm_api: "⚡ Wormhole — API Mode (Secret)",
      fm_sec_wm_api_content:
        "• <b>Hold the Wormhole create button (＋) for 3 seconds</b> to unlock the API Mode panel.<br>"
        + "• <b>Mode B (Direct API)</b>: sends messages via Discord REST API — no page switch, faster, invisible.<br>"
        + "• Your Token is intercepted silently in the background (from Discord's own requests) — <b>never stored or transmitted</b>, memory only, cleared on page close.<br>"
        + "• Token detection starts automatically when Mode B is enabled — just use Discord normally and it will be captured.<br>"
        + "• Supports image upload via <b>multipart/form-data</b> in API mode.<br>"
        + "• If Token is lost after page refresh, the interceptor restarts automatically when you open the overlay.",
      welcome_title: "Welcome to {script}",
      select_lang_subtitle: "Please select your interface language",
      help_btn: "📖 Manual",
      cancel_btn: "✕ Close",
      security_notice_title: "⚠️ Security Disclaimer",
      security_notice_content:
        "URL conversion features (like vxtwitter, kkinstagram) rely on third-party services.\nDo not use them if you do not trust these services.\nUsers should have the ability to identify URL safety.",
      manual_content:
        "【Icons Guide】\n• ◫/≡ : Switch Menu Style (Flat / Group)\n• ⇄ : Click Logic Swap (Copy / Insert)\n• ␣ : Append Space at end\n• ↵ : Append Newline at end\n• ☆ : Custom Strings Panel\n• 🖱️ : Trigger Mode (Hover / Click)\n• 🌐 : Change Language\n\n【Actions】\n• **Click**: Copy (Default)\n• **Long Press (0.5s)**: Insert to Input\n• **Shift+Click**: Copy & Insert (Keep Menu Open)",
      manual_content_sections: `<div class='mm-section'><div class='mm-sec-title c-default'>⚡ Quick Start</div><div class='mm-content'>Hover over any Discord message → a copy button appears at the top-right corner.<br><b>Click</b> to copy text · <b>Long-press 0.5s</b> to insert into the input box · <b>Shift+Click</b> to copy AND insert (menu stays open).<br>Switch trigger to <span class='mm-key'>Click mode</span> via <span class='mm-key'>🖱️</span> if you prefer manual activation.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 Copy Menu — Text & Links</div><div class='mm-content'>• <b>Copy Text</b>: copies the full message text content.<br>• <b>Copy Media URL</b>: copies the direct URL of an image/video in the message.<br>• <b>Copy First Link (Clean)</b>: extracts and sanitizes the first URL (removes trackers).<br>• <b>Copy All Links</b>: copies every URL found in the message, one per line.<br>• <b>Copy as Markdown</b>: formats the link as <span class='mm-key'>[text](URL)</span> for Markdown use.<br>• <b>Insert [<span class='mm-key'>{t}</span>](URL)</b>: inserts a Markdown link directly into Discord's input box.<br>• <b>Hidden Format</b>: wraps content in <span class='mm-key'>|| spoiler ||</span> tags.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ Download</div><div class='mm-content'>• <b>Download Images/Media</b>: downloads all images or videos in the message.<br>• <b>Download as ZIP</b>: bundles multiple files into a single ZIP archive.<br>• Retries automatically on failure, falls back to alternate URL if available.</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 URL Conversion</div><div class='mm-content'><b>Twitter / X</b>: converts between twitter.com, x.com, vxtwitter, fixupx, fxtwitter, cunnyx.<br><b>Instagram</b>: converts between instagram.com ↔ kkinstagram.com for embed previews.<br><b>Bilibili</b>: converts to FX Bilibili or VX Bilibili for better embeds.<br><b>Pixiv</b>: converts between pixiv.net ↔ phixiv.net.<br><b>Batch convert</b>: <span class='mm-key'>⚡ Convert All (N)</span> processes every link of that type in the message at once.</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>🎛️ Toolbar Icons</div><div class='mm-content'><div class='mm-grid'><div><span class='mm-key'>◫/≡</span> Switch menu style: Flat / Group</div><div><span class='mm-key'>⇄</span> Swap click logic: Copy ↔ Insert</div><div><span class='mm-key'>␣</span> Append space to inserted text</div><div><span class='mm-key'>↵</span> Append newline to inserted text</div><div><span class='mm-key'>☆</span> Custom string panel (saved snippets)</div><div><span class='mm-key'>🖱️</span> Toggle trigger: Hover / Click</div><div><span class='mm-key'>🌐</span> Switch interface language</div></div></div></div><div class='mm-section'><div class='mm-sec-title c-default'>☆ Custom String Panel</div><div class='mm-content'>• Save frequently used text snippets (greetings, templates, code blocks).<br>• Click to copy · Long-press to insert into input box.<br>• <span class='mm-key'>Shift+Click</span> to delete entries continuously without confirmation.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 Wormhole — Overview</div><div class='mm-content'>Wormholes are <b>one-click channel shortcuts</b> that live in the Discord sidebar. Click <span class='mm-key'>＋</span> and paste any Discord channel URL to create one.<br><b>Click</b> the <span class='mm-key'>＋</span> button → create a new wormhole · <b>Long-press 1s</b> → open the settings menu.</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>🖱️ Navigation & Management</div><div class='mm-content'>• <b>Click</b> a wormhole → instantly jump to that channel.<br>• <b>Right-click</b> → menu: Rename · Delete · Set icon · Move to group · Toggle VIP.<br>• <b>VIP <span class='mm-key'>★</span></b>: pinned wormholes auto-float to the top.<br>• <b>Groups</b>: right-click → Move to Group to organize into folders.<br>• <b>Focus Mode</b>: icon-only compact view via the top-right panel button.<br>• <b>History</b> (purple badges): last visited channels saved, click to return.</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>✉️ Send Message</div><div class='mm-content'>• <b>Right-click</b> a wormhole → <b>Send Message Here</b> to open the overlay.<br>• <span class='mm-key'>Ctrl+V</span> to paste images directly — sent with text as one message.<br>• Bottom options (persisted): Auto-close · Go to channel · Show notification.<br>• A clickable 3-second toast appears after sending — click to fly to that channel.</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>⚡ Settings Menu & API Mode</div><div class='mm-content'>• <b>Long-press <span class='mm-key'>＋</span> for 1 second</b> to open the wormhole settings menu.<br>• Menu items: <span class='mm-key'>➕ Create New Wormhole</span> · <span class='mm-key'>✉️ Send Method & API Mode</span> · <span class='mm-key'>⚙️ More Settings</span> (expandable).<br>• <b>Send Method & API Mode</b> → opens the API panel:<br>&nbsp;&nbsp;— <b>Plan A (Navigate)</b>: switches channel, injects text, returns. No API token needed.<br>&nbsp;&nbsp;— <b>Plan B (Direct API)</b>: REST API send, no page switch, instant &amp; silent.<br>• Token is intercepted silently from Discord's own requests — <b>never stored to disk.</b><br>• After page refresh: interceptor auto-restarts when you open the send overlay.</div></div></div></div>`,
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
      download_cors_fail: "⚠️ CORS restricted — cannot download directly. Please copy the URL and open it manually to save.",
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
      mod_msg_warn_body: "Message Utility (⠿) is the core of this script.\\nAfter disabling, all ⠿ buttons will disappear.\\n\\nTo re-enable: right-click the Tampermonkey icon → 'Enable ⠿ Message Utility'.",
      mod_msg_warn_confirm: "Disable anyway",
      mod_msg_warn_cancel: "Cancel",
      mod_msg_enable_menu: "Enable ⠿ Message Utility",
      grp_copy: "📝 Copy >",
      grp_convert: "🔄 Convert >",
      grp_download: "⬇️ Download >",
      grp_system: "⚙️ System >",
      view_main: "Main",
      view_symbols: "Symbols",

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

      wm_url_prompt: "Please enter the full Discord channel URL:",
      wm_name_prompt: "Enter Wormhole Name (e.g. General):",
      wm_edit_title: "Edit Wormhole: {n}",
      wm_created: "Wormhole created!",
      wm_deleted: "Wormhole closed.",
      wm_nav_fail: "Navigation failed, please check the URL.",
      wm_alert_invalid_url:
        "Invalid URL! Please copy a valid Discord channel URL (containing /channels/).",
      wm_default_channel_name: "Channel",
      wm_refresh_confirm:
        "Interface cannot update immediately due to Discord lock.\nRefresh page now to view?",
      wm_root_group: "Uncategorized",

      wm_menu_edit: "✎ Edit Name",
      wm_menu_del: "🗑️ Close Wormhole",
      wm_menu_vip_add: "★ Set as VIP (Pin)",
      wm_menu_vip_remove: "☆ Unset VIP",
      wm_menu_move: "📂 Move to Group",

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
      wm_title: "Wormhole Controls\n• Click: Create new wormhole\n• Long-press 1s: Open settings menu",
      wm_settings_menu_title: "🌀 Wormhole Settings",
      wm_settings_create: "Create New Wormhole",
      wm_settings_send_mode: "Send Method & API Mode",
      wm_settings_more: "More Settings (Coming Soon)",
      wm_settings_position: "Switch Wormhole Position",
      wm_settings_position_navbar:    "Navigation Bar",
      wm_settings_position_titlebar:  "Channel Title Bar",
      wm_settings_position_input:     "Above Chat Input",
      wm_settings_position_topleft:   "Top-Left Corner (Fixed)",
      wm_focus_on: "Disable Focus Mode",
      wm_focus_off: "Enable Focus Mode (Icons Only)",
      wm_focus_size: "Icon Size",
      wm_focus_size_s: "S  · Small",
      wm_focus_size_m: "M  · Medium",
      wm_focus_size_l: "L  · Large",

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
      wm_send_mode_api: "⚡ API Mode",
      wm_send_mode_nav: "🔀 Navigate Mode",
      wm_send_mode_desc_api: "Send directly, no channel switch",
      wm_send_mode_desc_nav: "Switch to target channel, then send",
      wm_send_autoclose: "Auto-close after send",
      wm_send_show_toast: "Show send notification",
      wm_send_goto_channel: "Go to channel after send",
      wm_send_paste_hint: "📋 Ctrl+V to paste image",
      wm_send_token_warn: "⚠️ Token expired. Please re-open the API panel to detect again. Using Mode A this time.",
      wm_send_channel_fail: "❌ Channel load failed",
      wm_send_editor_missing: "❌ Editor not found",
      wm_send_uploading: "📎 Uploading {n} image(s)...",

      wm_api_panel_title: "⚗️ Wormhole API Mode (Advanced)",
      wm_api_mode_label_a: "Mode A — Navigate (Default)",
      wm_api_mode_label_b: "Mode B — Direct API (No page switch)",
      wm_api_warning_title: "⚠️ Risk Notice",
      wm_api_warning_body: "Using a User Token to call the Discord API violates Discord's Terms of Service. Your account may be banned. Use at your own risk.",
      wm_api_token_status_none: "Token: Not detected",
      wm_api_token_status_ready: "Token: Ready (memory only)",
      wm_api_detect_btn: "Detect My Token",
      wm_api_detect_confirm: "【Token Interception Consent】\n\nBy clicking OK, you authorize this script to intercept your Discord Token for this session.\n\n🔒 Security Guarantees:\n• Stored in memory only — never written to disk or any storage\n• Automatically cleared when the page is closed or refreshed\n• Never transmitted to any external server — all requests go directly to discord.com\n• Used exclusively for POST /channels/{id}/messages on your behalf\n\n⚠️ Acknowledgement:\n• You understand this session token grants message-sending access\n• You accept full responsibility for all messages sent via this mode\n\nProceed only if you trust this script and understand the above.",
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

      em_col_title: "My Collections",
      em_col_add_success: 'Saved to "{g}"!',
      em_col_tab_new: "New Tab",
      em_col_tab_prompt: "New Tab Name:",
      em_col_empty_tab: "This tab is empty.",
      em_col_del_tab_confirm: 'Delete tab "{n}" and all items inside?',
      em_modal_choose_tab: "Save to which collection?",
      em_modal_create_new: "+ Create New...",

      em_tip_pick: "Set cover image",
      em_tip_edit: "Edit note",
      em_tip_delete: "Delete",
      em_menu_emoji: "Emojis",
      em_menu_sticker: "Stickers",
      em_menu_gif: "GIFs",

      menu_export: "📤 Export Settings (Backup)",
      menu_import: "⬇️ Import Settings (Restore)",
      menu_change_lang: "🌐 Change Language",
      custom_lang_desc: "Click 「📤 Export」 to get the English source JSON. After translating, click 「📥 Import」 to apply your language.\nNo matching language? Try: Deutsch (Benutzerdefinierte Übersetzung) · ภาษาไทย (ภาษาที่กำหนดเอง) · Türkçe (Özel Çeviri) · Polski (Niestandardowe tłumaczenie) · Italiano (Traduzione personalizzata)",
      custom_lang_export: "📤 Export Text",
      custom_lang_import: "📥 Import Text",
      custom_lang_apply: "✅ Apply & Reload",
      custom_lang_loaded: "✅ Loaded: {name}",
      custom_lang_activate: "🌐 Apply \"{name}\"",
      custom_lang_json_error: "⚠️ JSON Error: {msg}",
      custom_lang_paste_hint: "Paste the translated JSON here …",
    },

    "zh-TW": {
      name: "繁體中文",
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

      fm_sec_wormhole: "🌀 蟲洞 — 基本操作",
      fm_sec_wormhole_content:
        "• 點擊 <span class='help-key'>＋</span> 建立按鈕，貼上 Discord 頻道網址即可建立蟲洞捷徑。<br>"
        + "• <b>單擊</b>蟲洞 → 立即跳轉至該頻道。<br>"
        + "• <b>右鍵</b>蟲洞 → 開啟選單：重新命名、刪除、設定圖示、移動到分組、切換 VIP。<br>"
        + "• <b>VIP（★）</b>：設為 VIP 的蟲洞會自動置頂顯示。<br>"
        + "• <b>分組</b>：透過右鍵 → 移動到分組，可將蟲洞整理進資料夾。<br>"
        + "• <b>聚焦模式</b>：僅顯示圖示的精簡視圖，可透過蟲洞面板右上角按鈕切換。",

      fm_sec_wm_send: "✉️ 蟲洞 — 傳送訊息",
      fm_sec_wm_send_content:
        "• <b>右鍵</b>蟲洞 → <b>在此頻道傳送訊息</b>，開啟傳訊輸入欄。<br>"
        + "• <b>方案 A（跳頁模式）</b>：自動切換至目標頻道，將文字注入 Discord 編輯器後返回，無需 API。<br>"
        + "• <b>Shift + 點擊</b>蟲洞 → 在當前頻道開啟輸入欄（不跳頁）。<br>"
        + "• 支援 <b>Ctrl+V 貼上圖片</b>，圖片與文字會合併成一則訊息一起送出。<br>"
        + "• 底部選項：<b>傳送後自動關閉</b> / <b>傳送後前往該頻道</b>（兩者互斥）/ <b>顯示傳訊通知</b>。<br>"
        + "• 傳送成功後會出現可點擊的通知，點擊後立即飛往目標頻道。",

      fm_sec_wm_api: "⚡ 蟲洞 — API 模式（彩蛋）",
      fm_sec_wm_api_content:
        "• <b>長按蟲洞建立按鈕（＋）3 秒</b>，即可解鎖 API 模式設定面板。<br>"
        + "• <b>方案 B（直接 API）</b>：透過 Discord REST API 傳送訊息，無需切換頁面，速度更快、更隱匿。<br>"
        + "• Token 由腳本在背景靜默攔截（來自 Discord 自身發出的請求），<b>絕不儲存或外傳</b>，僅存於記憶體，關閉頁面即消失。<br>"
        + "• 啟用方案 B 後，Token 偵測會自動在背景運行，正常使用 Discord 即可自動捕獲，無需手動操作。<br>"
        + "• API 模式支援圖片上傳（multipart/form-data），圖文可一次傳出。<br>"
        + "• 頁面重新整理後若 Token 遺失，開啟傳訊視窗時攔截器會自動重啟。",
      select_lang_subtitle: "請選擇您的介面語言 / Please Select Language",
      help_btn: "📖 使用說明",
      cancel_btn: "✕ 關閉",
      security_notice_title: "⚠️ 安全與免責聲明",
      security_notice_content:
        "本腳本提供的「網址轉換」功能（如 vxtwitter, kkinstagram 等）皆依賴第三方開源服務。\n若您不信任這些第三方服務，請勿點擊轉換選項。\n請使用者自行具備辨識網址安全性的能力。",
      manual_content:
        "【圖示說明】\n• ◫/≡ : 切換選單風格 (平面 / 群組)\n• ⇄ : 點擊邏輯互換 (複製 / 填充)\n• ␣ : 尾部添加空格\n• ↵ : 尾部添加換行\n• ☆ : 自定義字串面板\n• 🖱️ : 切換觸發模式 (懸停 / 點擊)\n• 🌐 : 切換語言\n\n【操作方式】\n• **單擊**: 複製 (預設)\n• **長按 (0.5秒)**: 填充至輸入框\n• **Shift+單擊**: 同時複製並填充 (保持選單開啟)",
      manual_content_sections: `<div class='mm-section'><div class='mm-sec-title c-default'>⚡ 快速開始</div><div class='mm-content'>將滑鼠懸停在任意 Discord 訊息上 → 右上角出現複製按鈕。<br><b>單擊</b>複製文字 · <b>長按 0.5秒</b>填充到輸入框 · <b>Shift+單擊</b>同時複製並填充（選單保持開啟）。<br>透過工具列的 <span class='mm-key'>🖱️</span> 可切換為<span class='mm-key'>點擊模式</span>，改為手動觸發。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 複製選單 — 文字與連結</div><div class='mm-content'>• <b>複製文字</b>：複製訊息的完整文字內容。<br>• <b>複製媒體網址</b>：複製訊息中圖片或影片的直接連結。<br>• <b>複製第一個連結（已淨化）</b>：提取並清除追蹤參數的第一個 URL。<br>• <b>複製所有連結</b>：將訊息中所有 URL 每行一個一次複製。<br>• <b>複製為 Markdown</b>：格式化為 <span class='mm-key'>[文字](URL)</span> 供 Markdown 使用。<br>• <b>插入 Markdown 連結</b>：直接將連結格式注入 Discord 的輸入框。<br>• <b>隱藏格式</b>：自動包裹為 <span class='mm-key'>|| 暴雷內容 ||</span> 格式。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ 下載</div><div class='mm-content'>• <b>下載圖片/媒體</b>：下載該則訊息中的所有圖片或影片。<br>• <b>下載為 ZIP</b>：多個檔案自動打包為單一 ZIP 壓縮檔。<br>• 下載失敗時自動重試，並備援切換至備用連結。</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 網址轉換</div><div class='mm-content'><b>Twitter / X</b>：在 twitter.com、x.com、vxtwitter、fixupx、fxtwitter、cunnyx 之間互轉，修復 Discord 預覽。<br><b>Instagram</b>：instagram.com ↔ kkinstagram.com，讓嵌入預覽正常顯示。<br><b>Bilibili</b>：轉換為 FX Bilibili 或 VX Bilibili 取得更好的嵌入效果。<br><b>Pixiv</b>：pixiv.net ↔ phixiv.net 互轉，在 Discord 直接顯示插圖預覽。<br><b>批次轉換</b>：<span class='mm-key'>⚡ 全部轉為 (N)</span> 一次處理訊息中同類型的所有連結。</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>🎛️ 工具列圖示說明</div><div class='mm-content'><div class='mm-grid'><div><span class='mm-key'>◫/≡</span> 切換選單風格：平面 / 群組</div><div><span class='mm-key'>⇄</span> 互換點擊邏輯：複製 ↔ 填充</div><div><span class='mm-key'>␣</span> 填充時在尾部附加空格</div><div><span class='mm-key'>↵</span> 填充時在尾部附加換行</div><div><span class='mm-key'>☆</span> 自定義字串面板（常用片段）</div><div><span class='mm-key'>🖱️</span> 切換觸發方式：懸停 / 點擊</div><div><span class='mm-key'>🌐</span> 切換介面語言</div></div></div></div><div class='mm-section'><div class='mm-sec-title c-default'>☆ 自定義字串面板</div><div class='mm-content'>• 儲存常用的文字片段（問候語、模板、程式碼區塊等）。<br>• 單擊複製 · 長按填充到輸入框。<br>• <span class='mm-key'>Shift+單擊</span> 可連續刪除條目，無需逐一確認。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 蟲洞 — 總覽</div><div class='mm-content'>蟲洞是存在 Discord 側邊欄的<b>一鍵頻道捷徑</b>。點擊 <span class='mm-key'>＋</span> 並貼上 Discord 頻道網址即可建立。<br><b>單擊</b> <span class='mm-key'>＋</span> → 建立新蟲洞 · <b>長按 1 秒</b> → 開啟設定選單。</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>🖱️ 導航與管理</div><div class='mm-content'>• <b>單擊</b>蟲洞 → 立即跳轉至該頻道。<br>• <b>右鍵</b>蟲洞 → 選單：重新命名 · 刪除 · 設定圖示 · 移至群組 · 切換 VIP。<br>• <b>VIP <span class='mm-key'>★</span></b>：設為 VIP 的蟲洞自動置頂顯示。<br>• <b>分組</b>：右鍵 → 移動到分組，整理進資料夾。<br>• <b>聚焦模式</b>：圖示精簡視圖，蟲洞面板右上角按鈕切換。<br>• <b>歷史紀錄</b>（紫色標籤）：自動記錄最近造訪頻道，點擊即可返回。</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>✉️ 傳送訊息</div><div class='mm-content'>• <b>右鍵</b>蟲洞 → <b>在此頻道傳送訊息</b> 開啟輸入欄。<br>• <span class='mm-key'>Ctrl+V</span> 直接貼上圖片，圖文合為一則訊息一起送出。<br>• 底部選項（跨次保留）：自動關閉 · 前往頻道 · 顯示通知。<br>• 傳送後彈出 3 秒可點擊通知，點擊即飛往目標頻道。</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>⚙️ 設定選單與 API 模式</div><div class='mm-content'>• <b>長按 <span class='mm-key'>＋</span> 1 秒</b>即可開啟蟲洞設定選單。<br>• 選單項目：<span class='mm-key'>➕ 建立新蟲洞</span> · <span class='mm-key'>✉️ 傳訊方式與 API 模式</span> · <span class='mm-key'>⚙️ 更多設定</span>（可擴充）。<br>• 點擊「<b>傳訊方式與 API 模式</b>」→ 開啟 API 設定面板：<br>&nbsp;&nbsp;— <b>方案 A（跳頁）</b>：自動切換頻道，注入文字後返回，無需 Token。<br>&nbsp;&nbsp;— <b>方案 B（直接 API）</b>：REST API 直送，不切換頁面，即時且隱匿。<br>• Token 由背景靜默攔截 Discord 自身請求取得——<b>絕不寫入磁碟或外傳。</b><br>• 頁面重整後：開啟傳訊輸入欄時攔截器會自動重啟。</div></div></div></div>`,
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
      download_cors_fail: "⚠️ 此縮圖受 CORS 限制，無法直接下載。請複製網址後手動開啟儲存。",
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
      mod_msg_warn_body: "⠿ 訊息工具是本腳本的核心功能。\\n停用後，所有訊息的 ⠿ 按鈕將會消失。\\n\\n若要重新啟用：右鍵點擊 Tampermonkey 圖示 → 選擇「啟用 ⠿ 訊息工具」。",
      mod_msg_warn_confirm: "仍要停用",
      mod_msg_warn_cancel: "取消",
      mod_msg_enable_menu: "啟用 ⠿ 訊息工具",
      grp_copy: "📝 複製相關 >",
      grp_convert: "🔄 轉換相關 >",
      grp_download: "⬇️ 下載相關 >",
      grp_system: "⚙️ 系統與符號 >",
      view_main: "主選單",
      view_symbols: "自定義字串",

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

      wm_menu_edit: "✎ 編輯名稱",
      wm_menu_del: "🗑️ 關閉蟲洞",
      wm_menu_vip_add: "★ 設為 VIP (置頂)",
      wm_menu_vip_remove: "☆ 取消 VIP",
      wm_menu_move: "📂 移動到群組",

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

      wm_title: "蟲洞控制台\n• 單擊：建立新蟲洞\n• 長按 1 秒：開啟設定選單",
      wm_settings_menu_title: "🌀 蟲洞設定",
      wm_settings_create: "建立新蟲洞",
      wm_settings_send_mode: "傳訊方式與 API 模式",
      wm_settings_more: "更多設定（敬請期待）",
      wm_settings_position: "切換蟲洞顯示位置",
      wm_settings_position_navbar:    "導航欄",
      wm_settings_position_titlebar:  "頻道標題欄",
      wm_settings_position_input:     "訊息輸入框上緣",
      wm_settings_position_topleft:   "左上角（固定懸浮）",
      wm_focus_on: "關閉聚焦模式",
      wm_focus_off: "開啟聚焦模式（僅顯示圖示）",
      wm_focus_size: "圖示大小",
      wm_focus_size_s: "S  · 小",
      wm_focus_size_m: "M  · 中",
      wm_focus_size_l: "L  · 大",

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
      wm_send_mode_api: "⚡ API 模式",
      wm_send_mode_nav: "🔀 跳頁模式",
      wm_send_mode_desc_api: "直接傳送，不切換頻道",
      wm_send_mode_desc_nav: "切換至目標頻道後傳送",
      wm_send_autoclose: "傳送後自動關閉",
      wm_send_show_toast: "顯示傳訊通知",
      wm_send_goto_channel: "傳送後前往該頻道",
      wm_send_paste_hint: "📋 可 Ctrl+V 貼上圖片",
      wm_send_token_warn: "⚠️ Token 已失效，請重新開啟彩蛋面板偵測。本次使用方案 A。",
      wm_send_channel_fail: "❌ 頻道載入失敗",
      wm_send_editor_missing: "❌ 找不到輸入框",
      wm_send_uploading: "📎 上傳 {n} 張圖片...",

      wm_api_panel_title: "⚗️ 蟲洞 API 模式（進階）",
      wm_api_mode_label_a: "方案 A — 跳頁模式（預設）",
      wm_api_mode_label_b: "方案 B — 直接 API（不切換頁面）",
      wm_api_warning_title: "⚠️ 風險聲明",
      wm_api_warning_body: "使用 User Token 呼叫 Discord API 違反 Discord 服務條款，帳號可能面臨封禁風險，請自行評估。",
      wm_api_token_status_none: "Token：尚未偵測",
      wm_api_token_status_ready: "Token：已就緒（僅存於記憶體）",
      wm_api_detect_btn: "偵測我的 Token",
      wm_api_detect_confirm: "【Token 攔截授權同意書】\n\n點擊「確認」即代表您同意本腳本在本次工作階段中攔截您的 Discord Token。\n\n🔒 安全保證：\n• 僅存於瀏覽器記憶體，絕不寫入任何儲存空間或磁碟\n• 頁面關閉或重新整理後自動清除，不留任何痕跡\n• 絕不傳送至任何外部伺服器，所有請求直接發往 discord.com\n• 僅用於代您執行 POST /channels/{id}/messages 操作\n\n⚠️ 使用者聲明：\n• 您了解此 Token 具備傳送訊息的能力\n• 透過本模式傳送的所有訊息，責任由您自行承擔\n\n請在確認信任本腳本且理解上述內容後再繼續。",
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

      em_col_title: "我的收藏庫",
      em_col_add_success: '已儲存到「{g}」！',
      em_col_tab_new: "新增分頁",
      em_col_tab_prompt: "新分頁名稱：",
      em_col_empty_tab: "此分頁尚無內容。",
      em_col_del_tab_confirm: '刪除分頁「{n}」及其所有項目？',
      em_modal_choose_tab: "儲存到哪個收藏庫？",
      em_modal_create_new: "+ 建立新的...",
      em_tip_pick: "設定封面圖",
      em_tip_edit: "編輯備註",
      em_tip_delete: "刪除",
      em_menu_emoji: "表情符號",
      em_menu_sticker: "貼圖",
      em_menu_gif: "GIF",

      menu_export: "📤 匯出設定 (Backup)",
      menu_import: "⬇️ 匯入設定 (Restore)",
      menu_change_lang: "🌐 變更語言 (Language)",
      custom_lang_desc: "點「📤 匯出文本」取得英文原文 JSON，翻譯後再點「📥 匯入文本」貼回即可套用。",
      custom_lang_export: "📤 匯出文本",
      custom_lang_import: "📥 匯入文本",
      custom_lang_apply: "✅ 套用並重新整理",
      custom_lang_loaded: "✅ 已載入：{name}",
      custom_lang_activate: "🌐 套用「{name}」",
      custom_lang_json_error: "⚠️ JSON 格式錯誤：{msg}",
      custom_lang_paste_hint: "貼上翻譯後的 JSON 文本 …",
    },

    "zh-CN": {
      name: "简体中文",
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
        "• 点击收藏按钮后，会自动执行\"预热 -> 输入 -> 锁定\"流程。<br>• 这是为了修复 Discord\"直接填入搜索不到\"的 Bug。<br>• 搜索时会进行 <span style='color:#2dc770'>精准比对</span>，确保不会转发错人。",
      fm_sec_fuzzy: "⏎ 模糊搜索",
      fm_sec_fuzzy_content:
        "• 点击按钮右侧的 <span class='help-key'>⏎</span> 小箭头。<br>• 仅输入前两个字或第一个单词，适合名称有变动或符号的频道。",
      fm_sec_user: "👤 用户专区",
      fm_sec_user_content:
        "• 点击最右侧的 <span class='help-key'>👤</span> 按钮可展开用户清单。<br>• 支持手动新增用户 ID (适合找不到人的情况)。",
      fm_sec_misc_title: "⚙️ 显示与小技巧",
      fm_sec_misc:
        "• 左上角按钮可切换<b>平铺</b>或<b>下拉菜单</b>显示模式。<br>• <b>历史记录</b>（紫色标签）会自动记录最近访问的频道，点击可立即跳回。",

      fm_sec_wormhole: "🌀 虫洞 — 基本操作",
      fm_sec_wormhole_content:
        "• 点击 <span class='help-key'>＋</span> 创建按钮，粘贴 Discord 频道网址即可创建虫洞快捷方式。<br>"
        + "• <b>单击</b>虫洞 → 立即跳转至该频道。<br>"
        + "• <b>右键</b>虫洞 → 打开菜单：重命名、删除、设置图标、移动到分组、切换 VIP。<br>"
        + "• <b>VIP（★）</b>：设为 VIP 的虫洞会自动置顶显示。<br>"
        + "• <b>分组</b>：通过右键 → 移动到分组，可将虫洞整理进文件夹。<br>"
        + "• <b>聚焦模式</b>：仅显示图标的精简视图，可通过虫洞面板右上角按钮切换。",

      fm_sec_wm_send: "✉️ 虫洞 — 发送消息",
      fm_sec_wm_send_content:
        "• <b>右键</b>虫洞 → <b>在此频道发送消息</b>，打开消息输入框。<br>"
        + "• <b>方案 A（跳页模式）</b>：自动切换至目标频道，将文字注入 Discord 编辑器后返回，无需 API。<br>"
        + "• <b>Shift + 点击</b>虫洞 → 在当前频道打开输入框（不跳页）。<br>"
        + "• 支持 <b>Ctrl+V 粘贴图片</b>，图片与文字会合并成一条消息一起发送。<br>"
        + "• 底部选项：<b>发送后自动关闭</b> / <b>发送后前往该频道</b>（二者互斥）/ <b>显示发送通知</b>。<br>"
        + "• 发送成功后会出现可点击的通知，点击后立即跳转到目标频道。",

      fm_sec_wm_api: "⚡ 虫洞 — API 模式（彩蛋）",
      fm_sec_wm_api_content:
        "• <b>长按虫洞创建按钮（＋）3 秒</b>，即可解锁 API 模式设置面板。<br>"
        + "• <b>方案 B（直接 API）</b>：通过 Discord REST API 发送消息，无需切换页面，速度更快、更隐蔽。<br>"
        + "• Token 由脚本在后台静默拦截（来自 Discord 自身发出的请求），<b>绝不存储或外传</b>，仅存于内存，关闭页面即消失。<br>"
        + "• 启用方案 B 后，Token 检测会自动在后台运行，正常使用 Discord 即可自动捕获，无需手动操作。<br>"
        + "• API 模式支持图片上传（multipart/form-data），图文可一次发出。<br>"
        + "• 页面刷新后若 Token 丢失，打开发送窗口时拦截器会自动重启。",

      welcome_title: "欢迎使用 {script}",
      select_lang_subtitle: "请选择您的界面语言",
      help_btn: "📖 使用说明",
      cancel_btn: "✕ 关闭",
      security_notice_title: "⚠️ 安全与免责声明",
      security_notice_content:
        "本脚本提供的\"网址转换\"功能（如 vxtwitter, kkinstagram 等）皆依赖第三方开源服务。\n若您不信任这些第三方服务，请勿点击转换选项。\n请使用者自行具备辨识网址安全性的能力。",
      manual_content:
        "【图标说明】\n• ◫/≡ : 切换菜单风格 (平面 / 群组)\n• ⇄ : 点击逻辑互换 (复制 / 填充)\n• ␣ : 尾部添加空格\n• ↵ : 尾部添加换行\n• ☆ : 自定义字符串面板\n• 🖱️ : 切换触发模式 (悬停 / 点击)\n• 🌐 : 切换语言\n\n【操作方式】\n• **单击**: 复制 (默认)\n• **长按 (0.5秒)**: 填充至输入框\n• **Shift+单击**: 同时复制并填充 (保持菜单开启)",
      manual_content_sections: `<div class='mm-section'><div class='mm-sec-title c-default'>⚡ 快速开始</div><div class='mm-content'>将鼠标悬停在任意 Discord 消息上 → 右上角出现复制按钮。<br><b>单击</b>复制文字 · <b>长按 0.5秒</b>填充到输入框 · <b>Shift+单击</b>同时复制并填充（菜单保持开启）。<br>通过工具栏的 <span class='mm-key'>🖱️</span> 可切换为<span class='mm-key'>点击模式</span>，改为手动触发。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 复制菜单 — 文字与链接</div><div class='mm-content'>• <b>复制文字</b>：复制消息的完整文字内容。<br>• <b>复制媒体网址</b>：复制消息中图片或视频的直接链接。<br>• <b>复制第一个链接（已净化）</b>：提取并清除追踪参数的第一个 URL。<br>• <b>复制所有链接</b>：将消息中所有 URL 每行一个一次复制。<br>• <b>复制为 Markdown</b>：格式化为 <span class='mm-key'>[文字](URL)</span> 供 Markdown 使用。<br>• <b>插入 Markdown 链接</b>：直接将链接格式注入 Discord 的输入框。<br>• <b>隐藏格式</b>：自动包裹为 <span class='mm-key'>|| 剧透内容 ||</span> 格式。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ 下载</div><div class='mm-content'>• <b>下载图片/媒体</b>：下载该条消息中的所有图片或视频。<br>• <b>下载为 ZIP</b>：多个文件自动打包为单一 ZIP 压缩包。<br>• 下载失败时自动重试，并备援切换至备用链接。</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 网址转换</div><div class='mm-content'><b>Twitter / X</b>：在 twitter.com、x.com、vxtwitter、fixupx、fxtwitter、cunnyx 之间互转，修复 Discord 预览。<br><b>Instagram</b>：instagram.com ↔ kkinstagram.com，让嵌入预览正常显示。<br><b>Bilibili</b>：转换为 FX Bilibili 或 VX Bilibili 获得更好的嵌入效果。<br><b>Pixiv</b>：pixiv.net ↔ phixiv.net 互转，在 Discord 直接显示插图预览。<br><b>批量转换</b>：<span class='mm-key'>⚡ 全部转为 (N)</span> 一次处理消息中同类型的所有链接。</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>🎛️ 工具栏图标说明</div><div class='mm-content'><div class='mm-grid'><div><span class='mm-key'>◫/≡</span> 切换菜单风格：平面 / 群组</div><div><span class='mm-key'>⇄</span> 互换点击逻辑：复制 ↔ 填充</div><div><span class='mm-key'>␣</span> 填充时在尾部附加空格</div><div><span class='mm-key'>↵</span> 填充时在尾部附加换行</div><div><span class='mm-key'>☆</span> 自定义字符串面板（常用片段）</div><div><span class='mm-key'>🖱️</span> 切换触发方式：悬停 / 点击</div><div><span class='mm-key'>🌐</span> 切换界面语言</div></div></div></div><div class='mm-section'><div class='mm-sec-title c-default'>☆ 自定义字符串面板</div><div class='mm-content'>• 储存常用的文字片段（问候语、模板、代码块等）。<br>• 单击复制 · 长按填充到输入框。<br>• <span class='mm-key'>Shift+单击</span> 可连续删除条目，无需逐一确认。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 虫洞 — 总览</div><div class='mm-content'>虫洞是存在 Discord 侧边栏的<b>一键频道快捷方式</b>。点击 <span class='mm-key'>＋</span> 并粘贴 Discord 频道网址即可创建。<br><b>单击</b> <span class='mm-key'>＋</span> → 创建新虫洞 · <b>长按 1 秒</b> → 打开设置菜单。</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>🖱️ 导航与管理</div><div class='mm-content'>• <b>单击</b>虫洞 → 立即跳转至该频道。<br>• <b>右键</b>虫洞 → 菜单：重命名 · 删除 · 设置图标 · 移至群组 · 切换 VIP。<br>• <b>VIP <span class='mm-key'>★</span></b>：设为 VIP 的虫洞自动置顶显示。<br>• <b>分组</b>：右键 → 移动到分组，整理进文件夹。<br>• <b>聚焦模式</b>：图标精简视图，虫洞面板右上角按钮切换。<br>• <b>历史记录</b>（紫色标签）：自动记录最近访问频道，点击即可返回。</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>✉️ 发送消息</div><div class='mm-content'>• <b>右键</b>虫洞 → <b>在此频道发送消息</b> 打开输入框。<br>• <span class='mm-key'>Ctrl+V</span> 直接粘贴图片，图文合为一条消息一起发送。<br>• 底部选项（跨次保留）：自动关闭 · 前往频道 · 显示通知。<br>• 发送后弹出 3 秒可点击通知，点击即跳转到目标频道。</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>⚙️ 设置菜单与 API 模式</div><div class='mm-content'>• <b>长按 <span class='mm-key'>＋</span> 1 秒</b>即可打开虫洞设置菜单。<br>• 菜单项目：<span class='mm-key'>➕ 创建新虫洞</span> · <span class='mm-key'>✉️ 发送方式与 API 模式</span> · <span class='mm-key'>⚙️ 更多设置</span>（可扩展）。<br>• 点击「<b>发送方式与 API 模式</b>」→ 打开 API 设置面板：<br>&nbsp;&nbsp;— <b>方案 A（跳页）</b>：自动切换频道，注入文字后返回，无需 Token。<br>&nbsp;&nbsp;— <b>方案 B（直接 API）</b>：REST API 直发，不切换页面，即时且隐蔽。<br>• Token 由后台静默拦截 Discord 自身请求取得——<b>绝不写入磁盘或外传。</b><br>• 页面刷新后：打开发送输入框时拦截器会自动重启。</div></div></div></div>`,
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
      download_cors_fail: "⚠️ 此缩略图受 CORS 限制，无法直接下载。请复制网址后手动打开保存。",
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
      mod_msg_warn_body: "⠿ 消息工具是本脚本的核心功能。\\n停用后，所有消息的 ⠿ 按鈕将会消失。\\n\\n若要重新启用：右键点击 Tampermonkey 图标 → 选择「启用 ⠿ 消息工具」。",
      mod_msg_warn_confirm: "仍要停用",
      mod_msg_warn_cancel: "取消",
      mod_msg_enable_menu: "启用 ⠿ 消息工具",
      grp_copy: "📝 复制相关 >",
      grp_convert: "🔄 转换相关 >",
      grp_download: "⬇️ 下载相关 >",
      grp_system: "⚙️ 系统与符号 >",
      view_main: "主菜单",
      view_symbols: "自定义字符串",

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
      em_del_confirm: "删除\"{k}\"?",
      em_note_prompt: "备注：",
      em_set_cover_success: "已设定封面图！",

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

      wm_menu_edit: "✎ 编辑名称",
      wm_menu_del: "🗑️ 关闭虫洞",
      wm_menu_vip_add: "★ 设为 VIP (置顶)",
      wm_menu_vip_remove: "☆ 取消 VIP",
      wm_menu_move: "📂 移动到分组",

      wm_group_prompt: "请输入新分组名称：",
      wm_edit_group: "编辑分组名称：",
      wm_group_del_confirm: "解散分组\"{n}\"？(内含虫洞将会保留)",
      wm_group_select_prompt:
        "请输入数字选择分组：\n\n0. [根目录/未分类]\n{list}\n\n留空并按下确认可创建\"新分组\"：",
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
      wm_settings_position_navbar:    "导航栏",
      wm_settings_position_titlebar:  "频道标题栏",
      wm_settings_position_input:     "消息输入框上方",
      wm_settings_position_topleft:   "左上角（固定悬浮）",
      wm_focus_on: "关闭聚焦模式",
      wm_focus_off: "开启聚焦模式（仅显示图标）",
      wm_focus_size: "图标大小",
      wm_focus_size_s: "S  · 小",
      wm_focus_size_m: "M  · 中",
      wm_focus_size_l: "L  · 大",

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
      wm_send_mode_api: "⚡ API 模式",
      wm_send_mode_nav: "🔀 跳页模式",
      wm_send_mode_desc_api: "直接发送，不切换频道",
      wm_send_mode_desc_nav: "切换至目标频道后发送",
      wm_send_autoclose: "发送后自动关闭",
      wm_send_show_toast: "显示发送通知",
      wm_send_goto_channel: "发送后前往该频道",
      wm_send_paste_hint: "📋 可 Ctrl+V 粘贴图片",
      wm_send_token_warn: "⚠️ Token 已失效，请重新打开彩蛋面板检测。本次使用方案 A。",
      wm_send_channel_fail: "❌ 频道加载失败",
      wm_send_editor_missing: "❌ 找不到输入框",
      wm_send_uploading: "📎 上传 {n} 张图片...",

      wm_api_panel_title: "⚗️ 虫洞 API 模式（进阶）",
      wm_api_mode_label_a: "方案 A — 跳页模式（默认）",
      wm_api_mode_label_b: "方案 B — 直接 API（不切换页面）",
      wm_api_warning_title: "⚠️ 风险声明",
      wm_api_warning_body: "使用 User Token 调用 Discord API 违反 Discord 服务条款，账号可能面临封禁风险，请自行评估。",
      wm_api_token_status_none: "Token：尚未检测",
      wm_api_token_status_ready: "Token：已就绪（仅存于内存）",
      wm_api_detect_btn: "检测我的 Token",
      wm_api_detect_confirm: "【Token 拦截授权同意书】\n\n点击「确认」即代表您同意本脚本在本次会话中拦截您的 Discord Token。\n\n🔒 安全保证：\n• 仅存于浏览器内存，绝不写入任何存储空间或磁盘\n• 页面关闭或刷新后自动清除，不留任何痕迹\n• 绝不发送至任何外部服务器，所有请求直接发往 discord.com\n• 仅用于代您执行 POST /channels/{id}/messages 操作\n\n⚠️ 用户声明：\n• 您了解此 Token 具备发送消息的能力\n• 通过本模式发送的所有消息，责任由您自行承担\n\n请在确认信任本脚本且理解上述内容后再继续。",
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

      em_col_title: "我的收藏库",
      em_col_add_success: '已保存到"{g}"！',
      em_col_tab_new: "新增标签页",
      em_col_tab_prompt: "新标签页名称：",
      em_col_empty_tab: "此标签页暂无内容。",
      em_col_del_tab_confirm: '删除标签页"{n}"及其所有内容？',
      em_modal_choose_tab: "保存到哪个收藏库？",
      em_modal_create_new: "+ 创建新的...",
      em_tip_pick: "设置封面图",
      em_tip_edit: "编辑备注",
      em_tip_delete: "删除",
      em_menu_emoji: "表情符号",
      em_menu_sticker: "贴纸",
      em_menu_gif: "GIF",

      menu_export: "📤 导出设置 (Backup)",
      menu_import: "⬇️ 导入设置 (Restore)",
      menu_change_lang: "🌐 切换语言 (Language)",
      custom_lang_desc: "点「📤 导出文本」获取英文原文 JSON，翻译后再点「📥 导入文本」粘贴回来即可应用。",
      custom_lang_export: "📤 导出文本",
      custom_lang_import: "📥 导入文本",
      custom_lang_apply: "✅ 应用并刷新",
      custom_lang_loaded: "✅ 已载入：{name}",
      custom_lang_activate: "🌐 应用「{name}」",
      custom_lang_json_error: "⚠️ JSON 格式错误：{msg}",
      custom_lang_paste_hint: "粘贴翻译后的 JSON 文本 …",
    },

    ja: {
      name: "日本語",
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

      fm_sec_wormhole: "🌀 ワームホール — 基本操作",
      fm_sec_wormhole_content:
        "• <span class='help-key'>＋</span> 作成ボタンをクリックして Discord チャンネルの URL を貼り付けると、ワームホールが作成されます。<br>"
        + "• <b>クリック</b>するとそのチャンネルへ即座にジャンプします。<br>"
        + "• <b>右クリック</b> → メニュー：名前変更・削除・アイコン設定・グループ移動・VIP 切替。<br>"
        + "• <b>VIP（★）</b>：設定したワームホールは自動的に最上部に固定されます。<br>"
        + "• <b>グループ</b>：右クリック → グループに移動 で、フォルダに整理できます。<br>"
        + "• <b>フォーカスモード</b>：アイコンのみのコンパクト表示。パネル右上のボタンで切り替え。",

      fm_sec_wm_send: "✉️ ワームホール — メッセージ送信",
      fm_sec_wm_send_content:
        "• <b>右クリック</b> → <b>このチャンネルにメッセージを送る</b> で送信オーバーレイを開きます。<br>"
        + "• <b>プラン A（ページ移動）</b>：対象チャンネルへ自動移動し、Discordのエディタにテキストを注入して戻ります。API不要。<br>"
        + "• <b>Shift + クリック</b>：現在のチャンネルでオーバーレイを開きます（移動なし）。<br>"
        + "• <b>Ctrl+V 画像貼り付け</b>に対応。テキストと画像を1通にまとめて送信できます。<br>"
        + "• 下部オプション：<b>送信後に閉じる</b> / <b>送信後チャンネルへ移動</b>（相互排他）/ <b>送信通知を表示</b>。<br>"
        + "• 送信後にクリック可能なトーストが表示され、クリックで対象チャンネルへ即座に移動できます。",

      fm_sec_wm_api: "⚡ ワームホール — API モード（隠し機能）",
      fm_sec_wm_api_content:
        "• <b>ワームホール作成ボタン（＋）を3秒長押し</b>して API モード設定パネルを解除します。<br>"
        + "• <b>プラン B（直接 API）</b>：Discord REST API 経由でメッセージを送信。ページ切替なし、高速・ステルス動作。<br>"
        + "• Token はスクリプトがバックグラウンドで静かに傍受します（Discord 自身のリクエストから）。<b>保存・外部送信は一切なし</b>、メモリのみ保持、ページを閉じると消去。<br>"
        + "• プラン B を有効にすると Token 検出がバックグラウンドで自動起動。Discord を普通に使うだけで自動取得されます。<br>"
        + "• API モードは画像アップロード（multipart/form-data）対応。テキストと画像を1回で送信。<br>"
        + "• ページ更新後に Token が失われた場合、オーバーレイを開くと自動で再起動します。",

      welcome_title: "{script} へようこそ",
      select_lang_subtitle: "インターフェース言語を選択してください",
      help_btn: "📖 マニュアル",
      cancel_btn: "✕ 閉じる",
      security_notice_title: "⚠️ セキュリティに関する免責事項",
      security_notice_content:
        "URL変換機能（vxtwitter、kkinstagramなど）はサードパーティのサービスに依存しています。\n信頼できない場合は使用しないでください。\nURLの安全性を識別できる方のみご利用ください。",
      manual_content:
        "【アイコン説明】\n• ◫/≡ : メニュースタイル (フラット / グループ)\n• ⇄ : クリック動作切替 (コピー / 挿入)\n• ␣ : 末尾にスペース追加\n• ↵ : 末尾に改行追加\n• ☆ : カスタム文字列パネル\n• 🖱️ : 起動モード (ホバー / クリック)\n• 🌐 : 言語切り替え\n\n【操作方法】\n• **クリック**: コピー (デフォルト)\n• **長押し (0.5秒)**: 入力欄に挿入\n• **Shift+クリック**: コピーして挿入 (メニュー維持)",
      manual_content_sections: `<div class='mm-section'><div class='mm-sec-title c-default'>⚡ クイックスタート</div><div class='mm-content'>任意の Discord メッセージにマウスを合わせると → 右上にコピーボタンが表示されます。<br><b>クリック</b>でテキストコピー · <b>長押し 0.5秒</b>で入力欄に挿入 · <b>Shift+クリック</b>でコピーと挿入を同時実行（メニュー維持）。<br>ツールバーの <span class='mm-key'>🖱️</span> で<span class='mm-key'>クリックモード</span>に切替可能（手動トリガー）。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 コピーメニュー — テキスト・リンク</div><div class='mm-content'>• <b>テキストをコピー</b>：メッセージの全文テキストをコピーします。<br>• <b>メディアURLをコピー</b>：メッセージ内の画像・動画の直リンクをコピーします。<br>• <b>最初のリンクをコピー（浄化済）</b>：最初のURLからトラッキングパラメータを除去してコピー。<br>• <b>全リンクをコピー</b>：メッセージ内の全URLを1行ずつコピーします。<br>• <b>Markdownとしてコピー</b>：<span class='mm-key'>[テキスト](URL)</span> 形式に変換します。<br>• <b>Markdownリンクを挿入</b>：Discordの入力欄にMarkdown形式で直接挿入します。<br>• <b>隠しテキスト</b>：<span class='mm-key'>|| スポイラー ||</span> 形式で包みます。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ ダウンロード</div><div class='mm-content'>• <b>画像/メディアをダウンロード</b>：メッセージ内の全画像・動画をまとめてダウンロード。<br>• <b>ZIPとしてダウンロード</b>：複数ファイルを一つのZIPアーカイブにまとめます。<br>• 失敗時は自動リトライし、代替URLにフォールバックします。</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 URL変換</div><div class='mm-content'><b>Twitter / X</b>：twitter.com, x.com, vxtwitter, fixupx, fxtwitter, cunnyx の間で相互変換し Discord プレビューを修正。<br><b>Instagram</b>：instagram.com ↔ kkinstagram.com に変換して埋め込みプレビューを有効化。<br><b>Bilibili</b>：FX Bilibili または VX Bilibili に変換してより良い埋め込みを実現。<br><b>Pixiv</b>：pixiv.net ↔ phixiv.net の相互変換で Discord 内にイラストをプレビュー。<br><b>一括変換</b>：<span class='mm-key'>⚡ 全て変換 (N)</span> でメッセージ内の同種リンクをまとめて変換。</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>🎛️ ツールバーアイコン</div><div class='mm-content'><div class='mm-grid'><div><span class='mm-key'>◫/≡</span> メニュースタイル：フラット / グループ</div><div><span class='mm-key'>⇄</span> クリック動作切替：コピー ↔ 挿入</div><div><span class='mm-key'>␣</span> 挿入時に末尾スペースを追加</div><div><span class='mm-key'>↵</span> 挿入時に末尾改行を追加</div><div><span class='mm-key'>☆</span> カスタム文字列パネル</div><div><span class='mm-key'>🖱️</span> トリガー切替：ホバー / クリック</div><div><span class='mm-key'>🌐</span> 言語切り替え</div></div></div></div><div class='mm-section'><div class='mm-sec-title c-default'>☆ カスタム文字列パネル</div><div class='mm-content'>• よく使うテキスト（挨拶文・テンプレート・コードブロック）を保存できます。<br>• クリックでコピー · 長押しで入力欄に挿入。<br>• <span class='mm-key'>Shift+クリック</span>で確認なしに連続削除可能。</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 ワームホール — 概要</div><div class='mm-content'>ワームホールは Discord サイドバーの<b>ワンクリックチャンネルショートカット</b>です。<span class='mm-key'>＋</span> をクリックして Discord チャンネル URL を貼り付けると作成できます。<br><b>クリック</b> <span class='mm-key'>＋</span> → 新規作成 · <b>1秒長押し</b> → 設定メニューを開く。</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>🖱️ ナビゲーションと管理</div><div class='mm-content'>• <b>クリック</b>でそのチャンネルへ即ジャンプ。<br>• <b>右クリック</b> → メニュー：名前変更 · 削除 · アイコン設定 · グループ移動 · VIP 切替。<br>• <b>VIP <span class='mm-key'>★</span></b>：設定したワームホールは自動で最上部に固定。<br>• <b>グループ</b>：右クリック → グループに移動 でフォルダ整理。<br>• <b>フォーカスモード</b>：アイコンのみのコンパクト表示。パネル右上ボタンで切替。<br>• <b>履歴</b>（紫バッジ）：最近訪れたチャンネルを自動記録、クリックで即復帰。</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>✉️ メッセージ送信</div><div class='mm-content'>• <b>右クリック</b> → <b>このチャンネルにメッセージを送る</b> でオーバーレイを開く。<br>• <span class='mm-key'>Ctrl+V</span> で画像を直接貼り付け — テキストと一緒に1通で送信。<br>• 下部オプション（セッション間保持）：送信後閉じる · チャンネルへ移動 · 通知を表示。<br>• 送信後3秒間トーストが表示され、クリックで即チャンネルに移動できます。</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>⚙️ 設定メニューと API モード</div><div class='mm-content'>• <b><span class='mm-key'>＋</span> を1秒長押し</b>してワームホール設定メニューを開く。<br>• メニュー：<span class='mm-key'>➕ 新しいワームホールを作成</span> · <span class='mm-key'>✉️ 送信方式・API モード</span> · <span class='mm-key'>⚙️ その他の設定</span>（拡張予定）。<br>• 「<b>送信方式・API モード</b>」→ API 設定パネルを開く：<br>&nbsp;&nbsp;— <b>プラン A（ページ移動）</b>：自動移動→テキスト注入→復帰。Token 不要。<br>&nbsp;&nbsp;— <b>プラン B（直接 API）</b>：REST API 経由。ページ切替なし・即時・ステルス。<br>• Token は Discord 自身のリクエストからバックグラウンドで静かに傍受——<b>ディスク保存なし。</b><br>• ページ更新後：送信オーバーレイを開くとインターセプターが自動再起動。</div></div></div></div>`,
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
      download_cors_fail: "⚠️ CORS制限により直接ダウンロードできません。URLをコピーしてブラウザで開いて保存してください。",
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
      mod_msg_warn_body: "⠿ メッセージユーティリティはこのスクリプトの核心機能です。\\n無効にすると、すべてのメッセージの ⠿ ボタンが消えます。\\n\\n再有効化には：Tampermonkeyアイコンを右クリック → 「⠿ メッセージユーティリティを有効にする」を選択。",
      mod_msg_warn_confirm: "無効にする",
      mod_msg_warn_cancel: "キャンセル",
      mod_msg_enable_menu: "⠿ メッセージユーティリティを有効にする",
      grp_copy: "📝 コピー >",
      grp_convert: "🔄 変換 >",
      grp_download: "⬇️ ダウンロード >",
      grp_system: "⚙️ システム >",
      view_main: "メインメニュー",
      view_symbols: "カスタム文字列",

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

      wm_menu_edit: "✎ 名前を編集",
      wm_menu_del: "🗑️ 閉じる",
      wm_menu_vip_add: "★ VIPに設定 (固定)",
      wm_menu_vip_remove: "☆ VIPを解除",
      wm_menu_move: "📂 グループへ移動",

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
      wm_title: "ワームホール コントロール\n• クリック：新規作成\n• 1秒長押し：設定メニューを開く",
      wm_settings_menu_title: "🌀 ワームホール設定",
      wm_settings_create: "新しいワームホールを作成",
      wm_settings_send_mode: "送信方式・API モード",
      wm_settings_more: "その他の設定（近日公開）",
      wm_settings_position: "表示位置を切り替え",
      wm_settings_position_navbar:    "ナビバー",
      wm_settings_position_titlebar:  "チャンネルタイトルバー",
      wm_settings_position_input:     "チャット入力欄の上",
      wm_settings_position_topleft:   "左上固定",
      wm_focus_on: "フォーカスモードを閉じる",
      wm_focus_off: "フォーカスモードを開く（アイコンのみ表示）",
      wm_focus_size: "アイコンサイズ",
      wm_focus_size_s: "S  · 小",
      wm_focus_size_m: "M  · 中",
      wm_focus_size_l: "L  · 大",

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
      wm_send_mode_api: "⚡ API モード",
      wm_send_mode_nav: "🔀 ページ移動モード",
      wm_send_mode_desc_api: "直接送信、チャンネル切替なし",
      wm_send_mode_desc_nav: "対象チャンネルに移動してから送信",
      wm_send_autoclose: "送信後に自動で閉じる",
      wm_send_show_toast: "送信通知を表示する",
      wm_send_goto_channel: "送信後にチャンネルへ移動",
      wm_send_paste_hint: "📋 Ctrl+V で画像を貼り付け",
      wm_send_token_warn: "⚠️ Token が無効です。もう一度 API パネルを開いて検出してください。今回はプラン A を使用します。",
      wm_send_channel_fail: "❌ チャンネルの読み込みに失敗しました",
      wm_send_editor_missing: "❌ 入力欄が見つかりません",
      wm_send_uploading: "📎 {n} 枚の画像をアップロード中...",

      wm_api_panel_title: "⚗️ ワームホール API モード（上級）",
      wm_api_mode_label_a: "プラン A — ページ移動（デフォルト）",
      wm_api_mode_label_b: "プラン B — 直接 API（ページ切替なし）",
      wm_api_warning_title: "⚠️ リスク告知",
      wm_api_warning_body: "User Token で Discord API を呼び出すことは Discord 利用規約に違反します。アカウントが停止される可能性があります。自己責任でご利用ください。",
      wm_api_token_status_none: "Token：未検出",
      wm_api_token_status_ready: "Token：準備完了（メモリのみ）",
      wm_api_detect_btn: "Token を検出する",
      wm_api_detect_confirm: "【Token 傍受 — 同意確認】\n\n「OK」をクリックすることで、このスクリプトが今回のセッション中にあなたの Discord Token を傍受することに同意したとみなされます。\n\n🔒 安全性の保証：\n• ブラウザのメモリにのみ保存され、ディスクやストレージには一切書き込まれません\n• ページを閉じるか更新すると自動的に消去され、痕跡は残りません\n• いかなる外部サーバーにも送信されません。すべてのリクエストは直接 discord.com に送られます\n• あなたの代わりに POST /channels/{id}/messages を実行する目的にのみ使用されます\n\n⚠️ ユーザー確認事項：\n• この Token にはメッセージ送信の権限が含まれることを理解しています\n• このモードで送信したすべてのメッセージについて、責任は自身が負うものとします\n\nスクリプトを信頼し、上記の内容を理解した上で続行してください。",
      wm_api_detect_waiting: "⬆️ 任意のチャンネルに一度切り替えると Token が取得されます",
      wm_api_enable_btn: "API モードを有効にする",
      wm_api_disable_btn: "API モードを無効にする（プラン A に戻る）",
      wm_api_enabled_toast: "✅ API モードが有効になりました",
      wm_api_disabled_toast: "↩️ ページ移動モードに戻りました",
      wm_api_view_code: "Token インターセプトコードを見る",
      wm_api_clear_token: "🗑 Token を削除",
      wm_api_reset_all: "🗑️ すべてのワームホールデータをリセット",
      wm_api_plan_b_first: "まずプラン B を選択してください",
      wm_api_send_fail: "❌ API 送信失敗 — コンソールを確認してください",

      em_col_title: "マイコレクション",
      em_col_add_success: '「{g}」に保存しました！',
      em_col_tab_new: "新しいタブ",
      em_col_tab_prompt: "新しいタブ名：",
      em_col_empty_tab: "このタブは空です。",
      em_col_del_tab_confirm: 'タブ「{n}」とその全項目を削除しますか？',
      em_modal_choose_tab: "どのコレクションに保存しますか？",
      em_modal_create_new: "+ 新しく作成...",
      em_tip_pick: "カバー画像を設定",
      em_tip_edit: "メモを編集",
      em_tip_delete: "削除",
      em_menu_emoji: "絵文字",
      em_menu_sticker: "スタンプ",
      em_menu_gif: "GIF",

      menu_export: "📤 設定をエクスポート (Backup)",
      menu_import: "⬇️ 設定をインポート (Restore)",
      menu_change_lang: "🌐 言語を変更 (Language)",
      custom_lang_desc: "「📤 テキストをエクスポート」で英語の原文 JSON を取得し、翻訳後に「📥 テキストをインポート」で適用してください。",
      custom_lang_export: "📤 テキストをエクスポート",
      custom_lang_import: "📥 テキストをインポート",
      custom_lang_apply: "✅ 適用してリロード",
      custom_lang_loaded: "✅ 読み込み済み：{name}",
      custom_lang_activate: "🌐「{name}」を適用",
      custom_lang_json_error: "⚠️ JSON エラー：{msg}",
      custom_lang_paste_hint: "翻訳済み JSON をここに貼り付け …",
    },

    ko: {
      name: "한국어",
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

      fm_sec_wormhole: "🌀 웜홀 — 기본 조작",
      fm_sec_wormhole_content:
        "• <span class='help-key'>＋</span> 생성 버튼을 클릭하고 Discord 채널 URL을 붙여넣으면 웜홀이 생성됩니다.<br>"
        + "• <b>클릭</b>하면 해당 채널로 즉시 이동합니다.<br>"
        + "• <b>우클릭</b> → 메뉴: 이름 변경, 삭제, 아이콘 설정, 그룹 이동, VIP 전환.<br>"
        + "• <b>VIP（★）</b>：VIP로 설정한 웜홀은 자동으로 맨 위에 고정됩니다.<br>"
        + "• <b>그룹</b>：우클릭 → 그룹으로 이동 으로 웜홀을 폴더에 정리할 수 있습니다.<br>"
        + "• <b>포커스 모드</b>：아이콘만 표시하는 간결한 뷰. 패널 우측 상단 버튼으로 전환.",

      fm_sec_wm_send: "✉️ 웜홀 — 메시지 전송",
      fm_sec_wm_send_content:
        "• <b>우클릭</b> → <b>이 채널에 메시지 보내기</b>로 메시지 입력창을 엽니다.<br>"
        + "• <b>플랜 A（페이지 이동）</b>：대상 채널로 자동 이동 후 Discord 에디터에 텍스트를 주입하고 돌아옵니다. API 불필요.<br>"
        + "• <b>Shift + 클릭</b>：현재 채널에서 입력창을 엽니다（이동 없음）.<br>"
        + "• <b>Ctrl+V 이미지 붙여넣기</b> 지원. 이미지와 텍스트를 하나의 메시지로 함께 전송합니다.<br>"
        + "• 하단 옵션：<b>전송 후 자동 닫기</b> / <b>전송 후 채널로 이동</b>（상호 배타）/ <b>전송 알림 표시</b>。<br>"
        + "• 전송 후 클릭 가능한 알림이 나타나며, 클릭하면 대상 채널로 즉시 이동합니다.",

      fm_sec_wm_api: "⚡ 웜홀 — API 모드（숨겨진 기능）",
      fm_sec_wm_api_content:
        "• <b>웜홀 생성 버튼（＋）을 3초 길게 누르면</b> API 모드 설정 패널이 잠금 해제됩니다.<br>"
        + "• <b>플랜 B（직접 API）</b>：Discord REST API를 통해 메시지를 전송. 페이지 전환 없이 빠르고 스텔스하게 동작.<br>"
        + "• Token은 스크립트가 백그라운드에서 조용히 가로챕니다（Discord 자체 요청에서）. <b>저장·외부 전송 없음</b>，메모리에만 유지，페이지 닫으면 소거.<br>"
        + "• 플랜 B 활성화 시 Token 감지가 자동으로 백그라운드에서 실행됩니다. Discord를 평소처럼 사용하면 자동으로 캡처됩니다.<br>"
        + "• API 모드는 이미지 업로드（multipart/form-data）지원. 텍스트와 이미지를 한 번에 전송.<br>"
        + "• 페이지 새로고침 후 Token이 사라진 경우, 전송 창을 열면 인터셉터가 자동으로 재시작됩니다.",

      welcome_title: "{script}에 오신 것을 환영합니다",
      select_lang_subtitle: "인터페이스 언어를 선택하십시오",
      help_btn: "📖 사용 설명서",
      cancel_btn: "✕ 닫기",
      security_notice_title: "⚠️ 보안 면책 조항",
      security_notice_content:
        "URL 변환 기능(vxtwitter, kkinstagram 등)은 타사 서비스에 의존합니다.\n신뢰할 수 없는 경우 사용하지 마십시오.\n사용자는 URL 안전성을 식별할 능력이 있어야 합니다.",
      manual_content:
        "【아이콘 설명】\n• ◫/≡ : 메뉴 스타일 (평면 / 그룹)\n• ⇄ : 클릭 로직 전환 (복사 / 삽입)\n• ␣ : 끝에 공백 추가\n• ↵ : 끝에 줄바꿈 추가\n• ☆ : 사용자 정의 문자열 패널\n• 🖱️ : 트리거 모드 (호버 / 클릭)\n• 🌐 : 언어 변경\n\n【조작 방법】\n• **클릭**: 복사 (기본)\n• **길게 누르기 (0.5초)**: 입력창에 삽입\n• **Shift+클릭**: 복사 및 삽입 (메뉴 유지)",
      manual_content_sections: `<div class='mm-section'><div class='mm-sec-title c-default'>⚡ 빠른 시작</div><div class='mm-content'>Discord 메시지에 마우스를 올리면 → 우측 상단에 복사 버튼이 나타납니다.<br><b>클릭</b>으로 텍스트 복사 · <b>길게 누르기 0.5초</b>로 입력창에 삽입 · <b>Shift+클릭</b>으로 복사와 삽입 동시 실행（메뉴 유지）。<br>툴바의 <span class='mm-key'>🖱️</span> 으로 <span class='mm-key'>클릭 모드</span>로 전환 가능（수동 트리거）。</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 복사 메뉴 — 텍스트 & 링크</div><div class='mm-content'>• <b>텍스트 복사</b>：메시지의 전체 텍스트를 복사합니다.<br>• <b>미디어 URL 복사</b>：메시지 내 이미지/동영상의 직접 링크를 복사합니다.<br>• <b>첫 번째 링크 복사（정제됨）</b>：추적 파라미터를 제거한 첫 번째 URL을 복사.<br>• <b>모든 링크 복사</b>：메시지 내 모든 URL을 한 줄씩 복사합니다.<br>• <b>Markdown으로 복사</b>：<span class='mm-key'>[텍스트](URL)</span> 형식으로 변환합니다.<br>• <b>Markdown 링크 삽입</b>：Discord 입력창에 Markdown 형식으로 직접 삽입.<br>• <b>숨김 형식</b>：<span class='mm-key'>|| 스포일러 내용 ||</span> 형식으로 감쌉니다.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ 다운로드</div><div class='mm-content'>• <b>이미지/미디어 다운로드</b>：메시지의 모든 이미지·동영상을 한 번에 다운로드.<br>• <b>ZIP으로 다운로드</b>：여러 파일을 하나의 ZIP 아카이브로 묶어 저장.<br>• 실패 시 자동 재시도하며, 대체 URL로 폴백합니다.</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 URL 변환</div><div class='mm-content'><b>Twitter / X</b>：twitter.com, x.com, vxtwitter, fixupx, fxtwitter, cunnyx 간 상호 변환으로 Discord 프리뷰 수정.<br><b>Instagram</b>：instagram.com ↔ kkinstagram.com 변환으로 임베드 프리뷰 활성화.<br><b>Bilibili</b>：FX Bilibili 또는 VX Bilibili로 변환하여 더 나은 임베드 구현.<br><b>Pixiv</b>：pixiv.net ↔ phixiv.net 상호 변환으로 Discord에서 일러스트 프리뷰.<br><b>일괄 변환</b>：<span class='mm-key'>⚡ 전체 변환 (N)</span> 으로 같은 종류의 링크를 한 번에 모두 변환.</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>🎛️ 툴바 아이콘 설명</div><div class='mm-content'><div class='mm-grid'><div><span class='mm-key'>◫/≡</span> 메뉴 스타일：평면 / 그룹</div><div><span class='mm-key'>⇄</span> 클릭 동작 전환：복사 ↔ 삽입</div><div><span class='mm-key'>␣</span> 삽입 시 끝에 공백 추가</div><div><span class='mm-key'>↵</span> 삽입 시 끝에 줄바꿈 추가</div><div><span class='mm-key'>☆</span> 사용자 정의 문자열 패널</div><div><span class='mm-key'>🖱️</span> 트리거 전환：호버 / 클릭</div><div><span class='mm-key'>🌐</span> 언어 변경</div></div></div></div><div class='mm-section'><div class='mm-sec-title c-default'>☆ 사용자 정의 문자열 패널</div><div class='mm-content'>• 자주 쓰는 텍스트（인사말·템플릿·코드 블록）를 저장할 수 있습니다.<br>• 클릭으로 복사 · 길게 눌러 입력창에 삽입.<br>• <span class='mm-key'>Shift+클릭</span>으로 확인 없이 연속 삭제 가능.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 웜홀 — 개요</div><div class='mm-content'>웜홀은 Discord 사이드바의 <b>원클릭 채널 단축키</b>입니다. <span class='mm-key'>＋</span> 를 클릭하고 Discord 채널 URL을 붙여넣으면 생성됩니다.<br><b>클릭</b> <span class='mm-key'>＋</span> → 새 웜홀 생성 · <b>1초 길게 누르기</b> → 설정 메뉴 열기.</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>🖱️ 탐색 및 관리</div><div class='mm-content'>• <b>클릭</b>하면 해당 채널로 즉시 이동합니다.<br>• <b>우클릭</b> → 메뉴: 이름 변경 · 삭제 · 아이콘 설정 · 그룹 이동 · VIP 전환.<br>• <b>VIP <span class='mm-key'>★</span></b>：설정한 웜홀은 자동으로 맨 위에 고정됩니다.<br>• <b>그룹</b>：우클릭 → 그룹으로 이동 으로 폴더에 정리.<br>• <b>포커스 모드</b>：아이콘만 표시. 패널 우측 상단 버튼으로 전환.<br>• <b>기록</b>（보라색 배지）：최근 방문 채널 자동 저장, 클릭으로 즉시 복귀.</div></div><div class='mm-section accent-wormhole'><div class='mm-sec-title c-worm'>✉️ 메시지 전송</div><div class='mm-content'>• <b>우클릭</b> → <b>이 채널에 메시지 보내기</b> 로 오버레이 열기.<br>• <span class='mm-key'>Ctrl+V</span> 로 이미지 직접 붙여넣기 — 텍스트와 함께 하나의 메시지로 전송.<br>• 하단 옵션（세션 간 유지）：자동 닫기 · 채널로 이동 · 알림 표시.<br>• 전송 후 3초간 토스트 표시, 클릭하면 즉시 해당 채널로 이동합니다.</div></div><div class='mm-section accent-green'><div class='mm-sec-title c-green'>⚙️ 설정 메뉴 및 API 모드</div><div class='mm-content'>• <b><span class='mm-key'>＋</span> 를 1초 길게 누르면</b> 웜홀 설정 메뉴가 열립니다.<br>• 메뉴 항목：<span class='mm-key'>➕ 새 웜홀 생성</span> · <span class='mm-key'>✉️ 전송 방식 및 API 모드</span> · <span class='mm-key'>⚙️ 추가 설정</span>（확장 예정）。<br>• 「<b>전송 방식 및 API 모드</b>」→ API 설정 패널 열기：<br>&nbsp;&nbsp;— <b>플랜 A（페이지 이동）</b>：자동 이동→텍스트 주입→복귀. Token 불필요.<br>&nbsp;&nbsp;— <b>플랜 B（직접 API）</b>：REST API 전송. 페이지 전환 없이 즉시·스텔스.<br>• Token은 Discord 자체 요청에서 백그라운드로 조용히 가로챕니다——<b>디스크 저장 없음.</b><br>• 페이지 새로고침 후：전송 오버레이를 열면 인터셉터가 자동 재시작.</div></div></div></div>`,
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
      download_cors_fail: "⚠️ CORS 제한으로 직접 다운로드할 수 없습니다. URL을 복사하여 브라우저에서 열어 저장해주세요.",
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
      mod_msg_warn_body: "⠿ 메시지 유틸리티는 이 스크립트의 핵심 기능입니다.\\n비활성화하면 모든 메시지의 ⠿ 버튼이 사라집니다.\\n\\n다시 활성화하려면: Tampermonkey 아이콘 우클릭 → '⠿ 메시지 유틸리티 활성화' 선택.",
      mod_msg_warn_confirm: "비활성화",
      mod_msg_warn_cancel: "취소",
      mod_msg_enable_menu: "⠿ 메시지 유틸리티 활성화",
      grp_copy: "📝 복사 >",
      grp_convert: "🔄 변환 >",
      grp_download: "⬇️ 다운로드 >",
      grp_system: "⚙️ 시스템 >",
      view_main: "메인",
      view_symbols: "기호",

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

      wm_menu_edit: "✎ 이름 편집",
      wm_menu_del: "🗑️ 웜홀 닫기",
      wm_menu_vip_add: "★ VIP 설정 (고정)",
      wm_menu_vip_remove: "☆ VIP 해제",
      wm_menu_move: "📂 그룹으로 이동",

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
      wm_title: "웜홀 컨트롤\n• 클릭: 새 웜홀 생성\n• 1초 길게 누르기: 설정 메뉴 열기",
      wm_settings_menu_title: "🌀 웜홀 설정",
      wm_settings_create: "새 웜홀 생성",
      wm_settings_send_mode: "전송 방식 및 API 모드",
      wm_settings_more: "추가 설정 (출시 예정)",
      wm_settings_position: "웜홀 위치 전환",
      wm_settings_position_navbar:    "내비게이션 바",
      wm_settings_position_titlebar:  "채널 타이틀바",
      wm_settings_position_input:     "채팅 입력창 위",
      wm_settings_position_topleft:   "왼쪽 상단 고정",
      wm_focus_on: "포커스 모드 끄기",
      wm_focus_off: "포커스 모드 켜기 (아이콘만 표시)",
      wm_focus_size: "아이콘 크기",
      wm_focus_size_s: "S  · 작게",
      wm_focus_size_m: "M  · 보통",
      wm_focus_size_l: "L  · 크게",

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
      wm_send_mode_api: "⚡ API 모드",
      wm_send_mode_nav: "🔀 페이지 이동 모드",
      wm_send_mode_desc_api: "직접 전송, 채널 전환 없음",
      wm_send_mode_desc_nav: "대상 채널로 이동 후 전송",
      wm_send_autoclose: "전송 후 자동 닫기",
      wm_send_show_toast: "전송 알림 표시",
      wm_send_goto_channel: "전송 후 해당 채널로 이동",
      wm_send_paste_hint: "📋 Ctrl+V 로 이미지 붙여넣기",
      wm_send_token_warn: "⚠️ Token이 만료되었습니다. API 패널을 다시 열어 감지해 주세요. 이번에는 플랜 A를 사용합니다.",
      wm_send_channel_fail: "❌ 채널 로드 실패",
      wm_send_editor_missing: "❌ 입력창을 찾을 수 없습니다",
      wm_send_uploading: "📎 {n}개의 이미지 업로드 중...",

      wm_api_panel_title: "⚗️ 웜홀 API 모드 (고급)",
      wm_api_mode_label_a: "플랜 A — 페이지 이동 (기본)",
      wm_api_mode_label_b: "플랜 B — 직접 API (페이지 전환 없음)",
      wm_api_warning_title: "⚠️ 위험 고지",
      wm_api_warning_body: "User Token으로 Discord API를 호출하는 것은 Discord 서비스 약관을 위반합니다. 계정이 정지될 수 있으며, 사용 시 모든 책임은 본인에게 있습니다.",
      wm_api_token_status_none: "Token：미감지",
      wm_api_token_status_ready: "Token：준비됨 (메모리 전용)",
      wm_api_detect_btn: "내 Token 감지하기",
      wm_api_detect_confirm: "【Token 인터셉트 — 동의 확인】\n\n「확인」을 클릭하면 이 스크립트가 현재 세션 중 귀하의 Discord Token을 가로채는 것에 동의하는 것으로 간주됩니다.\n\n🔒 보안 보장：\n• 브라우저 메모리에만 저장되며, 디스크나 스토리지에는 절대 기록되지 않습니다\n• 페이지를 닫거나 새로고침하면 자동으로 삭제되어 흔적이 남지 않습니다\n• 어떤 외부 서버에도 전송되지 않으며, 모든 요청은 discord.com 으로 직접 전송됩니다\n• 귀하를 대신하여 POST /channels/{id}/messages 를 실행하는 용도로만 사용됩니다\n\n⚠️ 사용자 확인 사항：\n• 이 Token에 메시지 전송 권한이 포함되어 있음을 이해합니다\n• 이 모드를 통해 전송된 모든 메시지에 대한 책임은 본인이 집니다\n\n스크립트를 신뢰하고 위 내용을 이해한 후 계속하십시오。",
      wm_api_detect_waiting: "⬆️ 아무 채널로 한 번 전환하면 Token이 자동으로 감지됩니다",
      wm_api_enable_btn: "API 모드 활성화",
      wm_api_disable_btn: "API 모드 비활성화 (플랜 A로 돌아가기)",
      wm_api_enabled_toast: "✅ API 모드가 활성화되었습니다",
      wm_api_disabled_toast: "↩️ 페이지 이동 모드로 돌아왔습니다",
      wm_api_view_code: "Token 인터셍트 코드 보기",
      wm_api_clear_token: "🗑 Token 삭제",
      wm_api_reset_all: "🗑️ 모든 웹홀 데이터 초기화",
      wm_api_plan_b_first: "먼저 플랜 B를 선택해 주세요",
      wm_api_send_fail: "❌ API 전송 실패 — 콘솔을 확인해 주세요",

      em_col_title: "내 컬렉션",
      em_col_add_success: '"{g}"에 저장되었습니다！',
      em_col_tab_new: "새 탭",
      em_col_tab_prompt: "새 탭 이름:",
      em_col_empty_tab: "이 탭은 비어 있습니다.",
      em_col_del_tab_confirm: '탭 "{n}"과 모든 항목을 삭제하시겠습니까?',
      em_modal_choose_tab: "어느 컬렉션에 저장하시겠습니까?",
      em_modal_create_new: "+ 새로 만들기...",
      em_tip_pick: "커버 이미지 설정",
      em_tip_edit: "메모 편집",
      em_tip_delete: "삭제",
      em_menu_emoji: "이모지",
      em_menu_sticker: "스티커",
      em_menu_gif: "GIF",

      menu_export: "📤 설정 내보내기 (Backup)",
      menu_import: "⬇️ 설정 가져오기 (Restore)",
      menu_change_lang: "🌐 언어 변경 (Language)",
      custom_lang_desc: "「📤 텍스트 내보내기」로 영어 원문 JSON을 받고, 번역 후 「📥 텍스트 가져오기」로 적용하세요.",
      custom_lang_export: "📤 텍스트 내보내기",
      custom_lang_import: "📥 텍스트 가져오기",
      custom_lang_apply: "✅ 적용 및 새로고침",
      custom_lang_loaded: "✅ 불러옴：{name}",
      custom_lang_activate: "🌐 \"{name}\" 적용",
      custom_lang_json_error: "⚠️ JSON 오류：{msg}",
      custom_lang_paste_hint: "번역된 JSON을 여기에 붙여넣기 …",
    },
    "es": {
      name: "Español",
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

      fm_sec_wormhole: "🌀 Agujero de gusano — Básico",
      fm_sec_wormhole_content:
        "• Haz clic en <span class='help-key'>＋</span> y pega una URL de canal de Discord para crear un acceso directo.<br>"
        + "• <b>Clic</b> en un agujero de gusano → salta instantáneamente a ese canal.<br>"
        + "• <b>Clic derecho</b> → menú: renombrar, eliminar, icono, mover a grupo o alternar VIP.<br>"
        + "• <b>VIP (★)</b>: los agujeros fijados flotan arriba automáticamente.<br>"
        + "• <b>Grupos</b>: organiza agujeros en carpetas con nombre.<br>"
        + "• <b>Modo enfoque</b>: vista compacta solo con iconos.",
      fm_sec_wm_send: "✉️ Agujero de gusano — Enviar mensaje",
      fm_sec_wm_send_content:
        "• <b>Clic derecho</b> → <b>Enviar mensaje aquí</b> para abrir el panel.<br>"
        + "• <b>Modo A (Navegar)</b>: cambia al canal destino, inyecta texto y regresa.<br>"
        + "• <b>Shift+Clic</b> → abre el panel en el canal actual.<br>"
        + "• Admite <b>pegar imágenes con Ctrl+V</b>.<br>"
        + "• Opciones inferiores: <b>Cierre automático</b> / <b>Ir al canal</b> / <b>Mostrar notificación</b>.",
      fm_sec_wm_api: "⚡ Agujero de gusano — Modo API (secreto)",
      fm_sec_wm_api_content:
        "• <b>Mantén presionado el botón ＋ 3 segundos</b> para desbloquear el Modo API.<br>"
        + "• <b>Modo B (API directa)</b>: envía mensajes vía Discord REST API sin cambiar de página.<br>"
        + "• El token se intercepta silenciosamente en memoria — <b>nunca se almacena ni transmite</b>.<br>"
        + "• Se borra al cerrar la página.",
      welcome_title: "Bienvenido a {script}",
      select_lang_subtitle: "Por favor, selecciona el idioma de la interfaz",
      help_btn: "📖 Manual",
      cancel_btn: "✕ Cerrar",
      security_notice_title: "⚠️ Aviso de seguridad",
      security_notice_content:
        "Las funciones de conversión de URL (como vxtwitter, kkinstagram) dependen de servicios de terceros.\nNo las uses si no confías en dichos servicios.\nLos usuarios deben ser capaces de identificar la seguridad de las URL.",
      manual_content:
        "【Guía de iconos】\n• ◫/≡ : Cambiar estilo de menú (Plano / Grupo)\n• ⇄ : Intercambiar lógica de clic (Copiar / Insertar)\n• ␣ : Añadir espacio al final\n• ↵ : Añadir nueva línea al final\n• ☆ : Panel de cadenas personalizadas\n• 🖱️ : Modo de activación (Hover / Clic)\n• 🌐 : Cambiar idioma\n\n【Acciones】\n• **Clic**: Copiar (predeterminado)\n• **Pulsación larga (0,5s)**: Insertar en el cuadro de texto\n• **Shift+Clic**: Copiar e insertar (mantiene el menú abierto)",
      manual_content_sections: "<div class='mm-section'><div class='mm-sec-title c-default'>⚡ Inicio rápido</div><div class='mm-content'>Pasa el cursor sobre cualquier mensaje de Discord → aparece un botón de copiar en la esquina superior derecha.<br><b>Clic</b> para copiar texto · <b>Pulsación larga 0,5s</b> para insertar · <b>Shift+Clic</b> para copiar e insertar.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 Menú de copia</div><div class='mm-content'>• Copiar texto, URL de medios, primer enlace limpio, todos los enlaces, Markdown, texto oculto.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ Descargar</div><div class='mm-content'>• Descargar imágenes/medios individualmente o como ZIP.</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 Conversión de URL</div><div class='mm-content'>Twitter/X, Instagram, Bilibili, Pixiv — conversión mutua para previsualizaciones en Discord.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 Agujero de gusano</div><div class='mm-content'>Accesos directos de canal con un clic en la barra lateral de Discord.</div></div>",
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
      download_cors_fail: "⚠️ CORS impide la descarga directa. Copia la URL y ábrela en el navegador.",
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
      export_success: "✅ ¡Configuración exportada!\n\nCopiada al portapapeles.",
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
      mod_msg_warn_body: "⠿ La Utilidad de Mensajes es la función principal.\\nSi la deshabilitas, desaparecerá el botón ⠿ en todos los mensajes.",
      mod_msg_warn_confirm: "Deshabilitar",
      mod_msg_warn_cancel: "Cancelar",
      mod_msg_enable_menu: "Habilitar ⠿ Utilidad de Mensajes",
      grp_copy: "📝 Copiar >",
      grp_convert: "🔄 Convertir >",
      grp_download: "⬇️ Descargar >",
      grp_system: "⚙️ Sistema y símbolos >",
      view_main: "Menú principal",
      view_symbols: "Cadenas personalizadas",

      em_title: "😊 Gestión integrada de expresiones/GIF",
      em_content:
        "• <b>Barra</b>: [📁] Colección | [🎯] Modo mira | [★] Palabras clave.<br>• <b>Modo mira</b>: selecciona directamente GIFs o emojis de la pantalla.<br>• <b>Shift+Clic</b>: enviar consecutivamente sin cerrar el panel.",
      em_picker_tip: "🔍 Haz clic en el GIF/emoji (clic en el fondo para cancelar)",
      em_err_no_list: "No se encontró el contenedor de lista. ¡Abre primero la ventana de emoji o GIF!",
      em_btn_add_title: "Guardar palabra clave de búsqueda",
      em_btn_active_title: "Clic: rellenar palabra clave (alternar)",
      em_btn_target_title: "Modo mira: clic en GIF/emoji para guardar",
      em_btn_save_this: "Añadir este elemento a la colección",
      em_no_favs: "Sin favoritos aún",
      em_del_confirm: "¿Eliminar «{k}»?",
      em_keyword_prompt: "Introduce una palabra clave:",
      em_keyword_exists: "«{k}» ya existe",

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
      wm_group_del_confirm: "¿Disolver el grupo «{n}»? (los agujeros se conservarán)",
      wm_group_select_prompt: "Introduce un número para seleccionar grupo:\n\n0. [Raíz/Sin categoría]\n{list}\n\nDeja vacío para crear «Nuevo grupo»:",
      wm_group_invalid: "¡Selección de grupo inválida!",
      wm_move_prompt: "¿A qué grupo mover? (introduce número)\n\n{list}",
      wm_icon_picker_title: "Seleccionar icono para {name}",
      wm_icon_set_success: "✅ Icono de {name} establecido",
      wm_icon_empty: "Primero añade un Emoji en el módulo de colección",
      wm_title: "Control de agujero de gusano\n• Clic: crear nuevo\n• Pulsación larga 1s: menú de ajustes",
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
      wm_send_token_warn: "⚠️ Token expirado. Vuelve a abrir el panel API para detectarlo. Usando Modo A esta vez.",
      wm_send_channel_fail: "❌ Error al cargar el canal",
      wm_send_editor_missing: "❌ Editor no encontrado",
      wm_send_uploading: "📎 Subiendo {n} imagen(es)...",

      wm_api_panel_title: "⚗️ Modo API del agujero de gusano (avanzado)",
      wm_api_mode_label_a: "Modo A — Navegar (predeterminado)",
      wm_api_mode_label_b: "Modo B — API directa (sin cambio de página)",
      wm_api_warning_title: "⚠️ Aviso de riesgo",
      wm_api_warning_body: "Usar un Token de usuario para llamar a la API de Discord viola los Términos de Servicio. Tu cuenta podría ser suspendida. Úsalo bajo tu propia responsabilidad.",
      wm_api_token_status_none: "Token: No detectado",
      wm_api_token_status_ready: "Token: Listo (solo en memoria)",
      wm_api_detect_btn: "Detectar mi Token",
      wm_api_detect_confirm: "【Consentimiento de interceptación de Token】\n\nAl hacer clic en Aceptar, autorizas que este script intercepte tu Token de Discord para esta sesión.\n\n🔒 Garantías de seguridad:\n• Solo en memoria — nunca escrito en disco\n• Se borra al cerrar o recargar la página\n• Nunca transmitido a ningún servidor externo\n• Usado exclusivamente para enviar mensajes en tu nombre\n\n⚠️ Reconocimiento:\n• Entiendes que este token otorga acceso para enviar mensajes\n• Aceptas plena responsabilidad de todos los mensajes enviados\n\nProcede solo si confías en este script.",
      wm_api_detect_waiting: "⬆️ Cambia a cualquier canal una vez para capturar el Token",
      wm_api_enable_btn: "Activar Modo API",
      wm_api_disable_btn: "Desactivar Modo API (volver al Modo A)",
      wm_api_enabled_toast: "✅ Modo API activado",
      wm_api_disabled_toast: "↩️ Vuelto al Modo Navegación",
      wm_api_view_code: "Ver código del interceptor de Token",
      wm_api_clear_token: "🗑 Borrar Token",
      wm_api_reset_all: "🗑️ Restablecer todos los datos del agujero",
      wm_api_plan_b_first: "Por favor selecciona primero el Plan B",
      wm_api_send_fail: "❌ Error de API — revisa la consola",

      em_col_title: "Mis colecciones",
      em_col_add_success: '¡Guardado en "{g}"!',
      em_col_tab_new: "Nueva pestaña",
      em_col_tab_prompt: "Nombre de la nueva pestaña:",
      em_col_empty_tab: "Esta pestaña está vacía.",
      em_col_del_tab_confirm: '¿Eliminar la pestaña "{n}" y todos sus elementos?',
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
      custom_lang_desc: "Haz clic en「📤 Exportar texto」para obtener el JSON en inglés. Tradúcelo y usa「📥 Importar texto」para aplicarlo.",
      custom_lang_export: "📤 Exportar texto",
      custom_lang_import: "📥 Importar texto",
      custom_lang_apply: "✅ Aplicar y recargar",
      custom_lang_loaded: "✅ Cargado: {name}",
      custom_lang_activate: "🌐 Aplicar \"{name}\"",
      custom_lang_json_error: "⚠️ Error JSON: {msg}",
      custom_lang_paste_hint: "Pega el JSON traducido aquí …",
    },

    "pt-BR": {
      name: "Português (Brasil)",
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
        "• Clique em <span class='help-key'>＋</span> e cole uma URL de canal do Discord para criar um atalho.<br>"
        + "• <b>Clique</b> em um buraco → pula instantaneamente para esse canal.<br>"
        + "• <b>Botão direito</b> → menu: renomear, excluir, ícone, mover para grupo ou alternar VIP.<br>"
        + "• <b>VIP (★)</b>: buracos fixados flutuam automaticamente para o topo.<br>"
        + "• <b>Grupos</b>: organize buracos em pastas.<br>"
        + "• <b>Modo foco</b>: visão compacta somente com ícones.",
      fm_sec_wm_send: "✉️ Buraco de minhoca — Enviar mensagem",
      fm_sec_wm_send_content:
        "• <b>Botão direito</b> → <b>Enviar mensagem aqui</b> para abrir o painel.<br>"
        + "• <b>Modo A (Navegar)</b>: muda para o canal destino, injeta texto e retorna.<br>"
        + "• <b>Shift+Clique</b> → abre o painel no canal atual.<br>"
        + "• Suporta <b>colar imagens com Ctrl+V</b>.<br>"
        + "• Opções inferiores: <b>Fechar automaticamente</b> / <b>Ir ao canal</b> / <b>Mostrar notificação</b>.",
      fm_sec_wm_api: "⚡ Buraco de minhoca — Modo API (secreto)",
      fm_sec_wm_api_content:
        "• <b>Mantenha pressionado o botão ＋ por 3 segundos</b> para desbloquear o Modo API.<br>"
        + "• <b>Modo B (API direta)</b>: envia mensagens via Discord REST API sem trocar de página.<br>"
        + "• O token é interceptado silenciosamente na memória — <b>nunca armazenado ou transmitido</b>.<br>"
        + "• Apagado ao fechar a página.",
      welcome_title: "Bem-vindo ao {script}",
      select_lang_subtitle: "Por favor, selecione o idioma da interface",
      help_btn: "📖 Manual",
      cancel_btn: "✕ Fechar",
      security_notice_title: "⚠️ Aviso de segurança",
      security_notice_content:
        "Os recursos de conversão de URL (como vxtwitter, kkinstagram) dependem de serviços de terceiros.\nNão os use se não confiar nesses serviços.\nOs usuários devem ser capazes de identificar a segurança das URL.",
      manual_content:
        "【Guia de ícones】\n• ◫/≡ : Alternar estilo de menu (Plano / Grupo)\n• ⇄ : Trocar lógica de clique (Copiar / Inserir)\n• ␣ : Adicionar espaço ao final\n• ↵ : Adicionar nova linha ao final\n• ☆ : Painel de strings personalizadas\n• 🖱️ : Modo de ativação (Hover / Clique)\n• 🌐 : Alterar idioma\n\n【Ações】\n• **Clique**: Copiar (padrão)\n• **Pressão longa (0,5s)**: Inserir na caixa de texto\n• **Shift+Clique**: Copiar e inserir (mantém o menu aberto)",
      manual_content_sections: "<div class='mm-section'><div class='mm-sec-title c-default'>⚡ Início rápido</div><div class='mm-content'>Passe o cursor sobre qualquer mensagem do Discord → aparece um botão de copiar no canto superior direito.<br><b>Clique</b> para copiar · <b>Pressão longa 0,5s</b> para inserir · <b>Shift+Clique</b> para copiar e inserir.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 Menu de cópia</div><div class='mm-content'>• Copiar texto, URL de mídia, primeiro link limpo, todos os links, Markdown, texto oculto.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ Download</div><div class='mm-content'>• Baixar imagens/mídias individualmente ou como ZIP.</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 Conversão de URL</div><div class='mm-content'>Twitter/X, Instagram, Bilibili, Pixiv — conversão mútua para prévias no Discord.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 Buraco de minhoca</div><div class='mm-content'>Atalhos de canal com um clique na barra lateral do Discord.</div></div>",
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
      download_cors_fail: "⚠️ CORS impede o download direto. Copie a URL e abra no navegador.",
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
      export_success: "✅ Configurações exportadas!\n\nCopiadas para a área de transferência.",
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
      mod_msg_warn_body: "⠿ O Utilitário de Mensagens é a função principal.\\nSe desativado, o botão ⠿ desaparecerá de todas as mensagens.",
      mod_msg_warn_confirm: "Desativar",
      mod_msg_warn_cancel: "Cancelar",
      mod_msg_enable_menu: "Ativar ⠿ Utilitário de Mensagens",
      grp_copy: "📝 Copiar >",
      grp_convert: "🔄 Converter >",
      grp_download: "⬇️ Baixar >",
      grp_system: "⚙️ Sistema e símbolos >",
      view_main: "Menu principal",
      view_symbols: "Strings personalizadas",

      em_title: "😊 Gerenciamento integrado de expressões/GIF",
      em_content:
        "• <b>Barra</b>: [📁] Coleção | [🎯] Modo mira | [★] Palavras-chave.<br>• <b>Modo mira</b>: selecione GIFs ou emojis diretamente da tela.<br>• <b>Shift+Clique</b>: enviar consecutivamente sem fechar o painel.",
      em_picker_tip: "🔍 Clique no GIF/emoji (clique no fundo para cancelar)",
      em_err_no_list: "Contêiner de lista não encontrado. Abra primeiro a janela de emoji ou GIF!",
      em_btn_add_title: "Salvar palavra-chave de pesquisa",
      em_btn_active_title: "Clique: preencher palavra-chave (alternar)",
      em_btn_target_title: "Modo mira: clique no GIF/emoji para salvar",
      em_btn_save_this: "Adicionar este item à coleção",
      em_no_favs: "Sem favoritos ainda",
      em_del_confirm: "Excluir «{k}»?",
      em_keyword_prompt: "Digite uma palavra-chave:",
      em_keyword_exists: "«{k}» já existe",

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
      wm_group_del_confirm: "Dissolver o grupo «{n}»? (os buracos serão mantidos)",
      wm_group_select_prompt: "Digite um número para selecionar o grupo:\n\n0. [Raiz/Sem categoria]\n{list}\n\nDeixe vazio para criar «Novo grupo»:",
      wm_group_invalid: "Seleção de grupo inválida!",
      wm_move_prompt: "Para qual grupo mover? (digite número)\n\n{list}",
      wm_icon_picker_title: "Selecionar ícone para {name}",
      wm_icon_set_success: "✅ Ícone de {name} definido",
      wm_icon_empty: "Primeiro adicione um Emoji no módulo de coleção",
      wm_title: "Controle do buraco de minhoca\n• Clique: criar novo\n• Pressão longa 1s: menu de configurações",
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
      wm_send_token_warn: "⚠️ Token expirado. Reabra o painel API para detectar novamente. Usando Modo A desta vez.",
      wm_send_channel_fail: "❌ Falha ao carregar o canal",
      wm_send_editor_missing: "❌ Editor não encontrado",
      wm_send_uploading: "📎 Enviando {n} imagem(ns)...",

      wm_api_panel_title: "⚗️ Modo API do buraco de minhoca (avançado)",
      wm_api_mode_label_a: "Modo A — Navegar (padrão)",
      wm_api_mode_label_b: "Modo B — API direta (sem troca de página)",
      wm_api_warning_title: "⚠️ Aviso de risco",
      wm_api_warning_body: "Usar um Token de usuário para chamar a API do Discord viola os Termos de Serviço. Sua conta pode ser banida. Use por sua conta e risco.",
      wm_api_token_status_none: "Token: Não detectado",
      wm_api_token_status_ready: "Token: Pronto (somente na memória)",
      wm_api_detect_btn: "Detectar meu Token",
      wm_api_detect_confirm: "【Consentimento de interceptação de Token】\n\nAo clicar em OK, você autoriza que este script intercepte seu Token do Discord para esta sessão.\n\n🔒 Garantias de segurança:\n• Somente na memória — nunca gravado em disco\n• Apagado ao fechar ou recarregar a página\n• Nunca transmitido para qualquer servidor externo\n• Usado exclusivamente para enviar mensagens em seu nome\n\n⚠️ Reconhecimento:\n• Você entende que este token concede acesso para enviar mensagens\n• Você aceita total responsabilidade por todas as mensagens enviadas\n\nProssiga somente se confiar neste script.",
      wm_api_detect_waiting: "⬆️ Mude para qualquer canal uma vez para capturar o Token",
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
      custom_lang_desc: "Clique em「📤 Exportar texto」para obter o JSON em inglês. Após traduzir, use「📥 Importar texto」para aplicar.",
      custom_lang_export: "📤 Exportar texto",
      custom_lang_import: "📥 Importar texto",
      custom_lang_apply: "✅ Aplicar e recarregar",
      custom_lang_loaded: "✅ Carregado: {name}",
      custom_lang_activate: "🌐 Aplicar \"{name}\"",
      custom_lang_json_error: "⚠️ Erro JSON: {msg}",
      custom_lang_paste_hint: "Cole o JSON traduzido aqui …",
    },

    "fr": {
      name: "Français",
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
        "• Cliquez sur <span class='help-key'>＋</span> et collez une URL de salon Discord pour créer un raccourci.<br>"
        + "• <b>Clic</b> sur un trou de ver → saut instantané vers ce salon.<br>"
        + "• <b>Clic droit</b> → menu : renommer, supprimer, icône, déplacer vers un groupe ou basculer VIP.<br>"
        + "• <b>VIP (★)</b> : les trous épinglés remontent automatiquement.<br>"
        + "• <b>Groupes</b> : organisez les trous en dossiers.<br>"
        + "• <b>Mode focus</b> : vue compacte icônes uniquement.",
      fm_sec_wm_send: "✉️ Trou de ver — Envoyer un message",
      fm_sec_wm_send_content:
        "• <b>Clic droit</b> → <b>Envoyer un message ici</b> pour ouvrir le panneau.<br>"
        + "• <b>Mode A (Navigation)</b> : change de salon, injecte le texte et revient.<br>"
        + "• <b>Shift+Clic</b> → ouvre le panneau dans le salon actuel.<br>"
        + "• Prend en charge le <b>collage d'images avec Ctrl+V</b>.<br>"
        + "• Options du bas : <b>Fermeture auto</b> / <b>Aller au salon</b> / <b>Afficher la notification</b>.",
      fm_sec_wm_api: "⚡ Trou de ver — Mode API (secret)",
      fm_sec_wm_api_content:
        "• <b>Maintenez le bouton ＋ appuyé 3 secondes</b> pour déverrouiller le Mode API.<br>"
        + "• <b>Mode B (API directe)</b> : envoie des messages via l'API REST Discord sans changer de page.<br>"
        + "• Le token est intercepté silencieusement en mémoire — <b>jamais stocké ni transmis</b>.<br>"
        + "• Effacé à la fermeture de la page.",
      welcome_title: "Bienvenue sur {script}",
      select_lang_subtitle: "Veuillez sélectionner la langue de l'interface",
      help_btn: "📖 Manuel",
      cancel_btn: "✕ Fermer",
      security_notice_title: "⚠️ Avertissement de sécurité",
      security_notice_content:
        "Les fonctions de conversion d'URL (vxtwitter, kkinstagram, etc.) dépendent de services tiers.\nNe les utilisez pas si vous ne faites pas confiance à ces services.\nLes utilisateurs doivent être capables d'identifier la sécurité des URL.",
      manual_content:
        "【Guide des icônes】\n• ◫/≡ : Changer le style de menu (Plat / Groupe)\n• ⇄ : Inverser la logique de clic (Copier / Insérer)\n• ␣ : Ajouter un espace à la fin\n• ↵ : Ajouter une nouvelle ligne à la fin\n• ☆ : Panneau de chaînes personnalisées\n• 🖱️ : Mode d'activation (Survol / Clic)\n• 🌐 : Changer de langue\n\n【Actions】\n• **Clic** : Copier (défaut)\n• **Appui long (0,5s)** : Insérer dans la zone de texte\n• **Shift+Clic** : Copier et insérer (menu conservé)",
      manual_content_sections: "<div class='mm-section'><div class='mm-sec-title c-default'>⚡ Démarrage rapide</div><div class='mm-content'>Survolez un message Discord → un bouton de copie apparaît en haut à droite.<br><b>Clic</b> pour copier · <b>Appui long 0,5s</b> pour insérer · <b>Shift+Clic</b> pour copier et insérer.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 Menu de copie</div><div class='mm-content'>• Copier le texte, l'URL des médias, le premier lien propre, tous les liens, Markdown, texte masqué.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ Télécharger</div><div class='mm-content'>• Télécharger images/médias individuellement ou en ZIP.</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 Conversion d'URL</div><div class='mm-content'>Twitter/X, Instagram, Bilibili, Pixiv — conversion mutuelle pour les aperçus Discord.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 Trou de ver</div><div class='mm-content'>Raccourcis de salon en un clic dans la barre latérale Discord.</div></div>",
      reload_confirm: "Paramètres sauvegardés !\nRecharger la page maintenant ?",
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
      download_cors_fail: "⚠️ CORS empêche le téléchargement direct. Copiez l'URL et ouvrez-la dans le navigateur.",
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
      export_success: "✅ Paramètres exportés !\n\nCopiés dans le presse-papiers.",
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
      mod_msg_warn_body: "⠿ L'Utilitaire de Messages est la fonction principale.\\nSi désactivé, le bouton ⠿ disparaîtra de tous les messages.",
      mod_msg_warn_confirm: "Désactiver",
      mod_msg_warn_cancel: "Annuler",
      mod_msg_enable_menu: "Activer ⠿ Utilitaire de Messages",
      grp_copy: "📝 Copier >",
      grp_convert: "🔄 Convertir >",
      grp_download: "⬇️ Télécharger >",
      grp_system: "⚙️ Système et symboles >",
      view_main: "Menu principal",
      view_symbols: "Chaînes personnalisées",

      em_title: "😊 Gestion intégrée des expressions/GIF",
      em_content:
        "• <b>Barre</b> : [📁] Collection | [🎯] Mode viseur | [★] Mots-clés.<br>• <b>Mode viseur</b> : sélectionnez directement des GIFs ou emojis à l'écran.<br>• <b>Shift+Clic</b> : envoyer consécutivement sans fermer le panneau.",
      em_picker_tip: "🔍 Cliquez sur le GIF/emoji (clic sur le fond pour annuler)",
      em_err_no_list: "Conteneur de liste introuvable. Ouvrez d'abord la fenêtre emoji ou GIF !",
      em_btn_add_title: "Sauvegarder le mot-clé de recherche",
      em_btn_active_title: "Clic : remplir le mot-clé (basculer)",
      em_btn_target_title: "Mode viseur : cliquez sur GIF/emoji pour sauvegarder",
      em_btn_save_this: "Ajouter cet élément à la collection",
      em_no_favs: "Aucun favori pour l'instant",
      em_del_confirm: "Supprimer « {k} » ?",
      em_keyword_prompt: "Entrez un mot-clé :",
      em_keyword_exists: "« {k} » existe déjà",

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
      wm_group_del_confirm: "Dissoudre le groupe « {n} » ? (les trous seront conservés)",
      wm_group_select_prompt: "Entrez un numéro pour sélectionner le groupe :\n\n0. [Racine/Non catégorisé]\n{list}\n\nLaissez vide pour créer « Nouveau groupe » :",
      wm_group_invalid: "Sélection de groupe invalide !",
      wm_move_prompt: "Déplacer vers quel groupe ? (entrez le numéro)\n\n{list}",
      wm_icon_picker_title: "Sélectionner l'icône pour {name}",
      wm_icon_set_success: "✅ Icône de {name} définie",
      wm_icon_empty: "Ajoutez d'abord un Emoji dans le module de collection",
      wm_title: "Contrôle du trou de ver\n• Clic : créer nouveau\n• Appui long 1s : menu des paramètres",
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
      wm_send_token_warn: "⚠️ Token expiré. Rouvrez le panneau API pour le détecter à nouveau. Utilisation du Mode A cette fois.",
      wm_send_channel_fail: "❌ Échec du chargement du salon",
      wm_send_editor_missing: "❌ Éditeur introuvable",
      wm_send_uploading: "📎 Envoi de {n} image(s)...",

      wm_api_panel_title: "⚗️ Mode API du trou de ver (avancé)",
      wm_api_mode_label_a: "Mode A — Navigation (défaut)",
      wm_api_mode_label_b: "Mode B — API directe (sans changement de page)",
      wm_api_warning_title: "⚠️ Avis de risque",
      wm_api_warning_body: "Utiliser un Token utilisateur pour appeler l'API Discord viole les Conditions d'utilisation. Votre compte peut être banni. Utilisez à vos risques.",
      wm_api_token_status_none: "Token : Non détecté",
      wm_api_token_status_ready: "Token : Prêt (mémoire uniquement)",
      wm_api_detect_btn: "Détecter mon Token",
      wm_api_detect_confirm: "【Consentement d'interception du Token】\n\nEn cliquant sur OK, vous autorisez ce script à intercepter votre Token Discord pour cette session.\n\n🔒 Garanties de sécurité :\n• Mémoire uniquement — jamais écrit sur disque\n• Effacé à la fermeture ou au rechargement de la page\n• Jamais transmis à un serveur externe\n• Utilisé exclusivement pour envoyer des messages en votre nom\n\n⚠️ Reconnaissance :\n• Vous comprenez que ce token accorde l'accès à l'envoi de messages\n• Vous acceptez l'entière responsabilité de tous les messages envoyés\n\nProcédez uniquement si vous faites confiance à ce script.",
      wm_api_detect_waiting: "⬆️ Changez de salon une fois pour capturer le Token",
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
      em_col_add_success: 'Enregistré dans « {g} » !',
      em_col_tab_new: "Nouvel onglet",
      em_col_tab_prompt: "Nom du nouvel onglet :",
      em_col_empty_tab: "Cet onglet est vide.",
      em_col_del_tab_confirm: 'Supprimer l\'onglet « {n} » et tous ses éléments ?',
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
      custom_lang_desc: "Cliquez sur「📤 Exporter le texte」pour obtenir le JSON source en anglais. Traduisez-le puis utilisez「📥 Importer le texte」pour l'appliquer.",
      custom_lang_export: "📤 Exporter le texte",
      custom_lang_import: "📥 Importer le texte",
      custom_lang_apply: "✅ Appliquer et recharger",
      custom_lang_loaded: "✅ Chargé : {name}",
      custom_lang_activate: "🌐 Appliquer « {name} »",
      custom_lang_json_error: "⚠️ Erreur JSON : {msg}",
      custom_lang_paste_hint: "Collez le JSON traduit ici …",
    },

    "ru": {
      name: "Русский",
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
        "• Нажмите <span class='help-key'>＋</span> и вставьте URL канала Discord для создания ярлыка.<br>"
        + "• <b>Клик</b> на червоточину → мгновенный переход к этому каналу.<br>"
        + "• <b>Правый клик</b> → меню: переименовать, удалить, значок, перенести в группу или переключить VIP.<br>"
        + "• <b>VIP (★)</b>: закреплённые червоточины автоматически всплывают наверх.<br>"
        + "• <b>Группы</b>: организуйте червоточины в именованные папки.<br>"
        + "• <b>Режим фокуса</b>: компактный вид только со значками.",
      fm_sec_wm_send: "✉️ Червоточина — Отправка сообщений",
      fm_sec_wm_send_content:
        "• <b>Правый клик</b> → <b>Отправить сообщение здесь</b> для открытия панели.<br>"
        + "• <b>Режим A (Навигация)</b>: переходит на целевой канал, вставляет текст и возвращается.<br>"
        + "• <b>Shift+Клик</b> → открывает панель в текущем канале.<br>"
        + "• Поддерживает <b>вставку изображений через Ctrl+V</b>.<br>"
        + "• Нижние опции: <b>Автозакрытие</b> / <b>Перейти на канал</b> / <b>Показать уведомление</b>.",
      fm_sec_wm_api: "⚡ Червоточина — Режим API (секретный)",
      fm_sec_wm_api_content:
        "• <b>Удерживайте кнопку ＋ 3 секунды</b> для разблокировки режима API.<br>"
        + "• <b>Режим B (Прямой API)</b>: отправляет сообщения через Discord REST API без смены страницы.<br>"
        + "• Токен перехватывается тихо в памяти — <b>никогда не сохраняется и не передаётся</b>.<br>"
        + "• Очищается при закрытии страницы.",
      welcome_title: "Добро пожаловать в {script}",
      select_lang_subtitle: "Пожалуйста, выберите язык интерфейса",
      help_btn: "📖 Руководство",
      cancel_btn: "✕ Закрыть",
      security_notice_title: "⚠️ Уведомление безопасности",
      security_notice_content:
        "Функции конвертации URL (например, vxtwitter, kkinstagram) зависят от сторонних сервисов.\nНе используйте их, если не доверяете этим сервисам.\nПользователи должны уметь определять безопасность URL.",
      manual_content:
        "【Руководство по иконкам】\n• ◫/≡ : Сменить стиль меню (Плоский / Группа)\n• ⇄ : Поменять логику клика (Копировать / Вставить)\n• ␣ : Добавить пробел в конце\n• ↵ : Добавить новую строку в конце\n• ☆ : Панель пользовательских строк\n• 🖱️ : Режим активации (Hover / Клик)\n• 🌐 : Сменить язык\n\n【Действия】\n• **Клик**: Копировать (по умолчанию)\n• **Долгое нажатие (0,5с)**: Вставить в поле ввода\n• **Shift+Клик**: Копировать и вставить (меню остаётся открытым)",
      manual_content_sections: "<div class='mm-section'><div class='mm-sec-title c-default'>⚡ Быстрый старт</div><div class='mm-content'>Наведите курсор на любое сообщение Discord → в правом верхнем углу появится кнопка копирования.<br><b>Клик</b> для копирования · <b>Долгое нажатие 0,5с</b> для вставки · <b>Shift+Клик</b> для копирования и вставки.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>📋 Меню копирования</div><div class='mm-content'>• Копировать текст, URL медиа, первую чистую ссылку, все ссылки, Markdown, скрытый текст.</div></div><div class='mm-section accent-blue'><div class='mm-sec-title c-blue'>⬇️ Загрузка</div><div class='mm-content'>• Загружать изображения/медиа по отдельности или как ZIP.</div></div><div class='mm-section accent-yellow'><div class='mm-sec-title c-yellow'>🔁 Конвертация URL</div><div class='mm-content'>Twitter/X, Instagram, Bilibili, Pixiv — взаимная конвертация для предпросмотра в Discord.</div></div><div class='mm-section'><div class='mm-sec-title c-default'>🌀 Червоточина</div><div class='mm-content'>Ярлыки каналов в один клик на боковой панели Discord.</div></div>",
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
      download_cors_fail: "⚠️ CORS не позволяет прямую загрузку. Скопируйте URL и откройте в браузере.",
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
      export_success: "✅ Настройки экспортированы!\n\nСкопированы в буфер обмена.",
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
      mod_msg_warn_body: "⠿ Утилита сообщений является основной функцией.\\nПри отключении кнопка ⠿ исчезнет со всех сообщений.",
      mod_msg_warn_confirm: "Отключить",
      mod_msg_warn_cancel: "Отмена",
      mod_msg_enable_menu: "Включить ⠿ утилиту сообщений",
      grp_copy: "📝 Копировать >",
      grp_convert: "🔄 Конвертировать >",
      grp_download: "⬇️ Скачать >",
      grp_system: "⚙️ Система и символы >",
      view_main: "Главное меню",
      view_symbols: "Пользовательские строки",

      em_title: "😊 Интегрированное управление выражениями/GIF",
      em_content:
        "• <b>Панель</b>: [📁] Коллекция | [🎯] Режим прицела | [★] Ключевые слова.<br>• <b>Режим прицела</b>: выбирайте GIF или эмодзи прямо с экрана.<br>• <b>Shift+Клик</b>: отправлять последовательно без закрытия панели.",
      em_picker_tip: "🔍 Нажмите на GIF/эмодзи (нажмите на фон для отмены)",
      em_err_no_list: "Контейнер списка не найден. Сначала откройте окно эмодзи или GIF!",
      em_btn_add_title: "Сохранить ключевое слово поиска",
      em_btn_active_title: "Клик: заполнить ключевое слово (переключить)",
      em_btn_target_title: "Режим прицела: нажмите GIF/эмодзи для сохранения",
      em_btn_save_this: "Добавить этот элемент в коллекцию",
      em_no_favs: "Пока нет избранного",
      em_del_confirm: "Удалить «{k}»?",
      em_keyword_prompt: "Введите ключевое слово:",
      em_keyword_exists: "«{k}» уже существует",

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
      wm_group_del_confirm: "Расформировать группу «{n}»? (червоточины сохранятся)",
      wm_group_select_prompt: "Введите номер для выбора группы:\n\n0. [Корень/Без категории]\n{list}\n\nОставьте пустым для создания «Новой группы»:",
      wm_group_invalid: "Недопустимый выбор группы!",
      wm_move_prompt: "В какую группу переместить? (введите номер)\n\n{list}",
      wm_icon_picker_title: "Выбрать значок для {name}",
      wm_icon_set_success: "✅ Значок {name} установлен",
      wm_icon_empty: "Сначала добавьте эмодзи в модуле коллекции",
      wm_title: "Управление червоточиной\n• Клик: создать новую\n• Долгое нажатие 1с: меню настроек",
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
      wm_send_token_warn: "⚠️ Токен истёк. Откройте панель API заново для повторного обнаружения. На этот раз используется режим A.",
      wm_send_channel_fail: "❌ Ошибка загрузки канала",
      wm_send_editor_missing: "❌ Редактор не найден",
      wm_send_uploading: "📎 Загрузка {n} изображени(й)...",

      wm_api_panel_title: "⚗️ Режим API червоточины (расширенный)",
      wm_api_mode_label_a: "Режим A — Навигация (по умолчанию)",
      wm_api_mode_label_b: "Режим B — Прямой API (без смены страницы)",
      wm_api_warning_title: "⚠️ Предупреждение о рисках",
      wm_api_warning_body: "Использование токена пользователя для вызова API Discord нарушает Условия использования. Ваш аккаунт может быть заблокирован. Используйте на свой страх и риск.",
      wm_api_token_status_none: "Токен: Не обнаружен",
      wm_api_token_status_ready: "Токен: Готов (только в памяти)",
      wm_api_detect_btn: "Обнаружить мой токен",
      wm_api_detect_confirm: "【Согласие на перехват токена】\n\nНажав ОК, вы разрешаете этому скрипту перехватить ваш токен Discord для данной сессии.\n\n🔒 Гарантии безопасности:\n• Только в памяти — никогда не записывается на диск\n• Автоматически удаляется при закрытии или перезагрузке страницы\n• Никогда не передаётся на внешние серверы\n• Используется исключительно для отправки сообщений от вашего имени\n\n⚠️ Подтверждение:\n• Вы понимаете, что токен предоставляет доступ к отправке сообщений\n• Вы принимаете полную ответственность за все отправленные сообщения\n\nПродолжайте только если доверяете этому скрипту.",
      wm_api_detect_waiting: "⬆️ Переключитесь в любой канал один раз, чтобы захватить Token",
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
      em_col_add_success: 'Сохранено в «{g}»!',
      em_col_tab_new: "Новая вкладка",
      em_col_tab_prompt: "Название новой вкладки:",
      em_col_empty_tab: "Эта вкладка пуста.",
      em_col_del_tab_confirm: 'Удалить вкладку «{n}» со всеми элементами?',
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
      custom_lang_desc: "Нажмите「📤 Экспорт текста」для получения исходного JSON на английском. Переведите и используйте「📥 Импорт текста」для применения.",
      custom_lang_export: "📤 Экспорт текста",
      custom_lang_import: "📥 Импорт текста",
      custom_lang_apply: "✅ Применить и перезагрузить",
      custom_lang_loaded: "✅ Загружено: {name}",
      custom_lang_activate: "🌐 Применить «{name}»",
      custom_lang_json_error: "⚠️ Ошибка JSON: {msg}",
      custom_lang_paste_hint: "Вставьте переведённый JSON сюда …",
    },

  };

  let _customLangData = null;
  (() => {
    try {
      const raw = localStorage.getItem("copyMenuLanguage_custom");
      if (raw) _customLangData = JSON.parse(raw);
    } catch (e) {
      console.warn("[i18n] Failed to load custom language data:", e);
    }
  })();

  TRANSLATIONS["custom"] = { name: "Custom" };

  class ObserverManager {
    constructor() {
      this.observers = new Map();
      this.reconnectAttempts = new Map();
      this.maxReconnectAttempts = 3;
      this.reconnectDelay = 2000;
    }

    register(
      name,
      target,
      callback,
      options = { childList: true, subtree: true },
    ) {
      if (this.observers.has(name)) {
        this.disconnect(name);
      }

      try {
        const observer = new MutationObserver((mutations) => {
          try {
            callback(mutations, observer);
          } catch (error) {
            console.error(`[Observer:${name}] Callback error:`, error);
            this._scheduleReconnect(name, target, callback, options);
          }
        });

        observer.observe(target, options);

        this.observers.set(name, {
          observer,
          target,
          callback,
          options,
          startTime: Date.now(),
        });

        console.log(`[Observer:${name}] ✓ Started`);

        this.reconnectAttempts.set(name, 0);
      } catch (error) {
        console.error(`[Observer:${name}] Failed to start:`, error);
      }
    }

    disconnect(name) {
      if (this.observers.has(name)) {
        const { observer } = this.observers.get(name);
        observer.disconnect();
        this.observers.delete(name);
        console.log(`[Observer:${name}] ✓ Disconnected`);
      }
    }

    disconnectAll() {
      this.observers.forEach((_, name) => this.disconnect(name));
      console.log(`[ObserverManager] All observers disconnected`);
    }

    _scheduleReconnect(name, target, callback, options) {
      const attempts = this.reconnectAttempts.get(name) || 0;

      if (attempts >= this.maxReconnectAttempts) {
        console.error(
          `[Observer:${name}] Max reconnect attempts reached, giving up`,
        );
        return;
      }

      console.warn(
        `[Observer:${name}] Scheduling reconnect (attempt ${attempts + 1}/${this.maxReconnectAttempts})`,
      );

      setTimeout(() => {
        if (document.body.contains(target)) {
          this.reconnectAttempts.set(name, attempts + 1);
          this.register(name, target, callback, options);
        } else {
          console.error(`[Observer:${name}] Target element no longer exists`);
        }
      }, this.reconnectDelay);
    }

    getStatus() {
      const status = {};
      this.observers.forEach((data, name) => {
        const uptime = Math.floor((Date.now() - data.startTime) / 1000);
        status[name] = {
          active: true,
          uptime: `${uptime}s`,
          target: data.target.tagName || "Unknown",
        };
      });
      return status;
    }

    healthCheck() {
      const issues = [];

      this.observers.forEach((data, name) => {
        if (!document.body.contains(data.target)) {
          issues.push(`${name}: Target element removed`);
          this.disconnect(name);
        }
      });

      if (issues.length > 0) {
        console.warn(`[ObserverManager] Health check found issues:`, issues);
      }

      return issues;
    }
  }

  const observerManager = new ObserverManager();

  GM_registerMenuCommand(t("mod_msg_enable_menu"), () => {
    localStorage.setItem("mod_message", "true");
    location.reload();
  });

  window.addEventListener("beforeunload", () => {
    observerManager.disconnectAll();
  });

  function initForwardingManager() {
    console.log(
      "[Discord Utilities] Initializing Forwarding Manager (v20.1 Memory Safe)...",
    );

    let pollInterval = null;
    let isPollingActive = false;
    const searchTimers = new Map();

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
    styleEl.innerHTML = STYLES;
    document.head.appendChild(styleEl);

    const STORAGE_KEY = "discord_forward_v8";
    const PREF_KEY = "discord_forward_pref";
    function loadData() {
      return GM_getValue(STORAGE_KEY, []);
    }
    function saveData(data) {
      GM_setValue(STORAGE_KEY, data);
    }
    function loadDropdownMode() {
      return GM_getValue(PREF_KEY, true);
    }
    function saveDropdownMode(isDropdown) {
      GM_setValue(PREF_KEY, isDropdown);
    }

    function getRowType(row) {
      if (!row) return "channel";
      const hasAvatar = row.querySelector('img[class*="avatar"]');
      const isFriend = row.className && row.className.includes("friend");
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

    const activeObservers = new WeakMap();

    async function handleForwardOpen() {
      console.log(
        "[ForwardingManager] Forward button clicked. Waiting for modal...",
      );

      const modalTitle = await waitForElement('div[role="dialog"] h1');
      if (!modalTitle) return;

      const modal = modalTitle.closest('div[role="dialog"]');
      if (!modal) return;

      const text = modalTitle.innerText || "";
      if (!/Forward|轉發|转发|転送|전달/.test(text)) return;
      DEBUG && console.log("[ForwardingManager] Forward modal detected.");

      const searchInput = await waitForElement(
        'input[placeholder^="Search"], input[placeholder^="搜尋"], input[placeholder^="検索"]',
        modal,
        2000,
      );
      if (searchInput) injectBarUI(searchInput, modal);

      injectListStars(modal);

      if (!activeObservers.has(modal)) {
        const listObserver = new MutationObserver((mutations) => {
          let shouldInject = false;
          for (const m of mutations) {
            if (m.addedNodes.length > 0) shouldInject = true;
          }
          if (shouldInject) {
            if (modal.dataset.injectTimer)
              clearTimeout(Number(modal.dataset.injectTimer));
            modal.dataset.injectTimer = setTimeout(
              () => injectListStars(modal),
              120,
            );
          }
        });

        listObserver.observe(modal, { childList: true, subtree: true });
        activeObservers.set(modal, listObserver);
        DEBUG && console.log("[ForwardingManager] Local Observer attached to modal.");

        const removeObserver = new MutationObserver((mutations, obs) => {
          if (!document.body.contains(modal)) {
            listObserver.disconnect();
            activeObservers.delete(modal);
            obs.disconnect();
            console.log(
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

    document.addEventListener(
      "click",
      (e) => {
        if (!e.target.closest(".dropdown-container-wrapper")) {
          document
            .querySelectorAll(".my-dropdown-menu")
            .forEach((m) => m.classList.remove("show"));
        }

        const forwardBtn = e.target.closest(
          'div[aria-label="轉發"], div[aria-label="Forward"], div[aria-label="转发"], div[aria-label="転送"], div[aria-label="전달"]',
        );
        if (forwardBtn) handleForwardOpen();
      },
      true,
    );

    function cleanup() {
      searchTimers.forEach((timer) => clearTimeout(timer));
      searchTimers.clear();

      activeObservers.forEach((observer) => observer.disconnect());
      activeObservers.clear();

      console.log("[ForwardingManager] Cleanup complete");
    }
    window.addEventListener("beforeunload", cleanup);

    function isNSFWChannel(row) {
      try {
        const ariaLabel = row.getAttribute("aria-label") || "";
        if (/\b(nsfw|age-restricted|18\+|adult)\b/i.test(ariaLabel))
          return true;

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

    const nsfwCache = new WeakMap();
    function getCachedNSFWStatus(row) {
      if (nsfwCache.has(row)) return nsfwCache.get(row);
      const isNSFW = isNSFWChannel(row);
      nsfwCache.set(row, isNSFW);
      return isNSFW;
    }

    function truncateText(text, length = 5) {
      if (text.length <= length) return text;
      return text.substring(0, length) + "..";
    }

    function injectBarUI(searchInput, modal) {
      if (document.getElementById("my-pinned-bar")) return;

      const bar = document.createElement("div");
      bar.id = "my-pinned-bar";

      const inputContainer = searchInput.parentElement;
      if (inputContainer) {
        inputContainer.before(bar);
        renderBarButtons(bar, modal);
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

      const helpBtn = document.createElement("button");
      helpBtn.className = "my-btn btn-help";
      helpBtn.innerText = "❓";
      helpBtn.title = t("fm_help");
      helpBtn.onclick = (e) => {
        e.stopPropagation();
        showHelpModal();
      };
      container.appendChild(helpBtn);

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
      mainBtn.innerHTML = `<span>${title} (${list.length})</span> <span style="font-size:10px">▼</span>`;
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
          if (confirm(t("fm_remove_confirm", { target: item.channel })))
            removeData(item.channel, item.server);
        }
      };
      return row;
    }

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
      console.log(`[Search] Step 1: Warm-up with "${warmUpTerm}"`);

      const timer = setTimeout(() => {
        setNativeValue(searchInput, fullTerm);
        console.log(`[Search] Step 2: Full term "${fullTerm}"`);
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
          if (confirm(t("fm_remove_confirm", { target: item.channel })))
            removeData(item.channel, item.server);
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

  function initMessageUtility() {
    console.log("[Discord Utilities] Initializing Message Utility...");
    const BUTTON_TOP = -9;
    const BUTTON_RIGHT = 230;
    let globalCloseTimer = null;
    let globalActiveDropdown = null;

    let config = getConfig();

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
      closeBtn.onmouseenter = () => { closeBtn.style.background="rgba(237,66,69,0.3)"; closeBtn.style.color="#fff"; };
      closeBtn.onmouseleave = () => { closeBtn.style.background="rgba(255,255,255,0.08)"; closeBtn.style.color="#aaa"; };
      closeBtn.onclick = () => { overlay.remove(); animStyle.remove(); };
      container.appendChild(closeBtn);

      const welcome = document.createElement("h2");
      welcome.innerText = t("welcome_title", { script: SCRIPT_NAME });
      welcome.style.cssText = "margin:0 0 6px; font-size:20px; font-weight:700; color:#fff; letter-spacing:-0.01em;";

      const subtitle = document.createElement("p");
      subtitle.innerText = t("select_lang_subtitle");
      subtitle.style.cssText = "margin:0 0 20px; color:rgba(255,255,255,0.45); font-size:13px;";

      const noticeBox = document.createElement("div");
      noticeBox.style.cssText = `
        background:rgba(237,66,69,0.10);
        border:1px solid rgba(237,66,69,0.30);
        border-radius:12px; padding:14px 16px; margin-bottom:22px; text-align:left;
      `;
      const noticeTitle = document.createElement("h3");
      noticeTitle.innerText = t("security_notice_title");
      noticeTitle.style.cssText = "color:#f87171; margin:0 0 7px; font-size:14px; font-weight:600; display:flex; align-items:center; gap:6px;";
      const noticeContent = document.createElement("p");
      noticeContent.innerText = t("security_notice_content");
      noticeContent.style.cssText = "color:rgba(255,255,255,0.7); font-size:12.5px; line-height:1.6; margin:0; white-space:pre-line;";
      noticeBox.appendChild(noticeTitle);
      noticeBox.appendChild(noticeContent);

      container.appendChild(welcome);
      container.appendChild(subtitle);
      container.appendChild(noticeBox);

      const btnContainer = document.createElement("div");
      btnContainer.style.cssText = "display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-bottom:12px;";

      Object.keys(TRANSLATIONS).filter(lc => lc !== "custom").forEach((langCode) => {
        const btn = document.createElement("button");
        btn.className = "lang-btn";
        btn.innerText = TRANSLATIONS[langCode].name;
        btn.onclick = () => {
          config.lang = langCode;
          localStorage.setItem("copyMenuLanguage", langCode);
          overlay.remove(); animStyle.remove();
          if (confirm(t("reload_confirm"))) location.reload();
        };
        btnContainer.appendChild(btn);
      });

      const customLangBtn = document.createElement("button");
      customLangBtn.className = "lang-btn";
      customLangBtn.innerText = "🌐 " + (_customLangData?.name || "Custom");
      btnContainer.appendChild(customLangBtn);

      container.appendChild(btnContainer);

      const customPanel = document.createElement("div");
      customPanel.style.cssText = `
        display:none;
        background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.10);
        border-radius:12px; padding:16px; margin-bottom:10px; text-align:left;
      `;

      const customTitle = document.createElement("p");
      customTitle.style.cssText = "margin:0 0 10px; color:rgba(255,255,255,0.75); font-size:13px; line-height:1.6;";
      customTitle.innerHTML = `<b style="color:#5865F2">🌐 Custom</b><br>${t("custom_lang_desc")}`;
      customPanel.appendChild(customTitle);

      const customBtnRow = document.createElement("div");
      customBtnRow.style.cssText = "display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;";

      const exportBtn = document.createElement("button");
      exportBtn.innerText = t("custom_lang_export");
      exportBtn.style.cssText = `
        padding:7px 16px; font-size:13px; cursor:pointer;
        background:rgba(59,165,92,0.25); color:#3ba55c;
        border:1px solid rgba(59,165,92,0.4); border-radius:8px; transition:all 0.15s;
      `;
      exportBtn.onmouseenter = () => { exportBtn.style.background="rgba(59,165,92,0.4)"; exportBtn.style.color="#fff"; };
      exportBtn.onmouseleave = () => { exportBtn.style.background="rgba(59,165,92,0.25)"; exportBtn.style.color="#3ba55c"; };
      exportBtn.onclick = () => {
        const exportData = {
          _note: "Translate the VALUES only. Do NOT change the KEYS. Keep {placeholders} like {n} {s} {t} untouched. Preserve HTML tags and class='...' attributes as-is. The 'name' field will be shown in the language selector.",
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
        a.href = url; a.download = "discord-toolkit-custom-lang.json"; a.click();
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
      importBtn.onmouseenter = () => { importBtn.style.background="rgba(88,101,242,0.45)"; importBtn.style.color="#fff"; };
      importBtn.onmouseleave = () => { importBtn.style.background="rgba(88,101,242,0.25)"; importBtn.style.color="#7289da"; };

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
      importError.style.cssText = "color:#ed4245; font-size:12px; margin:4px 0 0; display:none;";

      const importConfirmBtn = document.createElement("button");
      importConfirmBtn.innerText = t("custom_lang_apply");
      importConfirmBtn.style.cssText = `
        margin-top:8px; padding:7px 14px; font-size:13px; cursor:pointer;
        background:rgba(88,101,242,0.4); color:#fff;
        border:1px solid rgba(88,101,242,0.5); border-radius:8px; transition:all 0.15s;
      `;
      importConfirmBtn.onmouseenter = () => { importConfirmBtn.style.background="rgba(88,101,242,0.7)"; };
      importConfirmBtn.onmouseleave = () => { importConfirmBtn.style.background="rgba(88,101,242,0.4)"; };
      importConfirmBtn.onclick = () => {
        try {
          const parsed = JSON.parse(importTextarea.value.trim());
          if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("must be a JSON object");
          delete parsed["_note"];
          localStorage.setItem("copyMenuLanguage_custom", JSON.stringify(parsed));
          localStorage.setItem("copyMenuLanguage", "custom");
          _customLangData = parsed;
          overlay.remove(); animStyle.remove();
          location.reload();
        } catch (err) {
          importError.textContent = t("custom_lang_json_error", { msg: err.message });
          importError.style.display = "block";
        }
      };
      importArea.appendChild(importTextarea);
      importArea.appendChild(importError);
      importArea.appendChild(importConfirmBtn);

      importBtn.onclick = () => {
        importArea.style.display = importArea.style.display === "none" ? "block" : "none";
        importError.style.display = "none";
      };
      customBtnRow.appendChild(importBtn);

      customPanel.appendChild(customBtnRow);
      customPanel.appendChild(importArea);

      if (_customLangData) {
        const langName = _customLangData.name || "Custom";
        const statusRow = document.createElement("p");
        statusRow.style.cssText = "margin:10px 0 0; color:#3ba55c; font-size:12px;";
        statusRow.innerHTML = t("custom_lang_loaded", { name: `<b>${escHtml(langName)}</b>` });

        const activateBtn = document.createElement("button");
        activateBtn.innerText = t("custom_lang_activate", { name: langName });
        activateBtn.style.cssText = `
          display:block; margin-top:6px; padding:7px 14px; font-size:12px; cursor:pointer;
          background:rgba(88,101,242,0.35); color:#fff;
          border:1px solid rgba(88,101,242,0.5); border-radius:8px; transition:all 0.15s;
        `;
        activateBtn.onmouseenter = () => { activateBtn.style.background="rgba(88,101,242,0.6)"; };
        activateBtn.onmouseleave = () => { activateBtn.style.background="rgba(88,101,242,0.35)"; };
        activateBtn.onclick = () => {
          localStorage.setItem("copyMenuLanguage", "custom");
          overlay.remove(); animStyle.remove();
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

      const helpBtn = document.createElement("button");
      helpBtn.innerText = t("help_btn");
      helpBtn.style.cssText =
        "background:none; border:none; color:rgba(255,255,255,0.35); cursor:pointer; font-size:12px; text-decoration:underline; margin-top:4px;";
      helpBtn.onmouseenter = () => { helpBtn.style.color="#3ba55c"; };
      helpBtn.onmouseleave = () => { helpBtn.style.color="rgba(255,255,255,0.35)"; };
      helpBtn.onclick = () => {
        const existingManual = document.getElementById("msg-manual-overlay");
        if (existingManual) { existingManual.remove(); return; }

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
        document.body.appendChild(manualOverlay);

        const close = () => { manualOverlay.remove(); style.remove(); };
        document.getElementById("mm-close-btn").onclick = close;
        manualOverlay.addEventListener("click", (e) => { if (e.target === manualOverlay) close(); });
      };
      container.appendChild(helpBtn);

      overlay.appendChild(container);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.remove(); animStyle.remove(); } });
      document.body.appendChild(overlay);
    }

    GM_addStyle(`
    .msg-copy-btn {
        position: absolute;
        top: ${BUTTON_TOP}px;
        right: ${BUTTON_RIGHT}px;
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.6);
        font-size: 14px;
        padding: 2px 6px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.2s;
        text-shadow: 0 0 2px black;
        pointer-events: auto !important;
        user-select: none;
        isolation: isolate;
    }

    .msg-copy-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .msg-copy-container:hover .msg-copy-btn {
        opacity: 1;
    }

    .msg-copy-container:has(.bookmark-msg-btn) .msg-copy-btn {
        right: ${BUTTON_RIGHT + 34}px;
    }

    .msg-copy-dropdown {
        position: fixed;
        background: #2f3136;
        border-radius: 4px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
        font-size: 14px;
        color: white;
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
        background-color: #2b2d31;
        border-radius: 4px;
    }

    .msg-copy-dropdown::-webkit-scrollbar-thumb {
        background-color: #1a1b1e;
        border-radius: 4px;
    }

    .msg-copy-dropdown button {
        background: none;
        border: none;
        color: white;
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
        color: #bbb;
        background: #202225;
        user-select: none;
    }

    .msg-copy-header-left {
        font-weight: bold;
        color: #fff;
    }

    .msg-copy-header-right {
        display: flex;
        gap: 6px;
    }

    .msg-copy-header-icon {
        cursor: pointer;
        font-size: 14px;
        transition: color 0.2s;
        color: #72767d;
        width: 18px;
        text-align: center;
    }

    .msg-copy-header-icon:hover {
        color: #fff;
    }

    .msg-copy-header-icon.active {
        color: #f1c40f;
        text-shadow: 0 0 5px rgba(241, 196, 15, 0.5);
    }

    .msg-copy-header-icon.active-green {
        color: #3ba55c;
        text-shadow: 0 0 5px rgba(59, 165, 92, 0.5);
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
        color: #fff;
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
        color: #b9bbbe;
        font-weight: bold;
    }

    .msg-copy-item-group:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }

    /* Floating Submenu Portal Style */
    .msg-copy-portal-menu {
        position: fixed;
        background: #2f3136;
        border: 1px solid #202225;
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
        color: white;
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
        color: #bbb;
        padding: 4px 12px 6px 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        user-select: none;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
        background: #2f3136;
        position: sticky;
        bottom: 0;
    }

    .msg-copy-manage button {
        font-size: 12px;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: white;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
        width: auto;
    }

    .msg-copy-manage button:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .msg-copy-toast {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #2b6dcf;
        color: white;
        padding: 10px 16px;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 2147483647;
        opacity: 0;
        transition: opacity 0.3s;
        max-width: 80%;
        text-align: center;
        pointer-events: none;
    }

    .msg-copy-toast.show {
        opacity: 1;
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
        box-shadow: 0 0 4px #fff, 0 0 8px #5865F2;
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
`);

    function closeGlobalMenu() {
      if (globalActiveDropdown) {
        globalActiveDropdown.remove();
        globalActiveDropdown = null;
        document
          .querySelectorAll(".msg-copy-portal-menu")
          .forEach((el) => el.remove());
      }
    }

    function scheduleCloseGlobalMenu() {
      if (config.triggerMode !== "hover") return;
      if (globalCloseTimer) clearTimeout(globalCloseTimer);
      globalCloseTimer = setTimeout(() => {
        closeGlobalMenu();
      }, 1500);
    }

    function cancelCloseGlobalMenu() {
      if (globalCloseTimer) {
        clearTimeout(globalCloseTimer);
        globalCloseTimer = null;
      }
    }

    function exportSettings() {
      const forwardingData = GM_getValue("discord_forward_v8", []);

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

      const moduleCData = {
        discord_emoji_favorites: JSON.parse(
          GM_getValue("discord_emoji_favorites", "[]"),
        ),
        discord_gif_favorites: JSON.parse(
          GM_getValue("discord_gif_favorites", "[]"),
        ),
        discord_sticker_favorites: JSON.parse(
          GM_getValue("discord_sticker_favorites", "[]"),
        ),
        discord_emoji_collections: JSON.parse(
          GM_getValue("discord_emoji_collections", "{}"),
        ),
        discord_gif_collections: JSON.parse(
          GM_getValue("discord_gif_collections", "{}"),
        ),
        discord_sticker_collections: JSON.parse(
          GM_getValue("discord_sticker_collections", "{}"),
        ),
        discord_emoji_native_mode: GM_getValue("discord_emoji_native_mode", true),
      };

      const moduleDData = GM_getValue("discord_wormholes_v2", null);

      const wormholePrefs = {
        wh_api_mode:        localStorage.getItem("wh_api_mode"),
        wh_dock_position:   localStorage.getItem("wh_dock_position"),
        wh_send_autoclose:  localStorage.getItem("wh_send_autoclose"),
        wh_send_goto:       localStorage.getItem("wh_send_goto"),
        wh_send_show_toast: localStorage.getItem("wh_send_show_toast"),
        wormhole_focus_mode: localStorage.getItem("wormhole_focus_mode"),
        wormhole_focus_size: localStorage.getItem("wormhole_focus_size"),
      };

      const headerModPrefs = {
        antiHijack:   localStorage.getItem("discord_header_mod_def_antiHijack"),
        concealName:  localStorage.getItem("discord_header_mod_def_concealName"),
      };

      const moduleToggles = {
        mod_forwarding: localStorage.getItem("mod_forwarding"),
        mod_message:    localStorage.getItem("mod_message"),
        mod_emoji:      localStorage.getItem("mod_emoji"),
        mod_header:     localStorage.getItem("mod_header"),
        mod_wormhole:   localStorage.getItem("mod_wormhole"),
      };

      const forwardingPref = GM_getValue("discord_forward_pref", true);

      const data = {
        ver: "EX2",
        config: configData,
        forwardingData: forwardingData,
        forwardingPref: forwardingPref,
        ...moduleCData,
        wormholes: moduleDData,
        wormholePrefs: wormholePrefs,
        headerModPrefs: headerModPrefs,
        moduleToggles: moduleToggles,
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

        if (data.config) {
          const c = data.config;
          if (c.lang)        localStorage.setItem("copyMenuLanguage", c.lang);
          if (c.triggerMode) localStorage.setItem("copyTriggerMode", c.triggerMode);
          if (c.menuStyle)   localStorage.setItem("copyMenuStyle", c.menuStyle);
          if (c.swapLogic != null)   localStorage.setItem("copySwapLogic", c.swapLogic);
          if (c.appendSpace != null) localStorage.setItem("copyAppendSpace", c.appendSpace);
          if (c.appendNewLine != null) localStorage.setItem("copyAppendNewLine", c.appendNewLine);
          if (c.linkText !== undefined) localStorage.setItem("copyLinkText", c.linkText);
          if (Array.isArray(c.symbols)) {
            localStorage.setItem("copySymbols", JSON.stringify(c.symbols));
            config.symbols = c.symbols;
          }
        }

        if (data.forwardingData) {
          GM_setValue("discord_forward_v8", data.forwardingData);
        }
        if (data.forwardingPref != null) {
          GM_setValue("discord_forward_pref", data.forwardingPref);
        }

        if (data.discord_emoji_favorites)
          GM_setValue(
            "discord_emoji_favorites",
            JSON.stringify(data.discord_emoji_favorites),
          );
        if (data.discord_gif_favorites)
          GM_setValue(
            "discord_gif_favorites",
            JSON.stringify(data.discord_gif_favorites),
          );
        if (data.discord_sticker_favorites)
          GM_setValue(
            "discord_sticker_favorites",
            JSON.stringify(data.discord_sticker_favorites),
          );
        if (data.discord_emoji_collections)
          GM_setValue(
            "discord_emoji_collections",
            JSON.stringify(data.discord_emoji_collections),
          );
        if (data.discord_gif_collections)
          GM_setValue(
            "discord_gif_collections",
            JSON.stringify(data.discord_gif_collections),
          );
        if (data.discord_sticker_collections)
          GM_setValue(
            "discord_sticker_collections",
            JSON.stringify(data.discord_sticker_collections),
          );
        if (data.discord_emoji_native_mode != null)
          GM_setValue("discord_emoji_native_mode", data.discord_emoji_native_mode);

        if (data.wormholes) {
          if (data.wormholes.groups || data.wormholes.wormholes) {
            GM_setValue("discord_wormholes_v2", data.wormholes);
          }
        }

        if (data.wormholePrefs) {
          const wp = data.wormholePrefs;
          if (wp.wh_api_mode != null)        localStorage.setItem("wh_api_mode", wp.wh_api_mode);
          if (wp.wh_dock_position != null)   localStorage.setItem("wh_dock_position", wp.wh_dock_position);
          if (wp.wh_send_autoclose != null)  localStorage.setItem("wh_send_autoclose", wp.wh_send_autoclose);
          if (wp.wh_send_goto != null)       localStorage.setItem("wh_send_goto", wp.wh_send_goto);
          if (wp.wh_send_show_toast != null) localStorage.setItem("wh_send_show_toast", wp.wh_send_show_toast);
          if (wp.wormhole_focus_mode != null) localStorage.setItem("wormhole_focus_mode", wp.wormhole_focus_mode);
          if (wp.wormhole_focus_size != null) localStorage.setItem("wormhole_focus_size", wp.wormhole_focus_size);
        }

        if (data.headerModPrefs) {
          const hp = data.headerModPrefs;
          if (hp.antiHijack != null)  localStorage.setItem("discord_header_mod_def_antiHijack", hp.antiHijack);
          if (hp.concealName != null) localStorage.setItem("discord_header_mod_def_concealName", hp.concealName);
        }

        if (data.moduleToggles) {
          const mt = data.moduleToggles;
          const modKeys = ["mod_forwarding", "mod_message", "mod_emoji", "mod_header", "mod_wormhole"];
          modKeys.forEach(k => {
            if (mt[k] != null) localStorage.setItem(k, mt[k]);
          });
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
    function showToast(message, duration = 2000) {
      let toast = document.querySelector(".msg-copy-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.className = "msg-copy-toast";
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), duration);
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

    function generateSmartFilename(container, mediaUrl, index = 0) {
      try {
        DEBUG && console.log("[Filename] Generating filename for:", mediaUrl);
        DEBUG && console.log("[Filename] Container:", container);

        const embedSelectors = [
          ".embedAuthorName__623de",
          'a[href*="x.com/"][href*="/status/"]',
          'a[href*="twitter.com/"][href*="/status/"]',
          'a.embedLink__623de[href*="x.com"]',
          'a.embedLink__623de[href*="twitter.com"]',
          ".embedTitleLink__623de",
        ];

        let embedAuthor = null;
        for (const selector of embedSelectors) {
          embedAuthor = container.querySelector(selector);
          if (embedAuthor) {
            console.log(
              "[Filename] Found embed author with selector:",
              selector,
              embedAuthor,
            );
            break;
          }
        }

        if (embedAuthor) {
          let username = "";
          const authorText = embedAuthor.textContent || "";
          DEBUG && console.log("[Filename] Author text:", authorText);

          const usernameMatch = authorText.match(/@([a-zA-Z0-9_]+)/);
          if (usernameMatch) {
            username = usernameMatch[1];
          } else {
            const href =
              embedAuthor.href || embedAuthor.closest("a")?.href || "";
            const urlMatch = href.match(/(?:x\.com|twitter\.com)\/([^\/\?]+)/);
            if (urlMatch) username = urlMatch[1];
          }

          DEBUG && console.log("[Filename] Extracted username:", username);

          let tweetId = "";

          const authorHref = embedAuthor.href || "";
          let tweetIdMatch = authorHref.match(/status\/(\d+)/);
          if (tweetIdMatch) {
            tweetId = tweetIdMatch[1];
          } else {
            const statusLink = container.querySelector('a[href*="/status/"]');
            if (statusLink) {
              const statusHref = statusLink.href || "";
              DEBUG && console.log("[Filename] Found status link:", statusHref);
              tweetIdMatch = statusHref.match(/status\/(\d+)/);
              if (tweetIdMatch) tweetId = tweetIdMatch[1];
            }
          }

          DEBUG && console.log("[Filename] Tweet ID:", tweetId);

          const embedDescSelectors = [
            ".embedDescription__623de",
            'div[class*="embedDescription"]',
            ".embed__623de .markup__75297",
            ".embedTitle__623de",
          ];

          let contentSnippet = "";
          for (const selector of embedDescSelectors) {
            const embedDesc = container.querySelector(selector);
            if (embedDesc) {
              let text = embedDesc.textContent.trim();
              DEBUG && console.log("[Filename] Found description:", text);

              text = text
                .replace(/[\n\r\t]/g, " ")
                .replace(/💬\d+|🔁\d+|❤️\d+/g, "")
                .replace(/[•·]/g, "")
                .replace(/\s+/g, " ")
                .trim();

              text = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, "");

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
                console.log(
                  "[Filename] Content snippet set to:",
                  contentSnippet,
                );
                break;
              }
            }
          }

          DEBUG && console.log("[Filename] Final content snippet:", contentSnippet);

          let mediaId = "";
          try {
            const mediaUrlObj = new URL(mediaUrl);
            const pathParts = mediaUrlObj.pathname.split("/");
            const lastPart = pathParts[pathParts.length - 1];
            mediaId = lastPart.split("?")[0].split(":")[0].split("%")[0];
          } catch (e) {}

          DEBUG && console.log("[Filename] Media ID:", mediaId);

          let dateStr = "";
          if (tweetId) {
            try {
              const timestamp = (BigInt(tweetId) >> 22n) + 1288834974657n;
              const date = new Date(Number(timestamp));

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

          if (username && dateStr && contentSnippet) {
            const ext =
              mediaUrl.match(
                /\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i,
              )?.[1] || "jpg";
            const filename = `@${username}_${dateStr}_${contentSnippet}_${index + 1}.${ext}`;
            console.log(
              "[Filename] Using full format (username+date+content):",
              filename,
            );
            return filename;
          }

          if (username && dateStr) {
            const ext =
              mediaUrl.match(
                /\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i,
              )?.[1] || "jpg";
            const filename = `@${username}_${dateStr}_${index + 1}.${ext}`;
            DEBUG && console.log("[Filename] Using username+date:", filename);
            return filename;
          }

          if (username && tweetId && contentSnippet) {
            const ext =
              mediaUrl.match(
                /\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i,
              )?.[1] || "jpg";
            const filename = `@${username}_${tweetId}_${contentSnippet}_${index + 1}.${ext}`;
            DEBUG && console.log("[Filename] Using username+tweetId+content:", filename);
            return filename;
          }

          if (username && tweetId) {
            const ext =
              mediaUrl.match(
                /\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i,
              )?.[1] || "jpg";
            const filename = `@${username}_${tweetId}_${index + 1}.${ext}`;
            DEBUG && console.log("[Filename] Using username+tweetId:", filename);
            return filename;
          }

          if (username && contentSnippet) {
            const ext =
              mediaUrl.match(
                /\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i,
              )?.[1] || "jpg";
            const filename = `@${username}_${contentSnippet}_${index + 1}.${ext}`;
            DEBUG && console.log("[Filename] Using username+content:", filename);
            return filename;
          }

          if (mediaId && mediaId.length > 5 && mediaId.includes(".")) {
            DEBUG && console.log("[Filename] Using media ID:", mediaId);
            return mediaId;
          }

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

      const externalLink = msg.querySelector(
        'a[href*="//"]:not([href*="discord.com"]):not([href*="discordapp.net"])',
      );
      if (externalLink && isLikelyMediaFile(externalLink.href)) {
        return externalLink.href;
      }

      const proxyImg = msg.querySelector('img[src*="/external/"]');
      if (proxyImg) {
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

        try {
          const proxyUrl = proxyImg.src;
          const match = proxyUrl.match(/\/external\/([^?]+)/);
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

        return proxyImg.src;
      }

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
      if (/\.(mp4|webm|mov|mkv|jpg|jpeg|png|gif|webp)([?#].*)?$/i.test(url))
        return true;
      if (
        url.includes("video.twimg.com") ||
        url.includes("cdn.discordapp.com") ||
        url.includes("media.discordapp.net") ||
        url.includes("i.imgur.com")
      )
        return true;
      return false;
    }

    function resolveRealFileUrl(linkElement) {
      let href = linkElement.href;

      if (href.includes("cdn.discordapp.com/attachments/")) return href;

      if (linkElement.dataset.safeSrc) {
        const safeSrc = linkElement.dataset.safeSrc;

        if (safeSrc.includes("/external/")) {
          try {
            const match = safeSrc.match(/\/external\/([^?]+)/);
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
                const sourceUrl = `${protocol}://${urlPath}`;
                return sourceUrl.replace(/%3A/g, ":");
              }

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

        if (safeSrc.startsWith("http")) return safeSrc;
      }

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

      if (isLikelyMediaFile(href)) return href;

      return href;
    }

    class DownloadManager {
      constructor() {
        this.maxRetries = 2;
        this.retryDelay = 1000;
        this.activeDownloads = new Map();

        this.maxConcurrent = 3;
        this.queue = [];
        this.stats = {
          success: 0,
          failed: 0,
          total: 0,
        };
      }

      download(url, filename, fallbackUrl = null, retryCount = 0) {
        const downloadKey = `${url}_${filename}`;
        if (this.activeDownloads.has(downloadKey)) {
          console.warn(`[Download] ⚠ Already downloading: ${filename}`);
          return Promise.resolve({ success: false, reason: "duplicate" });
        }

        if (this.activeDownloads.size >= this.maxConcurrent) {
          console.log(
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
            timeout: 30000,

            onload: (response) => {
              this.activeDownloads.delete(downloadKey);

              if (response.status === 200) {
                this._saveBlob(response.response, filename);
                this.stats.success++;
                resolve({ success: true, filename });
                this._processQueue();
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

      _handleFailure(url, filename, fallbackUrl, retryCount, reason, resolve) {
        console.warn(`[Download] ❌ Failed (${reason}): ${filename}`);

        if (retryCount < this.maxRetries) {
          console.log(
            `[Download] 🔄 Retry ${retryCount + 1}/${this.maxRetries} after ${this.retryDelay}ms`,
          );
          setTimeout(() => {
            this.download(url, filename, fallbackUrl, retryCount + 1).then(
              resolve,
            );
          }, this.retryDelay);
          return;
        }

        if (fallbackUrl && fallbackUrl !== url) {
          console.log(`[Download] 🔀 Switching to fallback: ${fallbackUrl}`);
          this.download(fallbackUrl, `fallback_${filename}`, null, 0).then(
            resolve,
          );
          return;
        }

        this.stats.failed++;

        const corsRestrictedHosts = [
          "encrypted-tbn0.gstatic.com",
          "lh3.googleusercontent.com",
          "lh4.googleusercontent.com",
          "pbs.twimg.com",
        ];
        let isCorsRestricted = false;
        try {
          const hostname = new URL(url).hostname;
          isCorsRestricted = corsRestrictedHosts.some((h) => hostname.endsWith(h));
        } catch (_) {}

        if (isCorsRestricted) {
          showToast(t("download_cors_fail"));
        } else {
          showToast(`❌ ${t("download_fail")}: ${filename}`);
        }
        resolve({ success: false, reason });
        this._processQueue();
      }

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

          setTimeout(() => URL.revokeObjectURL(url), 10000);

          console.log(`[Download] ✅ Success: ${filename}`);
        } catch (error) {
          console.error(`[Download] 💾 Save failed:`, error);
          showToast(`❌ ${t("download_fail")}: ${filename}`);
        }
      }

      _processQueue() {
        if (this.queue.length === 0) {
          if (this.stats.total > 0) {
            console.log(
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

      batchDownload(urlList, baseFilename = "discord_img") {
        console.log(
          `[Download] 📦 Starting batch download: ${urlList.length} files`,
        );

        urlList.forEach((urlData, index) => {
          const { url, fallback, filename } = urlData;
          const finalName =
            filename || `${baseFilename}_${Date.now()}_${index}.jpg`;

          setTimeout(() => {
            this.download(url, finalName, fallback);
          }, index * 200);
        });
      }

      resetStats() {
        this.stats = { success: 0, failed: 0, total: 0 };
      }

      getStatus() {
        return {
          active: this.activeDownloads.size,
          queued: this.queue.length,
          stats: { ...this.stats },
        };
      }
    }

    const downloadManager = new DownloadManager();

    function downloadFile(url, filename, fallbackUrl = null) {
      return downloadManager.download(url, filename, fallbackUrl);
    }

    function getMessageText(msg) {
      try {
        const replyBlock = msg.querySelector('[class*="repliedMessage"]');

        let textEl = null;
        const allContentEls = msg.querySelectorAll('[id^="message-content-"]');
        for (const el of allContentEls) {
          if (!replyBlock || !replyBlock.contains(el)) {
            textEl = el;
            break;
          }
        }
        if (!textEl) {
          textEl =
            msg.querySelector('[class*="markup-"]:not([class*="repliedMessage"] [class*="markup-"])') ||
            msg.querySelector('[class*="messageContent"]:not([class*="repliedMessage"] [class*="messageContent"])');
        }

        let mainText = "";
        if (textEl) {
          const clone = textEl.cloneNode(true);
          clone.querySelectorAll(
            'span[class*="edited"], span[class*="timestamp"], time, [class*="spoilerWarning"], button',
          ).forEach((el) => el.remove());
          clone.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
            el.removeAttribute("aria-hidden");
            el.style.display = "inline";
          });
          mainText = clone.innerText.trim();
        }

        if (!mainText) {
          const isForwarded = msg.querySelector('[class*="headerContainer__"]') !== null;
          if (isForwarded) {
            const allContentEls2 = Array.from(msg.querySelectorAll('[id^="message-content-"]'));
            const forwardedTexts = allContentEls2.slice(1).map((el) => {
              const clone = el.cloneNode(true);
              clone.querySelectorAll(
                'span[class*="edited"], span[class*="timestamp"], time, [class*="spoilerWarning"], button',
              ).forEach((n) => n.remove());
              clone.querySelectorAll("a[href]").forEach((a) => {
                const href = a.getAttribute("href");
                if (href && href.startsWith("http") && !clone.innerText.includes(href)) {
                  a.insertAdjacentText("afterend", " " + href);
                }
              });
              return clone.innerText.trim();
            }).filter(Boolean);
            mainText = forwardedTexts.join("\n");
          }
        }

        if (replyBlock) {
          const replyContentEl = replyBlock.querySelector('[id^="message-content-"], [class*="repliedTextContent"]');
          if (replyContentEl) {
            const replyClone = replyContentEl.cloneNode(true);
            replyClone.querySelectorAll('span[class*="edited"], time, button').forEach((el) => el.remove());
            const replyText = replyClone.innerText.trim();
            const replyAuthor = replyBlock.querySelector('[class*="username"]')?.innerText?.trim() || "";
            if (replyText && replyText !== "無法載入訊息") {
              const prefix = replyAuthor ? `> @${replyAuthor}: ${replyText}` : `> ${replyText}`;
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

      submenu.addEventListener("mouseenter", cancelCloseGlobalMenu);
      submenu.addEventListener("mouseleave", () => {
        submenu.remove();
        scheduleCloseGlobalMenu();
      });
      return submenu;
    }

    function showModuleSettingsPanel(anchorEl) {
      const existing = document.getElementById("mod-settings-panel");
      if (existing) { existing.remove(); return; }

      const lang = getConfig().lang || navigator.language || "en-US";
      const getLang = (labels) => labels[lang] || labels["zh-TW"] || labels["en-US"];

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

      const title = document.createElement("div");
      title.style.cssText = "padding: 0 14px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #72767d;";
      title.textContent = { "zh-TW": "功能模組開關", "zh-CN": "功能模块开关", "ja": "モジュール設定", "ko": "모듈 설정" }[lang] || "Module Settings";
      panel.appendChild(title);

      const sep = document.createElement("div");
      sep.style.cssText = "height: 1px; background: rgba(255,255,255,0.07); margin: 0 0 6px;";
      panel.appendChild(sep);

      MODULE_DEFS.forEach(mod => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding: 6px 14px; cursor:pointer; border-radius:4px; margin: 0 4px;";
        row.onmouseenter = () => row.style.background = "rgba(255,255,255,0.06)";
        row.onmouseleave = () => row.style.background = "";

        const label = document.createElement("span");
        label.style.cssText = "display:flex; align-items:center; gap:7px;";
        label.innerHTML = `<span style="font-size:15px;">${mod.icon}</span><span>${getLang(mod.label)}</span>`;

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
            warnTitle.style.cssText = "font-size:15px; font-weight:700; margin-bottom:12px; color:#fff;";
            warnTitle.textContent = t("mod_msg_warn_title");
            const warnBody = document.createElement("div");
            warnBody.style.cssText = "white-space:pre-line; color:#b9bbbe; margin-bottom:18px;";
            warnBody.textContent = t("mod_msg_warn_body");
            const btnRow = document.createElement("div");
            btnRow.style.cssText = "display:flex; gap:10px; justify-content:flex-end;";
            const cancelBtn = document.createElement("button");
            cancelBtn.textContent = t("mod_msg_warn_cancel");
            cancelBtn.style.cssText = "padding:7px 16px; border-radius:5px; background:#4f545c; color:#fff; border:none; cursor:pointer; font-size:13px;";
            cancelBtn.onclick = () => dlg.remove();
            const confirmBtn = document.createElement("button");
            confirmBtn.textContent = t("mod_msg_warn_confirm");
            confirmBtn.style.cssText = "padding:7px 16px; border-radius:5px; background:#ed4245; color:#fff; border:none; cursor:pointer; font-size:13px;";
            confirmBtn.onclick = () => {
              dlg.remove();
              setModEnabled(mod.storageKey, false);
              updateToggle(false);
              const hint = document.createElement("div");
              hint.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#23272a;color:#dcddde;padding:8px 16px;border-radius:6px;font-size:12px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.4);pointer-events:none;";
              hint.textContent = mod.icon + " " + getLang(mod.label) + " — " + t("mod_msg_warn_confirm") + " (重新整頁生效)";
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
            dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.remove(); });
            return;
          }

          setModEnabled(mod.storageKey, next);
          updateToggle(next);

          const hint = document.createElement("div");
          hint.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #23272a; color: #dcddde;
            padding: 8px 16px; border-radius: 6px; font-size: 12px;
            z-index: 999999; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            pointer-events: none;
          `;
          const actionLabel = next
            ? ({ "zh-TW": "已啟用", "zh-CN": "已启用", "ja": "有効", "ko": "활성화됨" }[lang] || "Enabled")
            : ({ "zh-TW": "已停用", "zh-CN": "已停用", "ja": "無効", "ko": "비활성화됨" }[lang] || "Disabled");
          hint.textContent = `${mod.icon} ${getLang(mod.label)} — ${actionLabel}`;
          document.body.appendChild(hint);
          setTimeout(() => hint.remove(), 2000);
        };

        row.appendChild(label);
        row.appendChild(toggle);
        panel.appendChild(row);
      });

      const sep2 = document.createElement("div");
      sep2.style.cssText = "height: 1px; background: rgba(255,255,255,0.07); margin: 8px 0 4px;";
      panel.appendChild(sep2);

      const manualBtn = document.createElement("div");
      manualBtn.style.cssText = "padding: 6px 14px; cursor:pointer; color:#72767d; font-size:12px; display:flex; align-items:center; gap:6px; border-radius:4px; margin: 0 4px;";
      manualBtn.innerHTML = `<span>📖</span><span>${{ "zh-TW": "查看使用說明", "zh-CN": "查看使用说明", "ja": "マニュアルを見る", "ko": "사용 설명서 보기" }[lang] || "View Manual"}</span>`;
      manualBtn.onmouseenter = () => manualBtn.style.background = "rgba(255,255,255,0.06)";
      manualBtn.onmouseleave = () => manualBtn.style.background = "";
      manualBtn.onclick = () => { panel.remove(); showManualModal(); };
      panel.appendChild(manualBtn);

      document.body.appendChild(panel);
      const rect = anchorEl.getBoundingClientRect();
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;

      let left = rect.right - pw - 4;
      if (left < 6) left = rect.right + 8;
      if (left + pw > window.innerWidth - 6) left = window.innerWidth - pw - 6;

      let top = rect.top;
      if (top + ph > window.innerHeight - 10) top = window.innerHeight - ph - 10;
      if (top < 6) top = 6;

      panel.style.top = top + "px";
      panel.style.left = left + "px";

      const closeHandler = (ev) => {
        if (!panel.contains(ev.target) && ev.target !== anchorEl) {
          panel.remove();
          document.removeEventListener("mousedown", closeHandler, true);
        }
      };
      setTimeout(() => document.addEventListener("mousedown", closeHandler, true), 50);
    }

    function showManualModal() {
      const existing = document.getElementById("mod-manual-modal");
      if (existing) { existing.remove(); return; }

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
      head.style.cssText = "padding: 14px 18px 10px; font-size: 15px; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center;";
      head.innerHTML = `<span>📖 ${t("tip_manual")}</span><span style="cursor:pointer;font-size:18px;color:#72767d;" id="mod-manual-close">✕</span>`;

      const body = document.createElement("div");
      body.style.cssText = "overflow-y: auto; padding: 16px 18px; flex: 1;";
      body.innerHTML = t("manual_content_sections");

      box.appendChild(head);
      box.appendChild(body);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      const close = () => overlay.remove();
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
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

      dropdown.addEventListener("mouseenter", cancelCloseGlobalMenu);
      dropdown.addEventListener("mouseleave", scheduleCloseGlobalMenu);

      const header = document.createElement("div");
      header.className = "msg-copy-header";
      const leftSpan = document.createElement("span");
      leftSpan.className = "msg-copy-header-left";
      leftSpan.innerText = isSymbolsView ? t("view_symbols") : t("view_main");
      const rightContainer = document.createElement("div");
      rightContainer.className = "msg-copy-header-right";

      const createHeaderIcon = (icon, title, activeCondition, onClick) => {
        const el = document.createElement("span");
        el.className = `msg-copy-header-icon ${activeCondition ? "active" : ""}`;
        el.innerText = icon;
        el.title = title;
        el.onclick = (e) => {
          e.stopPropagation();
          cancelCloseGlobalMenu();
          onClick();
          refreshCallback(isSymbolsView);
        };
        return el;
      };

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
      rightContainer.appendChild(
        createHeaderIcon("⇄", t("tip_logic"), config.swapLogic, () =>
          localStorage.setItem("copySwapLogic", !config.swapLogic),
        ),
      );
      rightContainer.appendChild(
        createHeaderIcon("␣", t("tip_space"), config.appendSpace, () =>
          localStorage.setItem("copyAppendSpace", !config.appendSpace),
        ),
      );
      rightContainer.appendChild(
        createHeaderIcon("↵", t("tip_newline"), config.appendNewLine, () =>
          localStorage.setItem("copyAppendNewLine", !config.appendNewLine),
        ),
      );
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
      const langIcon = document.createElement("span");
      langIcon.className = "msg-copy-header-icon";
      langIcon.innerText = "🌐";
      langIcon.title = t("tip_lang");
      langIcon.onclick = (e) => {
        e.stopPropagation();
        cancelCloseGlobalMenu();
        showLanguageSelector();
      };
      rightContainer.appendChild(langIcon);
      const gearIcon = document.createElement("span");
      gearIcon.className = "msg-copy-header-icon";
      gearIcon.innerText = "⚙️";
      gearIcon.title = t("tip_manual");
      gearIcon.onclick = (e) => {
        e.stopPropagation();
        cancelCloseGlobalMenu();
        showModuleSettingsPanel(gearIcon);
      };
      rightContainer.appendChild(gearIcon);

      header.appendChild(leftSpan);
      header.appendChild(rightContainer);
      dropdown.appendChild(header);

      if (isSymbolsView) {
        const PAGE_SIZE = 12;
        const totalPages = Math.max(1, Math.ceil(config.symbols.length / PAGE_SIZE));
        const currentPage = Math.min(symbolsPage, totalPages - 1);
        const pageSymbols = config.symbols.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

        if (!window._symDragState) {
          window._symDragState = { srcIndex: -1, hoverTimer: null };
        }
        const DS = window._symDragState;
        const clearDropTimer = () => {
          if (DS.hoverTimer) { clearTimeout(DS.hoverTimer); DS.hoverTimer = null; }
        };

        if (config.symbols.length) {
          pageSymbols.forEach((s, localIdx) => {
            const absIdx = currentPage * PAGE_SIZE + localIdx;

            const row = document.createElement("div");
            row.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:0 12px;";
            row.dataset.absIdx = absIdx;

            const handle = document.createElement("span");
            handle.textContent = "⠿";
            handle.style.cssText = "color:#555; margin-right:6px; font-size:14px; cursor:grab; user-select:none; flex-shrink:0;";
            handle.draggable = true;

            handle.addEventListener("dragstart", (e) => {
              DS.srcIndex = absIdx;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(absIdx));
              handle.style.color = "#7289da";
              setTimeout(() => { row.style.opacity = "0.4"; }, 0);
            });
            handle.addEventListener("dragend", () => {
              row.style.opacity = "1";
              handle.style.color = "#555";
              clearDropTimer();
              dropdown.querySelectorAll("[data-abs-idx]").forEach(el => el.style.outline = "");
              DS.srcIndex = -1;
            });

            row.addEventListener("dragover", (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              dropdown.querySelectorAll("[data-abs-idx]").forEach(el => el.style.outline = "");
              row.style.outline = "1px dashed #7289da";
            });
            row.addEventListener("dragleave", () => { row.style.outline = ""; });
            row.addEventListener("drop", (e) => {
              e.preventDefault();
              e.stopPropagation();
              row.style.outline = "";
              const src = DS.srcIndex;
              const tgt = parseInt(row.dataset.absIdx, 10);
              if (src === -1 || src === tgt) return;

              const arr = [...config.symbols];
              const [moved] = arr.splice(src, 1);
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
            insertBtn.style.cssText = "flex:1; white-space:nowrap; text-align:left; padding:6px 0;";
            bindButtonAction(insertBtn, s, s);

            const delBtn = document.createElement("button");
            delBtn.textContent = t("delete_symbol");
            delBtn.style.cssText = "margin-left:8px; width:auto; color:#f88;";
            delBtn.onclick = (e) => {
              e.stopPropagation();
              config.symbols = config.symbols.filter((item) => item !== s);
              saveSymbols();
              const newTotal = Math.max(1, Math.ceil(config.symbols.length / PAGE_SIZE));
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

        if (totalPages > 1) {
          const pageBar = document.createElement("div");
          pageBar.style.cssText = "display:flex; align-items:center; justify-content:center; gap:6px; padding:4px 12px;";

          const makePagBtn = (label, targetPage, disabled) => {
            const btn = document.createElement("button");
            btn.textContent = label;
            btn.style.cssText = `width:28px; padding:2px 0; opacity:${disabled ? "0.3" : "1"};`;
            btn.disabled = disabled;
            btn.onclick = (e) => { e.stopPropagation(); refreshCallback(true, targetPage); };

            btn.addEventListener("dragover", (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (!DS.hoverTimer && !disabled) {
                DS.hoverTimer = setTimeout(() => {
                  DS.hoverTimer = null;
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
          pageLabel.style.cssText = "font-size:11px; color:#aaa; min-width:40px; text-align:center;";
          const nextBtn = makePagBtn("▶", currentPage + 1, currentPage === totalPages - 1);

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
            config.symbols = [...config.symbols, val];
            const newTotal = Math.max(1, Math.ceil(config.symbols.length / PAGE_SIZE));
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
            const newTotal = Math.max(1, Math.ceil(config.symbols.length / PAGE_SIZE));
            const newPage = Math.min(currentPage, newTotal - 1);
            refreshCallback(true, newPage);
            showToast(t("delete_confirm", { s: val }));
          }
        };
        manageDiv.appendChild(addBtn);
        manageDiv.appendChild(removeBtn);
        dropdown.appendChild(manageDiv);
      } else {
        const sections = { copy: [], convert: [], download: [], system: [] };
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

            ["mousedown", "mouseup", "click"].forEach((evt) => {
              editBtn.addEventListener(evt, (e) => e.stopPropagation());
            });
            editBtn.onclick = (e) => {
              e.stopPropagation();
              cancelCloseGlobalMenu();
              const newVal = prompt(
                t("enter_link_text"),
                config.linkText,
              );
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

        const attachmentLinks = Array.from(
          container.querySelectorAll('a[class*="originalLink"]'),
        ).filter(link => {
          const href = link.href || "";
          return (
            href.includes("cdn.discordapp.com/attachments/") ||
            href.includes("media.discordapp.net/attachments/") ||
            isLikelyMediaFile(href)
          );
        });

        const allVideoElements = Array.from(
          container.querySelectorAll("video"),
        );

        const markdownMediaLinks = (() => {
          const allAnchors = Array.from(container.querySelectorAll('a[href]'));
          const existingHrefs = new Set([
            ...attachmentLinks.map(l => l.href),
            ...allVideoElements.map(v => v.src || v.querySelector("source")?.src || ""),
          ]);
          return allAnchors.filter(a => {
            const href = a.href;
            if (!href || existingHrefs.has(href)) return false;
            return isLikelyMediaFile(href);
          });
        })();

        const resolveUrlForComparison = (url) => {
          if (!url) return "";
          try {
            if (url.includes("/external/")) {
              const match = url.match(/\/external\/[^/]+\/(https?)\/(.+)/);
              if (match) {
                const resolved = `${match[1]}://${match[2]}`;
                return resolved.split("?")[0];
              }
            }
            return new URL(url).pathname;
          } catch {
            return url.split("?")[0];
          }
        };
        const markdownMediaHrefs = new Set(markdownMediaLinks.map(a => resolveUrlForComparison(a.href)));
        const embedVideos = allVideoElements.filter((video) => {
          const videoSrc = video.src || video.querySelector("source")?.src;
          if (!videoSrc) return false;
          const videoKey = resolveUrlForComparison(videoSrc);

          if (attachmentLinks.some((link) => resolveUrlForComparison(link.href) === videoKey)) return false;

          if (markdownMediaHrefs.has(videoKey)) return false;

          return true;
        });

        const totalDownloadCount = attachmentLinks.length + embedVideos.length + markdownMediaLinks.length;

        if (totalDownloadCount > 0) {
          const dlBtn = document.createElement("button");
          dlBtn.textContent =
            totalDownloadCount > 1
              ? `${t("download_images")} (${totalDownloadCount})`
              : t("download_images");

          dlBtn.onclick = (e) => {
            showToast(t("download_start"));

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
              let sourceEl = findMediaElementByUrl(container, rawUrl);
              if (!sourceEl) sourceEl = visualMedia[index] || visualMedia[0];

              if (sourceEl) {
                setTimeout(
                  () => animateFlyToTopRight(sourceEl, e.clientX, e.clientY),
                  index * 75,
                );
              }

              const filename = generateSmartFilename(container, rawUrl, index);

              setTimeout(() => {
                downloadFile(rawUrl, filename);
              }, index * 200);
            });

            embedVideos.forEach((video, i) => {
              let rawUrl = video.src || video.querySelector("source")?.src;

              setTimeout(
                () => animateFlyToTopRight(video, e.clientX, e.clientY),
                (attachmentLinks.length + i) * 75,
              );

              let filename = generateSmartFilename(
                container,
                rawUrl,
                attachmentLinks.length + i,
              );

              if (filename && !filename.match(/\.(mp4|webm|mov|mkv)$/i)) {
                filename = filename.replace(/\.\w+$/, "") + ".mp4";
              }

              setTimeout(
                () => {
                  if (rawUrl) downloadFile(rawUrl, filename);
                },
                (attachmentLinks.length + i) * 200,
              );
            });

            markdownMediaLinks.forEach((link, i) => {
              const rawUrl = link.href;
              const baseOffset = attachmentLinks.length + embedVideos.length;

              setTimeout(
                () => animateFlyToTopRight(link, e.clientX, e.clientY),
                (baseOffset + i) * 75,
              );

              let filename = generateSmartFilename(container, rawUrl, baseOffset + i);
              if (filename && !/\.(mp4|webm|mov|mkv|jpg|jpeg|png|gif|webp)$/i.test(filename)) {
                const extMatch = rawUrl.match(/\.(mp4|webm|mov|mkv|jpg|jpeg|png|gif|webp)([?#]|$)/i);
                filename = filename.replace(/\.\w+$/, "") + (extMatch ? "." + extMatch[1] : ".mp4");
              }

              setTimeout(
                () => { if (rawUrl) downloadFile(rawUrl, filename); },
                (baseOffset + i) * 200,
              );
            });

            closeGlobalMenu();
          };

          dlBtn.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const mediaUrls = [];

            const extractSourceUrl = (proxyUrl) => {
              try {
                const cleanUrl = proxyUrl.split("?")[0];

                const match = cleanUrl.match(/\/external\/([^?]+)/);
                if (!match) return proxyUrl;

                const encodedPath = match[1];
                const decoded = decodeURIComponent(encodedPath);

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

                if (parts.length >= 3 && parts[0].length >= 40) {
                  const remainingParts = parts.slice(1);
                  const protoIdx2 = remainingParts.findIndex(
                    (p) => p === "http" || p === "https",
                  );

                  if (protoIdx2 !== -1) {
                    const protocol = remainingParts[protoIdx2];
                    const urlPath = remainingParts
                      .slice(protoIdx2 + 1)
                      .join("/");
                    return `${protocol}://${urlPath}`.replace(/%3A/g, ":");
                  }

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

                return cleanUrl;
              } catch (err) {
                console.warn("[extractSourceUrl] Failed:", err);
                return proxyUrl.split("?")[0];
              }
            };

            attachmentLinks.forEach((link) => {
              const href = link.href;
              if (href.includes("/external/")) {
                mediaUrls.push(extractSourceUrl(href));
              } else {
                const rawUrl = resolveRealFileUrl(link);
                if (rawUrl) mediaUrls.push(rawUrl);
              }
            });

            embedVideos.forEach((video) => {
              const rawUrl = video.src || video.querySelector("source")?.src;
              if (rawUrl) {
                if (rawUrl.includes("/external/")) {
                  mediaUrls.push(extractSourceUrl(rawUrl));
                } else {
                  mediaUrls.push(rawUrl);
                }
              }
            });

            markdownMediaLinks.forEach((link) => {
              const href = link.href;
              if (href) mediaUrls.push(href);
            });

            if (mediaUrls.length > 0) {
              const urlText = mediaUrls.join("\n");
              if (typeof GM_setClipboard === "function") {
                GM_setClipboard(urlText);
                showToast(`✅ 已複製 ${mediaUrls.length} 個媒體連結`);
              } else {
                navigator.clipboard
                  .writeText(urlText)
                  .then(() => {
                    showToast(`✅ 已複製 ${mediaUrls.length} 個媒體連結`);
                  })
                  .catch(() => {
                    showToast("❌ 複製失敗");
                  });
              }
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
          const linkPrefix = config.linkText || "";
          const displayPrefix = linkPrefix ? linkPrefix : "";

          const labelStyle =
            linkPrefix && linkPrefix !== "" ? `style="color:cyan"` : "";
          const displayLabel = linkPrefix ? linkPrefix : " ";
          const bracketed = links
            .map((url) => `[${linkPrefix}](${url})`)
            .join(" || ");

          const label = t("insert_format_link", {
            t: `<span ${labelStyle}>${displayLabel}</span>`,
          });
          const btn = document.createElement("button");
          btn.innerHTML = label;
          bindButtonAction(btn, bracketed, bracketed);

          const editBtn = document.createElement("span");
          editBtn.className = "msg-copy-edit-btn";
          editBtn.innerText = "✏️";
          ["mousedown", "mouseup", "click"].forEach((evt) => {
            editBtn.addEventListener(evt, (e) => e.stopPropagation());
          });
          editBtn.onclick = (e) => {
            e.stopPropagation();
            cancelCloseGlobalMenu();
            const newVal = prompt(
              t("enter_link_text"),
              config.linkText,
            );
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
            domains: ["instagram.com", "kkinstagram.com"],
            labels: {
              "instagram.com": "to_instagram",
              "kkinstagram.com": "to_kkinstagram",
            },
          },
          {
            type: "tiktok",
            domains: ["tiktok.com", "vxtiktok.com", "tnktok.com"],
            labels: {
              "tiktok.com": "to_tiktok",
              "vxtiktok.com": "to_vxtiktok",
              "tnktok.com": "to_tnktok",
            },
          },
          {
            type: "threads",
            domains: ["threads.com", "threads.net", "fixthreads.seria.moe"],
            labels: {
              "threads.com": "to_threads",
              "threads.net": "to_threads",
              "fixthreads.seria.moe": "to_fixthreads",
            },
          },
          {
            type: "facebook",
            domains: ["facebook.com", "facebed.com"],
            labels: {
              "facebook.com": "to_facebook",
              "facebed.com": "to_facebed",
            },
          },
        ];
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
            if (isBatch) {
              let primaryTarget = "";
              if (group.type === "twitter") primaryTarget = "vxtwitter.com";
              else if (group.type === "reddit") primaryTarget = "vxreddit.com";
              else if (group.type === "instagram")
                primaryTarget = "kkinstagram.com";
              else if (group.type === "tiktok") primaryTarget = "vxtiktok.com";
              else if (group.type === "threads")
                primaryTarget = "fixthreads.seria.moe";
              else if (group.type === "facebook")
                primaryTarget = "facebed.com";

              const allConverted = data
                .map((d) => `https://${primaryTarget}${d.path}`)
                .join("\n");
              addItem(
                "convert",
                t("convert_all", { n: data.length }) + ` ${primaryTarget}`,
                allConverted,
              );
            } else {
              group.domains.forEach((domain) => {
                if (domain !== data.host)
                  addItem(
                    "convert",
                    t(group.labels[domain]),
                    `https://${domain}${data.path}`,
                  );
              });
            }
          });
        });
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

        links.forEach((url) => {
          const shortsMatch = url.match(
            /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})([?&].*)?$/
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

        if (config.menuStyle === "group") {
          ["copy", "download", "convert", "system"].forEach((k) => {
            if (sections[k].length) {
              const groupEl = document.createElement("div");
              groupEl.className = "msg-copy-item-group";
              groupEl.innerText = t(`grp_${k}`);

              groupEl.addEventListener("mouseenter", () => {
                cancelCloseGlobalMenu();
                const rect = groupEl.getBoundingClientRect();
                showSubmenu(sections[k], rect, dropdown);
              });

              dropdown.appendChild(groupEl);
            }
          });
        } else {
          ["copy", "download", "convert", "system"].forEach((k) => {
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

    function attachToMessage(msg) {
      if (msg.dataset.copyAttached) return;

      const hasTextClass =
        msg.classList.toString().includes("messageContent") ||
        msg.querySelector('[class*="markup-"]') ||
        msg.querySelector('[id^="message-content-"]');

      const hasMediaTag = msg.querySelector("img, video");

      if (!hasTextClass && !hasMediaTag) return;

      msg.dataset.copyAttached = "true";
      msg.classList.add("msg-copy-container");

      if (getComputedStyle(msg).position === "static") {
        msg.style.position = "relative";
      }

      const btn = document.createElement("button");
      btn.className = "msg-copy-btn";
      btn.textContent = "⠿";

      let _isMenuRendered = false;

      const showMenu = () => {
        if (globalActiveDropdown) closeGlobalMenu();

        const text = getMessageText(msg);
        const mediaUrl = extractExternalMediaUrl(msg);

        if (!text && !mediaUrl) {
          return;
        }

        const dropdown = createDropdown(
          msg,
          text,
          mediaUrl,
          false,
          (newState) => renderMenuInternal(newState),
          (currentState, page) => renderMenuInternal(currentState, page),
          _symbolsPage,
        );

        document.body.appendChild(dropdown);
        globalActiveDropdown = dropdown;
        dropdown.style.display = "flex";

        const btnRect = btn.getBoundingClientRect();
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

      let _symbolsPage = (() => {
        try { return parseInt(localStorage.getItem("copySymbolsPage") || "0", 10) || 0; } catch(_) { return 0; }
      })();

      const renderMenuInternal = (isSymbols, page) => {
        if (typeof page === "number") {
          _symbolsPage = page;
          try { localStorage.setItem("copySymbolsPage", String(page)); } catch(_) {}
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
        const btnRect = btn.getBoundingClientRect();
        const dropdownRect = dropdown.getBoundingClientRect();
        let top = btnRect.bottom + window.scrollY;
        let left = btnRect.right - dropdownRect.width + window.scrollX;
        if (btnRect.bottom + dropdownRect.height > window.innerHeight)
          top = btnRect.top + window.scrollY - dropdownRect.height;
        if (left + dropdownRect.width > window.innerWidth)
          left = window.innerWidth - dropdownRect.width - 10;
        dropdown.style.top = `${top}px`;
        dropdown.style.left = `${left}px`;
      };

      const discordBtnContainer = (() => {
        for (const child of msg.children) {
          const childClass = typeof child.className === "string" ? child.className : (child.getAttribute?.("class") ?? "");
          if (childClass.includes("buttonContainer")) {
            return child;
          }
        }
        for (const child of msg.children) {
          for (const grandchild of child.children) {
            const gcClass = typeof grandchild.className === "string" ? grandchild.className : (grandchild.getAttribute?.("class") ?? "");
            if (gcClass.includes("buttonContainer")) {
              if (!grandchild.closest('[class*="content__"]') &&
                  !grandchild.closest('[class*="embedFull"]') &&
                  !grandchild.closest('[class*="container_b7e1cb"]')) {
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

    document.addEventListener("click", (e) => {
      if (
        !e.target.closest(".msg-copy-dropdown") &&
        !e.target.closest(".msg-copy-btn") &&
        !e.target.closest(".msg-copy-portal-menu")
      ) {
        closeGlobalMenu();
      }
    });

    function init() {
      if (!config.lang) showLanguageSelector();

      document.querySelectorAll("div[data-list-item-id]").forEach((node) => {
        if (!node.dataset.copyAttached) attachToMessage(node);
      });

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
          rootMargin: "300px",
          threshold: 0.1,
        },
      );

      document
        .querySelectorAll("div[data-list-item-id]")
        .forEach((node) => io.observe(node));

      window.addEventListener("beforeunload", () => io.disconnect(), { once: true });

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

      DEBUG && console.log("[MessageUtility] Hybrid injection mode initialized");
    }

    init();
  }

  function initEmojiSearchHelper() {
    console.log(
      "[Discord Utilities] Initializing Expression Search Helper v22.10 (Sticker Fix)...",
    );

    const NATIVE_MODE_KEY = "discord_emoji_native_mode";
    function getNativeMode() {
      return GM_getValue(NATIVE_MODE_KEY, true);
    }
    function setNativeMode(val) {
      GM_setValue(NATIVE_MODE_KEY, val);
    }

    const activeLocalObservers = new WeakMap();

    const MODE_TOOLTIP =
      "🇹🇼 [原生] 發送 Discord 代碼 (需 Nitro) / [連結] 發送圖片網址\n" +
      "🇨🇳 [原生] 发送 Discord 代码 (需 Nitro) / [链接] 发送图片网址\n" +
      "🇺🇸 [Native] Send Discord Tag (Nitro req) / [Link] Send Image URL\n" +
      "🇯🇵 [ネイティブ] コード送信 (Nitro必須) / [リンク] URL送信\n" +
      "🇰🇷 [네이티브] 코드 전송 (Nitro 필요) / [링크] URL 전송";

    const EMOJI_STYLES = `
            /* 基礎按鈕樣式 */
            .my-tool-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin: 0 1px; cursor: pointer; color: #b5bac1; border-radius: 4px; transition: all 0.2s; flex-shrink: 0; position: relative; }
            .my-tool-btn:hover { color: #dbdee1; background: rgba(255,255,255,0.1); }
            .my-tool-btn.is-active { color: #f0b232; }
            .my-tool-btn.is-active svg { fill: #f0b232; }
            .my-tool-btn.target-mode:hover { color: #f23f43; }
            .my-tool-btn.batch-active { color: #43b581 !important; background: rgba(67, 181, 129, 0.2); }

            /* GIF Overlay */
            .my-gif-overlay-bar { position: absolute; top: 4px; right: 36px; display: none; gap: 4px; padding: 2px; z-index: 100; background: rgba(0,0,0,0.6); border-radius: 4px; pointer-events: auto; }
            .my-gif-card:hover > .my-gif-overlay-bar { display: flex !important; }
            .my-overlay-btn { width: 22px; height: 22px; color: #f2f3f5; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; }
            .my-overlay-btn:hover { background: rgba(88, 101, 242, 1); }

            /* Popover Menu */
            .my-popover-menu { position: fixed; background: #2b2d31; border: 1px solid #1e1f22; border-radius: 4px; box-shadow: 0 8px 16px rgba(0,0,0,0.5); padding: 0; display: none; flex-direction: column; z-index: 2147483647; min-width: 340px; max-width: 620px; max-height: 550px; overflow: hidden; }
            .my-popover-menu.show { display: flex; }

            /* Menu Items */
            .my-menu-item { padding: 6px 10px; color: #dbdee1; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.03); }
            .my-menu-item:hover { background: #404249; color: #fff; }
            .my-emoji-preview-box { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
            .my-emoji-icon-preview { width: 100%; height: 100%; border-radius: 3px; object-fit: contain; background: rgba(0,0,0,0.2); }

            /* SVG Icon Placeholder */
            .my-emoji-icon-placeholder {
                width: 100%; height: 100%; border-radius: 4px;
                background: linear-gradient(135deg, #5865F2 0%, #4752C4 100%);
                display: flex; align-items: center; justify-content: center;
                font-size: 14px; color: #fff; font-weight: bold;
                text-transform: uppercase; text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
                position: relative; overflow: hidden;
            }
            .my-emoji-icon-placeholder::after { content: ''; position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; background: rgba(0,0,0,0.2); border-radius: 50% 0 0 0; }

            .my-emoji-content { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; gap: 2px; }
            .my-emoji-header { display: flex; align-items: center; gap: 6px; }
            .my-emoji-key { font-weight: 500; font-size: 13px; color: #f2f3f5; }
            .my-emoji-note-badge { font-size: 9px; color: #dbdee1; background: rgba(88, 101, 242, 0.15); border: 1px solid rgba(88, 101, 242, 0.4); border-radius: 3px; padding: 0 4px; height: 16px; display: inline-flex; align-items: center; justify-content: center; font-weight: 600; letter-spacing: 0.5px; white-space: nowrap; }
            .my-emoji-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.1s; }
            .my-menu-item:hover .my-emoji-actions { opacity: 1; }
            .my-emoji-btn { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 3px; font-size: 12px; color: #b5bac1; transition: all 0.1s; }
            .my-emoji-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
            .my-emoji-btn.delete:hover { background: #ed4245; color: #fff; }

            /* Tabs Layout */
            .my-tabs-header { display: flex; align-items: center; background: #1e1f22; border-bottom: 1px solid #111214; padding: 0 4px; width: 100%; box-sizing: border-box; }
            .my-tab-scroll-area { display: flex; align-items: center; overflow-x: auto; flex: 1; scrollbar-width: none; }
            .my-tab-scroll-area::-webkit-scrollbar { display: none; }
            .my-tab-controls { display: flex; align-items: center; flex-shrink: 0; padding-left: 4px; border-left: 1px solid rgba(255,255,255,0.05); margin-left: 4px; }

            .my-tab { padding: 8px 12px; font-size: 12px; font-weight: 500; color: #949ba4; cursor: pointer; white-space: nowrap; border-bottom: 2px solid transparent; transition: all 0.2s; user-select: none; }
            .my-tab:hover { color: #dbdee1; background: rgba(255,255,255,0.05); }
            .my-tab.active { color: #fff; border-bottom-color: #5865F2; }
            .my-tab.dragging { opacity: 0.5; background: rgba(255,255,255,0.1); }
            .my-tab-add { padding: 8px; color: #43b581; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center; }
            .my-tab-add:hover { color: #fff; background: #3ba55d; }

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
            .my-mode-switch:hover { color: #fff; border-color: #ffd700; box-shadow: 0 0 8px rgba(212, 175, 55, 0.6); text-shadow: 0 0 5px rgba(255, 215, 0, 0.8); }
            .my-mode-switch.active {
                background: linear-gradient(135deg, #000 0%, #333 100%);
                color: #ffd700; border-color: #ffd700;
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
            .my-tab-content { padding: 8px; overflow-y: auto; max-height: 400px; min-height: 180px; background: #313338; }

            /* Grid System */
            .my-col-grid { display: grid; gap: 8px; width: 100%; box-sizing: border-box; }
            .my-col-grid.emoji { grid-template-columns: repeat(auto-fill, 58px); gap: 4px; justify-content: start; }
            .my-col-grid.sticker { grid-template-columns: repeat(auto-fill, 100px); justify-content: center; }
            .my-col-grid.gif { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); }

            /* Wrappers & Images */
            .my-col-img-wrapper { position: relative; background: #2b2d31; border-radius: 4px; cursor: pointer; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
            .my-col-grid.emoji .my-col-img-wrapper { width: 58px; height: 58px; background: transparent; border-radius: 2px; box-shadow: none; }
            .my-col-grid.emoji .my-col-img-wrapper:hover { background: rgba(255,255,255,0.08); }
            .my-col-grid.sticker .my-col-img-wrapper { width: 100px; height: 100px; background: transparent; box-shadow: none; }
            .my-col-grid.gif .my-col-img-wrapper { aspect-ratio: 1 / 1; width: 100%; }
            .my-col-img { width: 100%; height: 100%; object-fit: contain; transition: transform 0.15s; }
            .my-col-grid.emoji .my-col-img { width: 48px; height: 48px; }
            .my-col-img-wrapper:hover .my-col-img { transform: scale(1.1); }
            .my-col-text { font-size: 32px; user-select: none; }

            /* Delete Button */
            .my-col-del-btn { position: absolute; top: 0; right: 0; width: 20px; height: 20px; background: rgba(0,0,0,0.6); color: #ed4245; display: flex; align-items: center; justify-content: center; border-bottom-left-radius: 6px; z-index: 999; backdrop-filter: blur(2px); opacity: 0; transition: opacity 0.1s; pointer-events: auto; }
            .my-col-del-btn > * { pointer-events: none; }
            .my-col-img-wrapper:hover .my-col-del-btn, .my-col-del-btn:hover { opacity: 1; }
            .my-col-del-btn:hover { background: #ed4245; color: #fff; }

            /* Modal & Picker */
            .my-save-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #313338; border: 1px solid #1e1f22; box-shadow: 0 0 0 100vw rgba(0,0,0,0.7); border-radius: 8px; z-index: 2147483649; width: 250px; overflow: hidden; animation: myPop 0.2s ease-out; }
            .my-save-header { background: #2b2d31; padding: 10px; font-size: 14px; font-weight: bold; color: #fff; text-align: center; border-bottom: 1px solid #1e1f22; }
            .my-save-list { max-height: 300px; overflow-y: auto; }
            .my-save-item { padding: 10px 15px; cursor: pointer; color: #dbdee1; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.1s; }
            .my-save-item:hover { background: #5865F2; color: #fff; }
            .my-save-item.create { color: #43b581; font-weight: 500; }
            .my-save-item.create:hover { background: #3ba55d; color: #fff; }
            @keyframes myPop { from { opacity: 0; transform: translate(-50%, -45%); } to { opacity: 1; transform: translate(-50%, -50%); } }
            .my-picker-mask { position: fixed; background: rgba(0, 0, 0, 0.75); z-index: 2147483647; cursor: crosshair; }
            .my-picker-tip { position: fixed; top: 10%; left: 50%; transform: translateX(-50%); background: #5865F2; color: white; padding: 10px 20px; border-radius: 20px; font-size: 14px; font-weight: bold; box-shadow: 0 4px 15px rgba(0,0,0,0.5); z-index: 2147483648; pointer-events: none; }
            .my-picker-frame { position: fixed; pointer-events: none; z-index: 2147483648; box-shadow: 0 0 0 2px #5865F2, 0 0 20px rgba(88, 101, 242, 0.5); border-radius: 4px; }

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

            .my-chat-input-folder-btn button {
                background: transparent !important;
                transition: transform 0.2s;
            }
            .my-chat-input-folder-btn button:hover {
                /* 平常 Hover 只有輕微搖晃，不要跟吃飽特效搶戲 */
                animation: my-gentle-shake 0.5s ease-in-out infinite;
                color: var(--interactive-hover) !important;
            }

            .my-popover-menu.input-mode {
                border-bottom-left-radius: 0;
                border-bottom-right-radius: 4px;
                border-top-left-radius: 4px;
                border-top-right-radius: 4px;
                box-shadow: 0 -4px 12px rgba(0,0,0,0.5);
            }
            /* [New] 準心引導動畫 (緩慢閃爍) */
            @keyframes target-sparkle {
                0% { transform: scale(1); filter: drop-shadow(0 0 0 transparent); color: #b5bac1; }
                50% { transform: scale(1.15); filter: drop-shadow(0 0 5px #f0b232); color: #fff; }
                100% { transform: scale(1); filter: drop-shadow(0 0 0 transparent); color: #b5bac1; }
            }
            .my-tool-btn.target-mode.animating {
                animation: target-sparkle 3s ease-in-out infinite; /* 3秒一次，緩慢呼吸 */
            }
            /* 當滑鼠移上去時暫停動畫，避免干擾 */
            .my-tool-btn.target-mode.animating:hover {
                animation-play-state: paused;
                color: #f23f43 !important; /* 保持原本的紅色 hover */
                filter: none;
                transform: scale(1.1);
            }
/* [New] 浮誇版引導動畫：聲納震波 + 強光 */
            @keyframes super-pulse {
                0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(240, 178, 50, 0.7); color: #b5bac1; }
                50% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(240, 178, 50, 0); color: #fff; filter: drop-shadow(0 0 8px #ffd700); }
                100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(240, 178, 50, 0); color: #b5bac1; }
            }

            .my-tool-btn.target-mode.animating {
                animation: super-pulse 1.5s infinite;
            }

            .my-tool-btn.target-mode.animating:hover {
                animation-play-state: paused;
                color: #f23f43 !important;
                filter: none;
                transform: scale(1.1);
                box-shadow: none;
            }

            /* [New] 黑幕降臨 */
            .my-idle-darkness {
                position: fixed;
                top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0, 0, 0, 0.85);
                z-index: 2147483640;
                pointer-events: none;
                opacity: 0;
                transition: opacity 2s ease-in-out;
            }
            .my-idle-darkness.active {
                opacity: 1;
                pointer-events: auto;
            }

            /* [Fix] 聚光燈分身樣式 (Fixed定位) */
            .my-tool-btn.spotlight-active {
                position: fixed !important; /* 脫離父容器 */
                z-index: 2147483646 !important; /* 比黑幕高 */
                color: #ffd700 !important;
                background: transparent !important;
                filter: drop-shadow(0 0 15px #ffd700) !important;
                animation: none !important;
                transform: scale(1.5) !important; /* 放大一點更明顯 */
                pointer-events: none; /* 讓滑鼠移動能穿透它觸發恢復 */
                transition: all 0.5s ease;
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
        const raw = JSON.parse(GM_getValue(key, "[]"));
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
      GM_setValue(key, JSON.stringify(data));
    }
    function getCollectionKey(type) {
      if (type === TYPES.GIF) return "discord_gif_collections";
      if (type === TYPES.STICKER) return "discord_sticker_collections";
      return "discord_emoji_collections";
    }
    function getCollections(type) {
      try {
        const key = getCollectionKey(type);
        let data = JSON.parse(GM_getValue(key, "{}"));
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
      GM_setValue(getCollectionKey(type), JSON.stringify(data));
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

      let item = content;
      if (typeof content === "string") {
        if (content.startsWith("http")) {
          item = parseMediaUrl(content, type);
        } else {
          item = { content: content, type: "text" };
        }
      }

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

        if (type === TYPES.GIF || type === TYPES.STICKER) {
          const downloadUrl = (typeof item === "object")
            ? (item.url || item.content || item.stableUrl)
            : item;
          if (downloadUrl && downloadUrl.startsWith("http")) {
            fetchAndCacheMedia(downloadUrl).then(dataUrl => {
              if (dataUrl) {
                DEBUG && console.log("[GifCache] Pre-cached on save:", downloadUrl.slice(0, 60));
              } else {
                console.warn("[GifCache] Pre-cache failed (CDN may have expired already):", downloadUrl.slice(0, 80));
              }
            });
          }
        }

        const inputFolderBtn = document.querySelector(
          ".my-chat-input-folder-btn button",
        );
        if (inputFolderBtn) {
          inputFolderBtn.classList.remove("my-eat-anim");

          void inputFolderBtn.offsetWidth;

          inputFolderBtn.classList.add("my-eat-anim");

          setTimeout(() => {
            inputFolderBtn.classList.remove("my-eat-anim");
          }, 800);
        }
      }
    }

    const GIF_CACHE_PREFIX = "gifcache_";
    const GIF_CACHE_INDEX  = "gifcache_index";
    const GIF_MAX_BYTES    = 400 * 1024;

    let _idbPromise = null;
    function openGifIDB() {
      if (_idbPromise) return _idbPromise;
      _idbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open("DiscordGifCache", 1);
        req.onupgradeneeded = (e) => {
          e.target.result.createObjectStore("blobs", { keyPath: "id" });
        };
        req.onsuccess  = (e) => resolve(e.target.result);
        req.onerror    = (e) => reject(e.target.error);
      });
      return _idbPromise;
    }
    async function idbPut(id, dataUrl) {
      const db = await openGifIDB();
      return new Promise((res, rej) => {
        const tx  = db.transaction("blobs", "readwrite");
        tx.objectStore("blobs").put({ id, dataUrl });
        tx.oncomplete = () => res();
        tx.onerror    = (e) => rej(e.target.error);
      });
    }
    async function idbGet(id) {
      const db = await openGifIDB();
      return new Promise((res, rej) => {
        const tx  = db.transaction("blobs", "readonly");
        const req = tx.objectStore("blobs").get(id);
        req.onsuccess = (e) => res(e.target.result?.dataUrl || null);
        req.onerror   = (e) => rej(e.target.error);
      });
    }

    function gifCacheKey(url) {
      try { return new URL(url).pathname; } catch { return url; }
    }

    async function readGifCache(url) {
      const k = gifCacheKey(url);
      const gmKey = GIF_CACHE_PREFIX + k;
      try {
        const val = GM_getValue(gmKey, null);
        if (val) return val;
      } catch(_) {}
      try {
        const val = await idbGet(k);
        if (val) return val;
      } catch(_) {}
      return null;
    }

    async function writeGifCache(url, dataUrl) {
      const k = gifCacheKey(url);
      const byteLen = Math.round(dataUrl.length * 0.75);
      try {
        if (byteLen <= GIF_MAX_BYTES) {
          GM_setValue(GIF_CACHE_PREFIX + k, dataUrl);
        } else {
          await idbPut(k, dataUrl);
        }
        try {
          const idx = JSON.parse(GM_getValue(GIF_CACHE_INDEX, "[]"));
          if (!idx.includes(k)) { idx.push(k); GM_setValue(GIF_CACHE_INDEX, JSON.stringify(idx)); }
        } catch(_) {}
      } catch(e) {
        console.warn("[GifCache] write failed:", e);
      }
    }

    function fetchAndCacheMedia(url) {
      return new Promise(async (resolve) => {
        try {
          const cached = await readGifCache(url);
          if (cached) { resolve(cached); return; }
        } catch(_) {}

        GM_xmlhttpRequest({
          method: "GET",
          url: url,
          responseType: "arraybuffer",
          timeout: 15000,
          onload(res) {
            if (res.status !== 200) { resolve(null); return; }
            try {
              const bytes = new Uint8Array(res.response);
              const mime  = res.responseHeaders.match(/content-type:\s*([^\r\n;]+)/i)?.[1]?.trim()
                         || (url.includes(".gif") ? "image/gif" : "image/webp");
              let binary = "";
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
              const b64 = "data:" + mime + ";base64," + btoa(binary);
              writeGifCache(url, b64).catch(() => {});
              resolve(b64);
            } catch(e) {
              console.error("[GifCache] encode error:", e);
              resolve(null);
            }
          },
          onerror()  { resolve(null); },
          ontimeout(){ resolve(null); },
        });
      });
    }

    async function attachGifFallback(imgEl, originalUrl, stableUrl) {
      if (!originalUrl || !originalUrl.startsWith("http")) return;
      const cacheTarget = (stableUrl && stableUrl.startsWith("http")) ? stableUrl : originalUrl;

      let cachedDataUrl = null;
      try { cachedDataUrl = await readGifCache(cacheTarget); } catch(_) {}

      if (cachedDataUrl) {
        imgEl.src = cachedDataUrl;
        return;
      }

      imgEl.onerror = async function() {
        this.onerror = null;
        this.alt   = "🖼️";
        this.title = cacheTarget;
        this.style.cssText = [
          "object-fit:contain",
          "background:rgba(0,0,0,0.25)",
          "border-radius:4px",
          "font-size:24px",
          "display:flex",
          "align-items:center",
          "justify-content:center",
        ].join(";");
        DEBUG && console.warn("[GifCache] CDN expired, no local cache:", cacheTarget.slice(0, 80));
      };
    }

    function parseMediaUrl(url, type) {
      const result = {
        url: url,
        thumbnail: null,
        stableUrl: url,
        mediaType: type,
        filename: "media",
        createdAt: new Date().toISOString(),
      };

      try {
        const urlObj = new URL(url);

        const path = urlObj.pathname.toLowerCase();
        if (path.match(/\.(gif|webp)$/)) {
          result.fileType = "gif";
        } else if (path.match(/\.(jpg|jpeg|png)$/)) {
          result.fileType = "image";
        } else if (path.match(/\.(mp4|webm|mov)$/)) {
          result.fileType = "video";
        }

        const pathParts = path.split("/");
        result.filename = pathParts[pathParts.length - 1] || "media";

        const searchParams = new URLSearchParams(urlObj.search);
        const hasTimeParams =
          searchParams.has("ex") ||
          searchParams.has("is") ||
          searchParams.has("hm");

        if (hasTimeParams) {
          searchParams.delete("ex");
          searchParams.delete("is");
          searchParams.delete("hm");

          urlObj.search = searchParams.toString();
          result.stableUrl = urlObj.toString();

          if (
            url.includes("cdn.discordapp.com") ||
            url.includes("media.discordapp.net")
          ) {
            const thumbParams = new URLSearchParams(searchParams);
            thumbParams.set("width", "400");
            thumbParams.set("height", "300");

            urlObj.search = thumbParams.toString();
            result.thumbnail = urlObj.toString();
          } else {
            result.thumbnail = result.stableUrl;
          }
        } else {
          result.thumbnail = url;
        }
      } catch (e) {
        console.error("[parseMediaUrl] Failed to parse:", url, e);
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

      let actualContent = content;
      let thumbnailUrl = null;

      if (typeof content === "object" && content !== null) {
        actualContent = content.content || content.url || content.stableUrl;
        thumbnailUrl = content.thumbnail || content.stableUrl || content.url;
      } else {
        actualContent = content;
        thumbnailUrl = content;
      }

      const isUrl =
        actualContent.startsWith("http") ||
        actualContent.startsWith("data:") ||
        actualContent.startsWith("blob:");

      if (isUrl) {
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

          const _cacheTarget = actualContent || displayUrl;
          const _stableUrl = (typeof content === "object" && content !== null)
            ? (content.stableUrl || null)
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
      let url = input;
      if (typeof input === "object" && input !== null) {
        url = input.stableUrl || input.url || input.content;
      }

      if (!url || !url.startsWith || !url.startsWith("http")) return url;
      const cleanUrl = url.split("?")[0];

      if (type === TYPES.STICKER) return cleanUrl + "?size=160";

      if (type === TYPES.EMOJI) return cleanUrl + "?size=56";

      return url;
    }

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

    let activeDropdown = null;
    let activeTrigger = null;
    let currentActiveTab = "General";
    let batchTargetMode = false;
    let activeBatchCollection = null;
    let activeBatchType = null;
    let dragSrcIndex = null;

    function showDropdown(triggerBtn) {
      const dropdown = document.querySelector(".my-popover-menu");
      dropdown.style.visibility = "hidden";
      dropdown.classList.add("show");
      const rect = dropdown.getBoundingClientRect();
      const container =
        triggerBtn.closest('div[class*="header"], div[class*="container"]') ||
        document.body;
      const containerRect = container.getBoundingClientRect();
      let left = containerRect.left + containerRect.width / 2 - rect.width / 2;
      if (left < 10) left = 10;
      if (left + rect.width > window.innerWidth - 10)
        left = window.innerWidth - rect.width - 10;
      const btnRect = triggerBtn.getBoundingClientRect();
      dropdown.style.top = `${btnRect.bottom + 8}px`;
      dropdown.style.left = `${left}px`;
      dropdown.style.visibility = "visible";
      activeDropdown = dropdown;
      activeTrigger = triggerBtn;
    }

    function closeAllMenus() {
      document
        .querySelectorAll(".my-popover-menu.show")
        .forEach((m) => m.classList.remove("show"));
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

      function onMouseMove(e) {
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
              const cdnSrc = target.src || target.querySelector("source")?.src || "";
              const pageUrl = getKlipyPageUrl(target) || "";
              const finalUrl = pageUrl || cdnSrc;
              if (finalUrl) {
                const thumb = _klipyThumbCache.get(pageUrl) || cdnSrc || pageUrl;
                content = pageUrl
                  ? { url: finalUrl, content: finalUrl, stableUrl: finalUrl, thumbnail: thumb, mediaType: TYPES.GIF, filename: finalUrl.split("/").pop(), createdAt: new Date().toISOString() }
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
        document.removeEventListener("mousemove", onMouseMove);
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
      document.addEventListener("mousemove", onMouseMove);
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

    function showEmojiToast(msg, iconUrl) {
      const existing = document.querySelector(".my-emoji-toast");
      if (existing) existing.remove();
      const toast = document.createElement("div");
      toast.className = "my-emoji-toast";
      toast.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#2b2d31;color:#f2f3f5;padding:8px 14px;border-radius:8px;font-size:13px;z-index:2147483647;pointer-events:none;display:flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 4px 16px rgba(0,0,0,0.5);`;
      let content = `<span>${escHtml(String(msg))}</span>`;
      if (iconUrl && iconUrl.startsWith("http"))
        content =
          `<img src="${iconUrl}" style="width:20px; height:20px; object-fit:contain; border-radius:3px;">` +
          content;
      else if (iconUrl)
        content =
          `<span style="font-size:18px; margin-right:4px;">${iconUrl}</span>` +
          content;
      toast.innerHTML = content;
      document.body.appendChild(toast);
      const style = document.createElement("style");
      style.innerHTML = `@keyframes fadeUp { 0% {opacity:0; transform:translate(-50%, 0);} 10% {opacity:1; transform:translate(-50%, -10px);} 90% {opacity:1; transform:translate(-50%, -10px);} 100% {opacity:0; transform:translate(-50%, 0);} }`;
      document.head.appendChild(style);
      setTimeout(() => {
        toast.remove();
        style.remove();
      }, 2000);
    }

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
            const doDelete =
              ev.shiftKey || confirm(t("em_del_confirm", { k: item.key }));
            if (doDelete) {
              const newList = list.filter((k) => k.key !== item.key);
              saveFavs(type, newList);
              renderKeywordDropdown(input, newList, btn, type);
            }
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
      const dropdown = document.querySelector(".my-popover-menu");
      if (!dropdown) return;
      dropdown.innerHTML = "";

      const cols = getCollections(type);
      let tabNames = Object.keys(cols);
      tabNames = ["General", ...tabNames.filter((n) => n !== "General")];
      if (!tabNames.includes(currentActiveTab) && tabNames.length > 0)
        currentActiveTab = tabNames[0];

      const header = document.createElement("div");
      header.className = "my-tabs-header";

      const scrollArea = document.createElement("div");
      scrollArea.className = "my-tab-scroll-area";

      tabNames.forEach((name, index) => {
        const tab = document.createElement("div");
        tab.className = `my-tab ${name === currentActiveTab ? "active" : ""}`;
        tab.innerText = name;
        tab.draggable = true;

        tab.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          if (name === "General") return;
          if (confirm(t("em_col_del_tab_confirm", { n: name }))) {
            delete cols[name];
            saveCollections(type, cols);
            renderTabsView(input, type);
          }
        });

        tab.addEventListener("dragstart", (ev) => {
          dragSrcIndex = index;
          tab.classList.add("dragging");
          ev.dataTransfer.effectAllowed = "move";
        });
        tab.addEventListener("dragend", () => {
          tab.classList.remove("dragging");
        });
        tab.addEventListener("dragover", (ev) => {
          ev.preventDefault();
          return false;
        });
        tab.addEventListener("drop", (ev) => {
          ev.stopPropagation();
          if (dragSrcIndex !== null && dragSrcIndex !== index) {
            reorderCollections(type, dragSrcIndex, index);
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

      const addTabBtn = document.createElement("div");
      addTabBtn.className = "my-tab-add";
      addTabBtn.innerText = "+";
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
      scrollArea.appendChild(addTabBtn);
      header.appendChild(scrollArea);

      const controls = document.createElement("div");
      controls.className = "my-tab-controls";

      if (type === TYPES.EMOJI) {
        const modeSwitch = document.createElement("div");
        const isNative = getNativeMode();
        modeSwitch.className = `my-mode-switch ${isNative ? "active" : ""}`;
        modeSwitch.innerHTML = isNative ? "✦ NATIVE" : "🔗 LINK";
        modeSwitch.title = MODE_TOOLTIP;
        modeSwitch.addEventListener("mousedown", (e) => e.stopPropagation());
        modeSwitch.onclick = (e) => {
          e.stopPropagation();
          setNativeMode(!isNative);
          renderTabsView(input, type);
        };
        controls.appendChild(modeSwitch);
      }
      header.appendChild(controls);
      dropdown.appendChild(header);

      const content = document.createElement("div");
      content.className = "my-tab-content";
      content.addEventListener("mousedown", (ev) => ev.stopPropagation());

      const currentItems = cols[currentActiveTab] || [];
      const grid = document.createElement("div");
      grid.className = "my-col-grid";

      if (type === TYPES.EMOJI) grid.classList.add("emoji");
      else if (type === TYPES.STICKER) grid.classList.add("sticker");
      else grid.classList.add("gif");

      if (currentItems.length === 0) {
        content.innerHTML = `<div style="padding:20px; color:#72767d; font-size:12px; text-align:center;">${t("em_col_empty_tab")}</div>`;
      } else {
        currentItems.forEach((url) => {
          const wrap = document.createElement("div");
          wrap.className = "my-col-img-wrapper";

          const media = createMediaElement(url, true, type);
          if (media) wrap.appendChild(media);

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

            cols[currentActiveTab] = cols[currentActiveTab].filter((item) => {
              if (typeof item === "object" && typeof url === "object") {
                const itemKey = item.url || item.stableUrl || item.content;
                const urlKey = url.url || url.stableUrl || url.content;
                return itemKey !== urlKey;
              }
              else if (typeof item === "string" && typeof url === "string") {
                return item !== url;
              }
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

          wrap.onclick = async (ev) => {
            if (ev.target.closest(".my-col-del-btn")) return;
            if (!ev.shiftKey) closeAllMenus();

            let finalUrl = url;

            if (type === TYPES.EMOJI) {
              const isNative = getNativeMode();
              wrap.style.opacity = "0.5";
              try {
                const rawUrl = typeof url === "object"
                  ? (url.url || url.stableUrl || url.content)
                  : url;
                const result = await detectAnimatedUrl(rawUrl);
                if (isNative) {
                  const nativeTag = getNativeEmojiTag(result.url, result.isGif);
                  finalUrl = nativeTag ? nativeTag : getSendableUrl(url, type);
                } else {
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
              finalUrl = getSendableUrl(url, type);
            }

            pasteAndSend(finalUrl);
          };
          grid.appendChild(wrap);
        });
        content.appendChild(grid);
      }
      dropdown.appendChild(content);
    }

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

      const existingContainer =
        headerContainer.querySelector(".my-emoji-toolbar");
      if (existingContainer) {
        if (existingContainer._boundInput === input && input.isConnected)
          return;
        else {
          if (existingContainer._cleanupIdle) existingContainer._cleanupIdle();
          existingContainer.remove();
          processedNodes.delete(headerContainer);
        }
      }

      processedNodes.add(node);
      processedNodes.add(headerContainer);

      const btnContainer = document.createElement("div");
      btnContainer.className = "my-emoji-toolbar";
      btnContainer._boundInput = input;
      btnContainer.style.display = "flex";
      btnContainer.style.alignItems = "center";

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

      const targetBtn = document.createElement("div");
      targetBtn.className = "my-tool-btn target-mode animating";
      targetBtn.innerHTML = ICON_TARGET;
      targetBtn.title = t("em_btn_target_title");

      let idleTimer = null;
      let overlayEl = null;
      let cloneBtn = null;

      const clearDarkness = () => {
        if (overlayEl) {
          overlayEl.classList.remove("active");
          setTimeout(() => {
            if (overlayEl) overlayEl.remove();
            overlayEl = null;
          }, 500);
        }
        if (cloneBtn) {
          cloneBtn.remove();
          cloneBtn = null;
        }
        targetBtn.style.opacity = "1";
      };

      const triggerDarkness = () => {
        if (!document.body.contains(targetBtn)) {
          cleanupIdle();
          return;
        }
        if (document.querySelector(".my-popover-menu.show")) return;

        if (!overlayEl) {
          overlayEl = document.createElement("div");
          overlayEl.className = "my-idle-darkness";
          document.body.appendChild(overlayEl);
        }

        if (!cloneBtn) {
          const rect = targetBtn.getBoundingClientRect();
          if (rect.top < 0 || rect.top > window.innerHeight) return;

          cloneBtn = document.createElement("div");
          cloneBtn.className = "my-tool-btn target-mode spotlight-active";
          cloneBtn.innerHTML = ICON_TARGET;

          cloneBtn.style.left = `${rect.left}px`;
          cloneBtn.style.top = `${rect.top}px`;
          cloneBtn.style.width = `${rect.width}px`;
          cloneBtn.style.height = `${rect.height}px`;

          document.body.appendChild(cloneBtn);

          targetBtn.style.opacity = "0";
        }

        requestAnimationFrame(() => {
          if (overlayEl) overlayEl.classList.add("active");
        });
      };

      const resetIdleTimer = () => {
        clearTimeout(idleTimer);
        if (overlayEl || cloneBtn) {
          clearDarkness();
        }
        idleTimer = setTimeout(triggerDarkness, 30000);
      };

      document.addEventListener("mousemove", resetIdleTimer);
      document.addEventListener("keydown", resetIdleTimer);

      const cleanupIdle = () => {
        clearTimeout(idleTimer);
        clearDarkness();
        document.removeEventListener("mousemove", resetIdleTimer);
        document.removeEventListener("keydown", resetIdleTimer);
      };
      btnContainer._cleanupIdle = cleanupIdle;

      resetIdleTimer();

      targetBtn.onclick = (e) => {
        e.stopPropagation();
        targetBtn.classList.remove("animating");
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

      const starBtn = document.createElement("div");
      starBtn.className = "my-tool-btn";
      starBtn.innerHTML = ICON_STAR_EMPTY;
      starBtn.title = t("em_btn_add_title");
      btnContainer.appendChild(starBtn);

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

    const _klipyUrlCache = new Map();
    const _klipyThumbCache = new Map();

    (function _installKlipyXhrInterceptor() {
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._klipyUrl = (typeof url === "string" && url.includes("discord.com/api") && url.includes("klipy")) ? url : null;
        return origOpen.call(this, method, url, ...rest);
      };

      XMLHttpRequest.prototype.send = function (...args) {
        if (this._klipyUrl) {
          this.addEventListener("load", function () {
            try {
              const data = JSON.parse(this.responseText);
              const items = Array.isArray(data) ? data : (data.gifs || data.results || []);
              items.forEach(item => {
                if (item.src && item.url) {
                  const cdnKey = item.src.replace(/^https?:/, "");
                  _klipyUrlCache.set(cdnKey, item.url);
                  _klipyUrlCache.set(item.src, item.url);
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

    function getKlipyPageUrl(mediaEl) {
      try {
        const src = mediaEl.src || mediaEl.getAttribute("src") || "";
        if (!src) return null;
        if (_klipyUrlCache.has(src)) return _klipyUrlCache.get(src);
        const srcNoProto = src.replace(/^https?:/, "");
        if (_klipyUrlCache.has(srcNoProto)) return _klipyUrlCache.get(srcNoProto);
      } catch (_) {}
      return null;
    }

    function injectGifOverlay(node) {
      if (!node || processedNodes.has(node)) return;
      const card = node.closest('div[class*="result"], div[role="gridcell"]');
      if (!card) return;
      processedNodes.add(node);
      card.classList.add("my-gif-card");
      if (window.getComputedStyle(card).position === "static") {
        card.style.position = "relative";
      }
      const overlay = document.createElement("div");
      overlay.className = "my-gif-overlay-bar";
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
      card.appendChild(overlay);
    }

    const dropdown = document.createElement("div");
    dropdown.className = "my-popover-menu";
    dropdown.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
    document.body.appendChild(dropdown);

    const injectEmojiInputTools = function (pickerContainer) {
      if (!pickerContainer) return;

      const runInputInjection = () => {
        const inputs = pickerContainer.querySelectorAll(
          'input[type="text"], input[type="search"]',
        );
        inputs.forEach(injectInputTools);
      };
      runInputInjection();

      const buttons = pickerContainer.querySelectorAll(
        'div[class*="favButton"], div[class*="FavoriteButton"]',
      );
      buttons.forEach(injectGifOverlay);

      const isDynamicList =
        pickerContainer.querySelector('[id^="gif-picker"]') ||
        pickerContainer.querySelector('[id^="sticker-picker"]') ||
        pickerContainer.querySelector('div[class*="scroller"]') ||
        pickerContainer.querySelector('div[class*="header"]');

      if (isDynamicList && !activeLocalObservers.has(pickerContainer)) {
        console.log(
          "[EmojiSearchHelper] Attaching local observer to dynamic list...",
        );

        const localObserver = new MutationObserver((mutations) => {
          let shouldRecheckInputs = false;

          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType !== 1) continue;

              if (node.tagName === "INPUT" || node.querySelector("input")) {
                shouldRecheckInputs = true;
              }

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

          if (shouldRecheckInputs) {
            runInputInjection();
          }
        });

        localObserver.observe(pickerContainer, {
          childList: true,
          subtree: true,
        });
        activeLocalObservers.set(pickerContainer, localObserver);

        const removeObserver = new MutationObserver((mutations, obs) => {
          if (!document.body.contains(pickerContainer)) {
            localObserver.disconnect();
            activeLocalObservers.delete(pickerContainer);
            obs.disconnect();
            console.log("[EmojiSearchHelper] Local observer disconnected.");
          }
        });
        removeObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
    };

    function setupTrigger() {
      document.addEventListener(
        "click",
        (e) => {
          const target = e.target;
          const btn = target.closest(
            'div[aria-label="新增表情符號"], div[aria-label="Open GIF picker"], div[aria-label="Open sticker picker"], div[aria-label="開啟貼圖選取器"], div[aria-label="開啟 GIF 選取器"], button[aria-label="Select Emoji"]',
          );

          if (btn) {
            DEBUG && console.log("[EmojiHelper] Button clicked, waiting for picker...");
            waitForPicker();
          }
        },
        true,
      );
    }

    function waitForPicker() {
      const observer = new MutationObserver((mutations, obs) => {
        const input = document.querySelector(
          'input[placeholder^="Search"], input[placeholder^="搜尋"], input[placeholder^="尋找"]',
        );

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
          console.log("[EmojiHelper] Picker found! Injecting tools...");
          injectEmojiInputTools(container);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 2000);
    }

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
        const img = popoutNode.querySelector(
          'img[class*="primaryEmoji_"], img[class*="sticker_"], img[class*="pngImage_"]',
        );
        if (!img) return;

        let src = img.src;
        let type = null;

        if (img.classList.contains("emoji") || src.includes("/emojis/")) {
          type = TYPES.EMOJI;
        } else if (src.includes("/stickers/")) {
          type = TYPES.STICKER;
        }

        if (!type) return;

        const btn = document.createElement("div");
        btn.className = "my-chat-save-btn";
        btn.innerHTML = ICON_FOLDER;
        btn.title = t("em_btn_save_this");

        btn.style.cssText = `
              position: absolute;
              top: 7px;
              left: 7px;  /* Changed from right to left */
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
              try {
                const result = await detectAnimatedUrl(src);
                if (result.isGif) {
                  finalUrl = result.url.split("?")[0] + "?size=56&quality=lossless";
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

        popoutNode.style.position = "relative";
        popoutNode.appendChild(btn);
      };

      let _entitySaverDebounce = null;
      const observer = new MutationObserver((mutations) => {
        clearTimeout(_entitySaverDebounce);
        _entitySaverDebounce = setTimeout(() => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType !== 1) continue;

              const emojiSection = node.querySelector
                ? node.querySelector('div[class*="emojiSection_"]')
                : null;
              const stickerSection = node.querySelector
                ? node.querySelector('div[class*="stickerSection_"]')
                : null;

              if (emojiSection) injectIntoPopout(emojiSection);
              else if (stickerSection) injectIntoPopout(stickerSection);
              else if (
                node.classList &&
                typeof node.className === "string" &&
                (node.className.includes("emojiSection_") ||
                  node.className.includes("stickerSection_"))
              ) {
                injectIntoPopout(node);
              }
            }
          }
        }, 80);
      });

      observer.observe(document.body, { childList: true, subtree: true });
    }

    initChatEntitySaver();

    function initChatInputButton() {

      const injectButton = (container) => {
        if (!container.querySelector('div[class*="emojiButton"]')) return;

        const existingBtn = container.querySelector(
          ".my-chat-input-folder-btn",
        );

        if (existingBtn) {
          if (container.firstChild !== existingBtn) {
            container.prepend(existingBtn);
          }
          return;
        }

        const btnContainer = document.createElement("div");
        btnContainer.className =
          "buttonContainer__74017 my-chat-input-folder-btn";
        btnContainer.style.marginRight = "4px";
        btnContainer.style.display = "flex";
        btnContainer.style.alignItems = "center";
        btnContainer.style.justifyContent = "center";

        const btn = document.createElement("button");
        btn.className = "button__74017 button__24af7";
        btn.setAttribute("type", "button");
        btn.setAttribute("aria-label", "開啟蒐藏庫");
        btn.style.width = "24px";
        btn.style.height = "24px";

        const iconWrapper = document.createElement("div");
        iconWrapper.className = "buttonWrapper__24af7";
        iconWrapper.style.opacity = "1";
        iconWrapper.innerHTML = `
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--interactive-normal); transition: color 0.2s;">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
            `;

        btn.onmouseenter = () =>
          (iconWrapper.querySelector("svg").style.color =
            "var(--interactive-hover)");
        btn.onmouseleave = () =>
          (iconWrapper.querySelector("svg").style.color =
            "var(--interactive-normal)");

        btn.onclick = (e) => {
          e.stopPropagation();
          closeAllMenus();
          const channelTextArea = container.closest(
            '[class*="channelTextArea"]',
          );
          const input = channelTextArea?.querySelector('div[role="textbox"]');
          showQuickTypeMenu(btn, input);
        };

        btn.appendChild(iconWrapper);
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

      let _inputBtnDebounce = null;
      const observer = new MutationObserver((mutations) => {
        clearTimeout(_inputBtnDebounce);
        _inputBtnDebounce = setTimeout(() => {
          let handled = false;
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType !== 1) continue;
              if (node.matches?.('div[class*="buttons__"]')) {
                injectButton(node);
                handled = true;
              }
              const inner = node.querySelector?.('div[class*="buttons__"]');
              if (inner) { injectButton(inner); handled = true; }
            }
          }
          if (!handled) {
            document.querySelectorAll('div[class*="buttons__"]').forEach(injectButton);
          }
        }, 100);
      });

      observer.observe(document.body, { childList: true, subtree: true });

      document
        .querySelectorAll('div[class*="buttons__"]')
        .forEach(injectButton);
    }

    initChatInputButton();

    setupTrigger();
  }

  console.log(
    "[EmojiSearchHelper] Event-driven interface ready: window.injectEmojiInputTools",
  );

  function initHeaderMods() {
    console.log(
      "[Discord Utilities] Initializing Header Mods (Fix Long Press)...",
    );

    const STORAGE_PREFIX = "discord_header_mod_def_";
    const PRESS_DELAY = 500;

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
    styleEl.innerHTML = HEADER_MOD_STYLES;
    document.head.appendChild(styleEl);

    let globalTooltip = document.querySelector(".header-mod-global-tooltip");
    if (!globalTooltip) {
      globalTooltip = document.createElement("div");
      globalTooltip.className = "header-mod-global-tooltip";
      document.body.appendChild(globalTooltip);
    }

    const loadDefault = (key) => {
      const val = localStorage.getItem(STORAGE_PREFIX + key);
      return val === null ? false : val === "true";
    };
    const saveDefault = (key, val) => {
      localStorage.setItem(STORAGE_PREFIX + key, val);
    };

    const State = {
      antiHijack: loadDefault("antiHijack"),
      concealName: loadDefault("concealName"),
    };

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
          "en":    "Long press 0.5s to save as default",
          "ja":    "0.5秒長押しでデフォルトとして保存",
          "ko":    "0.5초 길게 눌러 기본값으로 저장",
          "es":    "Mantén 0.5s para guardar como predeterminado",
          "pt-BR": "Pressione 0.5s para salvar como padrão",
          "fr":    "Maintenir 0.5s pour enregistrer par défaut",
          "ru":    "Удержание 0.5с для сохранения по умолчанию",
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
          "en":    "Long press 0.5s to save as default",
          "ja":    "0.5秒長押しでデフォルトとして保存",
          "ko":    "0.5초 길게 눌러 기본값으로 저장",
          "es":    "Mantén 0.5s para guardar como predeterminado",
          "pt-BR": "Pressione 0.5s para salvar como padrão",
          "fr":    "Maintenir 0.5s pour enregistrer par défaut",
          "ru":    "Удержание 0.5с для сохранения по умолчанию",
        },
      },
    };

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
    toggleAntiHijack(State.antiHijack);

    document.addEventListener("visibilitychange", () => {
      document.documentElement.classList.toggle(
        "wormhole-page-hidden",
        document.hidden,
      );
    });

    const concealHandler = (() => {
      const REPLACE_PREFIX = "_";
      const _origFileNameDesc = Object.getOwnPropertyDescriptor(File.prototype, "name");
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
        configurable: true,
      });

      return {
        restore() {
          try {
            Object.defineProperty(File.prototype, "name", _origFileNameDesc);
          } catch (_) {}
        },
      };
    })();

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
        "en":    { on: "Default: ON",  off: "Default: OFF",  mem: "💾 Memory" },
        "ja":    { on: "デフォルト: ON", off: "デフォルト: OFF", mem: "💾 記憶" },
        "ko":    { on: "기본값: ON", off: "기본값: OFF", mem: "💾 메모리" },
        "es":    { on: "Predeterminado: ON", off: "Predeterminado: OFF", mem: "💾 Memoria" },
        "pt-BR": { on: "Padrão: ATIVO", off: "Padrão: INATIVO", mem: "💾 Memória" },
        "fr":    { on: "Par défaut: ON", off: "Par défaut: OFF", mem: "💾 Mémoire" },
        "ru":    { on: "По умолч.: ВКЛ", off: "По умолч.: ВЫКЛ", mem: "💾 Память" },
      };
      const _sl = _statusLabels[_lang] || _statusLabels["en"];
      const statusText = isDefaultOn ? _sl.on : _sl.off;
      const _descText = (typeof config.desc === "object")
        ? (config.desc[_lang] || config.desc["en"])
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

          State[type] = !State[type];
          if (type === "antiHijack") toggleAntiHijack(State[type]);

          btn.classList.toggle("enabled", State[type]);

          saveDefault(type, State[type]);

          btn.classList.add("saving");
          setTimeout(() => btn.classList.remove("saving"), 400);

          updateTooltipContent(type);
        }, PRESS_DELAY);
      };

      btn.onmouseup = (e) => {
        if (e.button !== 0) return;
        if (pressTimer) clearTimeout(pressTimer);

        if (!isLongPress) {
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

    window.addEventListener("beforeunload", () => concealHandler.restore(), { once: true });

    setTimeout(injectButtons, 2000);
  }

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
      this._cachedToken  = null;
      this._tokenWatcher = null;
    }

    initialize() {
      console.log("[Wormhole Module V3] Initializing...");
      this.injectStyles();
      this.setupGlobalListeners();

      if (this.getApiMode() && !this._cachedToken) {
        this._startTokenInterceptor((token) => {
          this._cachedToken = token;
          console.log("[WH API] Token pre-fetched at init ✅");
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
          this._injectTitlebarDock();
        }
      }, 1000);

      this.setupObserver();
      this._setupModalWatcher();
    }

    resetAllData() {
      if (
        confirm(
          "⚠️ [DEBUG RESET] ⚠️\n\n確定要刪除所有蟲洞與群組資料嗎？\n此動作無法復原！",
        )
      ) {
        try {
          const container = document.querySelector(".my-wormhole-container");
          if (container) {
            container.style.opacity = "0.5";
            container.innerHTML = "";
          }

          const emptyData = { groups: [], vipWormholes: [], wormholes: [] };

          if (typeof GM_setValue !== "undefined") {
            GM_setValue(this.STORAGE_KEY, emptyData);
            if (typeof GM_deleteValue !== "undefined") {
              GM_deleteValue("discord_wormholes_v1");
            }
          }
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(emptyData));

          this.showToast("✅ 資料已清除，正在重新整理...");
          console.log("[Wormhole] Data reset complete.");

          setTimeout(() => window.location.reload(), 1000);
        } catch (error) {
          console.error("[Wormhole] Reset failed:", error);
          alert("❌ 重置失敗，請查看控制台 (F12) 錯誤訊息。");
        }
      }
    }

    setupGlobalListeners() {
      document.addEventListener("click", (e) => {
        if (
          !e.target.closest(".my-wormhole-dropdown") &&
          !e.target.closest(".my-wormhole-group-chip")
        ) {
          this.closeAllDropdowns();
        }

        if (!e.target.closest(".my-popover-menu")) {
          const menu = document.querySelector(".my-popover-menu");
          if (menu && menu.classList.contains("show")) {
            menu.classList.remove("show");
          }
        }
      });
    }

    getDefaultData() {
      return {
        groups: [],
        vipWormholes: [],
        wormholes: [],
        groupIcons: {},
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

        if (!data) return this.getDefaultData();

        if (Array.isArray(data)) {
          return { groups: [], vipWormholes: [], wormholes: data };
        }

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

    injectCreatorButton(container) {
      if (container.querySelector(".my-wormhole-creator-btn")) return;

      const btnGroup = document.createElement("div");
      btnGroup.style.cssText = "display: flex; gap: 8px; align-items: center;";

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
        if (isLongPress) { isLongPress = false; return; }
        this.createNewWormhole();
      };

      const focusBtn = document.createElement("div");
      focusBtn.className = "my-wormhole-focus-btn";
      focusBtn.innerHTML = this.focusMode
        ? this.ICONS.focusOn
        : this.ICONS.focusOff;
      focusBtn.title = this.focusMode
        ? this.t("wm_focus_on")
        : this.t("wm_focus_off");

      focusBtn.onclick = (e) => {
        e.stopPropagation();
        this.toggleFocusMode();
      };

      btnGroup.appendChild(createBtn);
      btnGroup.appendChild(focusBtn);
      container.prepend(btnGroup);
    }

    injectWormholeDisplay(titleContainer) {
      if (!this._isValidChannelHeader(titleContainer)) {
        console.warn("[Wormhole] Rejected invalid inject target:", titleContainer);
        return;
      }

      document.querySelectorAll(".my-wormhole-container").forEach((c) => {
        if (c.parentElement !== titleContainer) {
          console.warn("[Wormhole] Removing stray container from:", c.parentElement);
          c.remove();
        }
      });

      if (titleContainer.querySelector(".my-wormhole-container")) return;

      const wrapper = document.createElement("div");
      wrapper.className = "my-wormhole-container";

      titleContainer.appendChild(wrapper);

      this.renderWormholes(wrapper);
    }

    createNewWormhole() {
      const url = prompt(this.t("wm_url_prompt"));
      if (!url) return;

      if (!this.validateUrl(url)) {
        alert(this.t("wm_alert_invalid_url"));
        return;
      }

      const data = this.getData();

      let groupOptions = "";
      if (data.groups.length > 0) {
        groupOptions = data.groups
          .map((g, i) => `${i + 1}. ${g.name}`)
          .join("\n");
      } else {
        groupOptions = "(無現有群組 / No existing groups)";
      }

      let groupChoice = prompt(
        this.t("wm_group_select_prompt").replace("{list}", groupOptions),
      );

      if (groupChoice === null) return;

      let targetGroup = null;
      let targetList = data.wormholes;

      const choice = groupChoice.trim();
      const index = parseInt(choice);

      if (choice === "") {
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
        }
      } else if (!isNaN(index)) {
        if (index === 0) {
          targetGroup = null;
          targetList = data.wormholes;
        } else if (index > 0 && index <= data.groups.length) {
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

      const defaultName = `${this.t("wm_default_channel_name")} ${targetList.length + 1}`;
      const name = prompt(this.t("wm_name_prompt"), defaultName);
      if (!name) return;

      const serverIcon = this.getCurrentServerIcon();

      const newWormhole = {
        id: Date.now() + 1,
        name: name.trim(),
        url: url.trim(),
        createdAt: new Date().toISOString(),
        icon: serverIcon || null,
      };

      targetList.push(newWormhole);

      if (this.saveData(data)) {
        this.showToast(this.t("wm_created"));
        const success = this.refreshDisplay();
        if (!success && confirm(this.t("wm_refresh_confirm"))) {
          window.location.reload();
        }
      }
    }

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
        if (this.getDockPosition() === "input") { this._injectInputDock(); return; }
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
      container.innerHTML = "";
      const data = this.getData();

      const row1 = document.createElement("div");
      row1.className = "wh-row-1";
      const row2 = document.createElement("div");
      row2.className = "wh-row-2";

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

      data.groups.forEach((group) => {
        if (group.wormholes.length > 0) {
          row1.appendChild(this.createGroupChip(group));
        }
      });

      data.wormholes.forEach((w) => {
        row1.appendChild(this.createWormholeChip({ ...w, isVIP: false }));
      });

      container.appendChild(row1);
      container.appendChild(row2);

      this.applyFocusMode(this.focusMode, container);

      this._scheduleBalanceRows(container);

      this._bindTooltips(container);

      if (this.getDockPosition() === "navbar") {
        this._bindNavbarRow2(container, row2);
      }
    }

    _bindNavbarRow2(container, row2) {
      row2.style.position = "fixed";
      row2.style.zIndex = "2147483640";
      row2.style.display = "flex";

      const show = () => {
        if (!row2.children.length) return;
        const rect = container.getBoundingClientRect();
        row2.style.left = rect.left + "px";
        row2.style.top  = (rect.bottom) + "px";
        row2.style.opacity = "1";
        row2.style.pointerEvents = "auto";
        row2.style.transform = "translateY(0)";
      };
      const hide = () => {
        row2.style.opacity = "0";
        row2.style.pointerEvents = "none";
        row2.style.transform = "translateY(-2px)";
      };

      container.addEventListener("mouseenter", show);
      container.addEventListener("mouseleave", (e) => {
        if (e.relatedTarget && row2.contains(e.relatedTarget)) return;
        hide();
      });
      row2.addEventListener("mouseleave", (e) => {
        if (e.relatedTarget && container.contains(e.relatedTarget)) return;
        hide();
      });

      hide();
    }
    _bindTooltips(container) {
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

      const chips = container.querySelectorAll(
        ".my-wormhole-chip, .my-wormhole-vip-chip",
      );
      chips.forEach((chip) => {
        const name = chip.dataset.wormholeName;
        if (!name) return;

        if (chip.dataset.tooltipBound) return;
        chip.dataset.tooltipBound = "1";

        const isVip = chip.classList.contains("my-wormhole-vip-chip");

        chip.addEventListener("mouseenter", (e) => {
          tip.textContent = name;
          tip.style.color = isVip ? "#ffd700" : "#e3e5e8";
          const rect = chip.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.bottom + 7;
          tip.style.left = "0px";
          tip.style.top = "0px";
          tip.style.opacity = "1";
          requestAnimationFrame(() => {
            const tw = tip.offsetWidth;
            const safeX = Math.min(
              Math.max(x - tw / 2, 6),
              window.innerWidth - tw - 6,
            );
            tip.style.left = `${safeX}px`;
            tip.style.top = `${y}px`;
          });
        });

        chip.addEventListener("mouseleave", () => {
          tip.style.opacity = "0";
        });
      });
    }

    _scheduleBalanceRows(container) {
      requestAnimationFrame(() => {
        this._balanceRows(container);
      });
    }

    _balanceRows(container) {
      const ROW1_MAX = 11;
      if (!container || !document.body.contains(container)) return;

      const row1 = container.querySelector(".wh-row-1");
      const row2 = container.querySelector(".wh-row-2");
      if (!row1 || !row2) return;

      while (row2.firstChild) {
        row1.appendChild(row2.firstChild);
      }

      const chips = Array.from(row1.children);
      chips.slice(ROW1_MAX).forEach((chip) => row2.appendChild(chip));
    }
    createVIPChip(wormhole) {
      const chip = document.createElement("div");
      chip.className = "my-wormhole-vip-chip";
      chip.dataset.wormholeName = wormhole.name;
      chip.dataset.wormholeId = wormhole.id;

      const iconHtml = wormhole.icon
        ? `<img src="${wormhole.icon}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;" draggable="false">`
        : `<span class="vip-icon">${this.ICONS.star}</span>`;

      chip.innerHTML = `
            ${iconHtml}
            <span class="vip-text">${escHtml(wormhole.name)}</span>
        `;
      chip.dataset.wormholeUrl = wormhole.url;

      chip.draggable = true;
      DEBUG && console.log("[VIP Chip] Created:", wormhole.name, "draggable:", chip.draggable, "id:", wormhole.id);

      this.attachChipEvents(chip, wormhole, true);
      this.attachDragEvents(chip, wormhole, "vip");
      return chip;
    }

    createWormholeChip(wormhole) {
      const chip = document.createElement("div");
      chip.className = "my-wormhole-chip";
      chip.dataset.wormholeName = wormhole.name;
      chip.dataset.wormholeId = wormhole.id;

      const iconHtml = wormhole.icon
        ? `<img src="${wormhole.icon}" style="width:16px;height:16px;border-radius:50%;object-fit:cover;" class="my-wormhole-icon" draggable="false">`
        : `<span class="my-wormhole-icon">${this.ICONS.portal}</span>`;

      chip.innerHTML = `${iconHtml}<span class="item-name">${escHtml(wormhole.name)}</span>`;
      chip.dataset.wormholeUrl = wormhole.url;

      chip.draggable = true;
      DEBUG && console.log("[Wormhole Chip] Created:", wormhole.name, "draggable:", chip.draggable, "id:", wormhole.id);

      this.attachChipEvents(chip, wormhole, false);
      this.attachDragEvents(chip, wormhole, "normal");
      return chip;
    }

    createGroupChip(group) {
      const chip = document.createElement("div");
      chip.className = "my-wormhole-group-chip";
      chip.dataset.groupId = group.id;

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
      let mouseDownPos = null;

      const startPress = (e) => {
        if (isDraggingNow) return;
        isLongPress = false;
        mouseDownPos = { x: e.clientX, y: e.clientY };

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

      chip.addEventListener("dragstart", () => {
        isDraggingNow = true;
        cancelPress();
      });

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

      chip.addEventListener("mousemove", (e) => {
        if (mouseDownPos && pressTimer) {
          const deltaX = Math.abs(e.clientX - mouseDownPos.x);
          const deltaY = Math.abs(e.clientY - mouseDownPos.y);
          if (deltaX > 5 || deltaY > 5) {
            cancelPress();
          }
        }
      });

      chip.addEventListener("mouseup", cancelPress);
      chip.addEventListener("mouseleave", cancelPress);

      chip.addEventListener("click", (e) => {
        if (isDraggingNow) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

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
      });

      chip.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.createWormholeContextMenu(wormhole, chip);
      });
    }

    attachDragEvents(chip, wormhole, type) {
      let dragStartX = 0;
      let dragStartY = 0;
      let hasDragged = false;
      let isDragging = false;

      chip.addEventListener("dragstart", (e) => {
        DEBUG && console.log("[Drag] dragstart triggered for:", wormhole.name, "id:", wormhole.id);

        dragStartX = e.clientX;
        dragStartY = e.clientY;
        hasDragged = false;
        isDragging = true;

        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({
            wormholeId: wormhole.id,
            type: type,
          }),
        );

        DEBUG && console.log("[Drag] Drag data set:", { wormholeId: wormhole.id, type });

        const dragImage = chip.cloneNode(true);
        dragImage.style.opacity = "0.7";
        dragImage.style.position = "absolute";
        dragImage.style.top = "-9999px";
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 20, 20);
        setTimeout(() => dragImage.remove(), 0);

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

        document.querySelectorAll(".drag-over").forEach((el) => {
          el.classList.remove("drag-over");
        });

        if (hasDragged) {
          e.preventDefault();
          e.stopPropagation();
        }
      });

      chip.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        if (!chip.classList.contains("dragging")) {
          chip.classList.add("drag-over");
        }
      });

      chip.addEventListener("dragleave", (e) => {
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
          const draggedType = dragData.type;
          const targetId = parseInt(wormhole.id);
          const targetType = type;

          DEBUG && console.log("[Drag] Drop data:", {
            draggedId,
            targetId,
            draggedType,
            targetType,
          });

          if (draggedType !== targetType) {
            console.warn("[Drag] 跨區塊拖曳被拒絕，保持原本的分類邊界");
            return;
          }

          if (draggedId === targetId) {
            DEBUG && console.log("[Drag] Same wormhole, skipping swap");
            return;
          }

          DEBUG && console.log("[Drag] Swapping:", draggedId, "↔", targetId);
          this.swapWormholes(draggedId, targetId, targetType);
        } catch (err) {
          console.error("[Drag] Failed to parse data:", err);
        }
      });
    }

    swapWormholes(draggedId, targetId, listType) {
      const data = this.getData();
      draggedId = parseInt(draggedId);
      targetId = parseInt(targetId);

      DEBUG && console.log("[Swap] Start swapping:", draggedId, "↔", targetId, "in", listType);

      if (listType === "vip") {
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
          item.className = "dropdown-item disabled";

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

      const folderIcon = chip.querySelector(".group-icon");
      if (folderIcon) {
        folderIcon.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openGroupIconPicker(group);
        });
      }
    }

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
        item.innerHTML = label;
        if (isDanger) item.style.color = "#ed4245";
        item.onclick = (e) => {
          e.stopPropagation();
          onClick();
          dropdown.classList.remove("show");
        };
        dropdown.appendChild(item);
      };

      addItem(this.t("wm_menu_edit"), "✎", () => this.editWormhole(wormhole));
      addItem(this.t("wm_menu_send"), "✉️", () => this.openSendMessageOverlay(wormhole));

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

      const addItem = (label, icon, onClick, isDanger = false) => {
        const item = document.createElement("div");
        item.className = "my-menu-item";

        item.innerHTML = label;

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

    getApiMode() {
      return localStorage.getItem("wh_api_mode") === "true";
    }

    setApiMode(enabled) {
      localStorage.setItem("wh_api_mode", String(enabled));
    }

    getDockPosition() {
      const raw = localStorage.getItem("wh_dock_position") || "navbar";
      if (raw === "header") return "titlebar";
      return raw;
    }

    setDockPosition(pos) {
      localStorage.setItem("wh_dock_position", pos);
    }

    switchDockPosition(pos) {
      this.setDockPosition(pos);

      document.querySelectorAll(".my-wormhole-container").forEach(c => c.remove());
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
        this._injectNavbarDock();
      }
    }

    _injectNavbarDock() {
      if (document.getElementById("wh-navbar-dock")) return;
      const trailingGroup = document.querySelector('div[class*="trailing_"]');
      if (!trailingGroup) return;

      const dock = document.createElement("div");
      dock.id = "wh-navbar-dock";
      const wrapper = document.createElement("div");
      wrapper.className = "my-wormhole-container";
      dock.appendChild(wrapper);

      document.body.appendChild(dock);
      this.renderWormholes(wrapper);

      const reposition = () => {
        const rect = trailingGroup.getBoundingClientRect();
        dock.style.left = (rect.left - dock.offsetWidth - 6) + "px";
        dock.style.top  = (rect.top + (rect.height - dock.offsetHeight) / 2) + "px";
      };

      requestAnimationFrame(() => {
        reposition();
        this._navbarDockReposition = reposition;
        window.addEventListener("resize", reposition);
        this._navbarRafPending = false;
        this._navbarDockRepositionThrottled = () => {
          if (this._navbarRafPending) return;
          this._navbarRafPending = true;
          requestAnimationFrame(() => { this._navbarRafPending = false; reposition(); });
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

    _injectTitlebarDock(retryCount = 0) {
      if (document.getElementById("wh-titlebar-dock")) return;

      const titleSection = document.querySelector('section[class*="title_"]');
      if (!titleSection) {
        if (retryCount < 5) {
          setTimeout(() => this._injectTitlebarDock(retryCount + 1), 200);
        }
        return;
      }

      const dock = document.createElement("div");
      dock.id = "wh-titlebar-dock";
      titleSection.parentNode.insertBefore(dock, titleSection.nextSibling);

      const wrapper = document.createElement("div");
      wrapper.className = "my-wormhole-container";
      dock.appendChild(wrapper);
      this.renderWormholes(wrapper);
    }

    _injectInputDock() {

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
        console.warn("[WH Dock] Could not find chat input area, will retry on next DOM change");
        return;
      }

      const parentEl = anchorEl.parentNode;
      const parentStyle = window.getComputedStyle(parentEl);
      if (parentStyle.display === "flex" && parentStyle.flexDirection === "row") {
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
      const existing = document.getElementById("wh-settings-menu");
      if (existing) { existing.remove(); return; }

      const menu = document.createElement("div");
      menu.id = "wh-settings-menu";

      const currentDock = this.getDockPosition();

      const titleEl = document.createElement("div");
      titleEl.id = "wh-sm-title";
      titleEl.textContent = this.t("wm_settings_menu_title");
      menu.appendChild(titleEl);

      const actions = [
        { key: "wm_settings_create",    icon: "➕", action: () => { menu.remove(); this.createNewWormhole(); } },
        { key: "wm_settings_send_mode", icon: "✉️", action: () => { menu.remove(); this.openApiModePanel(); } },
      ];
      actions.forEach(({ key, icon, action }) => {
        const row = document.createElement("div");
        row.className = "wh-sm-item";
        row.innerHTML = `<span class="wh-sm-icon">${icon}</span><span>${this.t(key)}</span>`;
        row.onclick = action;
        menu.appendChild(row);
      });

      const sep = document.createElement("div");
      sep.className = "wh-sm-sep";
      menu.appendChild(sep);

      const posHeader = document.createElement("div");
      posHeader.className = "wh-sm-section";
      posHeader.textContent = this.t("wm_settings_position");
      menu.appendChild(posHeader);

      const positions = [
        { pos: "navbar",   key: "wm_settings_position_navbar",   icon: "🧭" },
        { pos: "titlebar", key: "wm_settings_position_titlebar",  icon: "📌" },
        { pos: "input",    key: "wm_settings_position_input",     icon: "⌨️" },
        { pos: "topleft",  key: "wm_settings_position_topleft",   icon: "📍" },
      ];
      positions.forEach(({ pos, key, icon }) => {
        const isActive = currentDock === pos;
        const sub = document.createElement("div");
        sub.className = "wh-sm-item wh-sm-pos" + (isActive ? " wh-sm-active" : "");
        sub.innerHTML = `
          <span class="wh-sm-icon">${icon}</span>
          <span class="wh-sm-pos-label">${this.t(key)}</span>
          <span class="wh-sm-radio">${isActive ? "●" : "○"}</span>`;
        if (!isActive) sub.onclick = () => { menu.remove(); this.switchDockPosition(pos); };
        menu.appendChild(sub);
      });

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
          sizeRow.className = "wh-sm-item wh-sm-pos" + (isActive ? " wh-sm-active" : "");
          sizeRow.innerHTML = `<span class="wh-sm-pos-label">${this.t(key)}</span><span class="wh-sm-radio">${isActive ? "●" : "○"}</span>`;
          if (!isActive) sizeRow.onclick = () => { menu.remove(); this.setFocusSize(val); this.applyFocusMode(true); };
          menu.appendChild(sizeRow);
        });
      }

      if (!document.getElementById("wh-settings-menu-styles")) {
        const s = document.createElement("style");
        s.id = "wh-settings-menu-styles";
        s.textContent = `
          #wh-settings-menu{position:fixed;z-index:2147483646;background:#2b2d31;border:1px solid rgba(255,255,255,.1);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.7);padding:4px;min-width:220px;animation:wh-sm-in .14s cubic-bezier(.19,1,.22,1)}
          @keyframes wh-sm-in{from{opacity:0;transform:scale(.94) translateY(-5px)}to{opacity:1;transform:none}}
          #wh-sm-title{color:#72767d;font-size:10px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;padding:6px 12px 4px}
          .wh-sm-sep{height:1px;background:rgba(255,255,255,.07);margin:4px 0}
          .wh-sm-section{color:#72767d;font-size:10px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;padding:6px 12px 3px;margin-top:2px}
          .wh-sm-item{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:6px;color:#dbdee1;font-size:13px;cursor:pointer;transition:background .1s}
          .wh-sm-item:hover{background:rgba(88,101,242,.18);color:#fff}
          .wh-sm-pos{padding:5px 10px}
          .wh-sm-pos.wh-sm-active{color:#fff;cursor:default}
          .wh-sm-pos.wh-sm-active:hover{background:transparent}
          .wh-sm-pos-label{flex:1}
          .wh-sm-radio{font-size:11px;color:#72767d;flex-shrink:0}
          .wh-sm-active .wh-sm-radio{color:#5865f2}
          .wh-sm-icon{width:18px;text-align:center;font-size:14px;flex-shrink:0}
        `;
        document.head.appendChild(s);
      }

      document.body.appendChild(menu);

      const rect = anchorEl.getBoundingClientRect();
      const mw = 220;
      let left = rect.left;
      let top  = rect.bottom + 6;
      if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
      menu.style.left = `${left}px`;
      menu.style.top  = `${top}px`;

      const onOutside = (e) => {
        if (!menu.contains(e.target) && e.target !== anchorEl) {
          menu.remove();
          document.removeEventListener("mousedown", onOutside, true);
        }
      };
      setTimeout(() => document.addEventListener("mousedown", onOutside, true), 0);
    }

    openApiModePanel() {
      if (document.getElementById("wh-api-panel")) return;

      let panelApiMode = this.getApiMode();
      const hasToken   = !!this._cachedToken;

      const tokenSectionEnabled = () => panelApiMode;

      const panel = document.createElement("div");
      panel.id = "wh-api-panel";

      const interceptorCode =
`// 同時攔截 XHR 與 fetch，取得後立即還原（單次觸發）
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
              ${hasToken
                ? `${this.t("wm_api_token_status_ready")}：${this._cachedToken.substring(0, 8)}***`
                : this.t("wm_api_token_status_none")}
            </div>
            <div id="wh-api-token-actions">
              <button id="wh-api-detect-btn" ${(hasToken || !panelApiMode) ? "disabled" : ""}>
                ${this.t("wm_api_detect_btn")}
              </button>
              <button id="wh-api-clear-token-btn" ${(!hasToken || !panelApiMode) ? "disabled" : ""}>
                ${this.t("wm_api_clear_token")}
              </button>
            </div>
            <div id="wh-api-detect-status">${hasToken ? "" : (panelApiMode ? `<span style="color:#f0b232;font-weight:500;">${this.t("wm_api_detect_waiting")}</span>` : this.t("wm_api_plan_b_first"))}</div>
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
          #wh-api-modal{position:relative;background:#2b2d31;border:1px solid rgba(88,101,242,.5);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.8);padding:20px 24px 18px;width:min(520px,92vw);display:flex;flex-direction:column;gap:16px;animation:wh-in .2s cubic-bezier(.19,1,.22,1)}
          @keyframes wh-in{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}
          #wh-api-header{display:flex;align-items:center;justify-content:space-between}
          #wh-api-title{color:#e3e5e8;font-size:15px;font-weight:700;letter-spacing:.01em}
          #wh-api-close{background:transparent;border:none;color:#72767d;font-size:18px;cursor:pointer;padding:2px 6px;border-radius:4px;line-height:1}
          #wh-api-close:hover{color:#fff;background:rgba(255,255,255,.08)}
          #wh-api-mode-row{display:flex;flex-direction:column;gap:8px}
          .wh-api-radio{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;border:1.5px solid rgba(255,255,255,.08);color:#b5bac1;font-size:13px;cursor:pointer;transition:all .15s}
          .wh-api-radio.active{border-color:rgba(88,101,242,.6);background:rgba(88,101,242,.1);color:#fff}
          .wh-api-radio input{accent-color:#5865f2}
          #wh-api-warning{background:rgba(237,66,69,.08);border:1px solid rgba(237,66,69,.3);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
          #wh-api-warning-title{color:#ed4245;font-size:13px;font-weight:700}
          #wh-api-warning-body{color:#c4c9ce;font-size:12px;line-height:1.6}
          #wh-api-code-details summary{color:#72767d;font-size:11px;cursor:pointer;margin-top:6px}
          #wh-api-code{background:#1e1f22;color:#b5bac1;font-size:11px;padding:8px;border-radius:4px;overflow-x:auto;margin-top:6px;white-space:pre-wrap;word-break:break-all}
          #wh-api-token-section{display:flex;flex-direction:column;gap:8px;transition:opacity .2s}
          #wh-api-token-section.disabled{opacity:.35;pointer-events:none}
          #wh-api-token-status{font-size:12px;color:#72767d;padding:8px 12px;background:#1e1f22;border-radius:6px;border:1px solid rgba(255,255,255,.06)}
          #wh-api-token-status.ok{color:#2dc770;border-color:rgba(45,199,112,.3)}
          #wh-api-token-actions{display:flex;gap:8px;flex-wrap:wrap}
          #wh-api-detect-btn{padding:7px 14px;border-radius:6px;background:rgba(88,101,242,.15);border:1px solid rgba(88,101,242,.4);color:#8a98f8;font-size:13px;cursor:pointer;transition:all .15s}
          #wh-api-detect-btn:hover:not(:disabled){background:rgba(88,101,242,.3);color:#fff}
          #wh-api-detect-btn:disabled{opacity:.4;cursor:not-allowed}
          #wh-api-clear-token-btn{padding:7px 14px;border-radius:6px;background:transparent;border:1px solid rgba(237,66,69,.35);color:#ed4245;font-size:13px;cursor:pointer;transition:all .15s}
          #wh-api-clear-token-btn:hover:not(:disabled){background:rgba(237,66,69,.1)}
          #wh-api-clear-token-btn:disabled{opacity:.25;cursor:not-allowed}
          #wh-api-detect-status{font-size:11px;color:#72767d;min-height:16px}
          #wh-api-footer{display:flex;align-items:center;justify-content:space-between;padding-top:4px;border-top:1px solid rgba(255,255,255,.06)}
          #wh-api-reset-btn{background:transparent;border:none;color:#4e5058;font-size:12px;cursor:pointer;padding:4px 8px;border-radius:4px}
          #wh-api-reset-btn:hover{color:#ed4245;background:rgba(237,66,69,.08)}
          #wh-api-footer-right{display:flex;gap:8px}
          #wh-api-cancel-btn{padding:7px 16px;border-radius:6px;background:transparent;border:1px solid #4e5058;color:#dbdee1;font-size:13px;cursor:pointer}
          #wh-api-cancel-btn:hover{background:rgba(255,255,255,.06)}
          #wh-api-apply-btn{padding:7px 18px;border-radius:6px;background:#5865f2;border:none;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s}
          #wh-api-apply-btn:hover:not(:disabled){background:#4752c4}
          #wh-api-apply-btn:disabled{background:#3c4270;color:#72767d;cursor:not-allowed}
        `;
        document.head.appendChild(s);
      }

      document.body.appendChild(panel);

      const closePanel = () => panel.remove();

      const tokenSection  = panel.querySelector("#wh-api-token-section");
      const tokenStatus   = panel.querySelector("#wh-api-token-status");
      const detectBtn     = panel.querySelector("#wh-api-detect-btn");
      const clearTokenBtn = panel.querySelector("#wh-api-clear-token-btn");
      const detectStatus  = panel.querySelector("#wh-api-detect-status");
      const applyBtn      = panel.querySelector("#wh-api-apply-btn");

      const refreshTokenUI = () => {
        const tok = this._cachedToken;
        tokenSection.className  = panelApiMode ? "" : "disabled";
        tokenStatus.className   = tok ? "ok" : "";
        tokenStatus.textContent = tok
          ? `${this.t("wm_api_token_status_ready")}：${tok.substring(0, 8)}***`
          : this.t("wm_api_token_status_none");
        detectBtn.disabled     = !panelApiMode || !!tok;
        clearTokenBtn.disabled = !panelApiMode || !tok;
        applyBtn.disabled      = panelApiMode && !tok;
        applyBtn.textContent   = panelApiMode
          ? this.t("wm_api_enable_btn")
          : this.t("wm_api_disable_btn");
        if (!panelApiMode) {
          detectStatus.textContent = "請先選擇方案 B";
          applyBtn.disabled = false;
        } else if (!tok) {
          detectStatus.innerHTML = `<span style="color:#f0b232;font-weight:500;">${this.t("wm_api_detect_waiting")}</span>`;
        } else {
          detectStatus.textContent = "";
        }
      };

      panel.querySelector("#wh-api-backdrop").onclick   = closePanel;
      panel.querySelector("#wh-api-close").onclick      = closePanel;
      panel.querySelector("#wh-api-cancel-btn").onclick = closePanel;

      panel.querySelector("#wh-api-reset-btn").onclick = () => {
        closePanel();
        this.resetAllData();
      };

      panel.querySelectorAll('input[name="wh-mode"]').forEach(radio => {
        radio.addEventListener("change", () => {
          panelApiMode = radio.value === "b";
          panel.querySelectorAll(".wh-api-radio").forEach(l => l.classList.remove("active"));
          radio.closest(".wh-api-radio").classList.add("active");
          refreshTokenUI();

          if (panelApiMode && !this._cachedToken) {
            this._startTokenInterceptor((token) => {
              this._cachedToken = token;
              refreshTokenUI();
            });
          }
        });
      });

      detectBtn.onclick = () => {
        if (!confirm(this.t("wm_api_detect_confirm"))) return;
        this._startTokenInterceptor((token) => {
          this._cachedToken = token;
          refreshTokenUI();
        });
      };

      clearTokenBtn.onclick = () => {
        this._stopTokenInterceptor();
        this._cachedToken = null;
        refreshTokenUI();
      };

      applyBtn.onclick = () => {
        this.setApiMode(panelApiMode);
        this.showToast(panelApiMode ? this.t("wm_api_enabled_toast") : this.t("wm_api_disabled_toast"));
        if (panelApiMode && !this._cachedToken) {
          this._startTokenInterceptor((token) => {
            this._cachedToken = token;
            console.log("[WH API] Token pre-fetched after mode switch ✅");
          });
        } else if (!panelApiMode) {
          this._stopTokenInterceptor();
          this._cachedToken = null;
        }
        closePanel();
      };

      refreshTokenUI();
      if (panelApiMode && !this._cachedToken) {
        this._startTokenInterceptor((token) => {
          this._cachedToken = token;
          refreshTokenUI();
        });
      }
    }

    _startTokenInterceptor(onToken) {
      if (this._tokenWatcher) return;

      const uw = (typeof unsafeWindow !== "undefined") ? unsafeWindow : window;
      const self = this;
      let stopped = false;

      const handleToken = (token) => {
        if (stopped) return;
        if (!token || token === "undefined" || token.startsWith("Bot ")) return;
        stopped = true;
        uw.XMLHttpRequest.prototype.setRequestHeader = origXhrSetHeader;
        uw.fetch = origFetch;
        self._tokenWatcher = null;
        console.log("[WH API] Token intercepted ✅ (length:", token.length, ")");
        onToken(token);
      };

      const origXhrSetHeader = uw.XMLHttpRequest.prototype.setRequestHeader;
      const origFetch = uw.fetch;

      uw.XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        try {
          if (name.toLowerCase() === "authorization") {
            handleToken(value);
          }
        } catch (_) {}
        return origXhrSetHeader.apply(this, arguments);
      };

      uw.fetch = function(...args) {
        try {
          const url = typeof args[0] === "string"
            ? args[0]
            : (args[0] instanceof Request ? args[0].url : (args[0]?.url || ""));
          const headers = args[1]?.headers;
          if (url.includes("discord.com/api") && headers) {
            let token = null;
            if (typeof headers.get === "function") {
              token = headers.get("Authorization") || headers.get("authorization");
            } else if (typeof headers === "object") {
              token = headers["Authorization"] || headers["authorization"] || null;
            }
            if (token) handleToken(token);
          }
        } catch (_) {}
        return origFetch.apply(this, args);
      };

      this._tokenWatcher = () => {
        stopped = true;
        uw.XMLHttpRequest.prototype.setRequestHeader = origXhrSetHeader;
        uw.fetch = origFetch;
      };
      console.log("[WH API] Token interceptor started (XHR + fetch via unsafeWindow)");
    }

    _stopTokenInterceptor() {
      if (this._tokenWatcher) {
        this._tokenWatcher();
        this._tokenWatcher = null;
        console.log("[WH API] Token interceptor stopped");
      }
    }

    openSendMessageOverlay(wormhole) {
      if (document.getElementById("wh-send-overlay")) return;

      const overlay = document.createElement("div");
      overlay.id = "wh-send-overlay";
      const ph = this.t("wm_send_placeholder").replace("#{name}", wormhole.name);

      const apiUnlocked = localStorage.getItem("wh_api_mode") !== null;
      let   isApiMode   = this.getApiMode();
      const hasToken    = !!this._cachedToken;
      const needsToken  = isApiMode && !hasToken;

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
            <textarea id="wh-send-input" placeholder="${ph}" rows="3" maxlength="2000"></textarea>
            <div id="wh-send-paste-hint">${this.t("wm_send_paste_hint")}</div>
            <div id="wh-send-paste-preview"></div>
          </div>
          <hr id="wh-send-divider">
          <div id="wh-send-footer">
            <div id="wh-send-footer-left">
              ${apiUnlocked ? `
              <button id="wh-send-mode-toggle" class="${isApiMode ? "is-api" : "is-nav"}">
                ${isApiMode
                  ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> ${this.t("wm_send_mode_api")}`
                  : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg> ${this.t("wm_send_mode_nav")}`
                }
              </button>
              <span id="wh-send-mode-desc">${isApiMode ? this.t("wm_send_mode_desc_api") : this.t("wm_send_mode_desc_nav")}</span>
              ` : ""}
            </div>
            <div id="wh-send-actions">
              <button id="wh-send-cancel-btn">${this.t("wm_send_cancel")}</button>
              <button id="wh-send-submit-btn">${this.t("wm_send_btn")}</button>
            </div>
          </div>
          <div id="wh-send-bottom-row">
            <div id="wh-send-checkboxes">
              <label id="wh-send-autoclose-label">
                <input type="checkbox" id="wh-send-autoclose" ${localStorage.getItem("wh_send_autoclose") !== "false" ? "checked" : ""}>
                <span>${this.t("wm_send_autoclose")}</span>
              </label>
              <label id="wh-send-goto-label" class="${localStorage.getItem("wh_send_autoclose") !== "false" ? "cb-disabled" : ""}">
                <input type="checkbox" id="wh-send-goto" ${localStorage.getItem("wh_send_goto") === "true" ? "checked" : ""} ${localStorage.getItem("wh_send_autoclose") !== "false" ? "disabled" : ""}>
                <span>${this.t("wm_send_goto_channel")}</span>
              </label>
              <label id="wh-send-show-toast-label">
                <input type="checkbox" id="wh-send-show-toast" ${localStorage.getItem("wh_send_show_toast") !== "false" ? "checked" : ""}>
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
          #wh-send-modal{position:relative;background:#2b2d31;border:1px solid rgba(88,101,242,.35);border-radius:10px;box-shadow:0 16px 48px rgba(0,0,0,.7);padding:18px 20px 14px;width:min(560px,92vw);display:flex;flex-direction:column;gap:12px;animation:wh-in .18s cubic-bezier(.19,1,.22,1)}
          @keyframes wh-in{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
          #wh-send-header{display:flex;align-items:center;justify-content:space-between}
          #wh-send-title{color:#e3e5e8;font-size:14px;font-weight:600;display:flex;align-items:center;flex:1}
          #wh-send-close{background:transparent;border:none;color:#72767d;font-size:18px;cursor:pointer;padding:2px 6px;border-radius:4px;line-height:1}
          #wh-send-close:hover{color:#fff;background:rgba(255,255,255,.08)}
          #wh-send-token-warn{font-size:12px;color:#f0b232;padding:6px 10px;background:rgba(240,178,50,.08);border-radius:6px;border:1px solid rgba(240,178,50,.2)}
          #wh-send-dropzone{position:relative;display:flex;flex-direction:column;gap:6px}
          #wh-send-input{width:100%;box-sizing:border-box;background:#1e1f22;color:#dbdee1;border:1.5px solid rgba(88,101,242,.25);border-radius:6px;padding:10px 12px;font-size:14px;line-height:1.5;resize:vertical;min-height:72px;max-height:220px;outline:none;font-family:inherit;transition:border-color .15s}
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
            color:#b5bac1;
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
          #wh-send-autoclose-label,#wh-send-goto-label,#wh-send-show-toast-label{display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;font-size:12px;color:#72767d;transition:color .15s,opacity .15s}
          #wh-send-autoclose-label:hover,#wh-send-goto-label:hover,#wh-send-show-toast-label:hover{color:#b5bac1}
          #wh-send-autoclose-label input,#wh-send-goto-label input,#wh-send-show-toast-label input{accent-color:#5865f2;cursor:pointer;width:13px;height:13px}
          #wh-send-goto-label.cb-disabled{opacity:.35;cursor:not-allowed;pointer-events:none}
          #wh-send-status{font-size:12px;color:#72767d;text-align:right}
          #wh-send-status.err{color:#ed4245}
          #wh-send-status.ok{color:#23a55a}
          #wh-send-cancel-btn{padding:7px 16px;border-radius:3px;background:transparent;border:none;color:#dbdee1;font-size:14px;cursor:pointer;transition:background .1s}
          #wh-send-cancel-btn:hover{background:rgba(255,255,255,.06)}
          #wh-send-submit-btn{padding:7px 18px;border-radius:3px;background:#5865f2;border:none;color:#fff;font-size:14px;font-weight:500;cursor:pointer;transition:background .15s}
          #wh-send-submit-btn:hover:not(:disabled){background:#4752c4}
          #wh-send-submit-btn:disabled{background:#3c4270;color:#72767d;cursor:not-allowed}
        `;
        document.head.appendChild(s);
      }

      document.body.appendChild(overlay);

      const input       = overlay.querySelector("#wh-send-input");
      const status      = overlay.querySelector("#wh-send-status");
      const submitBtn   = overlay.querySelector("#wh-send-submit-btn");
      const modeDesc    = overlay.querySelector("#wh-send-mode-desc");
      const autocloseEl   = overlay.querySelector("#wh-send-autoclose");
      const gotoEl        = overlay.querySelector("#wh-send-goto");
      const gotoLabel     = overlay.querySelector("#wh-send-goto-label");
      const showToastEl   = overlay.querySelector("#wh-send-show-toast");

      const syncMutex = () => {
        const acChecked = autocloseEl.checked;
        gotoLabel.classList.toggle("cb-disabled", acChecked);
        gotoEl.disabled = acChecked;
        if (acChecked) gotoEl.checked = false;
      };

      autocloseEl.addEventListener("change", () => {
        localStorage.setItem("wh_send_autoclose", autocloseEl.checked ? "true" : "false");
        syncMutex();
      });

      gotoEl.addEventListener("change", () => {
        localStorage.setItem("wh_send_goto", gotoEl.checked ? "true" : "false");
      });

      showToastEl.addEventListener("change", () => {
        localStorage.setItem("wh_send_show_toast", showToastEl.checked ? "true" : "false");
      });
      const preview   = overlay.querySelector("#wh-send-paste-preview");
      let pendingFiles = [];

      const setStatus = (msg, cls = "") => { status.textContent = msg; status.className = cls; };
      const lock = (on) => {
        [input, submitBtn,
          overlay.querySelector("#wh-send-cancel-btn"),
          overlay.querySelector("#wh-send-close"),
        ].forEach(el => { if (el) el.disabled = on; });
      };
      const escHandler = (e) => { if (e.key === "Escape") closeOverlay(); };
      const closeOverlay = () => { overlay.remove(); document.removeEventListener("keydown", escHandler); };

      overlay.querySelector("#wh-send-backdrop").onclick   = closeOverlay;
      overlay.querySelector("#wh-send-close").onclick      = closeOverlay;
      overlay.querySelector("#wh-send-cancel-btn").onclick = closeOverlay;
      document.addEventListener("keydown", escHandler);

      const toggleBtn = overlay.querySelector("#wh-send-mode-toggle");
      if (toggleBtn) {
        const descEl = overlay.querySelector("#wh-send-mode-desc");
        toggleBtn.onclick = () => {
          isApiMode = !isApiMode;
          this.setApiMode(isApiMode);
          toggleBtn.className = isApiMode ? "is-api" : "is-nav";
          toggleBtn.innerHTML = isApiMode
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> ${this.t("wm_send_mode_api")}`
            : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg> ${this.t("wm_send_mode_nav")}`;
          if (descEl) descEl.textContent = isApiMode ? this.t("wm_send_mode_desc_api") : this.t("wm_send_mode_desc_nav");
        };
      }

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
        rm.onclick = () => {
          pendingFiles.splice(idx, 1);
          wrap.remove();
          URL.revokeObjectURL(img.src);
        };
        wrap.appendChild(img);
        wrap.appendChild(rm);
        preview.appendChild(wrap);
      };

      input.addEventListener("paste", (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        let hasImage = false;
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            hasImage = true;
            const file = item.getAsFile();
            if (file) addThumb(file);
          }
        }
        if (hasImage) e.preventDefault();
      });

      input.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); submitBtn.click(); }
      });
      requestAnimationFrame(() => input.focus());

      submitBtn.onclick = async () => {
        const text    = input.value.trim();
        const hasImg  = pendingFiles.length > 0;

        if (!text && !hasImg) {
          setStatus(this.t("wm_send_empty"), "err");
          input.focus();
          return;
        }

        lock(true);
        try {
          if (this.getApiMode() && !this._cachedToken && this._tokenWatcher) {
            setStatus(this.t("wm_send_waiting_token"));
            await new Promise((resolve) => {
              const deadline = Date.now() + 4000;
              const poll = setInterval(() => {
                if (this._cachedToken || Date.now() >= deadline) {
                  clearInterval(poll);
                  resolve();
                }
              }, 100);
            });
          }

          const useApi = this.getApiMode() && !!this._cachedToken;

          if (useApi) {
            const ok = await this._sendViaApi(wormhole, text, setStatus, hasImg ? pendingFiles : []);
            if (!ok) {
              setStatus(this.t("wm_api_send_fail"), "err");
              lock(false);
              return;
            }
          } else {
            const ok = await this._sendViaWormhole(wormhole, text, setStatus, hasImg ? pendingFiles : []);
            if (!ok) {
              setStatus(this.t("wm_send_fail"), "err");
              lock(false);
              return;
            }
          }

          pendingFiles = [];
          preview.innerHTML = "";

          setStatus(this.t("wm_send_success").replace("#{name}", wormhole.name), "ok");
          if (localStorage.getItem("wh_send_show_toast") !== "false") {
            this._showSendToast(wormhole);
          }

          const autoClose = localStorage.getItem("wh_send_autoclose") !== "false";
          const gotoChannel = !autoClose && localStorage.getItem("wh_send_goto") === "true";

          if (gotoChannel) {
            setTimeout(() => {
              closeOverlay();
              this.navigateToChannel(wormhole.url);
            }, 600);
          } else if (autoClose) {
            setTimeout(closeOverlay, 1200);
          } else {
            setTimeout(() => {
              input.value = "";
              pendingFiles = [];
              preview.innerHTML = "";
              setStatus("", "");
              lock(false);
              input.focus();
            }, 1200);
          }
        } catch (err) {
          console.error("[WH Send]", err);
          setStatus(this.t("wm_send_fail"), "err");
          lock(false);
        }
      };
    }

    async _sendImagesViaA(wormhole, files, text, setStatus) {
      const originUrl   = window.location.href;
      const targetPath  = (() => { try { return new URL(wormhole.url).pathname; } catch { return null; } })();
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
      if (!result) { setStatus(this.t("wm_send_editor_missing"), "err"); return false; }
      const { editor, slateEl } = result;

      editor.children = [{ type: "line", children: [{ text: "" }] }];
      editor.onChange();
      await this._tick(60);

      if (text) {
        slateEl.focus();
        if (!editor.selection) {
          editor.selection = { anchor: { path: [0,0], offset: 0 }, focus: { path: [0,0], offset: 0 } };
        }
        editor.insertText(text);
        await this._tick(80);
      }

      setStatus(this.t("wm_send_uploading", { n: files.length }));

      const dt = new DataTransfer();
      for (const file of files) dt.items.add(file);

      slateEl.focus();
      await this._tick(60);
      slateEl.dispatchEvent(new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }));

      await this._tick(600);

      slateEl.focus();
      await this._tick(60);
      slateEl.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter", code: "Enter", keyCode: 13, which: 13,
        bubbles: true, cancelable: true, composed: true,
        shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
      }));
      DEBUG && console.log("[WH Send] Image + text dispatched via paste+Enter");

      if (!alreadyHere) {
        await this._waitForEditorClear(2000);
        setStatus(this.t("wm_send_returning"));
        this.navigateToChannel(originUrl);
      }
      return true;
    }

    async _sendViaApi(wormhole, text, setStatus, files = []) {
      let channelId = null;
      try {
        const pathname = new URL(wormhole.url).pathname;
        const m = pathname.match(/\/channels\/[^/]+\/(\d+)/);
        if (m) channelId = m[1];
      } catch (_) {}

      if (!channelId) {
        console.error("[WH API] Cannot parse channelId from URL:", wormhole.url);
        setStatus("❌ 無法解析頻道 ID，請確認蟲洞連結格式", "err");
        return false;
      }

      if (!this._cachedToken) {
        console.error("[WH API] No token available");
        setStatus("❌ Token 不存在，請重新偵測", "err");
        return false;
      }

      const hasFiles = files && files.length > 0;

      const buildRequest = async () => {
        if (!hasFiles) {
          return {
            headers: {
              "Content-Type": "application/json",
              "Authorization": this._cachedToken,
            },
            data: JSON.stringify({
              content: text,
              nonce: String(Math.floor(Math.random() * 1e13)),
              tts: false,
            }),
          };
        }

        const formData = new FormData();
        const attachments = files.map((f, i) => ({
          id: String(i),
          filename: f.name || `image_${i}.png`,
        }));
        formData.append("payload_json", JSON.stringify({
          content: text || "",
          nonce: String(Math.floor(Math.random() * 1e13)),
          tts: false,
          attachments,
        }));
        for (let i = 0; i < files.length; i++) {
          formData.append(`files[${i}]`, files[i], files[i].name || `image_${i}.png`);
        }

        const blob = await new Promise(resolve => {
          const req = new Request("", { method: "POST", body: formData });
          req.blob ? req.blob().then(resolve) : resolve(null);
        }).catch(() => null);

        return {
          headers: {
            "Authorization": this._cachedToken,
          },
          data: formData,
        };
      };

      const reqOpts = await buildRequest();
      const doRequest = () => new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: "POST",
          url: `https://discord.com/api/v10/channels/${channelId}/messages`,
          headers: reqOpts.headers,
          data: reqOpts.data,
          timeout: 30000,
          onload: (res) => resolve(res),
          onerror: (err) => resolve({ status: 0, _err: err }),
          ontimeout: ()  => resolve({ status: 0, _err: "timeout" }),
        });
      });

      setStatus(hasFiles ? "📡 上傳圖片並傳送..." : "📡 傳送中...");
      let res = await doRequest();

      if (res.status === 429) {
        let retryAfterMs = 1000;
        try {
          const body = JSON.parse(res.responseText);
          retryAfterMs = Math.ceil((body.retry_after || 1) * 1000) + 100;
        } catch (_) {}
        console.warn(`[WH API] Rate limited. Waiting ${retryAfterMs}ms...`);
        setStatus(`⏳ 速率限制，${Math.ceil(retryAfterMs / 1000)}s 後重試...`);
        await new Promise(r => setTimeout(r, retryAfterMs));
        res = await doRequest();
      }

      if (res.status === 200 || res.status === 201) {
        DEBUG && console.log(`[WH API] Message sent ✅ → channel ${channelId}${hasFiles ? ` (+${files.length} file(s))` : ""}`);
        return true;
      }

      let detail = `HTTP ${res.status}`;
      try {
        const body = JSON.parse(res.responseText);
        const codeMap = {
          10003: "頻道不存在",
          50001: "沒有存取權限",
          50013: "缺少傳送訊息的權限",
          50035: "訊息內容不合規",
          40002: "必須先驗證身分",
        };
        const code = body.code;
        detail = codeMap[code] ? `${codeMap[code]} (${code})` : `${body.message || ""} (${code || res.status})`;
        console.error("[WH API] Send failed:", body);
      } catch (_) {
        if (res._err) console.error("[WH API] Network error:", res._err);
      }

      setStatus(`❌ 傳送失敗：${detail}`, "err");
      return false;
    }

    async _sendViaWormhole(wormhole, text, setStatus, files = []) {
      if (files.length > 0) {
        return this._sendImagesViaA(wormhole, files, text, setStatus);
      }

      const originUrl   = window.location.href;
      const targetPath  = (() => { try { return new URL(wormhole.url).pathname; } catch { return null; } })();
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
          if (this._getSlateEditor())  { clearInterval(timer); resolve(true);  return; }
          if (Date.now() >= deadline)  { clearInterval(timer); resolve(false); }
        }, 80);
      });
    }

    _waitForEditorClear(timeout = 1500) {
      return new Promise((resolve) => {
        const deadline = Date.now() + timeout;
        const timer = setInterval(() => {
          const ed = this._getSlateEditor();
          const isEmpty = !ed || (ed.editor?.children?.[0]?.children?.[0]?.text === "");
          if (isEmpty || Date.now() >= deadline) { clearInterval(timer); resolve(); }
        }, 80);
      });
    }

    _getSlateEditor() {
      const sl = document.querySelector('[data-slate-editor="true"]');
      if (!sl) return null;
      const fk = Object.keys(sl).find(k => k.startsWith("__reactFiber"));
      if (!fk) return null;
      let fiber = sl[fk];
      for (let i = 0; i < 15 && fiber; i++) {
        const ed = fiber.memoizedProps?.editor;
        if (ed && typeof ed.insertText === "function" && typeof ed.onChange === "function") {
          return { editor: ed, slateEl: sl };
        }
        fiber = fiber.return;
      }
      return null;
    }

    async _injectAndSend(text) {
      const result = this._getSlateEditor();
      if (!result) { console.error("[WH Send] Cannot get Slate editor"); return false; }
      const { editor, slateEl } = result;
      try {
        editor.children = [{ type: "line", children: [{ text: "" }] }];
        editor.onChange();
        await this._tick(80);

        slateEl.focus();
        if (!editor.selection) {
          editor.selection = { anchor: { path: [0,0], offset: 0 }, focus: { path: [0,0], offset: 0 } };
        }
        editor.insertText(text);
        await this._tick(100);

        const inserted = editor.children?.[0]?.children?.[0]?.text || "";
        if (!inserted) { console.error("[WH Send] insertText failed"); return false; }

        slateEl.focus();
        await this._tick(60);
        slateEl.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13,
          bubbles: true, cancelable: true, composed: true,
          shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
        }));
        console.log("[WH Send] Enter dispatched");
        return true;
      } catch (err) {
        console.error("[WH Send] _injectAndSend error:", err);
        return false;
      }
    }

    _tick(ms) { return new Promise(r => setTimeout(r, ms)); }

    _positionMenu(menu, triggerEl) {
      const gap = 8;
      menu.style.position = "fixed";
      menu.style.top  = "-9999px";
      menu.style.left = "-9999px";
      requestAnimationFrame(() => {
        const rect = triggerEl.getBoundingClientRect();
        const mh = menu.offsetHeight || 160;
        const mw = menu.offsetWidth  || 160;
        const spaceBelow = window.innerHeight - rect.bottom - gap;

        const top = spaceBelow >= mh
          ? rect.bottom + gap
          : Math.max(gap, rect.top - mh - gap);

        let left = rect.left;
        if (left + mw > window.innerWidth - gap) left = window.innerWidth - mw - gap;
        if (left < gap) left = gap;

        menu.style.top  = `${top}px`;
        menu.style.left = `${left}px`;
      });
    }

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
      else data.wormholes.push(tempWormhole);

      this.saveData(data);
      this.refreshDisplay();
    }

    deleteWormhole(wormhole) {
      if (!confirm(this.t("em_del_confirm", { k: wormhole.name }))) return;
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

    deleteGroup(group) {
      if (!confirm(this.t("wm_group_del_confirm", { n: group.name }))) return;
      const data = this.getData();
      const target = data.groups.find((g) => g.id === group.id);
      if (target) {
        data.wormholes.push(...target.wormholes);
        data.groups = data.groups.filter((g) => g.id !== group.id);
        if (data.groupIcons && data.groupIcons[group.id]) {
          delete data.groupIcons[group.id];
        }
        this.saveData(data);
        this.refreshDisplay();
      }
    }

    openGroupIconPicker(group) {
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

      const close = () => {
        modal.remove();
      };

      modal.querySelector(".picker-close").onclick = close;
      modal.querySelector(".wormhole-icon-picker-overlay").onclick = close;

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
          item.innerHTML = `<img src="${url}" alt="emoji">`;
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

    getCurrentServerIcon() {
      try {
        const selectedServer = document.querySelector(
          '[class*="wrapper"][aria-selected="true"]',
        );
        if (selectedServer) {
          const iconImg = selectedServer.querySelector('img[class*="icon"]');
          if (iconImg && iconImg.src) {
            return iconImg.src.replace(/size=\d+/, "size=128");
          }
        }

        const pathParts = window.location.pathname.split("/");
        if (
          pathParts[1] === "channels" &&
          pathParts[2] &&
          pathParts[2] !== "@me"
        ) {
          const guildId = pathParts[2];

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

        console.log("[Wormhole] No server icon found");
        return null;
      } catch (e) {
        console.error("[Wormhole] Failed to get server icon:", e);
        return null;
      }
    }

    findReactFiber(element) {
      if (!element) return null;
      const key = Object.keys(element).find((k) =>
        k.startsWith("__reactFiber"),
      );
      return element[key] || null;
    }

    findGuildDataInFiber(fiber, guildId) {
      let current = fiber;
      let depth = 100;

      while (current && depth-- > 0) {
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

        if (current.stateNode) {
          const state = current.stateNode;
          if (state.guild && state.guild.id === guildId) {
            return state.guild;
          }
        }

        current = current.child || current.sibling || current.return;
      }

      return null;
    }

    getFocusSize() {
      return localStorage.getItem("wormhole_focus_size") || "m";
    }

    setFocusSize(size) {
      localStorage.setItem("wormhole_focus_size", size);
    }

    _focusSizePx(size) {
      return { s: 20, m: 28, l: 38 }[size] ?? 28;
    }

    openFocusSizeMenu(anchorEl) {
      const existingMenu = document.getElementById("wh-focus-size-menu");
      if (existingMenu) { existingMenu.remove(); return; }

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
            this.applyFocusMode(true);
          };
        }
        menu.appendChild(row);
      });

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
      let top  = rect.bottom + 5;
      if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
      menu.style.left = `${left}px`;
      menu.style.top  = `${top}px`;

      const onOutside = (e) => {
        if (!menu.contains(e.target) && e.target !== anchorEl) {
          menu.remove();
          document.removeEventListener("mousedown", onOutside, true);
        }
      };
      setTimeout(() => document.addEventListener("mousedown", onOutside, true), 0);
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

      const focusBtn = document.querySelector(".my-wormhole-focus-btn");
      if (focusBtn) {
        focusBtn.innerHTML = newMode ? this.ICONS.focusOn : this.ICONS.focusOff;
        focusBtn.title = newMode
          ? this.t("wm_focus_on")
          : this.t("wm_focus_off");
      }

      this.applyFocusMode(newMode);

    }

    applyFocusMode(enabled, containerEl = null) {
      const container = containerEl || document.querySelector(".my-wormhole-container");

      const sz = this._focusSizePx(this.getFocusSize());
      const vipSz      = Math.round(sz * 0.78);
      const imgSz      = Math.round(sz * 0.82);
      const vipImgSz   = Math.round(vipSz * 0.82);
      const iconFs     = Math.round(sz * 0.62);
      const overlap    = "-" + Math.round(sz * 0.22) + "px";
      const vipOverlap = "-" + Math.round(vipSz * 0.2) + "px";

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
    }

    showToast(msg, emoji = "✅") {
      if (typeof showEmojiToast === "function") showEmojiToast(msg);
      else alert(emoji + " " + msg);
    }

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

      const timer = setTimeout(() => dismiss(false), 3000);
      toast.addEventListener("click", () => clearTimeout(timer), { once: true });
    }

    t(key, params = {}) {
      if (typeof t === "function") return t(key, params);
      return key;
    }

    validateUrl(url) {
      return url && url.includes("/channels/");
    }

    navigateToChannel(fullUrl) {
      try {
        const urlObj = new URL(fullUrl);
        const targetPath = urlObj.pathname + urlObj.search + urlObj.hash;
        if (window.location.pathname === targetPath) return true;

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

    _isValidChannelHeader(el) {
      if (!el) return false;

      if (el.closest('nav[class*="guilds"]')) return false;
      if (el.closest('ul[class*="guilds"]')) return false;
      if (el.closest('[class*="panels_"]')) return false;
      if (el.closest('[class*="privateChannels_"]')) return false;
      if (el.closest('[class*="membersWrap_"]')) return false;
      if (el.closest('[class*="searchResultsWrap_"]')) return false;

      if (el.querySelector('[class*="guildIcon_"]')) return true;

      if (el.querySelector('[data-text-variant]')) return true;

      if (el.getAttribute("role") === "button" && el.getAttribute("aria-label")) return true;

      return false;
    }

    _removeStrayContainers() {
      const dockPos = this.getDockPosition();
      document.querySelectorAll(".my-wormhole-container").forEach((c) => {
        const parent = c.parentElement;
        if (!parent) { c.remove(); return; }

        if (dockPos === "input") {
          if (parent.id === "wh-input-dock") return;
          console.warn("[Wormhole] Removing stray container (input mode) from:", parent);
          c.remove();
          return;
        }
        if (dockPos === "navbar") {
          if (parent.id === "wh-navbar-dock") return;
          console.warn("[Wormhole] Removing stray container (navbar mode) from:", parent);
          c.remove();
          return;
        }
        if (dockPos === "topleft") {
          if (parent.id === "wh-topleft-dock") return;
          console.warn("[Wormhole] Removing stray container (topleft mode) from:", parent);
          c.remove();
          return;
        }
        if (parent.id === "wh-titlebar-dock") return;
        if (this._isValidChannelHeader(parent)) return;
        console.warn("[Wormhole] Removing stray container from:", parent);
        c.remove();
      });
    }

    setupObserver() {
      let debounceTimer = null;
      this.observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this._removeStrayContainers();

          const trailingGroup = document.querySelector('div[class*="trailing_"]');
          if (trailingGroup) this.injectCreatorButton(trailingGroup);

          const pos = this.getDockPosition();

          if (pos === "input") {
            if (!document.getElementById("wh-input-dock")) this._injectInputDock();
            return;
          }

          if (pos === "navbar") {
            if (!document.getElementById("wh-navbar-dock")) this._injectNavbarDock();
            return;
          }

          if (pos === "topleft") {
            if (!document.getElementById("wh-topleft-dock")) this._injectTopLeftDock();
            return;
          }

          if (!document.getElementById("wh-titlebar-dock")) this._injectTitlebarDock();
        }, 100);
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
    }

    _setupModalWatcher() {
      const MODAL_SEL = '[class*="carouselModal_"], [class*="imageModal_"], [class*="layerModal_"]';
      const setNavbarDockVisibility = (visible) => {
        const dock = document.getElementById("wh-navbar-dock");
        if (dock) dock.style.opacity = visible ? "1" : "0";
        if (dock) dock.style.pointerEvents = visible ? "auto" : "none";
      };

      const check = () => {
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
            .my-wormhole-vip-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: transparent; border-radius: 6px; color: #ffd700; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; position: relative; overflow: hidden; }
            .my-wormhole-vip-chip:hover { transform: translateY(-2px); text-shadow: 0 0 8px rgba(255, 215, 0, 0.6); }
            .my-wormhole-group-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; background: rgba(88, 101, 242, 0.1); border: 1.5px solid rgba(88, 101, 242, 0.3); border-radius: 5px; color: #5865f2; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; margin-right: 6px; }
            .my-wormhole-group-chip:hover { background: rgba(88, 101, 242, 0.2); border-color: rgba(88, 101, 242, 0.5); transform: translateY(-1px); }
            .my-wormhole-chip { background: rgba(30, 31, 34, 0.6); border: 1px solid rgba(88, 101, 242, 0.3); color: #dbdee1; font-size: 12px; font-weight: 500; padding: 2px 8px; border-radius: 12px; cursor: pointer; user-select: none; transition: all 0.2s; display: flex; align-items: center; gap: 4px; white-space: nowrap; margin-right: 4px; max-width: 120px; }
            .my-wormhole-chip .item-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
            .my-wormhole-chip:hover { background: rgba(88, 101, 242, 0.2); border-color: #5865F2; color: #fff; transform: translateY(-1px); }
            .my-wormhole-dropdown { position: fixed; background: #2b2d31; border: 1px solid #1e1f22; border-radius: 6px; box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4); padding: 4px; z-index: 10000; min-width: 200px; max-height: 300px; overflow-y: auto; }
            .dropdown-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 4px; color: #dbdee1; font-size: 13px; cursor: pointer; transition: all 0.15s ease; }
            .dropdown-item:hover { background: rgba(88, 101, 242, 0.2); color: #fff; }
            .dropdown-item.disabled { opacity: 0.5; pointer-events: none; }
            .item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .item-pin-btn { background: transparent; border: none; padding: 4px; cursor: pointer; border-radius: 3px; opacity: 0.6; display: flex; align-items: center; }
            .item-pin-btn:hover { opacity: 1; background: rgba(255, 215, 0, 0.1); transform: scale(1.15); }
            .my-wormhole-creator-btn { color: #b5bac1; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin: 0 4px; transition: color 0.2s; }
            .my-wormhole-creator-btn:hover { color: #5865F2; }
            .my-wormhole-focus-btn { color: #b5bac1; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; transition: all 0.2s; }
            .my-wormhole-focus-btn:hover { color: #5865F2; transform: scale(1.1); }
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
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(88,101,242,0.3);
            }
            .wh-row-2 .my-wormhole-vip-chip {
                border-color: rgba(255, 215, 0, 0.45);
            }
            .wh-row-2 .my-wormhole-vip-chip:hover {
                background: rgba(255, 215, 0, 0.15);
                border-color: rgba(255, 215, 0, 0.8);
                box-shadow: 0 4px 12px rgba(255,215,0,0.25);
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
            /* VIP hover：放大回原始 48px，覆蓋 scale，用明確尺寸展開 */
            .my-wormhole-container.focus-mode .my-wormhole-vip-chip:hover {
                width: 40px !important;
                height: 40px !important;
                max-width: 40px !important;
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(255, 215, 0, 0.8);
                margin-right: 0;
                z-index: 10;
            }
            .my-wormhole-container.focus-mode .my-wormhole-vip-chip:hover img {
                width: 32px !important;
                height: 32px !important;
            }
            .my-wormhole-container.focus-mode .my-wormhole-vip-chip:hover .vip-icon {
                font-size: 28px;
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
        `;
      document.head.appendChild(style);
    }

    destroy() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      clearTimeout(this.refreshTimer);
      clearTimeout(this.dropdownCloseTimer);
      this.closeAllDropdowns();
    }
  }

  if (isModEnabled("mod_wormhole")) {
    const wormholeModule = new WormholeModule();
    wormholeModule.initialize();
    window.wormholeModule = wormholeModule;

    if (DEBUG) {
      window.testWormhole = () => {
        console.log("=== Wormhole Pro Debug ===");
        const data = window.wormholeModule.getData();
        console.log("Groups:", data.groups);
        console.log("VIP Wormholes:", data.vipWormholes);
        console.log("Total Wormholes:", window.wormholeModule.getAllWormholes().length);
      };
    }
  }

  if (isModEnabled("mod_forwarding")) initForwardingManager();
  if (isModEnabled("mod_message"))    initMessageUtility();
  if (isModEnabled("mod_emoji"))      initEmojiSearchHelper();
  if (isModEnabled("mod_header"))     initHeaderMods();

  if (!isModEnabled("mod_message")) {
    const rescueBtn = document.createElement("div");
    rescueBtn.id = "dmt-rescue-btn";
    rescueBtn.title = t("mod_msg_enable_menu");
    rescueBtn.textContent = "⚙️";
    rescueBtn.style.cssText = [
      "position:fixed",
      "bottom:20px",
      "right:20px",
      "z-index:2147483646",
      "width:36px",
      "height:36px",
      "border-radius:50%",
      "background:#5865f2",
      "color:#fff",
      "font-size:18px",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "cursor:pointer",
      "box-shadow:0 2px 10px rgba(0,0,0,0.5)",
      "user-select:none",
      "opacity:0.5",
      "transition:opacity 0.2s",
    ].join(";");
    rescueBtn.onmouseenter = () => { rescueBtn.style.opacity = "1"; };
    rescueBtn.onmouseleave = () => { rescueBtn.style.opacity = "0.5"; };
    rescueBtn.onclick = () => {
      const existing = document.getElementById("mod-settings-panel-rescue");
      if (existing) { existing.remove(); return; }
      const lang = getConfig().lang || navigator.language || "en-US";
      const getLang = (labels) => labels[lang] || labels["zh-TW"] || labels["en-US"];
      const overlay = document.createElement("div");
      overlay.id = "mod-settings-panel-rescue";
      overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);";
      const box = document.createElement("div");
      box.style.cssText = "background:#2b2d31;border-radius:12px;padding:20px 24px;min-width:280px;max-width:360px;color:#dcddde;font-size:13px;box-shadow:0 12px 40px rgba(0,0,0,0.6);";
      const title = document.createElement("div");
      title.style.cssText = "font-size:15px;font-weight:700;color:#fff;margin-bottom:14px;";
      title.textContent = "⚙️ Discord Message Toolkit";
      box.appendChild(title);
      MODULE_DEFS.forEach(mod => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.06);";
        const nameSpan = document.createElement("span");
        nameSpan.textContent = `${mod.icon} ${getLang(mod.label)}`;
        const enabled = isModEnabled(mod.storageKey);
        const toggleEl = document.createElement("div");
        toggleEl.style.cssText = `width:34px;height:18px;border-radius:9px;background:${enabled ? "#5865f2" : "#4f545c"};position:relative;cursor:pointer;transition:background 0.2s;flex-shrink:0;`;
        const thumb = document.createElement("div");
        thumb.style.cssText = `width:14px;height:14px;border-radius:50%;background:#fff;position:absolute;top:2px;left:${enabled ? "18px" : "2px"};transition:left 0.2s;`;
        toggleEl.appendChild(thumb);
        toggleEl.onclick = () => {
          const nowOn = isModEnabled(mod.storageKey);
          const next = !nowOn;
          setModEnabled(mod.storageKey, next);
          toggleEl.style.background = next ? "#5865f2" : "#4f545c";
          thumb.style.left = next ? "18px" : "2px";
          setTimeout(() => location.reload(), 400);
        };
        row.appendChild(nameSpan);
        row.appendChild(toggleEl);
        box.appendChild(row);
      });
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "✕ " + ({"zh-TW":"關閉","zh-CN":"关闭","ja":"閉じる","ko":"닫기"}[lang] || "Close");
      closeBtn.style.cssText = "margin-top:14px;width:100%;padding:7px;border:none;border-radius:6px;background:#4f545c;color:#fff;cursor:pointer;font-size:13px;";
      closeBtn.onclick = () => overlay.remove();
      box.appendChild(closeBtn);
      overlay.appendChild(box);
      overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
    };
    document.addEventListener("DOMContentLoaded", () => document.body.appendChild(rescueBtn));
    if (document.body) document.body.appendChild(rescueBtn);
  }

  console.log("[Discord Utilities] Modules loaded:", MODULE_DEFS.map(m => `${m.icon}${isModEnabled(m.storageKey) ? "✓" : "✗"}`).join(" "));
})();
