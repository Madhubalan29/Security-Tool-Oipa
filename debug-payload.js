const http = require('http');

async function fetchJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://10.10.3.237:8015${path}`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function checkButtons() {
  try {
    const buttons = await fetchJson('/api/buttons');
    console.log('Master buttons sample:', buttons.slice(0, 3));
  } catch(e) {}
}

checkButtons();
