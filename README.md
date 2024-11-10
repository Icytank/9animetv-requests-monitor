
# 9animetv Crawler - Proof of Concept


This project demonstrates a basic proof of concept for a web crawler targeting 9animetv and more specificly the rapid-cloud/vidcloud hosting server. **Note:** This is strictly for educational purposes; a full-fledged crawler will not be published or developed here, and I disclaim responsibility for any consequences arising from this project.

## 📝 Background

9animetv uses advanced techniques to prevent scraping, including encrypted data exchanges, minified JavaScript, and specific protections against developer tools in browsers. This proof of concept explores the network behavior of 9animetv, including fetching an HLS (HTTP Live Streaming) playlist file, typically an M3U8 file, which breaks down media into manageable segments.

## 🗂️ Project Structure

- **monitor.js**: A network monitoring tool utilizing Puppeteer to inspect traffic. The script tracks requests, responses, and WebSocket messages, providing a log of relevant data exchanges.
- **play.html**: A minimal HLS video player utilizing `hls.js` to demonstrate playback of M3U8 files. This page includes an input field for the M3U8 URL and mimics original request headers for accurate streaming behavior.
- **index-f2-v1-a1.m3u8**: A sample M3U8 playlist file from a 9animetv video stream. This file highlights some interesting characteristics of 9animetv's HLS streams:
  - Unusual segment extensions (.jpg, .html, .js, .css, etc.), likely an obfuscation strategy.
  - Segments sourced from a single base URL with encrypted-looking paths and hash values.
  - Obfuscation techniques include different file extensions, sequence-based naming, and long hash-based URLs.

## 🚀 Running the Project

### Prerequisites

- **Node.js** and **Puppeteer** for `monitor.js`
- A compatible web browser for viewing `play.html`

### Steps to Run

1. **Install Dependencies**: 
   ```bash
   npm install puppeteer-real-browser
   ```

2. **Start Network Monitoring**:
   ```bash
   node monitor.js <URL>
   ```
   Replace `<URL>` with the target URL to monitor. This script captures network traffic and logs it in `traffic.log`.

3. **Play M3U8 Stream**:
   - Open `play.html` in a modern browser.
   - Enter the M3U8 INDEX URL in the input field and click "Load Video" to initiate playback.

## 🤯 Conclusion

Essentially, all you need to do to scrape 9animetv is to capture the M3U8 index URL. Once you have this URL, you can use it to play or download the video segments by loading it into a compatible player. This proof of concept illustrates the process of identifying the streaming URL despite obfuscation techniques.

## ⚠️ Disclaimer

This project is for **educational purposes only**. Using it on 9animetv or other websites may violate terms of service. The author is not liable for any misuse of this information.
