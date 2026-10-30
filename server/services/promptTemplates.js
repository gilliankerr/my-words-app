/**
 * Prompt Templates Module
 *
 * Specialized prompts for different situation types.
 * Each prompt is designed to balance:
 * - Transactional vocabulary (completing tasks)
 * - Conversational vocabulary (discussing, sharing, reflecting)
 * - Communication repair (asking for help, clarification)
 *
 * Evidence-based design based on:
 * - Life Participation Approach to Aphasia (LPAA)
 * - PMC6350508: Life Participation Approach to PPA
 * - PMC6802912: Treatment for Word Retrieval in PPA
 */

/**
 * Base prompt elements shared across all situation types
 */
const basePromptHeader = `You are an expert Speech-Language Pathologist (SLP) creating a communication notebook for an adult with mild Primary Progressive Aphasia (PPA).

The person has:
- Word-finding difficulties (anomia) - they know what they want to say but cannot retrieve the word
- Intact comprehension - they understand everything spoken and written
- Good reading ability - they can read and point to words effectively
- MILD stage PPA - still very capable, needs vocabulary support as a backup

CRITICAL DESIGN PRINCIPLES:
1. This notebook supports BOTH getting things done AND participating in conversations
2. Include vocabulary for talking ABOUT the situation with family/friends, not just AT service providers
3. Focus on commonly affected word categories: proper nouns, specific nouns, action verbs
4. Use Canadian English spelling (colour, centre, neighbour, etc.)
5. Be comprehensive - more words are better than fewer
`;

const basePromptFooter = `
RESPONSE FORMAT:
Return ONLY valid JSON in this exact format:
{
  "title": "Short descriptive title for this notebook",
  "sections": [
    {
      "name": "Section Name",
      "type": "section-type",
      "words": ["word1", "word2"] OR "items": ["phrase1", "phrase2"]
    }
  ]
}

IMPORTANT:
- Return ONLY valid JSON, no other text or markdown formatting
- Generate AT LEAST 400-500 total words/phrases for situation-specific content
- Words arrays contain single words; items arrays contain phrases/sentences
- Be thorough and comprehensive - this is their communication lifeline`;

/**
 * Medical situation prompt template
 */
const medicalPrompt = `${basePromptHeader}
SITUATION: "{situation}"

For MEDICAL situations, generate vocabulary that supports:
1. TRANSACTIONAL NEEDS - communicating with healthcare providers
2. CONVERSATIONAL NEEDS - discussing health with family/friends before and after appointments

Generate these sections:

1. HEALTHCARE PEOPLE (25-35 words)
   - Healthcare providers they'll encounter
   - Support people who might accompany them
   - People they might discuss this with afterward

2. MEDICAL PLACES (15-25 words)
   - Areas within the facility (waiting room, exam room, lab, etc.)
   - Related places (pharmacy, parking, etc.)

3. BODY & SYMPTOMS (40-60 words)
   - Body parts (include LEFT and RIGHT options)
   - Pain descriptions: sharp, dull, aching, throbbing, constant, intermittent
   - Symptom timing: just started, few days, getting worse, getting better
   - Intensity: mild, moderate, severe, 1-10 scale

4. MEDICAL OBJECTS (25-35 words)
   - Equipment they might see or use
   - Documents they might need
   - Personal items to bring

5. MEDICAL ACTIONS (30-40 words)
   - What healthcare providers do
   - What the patient needs to do
   - Follow-up actions

6. BEFORE THE APPOINTMENT (15-20 phrases)
   Phrases for discussing with family beforehand:
   - "I'm going to ask about..."
   - "I want to mention..."
   - "I'm worried about..."
   - "Will you come with me?"
   - "Can you help me remember to ask about..."

7. DURING THE APPOINTMENT (25-35 phrases)
   Complete sentences for communicating with providers:
   - Describing symptoms: "It hurts here", "This started..."
   - Asking questions: "What does that mean?", "Is this serious?"
   - Making requests: "Can you write that down?", "Speak slowly please"
   - Confirming: "So I should...", "Let me make sure I understand"

8. AFTER THE APPOINTMENT (15-20 phrases)
   Phrases for telling family/friends what happened:
   - "The doctor said..."
   - "I need to..."
   - "They want me to..."
   - "Good news - ...", "I'm worried because..."
   - "The next step is..."

9. QUESTIONS TO ASK (20-30 questions)
   - About the condition/symptoms
   - About treatment options
   - About medications and side effects
   - About next steps and follow-up
   - About cost and coverage

10. PROBLEM-SOLVING (15-20 phrases)
    For when things don't go as expected:
    - "I don't understand"
    - "Can you explain that differently?"
    - "I need more time"
    - "I want a second opinion"
    - "Something doesn't feel right"
${basePromptFooter}`;

/**
 * Social situation prompt template
 */
