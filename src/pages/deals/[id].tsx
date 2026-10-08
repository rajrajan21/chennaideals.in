import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import { ChevronUp, ChevronDown, MessageSquare, Clock, Tag, ExternalLink, ArrowLeft, Send, Flame } from 'lucide-react';
import { useSession } from '@/lib/auth/auth-client';
import { deal_detail } from 'virtual:content';

interface Deal {
  id: number; title: string; description: string | null; url: string | null;
  originalPrice: string | null; salePrice: string | null; savingsPercent: number | null;
  retailer: string | null; category: string | null; area: string | null;
  status: string; score: number; upvotes: number; downvotes: number;
  commentCount: number; viewCount: number; submittedByName: string | null;
  createdAt: string; isHot?: boolean;
}

interface Comment {
  id: number; dealId: number; userId: string; userName: string | null;
  body: string; parentId: number | null; createdAt: string;
}

const statusBadge: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: 'hsl(var(--muted-foreground))' },
  popular: { label: '🔥 Popular', color: 'hsl(var(--deal-hot))' },
  frontpage: { label: '⭐ Front Page', color: 'hsl(var(--deal-score-positive))' },
};

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [userVote, setUserVote] = useState(0);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/deals/${id}`)
      .then(r => r.json())
      .then(data => {
        setDeal(data.deal);
        setComments(data.comments || []);
        setUserVote(data.userVote || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleVote = async (value: 1 | -1) => {
    if (!user) { window.location.href = '/login'; return; }
    if (voting) return;
    setVoting(true);
    try {
      const res = await fetch(`/api/deals/${id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      const data = await res.json();
      if (res.ok) { setDeal(data.deal); setUserVote(data.userVote); }
    } finally { setVoting(false); }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { window.location.href = '/login'; return; }
    if (!commentBody.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/deals/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody }),
      });
      const data = await res.json();
      if (res.ok) {
        setComments(prev => [data, ...prev]);
        setCommentBody('');
        if (deal) setDeal({ ...deal, commentCount: deal.commentCount + 1 });
      }
    } finally { setSubmittingComment(false); }
  };

  const fmt = (v: string | null) => v ? `₹${parseFloat(v).toLocaleString('en-IN')}` : null;
  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  if (loading) return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
      </div>
    </main>
  );

  if (!deal) return (
    <main className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p className="text-muted-foreground text-lg">Deal not found.</p>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">← Back to deals</Link>
    </main>
  );

  const badge = statusBadge[deal.status] ?? statusBadge.new;

  return (
    <>
      <Helmet>
        <title>{deal.title} — ChennaiDeals.in</title>
        <meta name="description" content={deal.description?.slice(0, 160) ?? deal_detail.meta.description} />
      </Helmet>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-5 transition-colors">
          <ArrowLeft size={14} /> <span>{deal_detail.labels.backLink}</span>
        </Link>

        {/* Deal card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-card rounded-2xl border border-border p-5 mb-6"
        >
          {/* Status badge */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: `${badge.color}22`, color: badge.color }}>
              {badge.label}
            </span>
            {deal.retailer && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{deal.retailer}</span>
            )}
            {deal.category && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{deal.category}</span>
            )}
          </div>

          <h1 className="text-xl font-bold mb-4 leading-snug" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>
            {deal.title}
          </h1>

          {/* Price + vote row */}
          <div className="flex items-center gap-4 mb-4">
            {/* Vote */}
            <div className="flex flex-col items-center gap-0.5">
              <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                onClick={() => handleVote(1)} disabled={voting}
                className="p-1.5 rounded-lg transition-colors"
                style={{ background: userVote === 1 ? 'hsl(var(--deal-score-positive) / 0.15)' : 'hsl(var(--muted))', color: userVote === 1 ? 'hsl(var(--deal-score-positive))' : 'hsl(var(--muted-foreground))' }}
                aria-label="Upvote">
                <ChevronUp size={20} strokeWidth={2.5} />
              </motion.button>
              <span className="text-lg font-bold" style={{ color: deal.score > 0 ? 'hsl(var(--deal-score-positive))' : 'hsl(var(--muted-foreground))' }}>
                {deal.score}
              </span>
              <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                onClick={() => handleVote(-1)} disabled={voting}
                className="p-1.5 rounded-lg transition-colors"
                style={{ background: userVote === -1 ? 'hsl(var(--destructive) / 0.15)' : 'hsl(var(--muted))', color: userVote === -1 ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))' }}
                aria-label="Downvote">
                <ChevronDown size={20} strokeWidth={2.5} />
              </motion.button>
            </div>

            {/* Prices */}
            <div>
              {fmt(deal.salePrice) && (
                <div className="text-3xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--deal-score-positive))' }}>
                  {fmt(deal.salePrice)}
                </div>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                {fmt(deal.originalPrice) && (
                  <span className="text-base line-through text-muted-foreground">{fmt(deal.originalPrice)}</span>
                )}
                {deal.savingsPercent && (
                  <span className="text-sm font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">{deal.savingsPercent}% off</span>
                )}
              </div>
            </div>

            {/* CTA */}
            {deal.url && (
              <a href={deal.url} target="_blank" rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-transform hover:scale-105"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                <span>{deal_detail.labels.viewDeal}</span> <ExternalLink size={14} />
              </a>
            )}
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground border-t border-border pt-3">
            {deal.area && <span className="flex items-center gap-1"><Tag size={11} />{deal.area}</span>}
            <span className="flex items-center gap-1"><Clock size={11} />{timeAgo(deal.createdAt)}</span>
            <span className="flex items-center gap-1"><MessageSquare size={11} />{deal.commentCount} comments</span>
            {deal.submittedByName && <span>by {deal.submittedByName}</span>}
          </div>

          {/* Description */}
          {deal.description && (
            <div className="mt-4 pt-4 border-t border-border text-sm leading-relaxed" style={{ color: 'hsl(var(--foreground))' }}>
              {deal.description}
            </div>
          )}
        </motion.div>

        {/* Promotion progress bar */}
        <div className="bg-card rounded-xl border border-border p-4 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-widest mb-3 text-primary">Deal Lifecycle</h3>
          <div className="flex items-center gap-2">
            {(['new', 'popular', 'frontpage'] as const).map((s, i) => {
              const stages = ['new', 'popular', 'frontpage'];
              const current = stages.indexOf(deal.status);
              const isActive = i <= current;
              const isCurrent = s === deal.status;
              return (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold capitalize" style={{ color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>
                        {s === 'frontpage' ? 'Front Page' : s.charAt(0).toUpperCase() + s.slice(1)}
                      </span>
                      {isCurrent && <Flame size={12} className="text-primary" />}
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: isActive ? '100%' : '0%', background: 'hsl(var(--primary))' }} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {s === 'new' ? 'Score ≥ 50 → Popular' : s === 'popular' ? 'Score ≥ 150 → Front Page' : '🎉 Made it!'}
                    </div>
                  </div>
                  {i < 2 && <div className="text-muted-foreground text-lg shrink-0">→</div>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Current score: <span className="font-bold text-primary">{deal.score}</span>
            {deal.status === 'new' && ` · needs ${Math.max(0, 50 - deal.score)} more to reach Popular`}
            {deal.status === 'popular' && ` · needs ${Math.max(0, 150 - deal.score)} more to reach Front Page`}
          </div>
        </div>

        {/* Comments */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="font-bold text-base mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
            Discussion ({deal.commentCount})
          </h2>

          {/* Comment form */}
          {user ? (
            <form onSubmit={handleComment} className="mb-5">
              <textarea
                value={commentBody}
                onChange={e => setCommentBody(e.target.value)}
                placeholder="Share your thoughts on this deal..."
                rows={3}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                style={{ color: 'hsl(var(--foreground))' }}
              />
              <div className="flex justify-end mt-2">
                <button type="submit" disabled={submittingComment || !commentBody.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                  <Send size={14} /> {submittingComment ? 'Posting...' : 'Post Comment'}
                </button>
              </div>
            </form>
          ) : (
            <div className="mb-5 p-4 rounded-xl bg-muted text-sm text-center">
              <Link to="/login" className="text-primary font-semibold hover:underline">Sign in</Link> to join the discussion
            </div>
          )}

          {/* Comment list */}
          <div className="space-y-4">
            {comments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No comments yet. Be the first!</p>
            )}
            {comments.map(c => (
              <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}>
                  {(c.userName || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{c.userName || 'Anonymous'}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--foreground))' }}>{c.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
