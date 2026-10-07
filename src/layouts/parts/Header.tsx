import { useState } from 'react';
import { Link } from 'react-router';
import { Search, Plus, Menu, X, MapPin, User, LogOut, ChevronDown } from 'lucide-react';
import { useSession, signOut } from '@/lib/auth/auth-client';

const categories = [
  'Electronics',
  'Fashion',
  'Groceries',
  'Restaurants',
  'Travel',
  'Home & Kitchen',
  'Mobile Phones',
];

const areas = [
  'All Chennai',
  'T. Nagar',
  'Anna Nagar',
  'Velachery',
  'Adyar',
  'Porur',
  'Tambaram',
  'OMR',
  'Nungambakkam',
  'Mylapore',
  'Perambur',
  'Chromepet',
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState('All Chennai');
  const [areaOpen, setAreaOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useSession();

  return (
    <header className="sticky top-0 z-50 shadow-md bg-primary">
      {/* Kolam-inspired top accent line */}
      <div className="h-1 w-full bg-secondary" />

      {/* Main nav */}
      <div className="px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          {/* Logo */}
          <Link to="/" className="shrink-0 flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ background: 'hsl(var(--header-overlay-dark) / 0.15)' }}
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="16" height="16" rx="3" fill="white" fillOpacity="0.9" />
                <path d="M18 8L26 16L18 24L10 16L18 8Z" fill="white" fillOpacity="0.7" />
                <circle cx="7" cy="7" r="2" fill="hsl(var(--primary))" />
                <circle cx="3" cy="3" r="1" fill="white" fillOpacity="0.5" />
                <circle cx="11" cy="3" r="1" fill="white" fillOpacity="0.5" />
                <circle cx="3" cy="11" r="1" fill="white" fillOpacity="0.5" />
                <circle cx="11" cy="11" r="1" fill="white" fillOpacity="0.5" />
              </svg>
              <span
                className="text-xl font-bold tracking-tight text-white"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Chennai<span className="text-secondary-foreground" style={{ color: 'hsl(var(--secondary-foreground))' }}>
                  <span style={{ color: 'hsl(var(--footer-bg))' }}>Deals</span>
                </span>
              </span>
              <span className="text-xs font-semibold px-1 rounded bg-secondary text-secondary-foreground">
                .in
              </span>
            </div>
          </Link>

          {/* Search bar */}
          <div className="flex-1 max-w-2xl relative">
            <div
              className="flex items-center bg-card rounded-lg overflow-hidden shadow-sm border-2"
              style={{ borderColor: 'hsl(var(--header-overlay-dark) / 0.1)' }}
            >
              <Search className="ml-3 shrink-0 text-muted-foreground" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search deals, products, stores in Chennai..."
                className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent text-foreground"
              />
              <button className="px-4 py-2.5 text-sm font-semibold text-secondary-foreground bg-secondary shrink-0">
                Search
              </button>
            </div>
          </div>

          {/* Submit Deal CTA */}
          <Link
            to="/deals/submit"
            className="hidden md:flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold shrink-0 transition-transform hover:scale-105 bg-secondary text-secondary-foreground"
          >
            <Plus size={16} />
            Submit a Deal
          </Link>

          {/* Auth */}
          {user ? (
            <div className="hidden md:flex items-center gap-2">
              <span className="text-xs text-white opacity-80 max-w-24 truncate">{user.name || user.email}</span>
              <button onClick={() => signOut()} className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-white opacity-80 hover:opacity-100 transition-opacity">
                <LogOut size={14} /> Sign out
              </button>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Link to="/login" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white opacity-90 hover:opacity-100 transition-opacity">
                <User size={14} /> Sign in
              </Link>
            </div>
          )}

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-primary-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Secondary nav — categories + area filter */}
      <div
        className="border-t hidden md:block"
        style={{
          borderColor: 'hsl(var(--header-overlay-dark) / 0.12)',
          background: 'hsl(var(--header-overlay-dark) / 0.1)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {/* Area dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setAreaOpen(!areaOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border-2 border-primary-foreground text-primary-foreground transition-colors hover:bg-card hover:text-primary"
            >
              <MapPin size={13} />
              {selectedArea}
              <ChevronDown size={13} />
            </button>
            {areaOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 rounded-xl shadow-xl z-50 py-1 border bg-card border-border">
                {areas.map(area => (
                  <button
                    key={area}
                    onClick={() => { setSelectedArea(area); setAreaOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors"
                    style={{
                      color: selectedArea === area ? 'hsl(var(--secondary))' : 'hsl(var(--foreground))',
                      fontWeight: selectedArea === area ? 600 : 400,
                    }}
                  >
                    {area}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-primary-foreground opacity-30 shrink-0" />

          {/* Category pills */}
          {categories.map(cat => (
            <button
              key={cat}
              className="shrink-0 px-3 py-1.5 rounded-full text-sm font-medium text-primary-foreground border border-primary-foreground border-opacity-40 transition-all hover:bg-card hover:text-primary whitespace-nowrap"
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-card border-t border-border">
          <div className="p-4 space-y-3">
            <Link
              to="/submit-deal"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-bold bg-secondary text-secondary-foreground"
            >
              <Plus size={16} />
              Submit a Deal
            </Link>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border border-primary text-primary"
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
