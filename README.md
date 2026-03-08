# ✨ Discord Message Toolkit & Forward Manager

**An all-in-one enhancement script injecting a powerful hover toolbar, social media URL conversion, media extraction, advanced forwarding, and wormhole shortcuts into Discord.**

---

> 💡 **Overview**
> This script is designed to maximize operational efficiency and the sharing experience on Discord. Through seamlessly integrated UI components, it provides one-click copying of specific formats, fixes social media embed previews (Twitter/X, Instagram, Pixiv, etc.), enables batch media downloading, and introduces "Wormholes" for cross-channel quick sending alongside an advanced forwarding panel.

## 🎛 UI Entry Points

Upon installing the script, you can find dedicated integration buttons located in various corners of the Discord interface.

| Icon | Feature Name | Description |
| --- | --- | --- |
| **⠿** | **Hover Toolbar** | Appears in the top-right corner of any message upon hover, offering core actions like copy, convert, and extract. |
| **📋** | **Advanced Forwarding Panel** | Appears above the native Discord "Forward" popup, adding pinned channels and a fuzzy search bar. |
| **🌀** | **Wormhole** | Docked by default at the top navigation bar or above the chat input, providing quick cross-channel jumps and direct message sending. |

*These icons act as the primary entry points for the script's features.*

---

## 🚀 Core Features

### 🛠️ Message Utility & Extraction

Offers multiple practical copy formats to precisely extract key content from messages.

* **Plain Text & Media URLs**: One-click extraction of pure text or direct links to hidden images/videos.
* **Clean Link**: Automatically strips redundant tracking parameters from URLs.
* **Spoiler & Markdown Formatting**: Quickly wrap content in spoiler tags or specific Markdown structures.

```css
/* * Structural Mockup: Formatted Output
 *
 * [Markdown Output Format]
 * [{text}]({url})
 *
 * [Spoiler Hidden Format]
 * || {text} ||
 */

```

### 🔁 Social Media URL Conversion

Fixes Discord's inability to properly expand previews for certain social media platforms.

* **Twitter / X**: Converts to `vxtwitter`, `fixupx`, etc.
* **Instagram & Bilibili**: Converts to `ddinstagram` / `kkinstagram` or `FX Bilibili` to display full media previews.
* **Pixiv**: Converts to `phixiv` to make illustrations directly visible in the chat.
* **Batch Conversion**: Detects all similar URLs within a message and replaces them simultaneously.

### ⬇️ Media Downloader & Extractor

Efficiently manage and save media attachments.

* **One-Click Download (Left-Click)**: Instantly download all images and videos attached to a specific message.
* **Quick URL Extraction (Right-Click)**: Swiftly copy the direct source URLs of the media files directly to your clipboard without triggering a download.
* **Batch ZIP Archive**: Automatically bundle multiple media attachments into a single `.zip` file for efficient saving, eliminating the manual effort of saving items individually.

### 📋 Advanced Forwarding Manager

Enhances Discord's native forwarding window to improve multi-channel management efficiency.

* **Channel & User Pinning (★/👤)**: Add frequently used forwarding targets to favorites for top-level display.
* **Fuzzy Search (⏎)**: Supports prefix input to quickly match frequently changing channel names to ensure accurate forwarding.

### 🌀 Wormhole Shortcuts

Breaks down the switching barriers between channels by establishing dedicated portals.

* **Single-Click Jump**: Save frequently used channel URLs as Wormholes for instant teleportation.
* **Cross-Channel Sending (Shift+Click)**: Send messages to a target channel directly from your current view via a popup input box, without switching channels.

---

## ⚠️ Experimental Features & Notes

* **URL Conversion Reliance**: Services like `vxtwitter` and `kkinstagram` rely on third-party open-source APIs to provide media previews. If you have concerns regarding third-party endpoints, please avoid triggering the conversion options.
* **DOM Dependency**: This script highly depends on Discord's current web DOM structure. Major official UI updates may cause temporary breakage of specific features (e.g., hover toolbars or menu insertions).

---

## ⚙️ Additional Features

* **Custom Strings Panel**: Allows users to save frequently used greetings, commands, or text templates, supporting one-click copy or long-press injection into the chat input.
* **Observer Health Check**: Built-in MutationObserver status monitoring module. You can check the listener status anytime via the Tampermonkey menu to ensure system stability.
* **Settings Export/Import**: Provides full global settings backup in JSON format, facilitating seamless synchronization of your custom Wormholes and UI configurations across different browsers or devices.

---

## ⭐ Support the Project

If you feel this script is helpful to you, please consider visiting my GitHub repository to give it a ⭐.

[https://github.com/Startanuki07](https://github.com/Startanuki07)
