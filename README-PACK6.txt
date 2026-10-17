ChennaiDeals Update Pack 6 - automatic deal review
1. Unzip into a NEW EMPTY folder.
2. Open a command prompt in your PROJECT folder and run: "full path\Apply-Pack6.bat"
3. Restart npm.cmd run dev.

What the review does (everything is free):
- Link: must exist, not be dead, not a look-alike of Amazon/Flipkart, not a bare IP, https preferred,
  domain age looked up (very new shops are flagged), optional Google Safe Browsing (SAFE_BROWSING_API_KEY).
- Wording: adult, escort, betting, "earn money", loan and illegal-item terms are rejected.
- Scam signs on the page: advance payment, UPI/WhatsApp-only orders, crypto, no contact/refund pages, price that
  differs from the page, absurd discounts.
- Pictures: size, shape, blank/blurry check and a skin-tone check with the "sharp" package; if GEMINI_API_KEY is set,
  Gemini free tier looks at the pictures too (they are then sent to Google).
- Rejected -> never posted, admin emailed (ADMIN_ALERT_EMAIL, default Chennaideals.in@gmail.com).
- Suspicious but possible -> posted with an automatic caution in the Editor's Note, admin emailed.
- Admins skip the review.

Email note: Resend (free) only lets you email the address your Resend account was created with until you verify
your own domain. If Chennaideals.in@gmail.com is not that address, alerts are logged in the server window instead
and a "domain verification" in Resend (chennaideals.in) is needed.