const socialPrompt = `${basePromptHeader}
SITUATION: "{situation}"

For SOCIAL situations, the focus is on CONVERSATION and PARTICIPATION - not transactions.
This notebook helps the person:
- Participate actively in discussions
- Share opinions and experiences
- Stay engaged in conversations
- Maintain meaningful social connections

Generate these sections:

1. PEOPLE AT THIS EVENT (20-30 words)
   - Relationship words: friend, host, guest, neighbour
   - Family references: "my husband", "my daughter", etc.
   - Group words: everyone, somebody, people

2. CONVERSATION STARTERS (20-25 phrases)
   Opening lines to begin or join conversations:
   - "How have you been?"
   - "What have you been up to?"
   - "Tell me about..."
   - "I wanted to ask you about..."
   - "Did you hear about..."
   - "I've been thinking about..."

3. SHARING MY OPINIONS (25-35 phrases)
   For expressing thoughts and reactions:

   Positive reactions:
   - "I loved...", "That was my favourite part"
   - "I really enjoyed...", "That was wonderful"

   Thoughtful reactions:
   - "That's interesting", "I hadn't thought of that"
   - "That makes me think of...", "I see what you mean"

   Critical reactions:
   - "I wasn't sure about...", "I expected something different"
   - "I didn't quite understand...", "That surprised me"

4. SHARING EXPERIENCES (20-25 phrases)
   For contributing personal stories:
   - "This reminds me of when..."
   - "Something similar happened to me"
   - "I remember..."
   - "My experience was..."
   - "Years ago, I...", "Back when..."

5. STAYING IN THE CONVERSATION (20-25 phrases)
   For when they need time or lost track:
   - "Wait, let me think..."
   - "Go on, I'm listening"
   - "Can you say that again?"
   - "What were we talking about?"
   - "Oh yes, I remember now"
   - "Before I forget..."
   - "Sorry, I lost my train of thought"

6. RESPONDING TO OTHERS (20-25 phrases)
   - "That's a good point"
   - "I agree", "I see it differently"
   - "Tell me more"
   - "Really?", "I didn't know that"
   - "How interesting"
   - "I feel the same way"

7. TOPIC-SPECIFIC VOCABULARY (40-60 words)
   Words specific to this particular situation/event:
   - Key nouns related to the topic
   - Relevant verbs and actions
   - Descriptive words that might come up

8. POLITE PHRASES (15-20 phrases)
   - "Thank you for inviting me"
   - "This is lovely"
   - "Excuse me", "Pardon me"
   - "I appreciate that"

9. GRACEFUL EXITS (15-20 phrases)
   For ending conversations naturally:
   - "I should let you talk to others"
   - "It was so nice catching up"
   - "Let's talk more next time"
   - "I'm getting tired but this was lovely"
   - "I need to sit down, but please continue"
${basePromptFooter}`;

/**
 * Shopping situation prompt template
 */
const shoppingPrompt = `${basePromptHeader}
SITUATION: "{situation}"

For SHOPPING situations, generate vocabulary that supports:
1. TRANSACTIONAL NEEDS - finding items, asking for help, paying
2. CONVERSATIONAL NEEDS - discussing purchases with family, talking to staff

Generate these sections:

1. STORE PEOPLE (15-20 words)
   - Staff roles: cashier, clerk, manager, customer service
   - Other shoppers: customer, shopper, person in line
   - People to discuss shopping with: spouse, friend, helper

2. STORE AREAS (20-30 words)
   - Departments and sections
   - Service areas: checkout, customer service, returns
   - Facilities: entrance, exit, washroom, parking

3. SHOPPING ITEMS (50-70 words)
   Items relevant to this specific shopping situation:
   - Products they're likely looking for
   - Common items in this type of store
   - Related accessories or supplies

4. SHOPPING ACTIONS (25-35 words)
   - Finding items: look for, find, search, browse
   - Getting help: ask, point, show me
   - Purchasing: buy, pay, return, exchange

5. ASKING FOR HELP (20-25 phrases)
   - "Where can I find...?"
   - "Do you have...?"
   - "Can you help me find...?"
   - "Is this on sale?"
   - "Do you have this in...?"

6. AT THE CHECKOUT (20-25 phrases)
   - "I'd like to pay"
   - "Do you take...?" (card, cash, debit)
   - "I have a coupon"
   - "Can I get a bag?"
   - "I don't need a receipt"

7. DISCUSSING PURCHASES (20-25 phrases)
   For talking with family about shopping:
   - "I'm looking for..."
   - "What do you think of this?"
   - "Should I get...?"
   - "This is on sale"
   - "I found a good deal on..."

8. PROBLEMS & RETURNS (15-20 phrases)
   - "This doesn't work"
   - "I'd like to return this"
   - "I need to exchange..."
   - "There's a problem with..."
   - "This isn't what I wanted"

9. DESCRIPTIONS (25-35 words)
   - Sizes: small, medium, large, extra large
   - Colours: common colours
   - Qualities: cheap, expensive, on sale, good quality
   - Quantities: one, two, a few, more
${basePromptFooter}`;

/**
 * Dining situation prompt template
 */
