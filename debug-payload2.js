const http = require('http');

async function fetchJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:8015${path}`, res => {
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

async function debug() {
  try {
    const groupGuid = 'F24ED758-0D82-40D9-A89F-F6A88216C8EC';
    const payload = await fetchJson(`/api/security-groups/${groupGuid}`);
    const company = payload.securityGroup.companies[0];
    
    console.log(`Products: ${company.products?.length || 0}`);
    if (company.products) {
      company.products.forEach(p => {
        console.log(` Product ${p.productGuid}: pages=${p.productPages?.length}, txns=${p.productTransactions?.length}`);
      });
    }

    console.log(`Plans: ${company.plans?.length || 0}`);
    if (company.plans) {
      company.plans.forEach(p => {
        console.log(` Plan ${p.planGuid}: pages=${p.planPages?.length}, txns=${p.planTransactions?.length}`);
      });
    }

  } catch (err) {
    console.error(err);
  }
}

debug();
