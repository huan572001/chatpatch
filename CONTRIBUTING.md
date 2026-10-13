# Contributing to ChatPatch

Thank you for contributing! You can report bugs, suggest features, or submit pull
requests at https://github.com/huan572001/chatpatch.

## Run the source code

1. Fork the repository and clone your fork to your computer.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the `chatpatch-extension` folder.
4. After each source change, click **Reload** on the ChatPatch card and reload the
   ChatGPT tab.

The extension does not require a build step or npm dependency installation. JSZip
is already bundled in `chatpatch-extension/lib/`.

## Testing

Install Node.js 22, then run this command from the repository root:

```sh
node --test chatpatch-extension/tests/*.test.mjs
```

The test suite uses Node.js's built-in test runner. GitHub Actions runs the same
command on pushes and pull requests. Automated tests use Chrome mocks; also check
the workflow you changed in Chrome with a test project folder.

## Submit changes

- Create a separate branch and keep each pull request focused on one issue.
- Describe the bug or feature, reproduction steps, and how you tested the change.
- If you change the interface, update both Vietnamese and English in `i18n.mjs`.
- If you change permissions, ZIP processing, or download routing, run the relevant
  tests and use a test folder to confirm that files are written to the correct
  destination.
- Update the README if installation or usage changes.
- Preserve third-party licenses and copyright notices.

Do not include API keys, cookies, tokens, private chat data, or personal project
source code in issues, fixtures, or pull requests. For security issues, use
**Security → Report a vulnerability** if the repository has enabled it; otherwise,
request a private contact channel from the maintainer without publicly disclosing
exploit details.

Contributions submitted for inclusion in ChatPatch are subject to the Apache
License 2.0 unless you explicitly state otherwise and agree with the maintainer.