const diningPrompt = `${basePromptHeader}
SITUATION: "{situation}"

For DINING situations, generate vocabulary that supports:
1. TRANSACTIONAL NEEDS - ordering, paying, making requests
2. CONVERSATIONAL NEEDS - enjoying the meal socially, discussing food

Generate these sections:

1. RESTAURANT PEOPLE (15-20 words)
   - Staff: server, waiter, waitress, host, hostess, chef
   - Dining companions: friend, family, spouse, guest
   - Other: manager, cashier

2. RESTAURANT AREAS (15-20 words)
   - Inside: table, booth, bar, patio, washroom
   - Features: menu, bill, check, reservation

3. FOOD & DRINK (50-70 words)
   Common menu items and food vocabulary:
   - Meal types: appetizer, main, dessert, side
   - Common dishes relevant to this situation
   - Drinks: water, coffee, tea, juice, wine, beer
   - Dietary terms: vegetarian, gluten-free, allergy, dairy-free

4. DINING ACTIONS (20-30 words)
   - Ordering: order, choose, have, try
   - Eating: eat, drink, taste, share
   - Requesting: ask, wait, send back

5. ORDERING (25-35 phrases)
   - "I'll have the..."
   - "What do you recommend?"
   - "Is the... good?"
   - "Does this have...?" (for allergies)
   - "Can I substitute...?"
   - "I'm allergic to..."

6. DURING THE MEAL (20-25 phrases)
   - "This is delicious"
   - "How is yours?"
   - "Would you like to try some?"
   - "Can I have more...?"
   - "Excuse me" (to get attention)

7. CONVERSATION AT THE TABLE (25-30 phrases)
   For socializing while dining:
   - "How has your week been?"
   - "Tell me about..."
   - "This reminds me of..."
   - "We should come here again"
   - "What are you thinking of ordering?"

8. PAYING (15-20 phrases)
   - "Can we have the bill?"
   - "We'd like to pay"
   - "We'll split it"
   - "I'll get this"
   - "Can we pay separately?"

9. PROBLEMS (15-20 phrases)
   - "This isn't what I ordered"
   - "Could I send this back?"
   - "This is cold"
   - "We've been waiting a while"
   - "There's a mistake on the bill"
${basePromptFooter}`;

/**
 * General/fallback prompt template
 * Used when no specific category matches
 *
 * IMPROVED: Now uses situation-specific section names and strong directive language
 * to ensure vocabulary is relevant to the exact situation, not generic.
 */
const generalPrompt = `${basePromptHeader}
SITUATION: "{situation}"

═══════════════════════════════════════════════════════════════════════════════
CRITICAL REQUIREMENTS - READ CAREFULLY
═══════════════════════════════════════════════════════════════════════════════

You are generating vocabulary for: "{situation}"

1. ALL vocabulary MUST be specific to this exact situation
2. Do NOT include generic everyday words (phone, keys, chair, door) - those are added separately
3. Think: "What words would someone ONLY need for THIS specific situation?"
4. Use the actual terminology and jargon from this domain/field
5. Be comprehensive - include technical terms an expert would use

EXAMPLES OF SITUATION-SPECIFIC VOCABULARY:
- "Banking appointment" needs: teller, deposit, withdrawal, chequing, savings, statement, balance, PIN
- "Hire plumber for leak" needs: plumber, pipe, faucet, valve, leak, water damage, shut-off, estimate
- "Gardening club" needs: perennial, annual, mulch, pruning, compost, transplant, cultivar

DO NOT generate generic words like "building", "room", "person", "thing" - be SPECIFIC.

═══════════════════════════════════════════════════════════════════════════════

Generate these sections with vocabulary SPECIFIC to "{situation}":

1. PEOPLE FOR {situation} (30-40 words)
   People encountered specifically in this situation:
   - Staff, professionals, or service providers for THIS situation
   - Other participants or people present
   - Roles and job titles specific to this context
   BE SPECIFIC - use actual job titles and roles from this field

2. PLACES & AREAS FOR {situation} (25-35 words)
   Locations specific to this situation:
   - The main venue or location type
   - Specific areas, rooms, or zones within
   - Related locations they might reference
   DO NOT include generic words like "here", "there" - those are added separately

3. OBJECTS & EQUIPMENT FOR {situation} (50-70 words)
   Items central to this situation:
   - Tools, equipment, or supplies used in THIS field
   - Documents, forms, or paperwork specific to this
   - Technical equipment or specialized items
   - Items they would see, handle, or need
   USE THE ACTUAL NAMES of things in this domain - be technical and specific

4. KEY TERMINOLOGY FOR {situation} (30-50 words)
   Domain-specific vocabulary:
   - Technical terms or jargon used in this field
   - Specialized concepts or categories
   - Words that have specific meaning in this context
   - Industry terms that professionals use
   THIS SECTION IS CRITICAL - include terms an expert would use

5. ACTIONS & PROCESSES FOR {situation} (40-50 words)
   What happens in this situation:
   - Actions they will do or have done to them
   - Steps in any process or procedure
   - Domain-specific verbs and actions
   - Technical processes unique to this field

6. ESSENTIAL PHRASES FOR {situation} (40-50 phrases)
   Complete sentences for this specific situation:

   a) Getting started:
      - Explaining why they're there (situation-specific)
      - Initial requests or questions for THIS context

   b) During the situation:
      - Making situation-specific requests
      - Asking domain-relevant questions
      - Responding to typical scenarios in THIS field

   c) Problem-solving for THIS situation:
      - When something goes wrong IN THIS CONTEXT
      - Asking for clarification about domain-specific things

   d) Wrapping up:
      - Confirming what was done or decided
      - Next steps specific to this situation

7. DISCUSSING {situation} WITH FAMILY (30-40 phrases)
   For talking about this situation with loved ones:

   Before:
   - Explaining what will happen using situation-specific terms
   - Questions about what to expect

   After:
   - Explaining what happened using the terminology from this field
   - Sharing outcomes or results
   - Next steps or follow-up needed

8. QUESTIONS TO ASK FOR {situation} (25-35 questions)
   Domain-specific questions:
   - Information gathering for THIS situation
   - Clarification about terms or processes in this field
   - Options and choices relevant here
   - Cost, timing, or logistics questions specific to this domain
   - Follow-up and next steps

9. DESCRIPTIONS FOR {situation} (30-40 words)
   Words for describing things in this context:
   - Quality or condition words relevant to this field
   - Sizes, amounts, or measurements used in this domain
   - Status or progress words
   - Technical descriptors used by professionals
${basePromptFooter}`;

