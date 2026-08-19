# Extraction Audit Worksheet
### 20 random records — har ek ka source kholo aur verify karo

**Kaise karna hai:**
1. Neeche har record ka `source_url` browser mein kholo
2. Post padho (2 minute, poora nahi — bas fields verify karne jitna)
3. `eval/audit_answers.json` mein us record ke liye Y/N bharo
4. Sab hone ke baad: `node eval/audit_score.js`

**Har field ke liye poochna hai:**
- `year_ok` — kya saal sahi hai? (post ki date ya content se)
- `outcome_ok` — selected/rejected/unknown sahi hai?
- `rounds_ok` — rounds ki ginti sahi hai?
- `topics_correct` — extracted topics mein se KITNE sach mein us post mein the? (number)
- `topics_missed` — post mein aur kitne topics the jo MISS ho gaye? (number)

> `topics_correct` aur `topics_missed` se precision aur recall dono nikalti hain.
> Baaki fields sirf sahi/galat hain.

---

## 1. `gfg_infosys_2022_02`

**Source:** https://www.geeksforgeeks.org/infosys-interview-experience-for-system-engineer-july-2022/

| Field | Extracted value |
|---|---|
| company | Infosys |
| role | System Engineer |
| year | **2022** |
| month | 7 |
| total_rounds | **1** |
| outcome | **selected** |
| topics | **Strings, OOPs, DBMS, Behavioral** |

**Questions extracted:**
- Introduce yourself
- Write code to check whether a given string is a palindrome
- Explain the concept of OOP
- Explain all 4 principles of OOP
- Basic DBMS-related questions

**raw_text (pehle 200 chars):**
> The interview was held on google meet and the duration of the interview is 10 minutes. The interviewer came and the first question for me was to introduce myself. I answered it and took almost 2 minut

---

## 2. `gfg_tcs_2024_01`

**Source:** https://www.geeksforgeeks.org/tcs-ninja-interview-experience-2024-1/

| Field | Extracted value |
|---|---|
| company | TCS |
| role | Ninja |
| year | **2024** |
| month | — |
| total_rounds | **3** |
| outcome | **selected** |
| topics | **Aptitude, DBMS, OOPs, Projects, Behavioral** |

**Questions extracted:**
- TCS NQT written exam
- Explain Full Join and give the output of a Full Join query
- Explain multi-level inheritance
- Project discussion: technical stack, challenges and solutions
- Self-introduction
- What does TCS do, and why do you want to join TCS?
- Questions about the declaration for inclusion policy
- What extracurricular activities do you do?

**raw_text (pehle 200 chars):**
> I recently had the opportunity to participate in the TCS NQT placement process and successfully secured a Ninja role. I want to share my experience, which might help others prepare for the same. Round

---

## 3. `medium_salesforce_2025_29`

**Source:** https://medium.com/@tanushreeb2607/my-salesforce-interview-experience-mts-selected-dc9a12c230bf

| Field | Extracted value |
|---|---|
| company | Salesforce |
| role | Member of Technical Staff (MTS) |
| year | **2025** |
| month | 9 |
| total_rounds | **4** |
| outcome | **selected** |
| topics | **Arrays, DP, Strings, SystemDesign, Projects** |

**Questions extracted:**
- Online Assessment - 3-4 LeetCode medium-to-hard problems
- Sort names with Roman numerals
- Campaign cost partitioning to minimize weekly maxima (dynamic programming)
- Find longest service uptime streak
- Design a Meeting Scheduler (low-level design)
- Project discussion
- High-level system design: Facebook-like search feature
- Whiteboard: Parking lot system design with code

**raw_text (pehle 200 chars):**
> I worked as a SDE at a large product-based company for over two years before deciding it was time for a change. I started preparing in August 2025 and interviewed with Salesforce for the MTS role in S

---

## 4. `medium_zoho_2024_05`

**Source:** https://medium.com/@vasanthgk02/my-zoho-off-campus-interview-experience-march-2024-cb104235dd40

| Field | Extracted value |
|---|---|
| company | Zoho |
| role | Member of Technical Staff |
| year | **2024** |
| month | 3 |
| total_rounds | **4** |
| outcome | **selected** |
| topics | **Aptitude, Strings, LinkedList, Recursion, DP, Projects, Behavioral** |

