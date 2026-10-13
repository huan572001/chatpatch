# ChatPatch

**Download ZIPs from ChatGPT and automatically update source code on your computer.**

ChatPatch is a free Chrome extension that links **a ChatGPT conversation** to **a local project folder**. When you download a ZIP containing source code updated by ChatGPT, ChatPatch can extract and merge its files into the linked folder.

- Use it directly with **ChatGPT in Chrome**, without opening another chat application.
- **No OpenAI API key required**, and no need to install Node.js or run a server.
- Supports **multiple conversations ↔ multiple project folders**.
- Includes a **Vietnamese / English** interface.
- Runs on **Windows and macOS** with a compatible version of Google Chrome.

> [!IMPORTANT]
> **ChatPatch can automatically overwrite files in folders you authorize.** When using it for the first time, try it with **a copy of your project**, or commit/back up your source code with Git before enabling automatic sync. Automatic access to downloaded ZIPs depends on Chrome permissions and version; if it does not work, you can still select a ZIP manually.

## 1. How does ChatPatch work?

```text
Ask ChatGPT to update your code
                 ↓
ChatGPT creates a ZIP containing the updated source code
                 ↓
Click Download in the correct conversation
                 ↓
ChatPatch identifies the conversation and downloaded ZIP
                 ↓
Extract the ZIP, back up existing files, and merge into the local project
```

**Example:** You link the **chatpatch** conversation to `Projects/chatpatch`. After ChatGPT provides `chatpatch-updated.zip` and you click **Download**, ChatPatch attempts to update the files in `Projects/chatpatch` without creating another chatpatch project.

**ChatPatch does not automatically read source code from your computer and upload it to ChatGPT.** You must attach the ZIP/source code yourself at the start, or use source code already available in the conversation/Project. ChatGPT handles the code changes; ChatPatch processes downloaded ZIPs and syncs files.

## 2. Before you install

You need:

