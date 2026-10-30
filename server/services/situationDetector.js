/**
 * Situation Detector Module
 *
 * Classifies user situation descriptions into categories to enable
 * specialized prompt selection. Each category has tailored vocabulary
 * generation that balances transactional and conversational needs.
 *
 * Categories:
 * - medical: Healthcare appointments, pharmacy visits
 * - social: Gatherings, book clubs, parties, family events
 * - shopping: Grocery, retail, mall
 * - dining: Restaurants, cafes, takeout
 * - services: Home repair, professional services
 * - travel: Airport, hotel, vacation
 * - recreation: Movies, concerts, sports, hobbies
 * - phone: Phone calls, scheduling
 * - religious: Church, temple, religious services
 * - financial: Bank, accountant, financial planning
 * - general: Default when no specific category matches
 */

/**
 * Category definitions with keywords and patterns
 * Weight indicates how strongly a match suggests this category
 */
const categoryPatterns = {
  medical: {
    keywords: [
      'doctor', 'hospital', 'clinic', 'nurse', 'medical', 'health',
      'appointment', 'checkup', 'check-up', 'symptoms', 'medication',
      'prescription', 'specialist', 'surgery', 'therapy', 'dentist',
      'pharmacy', 'pharmacist', 'lab', 'test', 'blood', 'x-ray',
      'scan', 'MRI', 'CT', 'ultrasound', 'physio', 'physical therapy',
      'occupational therapy', 'speech therapy', 'optometrist', 'eye doctor',
      'cardiologist', 'neurologist', 'oncologist', 'psychiatrist',
      'emergency', 'ER', 'urgent care', 'walk-in clinic'
    ],
    phrases: [
      'see the doctor', 'medical appointment', 'health appointment',
      'pick up prescription', 'refill medication', 'blood work'
    ]
  },

  social: {
    keywords: [
      'party', 'gathering', 'celebration', 'birthday', 'anniversary',
      'wedding', 'funeral', 'memorial', 'shower', 'reunion',
      'book club', 'club', 'meeting', 'group', 'friends',
      'visit', 'visiting', 'guests', 'hosting', 'potluck',
      'dinner party', 'barbecue', 'BBQ', 'picnic', 'brunch'
    ],
    phrases: [
      'get together', 'catch up with', 'meet with friends',
      'family gathering', 'book club', 'dinner with'
    ]
  },

  shopping: {
    keywords: [
      'store', 'shop', 'shopping', 'buy', 'purchase', 'grocery',
      'supermarket', 'mall', 'market', 'retail', 'department store',
      'Costco', 'Walmart', 'Loblaws', 'Metro', 'Sobeys', 'No Frills',
      'Canadian Tire', 'Home Depot', 'IKEA', 'Shoppers',
      'farmers market', 'thrift', 'outlet'
    ],
    phrases: [
      'go shopping', 'buy groceries', 'pick up groceries',
      'return something', 'exchange something'
    ]
  },

  dining: {
    keywords: [
      'restaurant', 'cafe', 'coffee', 'coffee shop', 'diner',
      'bistro', 'pub', 'bar', 'takeout', 'take-out', 'delivery',
      'Tim Hortons', 'Starbucks', 'McDonald', 'Wendy',
      'lunch', 'dinner', 'breakfast', 'brunch', 'supper',
      'reservation', 'menu', 'waiter', 'waitress', 'server'
    ],
    phrases: [
      'eat out', 'eating out', 'go for coffee', 'grab a bite',
      'dinner at', 'lunch at', 'order food'
    ]
  },

  services: {
    keywords: [
      'plumber', 'electrician', 'contractor', 'repair', 'fix',
      'maintenance', 'service', 'technician', 'installer',
      'handyman', 'carpenter', 'painter', 'roofer', 'HVAC',
      'appliance', 'furnace', 'air conditioning', 'AC',
      'mechanic', 'garage', 'car repair', 'oil change',
      'hairdresser', 'barber', 'salon', 'spa', 'massage',
      'cleaner', 'housekeeper', 'lawn', 'landscaper', 'snow removal'
    ],
    phrases: [
      'get something fixed', 'repair the', 'service call',
      'appointment with', 'coming to fix'
    ]
  },

  travel: {
    keywords: [
      'airport', 'flight', 'plane', 'airplane', 'airline',
      'hotel', 'motel', 'resort', 'vacation', 'holiday',
      'trip', 'travel', 'travelling', 'cruise', 'train',
      'bus station', 'rental car', 'passport', 'customs',
      'security', 'boarding', 'luggage', 'baggage', 'suitcase'
    ],
    phrases: [
      'going on vacation', 'taking a trip', 'flying to',
      'checking in', 'check in at', 'book a flight'
    ]
  },

  recreation: {
    keywords: [
      'movie', 'cinema', 'theatre', 'theater', 'concert',
      'show', 'performance', 'museum', 'gallery', 'exhibit',
      'park', 'zoo', 'aquarium', 'garden', 'botanical',
      'sports', 'game', 'hockey', 'baseball', 'football', 'soccer',
      'golf', 'bowling', 'curling', 'skating', 'swimming',
      'gym', 'fitness', 'exercise', 'yoga', 'class',
      'library', 'community centre', 'recreation centre'
    ],
    phrases: [
      'watch a movie', 'see a show', 'go to the game',
      'take a class', 'exercise class'
    ]
  },

  phone: {
    keywords: [
      'phone', 'call', 'calling', 'telephone', 'answering',
      'voicemail', 'message', 'text', 'texting'
    ],
    phrases: [
      'make a call', 'phone call', 'call to schedule',
      'call to cancel', 'answer the phone', 'leave a message'
    ]
  },

  religious: {
    keywords: [
      'church', 'temple', 'synagogue', 'mosque', 'chapel',
      'service', 'mass', 'worship', 'prayer', 'congregation',
      'pastor', 'priest', 'minister', 'rabbi', 'imam',
      'Sunday service', 'Bible study', 'choir', 'hymn'
    ],
    phrases: [
      'go to church', 'attend service', 'Sunday service',
      'prayer group', 'Bible study'
    ]
  },

  financial: {
    keywords: [
      'bank', 'banking', 'credit union', 'ATM', 'teller',
      'accountant', 'financial', 'advisor', 'investment',
      'taxes', 'CRA', 'tax return', 'RRSP', 'TFSA',
      'mortgage', 'loan', 'insurance', 'pension'
    ],
    phrases: [
      'go to the bank', 'meet with accountant', 'financial advisor',
      'pay bills', 'deposit cheque'
    ]
  }
};

