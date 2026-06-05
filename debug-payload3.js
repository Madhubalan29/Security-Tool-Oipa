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
    const groupGuid = 'C526D685-71B7-43B2-A99D-D3B76151A2AD';
    const payload = await fetchJson(`/api/security-groups/${groupGuid}`);
    const company = payload.securityGroup.companies[0];
    
    const companyInqGuids = (company.companyInquiries || []).map(i => i.inquiryScreenNameGuid.toUpperCase());
    console.log('Company Inquiries count in config:', companyInqGuids.length);

    const masterScreens = await fetchJson(`/api/inquiry-screens?companyGuid=${company.companyGuid}`);
    const masterGuids = masterScreens.map(s => s.inquiryScreenGuid.toUpperCase());
    console.log('Master Inquiry Screens count:', masterGuids.length);

    const intersection = companyInqGuids.filter(guid => masterGuids.includes(guid));
    console.log('Matches found (Intersection size):', intersection.length);
    if (intersection.length > 0) {
      console.log('Sample matches:', intersection.slice(0, 3));
    } else {
      console.log('No matches! Here is a sample from config:', companyInqGuids.slice(0, 3));
      console.log('Here is a sample from master screens:', masterGuids.slice(0, 3));
    }

  } catch (err) {
    console.error('Error in debug:', err);
  }
}

debug();