**Questions extracted:**
- Generate all possible valid IP addresses from a given string
- Reverse a specific range in a linked list
- Check whether a string is a palindrome
- Text justification
- Remove consecutive same characters from a string
- Find the maximum value from an array without selecting consecutive elements
- Fibonacci sequence time and space complexity

**raw_text (pehle 200 chars):**
> Hi everyone, I'm Vasanth, and I recently had the opportunity to participate in Zoho's off-campus drive in March 2024.

---

## 5. `gfg_amazon_2025_01`

**Source:** https://www.geeksforgeeks.org/amazon-interview-experience-sde-1-6m-internship-october-2025/

| Field | Extracted value |
|---|---|
| company | Amazon |
| role | SDE-1 |
| year | **2025** |
| month | 10 |
| total_rounds | **3** |
| outcome | **unknown** |
| topics | **Networks, DBMS, OS, Arrays, DP, Trees** |

**Questions extracted:**
- 1 coding question
- 5 MCQs each from 8 topics: Data Structures, Algorithms, Pseudo codes, Computer Networks, Database Query Languages, Linux, Software Methodologies, Software Testing Concepts
- 2 coding questions (one hard, one easy)
- Maximum Fruits Harvested
- Root-to-Leaf Path Sum

**raw_text (pehle 200 chars):**
> There were 2 Online Assesment. OA 1- 1 Coding Question, 5 mcq from each 8 topics like Data stuctures, Algorithms, Psuedo codes, cn, Database Query Languages,

---

## 6. `medium_wipro_2022_06`

**Source:** https://medium.com/@gursimar04/wipro-interview-experience-elite-nth-hiring-on-campus-easy-f309b946320c

| Field | Extracted value |
|---|---|
| company | Wipro |
| role | Web Developer / Software Engineer (Elite NTH) |
| year | **2022** |
| month | 1 |
| total_rounds | **2** |
| outcome | **selected** |
| topics | **Aptitude, Arrays, Strings, OOPs, DBMS, Projects, Behavioral** |

**Questions extracted:**
- Quants/Reasoning Ability Section - 52 questions (16 Quants, 14 Logical, 22 Verbal)
- You are a teacher and have been assigned the responsibility to assign grades to the students based on their marks...
- A customer buys, N number of products from a shop and each product has a different price...
- Essay writing section
- Introduce yourself
- How many technology-related projects have you worked on?
- List at least 20 advantages of Java
- What is a valid variable? Name any 40 keywords in Java

**raw_text (pehle 200 chars):**
> Wipro arrived at our college through their National Talent Hunt Hiring process looking for web developers and software engineers. Applicants were supposed to register through superset. Online Assessme

---

## 7. `gfg_amazon_2019_04`

**Source:** https://www.geeksforgeeks.org/amazon-interview-experience-for-sde-on-campus-2019/

| Field | Extracted value |
|---|---|
| company | Amazon |
| role | SDE |
| year | **2019** |
| month | 10 |
| total_rounds | **5** |
| outcome | **selected** |
| topics | **Arrays, Strings, Greedy, DP, LinkedList, Graphs, OS, Trees, Recursion** |

**Questions extracted:**
- Stack implementation using 2 queues
- C/C++ operator precedence
- URL string formatting problem
- 1D to 2D matrix conversion with sum calculation
- 28 technical MCQs
- Minimum Platforms problem
- Travel ticket cost optimization (coin change variant)
- Reverse LinkedList

**raw_text (pehle 200 chars):**
> Online test was on mettyl platform: 28 Technical MCQ and 2 coding questions. Test duration was 90 mins.

---

## 8. `prepinsta_pwc_2022_30`

**Source:** https://prepinsta.com/interview-preparation/pwc-interview-experience/

| Field | Extracted value |
|---|---|
| company | PwC |
| role | Associate |
| year | **2022** |
| month | — |
| total_rounds | **3** |
| outcome | **selected** |
| topics | **Aptitude, Strings, DBMS, OOPs, Arrays, Behavioral, Projects** |

