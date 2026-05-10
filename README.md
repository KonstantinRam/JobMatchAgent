## How to run:
npm run build  
npm run dev => agent front opens at http://localhost:5173/  

Tests:
npm run test

## Decisions for design:
Clear separation of intent between modules: testability, maintainability, delivery speed cadence.  
Matching is separated into non-deterministic (LLM) path (semantic, vague items) and deterministic algorithms working with normalized data (non-LLM).  

## Out of prototype scope:
streaming chat,  
auth,  
LLM retries,  
GenAI results polish,  
non skill related requirement (“willing to relocate etc“, it’s valid stuff, next iteration),  
No hybrid matching (Logical next step. For example, education. Do algorithmic checks first and if it’s uncertain run it through LLM),  
Prompt injection protection, job warnings (potential scam jobs, red flags, missing important skills and domain knowledge requirements etc)  
Comprehensive test suit => test coverage exists on proto level.

## How separation is to be implemented: 
For dependencies => interfaces, for example LLM provider with standard interface, so we can swap models and API in dev or use mock LLM for tests. (No DI container for this prototype, but not a bad idea for prod.).  
For interaction with the outside world (“PNG, TEXT, PDF”) => Anti-Corruption Layer. Incoming data transformed into unified form (both from standpoint of form and semantic corruption.). Simplified in prototype.  
For module interaction => blackboard pattern. Both user and job profiles are blackboards.

### Score calculation 
We don’t rely on LLM to make a main judgment call on score OR the major part of it (proportion can be found in src/core/scoreMatch.ts).  
LLM does research for us and prepares two blackboards.  
Also, it can do recommendation calls on a semantic and vibe part of job posts. (For example, a job post says “we love dogs and have ‘bring your dog to work’ days”. LLM may ask: do you have a dog, may use it as leverage, but doesn’t affect actual hard score.).  
Actual matching is to be implemented via textbook “multi-criteria scoring” algorithm (pretty much comparison).  

The meat and potatoes of the agent is the normalization tool where we prepare two blackboards to compare.  
To be sure that we will not have semantic bloopers when the same skill has different description in user and job blackboards and therefore marked as not matching.
The canon dictionary is intentionally small in prototype. We can use LLM to create it.  
The idea is not that we don’t use LLM to create this dictionary, rather the opposite, but we create it once and set it in stone so both blackboards will be normalized with the same dictionary.

Minimize LLM calls: We are at pay by token already, more determinism less money spent. 
Also, it's a lazy design to throw things at LLM and say: ”do your thing” (it would actually work really well for a small prototype, but also means I don’t understand the implications in production).

###Bonus: 
Triage tool, we feed matching to LLM and ask it to explain the fit assessment and maybe give some advice about gaps.  
So, if a user wants to go deeper beyond pure N/100 score it will help.
