import { Link } from 'react-router';
import { MapPin, Mail } from 'lucide-react';

const areaLinks = [
  'T. Nagar', 'Anna Nagar', 'Velachery', 'Adyar',
  'OMR', 'Porur', 'Tambaram', 'Nungambakkam',
];

const quickLinks = [
  { label: 'About Us', to: '/about' },
  { label: 'Submit a Deal', to: '/submit-deal' },
  { label: 'Advertise', to: '/advertise' },
  { label: 'Contact', to: '/contact' },
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Terms of Use', to: '/terms' },
];

const categories = [
  'Electronics', 'Fashion', 'Groceries',
  'Restaurants', 'Travel', 'Home & Kitchen',
];

export default function Footer() {
  return (
    <footer style={{ background: 'hsl(var(--footer-bg))', color: 'hsl(var(--footer-text))' }}>
      {/* Kolam accent line */}
      <div className="h-1 bg-primary" />

      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Brand column */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="16" height="16" rx="3" fill="hsl(var(--primary))" fillOpacity="0.9" />
                <path d="M18 8L26 16L18 24L10 16L18 8Z" fill="hsl(var(--primary))" fillOpacity="0.6" />
                <circle cx="7" cy="7" r="2" fill="white" />
              </svg>
              <span className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
                Chennai<span className="text-primary">Deals</span>
                <span className="text-sm" style={{ color: 'hsl(var(--footer-subtle))' }}>.in</span>
              </span>
            </div>
            <p className="text-sm leading-relaxed mb-4" style={{ color: 'hsl(var(--footer-text))' }}>
              Chennai's #1 deals community. Find the hottest deals from Flipkart, Amazon, and local Chennai stores — all in one place.
            </p>
            <div className="flex items-center gap-1.5 text-sm mb-2" style={{ color: 'hsl(var(--footer-text))' }}>
              <MapPin size={14} className="text-primary" />
              <span>Serving all of Chennai</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm" style={{ color: 'hsl(var(--footer-text))' }}>
              <Mail size={14} className="text-primary" />
              <span>deals@chennaideals.in</span>
            </div>
            {/* Social icons */}
            <div className="flex gap-3 mt-5">
              {/* Facebook */}
              <a
                href="#"
                className="p-2 rounded-lg transition-colors hover:bg-primary"
                style={{ background: 'hsl(var(--footer-surface))' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
              {/* Instagram */}
              <a
                href="#"
                className="p-2 rounded-lg transition-colors hover:bg-primary"
                style={{ background: 'hsl(var(--footer-surface))' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="2" y="2" width="20" height="20" rx="5" stroke="hsl(var(--primary))" strokeWidth="2"/>
                  <circle cx="12" cy="12" r="4" stroke="hsl(var(--primary))" strokeWidth="2"/>
                  <circle cx="17.5" cy="6.5" r="1" fill="hsl(var(--primary))"/>
                </svg>
              </a>
              {/* X / Twitter */}
              <a
                href="#"
                className="p-2 rounded-lg transition-colors hover:bg-primary"
                style={{ background: 'hsl(var(--footer-surface))' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" fill="hsl(var(--primary))"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-widest mb-4 text-primary">Quick Links</h4>
            <ul className="space-y-2">
              {quickLinks.map(link => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-sm transition-colors hover:text-primary"
                    style={{ color: 'hsl(var(--footer-text))' }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-widest mb-4 text-primary">Categories</h4>
            <ul className="space-y-2">
              {categories.map(cat => (
                <li key={cat}>
                  <a
                    href="#"
                    className="text-sm transition-colors hover:text-primary"
                    style={{ color: 'hsl(var(--footer-text))' }}
                  >
                    {cat}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Chennai Areas */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-widest mb-4 text-primary">Deals by Area</h4>
            <div className="flex flex-wrap gap-2">
              {areaLinks.map(area => (
                <a
                  key={area}
                  href="#"
                  className="px-2.5 py-1 rounded-full text-xs transition-colors hover:bg-primary hover:text-primary-foreground"
                  style={{ background: 'hsl(var(--footer-surface))', color: 'hsl(var(--footer-text))' }}
                >
                  {area}
                </a>
              ))}
            </div>
            <div className="mt-6 p-4 rounded-xl" style={{ background: 'hsl(var(--footer-surface))' }}>
              <p className="text-xs font-semibold mb-2 text-primary">🔥 Know a great deal?</p>
              <p className="text-xs mb-3" style={{ color: 'hsl(var(--footer-text))' }}>
                Share it with the Chennai community and help everyone save!
              </p>
              <Link
                to="/submit-deal"
                className="block text-center text-xs font-bold py-2 rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90"
              >
                Submit a Deal
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs"
          style={{ borderTop: '1px solid hsl(var(--footer-surface))', color: 'hsl(var(--footer-subtle))' }}
        >
          <p>© 2026 ChennaiDeals.in — Made with ❤️ in Chennai</p>
          <p>Deals sourced from Flipkart, Amazon, Meesho &amp; local Chennai retailers. Prices subject to change.</p>
        </div>
      </div>
    </footer>
  );
}