**Questions extracted:**
- Online test on Glider platform - Quantitative aptitude (15 questions), Verbal reasoning (5), Conceptual CS (20), Generic section (5), Programming (1)
- Write a code to check if two strings are anagram or not.
- Database normalization concepts
- SQL queries using CREATE TABLE, ALTER, GROUP BY and HAVING clauses
- Difference between WHERE and HAVING clauses
- Explain database joins (inner, right, left, full, cross, natural)
- Java Collections framework questions
- Exception handling and error types

**raw_text (pehle 200 chars):**
> PWC Interview Experience of Shaik Anisa from BS Abdur Rahman Crescent Institute of Science and Technology, for the Associate position in 2022. Round 1 was an online test on the Glider platform with fi

---

## 9. `leetcode_amazon_2019_24`

**Source:** https://leetcode.com/discuss/post/457954/amazon-sde-intern-india-dec-19-offer/

| Field | Extracted value |
|---|---|
| company | Amazon |
| role | SDE Intern |
| year | **2019** |
| month | 12 |
| total_rounds | **3** |
| outcome | **selected** |
| topics | **Strings, DP, Greedy, Arrays, Graphs** |

**Questions extracted:**
- Infix to Postfix conversion
- Climbing stairs with at most K steps
- Smallest String With Swaps
- Trapping Rain Water
- Building Bridges (LIS variant)
- Find lake sizes (DFS problem)

**raw_text (pehle 200 chars):**
> Current Position: Student (Batch 2020) Interview Date: Dec 2019 I applied for the 6 months internship through referral at the end of November. I thought if you apply through a referral it takes only 1

---

## 10. `medium_oracle_2023_24`

**Source:** https://medium.com/@sripriyamaturi8/oracle-interview-experience-bd0c176cc4bf

| Field | Extracted value |
|---|---|
| company | Oracle |
| role | Applications Developer |
| year | **2023** |
| month | 8 |
| total_rounds | **4** |
| outcome | **selected** |
| topics | **DBMS, Graphs, Trees, Arrays, SystemDesign, Behavioral** |

**Questions extracted:**
- DBMS query question
- REST API question
- Coding question in a language of choice
- Technical MCQs on topological sort, MST and tree traversals
- What is a binary search tree?
- What are the worst case and average case scenario time complexities for inserting in a binary search tree?
- Given a m*n matrix, find out all the lucky numbers in the matrix. Lucky numbers are those numbers which are minimum in its row and maximum in its column.
- A puzzle on minimum cut

**raw_text (pehle 200 chars):**
> Like every year, Oracle visited my campus for placements. It is the company that everybody is usually most excited/ anxious about and I was too. The selection process is as follows - Online Assessment

---

## 11. `gfg_amazon_2025_02`

**Source:** https://www.geeksforgeeks.org/interview-experiences/amazon-interview-experience-for-sde-i-off-campus-2025/

| Field | Extracted value |
|---|---|
| company | Amazon |
| role | SDE-1 |
| year | **2025** |
| month | 8 |
| total_rounds | **4** |
| outcome | **unknown** |
| topics | **Arrays, SlidingWindow, Behavioral, Greedy, Graphs, Projects** |

**Questions extracted:**
- 2 coding questions (1 medium, 1 hard)
- Count Complete Subarrays in an Array
- Leadership Principle questions on Learn and Be Curious and Dive Deep
- Minimize the sum calculated by repeatedly removing any two elements and inserting their sum to the Array
- Rotten Oranges
- 2 Leadership Principle questions
- Current working role and responsibility
- Deep dive into a bug or task

**raw_text (pehle 200 chars):**
> I received an opportunity via LinkedIn, where recruiter reached me out to fill for the Job ID, and was asked to complete the test within 3 working days.

---

## 12. `gfg_tcs_2024_02`

**Source:** https://www.geeksforgeeks.org/interview-experiences/tcs-nqt-complete-interview-experience-2025-batch-ninja-3-3lpa-full-time/

| Field | Extracted value |
|---|---|
| company | TCS |
| role | Ninja |
| year | **2024** |
| month | 11 |
| total_rounds | **2** |
| outcome | **unknown** |
| topics | **Aptitude, Arrays, OOPs, DBMS, Behavioral** |