- A **Windows 10/11** or **macOS** computer.
- **Google Chrome** version 116 or later (a recent version is recommended).
- An account signed in at [chatgpt.com](https://chatgpt.com).
- The downloaded **ChatPatch** source ZIP.
- An existing project folder to link, such as `chatpatch`, `Portfolio`, or `My-Game`.

You **do not need** ChatGPT Plus to install ChatPatch; access to models and file creation features depends on your ChatGPT account.

## 3. Install ChatPatch in Chrome (one-time setup)

### Step 1 — Extract ChatPatch

1. Download the ChatPatch release file to your computer.
2. Extract the ZIP to a permanent location, such as `Documents/ChatPatch`.
3. Open the extracted directory and find the **`chatpatch-extension`** folder.
4. Check that it contains **`manifest.json`**. If you cannot find it, you are looking at the wrong folder level.

> Do not delete or move `chatpatch-extension` after installing it with **Load unpacked**, because Chrome needs to read the extension code from that location.

### Step 2 — Load the extension in Chrome

1. Open Chrome.
2. Paste `chrome://extensions` into the address bar and press **Enter**.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select **the `chatpatch-extension` folder itself**, which contains `manifest.json`.
6. Once Chrome displays **ChatPatch**, installation is complete.

**Tip:** Click the puzzle-piece icon (**Extensions**) in the upper-right corner of Chrome and **Pin** ChatPatch for easy access. Click the ChatPatch icon to open its side panel next to ChatGPT.

### Step 3 — Allow access to downloaded ZIPs (for automatic sync)

1. Return to `chrome://extensions`.
2. On the **ChatPatch** card, select **Details**.
3. Find and enable **Allow access to file URLs**.
4. Close and reopen the ChatPatch panel; check **Downloaded ZIP access**.

**Why is this permission needed?** ChatPatch v1.0.0 does not use an intermediate `ChatPatch-Sync` folder. To attempt automatic processing of ZIPs in your normal Downloads folder, the extension needs permission to read downloaded files using the `file://` URLs provided by Chrome.

> [!WARNING]
> **Allow access to file URLs** grants broader access than a single ZIP or folder. Enable it only if you trust the extension's source code. If you prefer not to grant this permission, **skip step 3** and use **Choose ZIP to apply** in section 6. Enabling the permission **does not guarantee** that Chrome on every computer will allow automatic ZIP access.

### Step 4 — Choose a language

Open the ChatPatch panel. In the upper-right corner, select **VN** (Vietnamese) or **EN** (English). Your choice is saved for future use. The instructions below use the English interface labels.

## 4. Link a conversation to a project folder

Do this **once for each conversation**.

### Step 1 — Open the correct ChatGPT conversation

1. Visit [chatgpt.com](https://chatgpt.com).
2. Open an existing conversation, such as the one you use to update **chatpatch**.
3. Wait for the page to load. Conversation URLs usually contain **`/c/`**, including conversations inside a ChatGPT Project.
4. Open the ChatPatch panel. Under **Current conversation**, you should see the conversation details if detection succeeds.

If you just created a conversation and its ID is not available yet, send the first message, then click **↻ Refresh** in ChatPatch.

### Step 2 — Select the correct local source folder

1. Under **Current conversation**, click **Link a folder to this chat**.
2. Chrome's folder picker opens, using Finder or File Explorer as appropriate.
3. Select **the root folder of the project you want to update**, such as `chatpatch` (containing `src`, `package.json`, etc.). **Do not select the parent `Projects` folder** if you only want to update chatpatch.
4. Grant **read/write** access when Chrome asks.
5. Check **Linked folders**: the selected conversation should display the destination folder name with sync enabled.

Examples:

| ChatGPT conversation | Linked local folder |
| --- | --- |
| Update the chatpatch interface | `D:\\Projects\\chatpatch` (Windows) |
| Gun Maze game | `D:\\Projects\\Gun-Maze` (Windows) |
| Personal website | `~/Projects/Portfolio` (macOS) |

**You can link multiple conversations to different folders.** Each link uses the **conversation ID**, rather than the conversation title. If you switch to another conversation, make sure it is linked before downloading a ZIP.

## 5. Use ChatPatch: from a code change request to a local update

### Step 1 — Provide source code to ChatGPT

In the linked conversation, click **+ / Add photos & files** to attach a ZIP containing your current source code. If the source is already available in the conversation/Project, confirm that ChatGPT can read the version you want to update.

### Step 2 — Request your changes

For example, you can copy this prompt:

> Read the source code in the ZIP I provided. Update the login page interface according to my requirements, keeping unrelated parts unchanged. After making the changes, export **a ZIP containing the complete updated source code**, rather than individual files only. Preserve the project's folder structure.

Wait for ChatGPT to finish and provide a ZIP download link.

### Step 3 — Click Download in the correct conversation

1. Stay in **the conversation linked** to the corresponding project folder.
2. Click **Download** on the ZIP generated by ChatGPT.
3. Chrome downloads the ZIP to its normal download location; you **do not need to create or select `ChatPatch-Sync`**.
4. If Chrome and its permissions support it, ChatPatch attempts to identify the ZIP, extract it, and merge the files into the linked folder.

**Download one ZIP at a time**, and avoid downloading ZIPs from multiple conversations simultaneously to reduce the risk of matching a file to the wrong project.

### Step 4 — Check the result

1. Open ChatPatch → **Activity** to see whether sync succeeded or failed.
2. Open the project folder in VS Code, File Explorer, or Finder and inspect the updated files.
3. If you use Git, run `git status` or `git diff` to review the changes.

**Important:** ChatPatch only updates local files. It **does not automatically replace the old ZIP attached to ChatGPT**. Before requesting another change, provide the latest source code if the conversation does not already contain it.

## 6. If Download does not update your source code

You can use manual mode. This does not require **Allow access to file URLs**.

1. Open **the correct conversation** linked to your project folder.
2. Download the resulting ZIP from ChatGPT if you have not done so already.
3. Open ChatPatch → **Sync tools**.
4. Click **Choose ZIP to apply**.
5. Select the correct downloaded ZIP on your computer and confirm the file picker.
6. Wait for ChatPatch to process it, then check **Activity** and your project folder.

You can also click **Check downloads** to inspect recent downloads detected by ChatPatch. If a ZIP previously failed to process, use **Retry failed ZIPs** under **Activity**, when available.

## 7. How does ChatPatch merge files?

For example, a ZIP generated by ChatGPT may contain a wrapper folder:

```text
chatpatch-updated.zip
└── chatpatch-updated/
    ├── package.json
    ├── src/
    │   └── Login.tsx
    └── public/
        └── logo.svg
```

You have linked the conversation to `Projects/chatpatch`. In **Auto** mode (the default), ChatPatch attempts to remove **one outer packaging folder** and merge its contents into the project root:

```text
Projects/chatpatch/
├── package.json       ← replaced if the ZIP contains an updated version
├── src/
│   └── Login.tsx      ← updated in the correct location
├── public/
│   └── logo.svg       ← added or replaced
└── ...                ← other files are preserved
```

Main rules:

- **Files at the same path:** replaced, with existing files backed up when changes occur.
- **New files:** added to the appropriate folder.
- **Files/folders absent from the ZIP:** not automatically deleted.
- **Folders such as `src`, `public`, and `assets`:** retain their structure inside the project.
- **Unsafe paths or sensitive files:** checked/blocked according to the extension's rules.

ChatPatch stores backups in **`.chatpatch-backups`** inside your project folder. If an error occurs during processing, **some files may already have been updated**: check Git, the backup folder, and activity history before retrying.

## 8. Common problems

| Problem | What to do |
| --- | --- |
| ChatPatch does not appear in Chrome | Open `chrome://extensions` and check that you used **Load unpacked** on the correct folder containing `manifest.json`. |
| ChatPatch does not detect the conversation | Open a specific conversation with `/c/` in its URL and click **↻ Refresh**. For a new conversation, send a message first. |
| No folder is linked | In the correct conversation, click **Link a folder to this chat** and select the correct project root. |
| Clicking Download does not sync files | Check **Allow access to file URLs**, **Activity**, and **Check downloads**. If it still fails, use **Choose ZIP to apply**. |
| Chrome asks you to grant folder access again | Open **Folder access** → **Restore folder access** and confirm each folder when prompted. |
| Updates went into the parent folder | Unlink or change the link to select **the actual project root**, rather than a folder containing multiple projects. |
| The ZIP contains a wrapper folder | Use **ZIP structure: Auto**. If the result is incorrect, check the link's wrapper-folder settings. |
| A file or folder cannot be found | Check that the ZIP is still in Downloads, the project folder is still in its original location, and read/write access is still valid. Try selecting the ZIP manually. |
| The ZIP is invalid or too large | Check that the ZIP extracts normally, is not corrupted, and does not exceed the limits below. |
| Some files were updated before an error | **Do not repeatedly trigger sync.** Review `git diff`, `.chatpatch-backups`, and the activity log first. |

## 9. Limits and privacy

### ZIP processing limits in v1.0.0

- Maximum ZIP size: **30 MB**.
- Maximum total extracted data: **120 MB**.
- Up to **3,000 files** and **6,000 entries** (files and folders combined) per ZIP.
- Maximum size of each extracted file: **12 MB**.
- Sensitive files/folders such as `.git`, `node_modules`, `.env`, and secret keys are blocked by protection rules.

### Where is your data processed?

ChatPatch processes ZIPs on your device and **does not require a ChatPatch account, API key, or separate server**. The extension is not designed to upload your source code to the developer's servers. However, **files you upload to a ChatGPT conversation are processed according to ChatGPT's policies**.

Enabling **Allow access to file URLs** grants the extension relatively broad local access. Install ChatPatch only from sources you trust, and inspect the source code if needed.

## 10. Update ChatPatch to a newer version

Because you installed it with **Load unpacked**, Chrome **does not automatically update** ChatPatch.

1. Download and extract the new version's source code.
2. **Keep the extension folder that Chrome is currently using.** Copy the new files into that folder, overwriting the old versions.
3. Open `chrome://extensions` and click **Reload** on the ChatPatch card.
4. Reload the ChatGPT tab and open ChatPatch to check your links.

**Do not click Remove** if you want to keep your saved conversation–folder links. If you remove the extension and install it as a new extension, your links may not be preserved.

## 11. Frequently asked questions

**Does ChatPatch require ChatGPT Plus?**

No. You only need a ChatGPT account with access to the upload/ZIP creation features required for your workflow.

**Does ChatPatch read and edit code instead of ChatGPT?**

No. ChatGPT analyzes the code, makes changes, and creates a ZIP. ChatPatch receives the downloaded ZIP and updates files in your selected folder.

**Can I use it with multiple projects?**

Yes. Each conversation can be linked to a separate folder. Download ZIPs one at a time to avoid confusion.

**Do I need a `ChatPatch-Sync` folder?**

No. Since v1.0.0, the extension uses Chrome's normal download location. The old intermediate folder is no longer needed.

**Can I undo an update?**

You can use Git or backups in `.chatpatch-backups` to restore files manually. ChatPatch does not guarantee a one-click undo for the entire project.

## 12. License and contributing

Copyright © 2026 **Ethan Lai**. ChatPatch source code and documentation are released under the **Apache License 2.0**; see [LICENSE](LICENSE) and [NOTICE](NOTICE).

ChatPatch uses **JSZip under the MIT license**. The library's license and copyright notices are preserved; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Official source: [huan572001/chatpatch](https://github.com/huan572001/chatpatch). You can download the source using **Code → Download ZIP**, extract it, and load `chatpatch-extension` as described in section 3. No build step is required.

To report bugs, suggest features, or submit a pull request, see the [contributing guide](../CONTRIBUTING.md). Developers use Node.js 22 to run tests from the repository root:

```sh
node --test chatpatch-extension/tests/*.test.mjs
```

Node.js is only needed to run tests; extension users do not need to install it.

This is a community project, not an official OpenAI or Google product.

---

**Tip for beginners:** Start with a test folder containing one or two files, link it to a conversation, download a sample ZIP, and confirm that the files update correctly. Once it works reliably, use it with your real project.
