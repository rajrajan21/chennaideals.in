/**
 * The rules that decide whether a submitted deal is accepted, accepted with a warning, or rejected.
 * Pure functions (no network) so they can be tested. The network part lives in deal-review.ts.
 */

export type ReviewInput = {
  title: string;
  description: string;
  url: string;
  retailer: string;
  originalPrice: number | null;
  salePrice: number | null;
};

export type PageInfo = {
  finalUrl: string;
  status: number;
  html: string;
  /** Readable text of the page (first few thousand characters). */
  text: string;
  title?: string;
  /** Price found on the page, if any. */
  pagePrice?: number;
};

export type Evidence = {
  /** null when no link was given */
  page: PageInfo | null;
  /** why the page could not be read: 'dns' = the website does not exist */
  fetchProblem: 'dns' | 'timeout' | 'blocked' | 'unsafe' | 'other' | null;
  domainAgeDays: number | null;
  safeBrowsingHit: boolean;
};

export type Verdict = {
  decision: 'reject' | 'caution' | 'ok';
  score: number;
  /** Why it was rejected (goes to the admin email, not shown in detail to the submitter). */
  rejectReasons: string[];
  /** Plain-language warnings for shoppers (goes into the editor's note). */
  cautions: string[];
  /** Everything that was noticed, for the admin email. */
  signals: string[];
};

// ---------- domains ----------
const OFFICIAL: Record<string, string[]> = {
  amazon: ['amazon.in', 'amazon.com', 'amzn.to', 'amzn.in', 'a.co'],
  flipkart: ['flipkart.com', 'fkrt.it', 'fkrt.cc', 'fktr.in'],
  myntra: ['myntra.com'],
  meesho: ['meesho.com'],
  nykaa: ['nykaa.com', 'nykaafashion.com'],
  bigbasket: ['bigbasket.com'],
  swiggy: ['swiggy.com', 'swiggy.in'],
  zomato: ['zomato.com', 'blinkit.com'],
  ajio: ['ajio.com'],
  tatacliq: ['tatacliq.com'],
  croma: ['croma.com'],
  jiomart: ['jiomart.com'],
  reliancedigital: ['reliancedigital.in'],
  snapdeal: ['snapdeal.com'],
  lenskart: ['lenskart.com'],
  firstcry: ['firstcry.com'],
  pharmeasy: ['pharmeasy.in'],
  decathlon: ['decathlon.in'],
  dominos: ['dominos.co.in'],
  apple: ['apple.com'],
  samsung: ['samsung.com'],
  oneplus: ['oneplus.in', 'oneplus.com'],
  boat: ['boat-lifestyle.com'],
  paytm: ['paytm.com'],
  phonepe: ['phonepe.com'],
};
const OFFICIAL_DOMAINS = new Set(Object.values(OFFICIAL).flat());
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 'cutt.ly', 'goo.gl', 't.co', 'is.gd', 'rb.gy', 'shorturl.at', 'ow.ly', 'tiny.cc', 'rebrand.ly', 'bl.ink', 'lnkd.in', 'wa.me', 't.me', 'telegram.me']);
const RISKY_TLDS = new Set(['xyz', 'top', 'click', 'icu', 'cyou', 'buzz', 'rest', 'monster', 'cfd', 'sbs', 'live', 'site', 'online', 'store', 'work', 'life', 'fun', 'vip', 'win', 'bid', 'loan', 'gq', 'tk', 'ml', 'cf', 'ga']);

export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const last = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  if (last.length === 2 && ['co', 'com', 'org', 'net', 'gov', 'ac', 'in', 'nic'].includes(second)) return parts.slice(-3).join('.');
  return parts.slice(-2).join('.');
}

export function isOfficialDomain(host: string): boolean {
  return OFFICIAL_DOMAINS.has(registrableDomain(host));
}

function brandImpersonated(host: string): string | null {
  const reg = registrableDomain(host);
  if (OFFICIAL_DOMAINS.has(reg)) return null;
  const compact = host.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const brand of Object.keys(OFFICIAL)) {
    if (brand.length >= 5 && compact.includes(brand)) return brand;
  }
  return null;
}

