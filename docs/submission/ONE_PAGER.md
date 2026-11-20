# Ghar Hisaab: speak your household hisaab

## The problem I saw

Every evening at my grandparents' house, after dinner, my grandma and grandpa go over what was spent that day, then she writes it into a notebook: sabzi, milk, the maid, the kirana shop, medicines. Almost all of it is cash. When I asked her, the problems came up quickly. Some nights they forget. Some nights the notebook is in another room and neither of them feels like fetching it. At month end, the totals and the milkman's and maid's bills are added up by hand. The notebook also holds income, the kirana khata and money lent to or borrowed from relatives, while milk deliveries are marked on a wall calendar.

My take: this household already keeps accounts and already talks them through out loud. The hard part is the writing and the adding. Expense apps don't help because they read bank SMS and UPI, and this money is cash. Typing-first, English-first apps don't suit someone in their seventies either.

I've seen this in one household. I'm guessing it extends to older, cash-heavy families, where the person who installs the app (a son or grandchild) isn't the person who uses it.

## Why an app, and why voice

A better notebook can't remove the effort of writing or adding up. An app can do the arithmetic, and voice lets them record the hisaab the way they already do: by saying it. Speech recognition for Indian languages and Hinglish has only recently become good and cheap enough for this.

## In scope

- **Evening voice entry:** speak the whole day in one go, see one card per item, hear it read back, save. Typing as a fallback.
- **Regular services** (milk, maid, press): mark only the exceptions ("doodh nahi aaya") and the month's bill is calculated.
- **Cash in hand, shop khata, lena-dena and income**, because grandma's notebook already holds them.
- **A WhatsApp link** so the milkman or maid sees the same bill without installing anything.
- Six languages: Hindi, English, Marathi, Bengali, Telugu, Tamil.

The core is the evening loop. I built and tested that first; the rest came after.

## Out of scope

- **Bank linking:** heavy compliance, and the target user pays in cash anyway.
- **Payments in the app:** UPI links don't confirm that money was paid, so users mark "paid" themselves.
- **Budgeting or investment advice:** a different job, and it would cost trust.
- **Login and cloud sync:** records stay on the phone until the core value is proven.
- **Always-on listening:** privacy and battery.

## My solution and why it's built this way

Ghar Hisaab is a phone web app. After dinner you tap the mic and say "sabzi 60, dawai 420, doodh nahi aaya". The app shows three cards, reads them back in your language, and you fix a card or save them all.

The biggest risk is a misheard amount, so I set one rule: the AI may never invent an amount. Every amount must come from the words actually spoken, or the app asks. For "3 kilo, 40 a kilo", the AI returns quantity and rate, and the app does the multiplication. Read-back is the final check.

I tested the understanding step on 59 sentences in six languages, locked before I tuned the prompt. It got 89.8% fully correct and 96.2% of amounts right, and no made-up amount reached the user. The test set also caught two bugs in my number-reading code, which I fixed. I rejected a free local speech model because it got only 6 of 15 amounts right.

## What I verified vs what I'm guessing

**Verified**, by talking to my grandma (one household): the evening routine, the notebook, mostly-cash spending and the pain points.

**Guessing:** that speaking is actually easier for her than writing (my riskiest assumption), that she'll use the phone herself, and that read-back catches errors. Tests with real voices and real users aren't done yet.

**Next test:** seven evenings with my grandparents. If they close fewer than 4 of 7 evenings without help, or the app is slower than the notebook, the voice idea has failed.

**App:** https://ghar-hisaab.onrender.com/