**Questions extracted:**
- Foundation: Numerical Ability, Logical Ability, Verbal Ability (Profit/Loss, Time & Work, Series, Statements & Conclusions, Paragraphs, Error Detection)
- Advanced Aptitude and Advanced Coding: 2 problems (If-Else logic, Subarray Sum)
- Explain the OOP pillars
- Difference between abstraction and encapsulation
- SQL commands: CREATE, UPDATE, DELETE
- Explain the Java compilation process
- Are you willing to relocate?
- Are you comfortable with night shifts?

**raw_text (pehle 200 chars):**
> Here's my detailed experience of the TCS NQT Priority 2025 Phase-2 (On-Campus) hiring process. It was a mix of challenges, learning moments, and unexpected events. Here's how it unfolded: Hiring Type:

---

## 13. `gfg_tcs_2026_01`

**Source:** https://www.geeksforgeeks.org/interview-experiences/tcs-interview-experience-for-digital-role-2026-graduate-on-campus/

| Field | Extracted value |
|---|---|
| company | TCS |
| role | System Engineer - Digital (Grade C1) |
| year | **2026** |
| month | 1 |
| total_rounds | **4** |
| outcome | **selected** |
| topics | **Behavioral, Arrays, DBMS, Projects** |

**Questions extracted:**
- Introduce yourself
- What are your hobbies?
- Any achievements outside academics?
- Difference between Python lists and arrays
- Can Python code run without an interpreter?
- Is Python compiled or interpreted?
- How does Java execution and compilation work?
- Write a DBMS query with JOIN and UPDATE

**raw_text (pehle 200 chars):**
> Candidate Information: Status: Final-year undergraduate CSE student, placed. Total Years of Relevant Experience: Fresher. Target Position: System Engineer - Digital (Grade C1). Location: Kolkata, West

---

## 14. `leetcode_adobe_2021_06`

**Source:** https://leetcode.com/discuss/interview-experience/1046765/adobe-sde2mts-noida-jan2021-reject

| Field | Extracted value |
|---|---|
| company | Adobe |
| role | SDE2 (MTS) |
| year | **2021** |
| month | 1 |
| total_rounds | **5** |
| outcome | **rejected** |
| topics | **Graphs, Strings, OOPs, Arrays, Aptitude, Projects, OS, SystemDesign** |

**Questions extracted:**
- A question similar to Alien Dictionary
- HashMap internals
- 2Sum
- 3Sum
- Design an IoT device monitoring system
- Concurrency and OS topics

**raw_text (pehle 200 chars):**
> Status: 3 years Experience Position: Associate Consultant at Microsoft IGD Location: Hyderabad, India I recently had Adobe Interview (via referral), it lasted for around a month. I had a total of 5 ro

---

## 15. `gfg_microsoft_2021_01`

**Source:** https://www.geeksforgeeks.org/microsoft-internship-interview-experience-on-campus-2021/

| Field | Extracted value |
|---|---|
| company | Microsoft |
| role | Summer Intern / FTE |
| year | **2021** |
| month | 7 |
| total_rounds | **4** |
| outcome | **selected** |
| topics | **Arrays, Strings, DP, LinkedList, SystemDesign, OOPs** |

**Questions extracted:**
- 2 frogs maximum possible distance on an array
- Minimum characters to be added to a string of 'a' and 'b' blocks
- Maximum Sum Paths
- Detect loop in a Linked List
- Pattern searching in a string (KMP)
- Difference between interface and abstract class
- Shift n elements from a starting index with no extra space

**raw_text (pehle 200 chars):**
> Microsoft came to our college to select candidates for the roles of FTE as well as Summer Intern in July 2021. Out of the 230 candidates who applied for the position of an intern, only 18 students wer

---

## 16. `leetcode_salesforce_2021_13`

**Source:** https://leetcode.com/discuss/interview-experience/1128060/salesforce-mts-hyderabad-2021/

| Field | Extracted value |
|---|---|
| company | Salesforce |
| role | MTS |
| year | **2021** |
| month | — |
| total_rounds | **5** |
| outcome | **selected** |
| topics | **Behavioral, Projects, Strings, SystemDesign, Arrays, LinkedList, Recursion** |

