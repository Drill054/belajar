// server.js
// Node.js + Express backend
// Menjalankan `yt-dlp -g` untuk mendapatkan direct media URL lalu me-proxy file ke user.


const express = require('express');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const path = require('path');
const app = express();


app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());


// Simple endpoint: POST /download { url }
app.post('/download', async (req, res) => {
const { url } = req.body || {};
if (!url) return res.status(400).json({ error: 'Missing url in body' });


try {
// 1) Use yt-dlp -g -f best to get direct media URL(s)
const yt = spawn('yt-dlp', ['-g', '-f', 'best', url]);


let stdout = '';
let stderr = '';
yt.stdout.on('data', (d) => { stdout += d.toString(); });
yt.stderr.on('data', (d) => { stderr += d.toString(); });


yt.on('close', async (code) => {
if (code !== 0 || !stdout) {
console.error('yt-dlp error', code, stderr);
return res.status(500).json({ error: 'Failed to extract video URL', detail: stderr.slice(0,1000) });
}


// yt-dlp -g may return multiple URLs (audio+video). We'll pick the first URL.
const urls = stdout.trim().split('\n').filter(Boolean);
const mediaUrl = urls[0];
if (!mediaUrl) return res.status(500).json({ error: 'No media URL found' });


// 2) Fetch the media and pipe to client
console.log('Proxying media URL:', mediaUrl);


const upstreamRes = await fetch(mediaUrl);
if (!upstreamRes.ok) return res.status(502).json({ error: 'Upstream fetch failed' });


// Set headers so browser treats it as downloadable
const dispositionName = getFilenameFromUrlOrHeaders(url, upstreamRes.headers) || 'video.mp4';
res.setHeader('Content-Disposition', `attachment; filename="${dispositionName.replace(/\"/g, '\\"')}"`);
res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/octet-stream');


// Pipe
upstreamRes.body.pipe(res);
});


} catch (err) {
console.error(err);
res.status(500).json({ error: 'Internal server error', detail: err.message });
}
});


function getFilenameFromUrlOrHeaders(originalUrl, headers) {
// Try Content-Disposition first
const cd = headers.get('content-disposition');
if (cd) {
const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/.exec(cd);
if (m) return decodeURIComponent(m[1] || m[2]);
}
// Fallback: derive from the original URL
try {
const u = new URL(originalUrl);
const parts = u.pathname.split('/').filter(Boolean);
if (parts.length) return parts[parts.length-1];
} catch(e){}
return null;
}


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));