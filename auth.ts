/**
 * BetterAuth Server Configuration
 *
 * Supports both Email/Password and OAuth authentication.
 * Enable/disable methods by uncommenting the relevant sections.
 *
 * Secrets (via getSecret from #airo/secrets):
 * - BETTER_AUTH_SECRET: Session encryption key (auto-generated during install)
 * - OAuth credentials (GOOGLE_CLIENT_ID, etc.) for social login
 *
 * CORS/Trusted Origins:
 * - Only trusts origins matching the server's hostname
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { db } from '@/server/db/client';
import { user, session, account, verification } from '@/server/db/schema';
import { getSecret } from '#airo/secrets';
import { sendResendEmail } from '@/lib/email/resend';

// Lazy singleton - betterAuth() must NOT run at module init time.
//
// The BETTER_AUTH_SECRET is loaded from the alloc config at runtime, so the
// auth instance must be constructed after the secrets are available (i.e. on
// the first HTTP request, not at import time).
//
// Pattern mirrors how db/client.ts defers the actual MySQL connection - the
// pool object is safe to create at init, but anything that reads schema state
// or secrets must be deferred to request time.
let _auth: ReturnType<typeof betterAuth> | null = null;

// Origin used for links inside emails: only ever a host we already trust.
function trustedSiteOrigin(request?: Request): string {
  const fallback = 'https://chennaideals.in';
  try {
    const origin = request?.headers.get('origin');
    if (!origin) return fallback;
    const host = new URL(origin).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === 'chennaideals.in' || host === 'www.chennaideals.in') {
      return origin;
    }
  } catch {
    /* fall through */
  }
  return fallback;
}

// Better Auth deliberately answers sign-up with the SAME success response whether or not the
// email already has an account (so strangers cannot probe which emails are registered).
// To still help a real owner who tries to sign up again, we email the address itself.
const emailAndPasswordConfig = {
  enabled: true,
  requireEmailVerification: true,
  onExistingUserSignUp: async (
    { user: existing }: { user: { email: string; name?: string | null } },
    request?: Request,
  ) => {
    try {
      const base = trustedSiteOrigin(request);
      const loginUrl = `${base}/login`;
      await sendResendEmail({
        to: existing.email,
        subject: 'You already have a ChennaiDeals.in account',
        text: `Hi${existing.name ? ' ' + existing.name : ''},\n\nSomeone (hopefully you) tried to create a ChennaiDeals.in account with this email address, but an account already exists.\n\nSign in here: ${loginUrl}\n\nIf you have not verified your email yet, signing in will send you a fresh verification link.\n\nIf this was not you, you can ignore this message - your account is unchanged.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:560px;margin:auto"><h2>You already have an account</h2><p>Someone (hopefully you) tried to create a ChennaiDeals.in account with this email address, but an account already exists.</p><p><a href="${loginUrl}" style="display:inline-block;padding:12px 20px;background:#ea580c;color:#fff;text-decoration:none;border-radius:8px">Sign in</a></p><p>If you have not verified your email yet, signing in will send you a fresh verification link.</p><p style="color:#666;font-size:13px">If this was not you, you can ignore this message - your account is unchanged.</p></div>`,
      });
    } catch (err) {
      console.error('Existing-account notice email could not be sent', { message: err instanceof Error ? err.message : String(err) });
    }
  },
};


export function getAuth() {
  if (_auth) return _auth;

  const authSecret = getSecret('BETTER_AUTH_SECRET');
  if (!authSecret || typeof authSecret !== 'string') {
    throw new Error('BETTER_AUTH_SECRET is not set or invalid - run requestSecrets() first');
  }

  if (!db) {
    throw new Error('Database not configured. Install the database skill first, then configure auth.');
  }

  const auth = betterAuth({
    account: {
  accountLinking: {
    enabled: true,
    trustedProviders: ["facebook", "google"],
  },
},
    // Schema passed explicitly - avoids BetterAuth's runtime schema inference.
    database: drizzleAdapter(db, {
      provider: 'mysql',
      schema: { user, session, account, verification },
    }),

    secret: authSecret,

    // Protect admin status field from user input
    user: {
      additionalFields: {
        isAdmin: {
          type: 'boolean',
          defaultValue: false,
          input: false,  // Prevent clients from writing this field
          returned: true,
        },
      },
    },

    // CORS: Trusts .airoapp.ai subdomains and localhost by default.
    // If your app has a custom domain, add it here or set BETTER_AUTH_TRUSTED_ORIGINS.
    trustedOrigins: (request?: Request) => {
      if (!request) return [];

      const origin = request.headers.get('origin');
      if (!origin) return [];

      try {
        const originUrl = new URL(origin);
        const hostname = originUrl.hostname;

        // Trust all airoapp.ai subdomains
        if (hostname.endsWith('.airoapp.ai') || hostname.endsWith('.test-airoapp.ai')) {
          return [origin];
        }

        // Trust localhost for development and the production custom domain.
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          return [origin];
        }
        if (hostname === 'chennaideals.in' || hostname === 'www.chennaideals.in') {
          return [origin];
        }

        return [];
      } catch {
        return [];
      }
    },

    // In preview mode the site runs in an iframe embedded by the builder on a different
    // origin, so cookies need SameSite=None + Secure + Partitioned (CHIPS) for cross-site
    // access. In publish mode (standalone) we use the safer SameSite=Lax default.
    ...(process.env.AIRO_PREVIEW === 'true' && {
      advanced: {
        defaultCookieAttributes: {
          sameSite: 'none' as const,
          secure: true,
          partitioned: true,
        },
      },
    }),

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        // Never let a mail-provider problem crash the server or leak details to the browser.
        // The reason is printed in the server terminal (look for "Resend email request failed").
        try {
          await sendResendEmail({
            to: user.email,
            subject: "Verify your ChennaiDeals.in email",
            text: `Welcome to ChennaiDeals.in!\n\nVerify your email address using this link (valid for 1 hour):\n${url}\n\nIf you did not create this account, you can ignore this email.`,
            html: `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:560px;margin:auto"><h2>Welcome to ChennaiDeals.in</h2><p>Please verify your email address to finish setting up your account.</p><p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#ea580c;color:#fff;text-decoration:none;border-radius:8px">Verify email address</a></p><p>This link expires in 1 hour. If you did not create this account, you can ignore this email.</p></div>`,
          });
        } catch (err) {
          console.error('Verification email could not be sent', { message: err instanceof Error ? err.message : String(err) });
        }
      },
    },

    emailAndPassword: emailAndPasswordConfig,

    // Enable providers only when their credentials are configured.
    socialProviders: {
      ...(getSecret('GOOGLE_CLIENT_ID') && getSecret('GOOGLE_CLIENT_SECRET') ? {
        google: {
          clientId: getSecret('GOOGLE_CLIENT_ID') as string,
          clientSecret: getSecret('GOOGLE_CLIENT_SECRET') as string,
        },
      } : {}),
      ...(getSecret('FACEBOOK_CLIENT_ID') && getSecret('FACEBOOK_CLIENT_SECRET') ? {
        facebook: {
          clientId: getSecret('FACEBOOK_CLIENT_ID') as string,
          clientSecret: getSecret('FACEBOOK_CLIENT_SECRET') as string,
        },
      } : {}),
    },
  });

  _auth = auth as unknown as ReturnType<typeof betterAuth>;
  return auth;
}

export type Session = ReturnType<typeof getAuth>['$Infer']['Session'];
export type User = ReturnType<typeof getAuth>['$Infer']['Session']['user'];

