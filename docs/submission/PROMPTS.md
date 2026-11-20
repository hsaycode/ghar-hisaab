# Ghar Hisaab: Prompts Used to Create the Tool

**Tools:** Claude Code (Claude Opus 5.5) in VS Code for research, design and code. Groq (whisper-large-v3 and gpt-oss-120b) as the app's own AI at runtime.
**How to read this:**
- Part A lists my prompts in order. Each row has a one-line summary, what came back, and what I decided next.
- Part B contains the verbatim text of every prompt, typos included.
- Part C shows the prompts the app itself sends to the AI, and how they were improved using evals.

---

## Part A: The prompt trail

| # | Phase | My prompt (summary) | What came back | What I decided next |
|---|---|---|---|---|
| 1 | Understand the brief | Read the case study; analyse it from different angles like an experienced PM | What the brief tests (evidence vs. guesses, "why an app", evals) and the angles to approach it from | Explore real user personas |
| 2 | Personas | Take people of different ages, backgrounds and living conditions; capture their viewpoint and whether an app can help | 12 personas, each with an app-fit verdict | The ideas felt generic |
| 3 | Go deeper | "These ideas are generic": analyse routines and openings, find new ideas, rank old vs. new | Routine-level ideas, ranked against the old ones | Check feasibility of the top 4 |
| 4 | Feasibility | Count the assumptions behind each of the top 4 ideas; deep dive as the brief requires | Assumption tables, competitor research, a revised ranking | Explore more personas first |
| 5 | Day in the life | Take each persona's role through an ordinary day; find right-place, right-time moments | 14 new moment-based ideas | Ask for the best idea |
| 6–7 | Decide | Explain the best idea; then explain Hisaab, which scored higher | Two candidates compared | **My grandma's notebook** (verified first-hand) points to Hisaab |
| 8 | Deep dive | Is the scope narrow? Features for each age group and city tier? Journeys for every literacy level? Add a voice tally of the household's daily expenses, from my conversation with grandma | Spec v0.2: full scope, journeys, assumptions, design | Clarify requirements |
| 9 | Requirements | Not only elderly or rural users; how it differs from existing apps; all trackers in the prototype; separate vendor flow; 6 languages; optional SMS; Groq; conda; farm use; grandma's facts; evals without access to calls | Spec v0.2 + eval plan v0.2 | Run a review council |
| 10 | Review | Find gaps in the docs and research them, using an LLM council | 5 reviewers (PM, UX, Engineering, Privacy, Evals) produced about 45 changes → v0.3 | Start building |
| 11 | Build | Drop privacy claims for the prototype; make evals verifiable and transparent; are sound-alike lists limiting?; full onboarding; Render free + Groq free tier; no UPI links if risky; notebook has income, khata and lena-dena | Working prototype, 89-case eval harness, test set frozen | Polish |
| 12 | Polish | Hindi showing in English mode; sound-alikes in every language; local open-source Whisper?; infer UPI from speech; month-by-month comparison; cleaner landing page; fix bugs | Full localisation + guard tests; 3-layer amount checks; Whisper benchmark (rejected); UPI inference; Compare tab | Audit |
| 13 | Audit + go live | Settings page bug; audit the whole codebase for hardcoded text; key added, can I test?; which evals are used? | CSS collision fixed; 10 hardcoding issues fixed; certificate fix for Groq; live eval v1 → v2 | Write the submission |
| 14 | Submit | One-pager, prompts document, evals document, Render deployment | This document, the evals document, deploy steps. **The one-pager is written by me** | — |

**Where my judgement changed the direction:**
- **#3:** I rejected the generic ideas.
- **#5:** I asked for moment-level journeys.
- **#8:** I brought in first-hand evidence from my grandma's notebook.
- **#9:** I widened the target from elderly users to all households.
- **#11:** I removed the payment links and the over-claimed privacy statement.
- **#12:** I questioned whether the sound-alike number lists were a real safety net.
- **#13:** I spotted the broken Settings layout.

---

## Part B: Verbatim prompts

> 1. Go through the contents of the Product Case Study and understand the case. Analyse different sides and perspectives from which the product case study can be approached  Think like an experienced product manager.

> 2. Take the user persona of people with different age groups, different backgrounds, different living conditions etc. and try to capture each persons viewpoint so that you can identify issues that a person is facing and if a digital app is something that can solve that issue.

