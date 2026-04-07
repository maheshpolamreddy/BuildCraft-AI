import fs from 'fs';

// Fix workspace/[projectId]/page.tsx
const p1 = 'src/app/employee-dashboard/workspace/[projectId]/page.tsx';
let d1 = fs.readFileSync(p1, 'utf-8');
d1 = d1.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync(p1, d1);

console.log("Fixed workspace page");
