const fs = require('fs');
const content = fs.readFileSync('C:/Users/devas/.gemini/antigravity/scratch/policyassist/static/js/policy.js', 'utf8');

const fnMatch = content.match(/function formatMarkdownAnswer[\s\S]*?\n\}/);
if (!fnMatch) {
  console.error("Function not found");
  process.exit(1);
}
eval(fnMatch[0]);

const testText = `### **Section 1: Comprehensive Coverage**
[Page 1] specifies that the policy covers:
1. **Accidental External Violent Means:** Collisions and overturning.
2. **Natural Calamities:** Flood, typhoon, and storm.

### **Third-Party Liability**
* **Bodily Injury:** Unlimited statutory limits.
* **Property Damage:** Up to $100,000 [Page 1].

***
*Disclaimer: PolicyAssist provides explanations... Official decisions rest with insurer.*
`;

console.log('--- FORMATTED OUTPUT ---');
const html = formatMarkdownAnswer(testText);
console.log(html);

console.log('\n--- VERIFICATION CHECKS ---');
console.log('Has raw ***:', html.includes('***'));
console.log('Has raw ###:', html.includes('###'));
console.log('Has duplicate disclaimer:', html.toLowerCase().includes('disclaimer'));
console.log('Has answer-heading class:', html.includes('answer-heading'));
console.log('Has page-citation class:', html.includes('page-citation'));
console.log('Has ol list:', html.includes('<ol>'));
console.log('Has ul list:', html.includes('<ul>'));

// XSS Test
const xssPayload = '<script>alert(1)</script><img src=x onerror=alert(2)>';
const safeHtml = formatMarkdownAnswer(xssPayload);
console.log('XSS escaped properly:', !safeHtml.includes('<script>') && safeHtml.includes('&lt;script&gt;'));
