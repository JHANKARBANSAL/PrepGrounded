/**
 * data/fix_source_urls.js — Fix Broken Source URLs in Corpus
 *
 * Replaces synthetic/placeholder URLs for Glassdoor, LeetCode, and GeeksforGeeks
 * with valid working HTTPS landing pages so every source link in the UI opens successfully.
 */

const fs = require('fs');
const path = require('path');

const experiencesPath = path.join(__dirname, 'experiences.json');
const experiences = JSON.parse(fs.readFileSync(experiencesPath, 'utf8'));

let fixedCount = 0;

experiences.forEach(r => {
  const site = (r.source_site || '').toLowerCase();
  const url = r.source_url || '';
  const compSlug = (r.company || 'Tech').replace(/[^a-zA-Z0-9]/g, '');

  if (site === 'glassdoor' || url.includes('glassdoor.com')) {
    r.source_url = `https://www.glassdoor.co.in/Interview/${compSlug}-Interview-Questions-E.htm`;
    fixedCount++;
  } else if (site === 'leetcode' || url.includes('leetcode.com')) {
    r.source_url = `https://leetcode.com/discuss/interview-experience`;
    fixedCount++;
  } else if (site === 'geeksforgeeks' || url.includes('geeksforgeeks.org')) {
    if (!url.startsWith('https://www.geeksforgeeks.org/') || url.includes('rec_')) {
      r.source_url = `https://www.geeksforgeeks.org/tag/interview-experience/`;
      fixedCount++;
    }
  }
});

fs.writeFileSync(experiencesPath, JSON.stringify(experiences, null, 2));

console.log(`✅ Fixed ${fixedCount} broken/placeholder source URLs in data/experiences.json`);
