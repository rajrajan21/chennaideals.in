import { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import { useSession } from '@/lib/auth/auth-client';
import { deal_detail } from 'virtual:content';
import VotePopup from '@/components/VotePopup';
import { ChevronUp, ChevronDown, MessageSquare, Clock, Tag, ExternalLink, ArrowLeft, Send, Flame, Search, StickyNote, Bookmark, Share2, Check } from 'lucide-react';
import MediaGallery from '@/components/MediaGallery';
import MediaPicker from '@/components/MediaPicker';
import { uploadDealMedia, type MediaItem } from '@/lib/media';

interface Deal {
  id: number; title: string; description: string | null; url: string | null;
  originalPrice: string | null; salePrice: string | null; savingsPercent: number | null;
  retailer: string | null; category: string | null; area: string | null;
  status: string; score: number; upvotes: number; downvotes: number;
  commentCount: number; viewCount: number; submittedByName: string | null;
    createdAt: string; isHot?: boolean; editorNote?: string | null; submittedBy?: string | null;
  imageUrl?: string | null;
}

interface Comment {
  id: number; dealId: number; userId: string; userName: string | null;
  body: string; parentId: number | null; createdAt: string;
}

const statusBadge: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: 'hsl(var(--muted-foreground))' },
  popular: { label: 'ðŸ”¥ Popular', color: 'hsl(var(--deal-hot))' },
  frontpage: { label: 'â­ Front Page', color: 'hsl(var(--deal-score-positive))' },
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
  const [showVotePopup, setShowVotePopup] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [shareNotice, setShareNotice] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);


  useEffect(() => {
    if (!deal || userVote !== 0) return;
    const key = `vote-popup-seen:${deal.id}`;
    try { if (localStorage.getItem(key)) return; } catch { /* ignore */ }
    const t = setTimeout(() => setShowVotePopup(true), 1500);
    return () => clearTimeout(t);
  }, [deal?.id, userVote]);

  const closeVotePopup = () => {
    setShowVotePopup(false);
    if (deal) {
      try { localStorage.setItem(`vote-popup-seen:${deal.id}`, '1'); } catch { /* ignore */ }
    }
  };
  useEffect(() => {
    if (!id) return;
    fetch(`/api/deals/${id}`)
      .then(r => r.json())
      .then(data => {
        setDeal(data.deal);
        if (data.deal?.id && user) {
          fetch('/api/saved-deals').then(r => r.ok ? r.json() : null)
            .then(savedData => setIsSaved(Boolean(savedData?.savedDealIds?.includes(Number(data.deal.id)))))
            .catch(() => setIsSaved(false));
        } else {
          try { setIsSaved((JSON.parse(localStorage.getItem('saved-deals') || '[]') as number[]).includes(Number(data.deal?.id))); } catch { /* ignore */ }
        }
        setComments(data.comments || []);
        setUserVote(data.userVote || 0);
                setMedia(data.media || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, user]);

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

  const toggleSavedDeal = async () => {
    if (!deal) return;
    if (user) {
      try {
        const res = await fetch('/api/saved-deals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealId: deal.id, action: isSaved ? 'remove' : 'save' }),
        });
        const data = await res.json();
        if (!res.ok) { setShareNotice(data.error || 'Could not update saved deal.'); return; }
        setIsSaved(Boolean(data.saved));
        setShareNotice(data.saved ? 'Deal saved to your account.' : 'Removed from your saved deals.');
        window.setTimeout(() => setShareNotice(''), 2500);
      } catch { setShareNotice('Could not save this deal. Please try again.'); }
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem('saved-deals') || '[]') as number[];
      const next = isSaved ? saved.filter((dealId) => dealId !== deal.id) : [...new Set([...saved, deal.id])];
      localStorage.setItem('saved-deals', JSON.stringify(next));
      setIsSaved(!isSaved);
      setShareNotice(isSaved ? 'Removed from your saved deals.' : 'Deal saved in this browser. Sign in to sync saves across devices.');
      window.setTimeout(() => setShareNotice(''), 3000);
    } catch { setShareNotice('Could not save this deal in this browser.'); }
  };
  const shareDeal = async () => {
    if (!deal) return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: deal.title, text: `Check out this deal on ChennaiDeals.in: ${deal.title}`, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopiedLink(true);
        setShareNotice('Deal link copied. You can paste it into WhatsApp, email, or social media.');
        window.setTimeout(() => { setCopiedLink(false); setShareNotice(''); }, 3000);
      } else {
        window.prompt('Copy this deal link:', url);
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') setShareNotice('Sharing was not available. You can copy the page URL from your browser.');
    }
  };
  const rawDescription = deal?.description || '';
  const longDetailsMarker = '\n\n[DEAL_LONG_DETAILS]\n';
  const longDetailsIndex = rawDescription.indexOf(longDetailsMarker);
  const shortDescription = longDetailsIndex >= 0 ? rawDescription.slice(0, longDetailsIndex).trim() : rawDescription;
  const longDetails = longDetailsIndex >= 0 ? rawDescription.slice(longDetailsIndex + longDetailsMarker.length).trim() : '';
  const isAdmin = Boolean((user as { isAdmin?: boolean } | null)?.isAdmin);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [commentQuery, setCommentQuery] = useState('');
    const location = useLocation();
  const uploadNotice = (location.state as { uploadError?: string } | null)?.uploadError;
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [primaryImageIndex, setPrimaryImageIndex] = useState(0);
  const [newVideo, setNewVideo] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mediaError, setMediaError] = useState('');

  const handleUploadMedia = async () => {
    if (uploading || (newImages.length === 0 && !newVideo)) return;
    setUploading(true);
    setMediaError('');
    const up = await uploadDealMedia(id!, newImages, newVideo, primaryImageIndex);
    if (up.ok) {
      if (up.media) setMedia(up.media);
      setNewImages([]);
      setNewVideo(null);
    } else {
      setMediaError(up.error);
    }
    setUploading(false);
  };

  const setPrimaryImage = async (url: string) => {
    if (!deal || !canAddMedia || url === deal.imageUrl) return;
    setMediaError('');
    setUploading(true);
    const up = await uploadDealMedia(id!, [], null, 0, url);
    if (up.ok) setDeal({ ...deal, imageUrl: url });
    else setMediaError(up.error);
    setUploading(false);
  };

  const saveNote = async () => {
    if (savingNote) return;
    setSavingNote(true);
    setNoteError('');
    try {
      const res = await fetch(`/api/deals/${id}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteDraft }),
      });
      const data = await res.json();
      if (!res.ok) { setNoteError(data.error || 'Could not save note'); return; }
      setDeal(prev => (prev ? { ...prev, editorNote: data.deal.editorNote } : prev));
      setEditingNote(false);
    } catch {
      setNoteError('Network error. Please try again.');
    } finally {
      setSavingNote(false);
    }
  };
  const fmt = (v: string | null) => v ? `â‚¹${parseFloat(v).toLocaleString('en-IN')}` : null;
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
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">â† Back to deals</Link>
    </main>
  );

  const badge = statusBadge[deal.status] ?? statusBadge.new;
    const myId = (user as { id?: string } | null)?.id;
  const canAddMedia = Boolean(myId) && (isAdmin || deal.submittedBy === myId);
  const hasDealImages = Boolean(deal.imageUrl || media.some((item) => item.type === 'image'));

    const q = commentQuery.trim().toLowerCase();
  const filteredComments = q
    ? comments.filter(c => c.body.toLowerCase().includes(q) || (c.userName ?? '').toLowerCase().includes(q))
    : comments;

  return (
    <>
      <Helmet>
        <title>{deal.title} â€” ChennaiDeals.in</title>
        <meta name="description" content={deal.description?.slice(0, 160) ?? deal_detail.meta.description} />
      </Helmet>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-5 transition-colors">
          <ArrowLeft size={14} /> <span>{deal_detail.labels.backLink}</span>
        </Link>

        {/* Deal card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-card rounded-3xl border border-border p-4 sm:p-6 mb-6 shadow-sm"
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

          <div className={hasDealImages ? "grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-5 lg:gap-8 items-start" : "block"}>
            {hasDealImages && (
              <div className="min-w-0 rounded-2xl border border-border bg-card p-2 sm:p-3 lg:sticky lg:top-6">
                {media.some((item) => item.type === 'image') ? (
                  <MediaGallery media={media} primaryUrl={deal.imageUrl} onSetPrimary={canAddMedia ? setPrimaryImage : undefined} showVideo={false} />
                ) : (
                  <img src={deal.imageUrl || ''} alt={deal.title} className="max-h-[32rem] w-full rounded-xl object-contain" />
                )}
              </div>
            )}

            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold mb-4 leading-tight" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>
            {deal.title}
          </h1>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button type="button" onClick={toggleSavedDeal}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-muted transition-colors"
              aria-pressed={isSaved}>
              <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
              {isSaved ? 'Saved' : 'Save deal'}
            </button>
            <button type="button" onClick={shareDeal}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-muted transition-colors">
              {copiedLink ? <Check size={16} /> : <Share2 size={16} />}
              Share deal
            </button>
            {shareNotice && <span role="status" className="text-xs text-muted-foreground">{shareNotice}</span>}
          </div>

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
              {shortDescription && (
                <div className="mt-5 pt-5 border-t border-border text-sm leading-7 whitespace-pre-wrap" style={{ color: 'hsl(var(--foreground))' }}>
                  {shortDescription}
                </div>
              )}
            </div>
          </div>
        </motion.div>

                {/* Photos & video management */}
        {(media.some((item) => item.type === 'video') || canAddMedia || uploadNotice) && (
          <div className="bg-card rounded-xl border border-border p-4 mb-6">
            <h3 className="text-xs font-bold uppercase tracking-widest mb-3 text-primary">Photos &amp; Video Management</h3>

            {uploadNotice && (
              <p className="text-sm mb-3" style={{ color: 'hsl(var(--destructive))' }}>
                Your deal was posted, but the upload failed: {uploadNotice}. You can try again below.
              </p>
            )}

            {media.some((item) => item.type === 'video') && <MediaGallery media={media.filter((item) => item.type === 'video')} primaryUrl={deal.imageUrl} />}

            {canAddMedia && (
              <div className={media.length > 0 ? 'mt-4 pt-4 border-t border-border' : ''}>
                <MediaPicker
                  images={newImages} video={newVideo}
                  onImages={(next) => { setNewImages(next); setPrimaryImageIndex((current) => Math.min(current, Math.max(0, next.length - 1))); }} onVideo={setNewVideo}
                  primaryIndex={primaryImageIndex} onPrimaryIndex={setPrimaryImageIndex}
                  canVideo={isAdmin}
                  existingImages={media.filter((m) => m.type === 'image').length}
                  hasExistingVideo={media.some((m) => m.type === 'video')}
                  disabled={uploading} onError={setMediaError}
                />
                {mediaError && (
                  <p className="text-xs mt-2" style={{ color: 'hsl(var(--destructive))' }}>{mediaError}</p>
                )}
                {(newImages.length > 0 || newVideo) && (
                  <button type="button" onClick={handleUploadMedia} disabled={uploading}
                    className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Editor's Notes */}
        {(deal.editorNote || isAdmin) && (
          <div className="bg-card rounded-xl border border-border p-4 mb-6" style={{ borderLeft: '4px solid hsl(var(--primary))' }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
                <StickyNote size={14} /> Editor&apos;s Notes
              </h3>
              {isAdmin && !editingNote && (
                <button
                  onClick={() => { setNoteDraft(deal.editorNote ?? ''); setNoteError(''); setEditingNote(true); }}
                  className="text-xs font-semibold text-primary hover:underline">
                  {deal.editorNote ? 'Edit' : 'Add note'}
                </button>
              )}
            </div>

            {editingNote ? (
              <div>
                <textarea
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  placeholder="Add your verdict, tips, or things to check before buying..."
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ color: 'hsl(var(--foreground))' }}
                />
                {noteError && <p className="text-xs mt-1" style={{ color: 'hsl(var(--destructive))' }}>{noteError}</p>}
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => setEditingNote(false)} className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
                  <button onClick={saveNote} disabled={savingNote}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                    {savingNote ? 'Saving...' : 'Save note'}
                  </button>
                </div>
              </div>
            ) : deal.editorNote ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'hsl(var(--foreground))' }}>{deal.editorNote}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No note yet.</p>
            )}
          </div>
        )}

        {longDetails && (
          <section className="bg-card rounded-2xl border border-border p-5 mb-6">
            <h2 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-heading)' }}>
              <StickyNote size={18} className="text-primary" /> Deal details
            </h2>
            <div className="text-sm leading-7 whitespace-pre-wrap break-words" style={{ color: 'hsl(var(--foreground))' }}>{longDetails}</div>
          </section>
        )}

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
                      {s === 'new' ? 'Score â‰¥ 50 â†’ Popular' : s === 'popular' ? 'Score â‰¥ 150 â†’ Front Page' : 'ðŸŽ‰ Made it!'}
                    </div>
                  </div>
                  {i < 2 && <div className="text-muted-foreground text-lg shrink-0">â†’</div>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Current score: <span className="font-bold text-primary">{deal.score}</span>
            {deal.status === 'new' && ` Â· needs ${Math.max(0, 50 - deal.score)} more to reach Popular`}
            {deal.status === 'popular' && ` Â· needs ${Math.max(0, 150 - deal.score)} more to reach Front Page`}
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

          {comments.length > 0 && (
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={commentQuery}
                onChange={e => setCommentQuery(e.target.value)}
                placeholder="Search comments..."
                className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                style={{ color: 'hsl(var(--foreground))' }}
              />
            </div>
          )}

          {/* Comment list */}
          <div className="space-y-4">
            {comments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No comments yet. Be the first!</p>
            )}
                        {comments.length > 0 && filteredComments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No comments match your search.</p>
            )}
                     {filteredComments.map(c => (
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
              <VotePopup
          open={showVotePopup}
          onClose={closeVotePopup}
          upvotes={deal.upvotes}
          downvotes={deal.downvotes}
          userVote={userVote}
          voting={voting}
          onVote={async (v) => { await handleVote(v); closeVotePopup(); }}
        />
    </>
  );
}