> 3. The ideas you have currently picthed are generic ideas. They aren't really detailed or they arent really deep level problems that people with the persona that you have selected might face. Dig deeper, analyse the routine, the issues, the openings for a digital product in each persons life and come up with new ideas. Compare the ideas with the old ideas and rank them properly from top to bottom

> 4. Go throught he feasibility, how many assumotions are required for the implementation of each fo the top 4 ideas.Do a proper deep dive as required by the PS so that you have more information per idea before making the final decision.

> 5. The current suggestions that you have given are good ideas but I would like to explore with some other ideas first. Currently the user persona jounrye which you are using are very narrow and not detailed. For each persona, assume that persons role and go through the day in their life, an ordinary day, identify what little things they do which could be improved by a digital app, what problems a digital app can solve at theright place at the right time. Think of what impact this app could have and why it matters enough for the person to start using it.

> 6. Explain the best idea which you think is to me

> 7. You have scored the other idea of Hisaab higher than this. Explain that idea

> 8. The scope for this idea is very narrow right? only for the milk, maid, press, groceries etc right? or is there any use case apart from this? Are there any features specific in this app catering to specific age groups or specific tiers of cities or things like that? Do a deep dive on this idea according to the problem statement to get an all rounded picture about this idea. Identify the user journey on the platform from different perspectoves and how it can be streamlined to be made efficient and intuitive for all levels of technological literacy. Collect the necessary data to answer the assumptions and tell me what the assumptions are, tell me what the scope is and what is in the scope. THink of th eminute details of the solution and how to deal with this. Think to Keep the design of the app to be aethstic and intuitive. Don't make it too cluttered or too confusing. In the app can I add another feature where the app can tally the expenses of the house holds? After a discussion with my grandma what she told me is that she writes dwon the daily expenses of her household in a notebook daily after discussing her and my grandpas expenses. I could think of an idea where they just turn on the listening of the app (one simple button) and the app automatically tallies the numbers and assigns it according to verticals and tracks the expenses properly.

> 9. I have a few questions and clarifications before this begins. 1. Is this app only for old people and non urban people? (essentially people with low tech literacy). Even if tier three might have low upi penetration and are cash heavy, isnt the smart phone penetration still there and the potential for this app there based on the current data? 2. Exactly how is this offering different from exsiting platforms? 3. In the range of things that the app can do, make sure in the build prototype these things can be trakced, the daily variable spending, the regular services, the family lena dena, household side credit, the cash in hand and any other feature syou believe are backable and implementable 4. For each user (vendor, app user etc. there will be different jounries right) so make sure the protype has different features and paths and uses. 5. Proeprly break down the user jounreys to minute details to identify potential pain points and deal with them early on. 6. Do not focus too much on just Hindi. There should be an option for display in major regional languages like marathi, bengali, telugu and tamil etc. which the user can choose. 7. give the user an option to decide whether he or she wants to give sms access so that the platform can log whatever little digital transactions might be there. 8. Choose the appropriate transcription model/api for this such that the model can understand the regional languages given above, 9. I will be using a groq api key for the AI Part. 10. Keep the vendor side app as just a different flow on the same app. 11. For rural and farm expenses also I believe this can be used because of by smart phone penetration argument. You can give a choice/survey the user in the begining to get an idea of what kind of use the user might be giving the app for, so that the expense tracking experience is smoother 12. Regarding the assumptions: The entire premise of this product is that writing is not very convientient daily and sometimes they might forget to write or sometimes the notebook might be in a different rooma nd they dont feel like getting it. Almost all fo the spending is by cash in my grandmas case. They discuss after dinner before going to sleep. Regular vendors are the grocery, vegetables, maid, milk man, newspaper etc. Nothing out of the ordinary. For evals plan properly and tell me how we can do the evals. I do not have any access to calls or other things. Properly brains torm on how I can run evals, probably I can record my voice and test if the app is able to capture and interpret? I will be using claude code and not lovable. MAke sure whatever coding or installations are done are done in a conda environment and is done properly. Think from the perspective of a product manager while designing the product.

> 10. Read the docs and go through them to make sure there are no gaps or short comings currently. If they are then research and look into them and solving them. Use an LLM council to do this final round of checks

