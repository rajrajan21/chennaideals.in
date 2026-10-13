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
            className="relative w-full max-w-sm rounded-2xl bg-card border border-border p-6 text-center shadow-xl"
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

            <img src="/logo.jpg" alt="ChennaiDeals.in" className="h-12 w-auto mx-auto mb-4 rounded-lg" />

            <h2
              id="vote-popup-title"
              className="text-xl font-bold mb-1"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Is this a good deal?
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              Cast your vote to help other shoppers.
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