/**
 * Services (repair, professional services) prompt template
 */
const servicesPrompt = `${basePromptHeader}
SITUATION: "{situation}"

For SERVICE situations (repairs, professional services), generate vocabulary that supports:
1. TRANSACTIONAL NEEDS - explaining problems, making decisions about service
2. CONVERSATIONAL NEEDS - discussing the work with family

Generate these sections:

1. SERVICE PEOPLE (15-20 words)
   - Service providers: technician, repairman, specialist, contractor
   - Their company: company, business, office
   - Decision makers at home: spouse, partner, family member

2. SERVICE OBJECTS (40-50 words)
   - Items being serviced or repaired
   - Tools and equipment the provider might use
   - Parts that might need replacement
   - Related items and systems

3. SERVICE ACTIONS (25-35 words)
   - Repair actions: fix, repair, replace, install, adjust
   - Inspection: check, inspect, look at, test
   - Communication: explain, show, describe, quote

4. EXPLAINING THE PROBLEM (25-35 phrases)
   - "The problem is..."
   - "It started when..."
   - "It makes a... noise/smell"
   - "It doesn't work when..."
   - "I noticed..."

5. DISCUSSING OPTIONS (20-25 phrases)
   - "What are my options?"
   - "How much will that cost?"
   - "How long will it take?"
   - "Is it worth repairing?"
   - "Can I think about it?"
   - "I need to discuss this with my..."

6. MAKING DECISIONS (15-20 phrases)
   - "Go ahead with the repair"
   - "Let me get back to you"
   - "I need a quote first"
   - "Is there a cheaper option?"
   - "Can you guarantee the work?"

7. DISCUSSING WITH FAMILY (20-25 phrases)
   - "The repair person said..."
   - "It will cost..."
   - "They recommend..."
   - "What do you think we should do?"
   - "We need to decide..."

8. PROBLEMS & CONCERNS (15-20 phrases)
   - "That seems expensive"
   - "I'm not comfortable with that"
   - "I'd like a second opinion"
   - "When will it be finished?"
   - "That's not what we agreed"
${basePromptFooter}`;

/**
 * Recreation prompt template (movies, concerts, activities)
 */
const recreationPrompt = `${basePromptHeader}
SITUATION: "{situation}"

For RECREATION situations, the focus is on ENJOYMENT and SOCIAL connection.
This notebook helps the person participate fully in leisure activities.

Generate these sections:

1. ACTIVITY PEOPLE (20-25 words)
   - Staff at the venue
   - Companions: friend, family, group
   - Other participants/audience members

2. ACTIVITY PLACES (20-25 words)
   - Areas within the venue
   - Facilities: entrance, seating, concession, washroom
   - Surrounding areas: parking, lobby

3. ACTIVITY VOCABULARY (50-70 words)
   Words specific to this recreational activity:
   - Equipment or items involved
   - Common terms used
   - Things they might see or do

4. BEFORE THE ACTIVITY (15-20 phrases)
   - "I'm excited about..."
   - "I hope..."
   - "Where should we sit?"
   - "What time does it start?"
   - "Let's get there early"

5. DURING THE ACTIVITY (25-30 phrases)
   - "This is great"
   - "I love this part"
   - "What do you think?"
   - "I can't see/hear"
   - "Can we move?"
   - "I need to take a break"

6. SHARING REACTIONS (25-30 phrases)
   For discussing the experience during and after:
   - "That was amazing"
   - "My favourite part was..."
   - "I didn't expect..."
   - "It reminded me of..."
   - "Next time we should..."

7. PRACTICAL PHRASES (20-25 phrases)
   - "Where's the...?"
   - "I need to use the washroom"
   - "Can we get something to eat/drink?"
   - "How much longer?"
   - "I'm getting tired"

8. DESCRIBING THE EXPERIENCE (20-25 words)
   - Words for rating: great, good, okay, boring, exciting
   - Feelings: fun, interesting, loud, crowded
   - Comparisons: better, worse, different, similar
${basePromptFooter}`;

/**
 * Travel prompt template
 */
