import { motion, AnimatePresence } from 'motion/react';
import { ThumbsUp, ThumbsDown, X } from 'lucide-react';

interface VotePopupProps {
  open: boolean;
  onClose: () => void;
  upvotes: number;
  downvotes: number;
  userVote: number;
  voting: boolean;
  onVote: (value: 1 | -1) => void;
}

export default function VotePopup({
  open, onClose, upvotes, downvotes, userVote, voting, onVote,
}: VotePopupProps) {
  const total = upvotes + downvotes;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="vote-popup-title"
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card p-6 text-center shadow-2xl"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:bg-muted"
            >
              <X size={18} />
            </button>

            <img src="/logo.jpg" alt="ChennaiDeals.in" className="mx-auto mb-4 h-11 w-auto rounded-lg" />

            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ThumbsUp size={28} />
            </div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Help Chennai shop smarter
            </p>
            <h2
              id="vote-popup-title"
              className="mb-2 text-2xl font-bold"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Worth the deal?
            </h2>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
              Your quick vote helps the community spot great offers and avoid disappointing ones.
            </p>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => onVote(1)}
                disabled={voting}
                className="flex-1 flex flex-col items-center gap-1 rounded-xl border-2 px-4 py-3 font-semibold transition-colors disabled:opacity-60"
                style={{
                  borderColor: 'hsl(var(--deal-score-positive))',
                  background: userVote === 1 ? 'hsl(var(--deal-score-positive) / 0.15)' : 'transparent',
                  color: 'hsl(var(--deal-score-positive))',
                }}
              >
                <ThumbsUp size={24} />
                <span>Like</span>
                <span className="text-lg font-bold">{upvotes}</span>
              </button>

              <button
                onClick={() => onVote(-1)}
                disabled={voting}
                className="flex-1 flex flex-col items-center gap-1 rounded-xl border-2 px-4 py-3 font-semibold transition-colors disabled:opacity-60"
                style={{
                  borderColor: 'hsl(var(--destructive))',
                  background: userVote === -1 ? 'hsl(var(--destructive) / 0.15)' : 'transparent',
                  color: 'hsl(var(--destructive))',
                }}
              >
                <ThumbsDown size={24} />
                <span>Dislike</span>
                <span className="text-lg font-bold">{downvotes}</span>
              </button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              {total} {total === 1 ? 'vote' : 'votes'} so far
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}