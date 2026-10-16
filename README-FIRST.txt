ChennaiDeals update pack 3 - "Get details from link" + reliable pictures
=======================================================================
Extract EVERYTHING into your project folder (the one with package.json):
    C:\Users\itsme\Documents\chennaideals.in-git
Say yes to replace files. Keep the "payload" folder.

4-Apply-LinkAssist.bat   MAIN STEP. Double-click it. It checks your files, backs them up, runs
                         type-check + build, and undoes itself if anything fails.
                         Then restart the dev server (Ctrl+C, then npm.cmd run dev).

What changes on Submit Deal
  - The Deal link is now at the TOP with a "Get details from link" button.
  - One click fills title, price, MRP, shop, category, description and "why it may be a deal",
    and saves the pictures. You can edit everything before posting, or press Undo.
  - Pictures are downloaded ONCE on the server, in full size, while you choose, and shown from
    our server (sharp, no more flaky thumbnails). Tick/untick, "Make main", then submit - the
    saved copies are used, so nothing is downloaded again and none go missing.
  - Failed downloads are retried automatically; shops that block hotlinking are handled.

Optional FREE AI (off by default - nothing is spent, nothing breaks without it)
  Set-Gemini-Key.bat     Paste a free Gemini key (typing hidden). Create it at
                         https://aistudio.google.com/apikey in a project WITHOUT billing.
                         The site then writes nicer descriptions. Without a key, drafts are
                         built from the page's own data (title, price, MRP, brand, description).
  Check-AI.bat           Tests the key. Prints only OK / an HTTP status, never the key.
  Note: Google may use free-tier requests to improve its products. Only public product-page
  text is sent - never user data.

Also in this pack (fixes from before)
  1-Commit-Auth-Fix.bat  Fixed: the commit message no longer breaks. Run it again if it said
                         "Commit failed". It commits only the sign-up/email fix, locally.
  Sync-To-GitHub.bat     Fixed the same way. Use any time to upload all your code safely.

If a script stops it writes a *-report.txt file in the project folder - send it to Claude.