const travelPrompt = `${basePromptHeader}
SITUATION: "{situation}"

For TRAVEL situations, generate vocabulary that supports:
1. TRANSACTIONAL NEEDS - navigating airports, hotels, transportation
2. CONVERSATIONAL NEEDS - discussing the trip with companions and family

Generate these sections:

1. TRAVEL PEOPLE (20-25 words)
   - Staff: agent, attendant, driver, receptionist, concierge
   - Security: officer, inspector
   - Travel companions: spouse, friend, family
   - Other: passenger, tourist, guide

2. TRAVEL PLACES (30-40 words)
   - Airport areas: check-in, security, gate, baggage claim
   - Hotel areas: lobby, front desk, room, elevator
   - Transportation: taxi stand, rental counter, bus stop

3. TRAVEL OBJECTS (40-50 words)
   - Documents: passport, ticket, boarding pass, ID, reservation
   - Luggage: suitcase, bag, carry-on, checked bag
   - Items: key card, voucher, itinerary

4. TRAVEL ACTIONS (30-40 words)
   - Airport: check in, board, land, arrive, depart
   - Hotel: check in, check out, request, reserve
   - General: pack, unpack, book, confirm, cancel

5. AT THE AIRPORT (30-35 phrases)
   - "Where is the check-in?"
   - "I have a reservation"
   - "How much can I bring?"
   - "Is the flight on time?"
   - "Which gate?"
   - "I need assistance"

6. AT THE HOTEL (25-30 phrases)
   - "I have a reservation under..."
   - "What floor is the room?"
   - "What time is checkout?"
   - "Can I have a wake-up call?"
   - "Is breakfast included?"

7. DISCUSSING THE TRIP (25-30 phrases)
   For talking with travel companions and family:
   - "The flight was..."
   - "The hotel is..."
   - "Tomorrow we'll..."
   - "I'm enjoying..."
   - "I miss home"
   - "We should come back here"

8. PROBLEMS (20-25 phrases)
   - "My luggage is lost"
   - "The room isn't right"
   - "I missed my flight"
   - "I need help"
   - "There's been a mistake"
   - "I don't understand"
${basePromptFooter}`;

/**
 * Phone call prompt template
 */
const phonePrompt = `${basePromptHeader}
SITUATION: "{situation}"

For PHONE CALL situations, generate vocabulary that supports:
1. Making and receiving calls
2. Leaving and understanding messages
3. Discussing the call with family afterward

SPECIAL CONSIDERATIONS FOR PHONE CALLS:
- No visual cues to help with word-finding
- Need clear, simple phrases
- Caller ID and message-taking support

Generate these sections:

1. PHONE ACTIONS (20-25 words)
   - Making calls: call, dial, phone, ring
   - Answering: answer, pick up, hello
   - Managing: hold, transfer, hang up, call back

2. STARTING THE CALL (25-30 phrases)
   For answering:
   - "Hello"
   - "Speaking"
   - "Yes, this is..."
   - "Who is calling?"
   - "Please hold on"

   For calling:
   - "Hello, my name is..."
   - "I'm calling about..."
   - "Is this...?"
   - "I'd like to speak to..."

3. DURING THE CALL (30-35 phrases)
   - "Can you speak more slowly?"
   - "Can you repeat that?"
   - "I didn't catch that"
   - "Let me write that down"
   - "One moment please"
   - "Yes, I understand"
   - "No, that's not right"

4. SCHEDULING/APPOINTMENTS (25-30 phrases)
   - "I need to make an appointment"
   - "I need to reschedule"
   - "What times are available?"
   - "Can I have... at... o'clock?"
   - "I need to cancel"
   - "Can you confirm...?"

5. ENDING THE CALL (15-20 phrases)
   - "Thank you"
   - "I'll call back"
   - "Please call me back at..."
   - "Goodbye"
   - "I need to go"

6. VOICEMAIL (20-25 phrases)
   Leaving messages:
   - "Hello, this is..."
   - "I'm calling about..."
   - "Please call me back at..."
   - "My number is..."
   - "Thank you"

7. TELLING FAMILY ABOUT THE CALL (20-25 phrases)
   - "Someone called about..."
   - "I need to call back about..."
   - "They said..."
   - "The appointment is..."
   - "I couldn't understand them"

8. PROBLEMS (15-20 phrases)
   - "I can't hear you"
   - "Bad connection"
   - "I need to call you back"
   - "Wrong number"
   - "I didn't get that"
${basePromptFooter}`;

/**
 * Book Club prompt template
 *
 * CRITICAL: Book clubs require SPECIFIC vocabulary from the actual book being discussed.
 * Generic book vocabulary (lobby, cafe, bookmark) is USELESS for someone with PPA
 * who needs help retrieving specific words like character names, themes, and plot elements.
 *
 * This prompt REQUIRES web search context to be injected with book-specific content.
 */
