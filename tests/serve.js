// Serves the static portal for the Playwright tests.
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const page = path.join(__dirname, "..", "public", "index.html");

http
  .createServer((req, res) => {
    if (new URL(req.url, "http://localhost").pathname !== "/") {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(fs.readFileSync(page));
  })
  .listen(Number(process.argv[2]));
