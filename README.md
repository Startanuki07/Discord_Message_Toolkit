

[![Version](https://img.shields.io/badge/Version-1.4.4-blue.svg)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()


**A userscript that adds a message utility toolbar, an enhanced forwarding panel, cross-channel shortcuts, an expression collection manager, and a set of header utility controls to the Discord web client.**



> 💡 **Overview**
> The core of this script is the **Message Utility Toolbar** — a per-message toolbar for copying text, downloading media, and converting social media URLs. All other modules are supplementary additions. These bonus features may be less stable or less suited to every workflow. Each module can be individually enabled or disabled at any time via the **⚙️ Module Settings** panel accessible from the toolbar.

<details open>
  <summary><small style="color: #666;">Hide image</small></summary>
  <img src="https://greasyfork.s3.us-east-2.amazonaws.com/98fl32fpnvfmdtk5g5wnnoyxhblh" alt="Image">
</details>
<details>
  <summary><small style="color: #666;">Show image</small></summary>
  <img src="https://greasyfork.s3.us-east-2.amazonaws.com/q2t9xn23vkjom40iexg2xu1yu1e1" alt="Image">
</details>
## 🎛 UI Entry Points

| Icon | Feature Name | Description |
| --- | --- | --- |
| ⠿ | Message Utility Toolbar | Appears on hover (or click, if configured) at the top-right corner of any message. |
| 📋 | Forwarding Manager | Embedded inside Discord's native Forward modal. Adds pinned channels, history, and fuzzy search. |
| 😀 | Expression Manager | Accessible inside the emoji/GIF picker panel. Manages saved expression collections. |
| 🌀 | Wormhole Panel | Rendered in the Discord sidebar as a persistent shortcut launcher for channels. |
| 🖱️ | Anti-Hijack Toggle | Injected into the Discord top bar (near the Inbox icon). Controls right-click context menu behavior. |
| 📄 | Conceal Name Toggle | Injected into the Discord top bar (near the Inbox icon). Controls upload filename masking. |

*These icons act as the primary entry points for the script's features.*

---

## 🚀 Core Features

### 🛠️ Message Utility Toolbar

*Appears when hovering over (or clicking on) any Discord message.*

* **Text Copying**: Copy the full message text, or insert it directly into the chat input box. Long-press the copy button (0.5s) to insert; Shift+Click to copy and insert simultaneously.
* **Link Utilities**: Extract and copy the first tracker-free URL, copy all links line-by-line, or format a link as a Markdown hyperlink.
* **Hidden Format**: Wrap message content in spoiler tags for one-click redaction.
* **Media Downloader**: Download all images or videos attached to a message in one click. Right-click any media item to copy its source URL directly to the clipboard.
* **URL Converter**: Convert social media links into embed-friendly proxy formats to restore Discord's link previews.
  * Twitter / X → vxtwitter, fixupx, fxtwitter, or cunnyx
  * Instagram → kkinstagram
  * Bilibili → FX Bilibili / VX Bilibili
  * Pixiv → phixiv / pixiv.cat → The original source of the work can be found by reconstructing the source URL image.
  * Use **Convert All (N)** to batch-process every link of the same type in one message.

> ⚠️ **Usage Notice**

---

This script converts **X / Twitter links** into **media-embeddable third-party service URLs**
(for example, formats similar to [https://fixupx.com/](https://fixupx.com/)).

It may also send messages using **Discord prefix formatting**, such as:

- `[text](https://x.com/i/status/123456)`

> This behavior may change how the link preview, source, and overall reading experience appear.

Before using, please make sure:

1. Your channel or server allows this type of link conversion.
2. It does not disrupt other members' reading, notifications, or normal usage.
3. You understand that third-party services may alter previews.

Please use responsibly and respect community expectations.

---

### 📋 Forwarding Manager

*Accessible when opening Discord's native Forward panel.*

* **Pinned Channels**: Save frequently used channels or users to a persistent quick-access bar at the top of the panel.
* **Fuzzy Search**: Click the ⏎ icon to search using partial keywords or abbreviations, bypassing Discord's default exact-match behavior.
* **History Log**: Automatically tracks recently forwarded destinations for quick re-selection.

### 🌀 Wormhole Shortcuts

*A persistent panel rendered in the Discord sidebar.*

* **Channel Shortcuts**: Paste any Discord channel URL into the Wormhole panel (click ＋) to create a one-click navigation shortcut.
* **Organization**: Right-click any Wormhole to rename, delete, set a custom icon, assign it to a named group folder, or mark it as VIP (auto-pinned to top).
* **Focus Mode**: Toggle the panel to icon-only compact view using the button at the top-right of the Wormhole panel.
* **Send Message Overlay**: Right-click a Wormhole → **Send Message Here** to open a send overlay without navigating away. Supports pasting images directly via Ctrl+V.
  * **Mode A (Navigate)**: Switches to the target channel, injects the text, then returns. No token required.
  * **Mode B (Direct API)**: Sends via the Discord API without any page transition. Requires opt-in token interception (see Security Notice below).
* **History Badges**: Purple badges display recently visited channels; click to return instantly.

### 😀 Expression Manager

*Integrated into Discord's emoji/GIF picker.*

* **Collections**: Organize emojis, stickers, and GIFs into custom named tabs.
* **Target Mode**: Activate Target Mode to save any GIF or sticker visible on screen with a single click.

### 🖱️ Anti-Hijack — Right-Click Context Menu Restore

*Two toggle buttons are injected into the Discord top bar, next to the Inbox icon. Both buttons support short-press and long-press interactions.*

By default, Discord intercepts all right-click events and replaces the browser's native context menu with its own. **Anti-Hijack** blocks this interception, restoring access to the browser's standard right-click menu on all elements within the page.

**How to use:**

* **Short-press** the 🖱️ button to toggle the behavior on or off for the current session. The button turns green when active.
* **Long-press (0.5s)** to toggle and save the state as the default for all future sessions.
* Hover over the button to see a multilingual status tooltip and the current saved default.

This feature is off by default and must be manually enabled.

### 🔒 Conceal Name — Upload Filename Masking

When uploading a file to Discord, the original filename is visible to all recipients. **Conceal Name** replaces the filename seen by Discord during upload with a randomly generated string, while preserving the original file extension.

The file content is not altered in any way — only the name visible to the recipient and stored on Discord's servers is replaced.

**How to use:**

* **Short-press** the 📄 button to toggle masking on or off for the current session. The button turns green when active.
* **Long-press (0.5s)** to toggle and save the state as the default for all future sessions.
* Hover over the button to see a multilingual status tooltip and the current saved default.

This feature is off by default and must be manually enabled.

---

## 🧪 Experimental Features & Known Limitations

* **Wormhole Mode A**: Sending via Mode A causes a brief visible page transition to the target channel before returning to the original view.
* **Third-Party URL Proxies**: URL conversion features depend on external open-source services (e.g., vxtwitter, kkinstagram). Availability is subject to the uptime of those domains. Do not use these conversions if you do not trust the respective third-party services.
* **Discord UI Compatibility**: This script injects UI elements into Discord's web client. Discord periodically updates its internal structure, which may temporarily break injected features until the script is updated.

---

## ⚙️ Settings & Module Control

### ⚙️ Module Toggle Panel

The script's five modules can be enabled or disabled individually without reinstalling the script. To access the panel, open the **⠿ Message Utility Toolbar** on any message and click the **⚙️** icon.

| Module | Default |
| --- | --- |
| ⠿ Message Utility Toolbar | On |
| 📋 Forwarding Manager | On |
| 😀 Expression Manager | On |
| 📌 Header Mods (Anti-Hijack + Conceal Name) | On |
| 🌀 Wormhole Shortcuts | On |

> The **Message Utility Toolbar** is the primary feature of this script. The remaining four modules are bonus additions — they may not work reliably in all environments, and their behavior depends on Discord's internal UI structure. If a module causes issues or is simply not needed, it can be turned off here without affecting the others.

### ⚙️ Additional Options

* **Toolbar Behavior**: Switch the Message Utility toolbar trigger between **Hover** and **Click** modes using the 🖱️ icon in the toolbar.
* **Menu Layout**: Toggle between Flat and Grouped menu styles using the ◫/≡ icon.
* **Custom String Panel**: Save reusable text snippets (☆ icon). Click to copy; long-press to insert into the chat box; Shift+Click to delete without confirmation.
* **Settings Backup**: Export all script settings (pinned channels, Wormholes, collections) as a JSON string via **Export Settings**, and restore them on any device via **Import Settings**.
* **Language Switching**: Switch the script UI language using the 🌐 icon. Supported: English, Traditional Chinese, Simplified Chinese, Japanese, Korean.

---

## 🔐 Security & Privacy Notice

> ⚠️ **This script includes an opt-in feature that accesses your Discord Authorization Token.**

| Data Type | Purpose | Storage | Transmitted To |
| --- | --- | --- | --- |
| Discord Auth Token | Authenticate direct API requests for Wormhole Mode B | Volatile memory (RAM) only — cleared on page close or refresh | `discord.com` official API endpoints only |

**This script does not collect, share, or transmit your credentials to any external server.**

> 💡 **This feature is opt-in only — no action means no risk.**
> Token access is triggered exclusively when you manually enable **Wormhole Mode B (Direct API)** by long-pressing the ＋ button for 1 second and confirming the consent prompt.
> All other features — including Mode A sending, message copying, URL conversion, media downloading, forwarding, expression management, Anti-Hijack, and Conceal Name — operate entirely without any credential access.
> If you choose to enable Mode B, a consent dialog will appear explaining the scope of access before anything is intercepted. Reviewing the source code beforehand is recommended.
>
> ⚠️ **TOS Notice**: Using a personal user token to make automated API requests is classified as "self-botting" under Discord's Terms of Service. This carries an inherent risk of account flagging or suspension. Users who enable Mode B do so at their own discretion and accept full responsibility for any consequences.

---

- This userscript is primarily maintained on Greasy Fork.
- Built with AI assistance by a hobbyist developer.
  Bug fixes and updates may not be immediate.
- Feedback is welcome. Responses may be assisted by translation tools if needed.