const bookclubPrompt = `You are an expert Speech-Language Pathologist (SLP) creating a communication notebook for an adult with Primary Progressive Aphasia (PPA).

The person has:
- Word-finding difficulties (anomia) - they know what they want to say but cannot retrieve the word
- Intact comprehension - they understand everything spoken and written
- Good reading ability - they can read and point to words effectively
- MILD stage PPA - still very capable, needs vocabulary support as a backup

CRITICAL DESIGN PRINCIPLES:
1. This notebook supports BOTH getting things done AND participating in conversations
2. Include vocabulary for talking ABOUT the situation with family/friends, not just AT service providers
3. Focus on commonly affected word categories: proper nouns, specific nouns, action verbs
4. Use Canadian English spelling (colour, centre, neighbour, etc.)
5. Be comprehensive - more words are better than fewer

SITUATION: "{situation}"

THIS IS A BOOK CLUB DISCUSSION. The person needs vocabulary to:
- Discuss THIS SPECIFIC BOOK with the group
- Share opinions about characters, plot, and themes
- Participate in literary conversation
- Express reactions and insights
- Stay in the conversation when words fail
- Talk about the reading experience itself

CRITICAL REQUIREMENTS:
1. You MUST include vocabulary specific to THE BOOK mentioned in the situation
2. Character names, place names, and key concepts from the book are ESSENTIAL
3. Do NOT include generic venue words (lobby, cafe, bookshelf) - the person is not navigating a building
4. Content balance: most items are pointable book-specific words; discussion phrases carry nuanced opinions that cannot be gestured; the repair section is a SHORT list of partner directives only (most repair states are gestureable, so they do not belong here)
5. Identify the GENRE of the book and include 10-15 genre-specific discussion terms (e.g., mystery: suspect, alibi, red herring, motive; literary fiction: narrator, perspective, symbolism; memoir: truth, memory, lived experience)
6. Include the AUTHOR's name, nationality, and other notable works for "I've read other books by..." conversations
7. Include a rich set of emotional response words beyond "liked/didn't like": moved, unsettled, comforted, frustrated, hopeful, nostalgic, gripped, bored, surprised, relieved

Generate these sections IN THIS ORDER:

1. USEFUL PHRASES (8-12 phrases)
   Place this first — it is the page the person flips to mid-conversation for help.
   It MUST fit on ONE booklet page, so keep it short.

   CRITICAL PRINCIPLE — only include what CANNOT be shown by a gesture:
   The person can already show waiting, thinking, agreeing, disagreeing, pointing,
   showing a page, or picking up a pen — with their hands, face, or actions.
   Do NOT write phrases for those. A phrase only earns its place if it tells the
   partner to DO something specific, or states something with no clear gesture.
   If a phrase could be replaced by a raised hand, a nod, a shrug, or pointing — cut it.

   GUESSING IS WELCOME — it is often how the word surfaces. Partners finishing
   her sentence or offering guesses, while she nods or shakes her head, is a
   normal, helpful way to talk. The nod and the shake are gestures, so never
   write "yes — that's the word" as a phrase. But the guessing protocol itself
   cannot be mimed: a gesture cannot ask a partner to guess, to offer two
   choices, or to keep trying after a wrong guess — so that protocol belongs here.

   Include partner directives like these (short, under 40 characters each):
   - "Say that word for me"
   - "Ask me yes-or-no questions"
   - "Give me two choices"
   - "Guess my word — I'll nod"
   - "Try to finish my sentence"
   - "Not that one — guess again"
   - "Repeat my words back to me"
   - "Remind me what happened next"
   - "Who was that character?"
   - "I understood — don't re-explain"
   - "Hard word day — I'll point more"
   - "Skip me now — come back to me"

   Do NOT include gestureable states such as "give me a second", "it's on the tip of
   my tongue", "I agree", "I'm still thinking", "let me point", "don't rush", or
   "yes — that's the word" (a nod covers it) — the person shows those without words.

2. CHARACTERS & PEOPLE FROM THE BOOK (35-50 words)
   List the main and supporting characters from this book:
   - Protagonist(s) by name
   - Supporting characters by name
   - Antagonist(s) or opposing figures by name
   - Character relationships (the mother, the friend, the doctor)
   - The author's name and nationality
   - For non-English names, include a pronunciation hint in parentheses: e.g., "Emerence (EM-er-ents)"
   - Include the author's full name with dates: e.g., "Magda Szabó (1917-2007)"
   - Include the translator's name if the book is in translation
   THIS SECTION MUST CONTAIN ACTUAL NAMES FROM THE BOOK

3. PLACES & SETTINGS IN THE BOOK (25-35 words)
   Specific locations from the story:
   - Where the story takes place
   - Important settings within the narrative
   - Symbolic or meaningful locations
   DO NOT include generic words that could apply to any book (kitchen, bedroom, street, city, garden).
   ONLY include places that are specific and meaningful to THIS story.
   If a place is generic (e.g., "the kitchen"), only include it if it has specific narrative significance.

4. KEY THEMES & CONCEPTS (30-45 words)
   The major themes and ideas explored in this book:
   - Central themes (love, loss, redemption, identity, etc.)
   - Key concepts or motifs
   - Abstract ideas the book explores
   - Genre-specific terms relevant to this book
   - Clearly separate genre-specific literary terms from the book's themes.
     Genre terms (narrator, perspective, symbolism, motif, unreliable narrator) go in Themes.
     Book-specific themes (trust, betrayal, the door as symbol) also go in Themes.
     Separate groups with clear section headings; each word remains a plain entry.
     Do not prefix entries with "Genre term:", "Book theme:", "Book concept:" or "Related discussion concept:".
     Include only genre terms useful for THIS book; do not list unrelated genres or generic thesaurus expansions.

5. PLOT VOCABULARY (40-55 words)
   Words for discussing what happens in the story:
   - Key events and turning points
   - Actions characters take
   - Story structure words: beginning, ending, twist, reveal, climax
   - Genre-specific plot terms

6. EMOTIONAL RESPONSES TO THE BOOK (30-40 words)
   Rich vocabulary for how the book made them feel:
   - moved, unsettled, comforted, frustrated, hopeful, nostalgic
   - gripped, bored, surprised, relieved, confused, inspired
   - angry, sad, joyful, anxious, satisfied, disappointed
   - Include both positive and negative emotional responses

7. TALKING ABOUT READING THE BOOK (15-20 phrases)
   For discussing the reading experience itself:
   - "I read it slowly"
   - "I had to re-read that chapter"
   - "I listened to the audiobook"
   - "I lost my place"
   - "I read it on my tablet"
   - "I put sticky notes on the good parts"
   - "I couldn't remember who [character] was"
   - "I had to look back at earlier chapters"
   - "I read it in one sitting"
   - "It took me a while to get into it"
   - "I marked my favourite pages"
   - "I underlined the parts I liked"

8. IF I HAVEN'T FINISHED THE BOOK (10-15 phrases)
   For partial participation:
   - "I didn't finish it"
   - "I got to chapter [number]"
   - "I found it hard to follow"
   - "I need someone to remind me what happened after..."
   - "I enjoyed the parts I read"
   - "Can someone catch me up on the ending?"
   - "I'm still reading — don't spoil it!"
   - "I got confused in the middle"
   - "I plan to finish it this week"
   - "I skipped some parts"

9. SHARING MY OPINIONS ABOUT THE BOOK (30-40 phrases)
   For expressing thoughts about THIS book:

   About characters:
   - "My favourite character was [NAME]"
   - "I didn't like [NAME] because..."
   - "[NAME] reminded me of..."
   - "I understood why [NAME] did that"
   - "I was surprised by [NAME]"
   - "I felt close to [NAME]"

   About the plot:
   - "The best part was when..."
   - "I was surprised by..."
   - "The ending made me feel..."
   - "I didn't expect..."
   - "I predicted that..."

   About themes:
   - "I think the author was saying..."
   - "This made me think about..."
   - "The message I took away was..."
   - "I related to..."
   - "It reminded me of my own life"

   Critical reactions:
   - "I wasn't sure about..."
   - "I wish the author had..."
   - "I found it hard to believe..."
   - "That part was confusing"
   - "It made me want to cry"
   - "It made me angry"

10. RESPONDING TO OTHERS' OPINIONS (25-35 phrases)
    For engaging with other readers:
    - "That's a good point about [NAME/topic]"
    - "I saw it differently"
    - "I hadn't thought of it that way"
    - "Tell me more about what you mean"
    - "I agree, especially..."
    - "I see what you mean, but..."
    - "That's interesting because..."
    - "Oh, I missed that part"
    - "Can you remind me what happened when...?"

11. ASKING DISCUSSION QUESTIONS (20-30 questions)
    Questions to ask the group:
    - "What did you think about [character/event]?"
    - "Did anyone else notice...?"
    - "Why do you think [character] did that?"
    - "What would you have done?"
    - "Did you like the ending?"
    - "What was your favourite part?"
    - "Would you recommend this book?"

12. READING A PASSAGE ALOUD (10-15 phrases)
    For when the group shares favourite passages:
    - "I'd like to read this part"
    - "Can I show you the page instead?"
    - "I marked this passage"
    - "This is my favourite part — [points]"
    - "Can someone read this for me? I'll point to where"
    - "I underlined this bit"
    - "Listen to this part"
    - "I want to share this page"
    - "Can I point while someone reads?"
    - "This part made me feel..."

13. BOOK COMPARISON & CONNECTIONS (15-20 phrases)
    For connecting to other experiences:
    - "This reminded me of..."
    - "Unlike other books I've read..."
    - "The writing style was..."
    - "I've read other books by this author"
    - "This is similar to..."
    - "The author also wrote..."
    - "This is better/worse than their last book"

14. LEADING OR GUIDING THE DISCUSSION (15-20 phrases)
    For when the person is leading or helping guide the conversation:
    - "Let's start with..."
    - "Who wants to go first?"
    - "Let's move on to..."
    - "Does anyone want to add to that?"
    - "I think we've covered that — next topic"
    - "Let's talk about the ending now"
    - "Before we finish, does anyone have questions?"
    - "Let's go around the table"
    - "What did everyone think of chapter [number]?"
    - "I have a question for the group"

15. AFTER THE BOOK CLUB (15-20 phrases)
    For debriefing with family or friends afterward:
    - "The book club was good today"
    - "We talked about..."
    - "[Name] had a good point about..."
    - "I want to read more by this author"
    - "I'm going to recommend it to..."
    - "The discussion changed my mind about..."
    - "I enjoyed hearing what others thought"
    - "I disagreed with [name] about..."
    - "The next book is..."
    - "I'm looking forward to the next one"
    - "I need to write down my thoughts before I forget"

BALANCE ENFORCEMENT:
- Word sections (Characters, Places, Themes, Plot, Emotional) are the largest — these are what the person points to most
- Target at least 55% words (pointable vocabulary); the rest are discussion phrases for nuanced opinions, plus a SHORT repair list
- USEFUL PHRASES stays small (8-12): only partner directives and states with no clear gesture — never pad it with gestureable states
- If you find yourself writing phrases the person could show with a hand, face, or action, STOP and replace them with pointable words

RESPONSE FORMAT:
Return ONLY valid JSON in this exact format:
{
  "title": "Short descriptive title for this notebook",
  "sections": [
    {
      "name": "Section Name",
      "type": "section-type",
      "words": ["word1", "word2"] OR "items": ["phrase1", "phrase2"]
    }
  ]
}

IMPORTANT:
- Return ONLY valid JSON, no other text or markdown formatting
- Cover the useful book-specific vocabulary and discussion choices comprehensively. Section ranges are guidance, not minimum quotas; never invent names or pad vocabulary to reach a count.
- Words arrays contain single words; items arrays contain phrases/sentences
- Be thorough and comprehensive - this is their communication lifeline
- The "USEFUL PHRASES" section MUST be first and MUST be short (8-12 partner directives only — never pad it with gestureable states)
- Use specific character names from the book in phrase templates wherever possible

IF NO BOOK-SPECIFIC INFORMATION IS AVAILABLE:
- Generate the best possible generic book discussion vocabulary
- Use [CHARACTER NAME] as a placeholder and include a note that the user should fill in actual names
- Still include all communication repair and participation sections in full
- Focus extra content on genre-agnostic discussion phrases and emotional responses`;