/**
 * Detect the situation type from user input
 * @param {string} situation - The user's situation description
 * @returns {Object} Detection result with type and confidence
 */
function detectSituationType(situation) {
  if (!situation || typeof situation !== 'string') {
    return { type: 'general', confidence: 0, reason: 'No input provided' };
  }

  const lowerSituation = situation.toLowerCase();

  // Check for specific sub-types FIRST before general category matching
  // Book club is a special case that needs specific vocabulary from the book
  if (lowerSituation.includes('book club') || lowerSituation.includes('bookclub') ||
      (lowerSituation.includes('book') && (lowerSituation.includes('discussion') || lowerSituation.includes('group')))) {
    return {
      type: 'bookclub',  // Specific sub-type
      confidence: 0.95,
      reason: 'Detected book club/discussion situation - requires specific book vocabulary',
      requiresWebSearch: true  // Book clubs ALWAYS need web search for specific book content
    };
  }

  const scores = {};

  // Calculate scores for each category
  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    let score = 0;

    // Check keywords (1 point each)
    for (const keyword of patterns.keywords) {
      if (lowerSituation.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    // Check phrases (2 points each - more specific)
    for (const phrase of patterns.phrases) {
      if (lowerSituation.includes(phrase.toLowerCase())) {
        score += 2;
      }
    }

    if (score > 0) {
      scores[category] = score;
    }
  }

  // Find the highest scoring category
  const sortedCategories = Object.entries(scores)
    .sort(([, a], [, b]) => b - a);

  if (sortedCategories.length === 0) {
    return {
      type: 'general',
      confidence: 0,
      reason: 'No category keywords matched'
    };
  }

  const [topCategory, topScore] = sortedCategories[0];

  // Calculate confidence based on score and relative difference
  let confidence;
  if (topScore >= 4) {
    confidence = 0.9; // High confidence
  } else if (topScore >= 2) {
    confidence = 0.7; // Medium confidence
  } else {
    confidence = 0.5; // Low confidence
  }

  // Check if there's a close second (ambiguous)
  if (sortedCategories.length > 1) {
    const [, secondScore] = sortedCategories[1];
    if (secondScore >= topScore * 0.8) {
      confidence *= 0.8; // Reduce confidence for ambiguous cases
    }
  }

  return {
    type: topCategory,
    confidence,
    score: topScore,
    allScores: scores,
    reason: `Matched ${topScore} keyword(s)/phrase(s) for ${topCategory}`
  };
}

/**
 * Check if the situation likely needs web search
 * Web search is useful for specific named entities the AI might not know well
 * @param {string} situation - The user's situation description
 * @returns {boolean} Whether web search would be helpful
 */
function needsWebSearch(situation) {
  if (!situation || typeof situation !== 'string') {
    return false;
  }

  const lowerSituation = situation.toLowerCase();

  // Patterns that suggest specific named content
  const searchIndicators = [
    // Book/movie titles (often in quotes or with "by" author)
    /book\s*(club)?\s*(about|discussing|reading|for)\s+["']?[\w\s]+["']?/i,
    /reading\s+["'][\w\s]+["']/i,
    /by\s+[A-Z][\w]+\s+[A-Z][\w]+/i, // "by Author Name"

    // Recent years suggesting current events
    /\b202[4-9]\b/,
    /\b203\d\b/,

    // Specific show/movie references
    /(watching|discussing|about)\s+(the\s+)?["']?[\w\s]{3,}["']?\s*(show|series|movie|film)?/i,

    // Named events
    /\b(concert|show|performance)\s+(by|of|for)\s+[\w\s]+/i,

    // Product-specific
    /(new|buying|setting up)\s+[\w\s]*\s*(phone|device|computer|laptop|tablet)/i
  ];

  // Check if any indicator matches
  for (const pattern of searchIndicators) {
    if (pattern.test(situation)) {
      return true;
    }
  }

  // Check for quoted titles (strong indicator of specific content)
  const quotedContent = situation.match(/["'][\w\s]{3,}["']/);
  if (quotedContent) {
    return true;
  }

  return false;
}

/**
 * Extract potential search topics from the situation
 * @param {string} situation - The user's situation description
 * @returns {Array} Array of potential topics to search
 */
function extractSearchTopics(situation) {
  const topics = [];

  // Extract quoted content
  const quotedMatches = situation.match(/["']([^"']+)["']/g);
  if (quotedMatches) {
    quotedMatches.forEach(match => {
      topics.push(match.replace(/["']/g, '').trim());
    });
  }

  // Extract "by Author" patterns
  const authorMatch = situation.match(/by\s+([A-Z][\w]+(?:\s+[A-Z][\w]+)+)/i);
  if (authorMatch) {
    topics.push(authorMatch[1]);
  }

  // If no specific topics found, use the whole situation
  if (topics.length === 0) {
    topics.push(situation.trim());
  }

  return topics;
}

/**
 * Get all available situation categories
 * @returns {Array} List of category names
 */
function getAvailableCategories() {
  return ['medical', 'social', 'bookclub', 'shopping', 'dining', 'services',
          'travel', 'recreation', 'phone', 'religious', 'financial', 'general'];
}

module.exports = {
  detectSituationType,
  needsWebSearch,
  extractSearchTopics,
  getAvailableCategories,
  categoryPatterns
};
