# MiniLinks Chrome Extension

The extension creates a MiniLink for the active browser tab through the public MiniLinks API. It never receives the Supabase secret key.

## Test locally

1. Deploy the current MiniLinks backend or run it locally.
2. Sign in to MiniLinks, open **API keys**, and generate a key with `links:write`.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Choose **Load unpacked** and select this `extension` folder.
6. Open the MiniLinks extension settings and save the deployed site URL and API key.
7. Visit any public web page, open the extension, and choose **Create MiniLink**.

## Publish to the Chrome Web Store

1. Replace `https://minilinks.onrender.com` with the permanent production domain in the manifest and HTML links.
2. Create a privacy policy that explains active-tab access and local storage of the user-provided API key.
3. Zip the files inside this folder, not the folder itself.
4. Register a Chrome Web Store developer account, upload the ZIP, complete the privacy and permission declarations, add screenshots, and submit it for review.

The optional host permission lets a user connect the extension to a custom MiniLinks deployment. Chrome asks for that domain permission when the user saves extension settings.