/**
 * Map of situation types to their prompt templates
 */
const promptMap = {
  medical: medicalPrompt,
  social: socialPrompt,
  bookclub: bookclubPrompt,  // Specialized for book club discussions
  shopping: shoppingPrompt,
  dining: diningPrompt,
  services: servicesPrompt,
  travel: travelPrompt,
  recreation: recreationPrompt,
  phone: phonePrompt,
  religious: generalPrompt, // Use general for now, could specialize later
  financial: generalPrompt, // Use general for now, could specialize later
  general: generalPrompt
};

/**
 * Get the appropriate prompt template for a situation type
 * @param {string} situationType - The detected situation type
 * @param {string} situation - The user's original situation description
 * @param {string|null} webContext - Additional context from web search (optional)
 * @returns {string} The complete prompt ready for the AI
 */
function getPromptForSituation(situationType, situation, webContext = null) {
  // Get base prompt for this situation type
  let basePrompt = promptMap[situationType] || promptMap.general;

  // Substitute ALL instances of {situation} in the prompt
  // Using global regex so section headings like "PEOPLE FOR {situation}" get replaced too
  let prompt = basePrompt.replace(/\{situation\}/g, situation);

  // If web context is available, inject it into the prompt
  if (webContext) {
    // Use much stronger language for book clubs - web context is MANDATORY
    const isBookClub = situationType === 'bookclub';

    const webContextSection = isBookClub ? `

═══════════════════════════════════════════════════════════════════════════════
BOOK INFORMATION - YOU MUST USE THIS DATA
═══════════════════════════════════════════════════════════════════════════════

The following information about the book was found:

${webContext}

YOU ARE REQUIRED TO:
1. Extract ALL character names from the above and include them in "CHARACTERS & PEOPLE FROM THE BOOK"
2. Extract ALL settings/locations from the above and include them in "PLACES & SETTINGS IN THE BOOK"
3. Identify the major themes from the above and include them in "KEY THEMES & CONCEPTS"
4. Use specific character names in the phrase templates (e.g., "My favourite character was Nora" not "[NAME]")

FAILURE TO USE THE BOOK-SPECIFIC INFORMATION ABOVE MAKES THE NOTEBOOK USELESS.
The person with PPA needs to retrieve THESE SPECIFIC NAMES AND TERMS - not generic vocabulary.
═══════════════════════════════════════════════════════════════════════════════
` : `

ADDITIONAL CONTEXT FROM WEB SEARCH:
The following information was found about topics mentioned in the situation:

${webContext}

IMPORTANT: Use this context to generate specific, relevant vocabulary. Include:
- Specific names, terms, and concepts mentioned
- Relevant vocabulary that would help discuss this topic
- Key themes or ideas that might come up in conversation
`;

    // Insert the web context right after the situation
    prompt = prompt.replace(
      `SITUATION: "${situation}"`,
      `SITUATION: "${situation}"${webContextSection}`
    );
  }

  return prompt;
}

/**
 * Get available prompt templates
 * @returns {Object} Map of situation types to prompt availability
 */
function getAvailablePrompts() {
  return Object.keys(promptMap);
}

module.exports = {
  getPromptForSituation,
  getAvailablePrompts,
  promptMap,
  basePromptHeader,
  basePromptFooter
};
