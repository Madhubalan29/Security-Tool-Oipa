const fs = require('fs');
const path = 'd:/security-tool-ui/src/app/components/security-config/security-config.component.html';

let html = fs.readFileSync(path, 'utf8');

html = html.replace(/toggleProductPlanTxnAll/g, 'toggleTxnAll');
html = html.replace(/toggleAllProductPlanTxnButtons/g, 'toggleAllTxnButtons');
html = html.replace(/onProductPlanTxnButtonChange/g, 'onTxnButtonChange');

fs.writeFileSync(path, html);
console.log('Fixed toggles in HTML');