// ---------- words ----------
const ADULT = /\b(porn\w*|xxx|nude\w*|nsfw|onlyfans|escorts?|call\s*girls?|hook[\s-]?ups?|sex\s*(toys?|chat|video\w*|service\w*)|adult\s*(toys?|content|videos?)|dildo\w*|vibrators?|strip\s*club|erotic\w*|camgirls?|18\s*\+\s*(only|content|videos?)|massage\s*with\s*(happy|extra)|happy\s*ending)\b/i;
const ADULT_PAGE = /\b(porn\w*|xxx|nude\w*|onlyfans|escorts?|call\s*girls?|erotic\w*|camgirls?)\b/gi;
const GAMBLING = /\b(casino|betting|bet\s*now|satta|matka|teen\s*patti|rummy|lottery|jackpot|dream\s*11|fantasy\s*(cricket|league)|online\s*poker|slot\s*machines?|aviator\s*game|crypto\s*(trading|signals?)|forex\s*signals?)\b/i;
const ILLEGAL = /\b(weed|ganja|cocaine|heroin|mdma|lsd|hashish|charas|pistol|revolver|ammunition|fake\s*(id|aadhaar|pan|passport|currency|notes?)|hacked\s*(account|wifi)|carding|cvv\s*dump|counterfeit|stolen)\b/i;
const MONEY_SCAM = /\b(earn\s*(money|rs\.?|₹)?\s*(from\s*home|daily|online|per\s*day)|work\s*from\s*home\s*(and\s*)?earn|guaranteed\s*(income|returns?|profit)|double\s*your\s*money|instant\s*loan|loan\s*without\s*(documents?|cibil)|no\s*cibil|investment\s*plan\s*with\s*daily|part[\s-]?time\s*job\s*earn|refer\s*(and|&)\s*earn|invite\s*code|join\s*(our\s*)?(telegram|whatsapp)\s*(group|channel)?|task\s*(based\s*)?(job|earning))\b/i;
const PAYMENT_FLAGS: [RegExp, string][] = [
  [/\b(pay|send)\s*(the\s*)?(advance|token|booking)\s*(amount)?\b|\badvance\s*payment\b/i, 'asks for an advance payment'],
  [/\b(pay|send)\b[^.]{0,40}\b(via|to|on|through)\s*(upi|gpay|google\s*pay|phonepe|paytm)\b|\bupi\s*id\b/i, 'asks for direct UPI payment'],
  [/\b(whatsapp|telegram|dm)\s*(us|me)?\s*(to|for)\s*(order|buy|book|price)\b|\border\s*(only\s*)?(on|via|through)\s*whatsapp\b/i, 'orders only through WhatsApp/Telegram'],
  [/\b(bitcoin|btc|usdt|crypto\s*payment|western\s*union|gift\s*cards?\s*(only|payment))\b/i, 'asks for crypto or gift-card payment'],
  [/\b(no\s*returns?|no\s*refunds?|final\s*sale\s*no\s*refund)\b/i, 'says there are no returns or refunds'],
];
const HYPE = /\b(100\s*%\s*(guaranteed|genuine|original|safe)|only\s*today|last\s*\d+\s*(pieces?|units?|hours?|minutes?)|hurry\s*up|limited\s*time\s*only|grab\s*now\s*before|free\s*gift\s*for\s*everyone|you\s*(have\s*)?won)\b/i;
const POLICY_LINK = /(contact|about|privacy|refund|return|shipping|terms|policy|policies)/i;

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3);
}

