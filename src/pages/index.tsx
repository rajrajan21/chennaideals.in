import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronUp, ChevronDown, MessageSquare, Clock, Tag, Filter, X, Plus, Star, Flame, Sparkles } from 'lucide-react';
import { home } from 'virtual:content';
import { useSession } from '@/lib/auth/auth-client';

// ── Live deal type ────────────────────────────────────────────────────────────
interface LiveDeal {
  id: number; title: string; salePrice: string | null; originalPrice: string | null;
  savingsPercent: number | null; retailer: string | null; category: string | null;
  area: string | null; status: string; score: number; upvotes: number; downvotes: number;
  commentCount: number; submittedByName: string | null; createdAt: string;
}

type FeedTab = 'frontpage' | 'popular' | 'new';

const tabConfig: { id: FeedTab; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'frontpage', label: 'Front Page', icon: <Star size={14} />, desc: 'Score ≥ 150' },
  { id: 'popular', label: 'Popular', icon: <Flame size={14} />, desc: 'Score ≥ 50' },
  { id: 'new', label: 'New', icon: <Sparkles size={14} />, desc: 'Just submitted' },
];

// ── Countdown timer hook ──────────────────────────────────────────────────────
function useCountdown(hours: number) {
  const target = useRef(Date.now() + hours * 3600 * 1000);
  const [remaining, setRemaining] = useState({ h: hours, m: 0, s: 0 });
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, target.current - Date.now());
      setRemaining({
        h: Math.floor(diff / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return remaining;
}

// ── Kolam SVG pattern ─────────────────────────────────────────────────────────
function KolamPattern({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 20" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      {[0, 20, 40, 60, 80, 100].map(x => (
        <g key={x}>
          <circle cx={x + 10} cy="10" r="2" fill="hsl(var(--primary))" fillOpacity="0.4" />
          <circle cx={x + 10} cy="10" r="5" stroke="hsl(var(--primary))" strokeOpacity="0.2" strokeWidth="0.8" fill="none" />
          <line x1={x + 2} y1="10" x2={x + 8} y2="10" stroke="hsl(var(--primary))" strokeOpacity="0.25" strokeWidth="0.8" />
          <line x1={x + 12} y1="10" x2={x + 18} y2="10" stroke="hsl(var(--primary))" strokeOpacity="0.25" strokeWidth="0.8" />
          <line x1={x + 10} y1="2" x2={x + 10} y2="8" stroke="hsl(var(--primary))" strokeOpacity="0.25" strokeWidth="0.8" />
          <line x1={x + 10} y1="12" x2={x + 10} y2="18" stroke="hsl(var(--primary))" strokeOpacity="0.25" strokeWidth="0.8" />
        </g>
      ))}
    </svg>
  );
}

// ── Retailer badge styles (keyed by static string, not content) ───────────────
const retailerStyle: Record<string, { bg: string; text: string }> = {
  Flipkart: { bg: 'hsl(var(--retailer-flipkart) / 0.12)', text: 'hsl(var(--retailer-flipkart))' },
  Amazon: { bg: 'hsl(var(--retailer-amazon) / 0.12)', text: 'hsl(var(--retailer-amazon))' },
  Meesho: { bg: 'hsl(var(--secondary) / 0.12)', text: 'hsl(var(--secondary))' },
  'Local Store': { bg: 'hsl(var(--retailer-local) / 0.12)', text: 'hsl(var(--retailer-local))' },
};

const categoryEmoji: Record<string, string> = {
  Electronics: '📱', 'Mobile Phones': '📱', Groceries: '🥦',
  Fashion: '👗', Restaurants: '🍽️', Travel: '✈️', 'Home & Kitchen': '🏠',
};