> 11. 1. The data storage claim is unecessary at this point as this is only a prototype and not a final deployment. 2. Make sure the evaluation is properly done on the prototype and the results can be submitted and reported properly. This process hsould be verifiable and transparent. 3. The similar sounding words etc. can be dealt with by you by hard coding similar sounding words or what? If so then this restricts the performance right? 4. Onboarding should be a smooth experience with aesthetic pages and a user jounrey which does not skip any stage 5. I can probably use render free version to deploy the docker? What if I use two api keys for groq? If the first one fails then it can use the second one or the transcription of the voice could be done by some open source models or one groq api and the downstream processing can be done by the other apikey? I dentify the best way to solve this issue 6. Do not add any upi related payment links in this currently if there are issues. If the issues are solvable then continue. 1. The notebook has the income, khata and lena dena. The other details like amount of milk is on the calender. 2. I cannot access any calls right now. But I can record audio for proxy testing using a simulated coversation of how it might go 3. For groq I have the free tier and will continue using it. Start with the building.

> 12. Even when the langauge selected is english, why i sthere still hindi text on the page as shown in the attached image? On most pages this issue is there like the sample page for example, I have selected english but still there are hindi words on the page and in different sections. THe entire text should be in english if someone selects english language and so on for each language. In the hard coding part have you identified such isseues that mght come up in all languages? If not then this addition although good might not be as useful as you say. The open source free models like whisper flow lite are python libraries right? can't they be used to load a model and so on? For UPI you can probably try to infer it from the the conversation, if someone says that I paid online then it gets logged that way etc. Is a month by month comparison vuew possible where one is able to compare their spending month wise (it could be sector by sector change or mode of payment wise etc.) The first page is not very aesthetic, remove the em dash and make sure the page is clean and aesthetic. The statements or words should be properly framed and added not just random points. the bugs which you found, solve them right now if possible

> 13. There is some issue on the settings page of the sample hosue as attached in the image. Like the hindi thing I had identified, once go through the entire code base and find if there any such issues still in the code which might be hard coded and making the user jounrey sub optimal. I have added the api key. Can I now try the testing part? What is the evals that have been used in this solution?

> 14. Write me the1 page covering the points required. Create the prompts used to create the tool document. The evalss used to test the solution. And tell me how to deploy this to render

**Prompts given to the review council (#10):** five independent reviewers each read the spec and eval plan, researched gaps with sources, and returned findings with a severity and a proposed fix. The seats were:
- Groww PM / case evaluator
- UX for elderly, low-literacy and multilingual users
- Staff engineer (feasibility)
- Privacy, legal and trust
- AI evaluation lead

How their disagreements were resolved is recorded in `docs/COUNCIL_REVIEW.md`.

---

## Part C: The app's own AI prompts (runtime)

| Prompt | Where | Purpose |
|---|---|---|
| Speech recognition hint | `backend/app/asr.py` | Up to about 400 characters of household names, service names and category words in the speaking language, sent to whisper-large-v3 with `language=<hi/mr/bn/te/ta/en>` |
| Parser system prompt **v1** | `backend/prompts/parser_v1.txt` | Turns the transcript into structured entries (kind, amount, quantity × rate, category, member, payment mode, date, regular-service event) using a strict JSON schema |
| Parser system prompt **v2** (live) | `backend/prompts/parser_v2.txt` | v1 plus rules learned from **dev-set** failures only (see the evals document) |

**What changed from v1 to v2, and why (all from the 30 dev cases):**

| v1 failure on the dev set | Rule added in v2 |
|---|---|
| Petrol filed under cooking gas | One-line meaning for every category (e.g. gas = cooking cylinder only; travel includes vehicle fuel) |
| "2 kilo pyaaz assi ka" read as ₹80 per kilo | A price followed by "ka / ki / worth / for" is the total; a per-unit rate needs a unit ("30 rupaye kilo") |
| Paying a listed khata shop logged as a new expense | Paying a shop in `shop_accounts` counts as a khata payment |
| Buying milk from a shop logged as a milk-delivery event | Regular-service events are only about deliveries and visits |
| Missed milk delivery labelled "leave" | skip = a delivery didn't happen; leave = a worker was absent |
| Category left empty | Always choose a category; use "other" if nothing fits |

**Safeguards around the prompt:**
- Few-shot examples never come from the test set; `evals/check_leakage.py` enforces this.
- The app does all arithmetic, including quantity × rate. The model never calculates.
- Every amount the model returns must be found in the spoken words, or it is dropped and the user is asked.