export function assess(input: ReviewInput, ev: Evidence): Verdict {
  let score = 0;
  const rejectReasons: string[] = [];
  const cautions: string[] = [];
  const signals: string[] = [];
  const add = (points: number, signal: string, caution?: string) => {
    score += points;
    signals.push(`${signal} (+${points})`);
    if (caution && !cautions.includes(caution)) cautions.push(caution);
  };

  const submitted = `${input.title}\n${input.description}\n${input.retailer}\n${input.url}`;

  // ----- 1. what the submitter wrote -----
  if (ADULT.test(submitted)) rejectReasons.push('Adult or sexual content in the deal text');
  if (ILLEGAL.test(submitted)) rejectReasons.push('Illegal or restricted items mentioned');
  if (GAMBLING.test(submitted)) rejectReasons.push('Gambling / betting / trading-signal solicitation');
  if (MONEY_SCAM.test(submitted)) rejectReasons.push('"Earn money" / loan / referral solicitation');

  const upper = input.title.replace(/[^A-Za-z]/g, '');
  if (upper.length >= 12 && upper === upper.toUpperCase()) add(8, 'Title is all capital letters');
  if (HYPE.test(submitted)) add(10, 'Pressure / hype wording', 'The wording pushes you to hurry. Take your time and check the offer yourself.');

  // ----- 2. prices -----
  const { originalPrice: orig, salePrice: sale } = input;
  if (sale !== null && sale > 0 && sale < 10) add(25, 'Sale price is under Rs 10', 'The price looks unrealistically low.');
  if (orig !== null && sale !== null && orig > 0 && sale > orig) add(10, 'Sale price is higher than the original price');
  const discount = orig && sale && orig > sale ? Math.round(((orig - sale) / orig) * 100) : 0;

  // ----- 3. the link -----
  let host = '';
  let official = false;
  if (input.url) {
    try {
      const u = new URL(ev.page?.finalUrl || input.url);
      host = u.hostname.toLowerCase();
      official = isOfficialDomain(host);
      const reg = registrableDomain(host);
      const original = new URL(input.url);
      if (SHORTENERS.has(registrableDomain(original.hostname)) && (!ev.page || registrableDomain(original.hostname) === reg)) {
        add(25, `Link is a shortener (${original.hostname}) that could not be expanded`, 'The link is a shortened link, so the real shop is hidden.');
      }
      if (u.protocol !== 'https:') add(15, 'Page is not HTTPS', 'The website does not use a secure (https) connection. Never enter card details there.');
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) add(40, 'Link uses an IP address instead of a name', 'The link points to a raw IP address instead of a shop name.');
      if (host.includes('xn--')) add(30, 'Look-alike (punycode) domain', 'The website name uses look-alike characters.');
      const tld = reg.split('.').pop() ?? '';
      if (!official && RISKY_TLDS.has(tld)) add(20, `Risky domain ending .${tld}`, 'This website address ending is often used by throw-away shops.');
      const imp = brandImpersonated(host);
      if (imp) { add(60, `Domain imitates "${imp}" but is not official (${reg})`, `This link pretends to be ${imp[0].toUpperCase()}${imp.slice(1)} but is NOT its official website.`); rejectReasons.push(`Look-alike of ${imp}: ${reg}`); }
      if (!official && (reg.match(/-/g) ?? []).length >= 2) add(10, 'Domain has many hyphens');
      if (!official && /\d{3,}/.test(reg.split('.')[0])) add(8, 'Domain name contains many digits');
    } catch {
      rejectReasons.push('The link is not a valid web address');
    }

    if (ev.fetchProblem === 'dns') rejectReasons.push('The website does not exist (name could not be found)');
    else if (ev.fetchProblem === 'unsafe') rejectReasons.push('The link points to a private, local or non-standard address');
    else if (ev.page && (ev.page.status === 404 || ev.page.status === 410)) rejectReasons.push(`The link is dead (HTTP ${ev.page.status})`);
    else if (ev.fetchProblem === 'timeout') add(10, 'Website did not answer in time', 'We could not open this link automatically, so it could not be checked.');
    else if (ev.fetchProblem === 'blocked' || (ev.page && (ev.page.status === 403 || ev.page.status === 429 || ev.page.status === 401))) {
      if (!official) add(10, 'Website blocked our automatic check', 'We could not open this link automatically, so it could not be checked.');
    } else if (ev.fetchProblem === 'other' || (ev.page && ev.page.status >= 500)) {
      add(8, 'Website returned an error');
    }

    if (ev.safeBrowsingHit) rejectReasons.push('Google Safe Browsing lists this website as dangerous');
    if (ev.domainAgeDays !== null && !official) {
      if (ev.domainAgeDays < 30) add(40, `Website domain is only ${ev.domainAgeDays} days old`, 'This website was created only a few weeks ago. New shops are a common scam pattern.');
      else if (ev.domainAgeDays < 180) add(20, `Website domain is ${ev.domainAgeDays} days old`, 'This website is less than 6 months old.');
    }

    // ----- 4. what the page says -----
    const page = ev.page;
    if (page && page.status < 400 && page.html) {
      const text = `${page.title ?? ''}\n${page.text}`;
      const adultHits = (text.match(ADULT_PAGE) ?? []).length;
      if (adultHits >= 2) rejectReasons.push('The linked page contains adult content');
      if (!official && GAMBLING.test(text) && (text.match(GAMBLING) ?? []).length >= 2) rejectReasons.push('The linked page is about gambling / betting');
      if (!official && ILLEGAL.test(text) && (text.match(new RegExp(ILLEGAL.source, 'gi')) ?? []).length >= 2) rejectReasons.push('The linked page sells illegal or restricted items');

      if (!official) {
        const flagged: string[] = [];
        for (const [re, label] of PAYMENT_FLAGS) if (re.test(text)) flagged.push(label);
        if (flagged.length > 0) add(Math.min(40, flagged.length * 20), `Page ${flagged.join('; ')}`, `This website ${flagged[0]}. That is a common scam sign.`);
        const links = Array.from(page.html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]{0,80}?)<\/a>/gi));
        const policyLinks = links.filter((m) => POLICY_LINK.test(m[1]) || POLICY_LINK.test(m[2].replace(/<[^>]+>/g, ''))).length;
        if (links.length >= 3 && policyLinks === 0) add(15, 'No contact / about / refund / privacy links found', 'The website shows no contact, refund or privacy information.');
        if (!/(\+?91[\s-]?)?[6-9]\d{9}|@[a-z0-9-]+\.[a-z]{2,}|customer\s*care|contact\s*us/i.test(text)) add(8, 'No phone, email or contact wording found');
      }

      // does the page agree with what was submitted?
      if (page.pagePrice !== undefined && sale !== null && sale > 0) {
        const ratio = page.pagePrice / sale;
        if (ratio > 1.25 || ratio < 0.8) {
          add(15, `Price on the page (${page.pagePrice}) differs from the submitted price (${sale})`, `The price on the website (about ${Math.round(page.pagePrice)}) is different from the price in this post. Check the real price before paying.`);
        }
      }
      const pageWords = new Set(words(`${page.title ?? ''} ${page.text.slice(0, 1500)}`));
      const titleWords = words(input.title).filter((w) => !/^\d+$/.test(w));
      if (titleWords.length >= 3 && pageWords.size > 8) {
        const overlap = titleWords.filter((w) => pageWords.has(w)).length / titleWords.length;
        if (overlap < 0.15) add(15, 'Deal title does not match the linked page', 'The product on the linked page may not be the product described in this post.');
      }
    }

    // very big discounts
    if (discount >= 90) add(official ? 5 : 35, `Discount of ${discount}%`, `A ${discount}% discount is extremely unusual. Be very careful.`);
    else if (discount >= 80) add(official ? 3 : 25, `Discount of ${discount}%`, `An ${discount}% discount is unusually high. Check the seller carefully.`);
    else if (discount >= 70 && !official) add(10, `Discount of ${discount}%`, `A ${discount}% discount on an unfamiliar website is a common scam pattern.`);
  } else {
    // no link: fine for local-store deals, nothing to verify
    if (discount >= 90) add(20, `Discount of ${discount}% with no link to check`, `A ${discount}% discount with no link to check is unusual.`);
  }

  if (official && rejectReasons.length === 0) score = Math.max(0, score - 10);

  let decision: Verdict['decision'] = 'ok';
  if (rejectReasons.length > 0 || score >= 70) decision = 'reject';
  else if (score >= 20 || cautions.length > 0) decision = 'caution';
  if (decision === 'reject' && rejectReasons.length === 0) rejectReasons.push(`Combined risk score ${score} is too high`);
  return { decision, score, rejectReasons, cautions, signals };
}

/** The editor's-note text shown to shoppers on a deal that was accepted with warnings. */
export function cautionNote(cautions: string[]): string {
  const lines = cautions.map((c) => `• ${c}`).join('\n');
  return [
    '⚠️ AUTOMATIC SAFETY CHECK - PLEASE BE EXTRA CAREFUL WITH THIS DEAL',
    lines,
    '• This deal could be a scam. Verify the seller and the final price yourself before paying.',
    '• Do not pay in advance, share OTPs, card details or passwords, and do not install apps from links.',
    'ChennaiDeals.in only shares deals posted by the community. Buying is entirely at your own risk and responsibility; this website is not responsible for any order, payment, delivery or product.',
  ].filter(Boolean).join('\n');
}

export const REJECT_MESSAGE =
  'Sorry, this deal could not be accepted because it did not pass our automatic safety review. ' +
  'We do not post deals with unsafe or unverifiable links, adult or "earn money" content, or poor pictures. ' +
  'If you think this is a mistake, email Chennaideals.in@gmail.com.';