**Questions extracted:**
- A medium string question
- A medium array/subarray question
- A medium linked list question
- A medium backtracking question
- A medium caching question

**raw_text (pehle 200 chars):**
> Hi Leetcoders, I have recently cleared Salesforce interview for Hyderabad location. It started in Dec 2020. I had approached a classmate who was working in Salesforce for referral. After 15 days I got

---

## 17. `medium_deloitte_2020_16`

**Source:** https://medium.com/@17bcs013/deloitte-interview-experience-4b7b03700e55

| Field | Extracted value |
|---|---|
| company | Deloitte |
| role | Analyst (Deloitte Application Studio) |
| year | **2020** |
| month | 11 |
| total_rounds | **3** |
| outcome | **selected** |
| topics | **Aptitude, Behavioral, Projects** |

**Questions extracted:**
- Online aptitude test on AMCAT platform - Quantitative Aptitude, Logical Reasoning and Verbal Ability, 25 questions each in 35 minutes
- What is there in the background Kapil?
- Please tell me something about yourself?
- What do you think is the most interesting thing nowadays?
- If you are given a project to work on, how would you like to work, in a team or alone?
- What are your long term plans?
- What Values are you gonna add to the organization?
- Why do you want to join Deloitte?

**raw_text (pehle 200 chars):**
> Deloitte USI visited my campus on 10th November 2020(the year of coronavirus pandemic). There were three rounds in the recruitment process for the post of Analyst in DAS(Deloitte Application Studio). 

---

## 18. `prepinsta_cisco_2023_34`

**Source:** https://prepinsta.com/interview-preparation/cisco-interview-experience/

| Field | Extracted value |
|---|---|
| company | Cisco |
| role | Network Developer |
| year | **2023** |
| month | — |
| total_rounds | **4** |
| outcome | **unknown** |
| topics | **Aptitude, Networks, OS, Graphs, Projects, Arrays, Behavioral** |

**Questions extracted:**
- Online Assessment
- Introduce yourself
- How will you explain computer networking in layman's terms?
- What is ping and traceroute?
- How is a virus removed from a computer?
- What is troubleshooting?
- What was your major project in college?
- What is Dijkstra's Algorithm?

**raw_text (pehle 200 chars):**
> Cisco Interview Experience 2023 for the Network Developer role. The process had four rounds: Online Assessment, Technical Interview, Managerial Interview and HR Interview. Technical questions covered 

---

## 19. `gfg_amazon_2020_01`

**Source:** https://www.geeksforgeeks.org/interview-experiences/amazon-interview-experience-for-sde-intern-on-campus-2020/

| Field | Extracted value |
|---|---|
| company | Amazon |
| role | SDE Intern |
| year | **2020** |
| month | — |
| total_rounds | **2** |
| outcome | **rejected** |
| topics | **Aptitude, Behavioral, Trees, Strings, Arrays** |

**Questions extracted:**
- Code Debugging - 7 questions in 20 minutes
- Coding Test - 2 questions in 70 minutes
- Workstyles Assessment
- Reasoning Ability
- Check if a binary tree is BST or not
- Given an array of strings with lowercase alphabets, return a string of 26 English lowercase alphabets in the same order as they appear in the array

**raw_text (pehle 200 chars):**
> Round 1 was an online assessment that consisted of four parts: 1. Code Debugging - 7 questions to be debugged in 20 minutes. 2. Coding Test - 2 coding

---

## 20. `gfg_microsoft_2021_02`

**Source:** https://www.geeksforgeeks.org/microsoft-interview-experience-off-campus-2021/

| Field | Extracted value |
|---|---|
| company | Microsoft |
| role | University Graduate, FTE |
| year | **2021** |
| month | 4 |
| total_rounds | **3** |
| outcome | **selected** |
| topics | **Strings, Aptitude, Arrays, Trees** |

**Questions extracted:**
- String/pattern matching
- Puzzle solving
- Anagrams/string problem
- Arrays question using priority queue
- Binary Search Tree coding question

**raw_text (pehle 200 chars):**
> STATUS: Final Year [2021], B.E. Computer Science and Engineering, Tier-3 POSITION: University Graduate, FTE LOCATION: Hyderabad, India DATE: April 10, 2021 Note: I have done a two months remote intern

---