const retailerCardColors: Record<string, { bg: string; text: string; icon: string }> = {
  flipkart: { bg: 'hsl(var(--retailer-flipkart) / 0.08)', text: 'hsl(var(--retailer-flipkart))', icon: '🛒' },
  amazon: { bg: 'hsl(var(--retailer-amazon) / 0.08)', text: 'hsl(var(--retailer-amazon))', icon: '📦' },
  meesho: { bg: 'hsl(var(--secondary) / 0.08)', text: 'hsl(var(--secondary))', icon: '🛍️' },
  local: { bg: 'hsl(var(--retailer-local) / 0.08)', text: 'hsl(var(--retailer-local))', icon: '🏪' },
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const countdown = useCountdown(7);
  const { user } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeRetailer, setActiveRetailer] = useState('All');

  // Live feed state
  const [activeTab, setActiveTab] = useState<FeedTab>('frontpage');
  const [liveDeals, setLiveDeals] = useState<LiveDeal[]>([]);
  const [tabCounts, setTabCounts] = useState({ frontpage: 0, popular: 0, new: 0 });
  const [feedLoading, setFeedLoading] = useState(true);
  const [userVotes, setUserVotes] = useState<Record<number, number>>({});

  const fetchDeals = async (tab: FeedTab, cat: string, ret: string) => {
    setFeedLoading(true);
    try {
      const params = new URLSearchParams({ status: tab });
      if (cat !== 'All') params.set('category', cat);
      if (ret !== 'All') params.set('retailer', ret);
      const res = await fetch(`/api/deals?${params}`);
      const data = await res.json();
      setLiveDeals(data.deals || []);
      setTabCounts(data.tabCounts || { frontpage: 0, popular: 0, new: 0 });
    } finally {
      setFeedLoading(false);
    }
  };

  useEffect(() => { fetchDeals(activeTab, activeCategory, activeRetailer); }, [activeTab, activeCategory, activeRetailer]);

  const handleVote = async (dealId: number, value: 1 | -1) => {
    if (!user) { window.location.href = '/login'; return; }
    const res = await fetch(`/api/deals/${dealId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    const data = await res.json();
    if (res.ok) {
      setLiveDeals(prev => prev.map(d => d.id === dealId ? { ...d, ...data.deal } : d));
      setUserVotes(prev => ({ ...prev, [dealId]: data.userVote }));
    }
  };

  const filterCategories = ['All', 'Electronics', 'Fashion', 'Groceries', 'Restaurants', 'Mobile Phones', 'Home & Kitchen'];
  const filterRetailers = ['All', 'Flipkart', 'Amazon', 'Meesho', 'Local Stores'];
  const filterAreas = ['All Chennai', 'T. Nagar', 'Anna Nagar', 'Velachery', 'Adyar', 'OMR', 'Porur'];

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  // Inline retailer badge renderer
  const inlineRetailerBadge = (name: string | null) => {
    if (!name) return null;
    const s = retailerStyle[name] ?? retailerStyle['Local Store'];
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: s.bg, color: s.text }}>
        {name}
      </span>
    );
  };

  return (
    <>
      <Helmet>
        <title>ChennaiDeals.in — Hottest Deals in Chennai | Flipkart, Amazon & Local Stores</title>
        <meta name="description" content="Find the best deals in Chennai — electronics, fashion, groceries, restaurants and more from Flipkart, Amazon, Meesho and local Chennai retailers. Updated daily." />
        <link rel="canonical" href="https://chennaideals.in/" />
        <meta property="og:title" content="ChennaiDeals.in — Hottest Deals in Chennai" />
        <meta property="og:description" content="Chennai's #1 deals community. Hot deals from Flipkart, Amazon and local stores." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://chennaideals.in/" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <main>
        {/* ── Deal of the Day Banner ─────────────────────────────────────── */}
        <section
          className="relative overflow-hidden"
          aria-label="Deal of the Day"
          style={{ background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 60%, hsl(var(--secondary)) 100%)' }}
        >
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="kolam-bg" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                  <circle cx="20" cy="20" r="3" fill="white" />
                  <circle cx="20" cy="20" r="8" stroke="white" strokeWidth="0.8" fill="none" />
                  <circle cx="20" cy="20" r="14" stroke="white" strokeWidth="0.5" fill="none" />
                  <line x1="6" y1="20" x2="14" y2="20" stroke="white" strokeWidth="0.8" />
                  <line x1="26" y1="20" x2="34" y2="20" stroke="white" strokeWidth="0.8" />
                  <line x1="20" y1="6" x2="20" y2="14" stroke="white" strokeWidth="0.8" />
                  <line x1="20" y1="26" x2="20" y2="34" stroke="white" strokeWidth="0.8" />
                  <circle cx="0" cy="0" r="1.5" fill="white" />
                  <circle cx="40" cy="0" r="1.5" fill="white" />
                  <circle cx="0" cy="40" r="1.5" fill="white" />
                  <circle cx="40" cy="40" r="1.5" fill="white" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#kolam-bg)" />
            </svg>
          </div>

          <div className="relative max-w-7xl mx-auto px-4 py-8">
            {/* H1 — page title for SEO */}
            <h1 className="sr-only">ChennaiDeals.in — Hottest Deals in Chennai</h1>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide"
                    style={{ background: 'hsl(var(--deal-hot))', color: 'hsl(var(--deal-hot-foreground))' }}
                  >
                    ⭐ <span>{home.dealOfTheDay.badge}</span>
                  </span>
                  {/* Retailer badge — static string key, not content prop */}
                  {inlineRetailerBadge(home.dealOfTheDay.retailer)}
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-white mb-3 leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>
                  {home.dealOfTheDay.title}
                </h2>
                <div className="flex items-baseline gap-3 mb-4">
                  <span className="text-4xl font-bold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
                    {home.dealOfTheDay.salePrice}
                  </span>
                  <span className="text-lg line-through text-white opacity-60">
                    {home.dealOfTheDay.originalPrice}
                  </span>
                  <span className="px-3 py-1 rounded-full text-sm font-bold" style={{ background: 'hsl(var(--footer-bg) / 0.3)', color: 'white' }}>
                    {home.dealOfTheDay.savings}
                  </span>
                </div>
                <a
                  href="#"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-transform hover:scale-105"
                  style={{ background: 'hsl(var(--footer-bg))', color: 'hsl(var(--primary))' }}
                >
                  <span>{home.dealOfTheDay.ctaLabel}</span> →
                </a>
              </div>

              {/* Countdown */}
              <div
                className="shrink-0 p-5 rounded-2xl text-center min-w-48"
                style={{ background: 'hsl(var(--footer-bg) / 0.3)', backdropFilter: 'blur(8px)' }}
              >
                <p className="text-white text-xs font-semibold uppercase tracking-widest mb-3 opacity-80">
                  {home.dealOfTheDay.expiresLabel}
                </p>
                <div className="flex items-center justify-center gap-2">
                  {[{ val: pad(countdown.h), label: 'HRS' }, { val: pad(countdown.m), label: 'MIN' }, { val: pad(countdown.s), label: 'SEC' }].map((unit, i) => (
                    <div key={unit.label} className="flex items-center gap-2">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-white px-3 py-2 rounded-xl min-w-14" style={{ background: 'hsl(var(--footer-bg) / 0.5)', fontFamily: 'var(--font-heading)' }}>
                          {unit.val}
                        </div>
                        <div className="text-xs text-white opacity-60 mt-1">{unit.label}</div>
                      </div>
                      {i < 2 && <span className="text-2xl font-bold text-white opacity-60 mb-4">:</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Trending Ticker ───────────────────────────────────────────── */}
        <div className="border-b border-border overflow-hidden" style={{ background: 'hsl(var(--footer-bg))' }}>
          <div className="flex items-center">
            <div
              className="shrink-0 px-4 py-2.5 text-xs font-bold uppercase tracking-wide"
              style={{ background: 'hsl(var(--deal-hot))', color: 'hsl(var(--deal-hot-foreground))' }}
            >
              🔥 Trending
            </div>
            <div className="overflow-hidden flex-1">
              <motion.div
                className="flex gap-8 whitespace-nowrap py-2.5 px-4"
                animate={{ x: ['0%', '-50%'] }}
                transition={{ duration: 30, repeat: Infinity, ease: 'linear' as const }}
              >
                {[...home.trendingTicker, ...home.trendingTicker].map((item, i) => (
                  <span key={`${item.id}-${i}`} className="text-xs font-medium shrink-0" style={{ color: 'hsl(var(--footer-text))' }}>
                    <span>{item.text}</span>
                    <span className="mx-4 opacity-30">|</span>
                  </span>
                ))}
              </motion.div>
            </div>
          </div>
        </div>

        {/* ── Main Feed ─────────────────────────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex gap-6">
            {/* Sidebar */}
            <aside className="hidden lg:block w-56 shrink-0">
              <div className="sticky top-28 space-y-5">
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-3 text-primary">Categories</h3>
                  <div className="space-y-1">
                    {filterCategories.map(cat => (
                      <button key={cat} onClick={() => setActiveCategory(cat)}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors"
                        style={{ background: activeCategory === cat ? 'hsl(var(--primary) / 0.12)' : 'transparent', color: activeCategory === cat ? 'hsl(var(--primary))' : 'hsl(var(--foreground))', fontWeight: activeCategory === cat ? 600 : 400 }}>
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-3 text-primary">Retailers</h3>
                  <div className="space-y-1">
                    {filterRetailers.map(r => (
                      <button key={r} onClick={() => setActiveRetailer(r)}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors"
                        style={{ background: activeRetailer === r ? 'hsl(var(--primary) / 0.12)' : 'transparent', color: activeRetailer === r ? 'hsl(var(--primary))' : 'hsl(var(--foreground))', fontWeight: activeRetailer === r ? 600 : 400 }}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-3 text-primary">Chennai Areas</h3>
                  <div className="space-y-1">
                    {filterAreas.map(area => (
                      <button key={area} className="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-muted" style={{ color: 'hsl(var(--foreground))' }}>
                        {area}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-3 text-primary">Price Range</h3>
                  <div className="space-y-2">
                    {['Under ₹500', '₹500 – ₹2,000', '₹2,000 – ₹10,000', 'Above ₹10,000'].map(r => (
                      <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" className="accent-primary" />
                        <span style={{ color: 'hsl(var(--foreground))' }}>{r}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            {/* Deal feed */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                {/* 3-tab lifecycle switcher */}
                <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
                  {tabConfig.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        background: activeTab === tab.id ? 'hsl(var(--card))' : 'transparent',
                        color: activeTab === tab.id ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                        boxShadow: activeTab === tab.id ? '0 1px 4px hsl(var(--primary) / 0.15)' : 'none',
                      }}>
                      {tab.icon}
                      <span>{tab.label}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: activeTab === tab.id ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--border))', color: activeTab === tab.id ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>
                        {tabCounts[tab.id]}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Link to="/deals/submit"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors"
                    style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                    <Plus size={14} /> Submit Deal
                  </Link>
                  <button className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border" onClick={() => setSidebarOpen(true)} style={{ color: 'hsl(var(--foreground))' }}>
                    <Filter size={14} /> Filters
                  </button>
                </div>
              </div>

              {/* Tab description */}
              <p className="text-xs text-muted-foreground mb-3">
                {activeTab === 'frontpage' && '⭐ Top deals voted to the front page by the community (score ≥ 150)'}
                {activeTab === 'popular' && '🔥 Rising deals gaining traction (score ≥ 50) — vote to push them to Front Page!'}
                {activeTab === 'new' && '✨ Freshly submitted deals — be the first to vote and help the best ones rise!'}
              </p>

              <div className="relative mb-4 h-5 overflow-hidden">
                <KolamPattern className="w-full h-full" />
              </div>

              {/* Live deal cards */}
              <AnimatePresence mode="wait">
                <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="space-y-3">
                  {feedLoading && [1,2,3,4].map(i => (
                    <div key={i} className="bg-card rounded-xl border border-border p-3 h-24 animate-pulse" />
                  ))}

                  {!feedLoading && liveDeals.length === 0 && (
                    <div className="text-center py-16 bg-card rounded-xl border border-border">
                      <div className="text-4xl mb-3">🏷️</div>
                      <p className="font-semibold mb-1" style={{ color: 'hsl(var(--foreground))' }}>No deals here yet</p>
                      <p className="text-sm text-muted-foreground mb-4">
                        {activeTab === 'new' ? 'Be the first to submit a deal!' : `No deals have reached ${activeTab === 'popular' ? 'Popular' : 'Front Page'} yet. Vote on New deals!`}
                      </p>
                      <Link to="/deals/submit" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm"
                        style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                        <Plus size={14} /> Submit a Deal
                      </Link>
                    </div>
                  )}

                  {!feedLoading && liveDeals.map((deal, i) => (
                    <motion.article key={deal.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.04, ease: 'easeOut' as const }}
                      whileHover={{ y: -2, boxShadow: '0 8px 24px hsl(var(--primary) / 0.12)' }}
                      className="bg-card rounded-xl border border-border p-3 flex gap-3 transition-shadow"
                    >
                      {/* Vote column */}
                      <div className="flex flex-col items-center gap-0.5 shrink-0 w-12">
                        <motion.button whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}
                          onClick={() => handleVote(deal.id, 1)}
                          className="p-0.5 rounded transition-colors"
                          style={{ color: userVotes[deal.id] === 1 ? 'hsl(var(--deal-score-positive))' : 'hsl(var(--muted-foreground))' }}
                          aria-label="Upvote">
                          <ChevronUp size={16} strokeWidth={2.5} />
                        </motion.button>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2"
                          style={{
                            background: deal.score > 0 ? 'hsl(var(--deal-score-positive) / 0.1)' : 'hsl(var(--muted))',
                            borderColor: deal.score > 0 ? 'hsl(var(--deal-score-positive))' : 'hsl(var(--border))',
                            color: deal.score > 0 ? 'hsl(var(--deal-score-positive))' : 'hsl(var(--muted-foreground))',
                          }}>
                          {deal.score > 999 ? `${Math.floor(deal.score / 1000)}k` : deal.score}
                        </div>
                        <motion.button whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}
                          onClick={() => handleVote(deal.id, -1)}
                          className="p-0.5 rounded transition-colors"
                          style={{ color: userVotes[deal.id] === -1 ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))' }}
                          aria-label="Downvote">
                          <ChevronDown size={16} strokeWidth={2.5} />
                        </motion.button>
                      </div>

                      {/* Thumbnail */}
                      <div className="shrink-0 w-20 h-20 rounded-lg flex items-center justify-center text-2xl" style={{ background: 'hsl(var(--muted))' }}>
                        {categoryEmoji[deal.category ?? ''] ?? '🏷️'}
                      </div>

                      {/* Content */}
                      <Link to={`/deals/${deal.id}`} className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="text-sm font-semibold leading-snug line-clamp-2" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>
                            {deal.title}
                          </h3>
                          {deal.score >= 150 && (
                            <motion.span animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' as const }}
                              className="shrink-0 px-2 py-0.5 rounded-full text-xs font-bold"
                              style={{ background: 'hsl(var(--deal-hot))', color: 'hsl(var(--deal-hot-foreground))' }}>
                              🔥 HOT
                            </motion.span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-2 mb-1.5">
                          {deal.salePrice && (
                            <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--deal-score-positive))' }}>
                              ₹{parseFloat(deal.salePrice).toLocaleString('en-IN')}
                            </span>
                          )}
                          {deal.originalPrice && (
                            <span className="text-sm line-through" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              ₹{parseFloat(deal.originalPrice).toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {inlineRetailerBadge(deal.retailer)}
                          {deal.area && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                              <Tag size={10} />{deal.area}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            <Clock size={11} />{timeAgo(deal.createdAt)}
                          </span>
                          <span className="flex items-center gap-1 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            <MessageSquare size={11} />{deal.commentCount}
                          </span>
                        </div>
                      </Link>
                    </motion.article>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ── Deals by Chennai Area ─────────────────────────────────────── */}
        <section className="py-10 bg-muted">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>Deals by Chennai Area</h2>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {home.areas.map((area, i) => (
                <motion.a
                  key={area.id}
                  href="#"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  className="shrink-0 bg-card rounded-xl border border-border p-4 text-center min-w-28 transition-shadow hover:shadow-md"
                >
                  <div className="text-3xl mb-2">{area.emoji}</div>
                  <div className="text-sm font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>
                    {area.name}
                  </div>
                  <div className="text-xs mt-1 font-medium text-primary">
                    {area.dealCount} deals
                  </div>
                </motion.a>
              ))}
            </div>
          </div>
        </section>

        {/* ── Top Retailers Today ───────────────────────────────────────── */}
        <section className="py-10">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>Top Retailers Today</h2>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {home.retailers.map((retailer, i) => {
                const c = retailerCardColors[retailer.colorClass] ?? retailerCardColors.local;
                return (
                  <motion.a
                    key={retailer.id}
                    href="#"
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.07 }}
                    whileHover={{ scale: 1.03 }}
                    className="rounded-xl border border-border p-5 text-center transition-shadow hover:shadow-md"
                    style={{ background: c.bg }}
                  >
                    <div className="text-3xl mb-2">{c.icon}</div>
                    <div className="font-bold text-sm mb-1" style={{ fontFamily: 'var(--font-heading)', color: c.text }}>
                      {retailer.name}
                    </div>
                    <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {retailer.dealCount} active deals
                    </div>
                  </motion.a>
                );
              })}
            </div>
          </div>
        </section>

        <div className="relative h-6 overflow-hidden bg-muted">
          <KolamPattern className="w-full h-full" />
        </div>
      </main>

      {/* Mobile filter drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground opacity-40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-card overflow-y-auto p-5 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-base" style={{ fontFamily: 'var(--font-heading)' }}>Filters</h3>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg hover:bg-muted"><X size={18} /></button>
            </div>
            <div className="space-y-5">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-primary">Categories</h4>
                <div className="flex flex-wrap gap-2">
                  {filterCategories.map(cat => (
                    <button key={cat} onClick={() => setActiveCategory(cat)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                      style={{ background: activeCategory === cat ? 'hsl(var(--primary))' : 'transparent', color: activeCategory === cat ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-primary">Retailers</h4>
                <div className="flex flex-wrap gap-2">
                  {filterRetailers.map(r => (
                    <button key={r} onClick={() => setActiveRetailer(r)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                      style={{ background: activeRetailer === r ? 'hsl(var(--primary))' : 'transparent', color: activeRetailer === r ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
